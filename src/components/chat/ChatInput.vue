<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import {
  Send, Square, Globe, BookOpen, X, Paperclip, FileText,
  Image as ImageIcon, AlertCircle, CheckCircle, Loader,
  Maximize2, Minimize2, GripHorizontal
} from '@lucide/vue'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import NotePickerPanel from './NotePickerPanel.vue'
import AgentSelector from './AgentSelector.vue'
import { getAgent } from '@/data/agents'
import { parseFile, type ParseResult } from '@/services/fileParser'
import type { Note } from '@/stores/notes'

const props = defineProps<{ initialText?: string }>()
const emit = defineEmits<{ consumed: [] }>()

const chat     = useChatStore()
const settings = useSettingsStore()
const text     = ref('')
const textarea        = ref<HTMLTextAreaElement | null>(null)
const expandTextarea  = ref<HTMLTextAreaElement | null>(null)
const showNotePicker  = ref(false)
const webSearchOn     = ref(false)
const fileInputRef    = ref<HTMLInputElement | null>(null)
const expandMode      = ref(false)

// ── Resizable input height ────────────────────────────────────────────────────
const DEFAULT_MAX_H = 160
const maxInputHeight = ref(
  parseInt(localStorage.getItem('chatInputMaxH') ?? String(DEFAULT_MAX_H))
)
const isDraggingHandle = ref(false)

function startResizeDrag(e: MouseEvent) {
  e.preventDefault()
  isDraggingHandle.value = true
  const startY  = e.clientY
  const startH  = maxInputHeight.value

  const onMove = (ev: MouseEvent) => {
    // drag UP → increase height (startY - ev.clientY is positive when moving up)
    const newH = Math.min(480, Math.max(80, startH + (startY - ev.clientY)))
    maxInputHeight.value = newH
    localStorage.setItem('chatInputMaxH', String(newH))
    autoResize()
  }
  const onUp = () => {
    isDraggingHandle.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function autoResize(): void {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, maxInputHeight.value) + 'px'
}

// ── Expand mode ───────────────────────────────────────────────────────────────
function openExpand() {
  expandMode.value = true
  nextTick(() => {
    if (expandTextarea.value) {
      expandTextarea.value.focus()
      const len = expandTextarea.value.value.length
      expandTextarea.value.setSelectionRange(len, len)
    }
  })
}

function closeExpand() {
  expandMode.value = false
  nextTick(() => { autoResize(); textarea.value?.focus() })
}

function onExpandKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); closeExpand(); return }
  if (e.key === 'Enter' && e.shiftKey && !e.isComposing) { e.preventDefault(); send(); return }
}

// ── Agent selection ───────────────────────────────────────────────────────────
const selectedAgentId = ref<string | null>(null)

watch(() => chat.currentConversationId, (newId) => {
  if (newId) {
    const conv = chat.conversations.find(c => c.id === newId)
    selectedAgentId.value = conv?.agentId ?? null
  } else {
    selectedAgentId.value = null
  }
}, { immediate: true })

const agentLocked = computed(() => chat.messages.length > 0)

// ── Draft auto-save ───────────────────────────────────────────────────────────
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

watch(() => chat.currentConversationId, () => { text.value = ''; restoreDraft() })
onMounted(restoreDraft)
onUnmounted(() => { if (draftTimer) clearTimeout(draftTimer) })

watch(() => props.initialText, (val) => {
  if (val) {
    text.value = val
    nextTick(() => { autoResize(); textarea.value?.focus() })
    emit('consumed')
  }
}, { immediate: true })

// ── Attachment state ──────────────────────────────────────────────────────────
interface Attachment {
  id: string; name: string; type: string
  icon: 'file' | 'image'; status: 'parsing' | 'ready' | 'error'
  result?: ParseResult; preview?: string; error?: string
}

const attachments    = ref<Attachment[]>([])
const injectedNotes  = ref<{ id: string; title: string }[]>([])

const canSend = computed(() =>
  (text.value.trim().length > 0 || attachments.value.some(a => a.status === 'ready')) &&
  !!settings.apiKey && !chat.isStreaming
)

watch(text, (val) => { if (val) saveDraft() })

// ── Send ──────────────────────────────────────────────────────────────────────
async function send(): Promise<void> {
  if (!canSend.value) return

  const userText   = text.value.trim()
  const readyAtts  = attachments.value.filter(a => a.status === 'ready')
  let contextPrefix = ''
  for (const att of readyAtts) {
    if (att.result?.text) {
      const label = att.result.visionUsed
        ? `【图片（AI 视觉分析）：${att.name}】`
        : att.result.isOcr ? `【图片（OCR 文字）：${att.name}】`
        : `【附件：${att.name}（${att.type}）】`
      contextPrefix += `${label}\n\n${att.result.text}\n\n---\n\n`
    }
  }

  const displayAttachments = readyAtts.map(a => ({
    name: a.name, type: a.type, preview: a.preview,
    visionUsed: a.result?.visionUsed, isOcr: a.result?.isOcr
  }))

  clearDraft()
  text.value = ''
  injectedNotes.value = []
  attachments.value = []
  if (textarea.value) textarea.value.style.height = 'auto'
  if (expandMode.value) closeExpand()

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
}

// ── File attachment ───────────────────────────────────────────────────────────
const SUPPORTED_EXTS = [
  'image/*', '.txt', '.md', '.html', '.htm', '.csv',
  '.pdf', '.docx', '.xlsx', '.xls', '.pptx'
].join(',')

function openFilePicker() { fileInputRef.value?.click() }

async function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  for (const file of Array.from(files)) await addAttachment(file)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function addAttachment(file: File) {
  const id = crypto.randomUUID()
  const isImage = file.type.startsWith('image/')
  const att: Attachment = {
    id, name: file.name, type: isImage ? '图片' : '文件',
    icon: isImage ? 'image' : 'file', status: 'parsing'
  }
  attachments.value.push(att)

  if (isImage) {
    const reader = new FileReader()
    reader.onload = e => { att.preview = e.target?.result as string }
    reader.readAsDataURL(file)
  }

  const parseOptions = settings.visionActive ? {
    vision: { apiKey: settings.visionApiKey, baseUrl: settings.visionBaseUrl, model: settings.visionModel },
    imagePrompt: '请详细描述这张图片的内容，包括文字、图表、布局、颜色和所有可见信息'
  } : undefined

  try {
    const result  = await parseFile(file, parseOptions)
    att.type   = result.type
    att.result = result
    att.status = 'ready'
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

    <!-- ── Drag resize handle ── -->
    <div
      class="group flex items-center justify-center w-full h-3 cursor-ns-resize select-none hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
      :class="isDraggingHandle ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
      @mousedown="startResizeDrag"
      title="拖动调整输入框高度"
    >
      <GripHorizontal
        class="w-4 h-3 transition-colors"
        :class="isDraggingHandle
          ? 'text-blue-400'
          : 'text-zinc-300 dark:text-zinc-700 group-hover:text-blue-400'"
      />
    </div>

    <!-- Attachment chips -->
    <div
      v-if="injectedNotes.length || attachments.length"
      class="flex flex-wrap gap-1.5 px-4 pt-2 pb-0"
    >
      <span
        v-for="n in injectedNotes" :key="n.id"
        class="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
      >
        <BookOpen class="w-2.5 h-2.5" />{{ n.title }}
        <button class="ml-0.5 hover:text-red-500" @click="removeInjectedNote(n.id)"><X class="w-2.5 h-2.5" /></button>
      </span>

      <div
        v-for="att in attachments" :key="att.id"
        class="relative flex items-center gap-1.5 rounded-xl border transition-colors overflow-hidden"
        :class="{
          'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 text-[11px]': !att.preview,
          'border-violet-200 dark:border-violet-700': att.status === 'ready' && att.result?.visionUsed && !att.preview,
          'border-emerald-200 dark:border-emerald-700': att.status === 'ready' && !att.result?.visionUsed && !att.preview,
          'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20': att.status === 'error',
          'p-0': !!att.preview
        }"
      >
        <template v-if="att.preview">
          <div class="relative w-16 h-16 shrink-0">
            <img :src="att.preview" class="w-full h-full object-cover rounded-xl" />
            <div v-if="att.status === 'parsing'" class="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
              <Loader class="w-4 h-4 text-white animate-spin" />
            </div>
            <div v-else-if="att.status === 'ready'" class="absolute bottom-0.5 right-0.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
              <CheckCircle class="w-2.5 h-2.5 text-white" />
            </div>
            <div v-if="att.status === 'ready' && att.result?.visionUsed" class="absolute top-0.5 left-0.5 bg-violet-600 text-white text-[8px] px-1 rounded font-medium leading-4">AI</div>
          </div>
          <button class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors" @click="removeAttachment(att.id)">
            <X class="w-2.5 h-2.5 text-white" />
          </button>
        </template>
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

    <div class="px-4 pb-4 pt-2">
      <!-- Toolbar -->
      <div class="flex items-center gap-1 mb-2 px-0.5">
        <AgentSelector v-model="selectedAgentId" :disabled="agentLocked" />
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
          :title="settings.webSearchActive
            ? (webSearchOn ? '点击关闭联网搜索' : '点击开启联网搜索')
            : !settings.tavilyEnabled ? '请在个人中心配置 Tavily API Key' : '联网搜索插件已关闭'"
          @click="settings.webSearchActive ? (webSearchOn = !webSearchOn) : undefined"
        >
          <Globe class="w-3.5 h-3.5" />联网搜索
          <span v-if="!settings.webSearchActive" class="text-zinc-300 dark:text-zinc-600">·{{ settings.tavilyEnabled ? '已禁用' : '未配置' }}</span>
        </button>

        <!-- Expand button -->
        <button
          class="ml-auto flex items-center gap-1 text-xs py-1 px-2 rounded-lg transition-colors"
          :class="expandMode
            ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
            : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
          title="展开全屏输入（Esc 关闭）"
          @click="openExpand"
        ><Maximize2 class="w-3.5 h-3.5" /></button>

        <span v-if="!settings.apiKey" class="text-xs text-amber-500 dark:text-amber-400">
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
            :style="{ maxHeight: maxInputHeight + 'px' }"
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

      <!-- Character count hint (shows when text is long) -->
      <div v-if="text.length > 200" class="mt-1.5 flex items-center justify-end gap-3">
        <span class="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
          {{ text.length.toLocaleString() }} 字符
        </span>
      </div>
    </div>
  </div>

  <!-- ── Expand modal (bottom sheet) ── -->
  <Teleport to="body">
    <Transition name="expand-sheet">
      <div
        v-if="expandMode"
        class="fixed inset-0 z-50 flex flex-col justify-end"
        @keydown.esc="closeExpand"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          @click="closeExpand"
        />

        <!-- Sheet -->
        <div class="relative bg-white dark:bg-zinc-900 rounded-t-2xl shadow-2xl flex flex-col"
          style="height: 70vh; max-height: 70vh"
        >
          <!-- Sheet handle -->
          <div class="flex items-center justify-center pt-3 pb-1 shrink-0">
            <div class="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          </div>

          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-2.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">编写消息</span>
              <span v-if="text.length > 0" class="text-xs text-zinc-400 tabular-nums">{{ text.length.toLocaleString() }} 字符</span>
            </div>
            <div class="flex items-center gap-2">
              <!-- Attachment chips summary in header -->
              <span v-if="injectedNotes.length" class="text-xs text-blue-500 flex items-center gap-1">
                <BookOpen class="w-3 h-3" />{{ injectedNotes.length }} 笔记
              </span>
              <span v-if="attachments.filter(a=>a.status==='ready').length" class="text-xs text-emerald-500 flex items-center gap-1">
                <Paperclip class="w-3 h-3" />{{ attachments.filter(a=>a.status==='ready').length }} 附件
              </span>
              <button
                @click="closeExpand"
                class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="收起（Esc）"
              >
                <Minimize2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Expand textarea -->
          <div class="flex-1 overflow-hidden px-5 py-3">
            <textarea
              ref="expandTextarea"
              v-model="text"
              @keydown="onExpandKeydown"
              :disabled="chat.isStreaming"
              placeholder="在这里输入大段内容… Shift+Enter 发送，Esc 收起"
              class="w-full h-full bg-transparent outline-none resize-none text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 leading-relaxed select-text disabled:opacity-50"
            />
          </div>

          <!-- Footer -->
          <div class="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-5 py-3 flex items-center gap-2">
            <!-- Toolbar shortcuts -->
            <button
              class="flex items-center gap-1 text-xs py-1 px-2 rounded-lg transition-colors"
              :class="showNotePicker
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
              @click="showNotePicker = !showNotePicker"
            ><BookOpen class="w-3.5 h-3.5" />引用笔记</button>

            <button
              class="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 py-1 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              @click="openFilePicker"
            ><Paperclip class="w-3.5 h-3.5" />附件</button>

            <button
              class="flex items-center gap-1 text-xs py-1 px-2 rounded-lg transition-colors"
              :class="webSearchOn && settings.webSearchActive
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
              @click="settings.webSearchActive ? (webSearchOn = !webSearchOn) : undefined"
            ><Globe class="w-3.5 h-3.5" />联网</button>

            <div class="flex-1" />

            <span class="text-xs text-zinc-400 mr-2 hidden sm:block">Shift+Enter 发送</span>

            <button
              @click="send"
              :disabled="!canSend"
              class="bg-blue-600 text-white rounded-xl px-5 py-2 flex items-center gap-1.5 text-sm font-medium transition-all"
              :class="canSend ? 'hover:bg-blue-700 active:bg-blue-800' : 'opacity-40 cursor-not-allowed'"
            ><Send class="w-3.5 h-3.5" />发送</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.expand-sheet-enter-active,
.expand-sheet-leave-active {
  transition: opacity 0.2s ease;
}
.expand-sheet-enter-active .relative,
.expand-sheet-leave-active .relative {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.expand-sheet-enter-from,
.expand-sheet-leave-to {
  opacity: 0;
}
.expand-sheet-enter-from .relative,
.expand-sheet-leave-to .relative {
  transform: translateY(100%);
}
</style>
