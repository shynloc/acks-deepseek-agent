import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import { schema } from './schema'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'database.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schema)
  // Incremental migrations (idempotent ALTER TABLE — fails silently if column exists)
  try { db.exec('ALTER TABLE conversations ADD COLUMN agent_id TEXT') } catch { /* exists */ }

  // Memories table (Sprint E) — base schema without new columns for backward compat
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
  // Idempotent column additions — run BEFORE indexes that reference these columns
  const memMigrations: [string, string][] = [
    ['is_pinned',    'INTEGER DEFAULT 0'],
    ['recall_count', 'INTEGER DEFAULT 0'],
    ['last_recalled','INTEGER'],
    ['is_archived',  'INTEGER DEFAULT 0'],
  ]
  for (const [col, def] of memMigrations) {
    try { db.exec(`ALTER TABLE memories ADD COLUMN ${col} ${def}`) } catch { /* already exists */ }
  }
  // Indexes that depend on new columns (safe after migration above)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(is_pinned)') } catch { /* ok */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(is_archived, importance DESC)') } catch { /* ok */ }

  seedBuiltinSkills(db)
  console.log('[DB] Initialized at:', dbPath)
  return db
}

function seedBuiltinSkills(db: Database.Database): void {
  const existing = db.prepare(`SELECT id FROM skills WHERE name = '专业文档生成'`).get()
  if (existing) return

  const now = Date.now()
  db.prepare(`
    INSERT INTO skills (id, name, description, trigger_keywords, system_hint, tool_sequence, usage_count, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'builtin', ?, ?)
  `).run(
    randomUUID(),
    '专业文档生成',
    '触发后指导 DeepSeek 使用设计规范工具生成漂亮的 A4 文档、Excel 工作簿',
    JSON.stringify(['报告', '提案', '文档', '分析报告', 'Word文档', '季度报告', 'Excel', '工作簿', '数据表', '生成文档', '制作文档', '写报告']),
    `你拥有专业文档生成工具，当用户要求生成任何文档、报告、提案、数据表时：
1. 使用 generate_docx 工具生成真实的 Word 文档（.docx），可用 Word/Pages/WPS 直接打开编辑
2. 使用 generate_document 工具生成 A4 HTML 文档（适合直接在浏览器预览或打印为 PDF）
3. 使用 generate_spreadsheet 工具生成 Excel 工作簿（数据表/财务模型）

选择原则：
- 用户说"Word文档"/"可编辑文档"/"docx" → 优先用 generate_docx
- 用户说"生成文档"/"分析报告"（未指定格式）→ 用 generate_docx（最通用）
- 用户说"Excel"/"数据表"/"工作簿" → 用 generate_spreadsheet

工具使用原则：每个章节内容保持 200-400 字；KPI 数据用 kpis 数组，表格数据用 table 对象；sections 至少 3 节以确保文档完整度。文档将以 DeepSeek 品牌配色（蓝色 #4D6BFE）自动排版。`,
    JSON.stringify(['generate_docx', 'generate_document', 'generate_spreadsheet']),
    now, now
  )
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
