import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'
import { useSkillsStore, type ProposedSkill } from './skills'

export interface MessageAttachment {
  name:        string
  type:        string     // "图片（MiMo）", "PDF" etc.
  preview?:    string     // base64 data URL, in-memory only (not persisted)
  visionUsed?: boolean
  isOcr?:      boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string          // full content including hidden 【附件】 context sent to AI
  displayText?: string     // what to show in the bubble (just user's typed text), in-memory only
  attachments?: MessageAttachment[]  // in-memory only, not persisted
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
  const pendingSkillExtract      = ref<ProposedSkill | null>(null)

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

  async function sendMessage(
    content: string,
    opts?: { contextPrefix?: string; attachments?: MessageAttachment[] }
  ): Promise<void> {
    const settings  = useSettingsStore()
    const skillsStore = useSkillsStore()
    if (!settings.apiKey) throw new Error('请先配置 API Key')

    let convId = currentConversationId.value
    if (!convId) {
      const conv = await createConversation()
      convId = conv.id
    }

    // Build the full content for the API (includes attachment context prefix)
    const apiContent = opts?.contextPrefix
      ? opts.contextPrefix + (content ? '\n\n' + content : '')
      : content

    // Add user message — store full apiContent but also keep displayText + attachments in memory
    const userMsg: Message = {
      id: genId(), role: 'user',
      content:     apiContent,
      displayText: content || undefined,
      attachments: opts?.attachments?.length ? opts.attachments : undefined,
      tokensUsed:  0, createdAt: Date.now()
    }
    messages.value.push(userMsg)
    await window.api.db.messages.create(convId, userMsg)

    // Placeholder assistant message (built up by delta events)
    const assistantMsg: Message = { id: genId(), role: 'assistant', content: '', tokensUsed: 0, createdAt: Date.now() }
    messages.value.push(assistantMsg)

    isStreaming.value = true
    currentToolCalls.value = []
    pendingSkillExtract.value = null

    // Build history (exclude system msgs, keep last 20 user/assistant turns)
    const history = messages.value
      .filter(m => m.role !== 'system' && m.id !== assistantMsg.id)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))

    // Pop the user message we just added (agent:run adds it itself)
    history.pop()

    // Match skills for this input → inject hints into soul (match on user's typed text, not context)
    await skillsStore.load()
    const matchedSkills = skillsStore.matchForInput(content)
    const skillHints    = skillsStore.buildSystemHintFor(matchedSkills)
    const soulWithSkills = settings.soulContent + skillHints

    // Increment usage count for matched skills (fire-and-forget)
    for (const s of matchedSkills) skillsStore.incrementUsage(s.id)

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
        message:        apiContent,
        conversationId: convId,
        history,
        soulContent:    soulWithSkills
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
        autoTitle(convId!, content || apiContent, assistantMsg.content)
      }

      // Auto-extract skill when 3+ tool calls were made (fire-and-forget)
      const toolSnapshot = [...currentToolCalls.value]
      if (toolSnapshot.length >= 3 && settings.apiKey && assistantMsg.content) {
        extractSkill(toolSnapshot, assistantMsg.content, settings)
          .then(proposed => { if (proposed) pendingSkillExtract.value = proposed })
          .catch(() => {})
      }
    }
  }

  function stopStreaming(): void {
    const convId = currentConversationId.value
    if (convId) window.api.agent.abort(convId)
    isStreaming.value = false
  }

  // ── Skill auto-extract ────────────────────────────────────────────────────

  async function extractSkill(
    toolCalls: ToolCallRecord[],
    finalReply: string,
    settings: ReturnType<typeof useSettingsStore>
  ): Promise<ProposedSkill | null> {
    const seq = toolCalls.map(t =>
      `- ${t.emoji} ${t.name}(${JSON.stringify(t.args)}) → ${t.isError ? '失败' : '成功'}`
    ).join('\n')

    const prompt = `分析以下 AI 工具调用序列，判断是否值得提炼为可复用技能。

工具调用序列：
${seq}

最终回复摘要：${finalReply.slice(0, 300)}

如果值得保存为技能，以 JSON 返回（字段如下）；如果不值得，返回 null。
{
  "name": "简短技能名称（10字以内）",
  "description": "一句话说明这个技能能做什么",
  "trigger_keywords": ["触发词1", "触发词2", "触发词3"],
  "system_hint": "执行此类任务时，AI 应遵循的额外指令（2-3句）"
}`

    try {
      const res = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          stream: false
        }),
        signal: AbortSignal.timeout(12000)
      })
      if (!res.ok) return null
      const data  = await res.json()
      const text  = data.choices?.[0]?.message?.content?.trim() ?? ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return null
      const parsed = JSON.parse(match[0])
      if (!parsed?.name) return null
      return {
        name:             parsed.name,
        description:      parsed.description ?? '',
        triggerKeywords:  Array.isArray(parsed.trigger_keywords) ? parsed.trigger_keywords : [],
        systemHint:       parsed.system_hint ?? '',
        toolSequenceSummary: toolCalls.map(t => `${t.emoji} ${t.name}`).join(' → ')
      }
    } catch { return null }
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
    isStreaming, currentToolCalls, pendingSkillExtract, currentConversation, pendingNoteContext,
    loadConversations, createConversation, selectConversation,
    deleteConversation, renameConversation, sendMessage, stopStreaming
  }
})
