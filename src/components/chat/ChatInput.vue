<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { Send, Square, Globe, BookOpen, X, Paperclip, FileText, Image as ImageIcon, AlertCircle, CheckCircle, Loader } from '@lucide/vue'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import NotePickerPanel from './NotePickerPanel.vue'
import AgentSelector from './AgentSelector.vue'
import { getAgent } from '@/data/agents'
import { parseFile, type ParseResult } from '@/services/fileParser'
import type { Note } from '@/stores/notes'

const props = defineProps<{ initialText?: string }>()
const emit = defineEmits<{ consumed: [] }>()

const chat = useChatStore()
const settings = useSettingsStore()
const text = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const showNotePicker = ref(false)
const webSearchOn    = ref(false)
const fileInputRef   = ref<HTMLInputElement | null>(null)

// ── Agent selection ───────────────────────────────────────────────────────────
const selectedAgentId = ref<string | null>(null)

// Sync selectedAgentId with the current conversation's agentId
watch(() => chat.currentConversationId, (newId) => {
  if (newId) {
    const conv = chat.conversations.find(c => c.id === newId)
    selectedAgentId.value = conv?.agentId ?? null
  } else {
    selectedAgentId.value = null
  }
}, { immediate: true })

// Lock agent selector once conversation has messages
const agentLocked = computed(() => chat.messages.length > 0)

// ── Draft auto-save (2s debounce, keyed by conversationId) ───────────────────
const DRAFT_KEY = () => `draft:${chat.currentConversationId ?? '__new__'}`
let draftTimer: ReturnType<typeof setTimeout> | null = null

function saveDraft() {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    window.api.config.set(DRAFT_KEY(), text.value || null)
  }, 2000)
}

async function restoreDraft() {
  const saved = await window.api.config.get(DRAFT_KEY()) as string | null
  if (saved && !text.value) {
    text.value = saved
    nextTick(() => autoResize())
  }
}

function clearDraft() {
  if (draftTimer) clearTimeout(draftTimer)
  window.api.config.set(DRAFT_KEY(), null)
}

// Restore draft when conversation changes
watch(() => chat.currentConversationId, () => {
  text.value = ''
  restoreDraft()
})

onMounted(restoreDraft)
onUnmounted(() => { if (draftTimer) clearTimeout(draftTimer) })

// Consume initial text from parent (e.g. note context) — overrides draft
watch(() => props.initialText, (val) => {
  if (val) {
    text.value = val
    nextTick(() => { autoResize(); textarea.value?.focus() })
    emit('consumed')
  }
}, { immediate: true })

// ── Attachment state ──────────────────────────────────────────────────────────
interface Attachment {
  id: string
  name: string
  type: string          // e.g. "PDF", "Word 文档", "图片（OCR）"
  icon: 'file' | 'image'
  status: 'parsing' | 'ready' | 'error'
  result?: ParseResult
  preview?: string      // base64 data URL for image thumbnails
  error?: string
}

const attachments = ref<Attachment[]>([])

// ── Note context chips ────────────────────────────────────────────────────────
const injectedNotes = ref<{ id: string; title: string }[]>([])

const canSend = computed(() =>
  (text.value.trim().length > 0 || attachments.value.some(a => a.status === 'ready')) &&
  !!settings.apiKey && !chat.isStreaming
)

// Trigger draft save on input
watch(text, (val) => { if (val) saveDraft() })

function autoResize(): void {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

async function send(): Promise<void> {
  if (!canSend.value) return
  const userText = text.value.trim()

  // Build hidden context prefix from ready attachments (sent to AI, not shown in bubble)
  const readyAtts = attachments.value.filter(a => a.status === 'ready')
  let contextPrefix = ''
  for (const att of readyAtts) {
    if (att.result?.text) {
      const label = att.result.visionUsed
        ? `【图片（AI 视觉分析）：${att.name}】`
        : att.result.isOcr
          ? `【图片（OCR 文字）：${att.name}】`
          : `【附件：${att.name}（${att.type}）】`
      contextPrefix += `${label}\n\n${att.result.text}\n\n---\n\n`
    }
  }

  // Build display-only attachment metadata for the bubble
  const displayAttachments = readyAtts.map(a => ({
    name:       a.name,
    type:       a.type,
    preview:    a.preview,
    visionUsed: a.result?.visionUsed,
    isOcr:      a.result?.isOcr
  }))

  // Also carry over injected note titles (they're already in text.value as blocks)
  // Those blocks stay in userText for now — note injection keeps its current behavior

  clearDraft()
  text.value = ''
  injectedNotes.value = []
  attachments.value = []
  if (textarea.value) textarea.value.style.height = 'auto'

  const agentDef = selectedAgentId.value ? getAgent(selectedAgentId.value) : null
  await chat.sendMessage(userText, {
    contextPrefix:     contextPrefix || undefined,
    attachments:       displayAttachments.length ? displayAttachments : undefined,
    agentId:           agentDef?.id,
    agentSystemPrompt: agentDef?.systemPrompt,
  })
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' || e.isComposing) return
  if (e.shiftKey) { e.preventDefault(); send(); return }
  // plain Enter → let the browser insert a newline (default behavior)
}

// ── File attachment ───────────────────────────────────────────────────────────
const SUPPORTED_EXTS = [
  'image/*',
  '.txt', '.md', '.html', '.htm', '.csv',
  '.pdf', '.docx', '.xlsx', '.xls', '.pptx'
].join(',')

function openFilePicker() { fileInputRef.value?.click() }

async function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  for (const file of Array.from(files)) {
    await addAttachment(file)
  }
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function addAttachment(file: File) {
  const id = crypto.randomUUID()
  const isImage = file.type.startsWith('image/')
  const att: Attachment = {
    id, name: file.name, type: isImage ? '图片' : '文件',
    icon: isImage ? 'image' : 'file',
    status: 'parsing'
  }
  attachments.value.push(att)

  // Generate base64 preview for images (shown in input area & message bubble)
  if (isImage) {
    const reader = new FileReader()
    reader.onload = e => { att.preview = e.target?.result as string }
    reader.readAsDataURL(file)
  }

  // Build parse options — pass vision config if key is set
  const parseOptions = settings.visionActive
    ? {
        vision: {
          apiKey: settings.visionApiKey,
          baseUrl: settings.visionBaseUrl,
          model: settings.visionModel
        },
        imagePrompt: '请详细描述这张图片的内容，包括文字、图表、布局、颜色和所有可见信息'
      }
    : undefined

  try {
    const result = await parseFile(file, parseOptions)
    att.type   = result.type
    att.result = result
    att.status = 'ready'
    // NOTE: text is NOT injected into textarea — context is passed at send time
  } catch (err: any) {
    att.status = 'error'
    att.error  = err.message
  }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter(a => a.id !== id)
}

// ── Note picker ───────────────────────────────────────────────────────────────
function onPickNote(note: Note) {
  showNotePicker.value = false
  const block = `【引用笔记：${note.title}】\n\n${note.content}\n\n---\n\n`
  text.value = block + text.value
  injectedNotes.value.push({ id: note.id, title: note.title })
  nextTick(() => {
    autoResize()
    textarea.value?.focus()
    textarea.value?.setSelectionRange(text.value.length, text.value.length)
  })
}

function removeInjectedNote(noteId: string) {
  const note = injectedNotes.value.find(n => n.id === noteId)
  if (!note) return
  const start = text.value.indexOf(`【引用笔记：${note.title}】`)
  if (start !== -1) {
    const end = text.value.indexOf('---\n\n', start)
    if (end !== -1) text.value = text.value.slice(0, start) + text.value.slice(end + 5)
  }
  injectedNotes.value = injectedNotes.value.filter(n => n.id !== noteId)
  nextTick(autoResize)
}
</script>

<template>
  <div class="border-t border-zinc-200 dark:border-zinc-800 flex-none relative">
    <!-- Note Picker Panel -->
    <NotePickerPanel v-if="showNotePicker" @pick="onPickNote" @close="showNotePicker = false" />

    <!-- Hidden file input -->
    <input ref="fileInputRef" type="file" multiple :accept="SUPPORTED_EXTS" class="hidden" @change="onFileChange" />

    <!-- Attachment chips -->
    <div
      v-if="injectedNotes.length || attachments.length"
      class="flex flex-wrap gap-1.5 px-4 pt-3 pb-0"
    >
      <!-- Note chips -->
      <span
        v-for="n in injectedNotes"
        :key="n.id"
        class="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
      >
        <BookOpen class="w-2.5 h-2.5" />{{ n.title }}
        <button class="ml-0.5 hover:text-red-500" @click="removeInjectedNote(n.id)"><X class="w-2.5 h-2.5" /></button>
      </span>

      <!-- File / Image chips -->
      <div
        v-for="att in attachments"
        :key="att.id"
        class="relative flex items-center gap-1.5 rounded-xl border transition-colors overflow-hidden"
        :class="{
          'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 text-[11px]': !att.preview,
          'border-violet-200 dark:border-violet-700': att.status === 'ready' && att.result?.visionUsed && !att.preview,
          'border-emerald-200 dark:border-emerald-700': att.status === 'ready' && !att.result?.visionUsed && !att.preview,
          'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20': att.status === 'error',
          'p-0': !!att.preview
        }"
      >
        <!-- Image thumbnail preview -->
        <template v-if="att.preview">
          <div class="relative w-16 h-16 shrink-0">
            <img :src="att.preview" class="w-full h-full object-cover rounded-xl" />
            <!-- overlay while parsing -->
            <div v-if="att.status === 'parsing'" class="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
              <Loader class="w-4 h-4 text-white animate-spin" />
            </div>
            <!-- done indicator -->
            <div v-else-if="att.status === 'ready'" class="absolute bottom-0.5 right-0.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
              <CheckCircle class="w-2.5 h-2.5 text-white" />
            </div>
            <!-- vision badge -->
            <div v-if="att.status === 'ready' && att.result?.visionUsed" class="absolute top-0.5 left-0.5 bg-violet-600 text-white text-[8px] px-1 rounded font-medium leading-4">AI</div>
          </div>
          <button class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors" @click="removeAttachment(att.id)">
            <X class="w-2.5 h-2.5 text-white" />
          </button>
        </template>

        <!-- Non-image file chip -->
        <template v-else>
          <Loader v-if="att.status === 'parsing'" class="w-2.5 h-2.5 animate-spin shrink-0" />
          <FileText v-else class="w-2.5 h-2.5 shrink-0" />
          <span class="max-w-[140px] truncate">{{ att.name }}</span>
          <span v-if="att.status === 'parsing'" class="opacity-50">解析中…</span>
          <span v-else-if="att.status === 'ready'" class="opacity-50">{{ att.type }}</span>
          <span v-if="att.result?.warning" class="cursor-help" :title="att.result.warning"><AlertCircle class="w-2.5 h-2.5 text-amber-500" /></span>
          <span v-if="att.status === 'error'" class="cursor-help" :title="att.error"><AlertCircle class="w-2.5 h-2.5" /></span>
          <button v-if="att.status !== 'parsing'" class="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-500" @click="removeAttachment(att.id)"><X class="w-2.5 h-2.5" /></button>
        </template>
      </div>
    </div>

    <div class="p-4 pt-3">
      <!-- Toolbar -->
      <div class="flex items-center gap-1 mb-2 px-0.5">
        <!-- Agent selector (only when no messages yet) -->
        <AgentSelector
          v-model="selectedAgentId"
          :disabled="agentLocked"
        />

        <div class="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

        <button
          class="flex items-center gap-1 text-xs py-1 px-2 rounded-lg transition-colors"
          :class="showNotePicker
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
          @click="showNotePicker = !showNotePicker"
        ><BookOpen class="w-3.5 h-3.5" />引用笔记</button>

        <button
          class="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 py-1 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :title="`支持：PDF · Word · Excel · PPT · HTML · TXT · MD · 图片（OCR）`"
          @click="openFilePicker"
        ><Paperclip class="w-3.5 h-3.5" />附件</button>

        <button
          class="flex items-center gap-1 text-xs py-1 px-2 rounded-lg transition-colors"
          :class="webSearchOn && settings.webSearchActive
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
          :title="settings.webSearchActive ? (webSearchOn ? '点击关闭联网搜索' : '点击开启联网搜索') : !settings.tavilyEnabled ? '请在个人中心配置 Tavily API Key' : '联网搜索插件已关闭'"
          @click="settings.webSearchActive ? (webSearchOn = !webSearchOn) : undefined"
        >
          <Globe class="w-3.5 h-3.5" />联网搜索
          <span v-if="!settings.webSearchActive" class="text-zinc-300 dark:text-zinc-600">·{{ settings.tavilyEnabled ? '已禁用' : '未配置' }}</span>
        </button>

        <span v-if="!settings.apiKey" class="ml-auto text-xs text-amber-500 dark:text-amber-400">
          ⚠ 请先在个人中心配置 API Key
        </span>
      </div>

      <!-- Input row -->
      <div class="flex gap-2 items-end">
        <div class="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
          <textarea
            ref="textarea"
            v-model="text"
            @input="autoResize"
            @keydown="onKeydown"
            rows="1"
            placeholder="在这里输入消息… (Shift+Enter 发送)"
            :disabled="chat.isStreaming"
            class="w-full bg-transparent outline-none resize-none text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 leading-relaxed select-text disabled:opacity-50"
            style="max-height: 160px"
          />
        </div>
        <button
          v-if="!chat.isStreaming"
          @click="send"
          :disabled="!canSend"
          class="bg-blue-600 text-white rounded-xl px-4 py-2.5 flex items-center gap-1.5 text-sm font-medium flex-none transition-all"
          :class="canSend ? 'hover:bg-blue-700 active:bg-blue-800' : 'opacity-40 cursor-not-allowed'"
        ><Send class="w-3.5 h-3.5" />发送</button>
        <button
          v-else
          @click="chat.stopStreaming()"
          class="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-xl px-4 py-2.5 flex items-center gap-1.5 text-sm font-medium flex-none transition-all"
        ><Square class="w-3.5 h-3.5" />停止</button>
      </div>
    </div>
  </div>
</template>
