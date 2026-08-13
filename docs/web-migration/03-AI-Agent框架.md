# 03 — AI Agent 框架（服务端移植）

> 基于真实代码：`electron/main/agent/loop.ts`、`agent/index.ts`、`agent/guardrails.ts`、`services/embedding.ts`。
> 这是整个系统最核心、也最值得"原样平移"的部分——Agent Loop / Guardrails / 工具注册表都是纯 TS，**不依赖 Electron**（仅 `net.fetch`→`fetch`、`electron-store`→配置服务、`app.getPath` 需替换）。

---

## 1. 真实 Agent Loop 架构（必须 1:1 保真）

`runAgentLoop(messages, ctx, callbacks)` 是核心循环，**最多 10 轮迭代**（`MAX_ITERATIONS=10`）。每轮：

```
循环（最多10轮）:
  1. 构造请求体（model/messages/tools/tool_choice/thinking/temperature/max_tokens）
  2. ① 流式请求 /chat/completions (stream:true)
  3. parseStream 解析 SSE：累积 text / reasoning / tool_calls 分片 / usage
  4. ② 若流中断且无 tool_calls → 降级非流式 (stream:false, tool_choice:'none')，结束循环
  5. 无 tool_calls → 最终答案，onDone，结束
  6. 有 tool_calls：
     - push assistant 消息(含 tool_calls)
     - 逐个工具：guardrails.beforeCall → (危险操作)确认 → 执行 → 截断 → guardrails.afterCall → push tool 结果
  7. 回到步骤 1（带工具结果再问模型）
超过10轮 → onError
```

### 1.1 必须保真的关键行为（容易在重写时丢失）

| 行为 | 代码事实 | 移植注意 |
|------|---------|---------|
| **动作意图强制工具** | `hasActionIntent()` 检测「帮我/请帮/搜索/创建/保存/生成/删除…」等关键词，命中则**首轮** `tool_choice:'required'` | 关键词清单需原样搬（注释里明确移除了易误判的「写/帮你/整理」） |
| **流断降级** | 流中断(`!streamComplete`)且无工具调用 → 非流式重试，且 `tool_choice:'none'` 防死循环 | 网络不稳健性的关键，必须保留 |
| **thinking 模式** | `thinkingEnabled` 时加 `thinking:{type:'enabled'}, reasoning_effort`，**且不能传 temperature** | reasoning_content 累积后包成 `<details class="thinking-block">` |
| **tool_calls 分片缓冲** | DeepSeek 把 arguments JSON 拆成碎片流式发，按 `index` 缓冲拼接 | parseStream 里的 `tcBufs` Map 逻辑必须原样保留 |
| **finish_reason=length 提示** | 命中 max_tokens 时追加提示 | 保留 |
| **结果截断** | `tool.maxResultChars` 超长截断 + `…[结果已截断]` | 保留 |
| **guardrail halt 后收尾** | halt 时注入系统提示并跑一次 `runFinalTurn`（无工具流式）给人类可读回复 | 保留 |
| **usage 累计** | promptTokens/completionTokens/cacheHit/cacheMiss 跨轮累加 | 用于计费/统计 |

### 1.2 配置来源改造

桌面版从 `ctx.store`（electron-store）取：`apiKey, baseUrl(默认 api.deepseek.com), model(默认 deepseek-v4-flash), maxTokens(8192), temperature(1.0), thinkingEnabled(false), reasoningEffort('high')`。

**Web 改造**：`ctx.store` 替换为**按 user_id 读取的配置服务**（从 `user_settings` 表读，敏感值解密）。接口签名建议保持 `ctx.store.get(key)` 形态，做一个适配类，使工具/loop 代码零改动：

```ts
class UserConfigStore {
  constructor(private userId: string, private cache: Record<string,any>) {}
  get(key: string) { return this.cache[key] }   // 预加载该用户全部 settings
}
```

---

## 2. ToolContext 改造（多用户核心）

桌面版：`ctx = { db: getDatabase(), store }`（全局单库 + 全局 store）。

**Web 改造**：

```ts
interface ToolContext {
  db: DbClient            // 多用户共享连接池，但所有查询带 userId
  store: UserConfigStore  // 该用户的配置
  userId: string          // 新增：贯穿所有工具的隔离键
}
```

> 所有工具 handler 内的 SQL 必须改为带 `WHERE user_id = ctx.userId`（详见 04 文档逐工具改造）。这是把单用户工具改成多租户安全的**唯一硬性要求**。

---

## 3. Guardrails（死循环防护，原样移植）

`ToolGuardrails` 是 Hermes `tool_guardrails.py` 的移植，**纯内存态、无外部依赖**，可直接搬。

阈值（`CFG`）：
- 相同工具+相同参数失败：2 次 warn，5 次 halt
- 单工具累计失败：3 次 warn，8 次 halt
- 只读工具无进展（连续幂等调用）：2 次 warn，5 次 halt

幂等工具集合 `IDEMPOTENT_TOOLS`：`search_notes, get_note, list_notes, get_datetime, get_stats, web_search`。

**Web 注意**：Guardrails 必须**每个 Agent 请求新建实例**（`new ToolGuardrails()`），绝不能跨请求/跨用户共享，否则会串扰。桌面版已是每次 `runAgentLoop` 内 new，保持即可。

---

## 4. 流式传输：IPC send → SSE

桌面版通过 5 个回调 `event.sender.send(...)` 推事件。Web 改为 SSE，回调内 `res.write('event: xx\ndata: ...\n\n')`：

```ts
// Express/Fastify 伪代码
app.post('/api/agent/run', auth, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',   // Nginx 关闭 SSE 缓冲，必须
  })
  const userId = req.userId
  const ac = new AbortController()
  agentRegistry.set(`${userId}:${req.body.conversationId}`, ac)

  const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)

  await runAgentLoop(messages, ctx, {
    onDelta:      t   => send('delta',       { text: t }),
    onToolCall:   (n,a,c) => send('tool-call',   { name:n, args:a, callId:c }),
    onToolResult: (n,r,e,c) => send('tool-result', { name:n, result:r, isError:e, callId:c }),
    onDone:       u   => { send('done', u); res.end() },
    onError:      m   => { send('error', { message:m }); res.end() },
    onConfirmNeeded: (name, args) => awaitConfirm(userId, req.body.conversationId, name, args, send),
    signal: ac.signal,
  })
})
```

> `net.fetch`（Electron）→ Node 18+ 全局 `fetch`，签名兼容，`signal` 透传不变。

### 4.1 SSE 心跳与断线

- 长工具执行期间建议每 15s 发 `: keep-alive\n\n` 注释行防代理超时。
- 客户端 `EventSource` 断线会自动重连——但 Agent 不可重放，需前端在 `done/error` 后主动 `close()`，并在重连时**不自动重发**请求。

---

## 5. 危险操作确认（双向交互的 SSE 适配）

桌面版 `onConfirmNeeded` 用 IPC `agent:confirm-request` + `agent:confirm-response:<reqId>`，**60 秒超时自动取消**。

需确认的工具：`CONFIRM_REQUIRED = {delete_note, delete_memory, delete_conversation}`。

**SSE 单向问题**：确认响应无法走同一 SSE 流回传。两种方案：

**方案 A（推荐，SSE + 独立确认端点）**：
1. 后端 Agent 阻塞在 `onConfirmNeeded`，向 SSE 发 `confirm-request {reqId,name,args}`。
2. 后端维护 `Map<reqId, resolve>`，60s 超时 resolve(false)。
3. 前端弹窗 → 用户点确认 → `POST /api/agent/confirm {reqId, confirmed}`。
4. 该端点查 Map 调对应 `resolve(confirmed)`，Agent 继续。

**方案 B（WebSocket）**：双向连接，确认走同一通道，逻辑最接近桌面版。

> 无论哪种，**60s 超时取消** 和 **连接断开视为取消** 的语义必须保留（桌面版监听 `event.sender 'destroyed'`）。

---

## 6. RAG 知识库注入（buildRagContext，1:1 复刻）

桌面版在 system 消息后拼接相关笔记。参数：`FLOOR=0.50, GAP_MIN=0.08, MAX=3`，每篇预览 800 字。

桌面版实现：全表扫 `embedding IS NOT NULL` → JS 余弦 → 阈值过滤 → 排序 → **断层检测**（相邻分差≥0.08 处截断）→ 取前 3。

**Web 改造（下推数据库，见 01 文档）**：
```sql
SELECT id, title, content, 1-(embedding<=>:qvec) AS score
FROM notes WHERE user_id=:uid AND embedding IS NOT NULL
  AND 1-(embedding<=>:qvec) >= 0.50
ORDER BY embedding<=>:qvec LIMIT 20;
```
取回后**在应用层保留断层检测 + MAX=3**（这段逻辑不下推，原样保留）。

RAG block 模板必须保真：
```
# 知识库相关内容
以下笔记与本次提问相关，优先参考但不要逐字复述：

### 📄 {title}
{content前800字}…（已截断）
```

### 6.1 System Prompt 组装（保真）

```
systemContent = (soulContent || defaultSoul) + ANTI_HALLUCINATION_SUFFIX
systemWithRag = ragBlock ? systemContent + "\n\n" + ragBlock : systemContent
messages = [{system: systemWithRag}, ...history, {user: message}]
```

- `defaultSoul`：含当天日期，「你是 DeepSeek Notes 的 AI 助手…」（原文保留）。
- `ANTI_HALLUCINATION_SUFFIX`：防幻觉要求（不确定就说不确定、优先用工具、不编造工具结果）——**原文保留**。
- `soulContent` 来自前端选择的 Agent 角色（28 个预置 prompt 之一），由前端传入。

---

## 7. 记忆系统（跨会话，移植要点）

记忆系统在 02 文档已列接口，算法细节（必须保真）：

### 7.1 loadContext 三层加载 + 被动遗忘
1. **被动遗忘**：`importance<4 AND recall_count<3 AND last_recalled早于60天 AND created早于60天` → 自动 archived。
2. **Tier1**：`is_pinned=1` 最多 5 条。
3. **Tier2**：对 userText 中文分词 `[\u4e00-\u9fa5]{2,}` / 英数 `[a-z0-9]{3,}`，取前 8 词，LIKE 匹配，最多 10 条，去重。
4. **Tier3**：高 importance + 近期补齐至 5 条。
5. 命中记忆 `recall_count+1, last_recalled=now`。

> 该逻辑是纯 SQL + JS，可直接搬，加 `user_id` 过滤即可。后端 Agent 运行前调用 loadContext，把记忆拼入 system 或 history（桌面版由前端在组装 history 前调用并注入）。

### 7.2 consolidate AI 整理
把全部未归档记忆喂 DeepSeek，要求返回 `{merge,update,delete}` JSON，事务执行。Web 建议做成**异步任务**（可能耗时），返回任务 id 轮询。

---

## 8. embedding 服务（services/embedding.ts）

桌面版支持 provider：`siliconflow(bge-m3)/jina/voyage/ollama`，配置从 store 读 `embeddingProvider/Model/ApiKey/BaseUrl`，`isEmbeddingEnabled()` 判断是否配置完整。

**Web 改造**：
- 配置从 `user_settings` 读（按 user）。
- `embedText()` 内 `net.fetch`→`fetch`。
- 向量产物：桌面版返回 number[] 存 JSON 文本列；Web 直接写 pgvector 列。
- `cosineSimilarity` 在语义搜索/RAG 下推 DB 后基本不再需要，但 consolidate 等场景仍可保留。
- **维度一致性**：不同 provider 维度不同（bge-m3=1024、jina-v3=1024、voyage 视模型）。pgvector 列维度需与用户所选模型匹配；切换模型需重建索引（提供 `/api/semantic/embed-all?force=true`）。

---

## 9. 并发与资源（Web 新增考量）

桌面版单用户单进程无并发压力。Web 需新增：

| 项 | 建议 |
|----|------|
| 单用户并发 Agent 数 | 限制（如同一 conversationId 仅 1 个活跃，复用 abort Map） |
| 全局并发 | 信号量/队列限制对 DeepSeek 的并发，避免触发上游限流 |
| AbortController 注册表 | `Map<userId:conversationId, AbortController>`，请求结束清理，防泄漏 |
| 超时 | Agent 总时长上限（如 5 分钟）+ 单次 LLM 请求超时 |
| 计费/配额 | 利用累计 usage 做 per-user token 配额（桌面版无，SaaS 建议加） |

---

## 10. 移植检查清单

- [ ] loop.ts 复制到后端，`net.fetch`→`fetch`，`ctx.store`→UserConfigStore
- [ ] hasActionIntent 关键词清单原样保留
- [ ] parseStream 的 tool_calls 分片缓冲 + reasoning 折叠原样保留
- [ ] 流断降级（非流式 + tool_choice:none）保留
- [ ] guardrails.ts 直接搬，每请求 new 实例
- [ ] ToolContext 加 userId，所有工具 SQL 加用户隔离
- [ ] 5 类事件改 SSE；确认走独立端点 + 60s 超时
- [ ] RAG：下推 DB + 应用层断层检测，模板/参数保真
- [ ] system prompt 组装（soul + 防幻觉后缀 + RAG）保真
- [ ] 记忆三层加载/遗忘曲线/consolidate 保真 + 加 userId
- [ ] embedding provider 配置按用户读，维度与 pgvector 列匹配
- [ ] 新增：并发限制、AbortController 注册表、超时、token 配额
