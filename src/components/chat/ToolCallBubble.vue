<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import type { ToolCallRecord } from '@/stores/chat'

const props = defineProps<{ records: ToolCallRecord[] }>()

const expanded = ref<Set<string>>(new Set())

function toggle(callId: string) {
  if (expanded.value.has(callId)) {
    expanded.value.delete(callId)
  } else {
    expanded.value.add(callId)
  }
  expanded.value = new Set(expanded.value)
}

function fmtArgs(args: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(args)
    return s.length > 120 ? s.slice(0, 120) + '…' : s
  } catch { return '' }
}

function fmtResult(result: string | undefined): string {
  if (!result) return ''
  try {
    const parsed = JSON.parse(result)
    const s = JSON.stringify(parsed, null, 2)
    return s.length > 600 ? s.slice(0, 600) + '\n…' : s
  } catch {
    return result.length > 600 ? result.slice(0, 600) + '…' : result
  }
}

const toolLabels: Record<string, string> = {
  search_notes: '搜索笔记',
  get_note:     '读取笔记',
  list_notes:   '列出笔记',
  create_note:  '创建笔记',
  update_note:  '更新笔记',
  delete_note:  '删除笔记',
  web_search:   '联网搜索',
  get_datetime: '获取时间',
  get_stats:    '统计数据',
  save_memory:  '保存记忆',
  recall_memories: '回忆记忆',
  delete_memory: '删除记忆'
}

function label(name: string): string {
  if (toolLabels[name]) return toolLabels[name]
  // Tencent Docs tools: tdoc__xxx or slide__xxx
  if (name.startsWith('tdoc__'))  return '腾讯文档：' + name.slice(6).replace(/__/g, '.')
  if (name.startsWith('slide__')) return '腾讯幻灯：' + name.slice(7).replace(/__/g, '.')
  return name
}

function isCancelled(rec: ToolCallRecord): boolean {
  if (!rec.result) return false
  try { return JSON.parse(rec.result)?.cancelled === true } catch { return false }
}

const summary = computed(() => {
  const done  = props.records.filter(r => r.status === 'done').length
  const err   = props.records.filter(r => r.status === 'error').length
  const total = props.records.length
  if (total === 0) return ''
  if (props.records.some(r => r.status === 'calling')) return `调用工具中…`
  if (err > 0) return `${done} 项完成，${err} 项失败`
  return `已调用 ${total} 个工具`
})
</script>

<template>
  <div v-if="records.length" class="my-2 space-y-1.5">
    <!-- Summary row -->
    <div class="text-xs text-gray-400 dark:text-gray-500 px-1">{{ summary }}</div>

    <!-- Individual tool call rows -->
    <div
      v-for="rec in records"
      :key="rec.callId"
      class="rounded-xl border text-xs overflow-hidden transition-all"
      :class="{
        'border-blue-200  dark:border-blue-800  bg-blue-50  dark:bg-blue-900/20':   rec.status === 'calling',
        'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20':  rec.status === 'done' && !isCancelled(rec),
        'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20':  rec.status === 'done' && isCancelled(rec),
        'border-red-200   dark:border-red-800   bg-red-50   dark:bg-red-900/20':    rec.status === 'error'
      }"
    >
      <!-- Header row -->
      <button
        class="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition-opacity"
        @click="toggle(rec.callId)"
      >
        <!-- Status indicator -->
        <span class="flex-none">
          <span v-if="rec.status === 'calling'" class="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span v-else-if="rec.status === 'done' && isCancelled(rec)">🚫</span>
          <span v-else-if="rec.status === 'done'">✅</span>
          <span v-else>❌</span>
        </span>

        <!-- Emoji + label -->
        <span class="flex-none">{{ rec.emoji }}</span>
        <span class="font-medium text-gray-700 dark:text-gray-300">{{ label(rec.name) }}</span>

        <!-- Args preview -->
        <span class="flex-1 truncate text-gray-400 dark:text-gray-500 font-mono">
          {{ fmtArgs(rec.args) }}
        </span>

        <!-- Expand toggle (only when done/error) -->
        <span v-if="rec.status !== 'calling'" class="flex-none text-gray-400">
          <ChevronDown v-if="expanded.has(rec.callId)" class="w-3 h-3" />
          <ChevronRight v-else class="w-3 h-3" />
        </span>
      </button>

      <!-- Expanded result -->
      <Transition name="expand">
        <div
          v-if="expanded.has(rec.callId) && rec.result"
          class="border-t border-inherit px-3 py-2"
        >
          <pre class="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400 font-mono leading-relaxed">{{ fmtResult(rec.result) }}</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active, .expand-leave-active { transition: all 0.2s ease; }
.expand-enter-from, .expand-leave-to       { opacity: 0; max-height: 0; }
.expand-enter-to,   .expand-leave-from     { opacity: 1; max-height: 400px; }
</style>
