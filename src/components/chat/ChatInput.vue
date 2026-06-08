<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { Send, Square, Globe, BookOpen, X, Paperclip, FileText, Image as ImageIcon, AlertCircle, CheckCircle, Loader } from '@lucide/vue'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import NotePickerPanel from './NotePickerPanel.vue'
import { parseFile, type ParseResult } from '@/services/fileParser'
import type { Note } from '@/stores/notes'

const props = defineProps<{ initialText?: string }>()
const emit = defineEmits<{ consumed: [] }>()

const chat = useChatStore()
const settings = useSettingsStore()
const text = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const showNotePicker = ref(false)
const webSearchOn = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Consume initial text from parent (e.g. note context)
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
  error?: string
}

const attachments = ref<Attachment[]>([])

// ── Note context chips ────────────────────────────────────────────────────────
const injectedNotes = ref<{ id: string; title: string }[]>([])

const canSend = computed(() =>
  (text.value.trim().length > 0 || attachments.value.some(a => a.status === 'ready')) &&
  !!settings.apiKey && !chat.isStreaming
)

function autoResize(): void {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

async function send(): Promise<void> {
  if (!canSend.value) return
  const content = text.value.trim()
  text.value = ''
  injectedNotes.value = []
  attachments.value = []
  if (textarea.value) textarea.value.style.height = 'auto'
  await chat.sendMessage(content)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
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

  // Build parse options — pass vision config if key is set
  const parseOptions = settings.visionEnabled
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
    att.type = result.type
    att.result = result
    att.status = 'ready'

    // Inject text context into the input
    if (result.text) {
      const label = result.isOcr
        ? `【图片OCR：${file.name}】`
        : `【附件：${file.name}（${result.type}）】`
      const block = `${label}\n\n${result.text}\n\n---\n\n`
      text.value = block + text.value
      nextTick(autoResize)
    }
  } catch (err: any) {
    att.status = 'error'
    att.error = err.message
  }
}

function removeAttachment(id: string) {
  const att = attachments.value.find(a => a.id === id)
  if (!att) return

  if (att.result?.text) {
    // Find and remove the injected block from text
    const label = att.result.isOcr
      ? `【图片OCR：${att.name}】`
      : `【附件：${att.name}（${att.type}）】`
    const start = text.value.indexOf(label)
    if (start !== -1) {
      const end = text.value.indexOf('---\n\n', start)
      if (end !== -1) text.value = text.value.slice(0, start) + text.value.slice(end + 5)
    }
    nextTick(autoResize)
  }

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

      <!-- File chips -->
      <span
        v-for="att in attachments"
        :key="att.id"
        class="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors"
        :class="{
          'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400': att.status === 'parsing',
          'bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400': att.status === 'ready' && att.result?.visionUsed,
          'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400': att.status === 'ready' && !att.result?.visionUsed,
          'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400': att.status === 'error'
        }"
      >
        <Loader v-if="att.status === 'parsing'" class="w-2.5 h-2.5 animate-spin" />
        <ImageIcon v-else-if="att.icon === 'image'" class="w-2.5 h-2.5 shrink-0" />
        <FileText v-else class="w-2.5 h-2.5 shrink-0" />

        <span class="max-w-[120px] truncate">{{ att.name }}</span>
        <span v-if="att.status === 'parsing'" class="opacity-60">解析中…</span>
        <span v-else-if="att.status === 'ready'" class="opacity-60">{{ att.type }}</span>

        <!-- Warning tooltip -->
        <span
          v-if="att.status === 'ready' && att.result?.warning"
          class="cursor-help"
          :title="att.result.warning"
        ><AlertCircle class="w-2.5 h-2.5 text-amber-500" /></span>

        <!-- Error detail -->
        <span v-if="att.status === 'error'" class="cursor-help" :title="att.error">
          <AlertCircle class="w-2.5 h-2.5" />
        </span>

        <!-- No-text warning for OCR failure -->
        <span
          v-if="att.status === 'ready' && att.result?.isOcr && !att.result?.text"
          class="text-amber-500 ml-0.5"
          title="未识别到文字，DeepSeek 不支持图像理解"
        >⚠</span>

        <button
          v-if="att.status !== 'parsing'"
          class="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-500 transition-colors"
          @click="removeAttachment(att.id)"
        ><X class="w-2.5 h-2.5" /></button>
      </span>
    </div>

    <div class="p-4 pt-3">
      <!-- Toolbar -->
      <div class="flex items-center gap-1 mb-2 px-0.5">
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
          :class="webSearchOn && settings.tavilyEnabled
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
          :title="settings.tavilyEnabled ? (webSearchOn ? '点击关闭联网搜索' : '点击开启联网搜索') : '请在个人中心配置 Tavily API Key'"
          @click="settings.tavilyEnabled ? (webSearchOn = !webSearchOn) : undefined"
        >
          <Globe class="w-3.5 h-3.5" />联网搜索
          <span v-if="!settings.tavilyEnabled" class="text-zinc-300 dark:text-zinc-600">·未配置</span>
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
            placeholder="在这里输入消息… (Shift+Enter 换行)"
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
