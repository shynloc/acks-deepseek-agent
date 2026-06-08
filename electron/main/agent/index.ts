import { ipcMain, type BrowserWindow } from 'electron'
import Store from 'electron-store'
import { getDatabase } from '../db'
import '../tools/index'   // trigger self-registration of all builtin tools
import { runAgentLoop, type ChatMessage } from './loop'
import { toolRegistry } from '../tools/registry'

const store = new Store()

// conversationId → AbortController (so renderer can cancel a running agent)
const activeAgents = new Map<string, AbortController>()

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
    const systemContent = soul ||
      `你是 DeepSeek Notes 的 AI 助手，专注帮助用户管理知识、整理笔记、深度思考。今天是 ${new Date().toLocaleDateString('zh-CN')}。你拥有多种工具可以读写用户的笔记库和搜索互联网，请主动使用它们来完成任务。`

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user',   content: message }
    ]

    const ctx = { db: getDatabase(), store }

    await runAgentLoop(messages, ctx, {
      onDelta:      (text)                    => event.sender.send('agent:delta',       text),
      onToolCall:   (name, args, callId)      => event.sender.send('agent:tool-call',   { name, args, callId }),
      onToolResult: (name, result, err, cid)  => event.sender.send('agent:tool-result', { name, result, isError: err, callId: cid }),
      onDone:       (usage)                   => event.sender.send('agent:done',        usage),
      onError:      (msg)                     => event.sender.send('agent:error',       msg),
      signal:       ac.signal
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
