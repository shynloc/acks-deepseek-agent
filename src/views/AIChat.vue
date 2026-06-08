<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { MessageSquare, BookOpen, ExternalLink, Trash2, X } from '@lucide/vue'
import ChatHistory from '@/components/chat/ChatHistory.vue'
import MessageBubble from '@/components/chat/MessageBubble.vue'
import ToolCallBubble from '@/components/chat/ToolCallBubble.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import SaveNoteDialog from '@/components/chat/SaveNoteDialog.vue'
import SkillDialog from '@/components/skills/SkillDialog.vue'
import { useChatStore, type Message } from '@/stores/chat'
import { useSkillsStore } from '@/stores/skills'
import { useSettingsStore } from '@/stores/settings'
import type { Note } from '@/stores/notes'
import { useRouter } from 'vue-router'

const chat       = useChatStore()
const skills     = useSkillsStore()
const settings   = useSettingsStore()
const router     = useRouter()
const messagesEl = ref<HTMLElement | null>(null)

// Save note dialog state
const savingMessage = ref<Message | null>(null)

// Skill extract dialog
const showSkillDialog  = ref(false)
function openSkillDialog()  { showSkillDialog.value = true }
function dismissSkillExtract() { chat.pendingSkillExtract = null; showSkillDialog.value = false }
async function saveExtractedSkill(data: any) {
  await skills.create({ ...data, toolSequence: null })
  chat.pendingSkillExtract = null
  showSkillDialog.value = false
}

// Session notes (saved in current chat session)
const sessionNotes = ref<Note[]>([])

onMounted(async () => {
  await settings.load()
  await chat.loadConversations()

  // Consume note context set by Notebook "chat with note" action
  if (chat.pendingNoteContext) {
    const { title, content } = chat.pendingNoteContext
    chat.pendingNoteContext = null
    await chat.createConversation()
    // Pre-inject note as context block into the pending input
    pendingInput.value = `【引用笔记：${title}】\n\n${content}\n\n---\n\n`
  }
})

const pendingInput = ref('')

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

function onSaveToNotebook(message: Message) {
  savingMessage.value = message
}

function onNoteSaved(note: Note) {
  sessionNotes.value.unshift(note)
  savingMessage.value = null
}

function openNoteInNotebook() {
  router.push('/notebook')
}

function removeSessionNote(idx: number) {
  sessionNotes.value.splice(idx, 1)
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Chat History -->
    <aside class="w-60 flex-none border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
      <ChatHistory />
    </aside>

    <!-- Center: Chat Window -->
    <div class="flex-1 flex flex-col min-w-0">

      <!-- Empty / Welcome state -->
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

      <!-- Message list -->
      <div
        v-else
        ref="messagesEl"
        class="flex-1 overflow-y-auto py-2"
      >
        <div v-if="chat.messages.length === 0" class="flex flex-col items-center justify-center h-full gap-2 text-zinc-400 dark:text-zinc-600">
          <MessageSquare class="w-8 h-8" />
          <p class="text-sm">发送第一条消息开始对话</p>
        </div>
        <template v-for="(msg, i) in chat.messages" :key="msg.id">
          <!-- Tool call bubbles shown above the streaming assistant message -->
          <ToolCallBubble
            v-if="chat.isStreaming && i === chat.messages.length - 1 && msg.role === 'assistant' && chat.currentToolCalls.length"
            :records="chat.currentToolCalls"
            class="px-4"
          />
          <MessageBubble
            :message="msg"
            :is-streaming="chat.isStreaming && i === chat.messages.length - 1 && msg.role === 'assistant'"
            @save-to-notebook="onSaveToNotebook"
          />
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
    </div>

    <!-- Right: Session bookmarks -->
    <aside class="w-52 flex-none border-l border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-900/60">
      <div class="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          <BookOpen class="w-3.5 h-3.5 text-blue-500" />本次书签
        </span>
        <span v-if="sessionNotes.length" class="text-xs text-zinc-400">{{ sessionNotes.length }} 篇</span>
      </div>

      <!-- Empty state -->
      <div v-if="!sessionNotes.length" class="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-600 p-4">
        <BookOpen class="w-7 h-7 opacity-40" />
        <p class="text-xs text-center leading-relaxed">
          悬停在 AI 回复上，点击「存入笔记」将内容保存至笔记本
        </p>
      </div>

      <!-- Saved notes list -->
      <div v-else class="flex-1 overflow-y-auto p-2 space-y-1.5">
        <div
          v-for="(note, idx) in sessionNotes"
          :key="note.id"
          class="group bg-white dark:bg-gray-800 rounded-xl p-2.5 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
        >
          <div class="flex items-start justify-between gap-1 mb-1">
            <span class="text-xs font-medium text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">{{ note.title }}</span>
            <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                class="p-0.5 rounded text-gray-400 hover:text-blue-500 transition-colors"
                title="在笔记本中查看"
                @click="openNoteInNotebook"
              ><ExternalLink class="w-3 h-3" /></button>
              <button
                class="p-0.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                title="从列表移除"
                @click="removeSessionNote(idx)"
              ><Trash2 class="w-3 h-3" /></button>
            </div>
          </div>
          <p class="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
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
    </aside>

    <!-- Save to Notebook dialog -->
    <SaveNoteDialog
      v-if="savingMessage"
      :content="savingMessage.content"
      :source-conv-id="chat.currentConversationId ?? undefined"
      :source-msg-id="savingMessage.id"
      @saved="onNoteSaved"
      @cancel="savingMessage = null"
    />

    <!-- Skill extract / create dialog -->
    <SkillDialog
      v-if="showSkillDialog && chat.pendingSkillExtract"
      mode="extract"
      :proposed="chat.pendingSkillExtract"
      @save="saveExtractedSkill"
      @cancel="dismissSkillExtract"
    />
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from, .slide-up-leave-to       { opacity: 0; transform: translateY(8px); }
</style>
