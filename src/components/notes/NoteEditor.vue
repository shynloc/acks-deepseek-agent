<template>
  <!-- Modal backdrop -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="handleClose"
    >
      <div class="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

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
            <option value="github">GitHub</option>
            <option value="dark">Dark</option>
            <option value="minimal">Minimal</option>
            <option value="academic">Academic</option>
            <option value="terminal">Terminal</option>
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
        <div class="flex items-center gap-1 px-4 py-1.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-850 shrink-0 flex-wrap">
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
            class="flex flex-col"
            :class="viewMode === 'split' ? 'w-1/2 border-r border-gray-200 dark:border-gray-700' : 'w-full'"
          >
            <textarea
              ref="editorRef"
              v-model="form.content"
              class="flex-1 resize-none p-5 text-sm font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none placeholder-gray-300 dark:placeholder-gray-600 leading-relaxed"
              placeholder="开始写作… 支持 Markdown 语法"
              @input="onContentInput"
              @keydown="handleEditorKeydown"
            />
          </div>

          <!-- Preview pane -->
          <div
            v-if="viewMode !== 'edit'"
            class="flex-1 overflow-y-auto p-5"
            :class="viewMode === 'split' ? '' : 'w-full'"
          >
            <div
              class="md-preview"
              :class="`theme-${currentTheme}`"
              v-html="renderedHtml"
            />
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
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { X, Tag, CheckCircle2, History } from '@lucide/vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import '@/assets/markdown-themes/index.css'
import type { Note, Category, Tag as TagType } from '@/stores/notes'

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
}>()

const emit = defineEmits<{
  save: [patch: Partial<Note> & { id?: string }]
  autoSave: [patch: Partial<Note> & { id: string }]
  close: []
  createTag: [name: string, color: string]
}>()

// ── State ─────────────────────────────────────────────────────────────────────
const editorRef = ref<HTMLTextAreaElement | null>(null)
const saving = ref(false)
const viewMode = ref<'edit' | 'split' | 'preview'>('split')
const currentTheme = ref('github')
const showNewTag = ref(false)
const newTagName = ref('')

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
  selectedTagIds: [] as string[]
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
      selectedTagIds: n.tags.map(t => t.id)
    }
  } else {
    form.value = { title: '', content: '', categoryId: '', color: 'none', wordCount: 0, updatedAt: 0, selectedTagIds: [] }
  }
}

onMounted(() => {
  populateForm(props.note)
  nextTick(() => editorRef.value?.focus())
})

watch(() => props.note, populateForm)

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
const renderedHtml = computed(() => {
  const raw = marked.parse(form.value.content || '*开始写作后，预览会在这里显示…*') as string
  return DOMPurify.sanitize(raw)
})

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
  () => [form.value.title, form.value.content, form.value.categoryId, form.value.color],
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

// Escape key closes
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
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
