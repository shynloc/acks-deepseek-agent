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
    const remote = await getJson(config, SYNC_PATH) as { notes?: any[]; deletedIds?: string[] } | null
    const remoteMap = new Map<string, any>()
    for (const rn of remote?.notes ?? []) remoteMap.set(rn.id, rn)
    const remoteDeletedIds: Set<string> = new Set(remote?.deletedIds ?? [])

    // 2. Load local notes and tombstones
    const localNotes = db.prepare(`
      SELECT id, title, content, category_id, color, visibility, created_at, updated_at
      FROM notes
    `).all() as any[]
    const localMap = new Map(localNotes.map((n: any) => [n.id, n]))

    const localDeletedIds = new Set(
      (db.prepare('SELECT id FROM deleted_notes').all() as { id: string }[]).map(r => r.id)
    )

    // 3a. Apply remote deletions locally
    for (const rid of remoteDeletedIds) {
      if (localMap.has(rid)) {
        db.prepare('DELETE FROM notes WHERE id = ?').run(rid)
        localMap.delete(rid)
      }
      // Record tombstone so we don't re-pull it
      db.prepare('INSERT OR REPLACE INTO deleted_notes (id, deleted_at) VALUES (?, ?)').run(rid, Date.now())
      localDeletedIds.add(rid)
    }

    // 3b. Pull: merge remote changes into local (skip locally deleted notes)
    let pulled = 0
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
        pulled++
      } else if (rn.updated_at > ln.updated_at) {
        // Remote is newer — update local (FTS update trigger fires automatically)
        db.prepare(`
          UPDATE notes SET title=?, content=?, color=?, visibility=?, updated_at=? WHERE id=?
        `).run(rn.title ?? '', rn.content ?? '', rn.color ?? 'none',
               rn.visibility ?? 'private', rn.updated_at, id)
        pulled++
      }
    }

    // 4. Build updated local snapshot for push
    const allNotes = db.prepare(`
      SELECT id, title, content, category_id, color, visibility, created_at, updated_at
      FROM notes
    `).all() as any[]

    const pushed = allNotes.length

    // 5. Upload merged snapshot (include tombstone IDs so other devices delete too)
    await ensureDir(config, '/DeepSeekNotes')
    await putJson(config, SYNC_PATH, {
      version:    1,
      syncedAt:   Date.now(),
      notes:      allNotes,
      deletedIds: [...localDeletedIds],
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
