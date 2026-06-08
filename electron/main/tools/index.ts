// Import all builtin tools to trigger self-registration into toolRegistry
import './builtin/system'
import './builtin/notes'
import './builtin/web'
import './builtin/files'

export { toolRegistry } from './registry'
export type { ToolEntry, ToolContext, ToolSchema } from './registry'
