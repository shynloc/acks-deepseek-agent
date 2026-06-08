<template>
  <!-- Floating panel, positioned above the input -->
  <div class="absolute bottom-full left-0 right-0 mb-2 z-40">
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
      <!-- Search -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <Search class="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          ref="searchRef"
          v-model="query"
          placeholder="搜索笔记…"
          class="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
        />
        <button class="text-gray-400 hover:text-gray-600" @click="$emit('close')">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Note list -->
      <div class="max-h-56 overflow-y-auto">
        <div v-if="!notes.length && !loading" class="py-6 text-center text-xs text-gray-400">
          暂无笔记
        </div>
        <div v-if="loading" class="py-6 text-center text-xs text-gray-400">加载中…</div>
        <button
          v-for="note in filteredNotes"
          :key="note.id"
          class="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left border-b border-gray-50 dark:border-gray-700/50 last:border-0"
          @click="selectNote(note)"
        >
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ note.title || '无标题' }}</div>
            <div class="text-xs text-gray-400 truncate mt-0.5">{{ plainPreview(note.content) }}</div>
          </div>
          <div class="flex gap-1 shrink-0 mt-0.5">
            <span
              v-for="tag in note.tags.slice(0, 1)"
              :key="tag.id"
              class="text-[10px] px-1.5 py-0.5 rounded-full"
              :style="{ background: tag.color + '22', color: tag.color }"
            >{{ tag.name }}</span>
          </div>
        </button>
      </div>

      <div class="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 text-[11px] text-gray-400">
        点击笔记将其内容作为上下文插入输入框
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { Search, X } from '@lucide/vue'
import { useNotesStore, type Note } from '@/stores/notes'

const emit = defineEmits<{
  pick: [note: Note]
  close: []
}>()

const notesStore = useNotesStore()
const query = ref('')
const loading = ref(false)
const searchRef = ref<HTMLInputElement | null>(null)

const notes = computed(() => notesStore.notes)

const filteredNotes = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return notes.value.slice(0, 20)
  return notes.value.filter(n =>
    n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  ).slice(0, 20)
})

onMounted(async () => {
  if (!notes.value.length) {
    loading.value = true
    await notesStore.loadAll()
    loading.value = false
  }
  nextTick(() => searchRef.value?.focus())
})

function selectNote(note: Note) {
  emit('pick', note)
}

function plainPreview(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 80)
}
</script>
