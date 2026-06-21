import { ipcMain, dialog, net, shell, clipboard } from 'electron'
import Store from 'electron-store'
import fs from 'fs'
import { randomUUID } from 'crypto'
import JSZip from 'jszip'
import { getDatabase } from '../db'
import { testConnection, syncMemos } from '../sync/memos'
import { testWebDav, syncNotes as webdavSyncNotes } from '../sync/webdav'
import { embedText, cosineSimilarity, getEmbeddingModel, testEmbedding } from '../services/embedding'
import { initTencentDocsPlugin, reloadTencentDocsPlugin, testTencentDocsToken } from '../tools/builtin/tencent-docs'

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
  // ── Clipboard ─────────────────────────────────────────────────────────────
  ipcMain.handle('clipboard:writeHtml', (_, html: string, text: string) => {
    clipboard.write({ html, text })
  })

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
      INSERT INTO conversations (id, title, model, created_at, updated_at, system_prompt, agent_id)
      VALUES (@id, @title, @model, @createdAt, @updatedAt, @systemPrompt, @agentId)
    `).run({ id: c.id, title: c.title, model: c.model, createdAt: c.createdAt, updatedAt: c.updatedAt, systemPrompt: c.systemPrompt ?? null, agentId: c.agentId ?? null })
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
  ipcMain.handle('db:messages:list', (_, conversationId: string) => {
    const rows = getDatabase().prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[]
    return ccAll(rows).map((m: any) => {
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata as string)
          if (Array.isArray(meta.toolCallRecords)) m.toolCallRecords = meta.toolCallRecords
        } catch {}
        delete m.metadata
      }
      return m
    })
  })

  ipcMain.handle('db:messages:create', (_, conversationId: string, m: any) => {
    getDatabase().prepare(`
      INSERT INTO messages (id, conversation_id, role, content, tokens_used, created_at, metadata)
      VALUES (@id, @conversationId, @role, @content, @tokensUsed, @createdAt, @metadata)
    `).run({
      id: m.id, conversationId, role: m.role, content: m.content,
      tokensUsed: m.tokensUsed ?? 0, createdAt: m.createdAt,
      metadata: m.toolCallRecords?.length ? JSON.stringify({ toolCallRecords: m.toolCallRecords }) : null
    })
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
      // FTS5 MATCH with snippet() for highlighted excerpts (column 0=title, 1=content)
      const ftsRows = db.prepare(`
        SELECT n.*,
          snippet(notes_fts, 1, '\x01', '\x02', '…', 20) AS search_snippet
        FROM notes n
        JOIN notes_fts ON n.rowid = notes_fts.rowid
        WHERE notes_fts MATCH ?
        ORDER BY n.updated_at DESC
      `).all(filter.search + '*') as any[]
      const notes = ccAll(ftsRows).map((n: any) => ({
        ...n,
        searchSnippet: n.searchSnippet ?? null
      }))
      return attachTags(db, notes)
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY updated_at DESC'
    const notes = ccAll(db.prepare(sql).all(...params) as any[])
    return attachTags(db, notes)
  })

  ipcMain.handle('db:notes:create', (_, n: any) => {
    getDatabase().prepare(`
      INSERT INTO notes (id, title, content, category_id, color, word_count, visibility, created_at, updated_at, source_type, source_id, source_msg_id)
      VALUES (@id, @title, @content, @categoryId, @color, @wordCount, @visibility, @createdAt, @updatedAt, @sourceType, @sourceId, @sourceMsgId)
    `).run({
      id: n.id, title: n.title, content: n.content ?? '',
      categoryId: n.categoryId ?? null, color: n.color ?? 'none',
      wordCount: n.wordCount ?? 0, visibility: n.visibility ?? 'private',
      createdAt: n.createdAt, updatedAt: n.updatedAt,
      sourceType: n.sourceType ?? null, sourceId: n.sourceId ?? null, sourceMsgId: n.sourceMsgId ?? null
    })
    return n
  })

  ipcMain.handle('db:notes:update', (_, id: string, patch: any) => {
    const db = getDatabase()
    const colMap: Record<string, string> = {
      title: 'title', content: 'content', categoryId: 'category_id',
      color: 'color', wordCount: 'word_count', updatedAt: 'updated_at',
      visibility: 'visibility', memosName: 'memos_name', memosSyncedAt: 'memos_synced_at'
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
            .run(randomUUID(), id, note.title, note.content, Date.now())
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

  ipcMain.handle('db:notes:delete', (_, id: string) => {
    const db  = getDatabase()
    const now = Date.now()
    db.transaction(() => {
      db.prepare('DELETE FROM notes WHERE id = ?').run(id)
      db.prepare('INSERT OR REPLACE INTO deleted_notes (id, deleted_at) VALUES (?, ?)').run(id, now)
    })()
  })

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
    const id = randomUUID()
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
    const db = getDatabase()
    const notes = db.prepare('SELECT * FROM notes').all() as any[]
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出笔记为 ZIP',
      defaultPath: `deepseek-notes-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
    })
    if (canceled || !filePath) return { success: false, count: 0 }
    const zip = new JSZip()
    for (const n of notes) {
      const safe = (n.title as string).replace(/[/\\:*?"<>|]/g, '_').slice(0, 80) || 'untitled'
      const fname = `${safe}_${(n.id as string).slice(0, 8)}.md`
      zip.file(fname, `# ${n.title}\n\n${n.content}`)
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(filePath, buf)
    return { success: true, count: notes.length, dir: filePath }
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
        insert.run({ id: randomUUID(), title, content, categoryId: null, color: 'none', wordCount: chinese + english, createdAt: Date.now(), updatedAt: Date.now() })
        count++
      }
    })
    tx()
    return { success: true, count }
  })

  // ── Skills ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:skills:list', () => {
    return ccAll(getDatabase().prepare('SELECT * FROM skills ORDER BY updated_at DESC').all() as any[])
  })

  ipcMain.handle('db:skills:create', (_, s: any) => {
    const db = getDatabase()
    const now = Date.now()
    db.prepare(`INSERT INTO skills
      (id,name,description,trigger_keywords,system_hint,tool_sequence,usage_count,source,created_at,updated_at)
      VALUES (@id,@name,@description,@triggerKeywords,@systemHint,@toolSequence,0,@source,@createdAt,@updatedAt)
    `).run({ id: s.id, name: s.name, description: s.description,
              triggerKeywords: s.triggerKeywords ?? '[]', systemHint: s.systemHint ?? '',
              toolSequence: s.toolSequence ?? null, source: s.source ?? 'manual',
              createdAt: now, updatedAt: now })
    return cc(db.prepare('SELECT * FROM skills WHERE id = ?').get(s.id) as any)
  })

  ipcMain.handle('db:skills:update', (_, id: string, patch: any) => {
    const db = getDatabase()
    const parts: string[] = ['updated_at = ?']
    const vals: unknown[] = [Date.now()]
    if (patch.name             !== undefined) { parts.push('name = ?');              vals.push(patch.name) }
    if (patch.description      !== undefined) { parts.push('description = ?');       vals.push(patch.description) }
    if (patch.triggerKeywords  !== undefined) { parts.push('trigger_keywords = ?');  vals.push(patch.triggerKeywords) }
    if (patch.systemHint       !== undefined) { parts.push('system_hint = ?');       vals.push(patch.systemHint) }
    if (patch.usageCount       !== undefined) { parts.push('usage_count = ?');       vals.push(patch.usageCount) }
    vals.push(id)
    db.prepare(`UPDATE skills SET ${parts.join(', ')} WHERE id = ?`).run(...vals)
  })

  ipcMain.handle('db:skills:delete', (_, id: string) =>
    getDatabase().prepare('DELETE FROM skills WHERE id = ?').run(id)
  )

  // ── Plugins ───────────────────────────────────────────────────────────────
  ipcMain.handle('db:plugins:list', () => {
    return ccAll(getDatabase().prepare('SELECT * FROM plugins ORDER BY created_at DESC').all() as any[])
  })

  ipcMain.handle('db:plugins:create', (_, p: any) => {
    const db = getDatabase()
    const now = Date.now()
    db.prepare(`INSERT INTO plugins
      (id,name,display_name,description,endpoint_url,method,headers_json,param_schema_json,enabled,created_at)
      VALUES (@id,@name,@displayName,@description,@endpointUrl,@method,@headersJson,@paramSchemaJson,1,@createdAt)
    `).run({ id: p.id, name: p.name, displayName: p.displayName, description: p.description,
              endpointUrl: p.endpointUrl, method: p.method ?? 'POST',
              headersJson: p.headersJson ?? null, paramSchemaJson: p.paramSchemaJson ?? null,
              createdAt: now })
    return cc(db.prepare('SELECT * FROM plugins WHERE id = ?').get(p.id) as any)
  })

  ipcMain.handle('db:plugins:update', (_, id: string, patch: any) => {
    const db = getDatabase()
    const parts: string[] = []
    const vals: unknown[] = []
    const fields: Record<string, string> = {
      name: 'name', displayName: 'display_name', description: 'description',
      endpointUrl: 'endpoint_url', method: 'method',
      headersJson: 'headers_json', paramSchemaJson: 'param_schema_json', enabled: 'enabled'
    }
    for (const [key, col] of Object.entries(fields)) {
      if (patch[key] !== undefined) { parts.push(`${col} = ?`); vals.push(patch[key]) }
    }
    if (!parts.length) return
    vals.push(id)
    db.prepare(`UPDATE plugins SET ${parts.join(', ')} WHERE id = ?`).run(...vals)
  })

  ipcMain.handle('db:plugins:delete', (_, id: string) =>
    getDatabase().prepare('DELETE FROM plugins WHERE id = ?').run(id)
  )

  // ── Memories ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:memories:list', (_, opts: { limit?: number; category?: string } = {}) => {
    const db = getDatabase()
    const limit = Math.min(opts.limit ?? 20, 100)
    if (opts.category) {
      return db.prepare(`SELECT * FROM memories WHERE category = ? ORDER BY importance DESC, created_at DESC LIMIT ?`).all(opts.category, limit)
    }
    return db.prepare(`SELECT * FROM memories ORDER BY importance DESC, created_at DESC LIMIT ?`).all(limit)
  })

  ipcMain.handle('db:memories:create', (_, m: any) => {
    const db = getDatabase()
    const now = Date.now()
    db.prepare(`INSERT INTO memories (id, content, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(m.id, m.content, m.category ?? 'general', m.importance ?? 5, now, now)
    return db.prepare('SELECT * FROM memories WHERE id = ?').get(m.id)
  })

  ipcMain.handle('db:memories:delete', (_, id: string) => {
    getDatabase().prepare('DELETE FROM memories WHERE id = ?').run(id)
  })

  ipcMain.handle('db:memories:search', (_, query: string, limit = 10) => {
    const db = getDatabase()
    const q = `%${query.toLowerCase()}%`
    return db.prepare(`SELECT * FROM memories WHERE LOWER(content) LIKE ? ORDER BY importance DESC, created_at DESC LIMIT ?`).all(q, limit)
  })

  ipcMain.handle('db:memories:update', (_, id: string, patch: { content?: string; importance?: number; isPinned?: boolean; isArchived?: boolean }) => {
    const db = getDatabase()
    const parts: string[] = ['updated_at = ?']
    const vals: unknown[] = [Date.now()]
    if (patch.content    !== undefined) { parts.push('content = ?');     vals.push(patch.content) }
    if (patch.importance !== undefined) { parts.push('importance = ?');  vals.push(patch.importance) }
    if (patch.isPinned   !== undefined) { parts.push('is_pinned = ?');   vals.push(patch.isPinned ? 1 : 0) }
    if (patch.isArchived !== undefined) { parts.push('is_archived = ?'); vals.push(patch.isArchived ? 1 : 0) }
    vals.push(id)
    db.prepare(`UPDATE memories SET ${parts.join(', ')} WHERE id = ?`).run(...vals)
  })

  // 3-tier context loading: Pinned(≤5) + Keyword-matched(≤10) + High-importance recent(≤5)
  // Also triggers passive forgetting curve (auto-archive stale low-importance memories)
  ipcMain.handle('db:memories:loadContext', (_, userText: string) => {
    const db = getDatabase()
    const now = Date.now()
    const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000

    // Passive forgetting: auto-archive importance < 4 AND last_recalled > 60d AND recall_count < 3
    db.prepare(`
      UPDATE memories SET is_archived = 1, updated_at = ?
      WHERE is_archived = 0
        AND importance < 4
        AND recall_count < 3
        AND (last_recalled IS NULL OR last_recalled < ?)
        AND created_at < ?
    `).run(now, now - SIXTY_DAYS, now - SIXTY_DAYS)

    // Tier 1: Pinned (always loaded, up to 5)
    const pinned = db.prepare(`SELECT * FROM memories WHERE is_pinned = 1 AND is_archived = 0 ORDER BY importance DESC LIMIT 5`).all() as any[]
    const pinnedIds = new Set(pinned.map((r: any) => r.id))

    // Tier 2: Keyword-matched (tokenize userText, LIKE search)
    const tokens = [...new Set((userText.toLowerCase().match(/[一-龥]{2,}|[a-z0-9]{3,}/g) ?? []))]
    let keywordMatches: any[] = []
    if (tokens.length > 0) {
      const clauses = tokens.slice(0, 8).map(() => 'LOWER(content) LIKE ?').join(' OR ')
      const params  = [...tokens.slice(0, 8).map(t => `%${t}%`), 15]
      const rows = db.prepare(`SELECT * FROM memories WHERE is_archived = 0 AND (${clauses}) ORDER BY importance DESC, last_recalled DESC LIMIT ?`).all(...params) as any[]
      keywordMatches = rows.filter((r: any) => !pinnedIds.has(r.id)).slice(0, 10)
    }
    const matchedIds = new Set(keywordMatches.map((r: any) => r.id))

    // Tier 3: High-importance recent (fill up to 5 slots not already included)
    const excluded = [...pinnedIds, ...matchedIds]
    const excPlaceholders = excluded.length > 0 ? `AND id NOT IN (${excluded.map(() => '?').join(',')})` : ''
    const recent = db.prepare(`SELECT * FROM memories WHERE is_archived = 0 ${excPlaceholders} ORDER BY importance DESC, created_at DESC LIMIT 5`).all(...excluded) as any[]

    const all = [...pinned, ...keywordMatches, ...recent]
    if (all.length === 0) return []

    // Update recall_count + last_recalled for all returned memories
    const recallStmt = db.prepare(`UPDATE memories SET recall_count = recall_count + 1, last_recalled = ?, updated_at = ? WHERE id = ?`)
    for (const r of all) recallStmt.run(now, now, r.id)

    return ccAll(all)
  })

  // AI consolidation: call DeepSeek from main process to merge/summarize memory bank
  ipcMain.handle('db:memories:consolidate', async () => {
    const db = getDatabase()
    const baseUrl = (store.get('baseUrl') as string | undefined)?.trim() ?? 'https://api.deepseek.com'
    const apiKey  = (store.get('apiKey')  as string | undefined)?.trim() ?? ''
    const model   = (store.get('model')   as string | undefined)?.trim() || 'deepseek-chat'
    if (!apiKey) return { success: false, error: 'API Key 未配置，请前往个人中心 → API 配置填写' }
    const endpoint = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '') + '/v1/chat/completions'
    console.log('[consolidate] endpoint:', endpoint, 'model:', model, 'apiKey:', apiKey.slice(0, 8) + '...')

    const allMems = db.prepare(
      `SELECT id, content, category, importance FROM memories WHERE is_archived = 0 ORDER BY importance DESC`
    ).all() as any[]
    if (allMems.length < 3) return { success: false, error: '记忆条数不足，无需整理' }

    // Pass real IDs to the AI so it can reference them accurately
    const memText = allMems.map((m: any) =>
      `<memory id="${m.id}" category="${m.category}" importance="${m.importance}">\n${m.content}\n</memory>`
    ).join('\n\n')

    const prompt = `你是记忆管理助手，负责整理用户的记忆库，让记忆更精炼、不重复。

以下是用户的所有记忆条目，每条有唯一 id。请：
1. 将内容重复、高度相似或可互补的条目合并为一条表述更完整的新记忆
2. 删除明显过时、价值低或已被其他条目覆盖的条目
3. 对单独保留的重要条目，可优化措辞使其更清晰

严格按以下 JSON 格式返回（只输出 JSON，不要任何说明）：
{
  "merge": [
    {
      "ids": ["被合并的id1", "被合并的id2"],
      "content": "合并后综合两条信息的新内容",
      "category": "分类（沿用原分类或更合适的）",
      "importance": 1到5的重要性整数
    }
  ],
  "update": [
    {"id": "原id", "content": "优化后的内容（可选）", "importance": 新重要性整数（可选）}
  ],
  "delete": ["要删除的id"]
}

规则：
- merge.ids 中的原始记忆会被删除并替换为一条新的合并记忆
- update 只修改单条记忆，不删除
- delete 直接删除
- 未出现在任何列表中的记忆保持不变
- 如果没有需要操作的，对应数组返回空 []

记忆列表：
${memText}`

    try {
      const res = await net.fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 8000,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.error('[consolidate] API error', res.status, errBody)
        return { success: false, error: `API 错误 ${res.status}: ${errBody.slice(0, 120)}` }
      }
      const data = await res.json() as any
      const raw = (data.choices?.[0]?.message?.content || '').trim()
      console.log('[consolidate] raw response length:', raw.length, 'preview:', raw.slice(0, 100))
      if (!raw) return { success: false, error: 'AI 返回了空响应，请重试' }
      // Strip markdown code fences if model wrapped the JSON (handles preamble text before the fence)
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = (fenceMatch ? fenceMatch[1] : raw).trim()
      let result: any
      try {
        result = JSON.parse(jsonStr)
      } catch (e: any) {
        console.error('[consolidate] JSON parse error:', e.message, 'raw:', raw.slice(0, 200))
        return { success: false, error: `AI 返回格式错误（${e.message}），请重试` }
      }

      const { randomUUID } = await import('crypto')
      const now2 = Date.now()
      let merged = 0, mergeGroups = 0, updated = 0, deleted = 0

      const tx = db.transaction(() => {
        // 1. Merge groups: insert new combined memory, delete originals
        for (const group of (result.merge ?? [])) {
          if (!Array.isArray(group.ids) || group.ids.length < 2 || !group.content) continue
          db.prepare(
            `INSERT INTO memories (id, content, category, importance, created_at, updated_at, is_archived)
             VALUES (?, ?, ?, ?, ?, ?, 0)`
          ).run(randomUUID(), group.content, group.category ?? 'general', group.importance ?? 3, now2, now2)
          for (const id of group.ids) {
            db.prepare('DELETE FROM memories WHERE id = ?').run(id)
          }
          merged += group.ids.length
          mergeGroups++
        }
        // 2. Update individual entries
        for (const item of (result.update ?? [])) {
          if (!item.id) continue
          const parts: string[] = ['updated_at = ?']
          const vals: unknown[] = [now2]
          if (item.content)    { parts.push('content = ?');    vals.push(item.content) }
          if (item.importance) { parts.push('importance = ?'); vals.push(item.importance) }
          vals.push(item.id)
          db.prepare(`UPDATE memories SET ${parts.join(', ')} WHERE id = ?`).run(...vals)
          updated++
        }
        // 3. Delete
        for (const id of (result.delete ?? [])) {
          db.prepare('DELETE FROM memories WHERE id = ?').run(id)
          deleted++
        }
      })
      tx()

      const kept = allMems.length - merged - deleted + mergeGroups
      return { success: true, kept, deleted: merged + deleted, merged: mergeGroups }
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) }
    }
  })

  // ── Generic API test (runs in main process, no CSP) ──────────────────────
  ipcMain.handle('api:balance', async () => {
    const apiKey  = (store.get('apiKey')  as string | undefined)?.trim() ?? ''
    const baseUrl = (store.get('baseUrl') as string | undefined)?.trim() ?? 'https://api.deepseek.com'
    if (!apiKey) return { ok: false, error: '未配置 API Key' }
    const base = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '')
    try {
      const res = await net.fetch(`${base}/user/balance`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const data = await res.json() as any
      return { ok: true, isAvailable: data.is_available, balances: data.balance_infos ?? [] }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? '网络错误' }
    }
  })

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

  // ── Export conversation ───────────────────────────────────────────────────
  ipcMain.handle('db:conversations:export', async (_, id: string) => {
    const db = getDatabase()
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any
    if (!conv) return { success: false, error: 'not found' }
    const messages = db.prepare(
      `SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
    ).all(id) as any[]

    const title = conv.title || '对话'
    let md = `# ${title}\n\n`
    md += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n`
    for (const m of messages) {
      if (m.role === 'system') continue
      md += m.role === 'user' ? `**👤 用户**\n\n` : `**🤖 DeepSeek**\n\n`
      md += `${m.content}\n\n---\n\n`
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出对话',
      defaultPath: `${title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 60)}-${new Date().toISOString().slice(0, 10)}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (canceled || !filePath) return { success: false }
    fs.writeFileSync(filePath, md, 'utf-8')
    return { success: true, filePath }
  })

  // ── Memos sync + resource upload ─────────────────────────────────────────
  ipcMain.handle('memos:uploadResource', async (_, { buffer, filename, mimeType }: { buffer: ArrayBuffer; filename: string; mimeType: string }) => {
    const url   = (store.get('memosUrl')   as string | undefined)?.trim() ?? ''
    const token = (store.get('memosToken') as string | undefined)?.trim() ?? ''
    if (!url || !token) throw new Error('Memos 未配置')
    const base = url.replace(/\/$/, '')
    // New Memos API (v0.23+): /api/v1/attachments expects JSON with base64-encoded content
    const content = Buffer.from(buffer).toString('base64')
    const res = await net.fetch(`${base}/api/v1/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content, type: mimeType })
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Memos upload HTTP ${res.status}: ${text.slice(0, 80)}`)
    }
    const json = await res.json() as any
    // Returns { name: "attachments/<uid>", filename, type, ... }
    const uid = json.name?.split('/').pop()
    if (!uid) throw new Error('Memos 未返回资源 ID')
    const host = new URL(base).host
    return { uid, filename, mimeType, url: `memos-asset://${host}/file/attachments/${uid}/${encodeURIComponent(filename)}` }
  })

  ipcMain.handle('memos:test', async () => {
    const url   = (store.get('memosUrl')   as string | undefined)?.trim() ?? ''
    const token = (store.get('memosToken') as string | undefined)?.trim() ?? ''
    return testConnection({ url, token })
  })

  ipcMain.handle('memos:sync', async () => {
    const url   = (store.get('memosUrl')   as string | undefined)?.trim() ?? ''
    const token = (store.get('memosToken') as string | undefined)?.trim() ?? ''
    if (!url || !token) return { ok: false, errors: ['Memos 未配置'] }
    try {
      return await syncMemos(getDatabase(), { url, token })
    } catch (e: any) {
      return { ok: false, added: 0, updated: 0, deleted: 0, syncedAt: 0, errors: [e.message] }
    }
  })

  ipcMain.handle('memos:getStatus', () => {
    const db  = getDatabase()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'memosLastSyncAt'").get() as any
    const lastSyncAt = row ? (parseInt(JSON.parse(row.value)) || 0) : 0
    return { lastSyncAt }
  })

  // ── Shell ─────────────────────────────────────────────────────────────────
  ipcMain.handle('shell:openPath',         (_, p: string)   => shell.openPath(p))
  ipcMain.handle('shell:showItemInFolder', (_, p: string)   => { shell.showItemInFolder(p); return true })
  ipcMain.handle('shell:openExternal',     (_, url: string) => shell.openExternal(url))

  // ── Picbed (Cloudflare Worker + R2) ──────────────────────────────────────
  // All requests go through net.fetch in main process to avoid file:// CORS restrictions
  const _picbedTokenCache = new Map<string, string>()

  async function picbedGetToken(baseUrl: string, password: string): Promise<string> {
    const key = `${baseUrl}::${password}`
    if (_picbedTokenCache.has(key)) return _picbedTokenCache.get(key)!
    const res = await net.fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`密码错误 (${res.status}): ${text.slice(0, 80)}`)
    }
    const { token } = await res.json() as { token: string }
    _picbedTokenCache.set(key, token)
    return token
  }

  async function picbedAuthFetch(method: string, path: string, baseUrl: string, password: string, body?: BodyInit): Promise<Response> {
    let sessionToken = await picbedGetToken(baseUrl, password)
    const url = `${baseUrl}${path}`
    const makeReq = (tok: string) => net.fetch(url, { method, headers: { 'X-Auth-Token': tok }, body })
    const res = await makeReq(sessionToken)
    if (res.status === 401) {
      _picbedTokenCache.delete(`${baseUrl}::${password}`)
      sessionToken = await picbedGetToken(baseUrl, password)
      const retry = await makeReq(sessionToken)
      if (!retry.ok) {
        const text = await retry.text().catch(() => retry.statusText)
        throw new Error(`${retry.status}: ${text.slice(0, 120)}`)
      }
      return retry
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`${res.status}: ${text.slice(0, 120)}`)
    }
    return res
  }

  ipcMain.handle('picbed:test', async () => {
    const baseUrl  = (store.get('picbedUrl')   as string | undefined)?.trim().replace(/\/$/, '') ?? ''
    const password = (store.get('picbedToken') as string | undefined)?.trim() ?? ''
    if (!baseUrl || !password) return { ok: false, error: '图床未配置' }
    try {
      await picbedAuthFetch('GET', '/list?prefix=&delimiter=/', baseUrl, password)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('picbed:upload', async (_, { buffer, filename, mimeType, folder }: { buffer: ArrayBuffer; filename: string; mimeType: string; folder?: string }) => {
    const baseUrl  = (store.get('picbedUrl')   as string | undefined)?.trim().replace(/\/$/, '') ?? ''
    const password = (store.get('picbedToken') as string | undefined)?.trim() ?? ''
    if (!baseUrl || !password) throw new Error('图床未配置')
    const path = folder ? (folder.endsWith('/') ? folder : folder + '/') : ''
    const blob = new Blob([buffer], { type: mimeType })
    const formData = new FormData()
    formData.append('file', blob, filename)
    formData.append('path', path)
    const res = await picbedAuthFetch('POST', '/', baseUrl, password, formData as any)
    return res.json()
  })

  // ── WebDAV sync ───────────────────────────────────────────────────────────
  function getWebDavConfig() {
    const url      = (store.get('webdavUrl')  as string | undefined)?.trim() ?? ''
    const username = (store.get('webdavUser') as string | undefined)?.trim() ?? ''
    const password = (store.get('webdavPass') as string | undefined)?.trim() ?? ''
    return url ? { url, username, password } : null
  }

  ipcMain.handle('embedding:test', async () => testEmbedding())

  ipcMain.handle('webdav:test', async () => {
    const cfg = getWebDavConfig()
    if (!cfg) return { ok: false, error: 'WebDAV 未配置，请先填写 URL' }
    return testWebDav(cfg)
  })

  ipcMain.handle('webdav:sync', async () => {
    const cfg = getWebDavConfig()
    if (!cfg) return { ok: false, error: 'WebDAV 未配置' }
    return webdavSyncNotes(getDatabase(), cfg)
  })

  ipcMain.handle('webdav:status', () => {
    const db  = getDatabase()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'webdavLastSyncAt'").get() as any
    return { lastSyncAt: row ? (parseInt(JSON.parse(row.value)) || 0) : 0 }
  })

  // ── Semantic search ───────────────────────────────────────────────────────
  ipcMain.handle('semantic:embed', async (_, noteId: string) => {
    try {
      const db   = getDatabase()
      const note = db.prepare('SELECT title, content FROM notes WHERE id = ?').get(noteId) as any
      if (!note) return { success: false, error: 'Note not found' }
      const vector = await embedText(`${note.title}\n\n${note.content}`)
      if (!vector) return { success: false, error: 'Embedding failed — check API key and embedding model config' }
      db.prepare('UPDATE notes SET embedding = ?, embedding_model = ? WHERE id = ?')
        .run(JSON.stringify(vector), getEmbeddingModel(), noteId)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('semantic:embed:all', async (_, opts: { force?: boolean } = {}) => {
    try {
      const db       = getDatabase()
      const totalAll = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as any).c as number

      if (opts.force) {
        // Clear existing embeddings so they're all re-indexed with the current model
        db.prepare('UPDATE notes SET embedding = NULL, embedding_model = NULL').run()
      }

      const notes = db.prepare('SELECT id, title, content FROM notes WHERE embedding IS NULL').all() as any[]
      let done = 0
      for (const note of notes) {
        const vector = await embedText(`${note.title}\n\n${note.content}`)
        if (vector) {
          db.prepare('UPDATE notes SET embedding = ?, embedding_model = ? WHERE id = ?')
            .run(JSON.stringify(vector), getEmbeddingModel(), note.id)
          done++
        }
      }
      const alreadyEmbedded = totalAll - notes.length
      return { success: true, done, total: totalAll, alreadyEmbedded }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('semantic:search', async (_, query: string) => {
    try {
      const db      = getDatabase()
      const queryVec = await embedText(query)
      if (!queryVec) return { success: false, error: '向量化失败，请检查 API Key 及 Embedding 模型配置' }
      const rows = db.prepare('SELECT id, embedding FROM notes WHERE embedding IS NOT NULL').all() as any[]
      const allScored = rows
        .map((row: any) => {
          try {
            const vec   = JSON.parse(row.embedding) as number[]
            const score = cosineSimilarity(queryVec, vec)
            return { id: row.id as string, score }
          } catch { return { id: row.id as string, score: 0 } }
        })
        .sort((a: any, b: any) => b.score - a.score)

      // Gap-detection threshold: find the first significant score drop in the ranked list.
      // This handles both high-noise English models (scores clustered 0.60-0.72, no gap → 0 results)
      // and high-quality Chinese models (one note at 0.85, rest at 0.50 → gap at index 1 → return it).
      // GAP_MIN: minimum score drop to consider a "real" boundary; FLOOR: absolute minimum score.
      const GAP_MIN  = 0.08
      const FLOOR    = 0.50
      const MAX_RESULTS = 8

      let cutoffIdx = allScored.length // default: nothing passes
      for (let i = 0; i < allScored.length - 1; i++) {
        const gap = allScored[i].score - allScored[i + 1].score
        if (gap >= GAP_MIN) { cutoffIdx = i + 1; break }
      }

      const scored = allScored
        .slice(0, cutoffIdx)
        .filter((r: any) => r.score >= FLOOR)
        .slice(0, MAX_RESULTS)

      return { success: true, results: scored as { id: string; score: number }[] }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('semantic:status', () => {
    const db       = getDatabase()
    const total    = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as any).c as number
    const embedded = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE embedding IS NOT NULL').get() as any).c as number
    return { total, embedded }
  })

  // ── 腾讯文档 MCP 插件 ────────────────────────────────────────────────────────
  ipcMain.handle('tencentdocs:test', (_: any, token: string) =>
    testTencentDocsToken(token)
  )

  ipcMain.handle('tencentdocs:reload', () =>
    reloadTencentDocsPlugin()
  )

  // Fire-and-forget init on startup so tools are ready before first agent call
  initTencentDocsPlugin().catch((e: any) =>
    console.warn('[tencent-docs] startup init skipped:', e?.message)
  )
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
