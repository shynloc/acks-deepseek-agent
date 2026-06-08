/// <reference types="vite/client" />

interface Window {
  api: {
    config: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown) => Promise<void>
      delete: (key: string) => Promise<void>
    }
    db: {
      conversations: {
        list: () => Promise<unknown[]>
        create: (c: unknown) => Promise<unknown>
        update: (id: string, patch: unknown) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      messages: {
        list: (cid: string) => Promise<unknown[]>
        create: (cid: string, msg: unknown) => Promise<void>
      }
      categories: {
        list: () => Promise<unknown[]>
        create: (c: unknown) => Promise<unknown>
        update: (id: string, patch: unknown) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      tags: {
        list: () => Promise<unknown[]>
        create: (t: unknown) => Promise<unknown>
        delete: (id: string) => Promise<void>
      }
      notes: {
        list: (filter?: unknown) => Promise<unknown[]>
        create: (n: unknown) => Promise<unknown>
        update: (id: string, patch: unknown) => Promise<void>
        delete: (id: string) => Promise<void>
        setTags: (noteId: string, tagIds: string[]) => Promise<void>
      }
      noteVersions: {
        list: (noteId: string) => Promise<unknown[]>
        get: (versionId: string) => Promise<unknown>
      }
      skills: {
        list: () => Promise<unknown[]>
        create: (s: unknown) => Promise<unknown>
        update: (id: string, patch: unknown) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      plugins: {
        list: () => Promise<unknown[]>
        create: (p: unknown) => Promise<unknown>
        update: (id: string, patch: unknown) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      shortcuts: {
        list: () => Promise<unknown[]>
        add: (noteId: string) => Promise<void>
        remove: (noteId: string) => Promise<void>
      }
      stats: {
        get: () => Promise<{
          noteCount: number; wordCount: number; convCount: number; tokenCount: number
          days: Array<{ label: string; notes: number; messages: number }>
        }>
      }
      export: {
        json: () => Promise<{ success: boolean; filePath?: string }>
        markdown: () => Promise<{ success: boolean; count?: number; dir?: string }>
      }
      import: {
        json: () => Promise<{ success: boolean; count: number }>
        markdown: () => Promise<{ success: boolean; count: number }>
      }
    }
    apiTest: (params: { url: string; apiKey: string; model: string }) => Promise<{
      ok: boolean; status?: number; body?: string; error?: string
    }>
    tavilySearch: (params: { query: string; apiKey: string; maxResults?: number }) => Promise<{
      ok: boolean; data?: { results: Array<{ title: string; url: string; content: string; score: number }>; answer?: string }; status?: number; body?: string; error?: string
    }>
    agent: {
      run: (payload: {
        message: string; conversationId: string
        history: unknown[]; soulContent?: string
      }) => Promise<void>
      abort: (conversationId: string) => void
      getTools: () => Promise<Array<{ name: string; emoji: string; description: string; idempotent: boolean }>>
      onDelta:      (fn: (text: string) => void)                                                                    => () => void
      onToolCall:   (fn: (tc: { name: string; args: unknown; callId: string }) => void)                             => () => void
      onToolResult: (fn: (tr: { name: string; result: string; isError: boolean; callId: string }) => void)          => () => void
      onDone:       (fn: (usage: { promptTokens: number; completionTokens: number }) => void)                       => () => void
      onError:      (fn: (msg: string) => void)                                                                     => () => void
    }
    versions: { node: string; chrome: string; electron: string }
  }
}
