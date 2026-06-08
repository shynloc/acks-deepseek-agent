# DeepSeek Notes — Agent 化开发计划 v2.0

> 参考来源：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)  
> 当前版本：v1.0.0（已完成基础功能）  
> 本阶段目标：将客户端从「聊天工具」升级为「具备工具调用、技能复用、插件扩展能力的本地 AI Agent」

---

## 目录

1. [架构总览](#架构总览)
2. [Sprint A — 工具系统 + Agent Loop](#sprint-a--工具系统--agent-loop)
3. [Sprint B — Skills 技能系统](#sprint-b--skills-技能系统)
4. [Sprint C — Plugin 插件系统](#sprint-c--plugin-插件系统)
5. [Sprint D — Context 压缩 + 跨会话记忆](#sprint-d--context-压缩--跨会话记忆)
6. [模型路由策略](#模型路由策略)
7. [数据库 Schema 扩展](#数据库-schema-扩展)
8. [IPC 通信协议](#ipc-通信协议)
9. [UI 变更清单](#ui-变更清单)

---

## 架构总览

### 设计原则（来自 Hermes Agent）

| 原则 | Hermes 做法 | 我们的实现 |
|------|-------------|-----------|
| 工具自注册 | 每个工具文件在模块级调用 `registry.register()` | TypeScript 模块导入时自注册到 `ToolRegistry` 单例 |
| 主进程执行 | Python 直接调用 | Agent Loop 跑在 Electron 主进程，避免 renderer 安全限制 |
| 流式推送 | 回调 `on_text_delta` / `on_tool_call_delta` | `webContents.send()` 推送 token / tool 事件到 renderer |
| Guardrails | `ToolCallGuardrailController`，检测死循环 | TypeScript 端口，阈值同 Hermes |
| 结构化错误 | `FailoverReason` enum + 分类恢复 | 同 Hermes 错误分类 |
| Context 压缩 | 75% 阈值触发，保护头尾 | deepseek-v4-flash 做摘要 |

### 执行路径

```
[Renderer: 用户输入]
        │ IPC: agent:run
        ▼
[Main Process: AgentRunner]
        │
        ├─ 加载 Soul + 注入记忆 + 动态 System Prompt
        │
        ├─ LOOP ─────────────────────────────────────────┐
        │   ├─ net.fetch → DeepSeek API (stream)         │
        │   ├─ 缓冲 tool_calls JSON 分片                  │
        │   ├─ webContents.send('agent:delta', token)     │
        │   ├─ 检查 Guardrails                            │
        │   ├─ 并行 / 串行执行 ToolRegistry.dispatch()    │
        │   ├─ webContents.send('agent:tool-call', ...)   │
        │   └─ 追加 role:tool 消息 → 继续循环              │
        │                                                 │
        └─ 无 tool_calls → 结束 ──────────────────────────┘
                │
                ▼
        [Main: 持久化消息到 SQLite]
                │ IPC: agent:done
                ▼
        [Renderer: 渲染最终回复]
```

### 新增文件结构

```
electron/main/
  agent/
    index.ts          ← AgentRunner 入口
    loop.ts           ← Agent Loop 核心
    guardrails.ts     ← 死循环检测（Hermes tool_guardrails.py 端口）
    compressor.ts     ← Context 压缩（Sprint D）
    memory.ts         ← 跨会话记忆（Sprint D）

src/tools/
  registry.ts         ← ToolRegistry 单例（Hermes registry.py 端口）
  builtin/
    notes.ts          ← 笔记相关工具（5 个）
    web.ts            ← web_search（复用现有 Tavily IPC）
    system.ts         ← get_datetime / get_stats
    files.ts          ← read_file（通过 dialog 选文件）
  index.ts            ← 统一导出 + 注册所有内置工具
```

---

## Sprint A — 工具系统 + Agent Loop

### A-1. ToolRegistry（`src/tools/registry.ts`）

参考 Hermes `tools/registry.py` 的核心设计，TypeScript 端口：

```typescript
// src/tools/registry.ts

export interface ToolSchema {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required?: string[]
  }
}

export interface ToolEntry {
  name: string
  schema: ToolSchema
  // handler 运行在主进程，ctx 提供 DB / Store / 发送 IPC 的能力
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
  checkFn?: () => boolean        // 动态可用性检查（参考 Hermes TTL cache）
  maxResultChars?: number        // 截断超长结果，防止撑爆 context
  emoji?: string                 // UI 显示用
  idempotent?: boolean           // true = 只读工具，Guardrails 允许重试
}

export interface ToolContext {
  db: import('better-sqlite3').Database
  store: import('electron-store').default
  sendToRenderer: (channel: string, ...args: unknown[]) => void
  conversationId: string
}

class ToolRegistry {
  private tools = new Map<string, ToolEntry>()

  register(entry: ToolEntry): void {
    this.tools.set(entry.name, entry)
  }

  getAll(filter?: { enabledOnly?: boolean }): ToolEntry[] {
    return [...this.tools.values()].filter(t =>
      !filter?.enabledOnly || !t.checkFn || t.checkFn()
    )
  }

  get(name: string): ToolEntry | undefined {
    return this.tools.get(name)
  }

  // 返回 OpenAI format 的 tools 数组，用于 API 请求
  toApiFormat(entries: ToolEntry[]): Array<{ type: 'function'; function: ToolSchema }> {
    return entries.map(t => ({ type: 'function' as const, function: t.schema }))
  }
}

export const toolRegistry = new ToolRegistry()
```

---

### A-2. 内置工具定义

#### 笔记工具（`src/tools/builtin/notes.ts`）

```typescript
// 5 个工具，全部注册到 toolRegistry

// 1. search_notes — FTS5 全文搜索
toolRegistry.register({
  name: 'search_notes',
  emoji: '🔍',
  idempotent: true,
  maxResultChars: 6000,
  schema: {
    name: 'search_notes',
    description: '在用户的笔记库中全文搜索，返回标题和内容摘要。用于查找相关知识。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '最多返回条数，默认 5' }
      },
      required: ['query']
    }
  },
  handler: async (args, ctx) => {
    const rows = ctx.db
      .prepare(`SELECT n.id, n.title, snippet(notes_fts, 1, '【', '】', '...', 20) AS excerpt
                FROM notes_fts f JOIN notes n ON n.rowid = f.rowid
                WHERE notes_fts MATCH ? LIMIT ?`)
      .all(args.query, args.limit ?? 5) as any[]
    if (!rows.length) return JSON.stringify({ found: 0, results: [] })
    return JSON.stringify({ found: rows.length, results: rows.map(r => ({ id: r.id, title: r.title, excerpt: r.excerpt })) })
  }
})

// 2. get_note — 读取完整笔记正文
toolRegistry.register({
  name: 'get_note',
  emoji: '📄',
  idempotent: true,
  maxResultChars: 8000,
  schema: {
    name: 'get_note',
    description: '获取指定笔记的完整内容。先用 search_notes 找到 id，再用此工具读取全文。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '笔记 ID' } },
      required: ['id']
    }
  },
  handler: async (args, ctx) => {
    const note = ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(args.id) as any
    if (!note) return JSON.stringify({ error: '笔记不存在' })
    return JSON.stringify({ id: note.id, title: note.title, content: note.content, updatedAt: note.updated_at })
  }
})

// 3. create_note — 创建新笔记
toolRegistry.register({
  name: 'create_note',
  emoji: '✍️',
  idempotent: false,
  schema: {
    name: 'create_note',
    description: '在笔记本中创建一篇新笔记。用于整理对话结论、保存重要信息。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '笔记标题' },
        content: { type: 'string', description: '笔记内容（Markdown 格式）' }
      },
      required: ['title', 'content']
    }
  },
  handler: async (args, ctx) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    ctx.db.prepare(`INSERT INTO notes (id, title, content, word_count, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, args.title, args.content, String(args.content).length, now, now)
    return JSON.stringify({ ok: true, id, title: args.title })
  }
})

// 4. update_note — 修改笔记内容
toolRegistry.register({
  name: 'update_note',
  emoji: '✏️',
  idempotent: false,
  schema: {
    name: 'update_note',
    description: '修改已有笔记的标题或内容。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '笔记 ID' },
        title: { type: 'string', description: '新标题（可选）' },
        content: { type: 'string', description: '新内容（可选）' }
      },
      required: ['id']
    }
  },
  handler: async (args, ctx) => {
    const parts: string[] = ['updated_at = ?']
    const vals: unknown[] = [Date.now()]
    if (args.title) { parts.push('title = ?'); vals.push(args.title) }
    if (args.content) { parts.push('content = ?'); vals.push(args.content) }
    vals.push(args.id)
    ctx.db.prepare(`UPDATE notes SET ${parts.join(', ')} WHERE id = ?`).run(...vals)
    return JSON.stringify({ ok: true })
  }
})

// 5. list_notes — 列出最近笔记
toolRegistry.register({
  name: 'list_notes',
  emoji: '📚',
  idempotent: true,
  maxResultChars: 4000,
  schema: {
    name: 'list_notes',
    description: '列出最近更新的笔记（标题列表）。不需要搜索时用此工具浏览笔记库。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量，默认 10' }
      }
    }
  },
  handler: async (args, ctx) => {
    const rows = ctx.db
      .prepare('SELECT id, title, updated_at FROM notes ORDER BY updated_at DESC LIMIT ?')
      .all(args.limit ?? 10) as any[]
    return JSON.stringify({ count: rows.length, notes: rows })
  }
})
```

#### 系统工具（`src/tools/builtin/system.ts`）

```typescript
// get_datetime
toolRegistry.register({
  name: 'get_datetime',
  emoji: '🕐',
  idempotent: true,
  schema: {
    name: 'get_datetime',
    description: '获取当前日期和时间。',
    parameters: { type: 'object', properties: {} }
  },
  handler: async () => {
    return JSON.stringify({
      iso: new Date().toISOString(),
      local: new Date().toLocaleString('zh-CN'),
      timestamp: Date.now()
    })
  }
})

// get_stats
toolRegistry.register({
  name: 'get_stats',
  emoji: '📊',
  idempotent: true,
  schema: {
    name: 'get_stats',
    description: '获取用户的笔记库统计数据（笔记总数、字数等）。',
    parameters: { type: 'object', properties: {} }
  },
  handler: async (_, ctx) => {
    const noteCount = (ctx.db.prepare('SELECT COUNT(*) as c FROM notes').get() as any).c
    const wordCount = (ctx.db.prepare('SELECT SUM(word_count) as w FROM notes').get() as any).w ?? 0
    return JSON.stringify({ noteCount, wordCount })
  }
})
```

#### 联网搜索（`src/tools/builtin/web.ts`）

```typescript
// web_search — 复用现有 Tavily 实现
toolRegistry.register({
  name: 'web_search',
  emoji: '🌐',
  idempotent: true,
  maxResultChars: 8000,
  // Tavily API Key 必须配置才可用
  checkFn: () => {
    const key = (store.get('tavilyKey') as string ?? '').replace(/[^\x20-\x7E]/g, '').trim()
    return key.length > 0
  },
  schema: {
    name: 'web_search',
    description: '搜索互联网获取最新信息。需要实时数据、新闻或用户笔记库中没有的信息时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询词（英文效果更好）' },
        max_results: { type: 'number', description: '返回结果数，默认 5' }
      },
      required: ['query']
    }
  },
  handler: async (args, ctx) => {
    const apiKey = (ctx.store.get('tavilyKey') as string).replace(/[^\x20-\x7E]/g, '').trim()
    const res = await net.fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: args.query, max_results: args.max_results ?? 5, search_depth: 'basic', include_answer: true })
    })
    const data = await res.json() as any
    return JSON.stringify({
      answer: data.answer,
      results: (data.results ?? []).slice(0, 5).map((r: any) => ({
        title: r.title, url: r.url, content: r.content?.slice(0, 600)
      }))
    })
  }
})
```

---

### A-3. Guardrails（`electron/main/agent/guardrails.ts`）

端口自 Hermes `agent/tool_guardrails.py`，防止 Agent 陷入死循环：

```typescript
// 参考 Hermes ToolCallGuardrailConfig 默认值
const CONFIG = {
  exactFailureWarnAfter: 2,
  exactFailureBlockAfter: 5,
  sameToolFailureWarnAfter: 3,
  sameToolFailureHaltAfter: 8,
  noProgressWarnAfter: 2,
  noProgressBlockAfter: 5
}

// 来自 Hermes IDEMPOTENT_TOOL_NAMES — 只读工具允许多次调用
const IDEMPOTENT_TOOLS = new Set([
  'search_notes', 'get_note', 'list_notes', 'get_datetime', 'get_stats', 'web_search'
])

export type GuardrailDecision =
  | { action: 'allow' }
  | { action: 'warn';  message: string }
  | { action: 'halt';  message: string }

export class ToolGuardrails {
  // key: `${toolName}:${canonicalArgs}` → 失败次数
  private exactFailures = new Map<string, number>()
  // key: toolName → 失败次数
  private toolFailures = new Map<string, number>()
  // 连续幂等调用计数（检测无进展）
  private noProgressCount = 0
  private lastMutatingCall: string | null = null

  beforeCall(toolName: string, args: Record<string, unknown>): GuardrailDecision {
    const sig = this.signature(toolName, args)
    const exact = this.exactFailures.get(sig) ?? 0
    const total = this.toolFailures.get(toolName) ?? 0

    if (exact >= CONFIG.exactFailureBlockAfter)
      return { action: 'halt', message: `工具 ${toolName} 使用相同参数已失败 ${exact} 次，停止重试。请换一种方式解决问题。` }
    if (total >= CONFIG.sameToolFailureHaltAfter)
      return { action: 'halt', message: `工具 ${toolName} 已失败 ${total} 次，请停止并告知用户遇到的问题。` }
    if (this.noProgressCount >= CONFIG.noProgressBlockAfter)
      return { action: 'halt', message: '检测到重复的只读操作，没有实际进展，请停止并重新规划。' }
    if (exact >= CONFIG.exactFailureWarnAfter)
      return { action: 'warn', message: `工具 ${toolName} 已用相同参数失败 ${exact} 次，请尝试不同方式。` }

    return { action: 'allow' }
  }

  afterCall(toolName: string, args: Record<string, unknown>, failed: boolean): void {
    if (failed) {
      const sig = this.signature(toolName, args)
      this.exactFailures.set(sig, (this.exactFailures.get(sig) ?? 0) + 1)
      this.toolFailures.set(toolName, (this.toolFailures.get(toolName) ?? 0) + 1)
    }

    if (IDEMPOTENT_TOOLS.has(toolName)) {
      this.noProgressCount++
    } else {
      this.noProgressCount = 0
      this.lastMutatingCall = toolName
    }
  }

  private signature(toolName: string, args: Record<string, unknown>): string {
    // 规范化参数 JSON，与 Hermes canonical_tool_args() 逻辑一致
    return `${toolName}:${JSON.stringify(args, Object.keys(args).sort())}`
  }
}
```

---

### A-4. Agent Loop（`electron/main/agent/loop.ts`）

```typescript
// 核心循环，对标 Hermes agent/conversation_loop.py

import { net } from 'electron'
import { toolRegistry, type ToolContext } from '../../../src/tools/registry'
import { ToolGuardrails } from './guardrails'

export interface AgentCallbacks {
  onDelta: (text: string) => void
  onToolCall: (name: string, args: Record<string, unknown>) => void
  onToolResult: (name: string, result: string, isError: boolean) => void
  onDone: (usage: { promptTokens: number; completionTokens: number }) => void
  onError: (err: Error) => void
  signal?: AbortSignal
}

const MAX_ITERATIONS = 10

export async function runAgentLoop(
  messages: ChatMessage[],
  ctx: ToolContext,
  callbacks: AgentCallbacks
): Promise<void> {
  const guardrails = new ToolGuardrails()
  const tools = toolRegistry.getAll({ enabledOnly: true })
  const toolsApiFormat = toolRegistry.toApiFormat(tools)

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // ── 调用 DeepSeek API (流式) ─────────────────────────────────────────
    const apiKey = ctx.store.get('apiKey') as string
    const baseUrl = ctx.store.get('baseUrl') as string ?? 'https://api.deepseek.com'
    const model = ctx.store.get('model') as string ?? 'deepseek-v4-flash'

    const body = JSON.stringify({
      model,
      messages,
      tools: toolsApiFormat,
      tool_choice: 'auto',
      stream: true
    })

    let response: Response
    try {
      response = await net.fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: callbacks.signal as any
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      callbacks.onError(e)
      return
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      callbacks.onError(new Error(`API ${response.status}: ${errText}`))
      return
    }

    // ── 解析流式响应（文本 + tool_calls 分片缓冲）────────────────────────
    const { textContent, toolCalls, usage } = await parseStream(response, callbacks)

    // ── 无工具调用 → 结束循环 ────────────────────────────────────────────
    if (!toolCalls || toolCalls.length === 0) {
      callbacks.onDone(usage)
      return
    }

    // 追加 assistant 消息（含 tool_calls）
    messages.push({
      role: 'assistant',
      content: textContent || null,
      tool_calls: toolCalls
    })

    // ── 执行每个工具调用 ─────────────────────────────────────────────────
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch { /* malformed JSON */ }

      // Guardrails 检查
      const decision = guardrails.beforeCall(tc.function.name, args)
      if (decision.action === 'halt') {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: decision.message })
        // 告知 DeepSeek 已中止
        messages.push({ role: 'user', content: '[系统提示] Agent 循环已被安全机制中止，请直接告知用户遇到的问题。' })
        callbacks.onDone(usage)
        return
      }

      callbacks.onToolCall(tc.function.name, args)

      const tool = toolRegistry.get(tc.function.name)
      let result: string
      let isError = false

      if (!tool) {
        result = JSON.stringify({ error: `未知工具: ${tc.function.name}` })
        isError = true
      } else {
        try {
          result = await tool.handler(args, ctx)
          // 截断超长结果
          if (tool.maxResultChars && result.length > tool.maxResultChars) {
            result = result.slice(0, tool.maxResultChars) + '\n...[结果已截断]'
          }
        } catch (e: any) {
          result = JSON.stringify({ error: e?.message ?? String(e) })
          isError = true
        }
      }

      guardrails.afterCall(tc.function.name, args, isError)
      callbacks.onToolResult(tc.function.name, result, isError)

      messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
    }
  }

  // 超过最大迭代次数
  callbacks.onError(new Error(`Agent 超过最大迭代次数 (${MAX_ITERATIONS})，已中止`))
}

// ── 流式解析器（处理 tool_calls JSON 分片拼接）────────────────────────────
async function parseStream(
  response: Response,
  callbacks: AgentCallbacks
): Promise<{ textContent: string; toolCalls: any[]; usage: any }> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  let textContent = ''
  const toolCallBuffers: Map<number, { id: string; name: string; args: string }> = new Map()
  let usage = { promptTokens: 0, completionTokens: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })

    for (const line of chunk.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta

        // 文本 token
        if (delta?.content) {
          textContent += delta.content
          callbacks.onDelta(delta.content)
        }

        // tool_calls 分片 —— 关键：index 标识哪个 tool call，arguments 是分片 JSON
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallBuffers.has(tc.index)) {
              toolCallBuffers.set(tc.index, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' })
            }
            const buf = toolCallBuffers.get(tc.index)!
            if (tc.id) buf.id = tc.id
            if (tc.function?.name) buf.name = tc.function.name
            if (tc.function?.arguments) buf.args += tc.function.arguments
          }
        }

        if (json.usage) {
          usage = { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens }
        }
      } catch { /* partial JSON */ }
    }
  }

  const toolCalls = [...toolCallBuffers.values()].map(buf => ({
    id: buf.id,
    type: 'function',
    function: { name: buf.name, arguments: buf.args }
  }))

  return { textContent, toolCalls: toolCalls.length > 0 ? toolCalls : [], usage }
}
```

---

### A-5. AgentRunner IPC 入口（`electron/main/agent/index.ts`）

```typescript
// 注册 IPC handler，供 renderer 调用

import { ipcMain } from 'electron'
import { getDatabase } from '../db'
import Store from 'electron-store'
import { runAgentLoop } from './loop'
import '../../../src/tools'  // 触发所有内置工具自注册

const store = new Store()

export function registerAgentIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('agent:run', async (event, payload: {
    message: string
    conversationId: string
    history: ChatMessage[]
    soulContent?: string
  }) => {
    const ctx: ToolContext = {
      db: getDatabase(),
      store,
      sendToRenderer: (ch, ...args) => event.sender.send(ch, ...args),
      conversationId: payload.conversationId
    }

    // 构建完整消息列表（soul → history → 新消息）
    const soul = (payload.soulContent ?? '').trim()
    const systemContent = soul || `你是 DeepSeek Notes 的 AI 助手，专注帮助用户管理知识。今天是 ${new Date().toLocaleDateString('zh-CN')}。你拥有工具可以读写用户的笔记库。`

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...payload.history,
      { role: 'user', content: payload.message }
    ]

    await runAgentLoop(messages, ctx, {
      onDelta: (text) => event.sender.send('agent:delta', text),
      onToolCall: (name, args) => event.sender.send('agent:tool-call', { name, args }),
      onToolResult: (name, result, isError) => event.sender.send('agent:tool-result', { name, result, isError }),
      onDone: (usage) => event.sender.send('agent:done', usage),
      onError: (err) => event.sender.send('agent:error', err.message)
    })
  })
}
```

---

### A-6. UI：工具调用气泡

在 `MessageBubble.vue` 和对话区域中显示工具调用过程：

**新增组件：`src/components/chat/ToolCallBubble.vue`**

```
┌─────────────────────────────────────┐
│ 🔍 正在搜索笔记…                      │  ← 执行中（spinner）
│   search_notes({ query: "Python" })  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ✅ search_notes — 找到 3 条结果       │  ← 完成（可折叠展开）
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ❌ web_search — 连接超时              │  ← 失败（红色）
└─────────────────────────────────────┘
```

**chat.ts 中修改**：
- `sendMessage` 改为调用 `ipcRenderer.invoke('agent:run', ...)` 并监听 `agent:delta` / `agent:tool-call` / `agent:tool-result` / `agent:done` 事件
- 维护 `toolCalls: ToolCallRecord[]` 状态，插入在 assistant 消息气泡上方

---

## Sprint B — Skills 技能系统

参考 Hermes `skills/` 目录和自动技能创建逻辑。

### B-1. 数据库表

```sql
CREATE TABLE IF NOT EXISTS skills (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  trigger_keywords TEXT,          -- JSON 字符串数组，用于自动匹配
  system_hint      TEXT,          -- 注入 system prompt 的附加指令
  tool_sequence    TEXT,          -- JSON，典型工具调用序列（参考）
  usage_count      INTEGER DEFAULT 0,
  source           TEXT DEFAULT 'manual',  -- 'manual' | 'auto'
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
```

### B-2. 技能触发机制

```
用户输入 → 扫描 trigger_keywords → 命中 skill
  → 将 skill.system_hint 追加到本轮 system message
  → Agent 执行时携带该提示（行为更精准）
```

关键词匹配在 **renderer 端**（chat store 里），无需主进程参与：

```typescript
// chat store 中，sendMessage 时：
function matchSkills(input: string): Skill[] {
  return skills.value.filter(s => {
    const keywords: string[] = JSON.parse(s.triggerKeywords ?? '[]')
    return keywords.some(k => input.includes(k))
  })
}

// 命中 skill 时，system prompt 末尾附加：
// \n\n## 激活技能：{skill.name}\n{skill.system_hint}
```

### B-3. 自动技能提炼（Auto-Extract）

对话结束后，若本轮有 **3 次或以上**工具调用，触发自动提炼：

```typescript
// 调用 deepseek-v4-flash（便宜快）
// Prompt 模板：
const extractPrompt = `
分析以下对话中的工具调用序列，如果这个任务模式可以复用，提炼为一个技能。

工具调用序列：
${toolCallLog.map(t => `- ${t.name}(${JSON.stringify(t.args)})`).join('\n')}

最终结果：${finalReply.slice(0, 300)}

请以 JSON 格式返回（如果不值得保存返回 null）：
{
  "name": "技能名称（简短）",
  "description": "一句话描述这个技能做什么",
  "trigger_keywords": ["关键词1", "关键词2"],
  "system_hint": "执行这类任务时的额外指令"
}
`
```

提炼结果弹出确认卡片（用户可编辑后保存，也可忽略）。

### B-4. 技能管理 UI

在设置页新增「技能库」section：

- 技能列表（名称 + 描述 + 触发关键词 + 来源标签 auto/manual）
- 新建技能（手动定义）
- 编辑 / 删除
- 触发关键词编辑（tag 形式输入）
- 使用次数统计

---

## Sprint C — Plugin 插件系统

用户可以定义 HTTP Webhook 工具，DeepSeek 能直接调用用户自己的 API。

### C-1. 数据库表

```sql
CREATE TABLE IF NOT EXISTS plugins (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,     -- 工具函数名（snake_case，DeepSeek 看到的）
  display_name   TEXT NOT NULL,            -- 界面显示名称
  description    TEXT NOT NULL,            -- 传给 DeepSeek 的工具描述
  endpoint_url   TEXT NOT NULL,            -- HTTP 目标地址
  method         TEXT DEFAULT 'POST',      -- GET | POST
  headers_json   TEXT,                     -- JSON 对象，自定义 headers（如 Authorization）
  param_schema_json TEXT,                  -- OpenAI function.parameters 格式的 JSON Schema
  enabled        INTEGER DEFAULT 1,
  created_at     INTEGER NOT NULL
);
```

### C-2. Plugin 执行引擎（主进程）

```typescript
// 在 ToolRegistry 初始化后，动态加载 DB 中的 plugins
export function loadPluginsFromDB(db: Database, store: Store): void {
  const rows = db.prepare('SELECT * FROM plugins WHERE enabled = 1').all() as any[]
  for (const plugin of rows) {
    toolRegistry.register({
      name: plugin.name,
      emoji: '🔌',
      idempotent: false,
      maxResultChars: 4000,
      schema: {
        name: plugin.name,
        description: plugin.description,
        parameters: JSON.parse(plugin.param_schema_json ?? '{"type":"object","properties":{}}')
      },
      handler: async (args) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(plugin.headers_json ? JSON.parse(plugin.headers_json) : {})
        }
        const res = await net.fetch(plugin.endpoint_url, {
          method: plugin.method,
          headers,
          body: plugin.method === 'POST' ? JSON.stringify(args) : undefined
        })
        const text = await res.text()
        return text.length > 4000 ? text.slice(0, 4000) + '...[截断]' : text
      }
    })
  }
}
```

### C-3. Plugin 管理 UI

在设置页新增「插件」section：

```
┌──────────────────────────────────────────────────────┐
│ 🔌 我的插件                                [+ 添加插件] │
├──────────────────────────────────────────────────────┤
│ ✅ home_control   控制智能家居设备                 ✏️ 🗑 │
│    POST https://homeassistant.local/api/services/... │
│                                                      │
│ ✅ notion_search  在 Notion 中搜索页面               ✏️ 🗑 │
│    GET  https://api.notion.com/v1/search             │
└──────────────────────────────────────────────────────┘
```

**添加/编辑插件表单字段**：
- 工具名称（snake_case，DeepSeek 用）
- 显示名称（用户看到的）
- 描述（告诉 DeepSeek 什么时候用这个工具）
- 请求地址 + 方法（GET/POST）
- 自定义 Headers（key-value 编辑器）
- 参数 Schema（JSON 编辑器，带格式验证）
- 测试按钮（发送测试请求，预览响应）

---

## Sprint D — Context 压缩 + 跨会话记忆

参考 Hermes `agent/context_compressor.py` 和 `agent/memory_manager.py`。

### D-1. Context 压缩

**触发条件**：当 `messages` 总字符数超过 `160,000`（约 40k tokens，deepseek-v4-flash 64k context 的 62%）

**压缩策略**（对标 Hermes）：
```
保护区：system message（头部）+ 最近 6 轮对话（尾部）

压缩区：中间所有消息 → 用 deepseek-v4-flash 生成摘要

摘要注入格式（来自 Hermes SUMMARY_PREFIX）：
┌─────────────────────────────────────────────┐
│ [上下文摘要 - 早期对话已压缩]                   │
│                                             │
│ ## 已解决的问题                               │
│ ...                                         │
│                                             │
│ ## 进行中                                    │
│ ...                                         │
│                                             │
│ ## 待办                                     │
│ ...                                         │
└─────────────────────────────────────────────┘
```

摘要本身调用 deepseek-v4-flash，成本约 0.01 元。

### D-2. 跨会话记忆表

```sql
CREATE TABLE IF NOT EXISTS user_memory (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,   -- 如 "user_name", "preferred_language"
  value      TEXT NOT NULL,
  source     TEXT DEFAULT 'auto',    -- 'auto' | 'manual'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**自动写入时机**：
- 用户说「我叫 XXX」「我是做 XXX 的」→ Agent 提取 key-value 存入
- 每次对话 system prompt 开头注入：`用户偏好：\n{key1}: {value1}\n{key2}: {value2}`

**手动管理**：设置页「关于我」section，用户可查看/编辑/删除记忆条目。

---

## 模型路由策略

| 场景 | 使用模型 | 原因 |
|------|---------|------|
| 日常对话、工具调用 | `deepseek-v4-flash` | 快、便宜，工具调用足够准确 |
| 复杂推理、长文分析 | `deepseek-v4-pro` | 更强推理，适合多步规划 |
| 自动对话标题 | `deepseek-v4-flash` | 低复杂度任务 |
| Context 摘要 | `deepseek-v4-flash` | 结构化任务，flash 足够 |
| Skills 自动提炼 | `deepseek-v4-flash` | 提取 + 格式化，无需高端模型 |

**自动升级规则**（可选）：
用户消息包含以下关键词时自动切换到 pro：
`分析 / 比较 / 评估 / 制定计划 / 深度 / 详细报告 / 为什么 / 推理`

---

## 数据库 Schema 扩展

需在现有 `schema.ts` 末尾追加：

```sql
-- Sprint B: Skills
CREATE TABLE IF NOT EXISTS skills (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  trigger_keywords TEXT,
  system_hint      TEXT,
  tool_sequence    TEXT,
  usage_count      INTEGER DEFAULT 0,
  source           TEXT DEFAULT 'manual',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- Sprint C: Plugins
CREATE TABLE IF NOT EXISTS plugins (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  description     TEXT NOT NULL,
  endpoint_url    TEXT NOT NULL,
  method          TEXT DEFAULT 'POST',
  headers_json    TEXT,
  param_schema_json TEXT,
  enabled         INTEGER DEFAULT 1,
  created_at      INTEGER NOT NULL
);

-- Sprint D: User Memory
CREATE TABLE IF NOT EXISTS user_memory (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  source     TEXT DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Agent tool call log (调试 + skills 提炼用)
CREATE TABLE IF NOT EXISTS agent_tool_logs (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,
  args_json       TEXT,
  result_json     TEXT,
  is_error        INTEGER DEFAULT 0,
  duration_ms     INTEGER,
  called_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_logs_conv ON agent_tool_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at DESC);
```

---

## IPC 通信协议

### 新增 IPC Channels

| Channel | 方向 | 数据 | 说明 |
|---------|------|------|------|
| `agent:run` | R→M (invoke) | `{ message, conversationId, history, soulContent }` | 启动 Agent |
| `agent:delta` | M→R (send) | `string` | 流式文本 token |
| `agent:tool-call` | M→R (send) | `{ name, args }` | 工具开始执行 |
| `agent:tool-result` | M→R (send) | `{ name, result, isError }` | 工具执行完成 |
| `agent:done` | M→R (send) | `{ promptTokens, completionTokens }` | Agent 完成 |
| `agent:error` | M→R (send) | `string` | 错误信息 |
| `db:skills:list` | R→M | — | 列出技能 |
| `db:skills:create` | R→M | `Skill` | 创建技能 |
| `db:skills:update` | R→M | `{ id, patch }` | 更新技能 |
| `db:skills:delete` | R→M | `string` | 删除技能 |
| `db:plugins:list` | R→M | — | 列出插件 |
| `db:plugins:create` | R→M | `Plugin` | 创建插件 |
| `db:plugins:update` | R→M | `{ id, patch }` | 更新插件 |
| `db:plugins:delete` | R→M | `string` | 删除插件 |
| `db:plugins:test` | R→M | `{ id, testArgs }` | 测试插件请求 |
| `db:memory:list` | R→M | — | 列出记忆 |
| `db:memory:set` | R→M | `{ key, value }` | 写入记忆 |
| `db:memory:delete` | R→M | `string` | 删除记忆 |

---

## UI 变更清单

### AIChat.vue（改动最大）

- [ ] 监听 `agent:delta` / `agent:tool-call` / `agent:tool-result` / `agent:done`
- [ ] 渲染 `ToolCallBubble` 组件（工具调用气泡）
- [ ] 中断按钮改为可中断整个 agent 循环（AbortController 传给 IPC）
- [ ] 底部显示「Agent 正在思考 / 调用工具 X / 完成」状态

### Profile.vue（设置页）

- [ ] 新增「技能库」section（Sprint B）
- [ ] 新增「插件」section（Sprint C）
- [ ] 新增「关于我（记忆）」section（Sprint D）
- [ ] 工具状态预览：显示当前可用工具列表（哪些 checkFn 通过）

### 新增组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `ToolCallBubble` | `src/components/chat/ToolCallBubble.vue` | 工具调用气泡 |
| `SkillCard` | `src/components/skills/SkillCard.vue` | 技能卡片 |
| `PluginForm` | `src/components/plugins/PluginForm.vue` | 插件新建/编辑表单 |
| `MemoryList` | `src/components/memory/MemoryList.vue` | 记忆条目管理 |

---

## Sprint 时间估算

| Sprint | 主要工作 | 预计工时 |
|--------|---------|---------|
| **Sprint A** | ToolRegistry + 7个内置工具 + Agent Loop + Guardrails + ToolCallBubble UI | 3~4 天 |
| **Sprint B** | Skills DB + 触发匹配 + 自动提炼 + 技能管理 UI | 2 天 |
| **Sprint C** | Plugin DB + 执行引擎 + Plugin 管理 UI（含 JSON Schema 编辑器）| 2 天 |
| **Sprint D** | Context 压缩 + User Memory + 记忆管理 UI | 1~2 天 |

**完成 Sprint A 后**，用户即可体验真正的 Agent 能力（DeepSeek 自主调用工具完成任务）。

---

*文档版本：2.0 | 生成时间：2026-06-09 | 参考：NousResearch/hermes-agent*
