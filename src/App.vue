<script setup lang="ts">
import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import AppBanner from '@/components/layout/AppBanner.vue'
import GlobalSearch from '@/components/GlobalSearch.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import OnboardingModal from '@/components/OnboardingModal.vue'
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal.vue'
import { Trash2 } from '@lucide/vue'
import { useUIStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

// ── Global destructive action confirmation dialog ──────────────────────────────
// Lives here (not AIChat.vue) so it remains visible during cross-page navigation
const confirmDialog = ref<{ reqId: string; name: string; args: Record<string, unknown> } | null>(null)
let offConfirm: (() => void) | null = null
const CONFIRM_LABELS: Record<string, string> = {
  delete_note: '删除笔记', delete_memory: '删除记忆', delete_conversation: '删除对话'
}
function onConfirm(confirmed: boolean) {
  if (!confirmDialog.value) return
  window.api.agent.confirmResponse(confirmDialog.value.reqId, confirmed)
  confirmDialog.value = null
}

const uiStore = useUIStore()
const chatStore = useChatStore()
const settings = useSettingsStore()
const toast = useToastStore()
const router = useRouter()

const showOnboarding = ref(false)

// ── Global renderer error guards ──────────────────────────────────────────────
const instance = getCurrentInstance()
if (instance?.appContext.app) {
  instance.appContext.app.config.errorHandler = (err, _vm, info) => {
    console.error('[vue] errorHandler:', info, err)
    toast.error(`界面错误：${(err as Error)?.message ?? String(err)}`)
  }
}

window.addEventListener('unhandledrejection', (e) => {
  console.error('[renderer] unhandledRejection:', e.reason)
  // Only surface DB/IPC errors to the user; suppress noise from abort signals
  const msg: string = (e.reason as Error)?.message ?? String(e.reason)
  if (msg && !msg.includes('AbortError') && !msg.includes('abort')) {
    toast.error(`后台错误：${msg}`)
  }
})

const showGlobalSearch    = ref(false)
const showKeyboardShortcuts = ref(false)

function onKeydown(e: KeyboardEvent) {
  // Cmd+, → settings/profile
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === ',') {
    e.preventDefault()
    router.push('/profile')
    return
  }
  // Cmd+N → new conversation
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'n') {
    e.preventDefault()
    router.push('/chat')
    setTimeout(() => chatStore.createConversation(), 100)
    return
  }
  // Ctrl/Cmd + Shift + F → global search
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
    e.preventDefault()
    showGlobalSearch.value = !showGlobalSearch.value
    return
  }
  // Ctrl/Cmd + Shift + N → new conversation (alias)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'n') {
    e.preventDefault()
    router.push('/chat')
    setTimeout(() => chatStore.createConversation(), 100)
    return
  }
  // Ctrl/Cmd + Shift + E → new note
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'e') {
    e.preventDefault()
    router.push('/notebook')
    return
  }
  // Cmd+? or Ctrl+? → keyboard shortcuts reference
  if ((e.ctrlKey || e.metaKey) && e.key === '?') {
    e.preventDefault()
    showKeyboardShortcuts.value = !showKeyboardShortcuts.value
    return
  }
  // Escape → close any modal (global fallback)
  if (e.key === 'Escape') {
    if (showKeyboardShortcuts.value) { showKeyboardShortcuts.value = false; return }
    if (showGlobalSearch.value)      { showGlobalSearch.value = false;      return }
  }
}

// Handle tray menu actions (cross-platform: main process sends IPC on tray click)
let removeTrayListeners: (() => void)[] = []

onMounted(async () => {
  await uiStore.loadTheme()
  await settings.load()

  offConfirm = window.api.agent.onConfirmRequest(req => { confirmDialog.value = req })

  removeTrayListeners.push(
    window.api.tray.onNewChat(() => {
      router.push('/')
      setTimeout(() => chatStore.createConversation(), 100)
    }),
    window.api.tray.onNewNote(() => {
      router.push('/notebook')
    })
  )
  // Show onboarding for first-run (no API key configured yet)
  const seen = await window.api.config.get('onboarding_seen')
  if (!seen && !settings.apiKey) {
    showOnboarding.value = true
  }
  window.addEventListener('keydown', onKeydown)
})

async function dismissOnboarding() {
  showOnboarding.value = false
  await window.api.config.set('onboarding_seen', true)
}

onUnmounted(() => {
  offConfirm?.()
  window.removeEventListener('keydown', onKeydown)
  removeTrayListeners.forEach(fn => fn())
})
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
    <AppBanner />
    <main class="flex-1 overflow-hidden">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>
    <GlobalSearch v-if="showGlobalSearch" @close="showGlobalSearch = false" />
    <OnboardingModal v-if="showOnboarding" @done="dismissOnboarding" />
    <KeyboardShortcutsModal v-if="showKeyboardShortcuts" @close="showKeyboardShortcuts = false" />
    <ToastContainer />

    <!-- Destructive action confirmation dialog (global — survives page navigation) -->
    <Transition name="modal">
      <div v-if="confirmDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 p-6 mx-4 max-w-sm w-full">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <Trash2 class="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p class="font-semibold text-zinc-800 dark:text-zinc-100">确认执行</p>
              <p class="text-xs text-zinc-500">{{ CONFIRM_LABELS[confirmDialog.name] ?? confirmDialog.name }}</p>
            </div>
          </div>
          <p class="text-sm text-zinc-600 dark:text-zinc-300 mb-1">AI 即将执行以下不可撤销的操作：</p>
          <pre class="text-xs bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 mb-4 overflow-x-auto max-h-28">{{ JSON.stringify(confirmDialog.args, null, 2) }}</pre>
          <div class="flex gap-2 justify-end">
            <button
              class="px-4 py-2 rounded-xl text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              @click="onConfirm(false)"
            >取消</button>
            <button
              class="px-4 py-2 rounded-xl text-sm bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
              @click="onConfirm(true)"
            >确认执行</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.modal-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.modal-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.97); }
</style>
