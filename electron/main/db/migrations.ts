import type Database from 'better-sqlite3'

/**
 * Sequential migration runner driven by `PRAGMA user_version`.
 *
 * Migration 1 is the baseline: it reproduces exactly what the old
 * "try { ALTER TABLE } catch {}" block did, so databases created before
 * versioning existed (they all report user_version = 0, with the columns
 * already present) converge on version 1 without error.
 *
 * From migration 2 onward, statements run strictly — a failure aborts startup
 * rather than being swallowed, and the version is only bumped on success.
 * Each migration runs inside a transaction.
 */

export interface Migration {
  version: number
  name:    string
  up:      (db: Database.Database) => void
}

/** ALTER TABLE ADD COLUMN that tolerates the column already existing. */
function addColumnIfMissing(db: Database.Database, table: string, column: string, def: string): void {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (existing.some(c => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'baseline: columns added before versioning existed',
    up: (db) => {
      addColumnIfMissing(db, 'conversations', 'agent_id', 'TEXT')

      // Sprint E/G: notes table column additions
      const notesColumns: [string, string][] = [
        ['memos_name',      'TEXT'],
        ['memos_synced_at', 'INTEGER'],
        ['visibility',      "TEXT DEFAULT 'private'"],
        ['embedding',       'TEXT'],
        ['embedding_model', 'TEXT'],
      ]
      for (const [col, def] of notesColumns) addColumnIfMissing(db, 'notes', col, def)
      db.exec('CREATE INDEX IF NOT EXISTS idx_notes_memos ON notes(memos_name)')

      // Memories table (Sprint E) — base shape, then the columns added later
      db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id          TEXT PRIMARY KEY,
          content     TEXT NOT NULL,
          category    TEXT NOT NULL DEFAULT 'general',
          importance  INTEGER DEFAULT 5,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_memories_rank ON memories(importance DESC, created_at DESC);
      `)
      const memoryColumns: [string, string][] = [
        ['is_pinned',     'INTEGER DEFAULT 0'],
        ['recall_count',  'INTEGER DEFAULT 0'],
        ['last_recalled', 'INTEGER'],
        ['is_archived',   'INTEGER DEFAULT 0'],
      ]
      for (const [col, def] of memoryColumns) addColumnIfMissing(db, 'memories', col, def)

      // Indexes that depend on the columns above
      db.exec('CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(is_pinned)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(is_archived, importance DESC)')
    }
  },
  {
    version: 2,
    name: 'categories/tags: color+updated_at columns, deletion tombstones',
    up: (db) => {
      addColumnIfMissing(db, 'categories', 'color', 'TEXT DEFAULT NULL')
      addColumnIfMissing(db, 'categories', 'updated_at', 'INTEGER NOT NULL DEFAULT 0')
      addColumnIfMissing(db, 'tags', 'updated_at', 'INTEGER NOT NULL DEFAULT 0')

      db.exec(`
        CREATE TABLE IF NOT EXISTS deleted_categories (
          id         TEXT PRIMARY KEY,
          deleted_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS deleted_tags (
          id         TEXT PRIMARY KEY,
          deleted_at INTEGER NOT NULL
        );
      `)
    }
  },
]

export function getSchemaVersion(db: Database.Database): number {
  const rows = db.pragma('user_version') as { user_version: number }[]
  return rows[0]?.user_version ?? 0
}

/**
 * Which migrations still need to run, in apply order. Pure — the DB-free half of
 * runMigrations, so the selection rule can be unit-tested (better-sqlite3 itself
 * is built for Electron's ABI and cannot be loaded by the Node test runner).
 */
export function pendingMigrations(current: number, list: Migration[] = MIGRATIONS): Migration[] {
  return list
    .filter(m => m.version > current)
    .sort((a, b) => a.version - b.version)
}

/** Apply every migration newer than the database's current version, in order. */
export function runMigrations(db: Database.Database): number {
  const pending = pendingMigrations(getSchemaVersion(db))

  for (const m of pending) {
    const apply = db.transaction(() => {
      m.up(db)
      // user_version does not accept a bound parameter
      db.pragma(`user_version = ${m.version}`)
    })
    try {
      apply()
      console.log(`[DB] migration ${m.version} applied: ${m.name}`)
    } catch (e) {
      console.error(`[DB] migration ${m.version} failed (${m.name}):`, e)
      throw e
    }
  }

  return getSchemaVersion(db)
}
