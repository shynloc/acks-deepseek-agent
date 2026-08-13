import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive, ref } from 'vue'
import { useNotesStore, type Tag } from '../src/stores/notes'

// Every argument to ipcRenderer.invoke goes through the structured clone algorithm,
// which rejects Proxy objects outright ("An object could not be cloned"). Vue's
// reactive state IS proxied, so any payload read back out of a store — rather than
// built fresh — fails at the IPC boundary. That mistake silently cost two months of
// assistant replies once already (see the assistant-message persist path in
// stores/chat.ts), so the fake below enforces the same rule the real boundary does.

const calls: { channel: string; args: unknown[] }[] = []

function ipc(channel: string) {
  return (...args: unknown[]): Promise<undefined> => {
    for (const a of args) structuredClone(a) // throws exactly as Electron would
    calls.push({ channel, args })
    return Promise.resolve(undefined)
  }
}

const api = {
  db: {
    notes:      { create: ipc('notes:create'), update: ipc('notes:update'),
                  delete: ipc('notes:delete'), setTags: ipc('notes:setTags'), list: ipc('notes:list') },
    categories: { create: ipc('categories:create'), update: ipc('categories:update'),
                  delete: ipc('categories:delete'), list: ipc('categories:list') },
    tags:       { create: ipc('tags:create'), delete: ipc('tags:delete'), list: ipc('tags:list') },
  }
}

;(globalThis as any).window = { api }

const tag = (id: string): Tag => ({ id, name: `tag-${id}`, color: '#6B7280', orderIndex: 0, createdAt: 1 })

describe('structured clone rejects Vue proxies', () => {
  // Documents the underlying constraint the rest of this file guards against.
  it('clones a plain object but not a reactive one', () => {
    expect(() => structuredClone({ id: 'n1', tags: [tag('t1')] })).not.toThrow()
    expect(() => structuredClone(reactive({ id: 'n1' }))).toThrow()
    // Reading an element back out of a reactive array yields a proxy too — this is
    // the exact shape that `availableTags.filter(...)` produces in NoteEditor.
    const arr = ref([tag('t1')])
    expect(() => structuredClone(arr.value.filter(Boolean))).toThrow()
  })
})

describe('notes store IPC payloads', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    calls.length = 0
  })

  it('updateNote survives tags taken straight from reactive state', async () => {
    const store = useNotesStore()
    store.tags = [tag('t1'), tag('t2')]
    store.notes = [{
      id: 'n1', title: 'a', content: 'b', categoryId: null, color: 'none',
      wordCount: 1, createdAt: 1, updatedAt: 1, tags: []
    }]

    // Mirrors NoteEditor.handleSave: tags are filtered out of the store's own array,
    // so each element is a reactive proxy.
    const selected = store.tags.filter(t => t.id === 't1')

    await expect(
      store.updateNote('n1', { title: 'updated', tags: selected })
    ).resolves.toBeUndefined()

    const update = calls.find(c => c.channel === 'notes:update')
    expect(update).toBeDefined()
    // tags are persisted through setTags, and must not ride along in the update patch
    expect(update!.args[1]).not.toHaveProperty('tags')
    expect(calls.find(c => c.channel === 'notes:setTags')!.args[1]).toEqual(['t1'])
  })

  it('createNote sends a cloneable note and tag ids', async () => {
    const store = useNotesStore()
    store.tags = [tag('t1')]
    const selected = store.tags.filter(Boolean)

    await expect(
      store.createNote({ title: 'x', content: 'y', tags: selected })
    ).resolves.toBeDefined()

    expect(calls.find(c => c.channel === 'notes:create')).toBeDefined()
    expect(calls.find(c => c.channel === 'notes:setTags')!.args[1]).toEqual(['t1'])
  })

  it('category and tag creation payloads are cloneable', async () => {
    const store = useNotesStore()
    await expect(store.createCategory('cat')).resolves.toBeDefined()
    await expect(store.createTag('tag', '#fff')).resolves.toBeDefined()
    await expect(store.renameCategory('c1', 'new')).resolves.toBeUndefined()
  })
})
