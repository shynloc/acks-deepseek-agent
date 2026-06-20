import { ipcMain, type BrowserWindow } from 'electron'
import Store from 'electron-store'
import { getDatabase } from '../db'
import '../tools/index'   // trigger self-registration of all builtin tools
import { loadPluginsFromDb } from '../tools/builtin/plugins'
import { runAgentLoop, type ChatMessage } from './loop'
import { toolRegistry } from '../tools/registry'
import { isEmbeddingEnabled, embedText, cosineSimilarity } from '../services/embedding'
import type { Database } from 'better-sqlite3'

const store = new Store()

// conversationId → AbortController (so renderer can cancel a running agent)
const activeAgents = new Map<string, AbortController>()

const ANTI_HALLUCINATION_SUFFIX = `

## 准确性要求（重要）
- 不确定的事实（日期、数字、具体信息）：直接说"我不确定"，不要猜测或编造
- 需要实时信息时：优先使用 web_search 或其他工具获取，不依赖训练记忆
- 工具调用失败时：如实告知用户，不要假装成功或编造结果
- 作答必须基于工具实际返回的内容，不添加工具未返回的细节
- 如果你无法完成某个操作，请诚实说明原因`

async function buildRagContext(db: Database, message: string): Promise<string> {
  if (!isEmbeddingEnabled()) return ''
  const qVec = await embedText(message).catch(() => null)
  if (!qVec) return ''

  const FLOOR = 0.50
  const GAP_MIN = 0.08
  const MAX = 3

  const rows = (db as any).prepare(
    `SELECT id, title, content, embedding FROM notes WHERE embedding IS NOT NULL LIMIT 300`
  ).all() as { id: string; title: string; content: string; embedding: string }[]

  const scored = rows
    .map(r => {
      try { return { ...r, score: cosineSimilarity(qVec, JSON.parse(r.embedding)) }
      } catch { return { ...r, score: 0 } }
    })
    .filter(r => r.score >= FLOOR)
    .sort((a, b) => b.score - a.score)

  // Gap detection: cut at first large drop in relevance
  let cutoff = scored.length
  for (let i = 0; i < scored.length - 1; i++) {
    if (scored[i].score - scored[i + 1].score >= GAP_MIN) { cutoff = i + 1; break }
  }

  const relevant = scored.slice(0, cutoff).slice(0, MAX)
  if (!relevant.length) return ''

  const blocks = relevant.map(r => {
    const preview = r.content.slice(0, 800)
    const ellipsis = r.content.length > 800 ? '\n…（已截断）' : ''
    return `### 📄 ${r.title}\n${preview}${ellipsis}`
  }).join('\n\n---\n\n')

  return `# 知识库相关内容\n以下笔记与本次提问相关，优先参考但不要逐字复述：\n\n${blocks}`
}

export function registerAgentIpc(_win: BrowserWindow): void {

  // ── Start agent run ─────────────────────────────────────────────────────────
  ipcMain.handle('agent:run', async (event, payload: {
    message:        string
    conversationId: string
    history:        ChatMessage[]
    soulContent?:   string
  }) => {
    const { message, conversationId, history, soulContent } = payload

    const ac = new AbortController()
    activeAgents.set(conversationId, ac)

    const soul = (soulContent ?? '').trim()
    const defaultSoul = `你是 DeepSeek Notes 的 AI 助手，专注帮助用户管理知识、整理笔记、深度思考。今天是 ${new Date().toLocaleDateString('zh-CN')}。你拥有多种工具可以读写用户的笔记库和搜索互联网，请主动使用它们来完成任务。`
    const systemContent = (soul || defaultSoul) + ANTI_HALLUCINATION_SUFFIX

    const ctx = { db: getDatabase(), store }
    loadPluginsFromDb(ctx)   // register any enabled user plugins at run time

    // RAG: inject top-K relevant notes as context before the user message
    const ragBlock = await buildRagContext(ctx.db as Database, message).catch(() => '')

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
      ...(ragBlock ? [{ role: 'system' as const, content: ragBlock }] : []),
      { role: 'user',   content: message }
    ]

    await runAgentLoop(messages, ctx, {
      onDelta:      (text)                    => event.sender.send('agent:delta',       text),
      onToolCall:   (name, args, callId)      => event.sender.send('agent:tool-call',   { name, args, callId }),
      onToolResult: (name, result, err, cid)  => event.sender.send('agent:tool-result', { name, result, isError: err, callId: cid }),
      onDone:       (usage)                   => event.sender.send('agent:done',        usage),
      onError:      (msg)                     => event.sender.send('agent:error',       msg),
      onConfirmNeeded: (name, args) => new Promise<boolean>(resolve => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const responseChannel = `agent:confirm-response:${reqId}`
        const timer = setTimeout(() => {
          ipcMain.removeAllListeners(responseChannel)
          resolve(false)  // timeout → cancel
        }, 60_000)
        ipcMain.once(responseChannel, (_e, confirmed: boolean) => {
          clearTimeout(timer)
          resolve(confirmed)
        })
        event.sender.send('agent:confirm-request', { reqId, name, args })
      }),
      signal: ac.signal
    })

    activeAgents.delete(conversationId)
  })

  // ── Abort a running agent ──────────────────────────────────────────────────
  ipcMain.on('agent:abort', (_, conversationId: string) => {
    activeAgents.get(conversationId)?.abort()
    activeAgents.delete(conversationId)
  })

  // ── List currently available tools (for settings UI) ──────────────────────
  ipcMain.handle('agent:get-tools', () => {
    return toolRegistry.getAll({ enabledOnly: true }).map(t => ({
      name:       t.name,
      emoji:      t.emoji ?? '🔧',
      description: t.schema.description,
      idempotent: t.idempotent ?? false
    }))
  })
}
