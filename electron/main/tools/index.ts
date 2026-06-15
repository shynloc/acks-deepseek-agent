// Import all builtin tools to trigger self-registration into toolRegistry
import './builtin/system'
import './builtin/notes'
import './builtin/web'
import './builtin/files'
import './builtin/documents'
import './builtin/spreadsheet'
import './builtin/docx'
import './builtin/pptx'
import './builtin/memory'
import './builtin/filesystem'

export { toolRegistry } from './registry'
export type { ToolEntry, ToolContext, ToolSchema } from './registry'
