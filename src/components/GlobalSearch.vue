<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm" @click.self="$emit('close')">
      <div class="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

        <!-- Search input -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search class="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref="inputRef"
            v-model="query"
            placeholder="全局搜索笔记和对话…"
            class="flex-1 text-base bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            @keydown="onKeydown"
          />
          <kbd class="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-400">Esc</kbd>
        </div>

        <!-- Results -->
        <div class="max-h-[60vh] overflow-y-auto">
          <div v-if="!query.trim()" class="py-10 text-center text-sm text-gray-400">
            输入关键词开始搜索
          </div>

          <div v-else-if="loading" class="py-10 text-center text-sm text-gray-400">搜索中…</div>

          <div v-else-if="!noteResults.length && !convResults.length" class="py-10 text-center text-sm text-gray-400">
            未找到相关内容
          </div>

          <template v-else>
            <!-- Notes section -->
            <div v-if="noteResults.length">
              <div class="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50">
                笔记 ({{ noteResults.length }})
              </div>
              <button
                v-for="(note, i) in noteResults"
                :key="note.id"
                class="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-b border-gray-50 dark:border-gray-800/50 last:border-0"
                :class="selectedIdx === i ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
                @click="goToNote(note)"
              >
                <FileText class="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" v-html="hl(note.title)" />
                  <div class="text-xs text-gray-400 mt-0.5 line-clamp-2" v-html="hl(plainPreview(note.content))" />
                </div>
                <div class="flex gap-1 shrink-0">
                  <span v-for="tag in note.tags.slice(0,1)" :key="tag.id" class="text-[10px] px-1.5 py-0.5 rounded-full" :style="{background: tag.color+'22', color: tag.color}">{{ tag.name }}</span>
                </div>
              </button>
            </div>

            <!-- Conversations section -->
            <div v-if="convResults.length">
              <div class="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50">
                对话 ({{ convResults.length }})
              </div>
              <button
                v-for="(conv, i) in convResults"
                :key="conv.id"
                class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-b border-gray-50 dark:border-gray-800/50 last:border-0"
                :class="selectedIdx === noteResults.length + i ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
                @click="goToConv(conv)"
              >
                <MessageSquare class="w-4 h-4 text-purple-400 shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" v-html="hl(conv.title)" />
                </div>
                <span class="text-xs text-gray-400 shrink-0">{{ formatDate(conv.updatedAt) }}</span>
              </button>
            </div>
          </template>
        </div>

        <!-- Footer hint -->
        <div class="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 text-[11px] text-gray-400">
          <span><kbd class="border border-gray-200 dark:border-gray-700 rounded px-1">↑↓</kbd> 导航</span>
          <span><kbd class="border border-gray-200 dark:border-gray-700 rounded px-1">Enter</kbd> 跳转</span>
          <span><kbd class="border border-gray-200 dark:border-gray-700 rounded px-1">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Search, FileText, MessageSquare } from '@lucide/vue'
import { useNotesStore, type Note } from '@/stores/notes'
import { useChatStore, type Conversation } from '@/stores/chat'
import { highlightText } from '@/utils/highlight'
import { useRouter } from 'vue-router'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const notesStore = useNotesStore()
const chatStore = useChatStore()

const query = ref('')
const loading = ref(false)
const selectedIdx = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const noteResults = ref<Note[]>([])
const convResults = ref<Conversation[]>([])

onMounted(() => nextTick(() => inputRef.value?.focus()))

// Debounced search
let timer: ReturnType<typeof setTimeout>
watch(query, (q) => {
  clearTimeout(timer)
  selectedIdx.value = 0
  if (!q.trim()) { noteResults.value = []; convResults.value = []; return }
  loading.value = true
  timer = setTimeout(async () => {
    await notesStore.loadAll({ search: q })
    noteResults.value = notesStore.notes.slice(0, 10)
    const qLow = q.toLowerCase()
    convResults.value = chatStore.conversations
      .filter(c => c.title.toLowerCase().includes(qLow))
      .slice(0, 5)
    loading.value = false
  }, 250)
})

function hl(text: string): string { return highlightText(text, query.value) }

function plainPreview(content: string): string {
  return content.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n+/g, ' ').trim().slice(0, 120)
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const totalResults = () => noteResults.value.length + convResults.value.length

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { emit('close'); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx.value = Math.min(selectedIdx.value + 1, totalResults() - 1) }
  if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx.value = Math.max(selectedIdx.value - 1, 0) }
  if (e.key === 'Enter') {
    const i = selectedIdx.value
    if (i < noteResults.value.length) goToNote(noteResults.value[i])
    else goToConv(convResults.value[i - noteResults.value.length])
  }
}

function goToNote(note: Note) {
  emit('close')
  router.push('/notebook')
  // Let Notebook handle deep-linking via query param in next iteration
}

function goToConv(conv: Conversation) {
  emit('close')
  router.push('/chat')
  nextTick(() => chatStore.selectConversation(conv.id))
}
</script>
