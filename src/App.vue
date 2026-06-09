<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import AppBanner from '@/components/layout/AppBanner.vue'
import GlobalSearch from '@/components/GlobalSearch.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import OnboardingModal from '@/components/OnboardingModal.vue'
import { useUIStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'

const uiStore = useUIStore()
const chatStore = useChatStore()
const settings = useSettingsStore()
const router = useRouter()

const showOnboarding = ref(false)

const showGlobalSearch = ref(false)

function onKeydown(e: KeyboardEvent) {
  // Ctrl/Cmd + Shift + F → global search
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
    e.preventDefault()
    showGlobalSearch.value = !showGlobalSearch.value
    return
  }
  // Ctrl/Cmd + Shift + N → new conversation
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
}

onMounted(async () => {
  await uiStore.loadTheme()
  await settings.load()
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

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
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
