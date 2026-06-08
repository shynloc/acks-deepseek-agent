import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokensUsed: number
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  model: string
  createdAt: number
  updatedAt: number
  systemPrompt?: string
}

export interface ToolCallRecord {
  callId: string
  name: string
  emoji: string
  args: Record<string, unknown>
  result?: string
  isError?: boolean
  status: 'calling' | 'done' | 'error'
}

// Emoji map for tool names
const TOOL_EMOJI: Record<string, string> = {
  search_notes: '🔍', get_note: '📄', list_notes: '📚',
  create_note: '✍️', update_note: '✏️',
  web_search: '🌐', get_datetime: '🕐', get_stats: '📊'
}

export const useChatStore = defineStore('chat', () => {
  const conversations           = ref<Conversation[]>([])
  const currentConversationId   = ref<string | null>(null)
  const messages                = ref<Message[]>([])
  const isStreaming              = ref(false)
  const currentToolCalls        = ref<ToolCallRecord[]>([])
  const pendingNoteContext       = ref<{ title: string; content: string } | null>(null)

  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value) ?? null
  )

  function genId(): string { return crypto.randomUUID() }

  // ── Conversations ──────────────────────────────────────────────────────────

  async function loadConversations(): Promise<void> {
    conversations.value = await window.api.db.conversations.list() as Conversation[]
  }

  async function createConversation(): Promise<Conversation> {
    const settings = useSettingsStore()
    const conv: Conversation = {
      id: genId(), title: '新对话', model: settings.model,
      createdAt: Date.now(), updatedAt: Date.now()
    }
    await window.api.db.conversations.create(conv)
    conversations.value.unshift(conv)
    currentConversationId.value = conv.id
    messages.value = []
    return conv
  }

  async function selectConversation(id: string): Promise<void> {
    currentConversationId.value = id
    messages.value = await window.api.db.messages.list(id) as Message[]
  }

  async function deleteConversation(id: string): Promise<void> {
    await window.api.db.conversations.delete(id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
      messages.value = []
    }
  }

  async function renameConversation(id: string, title: string): Promise<void> {
    await window.api.db.conversations.update(id, { title })
    const conv = conversations.value.find(c => c.id === id)
    if (conv) conv.title = title
  }

  // ── Send message (agent loop) ──────────────────────────────────────────────

  async function sendMessage(content: string): Promise<void> {
    const settings = useSettingsStore()
    if (!settings.apiKey) throw new Error('请先配置 API Key')

    let convId = currentConversationId.value
    if (!convId) {
      const conv = await createConversation()
      convId = conv.id
    }

    // Add user message
    const userMsg: Message = { id: genId(), role: 'user', content, tokensUsed: 0, createdAt: Date.now() }
    messages.value.push(userMsg)
    await window.api.db.messages.create(convId, userMsg)

    // Placeholder assistant message (built up by delta events)
    const assistantMsg: Message = { id: genId(), role: 'assistant', content: '', tokensUsed: 0, createdAt: Date.now() }
    messages.value.push(assistantMsg)

    isStreaming.value = true
    currentToolCalls.value = []

    // Build history (exclude system msgs, keep last 20 user/assistant turns)
    const history = messages.value
      .filter(m => m.role !== 'system' && m.id !== assistantMsg.id)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))

    // Pop the user message we just added (agent:run adds it itself)
    history.pop()

    let finalUsage = { promptTokens: 0, completionTokens: 0 }
    let hadError   = false

    // Register IPC event listeners
    const offDelta = window.api.agent.onDelta(text => {
      assistantMsg.content += text
      messages.value = [...messages.value]
    })

    const offToolCall = window.api.agent.onToolCall(tc => {
      currentToolCalls.value.push({
        callId:  tc.callId,
        name:    tc.name,
        emoji:   TOOL_EMOJI[tc.name] ?? '🔧',
        args:    tc.args as Record<string, unknown>,
        status:  'calling'
      })
      currentToolCalls.value = [...currentToolCalls.value]
    })

    const offToolResult = window.api.agent.onToolResult(tr => {
      const rec = currentToolCalls.value.find(r => r.callId === tr.callId)
      if (rec) {
        rec.result  = tr.result
        rec.isError = tr.isError
        rec.status  = tr.isError ? 'error' : 'done'
        currentToolCalls.value = [...currentToolCalls.value]
      }
    })

    const offDone = window.api.agent.onDone(usage => {
      finalUsage = usage
    })

    const offError = window.api.agent.onError(msg => {
      hadError = true
      if (!assistantMsg.content) {
        assistantMsg.content = `❌ ${msg}`
        messages.value = [...messages.value]
      }
    })

    try {
      await window.api.agent.run({
        message:        content,
        conversationId: convId,
        history,
        soulContent:    settings.soulContent
      })
    } catch (e: any) {
      if (!hadError) {
        assistantMsg.content = assistantMsg.content || `❌ ${e?.message ?? '请求失败'}`
        messages.value = [...messages.value]
      }
    } finally {
      // Clean up all listeners
      offDelta(); offToolCall(); offToolResult(); offDone(); offError()

      isStreaming.value = false
      assistantMsg.tokensUsed = finalUsage.completionTokens
      messages.value = [...messages.value]

      // Persist assistant message
      if (assistantMsg.content) {
        await window.api.db.messages.create(convId!, assistantMsg)
      }

      // Update conversation timestamp
      const now = Date.now()
      await window.api.db.conversations.update(convId!, { updatedAt: now })
      const conv = conversations.value.find(c => c.id === convId)
      if (conv) conv.updatedAt = now

      // Auto-title on first exchange
      const conv2 = conversations.value.find(c => c.id === convId)
      if (conv2?.title === '新对话' && messages.value.filter(m => m.role === 'user').length === 1) {
        autoTitle(convId!, content, assistantMsg.content)
      }
    }
  }

  function stopStreaming(): void {
    const convId = currentConversationId.value
    if (convId) window.api.agent.abort(convId)
    isStreaming.value = false
  }

  // ── Auto title ─────────────────────────────────────────────────────────────

  async function autoTitle(convId: string, userMsg: string, assistantReply: string): Promise<void> {
    const settings = useSettingsStore()
    if (!settings.apiKey) return
    try {
      const res = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{
            role: 'user',
            content: `根据以下对话内容，生成一个简洁的标题（10字以内，不加引号）：\n用户：${userMsg.slice(0, 200)}\nAI：${assistantReply.slice(0, 200)}`
          }],
          max_tokens: 30,
          stream: false
        }),
        signal: AbortSignal.timeout(8000)
      })
      if (res.ok) {
        const data  = await res.json()
        const title = (data.choices?.[0]?.message?.content?.trim() ?? '').slice(0, 30)
        if (title) await renameConversation(convId, title)
      }
    } catch { /* silent */ }
  }

  return {
    conversations, currentConversationId, messages,
    isStreaming, currentToolCalls, currentConversation, pendingNoteContext,
    loadConversations, createConversation, selectConversation,
    deleteConversation, renameConversation, sendMessage, stopStreaming
  }
})
