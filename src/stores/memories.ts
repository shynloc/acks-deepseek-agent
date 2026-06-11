import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Memory {
  id:          string
  content:     string
  category:    'user' | 'preference' | 'project' | 'general'
  importance:  number   // 1–10
  isPinned:    boolean
  recallCount: number
  lastRecalled?: number
  isArchived:  boolean
  createdAt:   number
  updatedAt:   number
}

export const MEMORY_CATEGORIES = [
  { id: 'user',       label: '用户信息', color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'preference', label: '偏好习惯', color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  { id: 'project',    label: '项目背景', color: 'text-emerald-500',bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  { id: 'general',    label: '通用记忆', color: 'text-zinc-500',   bg: 'bg-zinc-100 dark:bg-zinc-800' },
] as const

export const useMemoriesStore = defineStore('memories', () => {
  const memories         = ref<Memory[]>([])
  const archivedMemories = ref<Memory[]>([])
  const loading          = ref(false)
  const consolidating    = ref(false)
  const showArchived     = ref(false)

  const activeMemories = computed(() => memories.value.filter(m => !m.isArchived))
  const pinnedMemories = computed(() => activeMemories.value.filter(m => m.isPinned))

  async function load(): Promise<void> {
    loading.value = true
    try {
      const all = (await (window.api.db as any).memories.list({ limit: 200 }) as any[]).map(toMemory)
      memories.value         = all.filter(m => !m.isArchived)
      archivedMemories.value = all.filter(m => m.isArchived)
    } finally {
      loading.value = false
    }
  }

  async function create(m: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'isPinned' | 'recallCount' | 'isArchived'>): Promise<Memory> {
    const id = crypto.randomUUID()
    const row = await (window.api.db as any).memories.create({ id, ...m }) as any
    const mem = toMemory(row)
    memories.value.unshift(mem)
    return mem
  }

  async function remove(id: string): Promise<void> {
    await (window.api.db as any).memories.delete(id)
    memories.value         = memories.value.filter(m => m.id !== id)
    archivedMemories.value = archivedMemories.value.filter(m => m.id !== id)
  }

  async function update(id: string, patch: { content?: string; importance?: number }): Promise<void> {
    await (window.api.db as any).memories.update(id, patch)
    const m = [...memories.value, ...archivedMemories.value].find(x => x.id === id)
    if (m) {
      if (patch.content    !== undefined) m.content    = patch.content
      if (patch.importance !== undefined) m.importance = patch.importance
    }
  }

  async function pin(id: string): Promise<void> {
    const m = memories.value.find(x => x.id === id)
    if (!m) return
    const newPinned = !m.isPinned
    await (window.api.db as any).memories.update(id, { isPinned: newPinned })
    m.isPinned = newPinned
  }

  async function archive(id: string): Promise<void> {
    await (window.api.db as any).memories.update(id, { isArchived: true })
    const idx = memories.value.findIndex(x => x.id === id)
    if (idx >= 0) {
      const [m] = memories.value.splice(idx, 1)
      m.isArchived = true
      archivedMemories.value.unshift(m)
    }
  }

  async function restore(id: string): Promise<void> {
    await (window.api.db as any).memories.update(id, { isArchived: false })
    const idx = archivedMemories.value.findIndex(x => x.id === id)
    if (idx >= 0) {
      const [m] = archivedMemories.value.splice(idx, 1)
      m.isArchived = false
      memories.value.unshift(m)
    }
  }

  async function consolidate(): Promise<{ kept: number; deleted: number } | null> {
    consolidating.value = true
    try {
      const result = await (window.api.db as any).memories.consolidate() as any
      if (result.success) {
        await load()
        return { kept: result.kept ?? 0, deleted: result.deleted ?? 0 }
      }
      return null
    } finally {
      consolidating.value = false
    }
  }

  async function search(query: string): Promise<Memory[]> {
    const rows = await (window.api.db as any).memories.search(query, 20) as any[]
    return rows.map(toMemory)
  }

  return {
    memories, archivedMemories, activeMemories, pinnedMemories,
    loading, consolidating, showArchived,
    load, create, remove, update, pin, archive, restore, consolidate, search
  }
})

function toMemory(r: any): Memory {
  return {
    id:          r.id,
    content:     r.content,
    category:    r.category ?? 'general',
    importance:  r.importance ?? 5,
    isPinned:    Boolean(r.is_pinned ?? r.isPinned ?? 0),
    recallCount: Number(r.recall_count ?? r.recallCount ?? 0),
    lastRecalled: r.last_recalled ?? r.lastRecalled ?? undefined,
    isArchived:  Boolean(r.is_archived ?? r.isArchived ?? 0),
    createdAt:   r.created_at ?? r.createdAt ?? Date.now(),
    updatedAt:   r.updated_at ?? r.updatedAt ?? Date.now(),
  }
}
