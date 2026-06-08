import { ipcMain, dialog, net } from 'electron'
import Store from 'electron-store'
import fs from 'fs'
import { getDatabase } from '../db'

const store = new Store()

// snake_case rows → camelCase objects
function cc(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  )
}

function ccAll(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(cc)
}

export function registerIpcHandlers(): void {
  // ── Config ────────────────────────────────────────────────────────────────
  ipcMain.handle('config:get', (_, key: string) => store.get(key))
  ipcMain.handle('config:set', (_, key: string, value: unknown) => { store.set(key, value as any) })
  ipcMain.handle('config:delete', (_, key: string) => { store.delete(key as any) })

  // ── Conversations ─────────────────────────────────────────────────────────
  ipcMain.handle('db:conversations:list', () => {
    const rows = getDatabase().prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as any[]
    return ccAll(rows.map(r => ({ ...r, title: r.title || '新对话' })))
  })

  ipcMain.handle('db:conversations:create', (_, c: any) => {
    getDatabase().prepare(`
      INSERT INTO conversations (id, title, model, created_at, updated_at, system_prompt)
      VALUES (@id, @title, @model, @createdAt, @updatedAt, @systemPrompt)
    `).run({ id: c.id, title: c.title, model: c.model, createdAt: c.createdAt, updatedAt: c.updatedAt, systemPrompt: c.systemPrompt ?? null })
    return c
  })

  ipcMain.handle('db:conversations:update', (_, id: string, patch: any) => {
    const db = getDatabase()
    const parts: string[] = []
    const params: any = { id }
    if (patch.title !== undefined) { parts.push('title = @title'); params.title = patch.title }
    if (patch.updatedAt !== undefined) { parts.push('updated_at = @updatedAt'); params.updatedAt = patch.updatedAt }
    if (parts.length) db.prepare(`UPDATE conversations SET ${parts.join(', ')} WHERE id = @id`).run(params)
  })

  ipcMain.handle('db:conversations:delete', (_, id: string) =>
    getDatabase().prepare('DELETE FROM conversations WHERE id = ?').run(id)
  )

  // ── Messages ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:messages:list', (_, conversationId: string) =>
    ccAll(getDatabase().prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[])
  )

  ipcMain.handle('db:messages:create', (_, conversationId: string, m: any) => {
    getDatabase().prepare(`
      INSERT INTO messages (id, conversation_id, role, content, tokens_used, created_at)
      VALUES (@id, @conversationId, @role, @content, @tokensUsed, @createdAt)
    `).run({ id: m.id, conversationId, role: m.role, content: m.content, tokensUsed: m.tokensUsed ?? 0, createdAt: m.createdAt })
  })

  // ── Categories ────────────────────────────────────────────────────────────
  ipcMain.handle('db:categories:list', () =>
    ccAll(getDatabase().prepare('SELECT * FROM categories ORDER BY order_index ASC, created_at ASC').all() as any[])
  )

  ipcMain.handle('db:categories:create', (_, c: any) => {
    getDatabase().prepare(`
      INSERT INTO categories (id, name, parent_id, order_index, created_at)
      VALUES (@id, @name, @parentId, @orderIndex, @createdAt)
    `).run({ id: c.id, name: c.name, parentId: c.parentId ?? null, orderIndex: c.orderIndex ?? 0, createdAt: c.createdAt })
    return c
  })

  ipcMain.handle('db:categories:update', (_, id: string, patch: any) => {
    const db = getDatabase()
    const parts: string[] = []
    const params: any = { id }
    if (patch.name !== undefined) { parts.push('name = @name'); params.name = patch.name }
    if (patch.orderIndex !== undefined) { parts.push('order_index = @orderIndex'); params.orderIndex = patch.orderIndex }
    if (parts.length) db.prepare(`UPDATE categories SET ${parts.join(', ')} WHERE id = @id`).run(params)
  })

  ipcMain.handle('db:categories:delete', (_, id: string) =>
    getDatabase().prepare('DELETE FROM categories WHERE id = ?').run(id)
  )

  // ── Tags ──────────────────────────────────────────────────────────────────
  ipcMain.handle('db:tags:list', () =>
    ccAll(getDatabase().prepare('SELECT * FROM tags ORDER BY order_index ASC, created_at ASC').all() as any[])
  )

  ipcMain.handle('db:tags:create', (_, t: any) => {
    getDatabase().prepare(`
      INSERT INTO tags (id, name, color, order_index, created_at)
      VALUES (@id, @name, @color, @orderIndex, @createdAt)
    `).run({ id: t.id, name: t.name, color: t.color ?? '#6B7280', orderIndex: t.orderIndex ?? 0, createdAt: t.createdAt })
    return t
  })

  ipcMain.handle('db:tags:delete', (_, id: string) =>
    getDatabase().prepare('DELETE FROM tags WHERE id = ?').run(id)
  )

  // ── Notes ─────────────────────────────────────────────────────────────────
  ipcMain.handle('db:notes:list', (_, filter: any = {}) => {
    const db = getDatabase()
    let sql = 'SELECT * FROM notes'
    const params: any[] = []
    const where: string[] = []

    if (filter.categoryId) { where.push('category_id = ?'); params.push(filter.categoryId) }
    if (filter.search) {
      // Use FTS5 for search
      const ftsRows = db.prepare(`
        SELECT n.* FROM notes n
        JOIN notes_fts ON n.rowid = notes_fts.rowid
        WHERE notes_fts MATCH ?
        ORDER BY n.updated_at DESC
      `).all(filter.search + '*') as any[]
      const notes = ccAll(ftsRows)
      return attachTags(db, notes)
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY updated_at DESC'
    const notes = ccAll(db.prepare(sql).all(...params) as any[])
    return attachTags(db, notes)
  })

  ipcMain.handle('db:notes:create', (_, n: any) => {
    getDatabase().prepare(`
      INSERT INTO notes (id, title, content, category_id, color, word_count, created_at, updated_at, source_type, source_id, source_msg_id)
      VALUES (@id, @title, @content, @categoryId, @color, @wordCount, @createdAt, @updatedAt, @sourceType, @sourceId, @sourceMsgId)
    `).run({
      id: n.id, title: n.title, content: n.content ?? '',
      categoryId: n.categoryId ?? null, color: n.color ?? 'none',
      wordCount: n.wordCount ?? 0, createdAt: n.createdAt, updatedAt: n.updatedAt,
      sourceType: n.sourceType ?? null, sourceId: n.sourceId ?? null, sourceMsgId: n.sourceMsgId ?? null
    })
    return n
  })

  ipcMain.handle('db:notes:update', (_, id: string, patch: any) => {
    const db = getDatabase()
    const colMap: Record<string, string> = {
      title: 'title', content: 'content', categoryId: 'category_id',
      color: 'color', wordCount: 'word_count', updatedAt: 'updated_at'
    }
    const parts: string[] = []
    const params: any = { id }
    for (const [jsKey, sqlCol] of Object.entries(colMap)) {
      if (patch[jsKey] !== undefined) {
        parts.push(`${sqlCol} = @${jsKey}`)
        params[jsKey] = patch[jsKey]
      }
    }
    if (parts.length) {
      db.prepare(`UPDATE notes SET ${parts.join(', ')} WHERE id = @id`).run(params)
      // Auto-save version snapshot when content or title changes
      if (patch.content !== undefined || patch.title !== undefined) {
        const note = db.prepare('SELECT title, content FROM notes WHERE id = ?').get(id) as any
        if (note) {
          db.prepare('INSERT INTO note_versions (id, note_id, title, content, saved_at) VALUES (?, ?, ?, ?, ?)')
            .run(crypto.randomUUID(), id, note.title, note.content, Date.now())
          // Keep only last 30 versions per note
          db.prepare(`DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (
            SELECT id FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC LIMIT 30
          )`).run(id, id)
        }
      }
    }
  })

  ipcMain.handle('db:note_versions:list', (_, noteId: string) => {
    const rows = getDatabase()
      .prepare('SELECT id, note_id, title, saved_at FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC LIMIT 30')
      .all(noteId) as any[]
    return rows.map(r => ({
      id: r.id, noteId: r.note_id, title: r.title, savedAt: r.saved_at
    }))
  })

  ipcMain.handle('db:note_versions:get', (_, versionId: string) => {
    const row = getDatabase()
      .prepare('SELECT id, note_id, title, content, saved_at FROM note_versions WHERE id = ?')
      .get(versionId) as any
    if (!row) return null
    return { id: row.id, noteId: row.note_id, title: row.title, content: row.content, savedAt: row.saved_at }
  })

  ipcMain.handle('db:notes:delete', (_, id: string) =>
    getDatabase().prepare('DELETE FROM notes WHERE id = ?').run(id)
  )

  ipcMain.handle('db:notes:setTags', (_, noteId: string, tagIds: string[]) => {
    const db = getDatabase()
    db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
    const insert = db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)')
    for (const tagId of tagIds) insert.run(noteId, tagId)
  })

  // ── Shortcuts ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:shortcuts:list', () => {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT s.id, s.note_id, s.order_index, s.created_at,
             n.title, n.color, n.word_count, n.updated_at AS note_updated_at
      FROM shortcuts s JOIN notes n ON s.note_id = n.id
      ORDER BY s.order_index ASC
    `).all() as any[]
    return ccAll(rows)
  })

  ipcMain.handle('db:shortcuts:add', (_, noteId: string) => {
    const db = getDatabase()
    const exists = db.prepare('SELECT id FROM shortcuts WHERE note_id = ?').get(noteId)
    if (exists) return
    const id = crypto.randomUUID()
    const maxOrder = (db.prepare('SELECT MAX(order_index) AS m FROM shortcuts').get() as any)?.m ?? -1
    db.prepare('INSERT INTO shortcuts (id, note_id, order_index, created_at) VALUES (?, ?, ?, ?)').run(id, noteId, maxOrder + 1, Date.now())
  })

  ipcMain.handle('db:shortcuts:remove', (_, noteId: string) =>
    getDatabase().prepare('DELETE FROM shortcuts WHERE note_id = ?').run(noteId)
  )

  // ── Stats ─────────────────────────────────────────────────────────────────
  ipcMain.handle('db:stats:get', () => {
    const db = getDatabase()
    const noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as any).c as number
    const wordCount = (db.prepare('SELECT COALESCE(SUM(word_count),0) as w FROM notes').get() as any).w as number
    const convCount = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as any).c as number
    const tokenCount = (db.prepare("SELECT COALESCE(SUM(tokens_used),0) as t FROM messages WHERE role='assistant'").get() as any).t as number

    const days: Array<{ label: string; notes: number; messages: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const start = d.getTime()
      const end = start + 86400000
      const nC = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE created_at>=? AND created_at<?').get(start, end) as any).c as number
      const mC = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE created_at>=? AND created_at<? AND role='user'").get(start, end) as any).c as number
      days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, notes: nC, messages: mC })
    }
    return { noteCount, wordCount, convCount, tokenCount, days }
  })

  // ── Export ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:export:json', async () => {
    const db = getDatabase()
    const data = {
      exportedAt: Date.now(),
      version: '1.0',
      notes: db.prepare('SELECT * FROM notes').all(),
      categories: db.prepare('SELECT * FROM categories').all(),
      tags: db.prepare('SELECT * FROM tags').all(),
      note_tags: db.prepare('SELECT * FROM note_tags').all()
    }
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出笔记备份',
      defaultPath: `deepseek-notes-backup-${new Date().toISOString().slice(0,10)}.json`,
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { success: false }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true, filePath }
  })

  ipcMain.handle('db:export:markdown', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || !filePaths[0]) return { success: false, count: 0 }
    const db = getDatabase()
    const notes = db.prepare('SELECT * FROM notes').all() as any[]
    const dir = filePaths[0]
    for (const n of notes) {
      const safe = (n.title as string).replace(/[/\\:*?"<>|]/g, '_').slice(0, 80) || 'untitled'
      const fname = `${safe}_${(n.id as string).slice(0, 8)}.md`
      const content = `# ${n.title}\n\n${n.content}`
      fs.writeFileSync(`${dir}/${fname}`, content, 'utf-8')
    }
    return { success: true, count: notes.length, dir }
  })

  // ── Import ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:import:json', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择备份文件',
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return { success: false, count: 0 }
    const raw = fs.readFileSync(filePaths[0], 'utf-8')
    const data = JSON.parse(raw)
    const db = getDatabase()
    let count = 0
    const insertNote = db.prepare(`INSERT OR IGNORE INTO notes
      (id,title,content,category_id,color,word_count,created_at,updated_at,source_type,source_id,source_msg_id)
      VALUES (@id,@title,@content,@category_id,@color,@word_count,@created_at,@updated_at,@source_type,@source_id,@source_msg_id)`)
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id,name,parent_id,order_index,created_at) VALUES (@id,@name,@parent_id,@order_index,@created_at)')
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id,name,color,order_index,created_at) VALUES (@id,@name,@color,@order_index,@created_at)')
    const insertNoteTag = db.prepare('INSERT OR IGNORE INTO note_tags (note_id,tag_id) VALUES (@note_id,@tag_id)')
    const tx = db.transaction(() => {
      for (const c of (data.categories ?? [])) insertCat.run(c)
      for (const t of (data.tags ?? [])) insertTag.run(t)
      for (const n of (data.notes ?? [])) { insertNote.run(n); count++ }
      for (const nt of (data.note_tags ?? [])) insertNoteTag.run(nt)
    })
    tx()
    return { success: true, count }
  })

  ipcMain.handle('db:import:markdown', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择 Markdown 文件',
      filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (canceled || !filePaths.length) return { success: false, count: 0 }
    const db = getDatabase()
    const insert = db.prepare(`INSERT INTO notes
      (id,title,content,category_id,color,word_count,created_at,updated_at)
      VALUES (@id,@title,@content,@categoryId,@color,@wordCount,@createdAt,@updatedAt)`)
    let count = 0
    const tx = db.transaction(() => {
      for (const fp of filePaths) {
        const raw = fs.readFileSync(fp, 'utf-8')
        const lines = raw.split('\n')
        const h1 = lines.find(l => l.startsWith('# '))
        const title = h1 ? h1.slice(2).trim() : fp.split('/').pop()?.replace(/\.md$|\.txt$/, '') ?? '导入笔记'
        const content = h1 ? raw.slice(raw.indexOf('\n') + 1).trim() : raw.trim()
        const chinese = (content.match(/[一-龥]/g) ?? []).length
        const english = (content.match(/\b[a-zA-Z]+\b/g) ?? []).length
        insert.run({ id: crypto.randomUUID(), title, content, categoryId: null, color: 'none', wordCount: chinese + english, createdAt: Date.now(), updatedAt: Date.now() })
        count++
      }
    })
    tx()
    return { success: true, count }
  })

  // ── Generic API test (runs in main process, no CSP) ──────────────────────
  ipcMain.handle('api:test', async (_, { url, apiKey, model }: { url: string; apiKey: string; model: string }) => {
    const safeKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim()
    if (!safeKey) return { ok: false, error: 'API Key 为空或包含无效字符' }
    try {
      const res = await net.fetch(`${url.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${safeKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        })
      })
      if (res.ok) return { ok: true }
      const body = await res.text().catch(() => '')
      return { ok: false, status: res.status, body }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  // ── Tavily web search (main process, no CORS/CSP) ─────────────────────────
  ipcMain.handle('tavily:search', async (_, { query, apiKey, maxResults = 5 }: { query: string; apiKey: string; maxResults?: number }) => {
    // Strip any characters outside printable ASCII (0x20–0x7E) — prevents ByteString errors
    const safeKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim()
    if (!safeKey) return { ok: false, error: 'API Key 为空或包含无效字符，请重新输入' }
    try {
      // Use net.fetch (Chromium network stack) so system proxy/VPN is respected
      const res = await net.fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${safeKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: 'basic',
          include_answer: true,
          include_raw_content: false
        })
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, status: res.status, body }
      }
      const data = await res.json()
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
}

function attachTags(db: any, notes: any[]): any[] {
  if (notes.length === 0) return notes
  const getTagsStmt = db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    JOIN note_tags nt ON t.id = nt.tag_id
    WHERE nt.note_id = ?
  `)
  return notes.map(n => ({ ...n, tags: getTagsStmt.all(n.id) }))
}
