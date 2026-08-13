# 02 — 后端 API 契约（IPC → REST/SSE 全量映射）

> 基于真实代码：`electron/preload/index.ts`（window.api 全集）+ `electron/main/ipc/index.ts`（70+ handler）+ `electron/main/agent/index.ts`（agent IPC）。
> 原则：**每一个 IPC 通道都映射到一个 HTTP 端点**，确保功能零缺失。
> 约定：所有端点需鉴权（除注册/登录）；后端从 token 解析 `user_id`，业务查询强制按 user_id 隔离。

---

## 1. 通用约定

- **Base URL**：`/api`
- **鉴权**：`Authorization: Bearer <JWT>`（或 HttpOnly Cookie Session，见 05 文档）
- **响应封装**（建议）：成功直接返回数据体；错误返回 `{ error: { code, message } }` + 对应 HTTP 状态码。
- **时间戳**：沿用桌面版毫秒整数（`Date.now()`），避免改动前端时间逻辑。
- **ID**：UUID 字符串（前端已用 `crypto.randomUUID()` 生成，可继续前端生成或后端生成，二选一并统一）。
- **字段命名**：桌面版 IPC 返回经 `ccAll`（snake_case→camelCase）转换，前端消费 camelCase。**后端 API 统一返回 camelCase**，与前端零摩擦。

---

## 2. 认证（新增，桌面版无）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/auth/register` | 注册 `{email, password, displayName?}` → `{token, user}` |
| POST | `/api/auth/login` | 登录 `{email, password}` → `{token, user}` |
| POST | `/api/auth/logout` | 注销 |
| GET | `/api/auth/me` | 当前用户信息 |
| POST | `/api/auth/refresh` | 刷新 token（如用短期 JWT） |

---

## 3. 配置（config:* → settings）

桌面版：`config.get/set/delete(key)` 直接读写 electron-store。

| IPC | REST | 说明 |
|-----|------|------|
| `config:get` | `GET /api/settings/:key` 或 `GET /api/settings`（全量） | 敏感 key 返回掩码（如 `sk-****`），不回明文 |
| `config:set` | `PUT /api/settings/:key` body `{value}` | 敏感 key 加密存储 |
| `config:delete` | `DELETE /api/settings/:key` | |

> 敏感 key 清单（必须加密、读取掩码）：`apiKey, tavilyKey, embeddingApiKey, memosToken, webdavPassword, picbedPassword`。

---

## 4. 对话与消息（db:conversations/messages:*）

| IPC | REST | Body / 返回 |
|-----|------|------|
| `db:conversations:list` | `GET /api/conversations` | 列表（当前用户） |
| `db:conversations:create` | `POST /api/conversations` | `{id?,title,model,systemPrompt?,agentId?}` |
| `db:conversations:update` | `PATCH /api/conversations/:id` | `{title?,model?,systemPrompt?,agentId?}` |
| `db:conversations:delete` | `DELETE /api/conversations/:id` | 级联删 messages |
| `db:conversations:export` | `GET /api/conversations/:id/export` | 导出单个对话（Markdown/JSON） |
| `db:messages:list` | `GET /api/conversations/:id/messages` | 该对话消息 |
| `db:messages:create` | `POST /api/conversations/:id/messages` | `{id?,role,content,tokensUsed?,metadata?}` |

> `messages.metadata` 存附件信息与 `toolCallRecords`（工具调用记录）。前端 `Message.toolCallRecords` 会持久化到此列。

---

## 5. 笔记（db:notes:* + 版本 + 标签）

| IPC | REST | 说明 |
|-----|------|------|
| `db:notes:list`（无 filter） | `GET /api/notes` | 全部笔记（含 tags，按 updated_at desc） |
| `db:notes:list`（filter.categoryId） | `GET /api/notes?categoryId=` | 按分类 |
| `db:notes:list`（filter.search） | `GET /api/notes?search=` | **FTS 全文 + searchSnippet 高亮**（见 01 文档映射） |
| `db:notes:create` | `POST /api/notes` | `{id?,title,content,categoryId?,color?,visibility?,sourceType?,sourceId?,sourceMsgId?}` |
| `db:notes:update` | `PATCH /api/notes/:id` | 部分更新；**自动生成版本快照（保留30版）** |
| `db:notes:delete` | `DELETE /api/notes/:id` | **写删除墓碑 deleted_notes**（同步用） |
| `db:notes:setTags` | `PUT /api/notes/:id/tags` | `{tagIds:[]}` |
| `db:note_versions:list` | `GET /api/notes/:id/versions` | 版本列表（仅元信息） |
| `db:note_versions:get` | `GET /api/note-versions/:versionId` | 单版本全文（用于回滚预览） |

> 回滚 = 前端取 version 内容 → 调 `PATCH /api/notes/:id`，与桌面版逻辑一致。

---

## 6. 分类与标签（db:categories/tags:*）

| IPC | REST |
|-----|------|
| `db:categories:list` | `GET /api/categories` |
| `db:categories:create` | `POST /api/categories` |
| `db:categories:update` | `PATCH /api/categories/:id` |
| `db:categories:delete` | `DELETE /api/categories/:id`（级联子分类，notes.category_id SET NULL，写墓碑） |
| `db:tags:list` | `GET /api/tags` |
| `db:tags:create` | `POST /api/tags`（唯一约束改 (user_id,name)） |
| `db:tags:delete` | `DELETE /api/tags/:id`（写墓碑） |

---

## 7. 快捷方式 / 统计 / 导入导出

| IPC | REST | 说明 |
|-----|------|------|
| `db:shortcuts:list` | `GET /api/shortcuts` | 含关联 note 标题/颜色 |
| `db:shortcuts:add` | `POST /api/shortcuts` `{noteId}` | 已存在则忽略 |
| `db:shortcuts:remove` | `DELETE /api/shortcuts/:noteId` | |
| `db:stats:get` | `GET /api/stats` | noteCount/wordCount/convCount/tokenCount + 近7日 days[] |
| `db:export:json` | `GET /api/export/json` | 全量 JSON 下载 |
| `db:export:markdown` | `GET /api/export/markdown` | 打包 zip 下载（桌面版导出文件夹→Web 打 zip） |
| `db:import:json` | `POST /api/import/json` | 浏览器上传文件（桌面版用 dialog→Web 用 multipart） |
| `db:import:markdown` | `POST /api/import/markdown` | 上传 .md/.zip |

> 桌面版导出走 `dialog.showSaveDialog` 写本地；Web 改为返回文件流/下载链接。导入桌面用 `dialog.showOpenDialog`；Web 用 multipart 上传。

---

## 8. 技能 Skills / 插件 Plugins / 记忆 Memories

### 8.1 Skills

| IPC | REST |
|-----|------|
| `db:skills:list` | `GET /api/skills` |
| `db:skills:create` | `POST /api/skills` |
| `db:skills:update` | `PATCH /api/skills/:id` |
| `db:skills:delete` | `DELETE /api/skills/:id` |

> 内置技能 seed（`seedBuiltinSkills`「专业文档生成」）：改为**每个用户注册后 seed 一次**，或全局只读内置技能 + 用户自建技能合并。

### 8.2 Plugins

| IPC | REST |
|-----|------|
| `db:plugins:list` | `GET /api/plugins` |
| `db:plugins:create` | `POST /api/plugins`（**必须 SSRF 校验 endpoint_url**，见 04/05） |
| `db:plugins:update` | `PATCH /api/plugins/:id` |
| `db:plugins:delete` | `DELETE /api/plugins/:id` |

### 8.3 Memories

| IPC | REST | 说明 |
|-----|------|------|
| `db:memories:list` | `GET /api/memories?limit=&category=` | limit 上限 100 |
| `db:memories:create` | `POST /api/memories` | `{id,content,category?,importance?}` |
| `db:memories:update` | `PATCH /api/memories/:id` | `{content?,importance?,isPinned?,isArchived?}` |
| `db:memories:delete` | `DELETE /api/memories/:id` | |
| `db:memories:search` | `GET /api/memories/search?q=&limit=` | LIKE 搜索 |
| `db:memories:loadContext` | `POST /api/memories/load-context` `{userText}` | **三层加载+遗忘曲线**（见 03） |
| `db:memories:consolidate` | `POST /api/memories/consolidate` | AI 整理（调 DeepSeek，建议异步任务） |

---

## 9. AI 调用代理（api:* / tavily / embedding / semantic）

| IPC | REST | 说明 |
|-----|------|------|
| `api:test` | `POST /api/ai/test` `{url,apiKey,model}` | 测试连接（注意：可临时用传入 key 测试，不落库） |
| `api:balance` | `GET /api/ai/balance` | 代理 DeepSeek `/user/balance` |
| `tavily:search` | `POST /api/web/search` `{query,maxResults?}` | 代理 Tavily（key 从用户配置取） |
| `embedding:test` | `POST /api/embedding/test` | 测试 embedding 连接 |
| `semantic:embed` | `POST /api/semantic/embed/:noteId` | 为单笔记建向量 |
| `semantic:embed:all` | `POST /api/semantic/embed-all` `{force?}` | 批量建索引（建议异步+进度） |
| `semantic:search` | `POST /api/semantic/search` `{query}` | 返回 `{id,score}[]`（下推 DB） |
| `semantic:status` | `GET /api/semantic/status` | `{total,embedded}` |

---

## 10. 同步与图床（memos / webdav / picbed / tencentdocs）

| IPC | REST | 说明 |
|-----|------|------|
| `memos:test` | `POST /api/sync/memos/test` | 测试连接 |
| `memos:sync` | `POST /api/sync/memos/run` | 触发双向同步（建议异步任务+状态轮询） |
| `memos:getStatus` | `GET /api/sync/memos/status` | `{lastSyncAt}` |
| `memos:uploadResource` | `POST /api/sync/memos/resource` | multipart 上传附件 |
| `webdav:test` | `POST /api/sync/webdav/test` | |
| `webdav:sync` | `POST /api/sync/webdav/run` | `{pushed,pulled,syncedAt}` |
| `webdav:status` | `GET /api/sync/webdav/status` | |
| `picbed:test` | `POST /api/picbed/test` | |
| `picbed:upload` | `POST /api/picbed/upload` | multipart → `{key}` |
| `tencentdocs:test` | `POST /api/tencentdocs/test` `{token}` | |
| `tencentdocs:reload` | `POST /api/tencentdocs/reload` | 重载该用户的腾讯文档工具 |

> 桌面版自动同步用 `setInterval`（main 进程）。Web 版改为**后端定时任务/队列**，按用户配置的 `memosSyncInterval` 调度。

---

## 11. Agent 运行（核心：IPC 流式 → SSE）

桌面版 `agent:run` 通过 `webContents.send` 推 5 类事件。Web 改为 **SSE**。详细逻辑见 03 文档，此处只定接口契约。

### 11.1 启动 Agent（SSE）

```
POST /api/agent/run
Content-Type: application/json
Accept: text/event-stream

{ "message": "...", "conversationId": "...", "history": [...], "soulContent": "..." }
```

**SSE 事件流**（对应桌面版回调）：

| SSE event | 桌面 IPC 事件 | data |
|-----------|--------------|------|
| `delta` | `agent:delta` | `{ text }` 流式 token |
| `tool-call` | `agent:tool-call` | `{ name, args, callId }` |
| `tool-result` | `agent:tool-result` | `{ name, result, isError, callId }` |
| `done` | `agent:done` | `{ promptTokens, completionTokens, cacheHitTokens, cacheMissTokens }` |
| `error` | `agent:error` | `{ message }` |
| `confirm-request` | `agent:confirm-request` | `{ reqId, name, args }`（危险操作确认） |

### 11.2 中止

| IPC | REST |
|-----|------|
| `agent:abort` | `POST /api/agent/abort` `{conversationId}` |

> 后端维护 `Map<userId:conversationId, AbortController>`，中止当前用户自己的会话。

### 11.3 危险操作确认（双向）

桌面版用 `agent:confirm-response:<reqId>` 回传。Web 因 SSE 是单向，确认需独立端点：

```
POST /api/agent/confirm
{ "reqId": "...", "confirmed": true }
```

后端 Agent 运行时阻塞等待该 reqId 的确认（超时 60s 自动取消，与桌面版一致）。
> 备选：若用 WebSocket，则双向天然支持，确认走同一连接。

### 11.4 可用工具列表

| IPC | REST |
|-----|------|
| `agent:get-tools` | `GET /api/agent/tools` → `[{name,emoji,description,idempotent}]`（含该用户启用的插件工具） |

---

## 12. 下线/替代端点（桌面专属）

| IPC | 处理 |
|-----|------|
| `clipboard:writeHtml` | 前端用浏览器 Clipboard API，无需后端 |
| `shell:openPath/showItemInFolder/openExternal` | 前端用 `<a download>` / `window.open`，无需后端 |
| `window:*` / `tray:*` | 下线（浏览器原生窗口） |

---

## 13. 端点总数核对

确保功能不缺失——逐 IPC 核对：

- config 3 → settings 3 ✅
- conversations 4 + export 1 ✅
- messages 2 ✅
- notes 5 + versions 2 ✅
- categories 4 ✅ / tags 3 ✅
- shortcuts 3 ✅ / stats 1 ✅
- export 3 / import 2 ✅
- skills 4 ✅ / plugins 4 ✅ / memories 7 ✅
- ai test/balance 2 ✅ / tavily 1 ✅ / embedding 1 ✅ / semantic 4 ✅
- memos 4 ✅ / webdav 3 ✅ / picbed 2 ✅ / tencentdocs 2 ✅
- agent run/abort/confirm/tools 4 ✅
- 新增 auth 5 ✅

> 桌面专属（clipboard/shell/window/tray）转前端能力或下线，不计入后端端点缺失。
