import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Tag { id: string; name: string; color: string; orderIndex: number; createdAt: number }
export interface Category { id: string; name: string; parentId: string | null; orderIndex: number; createdAt: number }
export interface Note {
  id: string; title: string; content: string
  categoryId: string | null; color: string; wordCount: number
  createdAt: number; updatedAt: number
  sourceType?: string; sourceId?: string; sourceMsgId?: string
  visibility?: 'private' | 'public'
  memosName?: string | null
  memosSyncedAt?: number | null
  searchSnippet?: string | null   // FTS5 snippet with \x01/\x02 highlight markers
  tags: Tag[]
}

function countWords(text: string): number {
  const chinese = (text.match(/[一-龥]/g) ?? []).length
  const english = (text.match(/\b[a-zA-Z]+\b/g) ?? []).length
  return chinese + english
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const categories = ref<Category[]>([])
  const tags = ref<Tag[]>([])

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadAll(filter?: { categoryId?: string; search?: string }): Promise<void> {
    notes.value = (await window.api.db.notes.list(filter)) as Note[]
  }

  async function loadCategories(): Promise<void> {
    categories.value = (await window.api.db.categories.list()) as Category[]
  }

  async function loadTags(): Promise<void> {
    tags.value = (await window.api.db.tags.list()) as Tag[]
  }

  // ── Notes CRUD ────────────────────────────────────────────────────────────
  async function createNote(data: Partial<Note>): Promise<Note> {
    const note: Note = {
      id: crypto.randomUUID(),
      title: data.title ?? '无标题',
      content: data.content ?? '',
      categoryId: data.categoryId ?? null,
      color: data.color ?? 'none',
      wordCount: countWords(data.content ?? ''),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: []
    }
    await window.api.db.notes.create(note)
    if (data.tags && data.tags.length > 0) {
      await window.api.db.notes.setTags(note.id, data.tags.map(t => t.id))
      note.tags = data.tags
    }
    notes.value.unshift(note)
    return note
  }

  async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
    const idx = notes.value.findIndex(n => n.id === id)
    if (idx === -1) return
    const updated = {
      ...patch,
      wordCount: patch.content !== undefined ? countWords(patch.content) : undefined,
      updatedAt: Date.now()
    }
    await window.api.db.notes.update(id, updated)
    if (patch.tags !== undefined) {
      await window.api.db.notes.setTags(id, patch.tags.map(t => t.id))
    }
    notes.value[idx] = { ...notes.value[idx], ...updated }
  }

  async function deleteNote(id: string): Promise<void> {
    await window.api.db.notes.delete(id)
    notes.value = notes.value.filter(n => n.id !== id)
  }

  // ── Categories ────────────────────────────────────────────────────────────
  async function createCategory(name: string): Promise<Category> {
    const cat: Category = {
      id: crypto.randomUUID(), name,
      parentId: null, orderIndex: categories.value.length, createdAt: Date.now()
    }
    await window.api.db.categories.create(cat)
    categories.value.push(cat)
    return cat
  }

  async function renameCategory(id: string, name: string): Promise<void> {
    await window.api.db.categories.update(id, { name })
    const cat = categories.value.find(c => c.id === id)
    if (cat) cat.name = name
  }

  async function deleteCategory(id: string): Promise<void> {
    await window.api.db.categories.delete(id)
    categories.value = categories.value.filter(c => c.id !== id)
    notes.value = notes.value.map(n => n.categoryId === id ? { ...n, categoryId: null } : n)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  async function createTag(name: string, color: string): Promise<Tag> {
    const tag: Tag = {
      id: crypto.randomUUID(), name, color, orderIndex: tags.value.length, createdAt: Date.now()
    }
    await window.api.db.tags.create(tag)
    tags.value.push(tag)
    return tag
  }

  async function deleteTag(id: string): Promise<void> {
    await window.api.db.tags.delete(id)
    tags.value = tags.value.filter(t => t.id !== id)
    notes.value = notes.value.map(n => ({ ...n, tags: n.tags.filter(t => t.id !== id) }))
  }

  return {
    notes, categories, tags,
    loadAll, loadCategories, loadTags,
    createNote, updateNote, deleteNote,
    createCategory, renameCategory, deleteCategory,
    createTag, deleteTag
  }
})
