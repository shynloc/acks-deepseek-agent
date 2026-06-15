/**
 * Memos sync service — bidirectional sync between local notes and a Memos instance.
 * Runs in the Electron main process (Node.js context).
 */

import { net } from 'electron'
import type Database from 'better-sqlite3'

export interface MemosConfig {
  url:   string
  token: string
}

export interface SyncResult {
  ok:       boolean
  added:    number
  updated:  number
  deleted:  number
  syncedAt: number
  errors:   string[]
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function apiFetch(url: string, method: string, token: string, body?: object) {
  const opts: RequestInit = { method, headers: authHeaders(token) }
  if (body) opts.body = JSON.stringify(body)
  const res = await net.fetch(url, opts)
  return { ok: res.ok, status: res.status, json: res.ok ? await res.json() : null, text: !res.ok ? await res.text().catch(() => '') : '' }
}

// ── Memos API wrappers ────────────────────────────────────────────────────────

export async function testConnection(config: MemosConfig): Promise<{ ok: boolean; user?: string; error?: string }> {
  const base = config.url.replace(/\/$/, '')
  if (!base || !config.token) return { ok: false, error: '请填写服务器地址和 Token' }
  try {
    const res = await apiFetch(`${base}/api/v1/memos?pageSize=1`, 'GET', config.token)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    try {
      const me = await apiFetch(`${base}/api/v1/users/me`, 'GET', config.token)
      if (me.ok && me.json) {
        const u = me.json as any
        return { ok: true, user: u.displayName || u.nickname || u.name || '已连接' }
      }
    } catch {}
    return { ok: true, user: '已连接' }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

async function memosList(base: string, token: string, updatedSinceTs = 0): Promise<any[]> {
  const since = updatedSinceTs > 0 ? new Date(updatedSinceTs * 1000).toISOString() : null
  let filterActive = !!since

  async function doFetch(withFilter: boolean, pageToken: string) {
    const params = new URLSearchParams({ pageSize: '100' })
    if (withFilter && since) params.set('filter', `update_time >= timestamp("${since}")`)
    if (pageToken) params.set('pageToken', pageToken)
    return apiFetch(`${base}/api/v1/memos?${params}`, 'GET', token)
  }

  let res = await doFetch(filterActive, '')
  if (!res.ok && res.status === 400 && filterActive) {
    filterActive = false
    res = await doFetch(false, '')
  }
  if (!res.ok) throw new Error(`memosList HTTP ${res.status}`)

  const memos: any[] = [...((res.json as any)?.memos ?? [])]
  let nextToken: string = (res.json as any)?.nextPageToken ?? ''

  while (nextToken) {
    res = await doFetch(filterActive, nextToken)
    if (!res.ok) throw new Error(`memosList pagination HTTP ${res.status}`)
    memos.push(...((res.json as any)?.memos ?? []))
    nextToken = (res.json as any)?.nextPageToken ?? ''
  }
  return memos
}

async function memosCreate(base: string, token: string, content: string): Promise<any> {
  const res = await apiFetch(`${base}/api/v1/memos`, 'POST', token, { content, visibility: 'PRIVATE' })
  if (!res.ok) throw new Error(`memosCreate HTTP ${res.status}: ${res.text?.slice(0, 80)}`)
  return res.json
}

async function memosUpdate(base: string, token: string, memoName: string, content: string): Promise<void> {
  const res = await apiFetch(`${base}/api/v1/${memoName}?updateMask=content`, 'PATCH', token, { content })
  if (!res.ok) throw new Error(`memosUpdate HTTP ${res.status}`)
}

async function fetchResources(base: string, token: string, memoName: string, inlineAttachments?: any[]): Promise<any[]> {
  // New Memos (v0.23+): attachments are included inline on the memo object
  if (inlineAttachments && inlineAttachments.length > 0) {
    return inlineAttachments
  }
  // Fallback: try old resources endpoint
  try {
    const res = await apiFetch(`${base}/api/v1/${memoName}/resources`, 'GET', token)
    if (!res.ok) return []
    const j = res.json as any
    return j?.resources ?? (Array.isArray(j) ? j : [])
  } catch { return [] }
}

// ── URL rewriting (images behind auth) ────────────────────────────────────────

function rewriteMemosUrls(content: string, baseUrl: string): string {
  try {
    const host = new URL(baseUrl.replace(/\/$/, '')).host
    const esc  = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Rewrite both old /o/r/ and new /file/attachments/ paths
    return content
      .replace(new RegExp(`https?://${esc}(/o/r/[^\\s)"'\\]]+)`, 'g'), `memos-asset://${host}$1`)
      .replace(new RegExp(`https?://${esc}(/file/attachments/[^\\s)"'\\]]+)`, 'g'), `memos-asset://${host}$1`)
  } catch { return content }
}

function restoreMemosUrls(content: string, baseUrl: string): string {
  try {
    const u      = new URL(baseUrl.replace(/\/$/, ''))
    const scheme = u.protocol.replace(':', '')
    const host   = u.host
    const esc    = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return content
      .replace(new RegExp(`memos-asset://${esc}(/o/r/[^\\s)"'\\]]+)`, 'g'), `${scheme}://${host}$1`)
      .replace(new RegExp(`memos-asset://${esc}(/file/attachments/[^\\s)"'\\]]+)`, 'g'), `${scheme}://${host}$1`)
  } catch { return content }
}

function buildResourceSection(resources: any[], baseUrl: string): string {
  if (!resources?.length) return ''
  try {
    const host = new URL(baseUrl.replace(/\/$/, '')).host
    const lines = resources
      .filter(r => r.type?.startsWith('image/'))
      .map(r => {
        if (r.externalLink) return `![${r.filename || ''}](${r.externalLink})`
        const uid = r.uid || r.name?.split('/').pop()
        if (!uid) return null
        // New Memos: attachments/ prefix → /file/attachments/ URL
        // Old Memos: resources/ prefix → /o/r/ URL
        const isAttachment = r.name?.startsWith('attachments/')
        const urlPath = isAttachment
          ? `/file/attachments/${uid}/${encodeURIComponent(r.filename || 'image')}`
          : `/o/r/${uid}/${encodeURIComponent(r.filename || 'image')}`
        return `![${r.filename || ''}](memos-asset://${host}${urlPath})`
      }).filter(Boolean)
    return lines.join('\n')
  } catch { return '' }
}

function stripResourceSection(content: string): string {
  return (content || '').replace(/\n*<!-- memos-resources -->\n[\s\S]*$/, '')
}

// ── Title / content encoding ───────────────────────────────────────────────────

function encodeForMemos(title: string, content: string): string {
  const firstLine = content.trimStart().split('\n')[0] ?? ''
  if (firstLine === `# ${title}`) return content   // already prefixed
  return `# ${title}\n\n${content}`
}

function decodeFromMemos(raw: string): { title: string; content: string } {
  const lines = (raw || '').trim().split('\n')
  const heading = lines[0]?.match(/^#\s+(.+)/)
  if (heading) {
    return {
      title:   heading[1].trim().slice(0, 200),
      content: lines.slice(1).join('\n').replace(/^\n+/, '').trimEnd()
    }
  }
  const firstNonEmpty = lines.find(l => l.trim())?.slice(0, 80) ?? '无标题'
  return { title: firstNonEmpty, content: raw.trim() }
}

// ── Main sync function ─────────────────────────────────────────────────────────

export async function syncMemos(db: Database.Database, config: MemosConfig): Promise<SyncResult> {
  const base  = config.url.replace(/\/$/, '')
  const now   = Math.floor(Date.now() / 1000)
  const errors: string[] = []
  let added = 0, updated = 0, deleted = 0

  const lastSyncRow = db.prepare("SELECT value FROM settings WHERE key = 'memosLastSyncAt'").get() as any
  const lastSyncAt  = lastSyncRow ? (parseInt(JSON.parse(lastSyncRow.value)) || 0) : 0

  // ── PUSH: local changed notes → Memos ─────────────────────────────────────
  const localChanged = db.prepare(
    "SELECT * FROM notes WHERE updated_at > ?"
  ).all(lastSyncAt * 1000) as any[]   // note: local timestamps are ms

  for (const note of localChanged) {
    try {
      const rawContent  = stripResourceSection(note.content ?? '')
      const restored    = restoreMemosUrls(rawContent, config.url)
      const memoContent = encodeForMemos(note.title ?? '无标题', restored)

      if (!note.memos_name) {
        const created = await memosCreate(base, config.token, memoContent) as any
        if (created?.name) {
          db.prepare('UPDATE notes SET memos_name = ?, memos_synced_at = ? WHERE id = ?')
            .run(created.name, now, note.id)
          added++
        }
      } else {
        const syncedAt  = note.memos_synced_at ?? 0
        const updatedAt = Math.floor(note.updated_at / 1000)  // convert ms → s
        if (updatedAt > syncedAt) {
          await memosUpdate(base, config.token, note.memos_name, memoContent)
          db.prepare('UPDATE notes SET memos_synced_at = ? WHERE id = ?').run(now, note.id)
          updated++
        }
      }
    } catch (e: any) {
      errors.push(`push ${note.id}: ${e.message}`)
    }
  }

  // ── PULL: Memos changed → local ───────────────────────────────────────────
  try {
    const remoteMemos = await memosList(base, config.token, lastSyncAt)

    const resourceResults = await Promise.allSettled(
      remoteMemos.map(m => fetchResources(base, config.token, m.name, m.attachments))
    )
    const resourcesFor = (i: number): any[] =>
      resourceResults[i]?.status === 'fulfilled' ? (resourceResults[i] as PromiseFulfilledResult<any[]>).value : []

    for (let mi = 0; mi < remoteMemos.length; mi++) {
      const memo = remoteMemos[mi]
      try {
        const memoName    = memo.name
        const baseContent = rewriteMemosUrls(memo.content || '', config.url)
        const resSec      = buildResourceSection(resourcesFor(mi), config.url)
        const remoteContent = resSec ? `${baseContent}\n\n<!-- memos-resources -->\n${resSec}` : baseContent
        const remoteUpdateTime = memo.updateTime ? Math.floor(new Date(memo.updateTime).getTime() / 1000) : now
        const remoteCreateTime = memo.createTime ? Math.floor(new Date(memo.createTime).getTime() / 1000) : now
        const isArchived = memo.state === 'ARCHIVED' || memo.rowStatus === 'ARCHIVED'

        const { title, content } = decodeFromMemos(remoteContent)
        const localNote = db.prepare('SELECT * FROM notes WHERE memos_name = ?').get(memoName) as any

        if (localNote) {
          if (isArchived) {
            // Archived on Memos → soft-delete locally (remove from list, keep in DB)
            // For now: just mark as deleted note by clearing memos_name so it won't sync again
            // A true delete would remove local note - we skip that to be non-destructive
            deleted++
          } else {
            const localUpdatedS = Math.floor(localNote.updated_at / 1000)
            const remoteNewer   = remoteUpdateTime > (localNote.memos_synced_at ?? 0) && remoteUpdateTime > localUpdatedS
            const missingRes    = resSec && !(localNote.content ?? '').includes('<!-- memos-resources -->')
            if (remoteNewer || missingRes) {
              const wordCount = (content.match(/[一-龥]/g)?.length ?? 0) + (content.match(/\b[a-zA-Z]+\b/g)?.length ?? 0)
              db.prepare(`UPDATE notes
                SET title = ?, content = ?, word_count = ?, memos_synced_at = ?, updated_at = ?
                WHERE id = ?`)
                .run(title, content, wordCount, now, remoteUpdateTime * 1000, localNote.id)
              updated++
            }
          }
        } else if (!isArchived) {
          const { randomUUID } = await import('crypto')
          const newId     = randomUUID()
          const wordCount = (content.match(/[一-龥]/g)?.length ?? 0) + (content.match(/\b[a-zA-Z]+\b/g)?.length ?? 0)
          db.prepare(`INSERT INTO notes
            (id, title, content, category_id, color, word_count, visibility, memos_name, memos_synced_at, created_at, updated_at)
            VALUES (?, ?, ?, NULL, 'none', ?, 'private', ?, ?, ?, ?)`)
            .run(newId, title, content, wordCount, memoName, now, remoteCreateTime * 1000, remoteUpdateTime * 1000)
          added++
        }
      } catch (e: any) {
        errors.push(`pull ${memo.name}: ${e.message}`)
      }
    }
  } catch (e: any) {
    errors.push(`pull fetch: ${e.message}`)
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('memosLastSyncAt', ?, ?)")
    .run(JSON.stringify(now), Date.now())

  return { ok: errors.length === 0, added, updated, deleted, syncedAt: now, errors: errors.slice(0, 5) }
}
