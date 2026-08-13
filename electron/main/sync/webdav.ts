import { net } from 'electron'
import type Database from 'better-sqlite3'

export interface WebDavConfig {
  url: string
  username: string
  password: string
}

export interface WebDavSyncResult {
  ok: boolean
  pushed?: number
  pulled?: number
  syncedAt?: number
  error?: string
}

const SYNC_PATH = '/DeepSeekNotes/notes_sync.json'

function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function baseUrl(url: string): string {
  return url.replace(/\/$/, '')
}

async function ensureDir(config: WebDavConfig, path: string): Promise<void> {
  const resp = await net.fetch(`${baseUrl(config.url)}${path}`, {
    method: 'MKCOL',
    headers: { Authorization: authHeader(config.username, config.password) }
  })
  // 201 created, 405 method not allowed (already exists), 301 redirect — all acceptable
  if (!resp.ok && resp.status !== 405 && resp.status !== 301 && resp.status !== 302) {
    throw new Error(`Cannot create directory ${path}: ${resp.status}`)
  }
}

async function putJson(config: WebDavConfig, path: string, data: unknown): Promise<void> {
  const resp = await net.fetch(`${baseUrl(config.url)}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(config.username, config.password),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!resp.ok) throw new Error(`PUT ${path} failed: ${resp.status}`)
}

async function getJson(config: WebDavConfig, path: string): Promise<unknown | null> {
  const resp = await net.fetch(`${baseUrl(config.url)}${path}`, {
    headers: { Authorization: authHeader(config.username, config.password) }
  })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status}`)
  return resp.json()
}

export async function testWebDav(config: WebDavConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!config.url) throw new Error('WebDAV URL 未填写')
    await ensureDir(config, '/DeepSeekNotes')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

export async function syncNotes(db: Database.Database, config: WebDavConfig): Promise<WebDavSyncResult> {
  try {
    // 1. Download remote state
    const remote = await getJson(config, SYNC_PATH) as {
      notes?: any[]
      categories?: any[]
      tags?: any[]
      noteTags?: any[]
      deletedIds?: string[]
      deletedCategoryIds?: string[]
      deletedTagIds?: string[]
    } | null
    const remoteMap = new Map<string, any>()
    for (const rn of remote?.notes ?? []) remoteMap.set(rn.id, rn)
    const remoteDeletedIds: Set<string> = new Set(remote?.deletedIds ?? [])
    const remoteDeletedCategoryIds = new Set<string>(remote?.deletedCategoryIds ?? [])
    const remoteDeletedTagIds = new Set<string>(remote?.deletedTagIds ?? [])

    // 2. Load local notes and tombstones
    const localNotes = db.prepare(`
      SELECT id, title, content, category_id, color, visibility, created_at, updated_at
      FROM notes
    `).all() as any[]
    const localMap = new Map(localNotes.map((n: any) => [n.id, n]))

    const localDeletedIds = new Set(
      (db.prepare('SELECT id FROM deleted_notes').all() as { id: string }[]).map(r => r.id)
    )
    const localDeletedCategoryIds = new Set(
      (db.prepare('SELECT id FROM deleted_categories').all() as { id: string }[]).map(r => r.id)
    )
    const localDeletedTagIds = new Set(
      (db.prepare('SELECT id FROM deleted_tags').all() as { id: string }[]).map(r => r.id)
    )

    for (const id of remoteDeletedCategoryIds) {
      db.prepare('DELETE FROM categories WHERE id=?').run(id)
      db.prepare('INSERT OR REPLACE INTO deleted_categories(id,deleted_at) VALUES(?,?)').run(id, Date.now())
      localDeletedCategoryIds.add(id)
    }
    for (const id of remoteDeletedTagIds) {
      db.prepare('DELETE FROM tags WHERE id=?').run(id)
      db.prepare('INSERT OR REPLACE INTO deleted_tags(id,deleted_at) VALUES(?,?)').run(id, Date.now())
      localDeletedTagIds.add(id)
    }

    // 3a. Merge taxonomy first so note foreign keys are valid on both clients.
    const upsertCategory = db.prepare(`
      INSERT INTO categories(id,name,parent_id,order_index,color,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=CASE WHEN excluded.updated_at >= categories.updated_at THEN excluded.name ELSE categories.name END,
        parent_id=CASE WHEN excluded.updated_at >= categories.updated_at THEN excluded.parent_id ELSE categories.parent_id END,
        order_index=CASE WHEN excluded.updated_at >= categories.updated_at THEN excluded.order_index ELSE categories.order_index END,
        color=CASE WHEN excluded.updated_at >= categories.updated_at THEN excluded.color ELSE categories.color END,
        updated_at=MAX(categories.updated_at, excluded.updated_at)
    `)
    for (const category of remote?.categories ?? []) {
      if (localDeletedCategoryIds.has(category.id)) continue
      upsertCategory.run(
        category.id, category.name ?? '', category.parent_id ?? null, category.order_index ?? 0,
        category.color ?? null, category.created_at ?? Date.now(), category.updated_at ?? 0
      )
    }
    const upsertTag = db.prepare(`
      INSERT INTO tags(id,name,color,order_index,created_at,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=CASE WHEN excluded.updated_at >= tags.updated_at THEN excluded.name ELSE tags.name END,
        color=CASE WHEN excluded.updated_at >= tags.updated_at THEN excluded.color ELSE tags.color END,
        order_index=CASE WHEN excluded.updated_at >= tags.updated_at THEN excluded.order_index ELSE tags.order_index END,
        updated_at=MAX(tags.updated_at, excluded.updated_at)
    `)
    for (const tag of remote?.tags ?? []) {
      if (localDeletedTagIds.has(tag.id)) continue
      upsertTag.run(
        tag.id, tag.name ?? '', tag.color ?? '#6B7280', tag.order_index ?? 0,
        tag.created_at ?? Date.now(), tag.updated_at ?? 0
      )
    }

    // 3b. Apply remote deletions locally
    for (const rid of remoteDeletedIds) {
      if (localMap.has(rid)) {
        db.prepare('DELETE FROM notes WHERE id = ?').run(rid)
        localMap.delete(rid)
      }
      // Record tombstone so we don't re-pull it
      db.prepare('INSERT OR REPLACE INTO deleted_notes (id, deleted_at) VALUES (?, ?)').run(rid, Date.now())
      localDeletedIds.add(rid)
    }

    // 3c. Pull: merge remote changes into local (skip locally deleted notes)
    let pulled = 0
    const remoteRelationWins = new Set<string>()
    for (const [id, rn] of remoteMap) {
      if (localDeletedIds.has(id)) continue // this device deleted it — skip
      const ln = localMap.get(id)
      if (!ln) {
        // New note from remote — create locally (FTS trigger fires automatically)
        db.prepare(`
          INSERT OR IGNORE INTO notes
            (id, title, content, category_id, color, visibility, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(rn.id, rn.title ?? '', rn.content ?? '', rn.category_id ?? null,
               rn.color ?? 'none', rn.visibility ?? 'private', rn.created_at, rn.updated_at)
        remoteRelationWins.add(id)
        pulled++
      } else if (rn.updated_at > ln.updated_at) {
        // Remote is newer — update local (FTS update trigger fires automatically)
        db.prepare(`
          UPDATE notes SET title=?, content=?, category_id=?, color=?, visibility=?, updated_at=? WHERE id=?
        `).run(rn.title ?? '', rn.content ?? '', rn.category_id ?? null, rn.color ?? 'none',
               rn.visibility ?? 'private', rn.updated_at, id)
        remoteRelationWins.add(id)
        pulled++
      }
    }
    const insertNoteTag = db.prepare('INSERT OR IGNORE INTO note_tags(note_id,tag_id) VALUES(?,?)')
    const deleteNoteTags = db.prepare('DELETE FROM note_tags WHERE note_id=?')
    for (const noteId of remoteRelationWins) deleteNoteTags.run(noteId)
    for (const link of remote?.noteTags ?? []) {
      if (!remoteRelationWins.has(link.note_id)) continue
      try { insertNoteTag.run(link.note_id, link.tag_id) } catch { /* orphaned remote link */ }
    }

    // 4. Build updated local snapshot for push
    const allNotes = db.prepare(`
      SELECT id, title, content, category_id, color, visibility, created_at, updated_at
      FROM notes
    `).all() as any[]

    const pushed = allNotes.length
    const categories = db.prepare(
      'SELECT id,name,parent_id,order_index,color,created_at,updated_at FROM categories'
    ).all()
    const tags = db.prepare(
      'SELECT id,name,color,order_index,created_at,updated_at FROM tags'
    ).all()
    const noteTags = db.prepare('SELECT note_id,tag_id FROM note_tags').all()

    // 5. Upload merged snapshot (include tombstone IDs so other devices delete too)
    await ensureDir(config, '/DeepSeekNotes')
    await putJson(config, SYNC_PATH, {
      version:    1,
      syncedAt:   Date.now(),
      notes:      allNotes,
      categories,
      tags,
      noteTags,
      deletedIds: [...localDeletedIds],
      deletedCategoryIds: [...localDeletedCategoryIds],
      deletedTagIds: [...localDeletedTagIds],
    })

    // 6. Record sync time
    const now = Date.now()
    db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('webdavLastSyncAt', ?, ?)`)
      .run(JSON.stringify(now), now)

    return { ok: true, pushed, pulled, syncedAt: now }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
