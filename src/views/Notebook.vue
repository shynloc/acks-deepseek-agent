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
            v-for="(cat, idx) in categories"
            :key="cat.id"
            draggable="true"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors select-none"
            :class="[
              activeCategory === cat.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
              dragOverIdx === idx ? 'border-t-2 border-blue-400' : ''
            ]"
            @click="renamingCatId !== cat.id && setCategory(cat.id)"
            @dblclick.stop="startRenameCategory(cat)"
            @dragstart="onCatDragStart(idx)"
            @dragover.prevent="dragOverIdx = idx"
            @dragleave="dragOverIdx = null"
            @drop.prevent="onCatDrop(idx)"
            @dragend="dragOverIdx = null"
          >
            <GripVertical class="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-30 cursor-grab" />
            <FolderOpen class="w-3.5 h-3.5 shrink-0" />
            <!-- Rename inline input -->
            <input
              v-if="renamingCatId === cat.id"
              ref="renameCatInputRef"
              v-model="renamingCatName"
              class="flex-1 text-xs bg-transparent outline-none border-b border-blue-400"
              @keydown.enter="commitRenameCategory(cat.id)"
              @keydown.escape="renamingCatId = null"
              @blur="commitRenameCategory(cat.id)"
              @click.stop
            />
            <span v-else class="truncate flex-1">{{ cat.name }}</span>
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
    <main class="flex-1 flex overflow-hidden">
      <!-- Note list pane (narrows when inline editor is open) -->
      <div
        class="flex flex-col overflow-hidden transition-all duration-200"
        :class="editorOpen && isWideScreen ? 'w-80 shrink-0 border-r border-gray-200 dark:border-gray-700' : 'flex-1'"
      >
      <!-- Toolbar row -->
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <!-- Search -->
        <div
          class="flex items-center gap-2 flex-1 max-w-sm rounded-xl px-3 py-1.5 transition-colors"
          :class="semanticMode
            ? 'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-300 dark:ring-purple-700'
            : 'bg-gray-100 dark:bg-gray-800'"
        >
          <Loader2 v-if="semanticSearching" class="w-3.5 h-3.5 text-purple-500 shrink-0 animate-spin" />
          <Search v-else class="w-3.5 h-3.5 shrink-0" :class="semanticMode ? 'text-purple-500' : 'text-gray-400'" />
          <input
            v-model="searchQuery"
            :placeholder="semanticMode ? 'AI 语义搜索… 按 Enter 开始' : '搜索笔记…'"
            class="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
            :class="semanticMode ? 'text-purple-700 dark:text-purple-200' : 'text-gray-700 dark:text-gray-300'"
            @input="onSearch"
            @keydown.enter="semanticMode && semanticSearch()"
          />
          <button
            v-if="searchQuery"
            class="text-gray-400 hover:text-gray-600"
            @click="searchQuery = ''; semanticResults.value = []; onSearch()"
          >
            <X class="w-3 h-3" />
          </button>
          <button
            class="p-0.5 rounded transition-colors"
            :class="semanticMode
              ? 'text-purple-500 hover:text-purple-700'
              : 'text-gray-400 hover:text-purple-500'"
            title="AI 语义搜索"
            @click="toggleSemanticMode"
          >
            <Sparkles class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <!-- Sort & view mode: hidden when note list is narrowed in split view -->
          <template v-if="!(editorOpen && isWideScreen)">
            <select
              v-model="sortBy"
              class="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 outline-none"
            >
              <option value="updated">最近修改</option>
              <option value="created">创建时间</option>
              <option value="title">标题</option>
            </select>

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
          </template>

          <button
            class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-xl transition-colors"
            @click="openEditor(null)"
          >
            <Plus class="w-3.5 h-3.5" /><span v-if="!(editorOpen && isWideScreen)">新建笔记</span>
          </button>
          <button
            v-if="!(editorOpen && isWideScreen)"
            class="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-xl transition-colors"
            title="从模板新建"
            @click="showTemplatePicker = true"
          >
            <LayoutTemplate class="w-3.5 h-3.5" />模板
          </button>
        </div>
      </div>

      <!-- Notes grid / list -->
      <div class="flex-1 overflow-y-auto p-4">
        <!-- Skeleton loading -->
        <div v-if="isLoading" class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard v-for="i in 6" :key="i" />
        </div>

        <!-- ── Semantic results ── -->
        <template v-else-if="semanticMode">
          <div v-if="!semanticResults.length && !semanticSearching" class="flex flex-col items-center justify-center h-64 text-gray-400">
            <Sparkles class="w-10 h-10 mb-3 opacity-30" />
            <p class="text-sm">输入问题或关键词，按 Enter 开始 AI 语义搜索</p>
            <p class="text-xs mt-1 opacity-60">跨越关键词障碍，理解文意找到笔记</p>
          </div>
          <template v-else-if="semanticResults.length">
            <div class="flex items-center gap-2 mb-3">
              <Sparkles class="w-3.5 h-3.5 text-purple-500" />
              <span class="text-xs text-gray-400">找到 {{ semanticResults.length }} 篇相关笔记</span>
            </div>
            <div class="space-y-1.5">
              <div
                v-for="note in semanticResults"
                :key="note.id"
                class="group flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 cursor-pointer transition-all"
                @dblclick="openEditor(note)"
                @click="selectedNote = note"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ note.title || '无标题' }}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 shrink-0 font-medium">
                      {{ Math.round(note.score * 100) }}%
                    </span>
                  </div>
                  <p class="text-xs text-gray-400 truncate">{{ plainPreview(note.content) }}</p>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-blue-500" @click.stop="openEditor(note)"><Pencil class="w-3 h-3" /></button>
                  <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-500" @click.stop="confirmDelete(note)"><Trash2 class="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          </template>
        </template>

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
            v-else-if="effectiveViewMode === 'grid'"
          class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          <NoteCard
            v-for="note in visibleNotes"
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
              v-for="note in visibleNotes"
              :key="note.id"
              class="group flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-all"
              :class="{ 'border-blue-400 dark:border-blue-500': editorOpen && isWideScreen && editingNote?.id === note.id }"
              @click="editorOpen && isWideScreen ? openEditor(note) : (selectedNote = note)"
              @dblclick="editorOpen && isWideScreen ? undefined : openEditor(note)"
            >
              <div v-if="note.color && note.color !== 'none'" class="w-1.5 h-8 rounded-full shrink-0" :style="{ background: noteColorHex(note.color) }" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ note.title || '无标题' }}</span>
                  <span v-for="tag in note.tags.slice(0, 2)" :key="tag.id" class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" :style="{ background: tag.color + '22', color: tag.color }">{{ tag.name }}</span>
                </div>
                <!-- Show FTS5 snippet with highlights when searching, plain preview otherwise -->
                <p v-if="note.searchSnippet" class="text-xs text-gray-400 truncate"
                   v-html="highlightSnippet(note.searchSnippet)" />
                <p v-else class="text-xs text-gray-400 truncate">{{ plainPreview(note.content) }}</p>
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
          <!-- IntersectionObserver sentinel for infinite scroll -->
          <div v-if="hasMore" ref="sentinelRef" class="h-8" />
        </template>
      </div>
      </div><!-- end note list pane -->

      <!-- ══ Inline editor pane (wide screens) ══ -->
      <div v-if="editorOpen && isWideScreen" class="flex-1 overflow-hidden">
        <NoteEditor
          inline
          :note="editingNote"
          :categories="categories"
          :available-tags="tags"
          @save="onEditorSave"
          @auto-save="onEditorAutoSave"
          @close="editorOpen = false"
          @create-tag="onCreateTag"
          @open-note="openNoteById"
        />
      </div>
    </main>

    <!-- ══ Note Editor Modal (narrow screens only) ══ -->
    <Transition name="modal">
      <NoteEditor
        v-if="editorOpen && !isWideScreen"
        :note="editingNote"
        :categories="categories"
        :available-tags="tags"
        @save="onEditorSave"
        @auto-save="onEditorAutoSave"
        @close="editorOpen = false"
        @create-tag="onCreateTag"
        @open-note="openNoteById"
      />
    </Transition>

    <!-- Delete confirm dialog -->
    <Transition name="modal">
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
    </Transition>

    <!-- Template picker -->
    <TemplatePickerModal
      v-if="showTemplatePicker"
      @pick="onTemplatePick"
      @close="showTemplatePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  Plus, X, Search, BookOpen, FolderOpen, Bookmark,
  LayoutGrid, List, Pencil, Trash2, GripVertical, LayoutTemplate, Sparkles, Loader2
} from '@lucide/vue'
import { useNotesStore, type Note, type Tag } from '@/stores/notes'
import { useChatStore } from '@/stores/chat'
import { useRouter, useRoute } from 'vue-router'
import NoteCard from '@/components/notes/NoteCard.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import SkeletonCard from '@/components/SkeletonCard.vue'
import TemplatePickerModal from '@/components/notes/TemplatePickerModal.vue'

const store = useNotesStore()
const chatStore = useChatStore()
const router = useRouter()
const route = useRoute()

const notes = computed(() => store.notes)
const categories = computed(() => store.categories)
const tags = computed(() => store.tags)

// ── UI state ──────────────────────────────────────────────────────────────────
const viewMode = ref<'grid' | 'list'>('grid')
// In split-pane mode the note list is only ~320px wide — force list view regardless of user preference
const effectiveViewMode = computed(() =>
  (editorOpen.value && isWideScreen.value) ? 'list' : viewMode.value
)
const activeCategory = ref<string | null>(null)
const activeTag = ref<string | null>(null)
const searchQuery = ref('')
const sortBy = ref<'updated' | 'created' | 'title'>('updated')
const selectedNote = ref<Note | null>(null)
const isLoading = ref(true)
const shortcuts = ref<{ noteId: string; title: string }[]>([])
const showTemplatePicker = ref(false)
const isWideScreen = ref(window.innerWidth >= 1024)
const semanticMode = ref(false)
const semanticSearching = ref(false)
const semanticResults = ref<(Note & { score: number })[]>([])

// ── Editor ────────────────────────────────────────────────────────────────────
const editorOpen = ref(false)
const editingNote = ref<Note | null>(null)

function openEditor(note: Note | null) {
  editingNote.value = note
  editorOpen.value = true
}

function onTemplatePick(content: string, title: string) {
  showTemplatePicker.value = false
  editingNote.value = {
    id: '',
    title,
    content,
    categoryId: activeCategory.value,
    color: 'none',
    wordCount: 0,
    visibility: 'private',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  editorOpen.value = true
}

async function onEditorSave(patch: Partial<Note> & { id?: string }) {
  let noteId = patch.id
  if (patch.id) {
    await store.updateNote(patch.id, patch)
  } else {
    const created = await store.createNote(patch)
    noteId = created.id
  }
  editorOpen.value = false
  await store.loadAll({ categoryId: activeCategory.value ?? undefined, search: searchQuery.value || undefined })
  // Async embed the saved note (fire and forget)
  if (noteId) window.api.semantic.embed(noteId).catch(() => {})
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
  const id = deletingNote.value.id
  await store.deleteNote(id)
  if (selectedNote.value?.id === id) selectedNote.value = null
  semanticResults.value = semanticResults.value.filter(n => n.id !== id)
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

// ── Category rename (double-click) ────────────────────────────────────────────
const renamingCatId   = ref<string | null>(null)
const renamingCatName = ref('')
const renameCatInputRef = ref<HTMLInputElement | null>(null)

function startRenameCategory(cat: { id: string; name: string }) {
  renamingCatId.value   = cat.id
  renamingCatName.value = cat.name
  nextTick(() => {
    const el = renameCatInputRef.value
    if (el) { el.focus(); el.select() }
  })
}

async function commitRenameCategory(id: string) {
  if (renamingCatId.value !== id) return
  const name = renamingCatName.value.trim()
  if (name) await window.api.db.categories.update(id, { name })
  await store.loadCategories()
  renamingCatId.value = null
}

// ── Category drag-to-reorder ──────────────────────────────────────────────────
const dragSrcIdx  = ref<number | null>(null)
const dragOverIdx = ref<number | null>(null)

function onCatDragStart(idx: number) {
  dragSrcIdx.value = idx
}

async function onCatDrop(targetIdx: number) {
  if (dragSrcIdx.value === null || dragSrcIdx.value === targetIdx) return
  const cats = [...categories.value]
  const [moved] = cats.splice(dragSrcIdx.value, 1)
  cats.splice(targetIdx, 0, moved)
  // Persist new order_index for each category
  await Promise.all(
    cats.map((c, i) => window.api.db.categories.update(c.id, { order_index: i }))
  )
  await store.loadCategories()
  dragSrcIdx.value  = null
  dragOverIdx.value = null
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
  let note = notes.value.find(n => n.id === noteId)
  if (!note) {
    // Note might not be in the current filtered list — load from DB
    const rows = await window.api.db.notes.list({}) as Note[]
    note = rows.find(n => n.id === noteId)
  }
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

// ── Virtual paging (IntersectionObserver, no extra deps) ──────────────────────
const PAGE_SIZE   = 30
const displayCount = ref(PAGE_SIZE)
const sentinelRef  = ref<HTMLElement | null>(null)

const visibleNotes = computed(() => filteredNotes.value.slice(0, displayCount.value))
const hasMore      = computed(() => displayCount.value < filteredNotes.value.length)

// Reset page when filter/sort changes
watch(filteredNotes, () => { displayCount.value = PAGE_SIZE })

let observer: IntersectionObserver | null = null
watch(sentinelRef, (el) => {
  observer?.disconnect()
  if (!el) return
  observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore.value) {
      displayCount.value += PAGE_SIZE
    }
  }, { rootMargin: '100px' })
  observer.observe(el)
})
// ── Search (debounced) ────────────────────────────────────────────────────────
let searchTimer: ReturnType<typeof setTimeout>
function onSearch() {
  if (semanticMode.value) return // semantic mode uses explicit trigger
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadNotes, 300)
}

async function semanticSearch() {
  const q = searchQuery.value.trim()
  if (!q) return
  semanticSearching.value = true
  try {
    const res = await window.api.semantic.search(q)
    if (!res.success || !res.results?.length) {
      semanticResults.value = []
      return
    }
    // Load all notes then match by id and attach score
    const allNotes = await window.api.db.notes.list({}) as Note[]
    const scoreMap = new Map(res.results.map(r => [r.id, r.score]))
    semanticResults.value = allNotes
      .filter((n: Note) => scoreMap.has(n.id))
      .map((n: Note) => ({ ...n, score: scoreMap.get(n.id)! }))
      .sort((a, b) => b.score - a.score)
  } finally {
    semanticSearching.value = false
  }
}

function toggleSemanticMode() {
  semanticMode.value = !semanticMode.value
  if (!semanticMode.value) {
    semanticResults.value = []
    loadNotes()
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadNotes() {
  await store.loadAll({
    categoryId: activeCategory.value ?? undefined,
    search: searchQuery.value || undefined
  })
}

function onResize() { isWideScreen.value = window.innerWidth >= 1024 }

onMounted(async () => {
  window.addEventListener('resize', onResize)
  isLoading.value = true
  await Promise.all([
    store.loadAll(),
    store.loadCategories(),
    store.loadTags(),
    loadShortcuts()
  ])
  isLoading.value = false

  // If navigated here with ?openNote=<id>, open that note in editor
  const openNoteId = route.query.openNote as string | undefined
  if (openNoteId) {
    const note = notes.value.find(n => n.id === openNoteId)
    if (note) openEditor(note)
    router.replace({ path: '/notebook' })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  observer?.disconnect()
})


// ── Chat with note ────────────────────────────────────────────────────────────
function chatWithNote(note: Note) {
  chatStore.pendingNoteContext = { title: note.title, content: note.content }
  router.push('/')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function highlightSnippet(snippet: string): string {
  const MARK_OPEN = '\x01'
  const MARK_CLOSE = '\x02'
  return snippet
    .replace(new RegExp(MARK_OPEN, 'g'), '<mark class="bg-yellow-200 dark:bg-yellow-700/60 text-gray-900 dark:text-gray-100 rounded px-0.5">')
    .replace(new RegExp(MARK_CLOSE, 'g'), '</mark>')
}

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

<style scoped>
.modal-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.modal-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.97); }
</style>
