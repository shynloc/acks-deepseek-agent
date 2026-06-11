import { net } from 'electron'
import { toolRegistry } from '../registry'

toolRegistry.register({
  name: 'web_search',
  emoji: '🌐',
  idempotent: true,
  maxResultChars: 8000,
  // Only available when Tavily API key is configured
  checkFn: () => {
    // Dynamic check at call time — store is injected via ctx
    return true  // actual key check happens in handler; checkFn used for schema filtering
  },
  schema: {
    name: 'web_search',
    description: '搜索互联网获取实时信息、新闻、最新数据。当用户问题需要最新信息，或笔记库中没有相关内容时使用。',
    parameters: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: '搜索查询词，建议用关键词而非完整问句' },
        max_results: { type: 'number', description: '返回结果数，默认 5，最大 10' }
      },
      required: ['query']
    }
  },
  handler: async (args, ctx) => {
    const pluginOn = ctx.store.get('webSearchEnabled') as boolean ?? true
    if (!pluginOn) return JSON.stringify({ error: '联网搜索插件已禁用，请在个人中心「内置插件」中开启' })
    const rawKey = (ctx.store.get('tavilyKey') as string | undefined) ?? ''
    const apiKey = rawKey.replace(/[^\x20-\x7E]/g, '').trim()
    if (!apiKey) return JSON.stringify({ error: '联网搜索未配置，请在设置页填写 Tavily API Key' })

    const maxResults = Math.min(Number(args.max_results ?? 5), 10)
    try {
      const res = await net.fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: String(args.query),
          max_results: maxResults,
          search_depth: 'basic',
          include_answer: true,
          include_raw_content: false
        })
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return JSON.stringify({ error: `Tavily HTTP ${res.status}`, detail: body.slice(0, 200) })
      }
      const data = await res.json() as any
      return JSON.stringify({
        answer: data.answer,
        results: (data.results ?? []).slice(0, maxResults).map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content?.slice(0, 500)
        }))
      })
    } catch (e: any) {
      return JSON.stringify({ error: e?.message ?? '网络请求失败' })
    }
  }
})
