import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Plugin {
  id: string
  name: string              // snake_case tool name shown to DeepSeek
  displayName: string
  description: string
  endpointUrl: string
  method: 'GET' | 'POST'
  headersJson: string       // JSON object string
  paramSchemaJson: string   // OpenAI function.parameters JSON
  enabled: number           // 1 | 0
  createdAt: number
}

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<Plugin[]>([])
  let _loaded = false

  async function load(): Promise<void> {
    if (_loaded) return
    plugins.value = (await window.api.db.plugins.list()) as Plugin[]
    _loaded = true
  }

  async function create(data: Omit<Plugin, 'id' | 'createdAt'>): Promise<Plugin> {
    const p = { ...data, id: crypto.randomUUID() }
    const saved = await window.api.db.plugins.create(p) as Plugin
    plugins.value.unshift(saved)
    return saved
  }

  async function update(id: string, patch: Partial<Plugin>): Promise<void> {
    await window.api.db.plugins.update(id, patch)
    const idx = plugins.value.findIndex(p => p.id === id)
    if (idx !== -1) plugins.value[idx] = { ...plugins.value[idx], ...patch }
  }

  async function remove(id: string): Promise<void> {
    await window.api.db.plugins.delete(id)
    plugins.value = plugins.value.filter(p => p.id !== id)
  }

  async function toggle(id: string): Promise<void> {
    const p = plugins.value.find(p => p.id === id)
    if (!p) return
    await update(id, { enabled: p.enabled ? 0 : 1 })
  }

  return { plugins, load, create, update, remove, toggle }
})
