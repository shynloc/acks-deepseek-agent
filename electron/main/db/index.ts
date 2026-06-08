import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { schema } from './schema'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'database.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schema)
  console.log('[DB] Initialized at:', dbPath)
  return db
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
