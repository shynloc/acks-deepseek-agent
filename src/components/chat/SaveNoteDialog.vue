<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="$emit('cancel')">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-96 p-5">
      <h3 class="font-semibold text-gray-900 dark:text-gray-100 mb-4">存入笔记本</h3>

      <!-- Title -->
      <div class="mb-3">
        <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">标题</label>
        <input
          v-model="title"
          class="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="笔记标题…"
        />
      </div>

      <!-- Category -->
      <div class="mb-3">
        <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">分类（可选）</label>
        <select
          v-model="categoryId"
          class="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
        >
          <option value="">无分类</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>

      <!-- Content preview -->
      <div class="mb-4">
        <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">内容预览</label>
        <div class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl p-3 max-h-28 overflow-y-auto leading-relaxed">
          {{ previewText }}
        </div>
      </div>

      <div class="flex gap-2 justify-end">
        <button
          class="px-4 py-1.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          @click="$emit('cancel')"
        >取消</button>
        <button
          class="px-4 py-1.5 text-sm rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors flex items-center gap-1.5"
          :disabled="saving"
          @click="handleSave"
        >
          <span v-if="saving" class="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          {{ saving ? '保存中…' : '保存到笔记本' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@/stores/notes'

const props = defineProps<{
  content: string
  sourceConvId?: string
  sourceMsgId?: string
}>()

const emit = defineEmits<{
  saved: [note: Note]
  cancel: []
}>()

const notesStore = useNotesStore()
const categories = computed(() => notesStore.categories)
const saving = ref(false)

// derive title from first non-empty line
const title = ref('')
const categoryId = ref('')

const previewText = computed(() =>
  props.content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
    .slice(0, 300)
)

onMounted(async () => {
  if (!notesStore.categories.length) await notesStore.loadCategories()
  // Auto-generate title from first heading or first words
  const firstLine = props.content.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').slice(0, 50) ?? '来自AI对话'
  title.value = firstLine
})

async function handleSave() {
  saving.value = true
  const note = await notesStore.createNote({
    title: title.value || '来自AI对话',
    content: props.content,
    categoryId: categoryId.value || null,
    color: 'blue',
    sourceType: 'chat',
    sourceId: props.sourceConvId,
    sourceMsgId: props.sourceMsgId
  })
  saving.value = false
  emit('saved', note)
}
</script>
