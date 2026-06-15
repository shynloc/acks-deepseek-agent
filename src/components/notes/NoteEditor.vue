<template>
  <Teleport to="body" :disabled="props.inline">
    <div
      :class="props.inline
        ? 'contents'
        : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'"
      @click.self="props.inline ? undefined : handleClose()"
    >
      <div
        class="bg-white dark:bg-gray-900 flex flex-col overflow-hidden"
        :class="props.inline
          ? 'h-full w-full'
          : 'relative w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl'"
      >

        <!-- ── Title bar ── -->
        <div class="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <input
            v-model="form.title"
            placeholder="笔记标题…"
            class="flex-1 text-lg font-semibold bg-transparent outline-none placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100"
          />

          <!-- Category select -->
          <select
            v-model="form.categoryId"
            class="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none"
          >
            <option value="">无分类</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>

          <!-- Color picker -->
          <div class="flex items-center gap-1">
            <button
              v-for="[key, hex] in colorOptions"
              :key="key"
              class="w-4 h-4 rounded-full border-2 transition-transform hover:scale-125"
              :class="form.color === key ? 'border-gray-600 dark:border-gray-200' : 'border-transparent'"
              :style="hex ? { background: hex } : { background: '#e5e7eb' }"
              :title="key"
              @click="form.color = key"
            />
          </div>

          <!-- Theme -->
          <select
            v-model="currentTheme"
            class="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none"
          >
            <option value="clean">清隽阅读</option>
            <option value="business">商务报告</option>
            <option value="technical">技术文档</option>
            <option value="darkcode">暗夜代码</option>
            <option value="social">社交长图</option>
            <option value="academic">学术论文</option>
            <option value="wechat">公众号</option>
            <option value="magazine">杂志随笔</option>
            <option value="aireport">AI 报告</option>
            <option value="euro">欧式古典</option>
            <option value="cnclassic">中式古典</option>
            <option value="cnvertical">中式竖排</option>
            <option value="poster">前卫海报</option>
          </select>

          <!-- View mode toggle -->
          <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            <button
              v-for="m in viewModes"
              :key="m.key"
              class="px-2 py-1 transition-colors"
              :class="viewMode === m.key ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'"
              @click="viewMode = m.key"
            >{{ m.label }}</button>
          </div>

          <!-- Version history toggle (existing notes only) -->
          <button
            v-if="props.note?.id"
            class="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="历史版本"
            @click="toggleVersions"
          >
            <History class="w-4 h-4" />
          </button>

          <button class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800" @click="handleClose">
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- ── Toolbar ── -->
        <div class="flex items-center gap-1 px-4 py-1.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 shrink-0 flex-wrap">
          <template v-for="item in toolbar" :key="item.label">
            <div v-if="item.sep" class="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
            <button
              v-else
              class="px-2 py-1 rounded text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
              :title="item.label"
              @click="applyFormat(item)"
            >{{ item.icon }}</button>
          </template>

          <div class="ml-auto flex items-center gap-2 text-xs text-gray-400">
            <!-- Image upload button -->
            <button
              class="flex items-center gap-1 px-2 py-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              :class="uploadingImage ? 'opacity-50 cursor-not-allowed' : ''"
              :disabled="uploadingImage"
              title="插入图片（拖拽或粘贴也可）"
              @click="openImagePicker"
            >
              <Loader2 v-if="uploadingImage" class="w-3.5 h-3.5 animate-spin" />
              <ImagePlus v-else class="w-3.5 h-3.5" />
              <span>图片</span>
            </button>
            <!-- Visibility toggle -->
            <button
              class="flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs font-medium"
              :class="form.visibility === 'public'
                ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
              :title="form.visibility === 'public' ? '公开笔记 — 图片上传到图床' : '私有笔记 — 图片上传到 Memos'"
              @click="form.visibility = form.visibility === 'private' ? 'public' : 'private'"
            >
              <Globe v-if="form.visibility === 'public'" class="w-3.5 h-3.5" />
              <Lock  v-else                              class="w-3.5 h-3.5" />
              <span>{{ form.visibility === 'public' ? '公开' : '私有' }}</span>
            </button>
            <span>{{ form.wordCount }}字</span>
          </div>
        </div>

        <!-- ── Tags row ── -->
        <div class="flex items-center gap-2 px-5 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 flex-wrap">
          <Tag class="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <button
            v-for="tag in availableTags"
            :key="tag.id"
            class="text-xs px-2 py-0.5 rounded-full border transition-all"
            :class="isTagSelected(tag.id)
              ? 'border-transparent text-white'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400'"
            :style="isTagSelected(tag.id) ? { background: tag.color } : {}"
            @click="toggleTag(tag)"
          >{{ tag.name }}</button>
          <button
            class="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-all"
            @click="showNewTag = !showNewTag"
          >+ 新标签</button>
          <div v-if="showNewTag" class="flex items-center gap-1">
            <input
              v-model="newTagName"
              placeholder="标签名"
              class="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 w-20 bg-transparent outline-none dark:text-gray-300"
              @keydown.enter="createNewTag"
              @keydown.escape="showNewTag = false"
            />
            <button class="text-xs text-blue-500 hover:text-blue-600" @click="createNewTag">确定</button>
          </div>
        </div>

        <!-- ── Editor body ── -->
        <div class="flex flex-1 overflow-hidden relative">
          <!-- Editor pane -->
          <div
            v-if="viewMode !== 'preview'"
            class="flex flex-col relative"
            :class="viewMode === 'split' ? 'w-1/2 border-r border-gray-200 dark:border-gray-700' : 'w-full'"
            @dragover.prevent="isDraggingOver = true"
            @dragleave="isDraggingOver = false"
            @drop.prevent="handleImageDrop"
          >
            <!-- Drop overlay -->
            <div
              v-if="isDraggingOver"
              class="absolute inset-0 z-10 bg-blue-50/80 dark:bg-blue-900/40 border-2 border-dashed border-blue-400 rounded flex items-center justify-center pointer-events-none"
            >
              <div class="text-blue-500 dark:text-blue-300 text-sm font-medium flex items-center gap-2">
                <ImagePlus class="w-5 h-5" />
                松开鼠标插入图片
              </div>
            </div>
            <textarea
              ref="editorRef"
              v-model="form.content"
              class="flex-1 resize-none p-5 text-sm font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none placeholder-gray-300 dark:placeholder-gray-600 leading-relaxed"
              placeholder="开始写作… 支持 Markdown 语法"
              @input="onContentInput"
              @keydown="handleEditorKeydown"
              @paste="handlePaste"
            />
          </div>

          <!-- Preview pane -->
          <div
            v-if="viewMode !== 'edit'"
            class="flex-1 overflow-y-auto flex flex-col"
            :class="viewMode === 'split' ? '' : 'w-full'"
          >
            <div class="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
              <div
                class="md-preview min-h-full p-6"
                :class="`theme-${currentTheme}`"
                v-html="renderedHtml"
                @click="handlePreviewClick"
              />
            </div>
          </div>

          <!-- ── Version history panel ── -->
          <Transition name="slide-right">
            <div
              v-if="showVersions"
              class="absolute right-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col z-10 shadow-xl"
            >
              <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">历史版本</span>
                <button @click="showVersions = false" class="text-gray-400 hover:text-gray-600"><X class="w-3.5 h-3.5" /></button>
              </div>

              <div class="flex-1 overflow-y-auto">
                <div v-if="versionsLoading" class="p-4 text-center text-xs text-gray-400">加载中…</div>
                <div v-else-if="!versions.length" class="p-4 text-center text-xs text-gray-400">暂无历史版本<br><span class="text-[11px]">编辑并保存后会自动记录版本</span></div>
                <button
                  v-for="v in versions"
                  :key="v.id"
                  class="w-full text-left px-4 py-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  :class="selectedVersionId === v.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
                  @click="previewVersion(v)"
                >
                  <div class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{{ v.title || '无标题' }}</div>
                  <div class="text-[11px] text-gray-400 mt-0.5">{{ formatVersionDate(v.savedAt) }}</div>
                  <button
                    v-if="selectedVersionId === v.id"
                    class="mt-1.5 text-[11px] px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                    @click.stop="restoreVersion(v)"
                  >恢复此版本</button>
                </button>
              </div>

              <!-- Preview banner -->
              <div v-if="previewingVersion" class="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2 shrink-0">
                <span class="flex-1">预览模式：当前显示历史版本</span>
                <button class="underline hover:no-underline" @click="exitPreview">退出预览</button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- ── Footer ── -->
        <div class="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div class="flex items-center gap-3 text-xs text-gray-400">
            <span v-if="form.updatedAt">最后更新 {{ formatDate(form.updatedAt) }}</span>
            <Transition name="autosave">
              <span
                v-if="autoSaveStatus !== 'idle'"
                class="flex items-center gap-1 transition-all"
                :class="autoSaveStatus === 'saved' ? 'text-emerald-500' : 'text-gray-400'"
              >
                <span v-if="autoSaveStatus === 'pending'" class="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                <CheckCircle2 v-else class="w-2.5 h-2.5" />
                {{ autoSaveStatus === 'pending' ? '自动保存中…' : '已自动保存' }}
              </span>
            </Transition>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="handleClose"
            >取消</button>
            <button
              class="px-4 py-1.5 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors flex items-center gap-1.5"
              :disabled="saving"
              @click="handleSave"
            >
              <span v-if="saving" class="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <button
              class="px-4 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1.5"
              :class="wechatCopied
                ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600 dark:hover:text-green-400'"
              :disabled="wechatCopying"
              :title="`以「${themeLabel}」样式复制到微信公众号`"
              @click="handleWechatCopy"
            >
              <span v-if="wechatCopying" class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              <span v-else>{{ wechatCopied ? '✓ 已复制' : '复制到公众号' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { X, Tag, CheckCircle2, History, Lock, Globe, ImagePlus, Loader2 } from '@lucide/vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import '@/assets/markdown-themes/index.css'
import { copyToWeChat } from '@/services/wechatCopy'
import { uploadFile, imageUrl as picbedImageUrl } from '@/services/picbed'
import { useSettingsStore } from '@/stores/settings'
import type { Note, Category, Tag as TagType } from '@/stores/notes'
import { useNotesStore } from '@/stores/notes'

// ── Marked config ─────────────────────────────────────────────────────────────
marked.setOptions({
  highlight: (code: string, lang: string) => {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext'
    return hljs.highlight(code, { language }).value
  },
  breaks: true,
  gfm: true
} as any)

const props = defineProps<{
  note?: Note | null
  categories: Category[]
  availableTags: TagType[]
  inline?: boolean
}>()

const emit = defineEmits<{
  save: [patch: Partial<Note> & { id?: string }]
  autoSave: [patch: Partial<Note> & { id: string }]
  close: []
  createTag: [name: string, color: string]
  openNote: [noteId: string]
}>()

const settings = useSettingsStore()

// ── State ─────────────────────────────────────────────────────────────────────
const editorRef = ref<HTMLTextAreaElement | null>(null)
const saving = ref(false)
const viewMode = ref<'edit' | 'split' | 'preview'>('split')
const currentTheme = ref(localStorage.getItem('noteTheme') ?? 'clean')
const showNewTag = ref(false)
const newTagName = ref('')
const wechatCopying = ref(false)
const wechatCopied = ref(false)
const uploadingCount = ref(0)
const uploadingImage = computed(() => uploadingCount.value > 0)
const isDraggingOver = ref(false)

const THEME_LABELS: Record<string, string> = {
  clean: '清隽阅读', business: '商务报告', technical: '技术文档',
  darkcode: '暗夜代码', social: '社交长图', academic: '学术论文',
  wechat: '公众号', magazine: '杂志随笔', aireport: 'AI报告',
  euro: '欧式古典', cnclassic: '中式古典', cnvertical: '中式竖排', poster: '前卫海报',
}
const themeLabel = computed(() => THEME_LABELS[currentTheme.value] ?? currentTheme.value)

watch(currentTheme, v => localStorage.setItem('noteTheme', v))

const viewModes = [
  { key: 'edit', label: '编辑' },
  { key: 'split', label: '分栏' },
  { key: 'preview', label: '预览' }
]

const form = ref({
  title: '',
  content: '',
  categoryId: '' as string | null,
  color: 'none',
  wordCount: 0,
  updatedAt: 0,
  selectedTagIds: [] as string[],
  visibility: 'private' as 'private' | 'public'
})

const colorOptions: [string, string][] = [
  ['none', ''],
  ['red', '#f87171'],
  ['orange', '#fb923c'],
  ['yellow', '#facc15'],
  ['green', '#4ade80'],
  ['blue', '#60a5fa'],
  ['purple', '#c084fc']
]

// ── Init from prop ─────────────────────────────────────────────────────────────
function populateForm(n?: Note | null) {
  if (n) {
    form.value = {
      title: n.title,
      content: n.content,
      categoryId: n.categoryId ?? '',
      color: n.color ?? 'none',
      wordCount: n.wordCount ?? 0,
      updatedAt: n.updatedAt,
      selectedTagIds: n.tags.map(t => t.id),
      visibility: (n.visibility ?? 'private') as 'private' | 'public'
    }
  } else {
    form.value = { title: '', content: '', categoryId: '', color: 'none', wordCount: 0, updatedAt: 0, selectedTagIds: [], visibility: 'private' }
  }
}

onMounted(() => {
  populateForm(props.note)
  nextTick(() => editorRef.value?.focus())
})

watch(() => props.note, (newNote) => {
  // Skip if the user has unsaved edits in flight — populateForm would overwrite them.
  // autoSave fires every 2 s and the parent may update props.note shortly after;
  // we only want to reset the form when the note changes from the outside (e.g. switching notes).
  if (autoSaveStatus.value === 'pending') return
  populateForm(newNote)
})

// ── Tags ─────────────────────────────────────────────────────────────────────
function isTagSelected(id: string) { return form.value.selectedTagIds.includes(id) }

function toggleTag(tag: TagType) {
  const idx = form.value.selectedTagIds.indexOf(tag.id)
  if (idx === -1) form.value.selectedTagIds.push(tag.id)
  else form.value.selectedTagIds.splice(idx, 1)
}

function createNewTag() {
  const name = newTagName.value.trim()
  if (!name) return
  const colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#e879f9', '#34d399']
  const color = colors[Math.floor(Math.random() * colors.length)]
  emit('createTag', name, color)
  newTagName.value = ''
  showNewTag.value = false
}

// ── Word count ────────────────────────────────────────────────────────────────
function onContentInput() {
  const text = form.value.content
  const chinese = (text.match(/[一-龥]/g) ?? []).length
  const english = (text.match(/\b[a-zA-Z]+\b/g) ?? []).length
  form.value.wordCount = chinese + english
}

// ── Markdown render ───────────────────────────────────────────────────────────
const notesStore = useNotesStore()

// Convert [[Note Title]] to clickable note-link spans before markdown parsing
function resolveWikiLinks(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
    const target = notesStore.notes.find(n => n.title === title.trim())
    if (target) {
      // Render as an inline HTML anchor with data attribute — DOMPurify keeps data-* attrs
      return `<a href="#" class="note-link text-blue-500 hover:underline" data-note-id="${target.id}" data-note-title="${encodeURIComponent(title)}">${title}</a>`
    }
    // Unresolved link — show in orange
    return `<span class="note-link-missing text-orange-400 cursor-default" title="笔记「${title}」不存在">[[${title}]]</span>`
  })
}

const renderedHtml = computed(() => {
  const withLinks = resolveWikiLinks(form.value.content || '*开始写作后，预览会在这里显示…*')
  const raw = marked.parse(withLinks) as string
  return DOMPurify.sanitize(raw, {
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|memos-asset):/i,
    ADD_ATTR: ['data-note-id', 'data-note-title']
  })
})

// Handle clicks inside the preview pane: intercept note-link anchors
function handlePreviewClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('[data-note-id]') as HTMLElement | null
  if (!target) return
  e.preventDefault()
  const noteId = target.dataset.noteId
  if (noteId) emit('openNote', noteId)
}

// ── Image upload ──────────────────────────────────────────────────────────────
function insertAtCursor(text: string) {
  const el = editorRef.value
  if (!el) { form.value.content += text; return }
  const s = el.selectionStart
  const e = el.selectionEnd
  form.value.content = form.value.content.slice(0, s) + text + form.value.content.slice(e)
  nextTick(() => { el.focus(); const p = s + text.length; el.setSelectionRange(p, p) })
}

// Compress image using Canvas API (cross-platform: Chromium supports this on all Electron targets)
async function compressImage(file: File): Promise<File> {
  const MAX_BYTES = 2 * 1024 * 1024   // 2 MB hard cap before upload
  const MAX_DIM   = 2000              // max width or height in pixels
  if (file.size <= MAX_BYTES) return file

  return new Promise((resolve) => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX_DIM || h > MAX_DIM) {
        const r = Math.min(MAX_DIM / w, MAX_DIM / h)
        w = Math.round(w * r); h = Math.round(h * r)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      // PNG → WebP for better compression; preserve JPEG type
      const outType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return }
        const ext  = outType === 'image/jpeg' ? '.jpg' : '.webp'
        const name = file.name.replace(/\.[^.]+$/, '') + ext
        resolve(new File([blob], name, { type: outType }))
      }, outType, 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file) }
    img.src = blobUrl
  })
}

async function uploadImage(file: File) {
  if (!file.type.startsWith('image/')) return
  // Reject files over 10 MB before even trying to compress
  if (file.size > 10 * 1024 * 1024) {
    alert(`图片过大（${(file.size / 1024 / 1024).toFixed(1)} MB），请选择 10 MB 以内的图片。`)
    return
  }
  uploadingCount.value++
  const placeholder = `![上传中…_${Date.now()}_${Math.random().toString(36).slice(2, 6)}]()`
  insertAtCursor(placeholder)
  try {
    const compressed = await compressImage(file)
    let url = ''
    if (form.value.visibility === 'public' && settings.picbedActive) {
      const result = await uploadFile(compressed, { url: settings.picbedUrl, token: settings.picbedToken })
      url = picbedImageUrl(result.key, settings.picbedUrl)
    } else if (settings.memosActive) {
      const buffer = await compressed.arrayBuffer()
      const result = await window.api.memos.uploadResource({ buffer, filename: compressed.name, mimeType: compressed.type })
      url = result.url
    } else {
      form.value.content = form.value.content.replace(placeholder, '')
      alert('请先在「个人中心 → 内置插件」配置 Memos 或图床，才能插入图片。')
      return
    }
    form.value.content = form.value.content.replace(placeholder, `![${compressed.name}](${url})`)
    onContentInput()
  } catch (e: any) {
    form.value.content = form.value.content.replace(placeholder, '')
    alert(`图片上传失败：${e.message}`)
  } finally {
    uploadingCount.value--
  }
}

function handleImageDrop(e: DragEvent) {
  isDraggingOver.value = false
  const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
  for (const f of files) uploadImage(f)
}

function handlePaste(e: ClipboardEvent) {
  const items = Array.from(e.clipboardData?.items ?? [])
  const imageItem = items.find(i => i.type.startsWith('image/'))
  if (!imageItem) return
  e.preventDefault()
  const file = imageItem.getAsFile()
  if (file) uploadImage(file)
}

function openImagePicker() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = () => {
    for (const f of Array.from(input.files ?? [])) uploadImage(f)
  }
  input.click()
}

// ── WeChat copy ───────────────────────────────────────────────────────────────
async function handleWechatCopy() {
  if (wechatCopying.value) return

  // Warn if note contains private Memos images that won't display in WeChat
  const privateImageCount = (form.value.content.match(/memos-asset:\/\//g) ?? []).length
  if (privateImageCount > 0) {
    const proceed = confirm(
      `此笔记包含 ${privateImageCount} 张私有图片（存储在 Memos），发布到微信公众号后读者将无法看到这些图片。\n\n` +
      `提示：将笔记可见性改为「公开」后再插入图片，图片将上传到图床，微信可正常显示。\n\n` +
      `继续复制？`
    )
    if (!proceed) return
  }

  wechatCopying.value = true
  try {
    const isDark = document.documentElement.classList.contains('dark')
    await copyToWeChat(renderedHtml.value, currentTheme.value, isDark)
    wechatCopied.value = true
    setTimeout(() => { wechatCopied.value = false }, 2500)
  } catch (e) {
    console.error('WeChat copy failed:', e)
  } finally {
    wechatCopying.value = false
  }
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
const toolbar = [
  { label: '加粗', icon: 'B', wrap: ['**', '**'] },
  { label: '斜体', icon: 'I', wrap: ['*', '*'] },
  { label: '删除线', icon: 'S̶', wrap: ['~~', '~~'] },
  { sep: true },
  { label: '一级标题', icon: 'H1', prefix: '# ' },
  { label: '二级标题', icon: 'H2', prefix: '## ' },
  { label: '三级标题', icon: 'H3', prefix: '### ' },
  { sep: true },
  { label: '代码', icon: '<>', wrap: ['`', '`'] },
  { label: '代码块', icon: '```', block: true },
  { label: '引用', icon: '❝', prefix: '> ' },
  { sep: true },
  { label: '无序列表', icon: '•', prefix: '- ' },
  { label: '有序列表', icon: '1.', prefix: '1. ' },
  { label: '任务列表', icon: '☐', prefix: '- [ ] ' },
  { sep: true },
  { label: '链接', icon: '🔗', snippet: '[链接文字](url)' },
  { label: '图片链接', icon: '🖼', snippet: '![图片描述](图片URL)' },
  { label: '分割线', icon: '—', snippet: '\n---\n' }
]

function applyFormat(item: any) {
  const el = editorRef.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const sel = form.value.content.slice(start, end)
  let insert = ''
  let cursorOffset = 0

  if (item.snippet) {
    insert = item.snippet
    cursorOffset = insert.length
  } else if (item.block) {
    insert = '```\n' + (sel || '代码') + '\n```'
    cursorOffset = insert.length
  } else if (item.wrap) {
    const [l, r] = item.wrap
    insert = l + (sel || item.label) + r
    cursorOffset = sel ? insert.length : l.length + item.label.length
  } else if (item.prefix) {
    insert = item.prefix + (sel || item.label)
    cursorOffset = insert.length
  }

  const before = form.value.content.slice(0, start)
  const after = form.value.content.slice(end)
  form.value.content = before + insert + after
  onContentInput()
  nextTick(() => {
    el.focus()
    const pos = start + cursorOffset
    el.setSelectionRange(pos, pos)
  })
}

// ── Tab key in editor ─────────────────────────────────────────────────────────
function handleEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = editorRef.value!
    const s = el.selectionStart
    form.value.content = form.value.content.slice(0, s) + '  ' + form.value.content.slice(s)
    nextTick(() => el.setSelectionRange(s + 2, s + 2))
  }
}

// ── Version history ───────────────────────────────────────────────────────────
interface NoteVersion { id: string; noteId: string; title: string; savedAt: number }
const showVersions = ref(false)
const versions = ref<NoteVersion[]>([])
const versionsLoading = ref(false)
const selectedVersionId = ref<string | null>(null)
const previewingVersion = ref(false)
let savedForm: typeof form.value | null = null

async function toggleVersions() {
  showVersions.value = !showVersions.value
  if (showVersions.value && props.note?.id) {
    versionsLoading.value = true
    const rows = await window.api.db.noteVersions.list(props.note.id) as NoteVersion[]
    versions.value = rows
    versionsLoading.value = false
  }
}

async function previewVersion(v: NoteVersion) {
  selectedVersionId.value = v.id
  if (!previewingVersion.value) {
    savedForm = { ...form.value }
    previewingVersion.value = true
  }
  const full = await window.api.db.noteVersions.get(v.id) as (NoteVersion & { content: string }) | null
  if (full) {
    form.value.title = full.title
    form.value.content = full.content
  }
}

function exitPreview() {
  if (savedForm) {
    form.value = { ...savedForm }
    savedForm = null
  }
  previewingVersion.value = false
  selectedVersionId.value = null
}

async function restoreVersion(v: NoteVersion) {
  const full = await window.api.db.noteVersions.get(v.id) as (NoteVersion & { content: string }) | null
  if (!full) return
  form.value.title = full.title
  form.value.content = full.content
  savedForm = null
  previewingVersion.value = false
  selectedVersionId.value = null
  showVersions.value = false
  // Trigger save to persist restore
  await handleSave()
}

function formatVersionDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Auto-save (2s debounce, existing notes only) ──────────────────────────────
const autoSaveStatus = ref<'idle' | 'pending' | 'saved'>('idle')
let autoSaveTimer: ReturnType<typeof setTimeout>
// Skip the first trigger caused by populateForm initializing the form values
let autoSaveReady = false
setTimeout(() => { autoSaveReady = true }, 100)

watch(
  () => [form.value.title, form.value.content, form.value.categoryId, form.value.color, form.value.visibility],
  () => {
    if (!props.note?.id || !autoSaveReady) return
    autoSaveStatus.value = 'pending'
    clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      const tags = props.availableTags.filter(t => form.value.selectedTagIds.includes(t.id))
      emit('autoSave', {
        id: props.note!.id,
        title: form.value.title || '无标题',
        content: form.value.content,
        categoryId: form.value.categoryId || null,
        color: form.value.color,
        wordCount: form.value.wordCount,
        visibility: form.value.visibility,
        tags
      })
      autoSaveStatus.value = 'saved'
      setTimeout(() => { autoSaveStatus.value = 'idle' }, 2000)
    }, 2000)
  },
  { deep: true }
)

// ── Save / Close ──────────────────────────────────────────────────────────────
async function handleSave() {
  saving.value = true
  const tags = props.availableTags.filter(t => form.value.selectedTagIds.includes(t.id))
  emit('save', {
    id: props.note?.id,
    title: form.value.title || '无标题',
    content: form.value.content,
    categoryId: form.value.categoryId || null,
    color: form.value.color,
    wordCount: form.value.wordCount,
    visibility: form.value.visibility,
    tags
  })
  saving.value = false
}

function handleClose() {
  emit('close')
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Escape key closes — but NOT when focus is inside a text field (textarea / input).
// Without this guard, pressing Escape to dismiss IME suggestions while typing
// would accidentally close the entire editor.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  const t = e.target as Element | null
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return
  handleClose()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(autoSaveTimer)
})
</script>

<style scoped>
.autosave-enter-active, .autosave-leave-active { transition: opacity 0.3s ease; }
.autosave-enter-from, .autosave-leave-to { opacity: 0; }
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.2s ease, opacity 0.2s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); opacity: 0; }
</style>
