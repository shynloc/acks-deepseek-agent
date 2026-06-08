<template>
  <div
    class="group relative rounded-xl border transition-all duration-200 cursor-pointer select-none"
    :class="[colorBg, selected ? 'ring-2 ring-blue-500 border-transparent' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600']"
    @click="$emit('select', note)"
    @dblclick="$emit('edit', note)"
  >
    <!-- Color bar -->
    <div v-if="note.color && note.color !== 'none'" class="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" :class="colorBar" />

    <div class="p-4" :class="note.color && note.color !== 'none' ? 'pl-5' : ''">
      <!-- Header row -->
      <div class="flex items-start justify-between gap-2 mb-2">
        <h3
          class="font-semibold text-sm leading-snug text-gray-900 dark:text-gray-100 line-clamp-2 flex-1"
          v-html="highlightText(note.title || '无标题', searchQuery ?? '')"
        />
        <div v-if="note.tags?.length" class="flex flex-wrap gap-1 shrink-0">
          <span
            v-for="tag in note.tags.slice(0, 2)"
            :key="tag.id"
            class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            :style="{ background: tag.color + '22', color: tag.color }"
          >{{ tag.name }}</span>
          <span v-if="note.tags.length > 2" class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            +{{ note.tags.length - 2 }}
          </span>
        </div>
      </div>

      <!-- Content preview -->
      <p
        class="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed mb-3"
        v-html="highlightText(plainPreview, searchQuery ?? '')"
      />

      <!-- Footer -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
          <span>{{ formatDate(note.updatedAt) }}</span>
          <span v-if="note.wordCount">· {{ note.wordCount }}字</span>
          <span v-if="categoryName" class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{{ categoryName }}</span>
        </div>

        <!-- Action buttons (shown on hover) -->
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-violet-500 transition-colors"
            title="用 AI 对话此笔记"
            @click.stop="$emit('chat', note)"
          >
            <MessageSquare class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-amber-500 transition-colors"
            title="快捷方式"
            @click.stop="$emit('shortcut', note)"
          >
            <Bookmark class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition-colors"
            title="编辑"
            @click.stop="$emit('edit', note)"
          >
            <Pencil class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors"
            title="删除"
            @click.stop="$emit('delete', note)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Bookmark, Pencil, Trash2, MessageSquare } from '@lucide/vue'
import { highlightText } from '@/utils/highlight'
import type { Note, Category } from '@/stores/notes'

const props = defineProps<{
  note: Note
  categories: Category[]
  selected?: boolean
  searchQuery?: string
}>()

defineEmits<{
  select: [note: Note]
  edit: [note: Note]
  delete: [note: Note]
  shortcut: [note: Note]
  chat: [note: Note]
}>()

const colorMap: Record<string, { bg: string; bar: string }> = {
  red:    { bg: 'bg-red-50 dark:bg-red-950/30',    bar: 'bg-red-400' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/30', bar: 'bg-orange-400' },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', bar: 'bg-yellow-400' },
  green:  { bg: 'bg-green-50 dark:bg-green-950/30',  bar: 'bg-green-400' },
  blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30',   bar: 'bg-blue-400' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', bar: 'bg-purple-400' },
  none:   { bg: 'bg-white dark:bg-gray-800',         bar: '' }
}

const colorBg = computed(() => (colorMap[props.note.color] ?? colorMap.none).bg)
const colorBar = computed(() => (colorMap[props.note.color] ?? colorMap.none).bar)

const categoryName = computed(() =>
  props.note.categoryId ? props.categories.find(c => c.id === props.note.categoryId)?.name ?? '' : ''
)

const plainPreview = computed(() =>
  props.note.content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 200)
)

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isThisYear) return `${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
</script>
