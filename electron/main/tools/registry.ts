import type Database from 'better-sqlite3'
import type Store from 'electron-store'

// Subset of JSON Schema actually used by the builtin tools. Recursive so that
// array `items` and nested object `properties` are expressible.
export interface JsonSchemaNode {
  type?: string
  description?: string
  enum?: string[]
  items?: JsonSchemaNode
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
}

export interface ToolSchema {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JsonSchemaNode>
    required?: string[]
  }
}

export interface ToolContext {
  db: Database.Database
  store: InstanceType<typeof Store>
}

export interface ToolEntry {
  name: string
  schema: ToolSchema
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
  checkFn?: () => boolean   // runtime availability gate (e.g. API key present)
  maxResultChars?: number   // truncate oversized results
  emoji?: string
  idempotent?: boolean      // true = read-only, safe for Guardrails no-progress check
}

class ToolRegistry {
  private tools = new Map<string, ToolEntry>()

  register(entry: ToolEntry): void {
    this.tools.set(entry.name, entry)
  }

  get(name: string): ToolEntry | undefined {
    return this.tools.get(name)
  }

  getAll(opts?: { enabledOnly?: boolean }): ToolEntry[] {
    const entries = [...this.tools.values()]
    if (!opts?.enabledOnly) return entries
    return entries.filter(t => !t.checkFn || t.checkFn())
  }

  // Returns OpenAI-format tools array for API requests
  toApiFormat(entries: ToolEntry[]): Array<{ type: 'function'; function: ToolSchema }> {
    return entries.map(t => ({ type: 'function' as const, function: t.schema }))
  }
}

export const toolRegistry = new ToolRegistry()
