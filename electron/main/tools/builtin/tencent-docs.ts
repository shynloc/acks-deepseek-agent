import { net } from 'electron'
import Store from 'electron-store'
import { toolRegistry } from '../registry'

const store = new Store()

const TDOC_MCP_URL  = 'https://docs.qq.com/openapi/mcp'
const SLIDE_MCP_URL = 'https://docs.qq.com/api/v6/slide/mcp'

// Tencent Docs tool names use dots (e.g. manage.recent_online_file).
// The DeepSeek/OpenAI API requires function names to match [a-zA-Z0-9_-]{1,64}.
// Map: "tdoc" prefix + dots → double-underscores
function sanitizeName(prefix: string, mcpName: string): string {
  return `${prefix}__${mcpName.replace(/\./g, '__').replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64)
}

function getToken(): string {
  return ((store.get('tencentDocsToken') as string | undefined) ?? '').trim()
}

function isEnabled(): boolean {
  const enabled = store.get('tencentDocsPluginEnabled') as boolean | undefined
  return enabled !== false && !!getToken()
}

async function callMcp(url: string, token: string, method: string, params: unknown): Promise<any> {
  const id  = Date.now()
  const res = await net.fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json, text/event-stream',
      'Authorization': token,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
  } as any)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase()

  if (ct.includes('text/event-stream')) {
    // Parse SSE stream: look for data: lines
    const text = await res.text()
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (payload === '[DONE]') break
      try {
        const json = JSON.parse(payload) as any
        if (json.error) throw new Error(`[${json.error.code}] ${json.error.message ?? JSON.stringify(json.error)}`)
        if (json.result !== undefined) return json.result
      } catch (e: any) {
        if (e.message?.match(/^\[/)) throw e   // re-throw MCP errors
        // JSON parse error → skip and continue
      }
    }
    throw new Error('腾讯文档 SSE 响应未包含有效结果')
  }

  const json = await res.json() as any
  if (json.error) throw new Error(`[${json.error.code}] ${json.error.message ?? JSON.stringify(json.error)}`)
  return json.result
}

// Track which tools have been registered so we can skip them on reload
const registeredNames = new Set<string>()
// Map sanitized name → original MCP name + endpoint URL
const toolMeta = new Map<string, { mcpName: string; url: string }>()

async function registerFromEndpoint(url: string, prefix: string, token: string): Promise<number> {
  let tools: any[] = []
  let cursor: string | undefined

  // Handle pagination
  do {
    const params: any = cursor ? { cursor } : {}
    const result = await callMcp(url, token, 'tools/list', params)
    const batch: any[] = result?.tools ?? []
    tools = tools.concat(batch)
    cursor = result?.nextCursor as string | undefined
  } while (cursor)

  for (const tool of tools) {
    const mcpName  = String(tool.name)
    const toolName = sanitizeName(prefix, mcpName)

    toolMeta.set(toolName, { mcpName, url })

    // Always register (overwrites previous) so token/enabled changes take effect
    toolRegistry.register({
      name:    toolName,
      emoji:   '📝',
      schema: {
        name:        toolName,
        description: `[腾讯文档] ${(tool.description as string | undefined) ?? mcpName}`,
        parameters:  (tool.inputSchema as any) ?? { type: 'object', properties: {}, required: [] },
      },
      checkFn: () => isEnabled(),
      handler: async (args): Promise<string> => {
        const tok = getToken()
        if (!tok) return JSON.stringify({ error: '腾讯文档 Token 未配置，请前往个人中心配置' })
        const meta = toolMeta.get(toolName)
        if (!meta) return JSON.stringify({ error: `工具元数据丢失: ${toolName}` })
        try {
          const res = await callMcp(meta.url, tok, 'tools/call', { name: meta.mcpName, arguments: args })
          const content: any[] = res?.content ?? []
          if (res?.isError) {
            const errMsg = content.map((c: any) => c.text ?? '').join('\n') || '工具调用失败'
            return JSON.stringify({ error: errMsg })
          }
          const text = content
            .map((c: any) => c.text ?? c.resource?.text ?? JSON.stringify(c))
            .join('\n')
          return (text || JSON.stringify(res)).slice(0, 8000)
        } catch (e: any) {
          return JSON.stringify({ error: e.message ?? String(e) })
        }
      },
    })

    registeredNames.add(toolName)
  }

  return tools.length
}

export async function initTencentDocsPlugin(): Promise<{ ok: boolean; toolCount?: number; error?: string }> {
  const token = getToken()
  if (!token) return { ok: false, error: 'Token 未配置' }

  try {
    const results = await Promise.allSettled([
      registerFromEndpoint(TDOC_MCP_URL,  'tdoc',  token),
      registerFromEndpoint(SLIDE_MCP_URL, 'slide', token),
    ])

    let total = 0
    const errors: string[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') total += r.value
      else errors.push(r.reason?.message ?? String(r.reason))
    }

    if (total === 0 && errors.length > 0) {
      return { ok: false, error: errors.join('; ') }
    }

    console.log(`[tencent-docs] 已注册 ${total} 个工具`)
    return { ok: true, toolCount: total }
  } catch (e: any) {
    return { ok: false, error: e.message ?? String(e) }
  }
}

export async function reloadTencentDocsPlugin(): Promise<{ ok: boolean; toolCount?: number; error?: string }> {
  // Clear so new token triggers fresh discovery (registeredNames not strictly needed
  // since register() overwrites, but keeps the set accurate)
  registeredNames.clear()
  return initTencentDocsPlugin()
}

export async function testTencentDocsToken(token: string): Promise<{ ok: boolean; toolCount?: number; error?: string }> {
  const t = token.trim()
  if (!t) return { ok: false, error: 'Token 不能为空' }
  try {
    const result = await callMcp(TDOC_MCP_URL, t, 'tools/list', {})
    const count = (result?.tools as any[] | undefined)?.length ?? 0
    return { ok: true, toolCount: count }
  } catch (e: any) {
    return { ok: false, error: e.message ?? String(e) }
  }
}
