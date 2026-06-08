import { contextBridge, ipcRenderer } from 'electron'

const api = {
  config: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('config:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('config:delete', key)
  },
  db: {
    conversations: {
      list: (): Promise<unknown[]> => ipcRenderer.invoke('db:conversations:list'),
      create: (c: unknown): Promise<unknown> => ipcRenderer.invoke('db:conversations:create', c),
      update: (id: string, patch: unknown): Promise<void> => ipcRenderer.invoke('db:conversations:update', id, patch),
      delete: (id: string): Promise<void> => ipcRenderer.invoke('db:conversations:delete', id)
    },
    messages: {
      list: (cid: string): Promise<unknown[]> => ipcRenderer.invoke('db:messages:list', cid),
      create: (cid: string, msg: unknown): Promise<void> => ipcRenderer.invoke('db:messages:create', cid, msg)
    },
    categories: {
      list: (): Promise<unknown[]> => ipcRenderer.invoke('db:categories:list'),
      create: (c: unknown): Promise<unknown> => ipcRenderer.invoke('db:categories:create', c),
      update: (id: string, patch: unknown): Promise<void> => ipcRenderer.invoke('db:categories:update', id, patch),
      delete: (id: string): Promise<void> => ipcRenderer.invoke('db:categories:delete', id)
    },
    tags: {
      list: (): Promise<unknown[]> => ipcRenderer.invoke('db:tags:list'),
      create: (t: unknown): Promise<unknown> => ipcRenderer.invoke('db:tags:create', t),
      delete: (id: string): Promise<void> => ipcRenderer.invoke('db:tags:delete', id)
    },
    notes: {
      list: (filter?: unknown): Promise<unknown[]> => ipcRenderer.invoke('db:notes:list', filter),
      create: (n: unknown): Promise<unknown> => ipcRenderer.invoke('db:notes:create', n),
      update: (id: string, patch: unknown): Promise<void> => ipcRenderer.invoke('db:notes:update', id, patch),
      delete: (id: string): Promise<void> => ipcRenderer.invoke('db:notes:delete', id),
      setTags: (noteId: string, tagIds: string[]): Promise<void> => ipcRenderer.invoke('db:notes:setTags', noteId, tagIds)
    },
    noteVersions: {
      list: (noteId: string): Promise<unknown[]> => ipcRenderer.invoke('db:note_versions:list', noteId),
      get: (versionId: string): Promise<unknown> => ipcRenderer.invoke('db:note_versions:get', versionId)
    },
    shortcuts: {
      list: (): Promise<unknown[]> => ipcRenderer.invoke('db:shortcuts:list'),
      add: (noteId: string): Promise<void> => ipcRenderer.invoke('db:shortcuts:add', noteId),
      remove: (noteId: string): Promise<void> => ipcRenderer.invoke('db:shortcuts:remove', noteId)
    },
    stats: {
      get: (): Promise<unknown> => ipcRenderer.invoke('db:stats:get')
    },
    export: {
      json: (): Promise<{ success: boolean; filePath?: string }> => ipcRenderer.invoke('db:export:json'),
      markdown: (): Promise<{ success: boolean; count?: number; dir?: string }> => ipcRenderer.invoke('db:export:markdown')
    },
    import: {
      json: (): Promise<{ success: boolean; count: number }> => ipcRenderer.invoke('db:import:json'),
      markdown: (): Promise<{ success: boolean; count: number }> => ipcRenderer.invoke('db:import:markdown')
    }
  },
  apiTest: (params: { url: string; apiKey: string; model: string }) =>
    ipcRenderer.invoke('api:test', params),
  tavilySearch: (params: { query: string; apiKey: string; maxResults?: number }) =>
    ipcRenderer.invoke('tavily:search', params),
  agent: {
    run: (payload: {
      message: string; conversationId: string
      history: unknown[]; soulContent?: string
    }) => ipcRenderer.invoke('agent:run', payload),

    abort: (conversationId: string) =>
      ipcRenderer.send('agent:abort', conversationId),

    getTools: () => ipcRenderer.invoke('agent:get-tools'),

    onDelta: (fn: (text: string) => void) => {
      const h = (_: Electron.IpcRendererEvent, t: string) => fn(t)
      ipcRenderer.on('agent:delta', h)
      return () => ipcRenderer.removeListener('agent:delta', h)
    },
    onToolCall: (fn: (tc: { name: string; args: unknown; callId: string }) => void) => {
      const h = (_: Electron.IpcRendererEvent, tc: any) => fn(tc)
      ipcRenderer.on('agent:tool-call', h)
      return () => ipcRenderer.removeListener('agent:tool-call', h)
    },
    onToolResult: (fn: (tr: { name: string; result: string; isError: boolean; callId: string }) => void) => {
      const h = (_: Electron.IpcRendererEvent, tr: any) => fn(tr)
      ipcRenderer.on('agent:tool-result', h)
      return () => ipcRenderer.removeListener('agent:tool-result', h)
    },
    onDone: (fn: (usage: { promptTokens: number; completionTokens: number }) => void) => {
      const h = (_: Electron.IpcRendererEvent, u: any) => fn(u)
      ipcRenderer.on('agent:done', h)
      return () => ipcRenderer.removeListener('agent:done', h)
    },
    onError: (fn: (msg: string) => void) => {
      const h = (_: Electron.IpcRendererEvent, m: string) => fn(m)
      ipcRenderer.on('agent:error', h)
      return () => ipcRenderer.removeListener('agent:error', h)
    }
  },
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
}

contextBridge.exposeInMainWorld('api', api)
export type ElectronAPI = typeof api
