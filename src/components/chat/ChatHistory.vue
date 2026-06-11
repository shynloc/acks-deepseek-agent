<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Trash2, Pencil, Check, X, MessageSquare, Search } from '@lucide/vue'
import { useChatStore, type Conversation } from '@/stores/chat'
import dayjs from 'dayjs'

const chat = useChatStore()
// Loading flag: true until first conversations load completes
const isLoading = computed(() => chat.conversationsLoading)
const editingId = ref<string | null>(null)
const editingTitle = ref('')
const searchQuery = ref('')

const filteredConversations = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return chat.conversations
  return chat.conversations.filter(c => c.title.toLowerCase().includes(q))
})

function startEdit(conv: Conversation, e: MouseEvent): void {
  e.stopPropagation()
  editingId.value = conv.id
  editingTitle.value = conv.title
}

async function confirmEdit(): Promise<void> {
  if (!editingId.value || !editingTitle.value.trim()) { cancelEdit(); return }
  await chat.renameConversation(editingId.value, editingTitle.value.trim())
  editingId.value = null
}

function cancelEdit(): void { editingId.value = null }

async function del(conv: Conversation, e: MouseEvent): Promise<void> {
  e.stopPropagation()
  await chat.deleteConversation(conv.id)
}

function formatTime(ts: number): string {
  const d = dayjs(ts)
  return d.isToday() ? d.format('HH:mm') : d.format('MM/DD')
}

function highlight(text: string, q: string): string {
  if (!q.trim()) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">$1</mark>')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- New conversation button + search -->
    <div class="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
      <button
        @click="chat.createConversation()"
        class="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
      >
        <Plus class="w-3.5 h-3.5" />新建对话
      </button>
      <div class="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5">
        <Search class="w-3 h-3 text-zinc-400 shrink-0" />
        <input
          v-model="searchQuery"
          placeholder="搜索对话…"
          class="flex-1 bg-transparent text-xs outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="text-zinc-400 hover:text-zinc-600">
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Conversation list -->
    <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
      <!-- Skeleton while loading -->
      <template v-if="isLoading">
        <div v-for="i in 5" :key="i" class="px-2.5 py-2 rounded-lg animate-pulse">
          <div class="h-3.5 rounded bg-zinc-200 dark:bg-zinc-700 mb-1.5" :style="`width: ${55 + i * 8}%`" />
          <div class="h-2.5 rounded bg-zinc-100 dark:bg-zinc-800 w-12" />
        </div>
      </template>

      <div
        v-else-if="filteredConversations.length === 0"
        class="flex flex-col items-center justify-center h-32 gap-2 text-zinc-400 dark:text-zinc-600"
      >
        <MessageSquare class="w-7 h-7" />
        <p class="text-xs">{{ searchQuery ? '无匹配结果' : '暂无历史对话' }}</p>
      </div>

      <div
        v-else
        v-for="conv in filteredConversations"
        :key="conv.id"
        @click="chat.selectConversation(conv.id)"
        class="group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
        :class="chat.currentConversationId === conv.id
          ? 'bg-blue-100 dark:bg-blue-950/60'
          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'"
      >
        <template v-if="editingId === conv.id">
          <input
            v-model="editingTitle"
            @click.stop
            @keydown.enter="confirmEdit"
            @keydown.esc="cancelEdit"
            class="flex-1 bg-transparent border-b border-blue-500 outline-none text-sm py-0.5 text-zinc-900 dark:text-zinc-100"
            autofocus
          />
          <button @click.stop="confirmEdit" class="text-emerald-500 hover:text-emerald-400 flex-none"><Check class="w-3.5 h-3.5" /></button>
          <button @click.stop="cancelEdit" class="text-zinc-400 hover:text-zinc-300 flex-none"><X class="w-3.5 h-3.5" /></button>
        </template>

        <template v-else>
          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <span
              class="truncate text-sm leading-snug"
              :class="chat.currentConversationId === conv.id
                ? 'text-blue-700 dark:text-blue-300 font-semibold'
                : 'text-zinc-800 dark:text-zinc-200 font-medium'"
              v-html="highlight(conv.title || '新对话', searchQuery)"
            />
            <span class="text-[11px] text-zinc-400 dark:text-zinc-500">{{ formatTime(conv.updatedAt) }}</span>
          </div>
          <div class="hidden group-hover:flex items-center gap-1 flex-none">
            <button @click="startEdit(conv, $event)" class="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500">
              <Pencil class="w-3 h-3" />
            </button>
            <button @click="del(conv, $event)" class="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-zinc-400 dark:text-zinc-500 hover:text-red-500">
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
