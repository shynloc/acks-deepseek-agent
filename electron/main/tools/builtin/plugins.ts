import { net } from 'electron'
import { toolRegistry } from '../registry'
import type { ToolContext } from '../registry'

const REGISTERED_PLUGIN_NAMES = new Set<string>()

export function loadPluginsFromDb(ctx: ToolContext): void {
  try {
    const rows = ctx.db.prepare(
      `SELECT id, name, display_name, description, endpoint_url, method, headers_json, param_schema_json
       FROM plugins WHERE enabled = 1`
    ).all() as Array<{
      id: string
      name: string
      display_name: string
      description: string
      endpoint_url: string
      method: string
      headers_json: string
      param_schema_json: string
    }>

    for (const row of rows) {
      if (REGISTERED_PLUGIN_NAMES.has(row.name)) continue

      let parameters: Record<string, unknown>
      try { parameters = JSON.parse(row.param_schema_json) } catch {
        parameters = { type: 'object', properties: { input: { type: 'string', description: '输入' } }, required: ['input'] }
      }

      const endpointUrl = row.endpoint_url
      const method      = row.method as 'GET' | 'POST'
      const headersJson = row.headers_json

      toolRegistry.register({
        name:  row.name,
        emoji: '🔌',
        schema: {
          name:        row.name,
          description: row.description || row.display_name,
          parameters:  parameters as any
        },
        handler: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<string> => {
          let extraHeaders: Record<string, string> = {}
          try { extraHeaders = JSON.parse(headersJson || '{}') } catch {}

          const safeHeaders: Record<string, string> = {}
          for (const [k, v] of Object.entries(extraHeaders)) {
            safeHeaders[k.replace(/[^\x20-\x7E]/g, '').trim()] = String(v).replace(/[^\x20-\x7E]/g, '').trim()
          }

          const reqHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...safeHeaders
          }

          const url = method === 'GET'
            ? `${endpointUrl}?${new URLSearchParams(args as Record<string, string>).toString()}`
            : endpointUrl

          const res = await net.fetch(url, {
            method,
            headers: reqHeaders,
            body: method === 'POST' ? JSON.stringify(args) : undefined
          } as any)

          if (!res.ok) return `HTTP ${res.status}: ${await res.text().catch(() => 'unknown error')}`
          const text = await res.text()
          return text.slice(0, 3000)
        }
      })

      REGISTERED_PLUGIN_NAMES.add(row.name)
    }
  } catch (e: any) {
    console.error('[plugins] loadPluginsFromDb error:', e?.message)
  }
}
