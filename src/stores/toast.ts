import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  message: string
}

/** 同屏最多并存的条数，超出时挤掉最旧的一条 */
const MAX_VISIBLE = 3

/** 单条文案上限。Toast 悬浮在内容区顶部，过长会遮挡消息流与列表 */
const MAX_LENGTH = 120

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  function show(type: ToastType, message: string, duration = 3500) {
    const id = crypto.randomUUID()
    const text = message.length > MAX_LENGTH ? message.slice(0, MAX_LENGTH - 1) + '…' : message
    toasts.value.push({ id, type, message: text })
    // 队列上限：错误连发时（如流式请求反复失败）不至于糊满整屏
    if (toasts.value.length > MAX_VISIBLE) toasts.value.splice(0, toasts.value.length - MAX_VISIBLE)
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
