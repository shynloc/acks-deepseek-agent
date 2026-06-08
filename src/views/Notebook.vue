<template>
  <div class="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-950">

    <!-- ══ Left sidebar: Categories + Tags ══ -->
    <aside class="w-52 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div class="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">笔记本</span>
        <button
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-500 transition-colors"
          title="新建笔记"
          @click="openEditor(null)"
        ><Plus class="w-3.5 h-3.5" /></button>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <!-- All notes -->
        <button
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors"
          :class="activeCategory === null && !activeTag ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'"
          @click="setCategory(null)"
        >
          <BookOpen class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">全部笔记</span>
          <span class="ml-auto text-xs text-gray-400">{{ notes.length }}</span>
        </button>

        <!-- Categories section -->
        <div class="pt-2">
          <div class="flex items-center justify-between px-2 mb-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">分类</span>
            <button class="text-gray-400 hover:text-blue-500 transition-colors" @click="startNewCategory">
              <Plus class="w-3 h-3" />
            </button>
          </div>

          <!-- New category input -->
          <div v-if="showNewCategory" class="flex items-center gap-1 px-2 mb-1">
            <input
              ref="newCatInputRef"
              v-model="newCategoryName"
              placeholder="分类名称"
              class="flex-1 text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-transparent outline-none dark:text-gray-300"
              @keydown.enter="createCategory"
              @keydown.escape="showNewCategory = false"
            />
            <button class="text-xs text-blue-500" @click="createCategory">确定</button>
          </div>

          <div
            v-for="cat in categories"
            :key="cat.id"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors"
            :class="activeCategory === cat.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'"
            @click="setCategory(cat.id)"
          >
            <FolderOpen class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate flex-1">{{ cat.name }}</span>
            <button
              class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
              @click.stop="deleteCategory(cat.id)"
            ><X class="w-3 h-3" /></button>
          </div>
        </div>

        <!-- Tags section -->
        <div class="pt-2">
          <div class="px-2 mb-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">标签</span>
          </div>
          <button
            v-for="tag in tags"
            :key="tag.id"
            class="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors"
            :class="activeTag === tag.id ? 'bg-gray-100 dark:bg-gray-800 font-medium' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'"
            @click="setTag(tag.id)"
          >
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: tag.color }" />
            <span class="truncate">{{ tag.name }}</span>
          </button>
        </div>
      </div>

      <!-- Shortcuts section -->
      <div v-if="shortcuts.length" class="border-t border-gray-100 dark:border-gray-800 p-2">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2 mb-1.5">快捷方式</div>
        <button
          v-for="s in shortcuts"
          :key="s.noteId"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click="openNoteById(s.noteId)"
        >
          <Bookmark class="w-3 h-3 shrink-0 text-amber-400" />
          <span class="truncate">{{ s.title }}</span>
        </button>
      </div>
    </aside>

    <!-- ══ Main content ══ -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Toolbar row -->
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <!-- Search -->
        <div class="flex items-center gap-2 flex-1 max-w-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-1.5">
          <Search class="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            v-model="searchQuery"
            placeholder="搜索笔记…"
            class="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
            @input="onSearch"
          />
          <button v-if="searchQuery" class="text-gray-400 hover:text-gray-600" @click="searchQuery = ''; onSearch()">
            <X class="w-3 h-3" />
          </button>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <!-- Sort -->
          <select
            v-model="sortBy"
            class="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 outline-none"
          >
            <option value="updated">最近修改</option>
            <option value="created">创建时间</option>
            <option value="title">标题</option>
          </select>

          <!-- View mode -->
          <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              class="p-1.5 transition-colors"
              :class="viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-400'"
              @click="viewMode = 'grid'"
              title="网格视图"
            ><LayoutGrid class="w-3.5 h-3.5" /></button>
            <button
              class="p-1.5 transition-colors"
              :class="viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-400'"
              @click="viewMode = 'list'"
              title="列表视图"
            ><List class="w-3.5 h-3.5" /></button>
          </div>

          <button
            class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-xl transition-colors"
            @click="openEditor(null)"
          >
            <Plus class="w-3.5 h-3.5" />新建笔记
          </button>
        </div>
      </div>

      <!-- Notes grid / list -->
      <div class="flex-1 overflow-y-auto p-4">
        <!-- Skeleton loading -->
        <div v-if="isLoading" class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard v-for="i in 6" :key="i" />
        </div>

        <template v-else>
          <!-- Stats bar (independent, always shows when notes exist) -->
          <div v-if="filteredNotes.length" class="flex items-center justify-between mb-3">
            <span class="text-xs text-gray-400">共 {{ filteredNotes.length }} 篇笔记</span>
          </div>

          <!-- Empty state -->
          <div v-if="!filteredNotes.length" class="flex flex-col items-center justify-center h-64 text-gray-400">
            <BookOpen class="w-12 h-12 mb-3 opacity-30" />
            <p class="text-sm">暂无笔记</p>
            <button class="mt-3 text-sm text-blue-500 hover:text-blue-600" @click="openEditor(null)">新建第一篇笔记</button>
          </div>

          <!-- Grid -->
          <div
            v-else-if="viewMode === 'grid'"
          class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          <NoteCard
            v-for="note in filteredNotes"
            :key="note.id"
            :note="note"
            :categories="categories"
            :selected="selectedNote?.id === note.id"
            :search-query="searchQuery"
            @select="selectedNote = $event"
            @edit="openEditor($event)"
            @delete="confirmDelete($event)"
            @shortcut="toggleShortcut($event)"
            @chat="chatWithNote($event)"
          />
        </div>

          <!-- List -->
          <div v-else class="space-y-1.5">
            <div
              v-for="note in filteredNotes"
              :key="note.id"
              class="group flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-all"
              @click="selectedNote = note"
              @dblclick="openEditor(note)"
            >
              <div v-if="note.color && note.color !== 'none'" class="w-1.5 h-8 rounded-full shrink-0" :style="{ background: noteColorHex(note.color) }" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ note.title || '无标题' }}</span>
                  <span v-for="tag in note.tags.slice(0, 2)" :key="tag.id" class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" :style="{ background: tag.color + '22', color: tag.color }">{{ tag.name }}</span>
                </div>
                <p class="text-xs text-gray-400 truncate">{{ plainPreview(note.content) }}</p>
              </div>
              <div class="flex items-center gap-2 shrink-0 text-xs text-gray-400">
                <span>{{ formatDate(note.updatedAt) }}</span>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-blue-500" @click.stop="openEditor(note)"><Pencil class="w-3 h-3" /></button>
                  <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-500" @click.stop="confirmDelete(note)"><Trash2 class="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>

    <!-- ══ Note Editor Modal ══ -->
    <NoteEditor
      v-if="editorOpen"
      :note="editingNote"
      :categories="categories"
      :available-tags="tags"
      @save="onEditorSave"
      @auto-save="onEditorAutoSave"
      @close="editorOpen = false"
      @create-tag="onCreateTag"
    />

    <!-- Delete confirm dialog -->
    <div v-if="deletingNote" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="deletingNote = null">
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl w-80">
        <h3 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">删除笔记</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">「{{ deletingNote.title || '无标题' }}」将被永久删除，无法恢复。</p>
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700" @click="deletingNote = null">取消</button>
          <button class="px-4 py-1.5 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium" @click="doDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import {
  Plus, X, Search, BookOpen, FolderOpen, Bookmark,
  LayoutGrid, List, Pencil, Trash2
} from '@lucide/vue'
import { useNotesStore, type Note, type Tag } from '@/stores/notes'
import { useChatStore } from '@/stores/chat'
import { useRouter } from 'vue-router'
import NoteCard from '@/components/notes/NoteCard.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import SkeletonCard from '@/components/SkeletonCard.vue'

const store = useNotesStore()
const chatStore = useChatStore()
const router = useRouter()

const notes = computed(() => store.notes)
const categories = computed(() => store.categories)
const tags = computed(() => store.tags)

// ── UI state ──────────────────────────────────────────────────────────────────
const viewMode = ref<'grid' | 'list'>('grid')
const activeCategory = ref<string | null>(null)
const activeTag = ref<string | null>(null)
const searchQuery = ref('')
const sortBy = ref<'updated' | 'created' | 'title'>('updated')
const selectedNote = ref<Note | null>(null)
const isLoading = ref(true)
const shortcuts = ref<{ noteId: string; title: string }[]>([])

// ── Editor ────────────────────────────────────────────────────────────────────
const editorOpen = ref(false)
const editingNote = ref<Note | null>(null)

function openEditor(note: Note | null) {
  editingNote.value = note
  editorOpen.value = true
}

async function onEditorSave(patch: Partial<Note> & { id?: string }) {
  if (patch.id) {
    await store.updateNote(patch.id, patch)
  } else {
    await store.createNote(patch)
  }
  editorOpen.value = false
  await store.loadAll({ categoryId: activeCategory.value ?? undefined, search: searchQuery.value || undefined })
}

async function onEditorAutoSave(patch: Partial<Note> & { id: string }) {
  await store.updateNote(patch.id, patch)
  // Refresh list in background without closing the editor
  store.loadAll({ categoryId: activeCategory.value ?? undefined, search: searchQuery.value || undefined })
}

async function onCreateTag(name: string, color: string) {
  await store.createTag(name, color)
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deletingNote = ref<Note | null>(null)
function confirmDelete(note: Note) { deletingNote.value = note }
async function doDelete() {
  if (!deletingNote.value) return
  await store.deleteNote(deletingNote.value.id)
  if (selectedNote.value?.id === deletingNote.value.id) selectedNote.value = null
  deletingNote.value = null
}

// ── Categories ────────────────────────────────────────────────────────────────
const showNewCategory = ref(false)
const newCategoryName = ref('')
const newCatInputRef = ref<HTMLInputElement | null>(null)

function startNewCategory() {
  showNewCategory.value = true
  nextTick(() => newCatInputRef.value?.focus())
}

async function createCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return
  await store.createCategory(name)
  newCategoryName.value = ''
  showNewCategory.value = false
}

async function deleteCategory(id: string) {
  await store.deleteCategory(id)
  if (activeCategory.value === id) activeCategory.value = null
}

// ── Navigation ────────────────────────────────────────────────────────────────
function setCategory(id: string | null) {
  activeCategory.value = id
  activeTag.value = null
  loadNotes()
}

function setTag(id: string) {
  activeTag.value = activeTag.value === id ? null : id
  activeCategory.value = null
  loadNotes()
}

async function openNoteById(noteId: string) {
  const note = notes.value.find(n => n.id === noteId)
  if (note) openEditor(note)
}

// ── Shortcuts ─────────────────────────────────────────────────────────────────
async function loadShortcuts() {
  const raw = (await window.api.db.shortcuts.list()) as any[]
  shortcuts.value = raw.map(s => ({ noteId: s.noteId, title: s.title }))
}

async function toggleShortcut(note: Note) {
  const exists = shortcuts.value.some(s => s.noteId === note.id)
  if (exists) {
    await window.api.db.shortcuts.remove(note.id)
  } else {
    await window.api.db.shortcuts.add(note.id)
  }
  await loadShortcuts()
}

// ── Filter & Sort ─────────────────────────────────────────────────────────────
const filteredNotes = computed(() => {
  let list = [...notes.value]
  if (activeTag.value) {
    list = list.filter(n => n.tags.some(t => t.id === activeTag.value))
  }
  if (sortBy.value === 'updated') {
    list.sort((a, b) => b.updatedAt - a.updatedAt)
  } else if (sortBy.value === 'created') {
    list.sort((a, b) => b.createdAt - a.createdAt)
  } else {
    list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  }
  return list
})

// ── Search (debounced) ────────────────────────────────────────────────────────
let searchTimer: ReturnType<typeof setTimeout>
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadNotes, 300)
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadNotes() {
  await store.loadAll({
    categoryId: activeCategory.value ?? undefined,
    search: searchQuery.value || undefined
  })
}

onMounted(async () => {
  isLoading.value = true
  await Promise.all([
    store.loadAll(),
    store.loadCategories(),
    store.loadTags(),
    loadShortcuts()
  ])
  isLoading.value = false
})

// ── Chat with note ────────────────────────────────────────────────────────────
function chatWithNote(note: Note) {
  chatStore.pendingNoteContext = { title: note.title, content: note.content }
  router.push('/')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function plainPreview(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 120)
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const noteColorHexMap: Record<string, string> = {
  red: '#f87171', orange: '#fb923c', yellow: '#facc15',
  green: '#4ade80', blue: '#60a5fa', purple: '#c084fc'
}
function noteColorHex(color: string): string { return noteColorHexMap[color] ?? '#e5e7eb' }
</script>
