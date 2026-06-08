import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useUIStore = defineStore('ui', () => {
  const isDark = ref(false)

  function toggleTheme(): void {
    isDark.value = !isDark.value
    window.api.config.set('theme', isDark.value ? 'dark' : 'light')
  }

  async function loadTheme(): Promise<void> {
    const saved = await window.api.config.get('theme') as string | undefined
    if (saved === 'dark') {
      isDark.value = true
    } else if (!saved) {
      // 首次使用，跟随系统
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
  }

  watch(isDark, (dark) => {
    document.documentElement.classList.toggle('dark', dark)
  })

  return { isDark, toggleTheme, loadTheme }
})
