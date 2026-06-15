<script setup lang="ts">
import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import AppBanner from '@/components/layout/AppBanner.vue'
import GlobalSearch from '@/components/GlobalSearch.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import OnboardingModal from '@/components/OnboardingModal.vue'
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal.vue'
import { useUIStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

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
</style>
