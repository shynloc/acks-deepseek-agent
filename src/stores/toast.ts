import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  message: string
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  function show(type: ToastType, message: string, duration = 3500) {
    const id = crypto.randomUUID()
    toasts.value.push({ id, type, message })
    setTimeout(() => dismiss(id), duration)
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  const success = (msg: string) => show('success', msg)
  const error   = (msg: string) => show('error',   msg, 5000)
  const info    = (msg: string) => show('info',    msg)
  const warning = (msg: string) => show('warning', msg)

  return { toasts, dismiss, success, error, info, warning }
})
