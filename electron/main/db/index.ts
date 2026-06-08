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
    crypto.randomUUID(),
    '专业文档生成',
    '触发后指导 DeepSeek 使用设计规范工具生成漂亮的 A4 文档、Excel 工作簿',
    JSON.stringify(['报告', '提案', '文档', '分析报告', 'Word文档', '季度报告', 'Excel', '工作簿', '数据表', '生成文档', '制作文档', '写报告']),
    `你拥有专业文档生成工具，当用户要求生成任何文档、报告、提案、数据表时：
1. 使用 generate_document 工具生成 A4 文档（报告/提案/分析/简报）
2. 使用 generate_spreadsheet 工具生成 Excel 工作簿（数据表/财务模型）
工具使用原则：先与用户确认文档结构，再调用工具；每个章节内容保持 200-400 字；KPI 数据用 kpis 数组，表格数据用 table 对象；sections 至少 3 节以确保文档完整度。文档将以 DeepSeek 品牌配色（蓝色 #4D6BFE）自动排版，打印质量，可直接导出 PDF。`,
    JSON.stringify(['generate_document', 'generate_spreadsheet']),
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
