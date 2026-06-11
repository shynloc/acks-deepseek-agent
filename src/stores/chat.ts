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

export interface Artifact {
  id:       string
  name:     string        // filename
  filePath: string        // absolute local path
  kind:     'docx' | 'xlsx' | 'pptx' | 'html' | 'md' | 'txt' | 'file'
  msgId?:   string        // which assistant message created it
  createdAt: number
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
  agentId?: string
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
  web_search: '🌐', get_datetime: '🕐', get_stats: '📊',
  save_memory: '🧠', recall_memories: '💭', delete_memory: '🗑️',
  generate_docx: '📝', generate_document: '📄', generate_spreadsheet: '📊',
  create_pptx: '📊'
}

export const useChatStore = defineStore('chat', () => {
  const conversations           = ref<Conversation[]>([])
  const conversationsLoading    = ref(true)
  const currentConversationId   = ref<string | null>(null)
  const messages                = ref<Message[]>([])
  const isStreaming              = ref(false)
  const currentToolCalls        = ref<ToolCallRecord[]>([])
  const pendingNoteContext       = ref<{ title: string; content: string } | null>(null)
  const pendingSkillExtract      = ref<ProposedSkill | null>(null)
  // Conversations where skill extraction was already offered (saved or dismissed)
  const skillExtractedConvIds    = new Set<string>()
  // Artifacts generated in current session (in-memory, reset on conversation switch)
  const sessionArtifacts         = ref<Artifact[]>([])

  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value) ?? null
  )

  function genId(): string { return crypto.randomUUID() }

  // ── Conversations ──────────────────────────────────────────────────────────

  async function loadConversations(): Promise<void> {
    conversationsLoading.value = true
    try {
      conversations.value = await window.api.db.conversations.list() as Conversation[]
    } finally {
      conversationsLoading.value = false
    }
  }

  async function createConversation(opts?: { agentId?: string; systemPrompt?: string }): Promise<Conversation> {
    const settings = useSettingsStore()
    const conv: Conversation = {
      id: genId(), title: '新对话', model: settings.model,
      createdAt: Date.now(), updatedAt: Date.now(),
      agentId:      opts?.agentId      ?? undefined,
      systemPrompt: opts?.systemPrompt ?? undefined,
    }
    await window.api.db.conversations.create(conv)
    conversations.value.unshift(conv)
    currentConversationId.value = conv.id
    messages.value = []
    sessionArtifacts.value = []
    return conv
  }

  async function selectConversation(id: string): Promise<void> {
    currentConversationId.value = id
    messages.value = await window.api.db.messages.list(id) as Message[]
    sessionArtifacts.value = []
  }

  function addArtifact(a: Omit<Artifact, 'id' | 'createdAt'>): void {
    sessionArtifacts.value.unshift({ ...a, id: genId(), createdAt: Date.now() })
  }

  async function deleteConversation(id: string): Promise<void> {
    await window.api.db.conversations.delete(id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
      messages.value = []
      sessionArtifacts.value = []
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
    opts?: { contextPrefix?: string; attachments?: MessageAttachment[]; agentId?: string; agentSystemPrompt?: string }
  ): Promise<void> {
    const settings  = useSettingsStore()
    const skillsStore = useSkillsStore()
    if (!settings.apiKey) throw new Error('请先配置 API Key')

    let convId = currentConversationId.value
    if (!convId) {
      const conv = await createConversation(
        opts?.agentId ? { agentId: opts.agentId, systemPrompt: opts.agentSystemPrompt } : undefined
      )
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

    // Build user context block
    const userName    = (settings as any).userName ?? ''
    const userRole    = (settings as any).userRole ?? ''
    const userContext = (settings as any).userContext ?? ''
    let userBlock = ''
    if (userName || userRole || userContext) {
      const parts: string[] = []
      if (userName && userRole) parts.push(`姓名：${userName} | 职业：${userRole}`)
      else if (userName) parts.push(`姓名：${userName}`)
      else if (userRole) parts.push(`职业：${userRole}`)
      if (userContext) parts.push(`背景：${userContext}`)
      userBlock = `# 关于用户\n${parts.join('\n')}\n\n---\n\n`
    }

    // 3-tier context loading: Pinned + Keyword-matched + High-importance recent
    let memoriesBlock = ''
    try {
      const mems = await (window.api.db as any).memories.loadContext(content) as any[]
      if (mems.length) {
        const categoryLabel: Record<string, string> = {
          user: '用户', preference: '偏好', project: '项目', general: '通用'
        }
        const lines = mems.map((m: any) => {
          const pin  = m.isPinned ? '📌' : ''
          const cat  = categoryLabel[m.category] ?? m.category
          return `- ${pin}[${cat}] ${m.content}`
        })
        memoriesBlock = `# 记忆上下文\n${lines.join('\n')}\n\n---\n\n`
      }
    } catch { /* memories table may not exist yet on first run */ }

    // Prepend agent persona if this conversation has one
    const conv = conversations.value.find(c => c.id === convId)
    const agentPrefix = conv?.systemPrompt ? conv.systemPrompt + '\n\n---\n\n' : ''
    const soulWithSkills = memoriesBlock + userBlock + agentPrefix + settings.soulContent + skillHints

    // Increment usage count for matched skills (fire-and-forget)
    for (const s of matchedSkills) skillsStore.incrementUsage(s.id)

    let finalUsage = { promptTokens: 0, completionTokens: 0 }
    let hadError   = false

    // IPC race-condition fix: agent:delta and agent:done travel through the same send
    // channel (FIFO), but the agent:run invoke response travels through a DIFFERENT channel.
    // If the invoke response arrives first, calling offDelta() in finally would remove the
    // listener before the last delta events are processed. Fix: do listener cleanup INSIDE
    // the onDone handler (same channel, always arrives after all preceding deltas), with
    // the finally block as a fallback for abort/error paths where onDone may not fire.
    let _off: (() => void)[] = []
    const doCleanup = () => { _off.forEach(f => f()); _off = [] }

    // Register IPC event listeners
    _off.push(window.api.agent.onDelta(text => {
      const streamMsg = messages.value[messages.value.length - 1]
      if (!streamMsg || streamMsg.id !== assistantMsg.id) return
      if (text === '') {
        streamMsg.content = ''
      } else {
        streamMsg.content += text
      }
    }))

    _off.push(window.api.agent.onToolCall(tc => {
      currentToolCalls.value.push({
        callId:  tc.callId,
        name:    tc.name,
        emoji:   TOOL_EMOJI[tc.name] ?? '🔧',
        args:    tc.args as Record<string, unknown>,
        status:  'calling'
      })
      currentToolCalls.value = [...currentToolCalls.value]
    }))

    _off.push(window.api.agent.onToolResult(tr => {
      const rec = currentToolCalls.value.find(r => r.callId === tr.callId)
      if (rec) {
        rec.result  = tr.result
        rec.isError = tr.isError
        rec.status  = tr.isError ? 'error' : 'done'
        currentToolCalls.value = [...currentToolCalls.value]
      }
      if (!tr.isError && tr.result) {
        for (const artifact of parseArtifactsFromResult(tr.name, tr.result)) {
          addArtifact(artifact)
        }
        // Memory toast
        if (tr.name === 'save_memory') {
          try {
            const r = JSON.parse(tr.result)
            if (r.success) useToastStore().info('🧠 已记住')
          } catch { /* ignore */ }
        }
      }
    }))

    _off.push(window.api.agent.onDone(usage => {
      finalUsage = usage
      // Clean up inside the IPC handler so all preceding deltas on the same channel
      // are guaranteed to have been processed already.
      doCleanup()
    }))

    _off.push(window.api.agent.onError(msg => {
      hadError = true
      const errMsg = messages.value[messages.value.length - 1]
      if (errMsg?.id === assistantMsg.id) {
        // Append error after existing content so partial results aren't lost
        errMsg.content = errMsg.content
          ? errMsg.content + `\n\n> ❌ ${msg}`
          : `❌ ${msg}`
      }
    }))

    try {
      await window.api.agent.run({
        message:        apiContent,
        conversationId: convId,
        history,
        soulContent:    soulWithSkills
      })
    } catch (e: any) {
      if (!hadError) {
        const errMsg = messages.value[messages.value.length - 1]
        if (errMsg?.id === assistantMsg.id) {
          errMsg.content = errMsg.content || `❌ ${e?.message ?? '请求失败'}`
        }
      }
    } finally {
      // Fallback cleanup for abort/error paths where onDone may not have fired
      doCleanup()

      isStreaming.value = false
      const doneMsg = messages.value[messages.value.length - 1]
      if (doneMsg?.id === assistantMsg.id) {
        doneMsg.tokensUsed = finalUsage.completionTokens
      }

      // Persist assistant message
      const finalContent = messages.value.find(m => m.id === assistantMsg.id)?.content ?? ''
      if (finalContent) {
        await window.api.db.messages.create(convId!, { ...assistantMsg, content: finalContent })
      }

      // Update conversation timestamp
      const now = Date.now()
      await window.api.db.conversations.update(convId!, { updatedAt: now })
      const conv = conversations.value.find(c => c.id === convId)
      if (conv) conv.updatedAt = now

      // Auto-title: trigger on 2nd exchange
      const conv2 = conversations.value.find(c => c.id === convId)
      const userCount = messages.value.filter(m => m.role === 'user').length
      if (conv2?.title === '新对话' && userCount === 2) {
        autoTitle(convId!, messages.value, finalContent)
      }

      // Auto-extract skill: only once per conversation
      const toolSnapshot = [...currentToolCalls.value]
      if (
        toolSnapshot.length >= 3 &&
        settings.apiKey &&
        finalContent &&
        convId && !skillExtractedConvIds.has(convId)
      ) {
        skillExtractedConvIds.add(convId)
        extractSkill(toolSnapshot, finalContent, settings)
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

  // ── Parse file artifacts from tool result text ─────────────────────────────
  // Returns ALL files mentioned in a single tool result (e.g. docx + html from one call)

  function parseArtifactsFromResult(
    _toolName: string,
    result: string
  ): Omit<Artifact, 'id' | 'createdAt'>[] {
    const homeDir = window.api.env.homeDir
    // Match patterns: 文件：xxx.ext  文件名：xxx.ext  路径：~/Desktop/xxx.ext  路径：/Users/.../xxx.ext
    const re = /(?:文件[名路径]?|路径)[：:]\s*([^\n\r]+?\.(docx|xlsx|pptx|html|md|txt|csv|json|pdf))/gi
    const artifacts: Omit<Artifact, 'id' | 'createdAt'>[] = []
    const seen = new Set<string>()

    for (const m of result.matchAll(re)) {
      const rawPath = m[1].trim()
      // Expand ~ to real home dir (tools use app.getPath('home') which == homedir())
      const fullPath = rawPath.startsWith('~/')
        ? homeDir + rawPath.slice(1)
        : rawPath.startsWith('/')
          ? rawPath
          : `${homeDir}/Desktop/${rawPath}`

      const name = fullPath.split('/').pop()!
      if (seen.has(name)) continue
      seen.add(name)

      const ext  = (name.split('.').pop() ?? '').toLowerCase()
      const kind = (['docx','xlsx','pptx','html','md','txt'].includes(ext) ? ext : 'file') as Artifact['kind']
      artifacts.push({ name, filePath: fullPath, kind })
    }
    return artifacts
  }

  // ── Auto title ─────────────────────────────────────────────────────────────

  async function autoTitle(convId: string, msgs: Message[], assistantReply: string): Promise<void> {
    const settings = useSettingsStore()
    if (!settings.apiKey) return
    // Build context from last 2 rounds
    const context = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-4)
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}：${(m.displayText ?? m.content).slice(0, 150)}`)
      .join('\n')
    try {
      const res = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{
            role: 'user',
            content: `根据以下对话，生成一个简洁标题（10字以内，不加引号，不加标点）：\n${context}`
          }],
          max_tokens: 30,
          stream: false
        }),
        signal: AbortSignal.timeout(8000)
      })
      if (res.ok) {
        const data  = await res.json()
        const title = (data.choices?.[0]?.message?.content?.trim() ?? '').replace(/["""''「」《》【】]/g, '').slice(0, 20)
        if (title) await renameConversation(convId, title)
      }
    } catch { /* silent */ }
  }

  function markSkillDone(convId: string | null) {
    if (convId) skillExtractedConvIds.add(convId)
    pendingSkillExtract.value = null
  }

  return {
    conversations, conversationsLoading, currentConversationId, messages,
    isStreaming, currentToolCalls, pendingSkillExtract, currentConversation, pendingNoteContext,
    sessionArtifacts,
    loadConversations, createConversation, selectConversation,
    deleteConversation, renameConversation, sendMessage, stopStreaming, addArtifact,
    markSkillDone
  }
})
