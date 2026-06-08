import { toolRegistry } from '../registry'

toolRegistry.register({
  name: 'get_datetime',
  emoji: '🕐',
  idempotent: true,
  schema: {
    name: 'get_datetime',
    description: '获取当前日期和时间。当用户问"今天是几号"或任务需要知道当前时间时使用。',
    parameters: { type: 'object', properties: {} }
  },
  handler: async () => JSON.stringify({
    iso: new Date().toISOString(),
    local: new Date().toLocaleString('zh-CN'),
    date: new Date().toLocaleDateString('zh-CN'),
    time: new Date().toLocaleTimeString('zh-CN'),
    weekday: ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()],
    timestamp: Date.now()
  })
})

toolRegistry.register({
  name: 'get_stats',
  emoji: '📊',
  idempotent: true,
  schema: {
    name: 'get_stats',
    description: '获取用户笔记库的统计数据，包括笔记总数、字数、分类数量等。',
    parameters: { type: 'object', properties: {} }
  },
  handler: async (_, ctx) => {
    const noteCount  = (ctx.db.prepare('SELECT COUNT(*) AS c FROM notes').get() as any).c
    const wordCount  = (ctx.db.prepare('SELECT SUM(word_count) AS w FROM notes').get() as any).w ?? 0
    const convCount  = (ctx.db.prepare('SELECT COUNT(*) AS c FROM conversations').get() as any).c
    const catCount   = (ctx.db.prepare('SELECT COUNT(*) AS c FROM categories').get() as any).c
    const tagCount   = (ctx.db.prepare('SELECT COUNT(*) AS c FROM tags').get() as any).c
    return JSON.stringify({ noteCount, wordCount, convCount, catCount, tagCount })
  }
})
