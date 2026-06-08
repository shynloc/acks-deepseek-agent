import { toolRegistry } from '../registry'
import crypto from 'crypto'

toolRegistry.register({
  name: 'search_notes',
  emoji: '🔍',
  idempotent: true,
  maxResultChars: 6000,
  schema: {
    name: 'search_notes',
    description: '在用户的笔记库中全文搜索，返回匹配的笔记标题和内容摘要。查找相关知识时优先使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，支持多词' },
        limit: { type: 'number', description: '最多返回条数，默认 5，最大 20' }
      },
      required: ['query']
    }
  },
  handler: async (args, ctx) => {
    const limit = Math.min(Number(args.limit ?? 5), 20)
    try {
      const rows = ctx.db.prepare(`
        SELECT n.id, n.title,
               snippet(notes_fts, 1, '【', '】', '…', 25) AS excerpt
        FROM notes_fts f
        JOIN notes n ON n.rowid = f.rowid
        WHERE notes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(String(args.query), limit) as any[]
      return JSON.stringify({ found: rows.length, results: rows.map(r => ({ id: r.id, title: r.title, excerpt: r.excerpt })) })
    } catch {
      // FTS5 MATCH syntax error fallback
      const rows = ctx.db.prepare(`
        SELECT id, title, substr(content, 1, 200) AS excerpt
        FROM notes
        WHERE title LIKE ? OR content LIKE ?
        LIMIT ?
      `).all(`%${args.query}%`, `%${args.query}%`, limit) as any[]
      return JSON.stringify({ found: rows.length, results: rows.map(r => ({ id: r.id, title: r.title, excerpt: r.excerpt })) })
    }
  }
})

toolRegistry.register({
  name: 'get_note',
  emoji: '📄',
  idempotent: true,
  maxResultChars: 10000,
  schema: {
    name: 'get_note',
    description: '读取指定笔记的完整内容。先用 search_notes 找到笔记 id，再用此工具获取全文。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '笔记 ID（来自 search_notes 或 list_notes 的结果）' }
      },
      required: ['id']
    }
  },
  handler: async (args, ctx) => {
    const note = ctx.db.prepare('SELECT id, title, content, word_count, updated_at FROM notes WHERE id = ?').get(String(args.id)) as any
    if (!note) return JSON.stringify({ error: '笔记不存在，请用 search_notes 确认 ID' })
    return JSON.stringify({ id: note.id, title: note.title, content: note.content, wordCount: note.word_count, updatedAt: note.updated_at })
  }
})

toolRegistry.register({
  name: 'list_notes',
  emoji: '📚',
  idempotent: true,
  maxResultChars: 5000,
  schema: {
    name: 'list_notes',
    description: '列出最近更新的笔记（仅标题和 ID）。浏览笔记库或不确定搜索词时使用。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量，默认 10，最大 50' }
      }
    }
  },
  handler: async (args, ctx) => {
    const limit = Math.min(Number(args.limit ?? 10), 50)
    const rows = ctx.db.prepare('SELECT id, title, word_count, updated_at FROM notes ORDER BY updated_at DESC LIMIT ?').all(limit) as any[]
    return JSON.stringify({ count: rows.length, notes: rows.map(r => ({ id: r.id, title: r.title, wordCount: r.word_count, updatedAt: r.updated_at })) })
  }
})

toolRegistry.register({
  name: 'create_note',
  emoji: '✍️',
  idempotent: false,
  schema: {
    name: 'create_note',
    description: '在笔记本中创建一篇新笔记。用于整理对话结论、保存重要信息、记录分析结果。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '笔记标题（简洁明了）' },
        content: { type: 'string', description: '笔记正文内容，支持 Markdown 格式' }
      },
      required: ['title', 'content']
    }
  },
  handler: async (args, ctx) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const content = String(args.content)
    ctx.db.prepare(`
      INSERT INTO notes (id, title, content, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, String(args.title), content, content.length, now, now)
    return JSON.stringify({ ok: true, id, title: args.title, message: '笔记已创建' })
  }
})

toolRegistry.register({
  name: 'update_note',
  emoji: '✏️',
  idempotent: false,
  schema: {
    name: 'update_note',
    description: '修改已有笔记的标题或内容。需要先知道笔记 ID（通过 search_notes 或 list_notes 获取）。',
    parameters: {
      type: 'object',
      properties: {
        id:      { type: 'string', description: '笔记 ID' },
        title:   { type: 'string', description: '新标题（可选，不填则不修改）' },
        content: { type: 'string', description: '新内容（可选，不填则不修改），会完全替换原内容' }
      },
      required: ['id']
    }
  },
  handler: async (args, ctx) => {
    const note = ctx.db.prepare('SELECT id FROM notes WHERE id = ?').get(String(args.id)) as any
    if (!note) return JSON.stringify({ error: '笔记不存在' })

    const parts: string[] = ['updated_at = ?']
    const vals: unknown[] = [Date.now()]
    if (args.title !== undefined)   { parts.push('title = ?');      vals.push(String(args.title)) }
    if (args.content !== undefined) {
      parts.push('content = ?', 'word_count = ?')
      vals.push(String(args.content), String(args.content).length)
    }
    vals.push(String(args.id))
    ctx.db.prepare(`UPDATE notes SET ${parts.join(', ')} WHERE id = ?`).run(...vals)
    return JSON.stringify({ ok: true, message: '笔记已更新' })
  }
})
