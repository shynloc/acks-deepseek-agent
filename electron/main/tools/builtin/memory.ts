import { getDatabase } from '../../db'
import { toolRegistry } from '../registry'
import { randomUUID } from 'crypto'

// ── Token overlap similarity ───────────────────────────────────────────────
// Treats each CJK character and each alphanumeric word as a token.
// Returns containment ratio: |intersection| / |smaller set|
function tokenSimilarity(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().match(/[一-龥]|[a-z0-9]+/g) ?? [])
  const ta = tok(a); const tb = tok(b)
  if (ta.size === 0 || tb.size === 0) return 0
  const inter = [...ta].filter(t => tb.has(t)).length
  return inter / Math.min(ta.size, tb.size)
}

// ── save_memory ──────────────────────────────────────────────────────────────
toolRegistry.register({
  name: 'save_memory',
  emoji: '🧠',
  idempotent: false,
  maxResultChars: 300,
  schema: {
    name: 'save_memory',
    description: '将重要信息保存到长期记忆，用于未来对话回忆。保存用户偏好、个人信息、项目背景、重要事实等。系统会自动检测重复并合并，无需担心重复保存。',
    parameters: {
      type: 'object',
      properties: {
        content:    { type: 'string', description: '要记住的内容，一句话描述具体事实或偏好' },
        category:   { type: 'string', description: 'user（用户信息）| preference（偏好习惯）| project（项目背景）| general（通用）', enum: ['user','preference','project','general'] },
        importance: { type: 'number', description: '重要性 1-10（默认 5），越高越优先加载' }
      },
      required: ['content']
    }
  },
  handler: async (args) => {
    const db = getDatabase()
    const content    = String(args.content).trim()
    const category   = ['user','preference','project','general'].includes(String(args.category)) ? String(args.category) : 'general'
    const importance = Math.min(10, Math.max(1, Number(args.importance ?? 5)))
    const now = Date.now()

    // Dedup: check recent non-archived memories for similarity
    const candidates = db.prepare(
      `SELECT id, content, importance FROM memories WHERE is_archived = 0 ORDER BY created_at DESC LIMIT 60`
    ).all() as any[]

    for (const c of candidates) {
      if (tokenSimilarity(content, c.content) >= 0.7) {
        // Merge: keep higher importance, update content to the new (presumably cleaner) version
        const newImportance = Math.max(c.importance, importance)
        db.prepare(`UPDATE memories SET content = ?, importance = ?, updated_at = ? WHERE id = ?`)
          .run(content, newImportance, now, c.id)
        return JSON.stringify({ success: true, merged: true, id: c.id, message: `已合并到相似记忆（重要性升至 ${newImportance}/10）` })
      }
    }

    // New memory
    const id = randomUUID()
    db.prepare(
      `INSERT INTO memories (id, content, category, importance, is_pinned, recall_count, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)`
    ).run(id, content, category, importance, now, now)
    return JSON.stringify({ success: true, id, message: `已保存记忆（重要性 ${importance}/10）` })
  }
})

// ── recall_memories ──────────────────────────────────────────────────────────
toolRegistry.register({
  name: 'recall_memories',
  emoji: '💭',
  idempotent: true,
  maxResultChars: 3000,
  schema: {
    name: 'recall_memories',
    description: '搜索历史记忆，查找与关键词相关的已保存信息。每次搜索会自动强化被找到记忆的重要性。',
    parameters: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: '搜索关键词' },
        category: { type: 'string', description: '可选，按分类过滤：user | preference | project | general' },
        limit:    { type: 'number', description: '最多返回条数，默认 10' }
      },
      required: ['query']
    }
  },
  handler: async (args) => {
    const db = getDatabase()
    const query    = String(args.query ?? '').toLowerCase()
    const limit    = Math.min(20, Number(args.limit ?? 10))
    const category = args.category ? String(args.category) : null
    const params: unknown[] = [`%${query}%`]
    const where: string[]   = ['is_archived = 0', 'LOWER(content) LIKE ?']
    if (category) { where.push('category = ?'); params.push(category) }
    params.push(limit)

    const rows = db.prepare(
      `SELECT id, content, category, importance, recall_count, created_at FROM memories WHERE ${where.join(' AND ')} ORDER BY importance DESC, created_at DESC LIMIT ?`
    ).all(...params) as any[]

    if (!rows.length) return JSON.stringify({ results: [], message: '未找到相关记忆' })

    // Reinforce: update recall_count + last_recalled + boost importance on frequent recalls
    const now = Date.now()
    for (const r of rows) {
      const newCount = (r.recall_count ?? 0) + 1
      // Every 5 recalls, boost importance by 1 (capped at 10)
      const boost = newCount % 5 === 0 ? 1 : 0
      db.prepare(`UPDATE memories SET recall_count = ?, last_recalled = ?, importance = MIN(10, importance + ?), updated_at = ? WHERE id = ?`)
        .run(newCount, now, boost, now, r.id)
    }

    const categoryLabel: Record<string, string> = { user:'用户', preference:'偏好', project:'项目', general:'通用' }
    return JSON.stringify({
      results: rows.map(r => ({
        id:         r.id,
        content:    r.content,
        category:   categoryLabel[r.category] ?? r.category,
        importance: r.importance,
        recalls:    r.recall_count ?? 0,
        savedAt:    new Date(r.created_at).toLocaleDateString('zh-CN')
      }))
    })
  }
})

// ── delete_memory ────────────────────────────────────────────────────────────
toolRegistry.register({
  name: 'delete_memory',
  emoji: '🗑️',
  idempotent: false,
  maxResultChars: 150,
  schema: {
    name: 'delete_memory',
    description: '删除一条过时或错误的记忆（先用 recall_memories 获取 ID）。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '要删除的记忆 ID' } },
      required: ['id']
    }
  },
  handler: async (args) => {
    getDatabase().prepare('DELETE FROM memories WHERE id = ?').run(String(args.id))
    return JSON.stringify({ success: true, message: '记忆已删除' })
  }
})
