<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import {
  MessageSquare, BookOpen, ExternalLink, Trash2, X, FileText, FileSpreadsheet,
  Presentation, FolderOpen, Bot, ChevronRight, ChevronLeft, PanelRight,
  Search, Download, ChevronUp, ChevronDown, Bookmark
} from '@lucide/vue'
import { getAgent } from '@/data/agents'
import ChatHistory from '@/components/chat/ChatHistory.vue'
import MessageBubble from '@/components/chat/MessageBubble.vue'
import ToolCallBubble from '@/components/chat/ToolCallBubble.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import SaveNoteDialog from '@/components/chat/SaveNoteDialog.vue'
import SkillDialog from '@/components/skills/SkillDialog.vue'
import { useChatStore, type Message, type Artifact } from '@/stores/chat'
import { useSkillsStore } from '@/stores/skills'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import type { Note } from '@/stores/notes'
import { useRouter } from 'vue-router'

const chat       = useChatStore()
const skills     = useSkillsStore()
const settings   = useSettingsStore()
const router     = useRouter()
const messagesEl = ref<HTMLElement | null>(null)

// ── File drag-and-drop to analyze ─────────────────────────────────────────
const fileDragging = ref(false)

const READABLE_EXTS = new Set([
  'txt','md','markdown','json','csv','xml','yaml','yml','toml','ini','log',
  'py','js','ts','jsx','tsx','sh','bash','zsh','bat','ps1',
  'html','htm','css','scss','sass','sql','r','go','rs','java','cpp','c','h'
])

async function handleFileDrop(e: DragEvent) {
  fileDragging.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length) return

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!READABLE_EXTS.has(ext)) {
      pendingInput.value += `[不支持的文件类型：${file.name}，请拖入文本格式文件]\n`
      continue
    }
    if (file.size > 5 * 1024 * 1024) {
      pendingInput.value += `[文件过大：${file.name}（${(file.size/1024/1024).toFixed(1)} MB），最大 5 MB]\n`
      continue
    }
    const text = await file.text()
    const truncated = text.length > 15000
    const preview = text.slice(0, 15000) + (truncated ? '\n\n[文件已截断…]' : '')
    pendingInput.value += `【文件：${file.name}】\n\`\`\`\n${preview}\n\`\`\`\n\n`
  }
}

// ── Save note dialog ───────────────────────────────────────────────────────
const savingMessage = ref<Message | null>(null)

// ── Skill extract dialog ────────────────────────────────────────────────────
const showSkillDialog  = ref(false)
function openSkillDialog()  { showSkillDialog.value = true }
function dismissSkillExtract() {
  chat.markSkillDone(chat.currentConversationId)
  showSkillDialog.value = false
}
async function saveExtractedSkill(data: any) {
  await skills.create({ ...data, toolSequence: null })
  chat.markSkillDone(chat.currentConversationId)
  showSkillDialog.value = false
}

// ── Session notes ───────────────────────────────────────────────────────────
const sessionNotes = ref<Note[]>([])

// ── Shortcuts (pinned notes from Notebook) ──────────────────────────────────
const shortcuts = ref<{ noteId: string; title: string }[]>([])

async function loadShortcuts() {
  const raw = (await window.api.db.shortcuts.list()) as any[]
  shortcuts.value = raw.map(s => ({ noteId: s.noteId, title: s.title }))
}

function openShortcutNote(noteId: string) {
  // Navigate to Notebook and open the note
  router.push({ path: '/notebook', query: { openNote: noteId } })
}

onMounted(async () => {
  await settings.load()
  await chat.loadConversations()
  await loadShortcuts()

  if (chat.pendingNoteContext) {
    const { title, content } = chat.pendingNoteContext
    chat.pendingNoteContext = null
    await chat.createConversation()
    pendingInput.value = `【引用笔记：${title}】\n\n${content}\n\n---\n\n`
  }
})

const pendingInput = ref('')

// ── Message search ───────────────────────────────────────────────────────────
const searchVisible  = ref(false)
const searchQuery    = ref('')
const searchMatchIdx = ref(0)
const searchInputEl  = ref<HTMLInputElement | null>(null)

const searchMatchIds = computed<string[]>(() => {
  if (!searchQuery.value.trim()) return []
  const q = searchQuery.value.toLowerCase()
  return chat.messages
    .filter(m => m.role !== 'system' && (m.displayText ?? m.content).toLowerCase().includes(q))
    .map(m => m.id)
})

watch(searchMatchIds, () => { searchMatchIdx.value = 0; scrollToMatch(0) })

function openSearch() {
  searchVisible.value = true
  nextTick(() => searchInputEl.value?.focus())
}
function closeSearch() {
  searchVisible.value = false
  searchQuery.value = ''
}
function scrollToMatch(idx: number) {
  const id = searchMatchIds.value[idx]
  if (!id) return
  nextTick(() => {
    const el = messagesEl.value?.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}
function prevMatch() {
  if (!searchMatchIds.value.length) return
  searchMatchIdx.value = (searchMatchIdx.value - 1 + searchMatchIds.value.length) % searchMatchIds.value.length
  scrollToMatch(searchMatchIdx.value)
}
function nextMatch() {
  if (!searchMatchIds.value.length) return
  searchMatchIdx.value = (searchMatchIdx.value + 1) % searchMatchIds.value.length
  scrollToMatch(searchMatchIdx.value)
}
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { closeSearch(); return }
  if (e.key === 'Enter') { e.shiftKey ? prevMatch() : nextMatch() }
}

// Global Cmd+F / Ctrl+F to open search
function onGlobalKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f' && chat.currentConversationId) {
    e.preventDefault()
    openSearch()
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKey))

// ── Export conversation ──────────────────────────────────────────────────────
const toast = useToastStore()
async function exportConversation() {
  if (!chat.currentConversationId) return
  const r = await (window.api.db as any).export.conversation(chat.currentConversationId)
  if (r.success) toast.success(`已导出到 ${r.filePath}`)
  else if (r.error) toast.error(`导出失败：${r.error}`)
}

// Auto-scroll on new messages
watch(
  () => [chat.messages.length, chat.messages[chat.messages.length - 1]?.content],
  async () => {
    await nextTick()
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
)

// Reset session notes when switching conversation
watch(() => chat.currentConversationId, () => {
  sessionNotes.value = []
})

function onSaveToNotebook(message: Message) { savingMessage.value = message }
function onNoteSaved(note: Note) { sessionNotes.value.unshift(note); savingMessage.value = null }
function openNoteInNotebook(noteId?: string) {
  if (noteId) router.push({ path: '/notebook', query: { openNote: noteId } })
  else router.push('/notebook')
}
function removeSessionNote(idx: number) { sessionNotes.value.splice(idx, 1) }

// ── Artifacts helpers ────────────────────────────────────────────────────────
function artifactIcon(kind: Artifact['kind']) {
  if (kind === 'xlsx') return FileSpreadsheet
  if (kind === 'pptx') return Presentation
  return FileText
}
function artifactLabel(kind: Artifact['kind']) {
  return ({ docx: 'Word', xlsx: 'Excel', pptx: 'PPT', html: 'HTML', md: 'Markdown', txt: '文本', file: '文件' })[kind] ?? '文件'
}
async function openArtifact(a: Artifact)       { await window.api.shell.openPath(a.filePath) }
async function showArtifactFolder(a: Artifact) { await window.api.shell.showItemInFolder(a.filePath) }

// ── Right panel: auto-expand on content ────────────────────────────────────
const rightOpen = ref(localStorage.getItem('pane-right-open') === 'true')

const hasRightContent = computed(() =>
  chat.sessionArtifacts.length > 0 || sessionNotes.value.length > 0 ||
  !!(chat.currentConversation?.agentId)
)

watch(hasRightContent, (has) => {
  if (has && !rightOpen.value) {
    rightOpen.value = true
    localStorage.setItem('pane-right-open', 'true')
  }
})

function toggleRight() {
  rightOpen.value = !rightOpen.value
  localStorage.setItem('pane-right-open', String(rightOpen.value))
}

// ── Resizable panels ────────────────────────────────────────────────────────
const leftWidth  = ref(Number(localStorage.getItem('pane-left')  || 240))
const rightWidth = ref(Number(localStorage.getItem('pane-right') || 208))

let dragActive = false
let dragTarget: 'left' | 'right' = 'left'
let dragStartX = 0
let dragStartW = 0
const isDragging = ref(false)

function startDrag(target: 'left' | 'right', e: MouseEvent) {
  dragActive = true
  dragTarget = target
  dragStartX = e.clientX
  dragStartW = target === 'left' ? leftWidth.value : rightWidth.value
  isDragging.value = true
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', stopDrag)
}

function onMouseMove(e: MouseEvent) {
  if (!dragActive) return
  const dx = e.clientX - dragStartX
  if (dragTarget === 'left') {
    leftWidth.value = Math.min(360, Math.max(160, dragStartW + dx))
  } else {
    rightWidth.value = Math.min(400, Math.max(160, dragStartW - dx))
  }
}

function stopDrag() {
  dragActive = false
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', stopDrag)
  localStorage.setItem('pane-left',  String(leftWidth.value))
  localStorage.setItem('pane-right', String(rightWidth.value))
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div class="flex h-full overflow-hidden" :class="isDragging ? 'select-none cursor-col-resize' : ''">

    <!-- ── Left sidebar ── -->
    <aside
      :style="{ width: leftWidth + 'px' }"
      class="flex-none border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 overflow-hidden"
    >
      <ChatHistory />
    </aside>

    <!-- Left drag handle -->
    <div
      class="w-1 flex-none bg-transparent hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors cursor-col-resize z-10"
      @mousedown.prevent="startDrag('left', $event)"
    />

    <!-- ── Center ── -->
    <div class="flex-1 min-w-0 flex flex-col relative">

      <!-- Empty / Welcome state (no conversation selected) -->
      <div
        v-if="!chat.currentConversationId"
        class="flex-1 flex flex-col items-center justify-center gap-5 px-6"
      >
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <MessageSquare class="w-8 h-8 text-white" />
        </div>
        <div class="text-center">
          <h2 class="text-xl font-semibold mb-2">开始与 DeepSeek 对话</h2>
          <p class="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
            <template v-if="!settings.apiKey">
              先在<span class="text-blue-600 dark:text-blue-400 font-medium cursor-pointer" @click="router.push('/profile')">个人中心</span>配置 API Key，然后开始对话。
            </template>
            <template v-else>
              点击「新建对话」开始，悬停在 AI 回复上可一键<span class="font-medium">存入笔记本</span>。
            </template>
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2 w-full max-w-md">
          <button
            v-for="tpl in ['📝 摘要笔记', '🌐 翻译内容', '💡 深度分析', '✍️ 续写创作']"
            :key="tpl"
            @click="chat.createConversation()"
            class="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl p-3 text-sm text-left transition-colors"
          >
            <div class="font-medium text-zinc-700 dark:text-zinc-300">{{ tpl }}</div>
          </button>
        </div>
      </div>

      <!-- Conversation header (title + search + export) -->
      <div
        v-if="chat.currentConversationId"
        class="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex-none"
      >
        <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-xs">
          {{ chat.currentConversation?.title ?? '新对话' }}
        </span>
        <div class="flex items-center gap-0.5 shrink-0">
          <button
            @click="openSearch"
            class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="搜索消息 (⌘F)"
          ><Search class="w-3.5 h-3.5" /></button>
          <button
            @click="exportConversation"
            class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="导出为 Markdown"
          ><Download class="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <!-- Search bar -->
      <Transition name="slide-down-sm">
        <div
          v-if="searchVisible"
          class="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex-none"
        >
          <Search class="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            ref="searchInputEl"
            v-model="searchQuery"
            type="text"
            placeholder="搜索消息…"
            class="flex-1 bg-transparent outline-none text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
            @keydown="onSearchKey"
          />
          <span class="text-xs text-zinc-400 shrink-0">
            {{ searchMatchIds.length ? `${searchMatchIdx + 1} / ${searchMatchIds.length}` : '无结果' }}
          </span>
          <button @click="prevMatch" :disabled="!searchMatchIds.length" class="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 transition-colors">
            <ChevronUp class="w-3.5 h-3.5" />
          </button>
          <button @click="nextMatch" :disabled="!searchMatchIds.length" class="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 transition-colors">
            <ChevronDown class="w-3.5 h-3.5" />
          </button>
          <button @click="closeSearch" class="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </Transition>

      <!-- Message list -->
      <div
        v-if="chat.currentConversationId"
        ref="messagesEl"
        class="flex-1 overflow-y-auto py-2 relative"
        @dragover.prevent="fileDragging = true"
        @dragleave="fileDragging = false"
        @drop.prevent="handleFileDrop"
      >
        <!-- File drag overlay -->
        <div
          v-if="fileDragging"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3
                 bg-blue-50/90 dark:bg-blue-900/40 border-2 border-dashed border-blue-400
                 dark:border-blue-500 rounded-lg pointer-events-none"
        >
          <span class="text-4xl">📄</span>
          <p class="text-sm font-medium text-blue-600 dark:text-blue-300">松开文件让 AI 帮你分析</p>
          <p class="text-xs text-blue-400">支持 txt / md / json / csv / py / js 等文本文件</p>
        </div>
        <!-- Empty conversation with agent indicator -->
        <div v-if="chat.messages.length === 0" class="flex flex-col items-center justify-center h-full gap-2 text-zinc-400 dark:text-zinc-600">
          <template v-if="chat.currentConversation?.agentId && getAgent(chat.currentConversation.agentId)">
            <span class="text-4xl">{{ getAgent(chat.currentConversation.agentId)!.emoji }}</span>
            <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">{{ getAgent(chat.currentConversation.agentId)!.nameZh }}</p>
            <p class="text-xs text-zinc-400 max-w-xs text-center">{{ getAgent(chat.currentConversation.agentId)!.description }}</p>
          </template>
          <template v-else>
            <MessageSquare class="w-8 h-8" />
            <p class="text-sm">发送第一条消息开始对话</p>
          </template>
        </div>

        <template v-for="(msg, i) in chat.messages" :key="msg.id">
          <ToolCallBubble
            v-if="chat.isStreaming && i === chat.messages.length - 1 && msg.role === 'assistant' && chat.currentToolCalls.length"
            :records="chat.currentToolCalls"
            class="px-4"
          />
          <div
            :data-msg-id="msg.id"
            :class="[
              'transition-all duration-150',
              searchMatchIds.includes(msg.id)
                ? searchMatchIds[searchMatchIdx] === msg.id
                  ? 'ring-2 ring-blue-400 dark:ring-blue-500 rounded-xl mx-2'
                  : 'ring-1 ring-blue-200 dark:ring-blue-800 rounded-xl mx-2'
                : ''
            ]"
          >
            <MessageBubble
              :message="msg"
              :is-streaming="chat.isStreaming && i === chat.messages.length - 1 && msg.role === 'assistant'"
              :artifacts="msg.role === 'assistant' ? chat.sessionArtifacts.filter(a => !a.msgId || a.msgId === msg.id) : undefined"
              @save-to-notebook="onSaveToNotebook"
            />
          </div>
        </template>
      </div>

      <!-- Skill extract banner -->
      <Transition name="slide-up">
        <div v-if="chat.pendingSkillExtract && !showSkillDialog"
             class="mx-4 mb-2 flex items-center gap-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-xl px-4 py-2.5 text-sm">
          <span class="text-lg">✨</span>
          <div class="flex-1 min-w-0">
            <span class="font-medium text-purple-700 dark:text-purple-300">发现可复用技能</span>
            <span class="text-purple-600 dark:text-purple-400 ml-1 truncate">「{{ chat.pendingSkillExtract.name }}」</span>
          </div>
          <button @click="openSkillDialog"
            class="shrink-0 text-xs px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium">
            保存
          </button>
          <button @click="dismissSkillExtract"
            class="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>
      </Transition>

      <!-- Input -->
      <ChatInput :initial-text="pendingInput" @consumed="pendingInput = ''" />

      <!-- Right panel toggle tab -->
      <button
        @click="toggleRight"
        class="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 border-r-0 rounded-l-lg px-1 py-2.5 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex flex-col items-center gap-1"
        :title="rightOpen ? '收起右侧面板' : '展开右侧面板'"
      >
        <PanelRight class="w-3.5 h-3.5 text-zinc-400" />
        <ChevronLeft v-if="rightOpen"  class="w-2.5 h-2.5 text-zinc-300" />
        <ChevronRight v-else           class="w-2.5 h-2.5 text-zinc-300" />
        <!-- Dot indicator when there's content -->
        <span v-if="hasRightContent && !rightOpen" class="w-1.5 h-1.5 rounded-full bg-blue-500" />
      </button>
    </div>

    <!-- Right drag handle (only visible when panel open) -->
    <div
      v-show="rightOpen"
      class="w-1 flex-none bg-transparent hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors cursor-col-resize z-10"
      @mousedown.prevent="startDrag('right', $event)"
    />

    <!-- ── Right drawer ── -->
    <aside
      :style="rightOpen ? { width: rightWidth + 'px' } : { width: '0px' }"
      class="flex-none border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 overflow-hidden transition-[width] duration-200 ease-in-out"
    >
      <div :style="{ width: rightWidth + 'px' }" class="h-full flex flex-col overflow-y-auto">

        <!-- Artifacts section -->
        <div v-if="chat.sessionArtifacts.length">
          <div class="px-3 pt-3 pb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-1">
              <FileText class="w-3 h-3" />本次产物
            </span>
            <span class="text-xs text-zinc-400">{{ chat.sessionArtifacts.length }}</span>
          </div>
          <div class="px-2 pb-2 space-y-1">
            <div
              v-for="a in chat.sessionArtifacts"
              :key="a.id"
              class="group flex items-center gap-2 bg-white dark:bg-zinc-800 rounded-lg px-2.5 py-2 border border-zinc-100 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              <component :is="artifactIcon(a.kind)" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-medium text-zinc-800 dark:text-zinc-200 truncate">{{ a.name }}</div>
                <div class="text-[10px] text-zinc-400">{{ artifactLabel(a.kind) }}</div>
              </div>
              <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="p-0.5 rounded text-zinc-400 hover:text-blue-500 transition-colors" title="打开" @click="openArtifact(a)">
                  <ExternalLink class="w-3 h-3" />
                </button>
                <button class="p-0.5 rounded text-zinc-400 hover:text-zinc-600 transition-colors" title="显示文件夹" @click="showArtifactFolder(a)">
                  <FolderOpen class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          <div class="mx-3 border-t border-zinc-200 dark:border-zinc-700 mb-1" />
        </div>

        <!-- Active agent badge -->
        <div
          v-if="chat.currentConversation?.agentId && getAgent(chat.currentConversation.agentId)"
          class="mx-2 mt-2 mb-1 flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl px-2.5 py-2"
        >
          <span class="text-base shrink-0">{{ getAgent(chat.currentConversation.agentId)!.emoji }}</span>
          <div class="min-w-0">
            <div class="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 truncate">{{ getAgent(chat.currentConversation.agentId)!.nameZh }}</div>
            <div class="text-[10px] text-indigo-400 dark:text-indigo-500">Agent 模式</div>
          </div>
        </div>

        <!-- Bookmarks section header -->
        <div class="px-3 pt-2 pb-2 flex items-center justify-between">
          <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-1">
            <BookOpen class="w-3 h-3 text-blue-500" />笔记书签
          </span>
          <span v-if="sessionNotes.length" class="text-xs text-zinc-400">{{ sessionNotes.length }}</span>
        </div>

        <!-- Empty state -->
        <div v-if="!sessionNotes.length && !chat.sessionArtifacts.length && !chat.currentConversation?.agentId"
             class="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-600 p-4">
          <BookOpen class="w-7 h-7 opacity-40" />
          <p class="text-xs text-center leading-relaxed">悬停在 AI 回复上，点击「存入笔记」将内容保存至笔记本</p>
        </div>
        <div v-else-if="!sessionNotes.length" class="px-3 pb-3">
          <p class="text-[11px] text-zinc-400 dark:text-zinc-600 text-center">暂无笔记书签</p>
        </div>

        <!-- Saved notes list -->
        <div v-if="sessionNotes.length" class="px-2 pb-2 space-y-1.5">
          <div
            v-for="(note, idx) in sessionNotes"
            :key="note.id"
            class="group bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-zinc-100 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
          >
            <div class="flex items-start justify-between gap-1 mb-1">
              <span class="text-xs font-medium text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">{{ note.title }}</span>
              <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="p-0.5 rounded text-zinc-400 hover:text-blue-500 transition-colors" title="在笔记本中查看" @click="openNoteInNotebook(note.id)">
                  <ExternalLink class="w-3 h-3" />
                </button>
                <button class="p-0.5 rounded text-zinc-400 hover:text-red-500 transition-colors" title="从列表移除" @click="removeSessionNote(idx)">
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
            <p class="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
              {{ note.content.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n+/g, ' ').trim().slice(0, 80) }}
            </p>
          </div>
        </div>

        <!-- Jump to notebook -->
        <div v-if="sessionNotes.length" class="p-2 border-t border-zinc-200 dark:border-zinc-800">
          <button
            class="w-full text-xs text-center py-1.5 rounded-xl text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors font-medium"
            @click="openNoteInNotebook"
          >前往笔记本查看全部</button>
        </div>

        <!-- Shortcuts (pinned notes) -->
        <div v-if="shortcuts.length" class="border-t border-zinc-200 dark:border-zinc-800 mt-auto">
          <div class="px-3 pt-2 pb-1 flex items-center gap-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">快捷笔记</span>
          </div>
          <div class="px-2 pb-2 space-y-0.5">
            <button
              v-for="s in shortcuts"
              :key="s.noteId"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              @click="openShortcutNote(s.noteId)"
            >
              <Bookmark class="w-3 h-3 shrink-0 text-amber-400" />
              <span class="truncate">{{ s.title }}</span>
            </button>
          </div>
        </div>

      </div>
    </aside>

    <!-- Save to Notebook dialog -->
    <Transition name="modal">
      <SaveNoteDialog
        v-if="savingMessage"
        :content="savingMessage.content"
        :source-conv-id="chat.currentConversationId ?? undefined"
        :source-msg-id="savingMessage.id"
        @saved="onNoteSaved"
        @cancel="savingMessage = null"
      />
    </Transition>

    <!-- Skill extract / create dialog -->
    <Transition name="modal">
      <SkillDialog
        v-if="showSkillDialog && chat.pendingSkillExtract"
        mode="extract"
        :proposed="chat.pendingSkillExtract"
        @save="saveExtractedSkill"
        @cancel="dismissSkillExtract"
      />
    </Transition>
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from, .slide-up-leave-to       { opacity: 0; transform: translateY(8px); }

.slide-down-sm-enter-active, .slide-down-sm-leave-active { transition: all 0.15s ease; }
.slide-down-sm-enter-from, .slide-down-sm-leave-to       { opacity: 0; transform: translateY(-6px); }

.modal-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.modal-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.97); }
</style>
