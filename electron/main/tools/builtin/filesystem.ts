/**
 * Level-1 power-mode tools: read_file, list_dir
 * Only available when user enables "Agent 增强模式" in settings.
 * Cross-platform: paths use path.sep, separators handled by Node fs/path APIs.
 */
import fs   from 'fs'
import path from 'path'
import { app } from 'electron'
import { toolRegistry } from '../registry'

const POWER_MODE_KEY = 'agentPowerMode'

// Paths that must never be read regardless of power mode
const BLOCKED_PATTERNS = [
  '.ssh/', 'id_rsa', 'id_ed25519', '.gnupg/', 'gnupg',
  '/etc/passwd', '/etc/shadow', '/etc/master.passwd',
  'Keychain', '.env', 'secrets', 'credentials',
  'AppData\\Roaming\\Microsoft\\Credentials',
]

function isBlocked(p: string): boolean {
  const norm = p.replace(/\\/g, '/')
  return BLOCKED_PATTERNS.some(b => norm.includes(b.replace(/\\/g, '/')))
}

toolRegistry.register({
  name: 'read_file',
  emoji: '📖',
  idempotent: true,
  maxResultChars: 25000,
  schema: {
    name: 'read_file',
    description: '读取本地文件内容（需开启 Agent 增强模式）。支持 txt/md/json/csv/html/xml/yaml/py/js/ts/sh 等文本格式。当用户让你分析某个本地文档时使用。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件完整路径。macOS/Linux 示例：/Users/user/Desktop/note.md；Windows 示例：C:\\Users\\user\\Desktop\\note.txt'
        }
      },
      required: ['path']
    }
  },
  handler: async (args, ctx) => {
    if (!ctx.store.get(POWER_MODE_KEY)) {
      return JSON.stringify({ error: '需要开启「Agent 增强模式」才能读取文件。请前往「个人中心 → Agent」开启。' })
    }
    const filePath = String(args.path).trim()
    if (isBlocked(filePath)) {
      return JSON.stringify({ error: '出于安全限制，此路径的文件不允许读取。' })
    }
    if (!fs.existsSync(filePath)) {
      return JSON.stringify({ error: `文件不存在：${filePath}` })
    }
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      return JSON.stringify({ error: '这是一个目录，请使用 list_dir 工具。' })
    }
    const MAX_BYTES = 5 * 1024 * 1024  // 5 MB
    if (stat.size > MAX_BYTES) {
      return JSON.stringify({ error: `文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），最大支持 5 MB。` })
    }
    const content = fs.readFileSync(filePath, 'utf8')
    const truncated = content.length > 20000
    return JSON.stringify({
      path: filePath,
      sizeKB: (stat.size / 1024).toFixed(1),
      content: content.slice(0, 20000) + (truncated ? `\n\n[文件已截断，总长 ${content.length} 字符]` : '')
    })
  }
})

toolRegistry.register({
  name: 'list_dir',
  emoji: '📁',
  idempotent: true,
  schema: {
    name: 'list_dir',
    description: '列出目录内容（需开启 Agent 增强模式）。不传路径则列出桌面、文稿、下载三个常用目录。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要列出的目录路径，留空则使用常用目录'
        },
        show_hidden: {
          type: 'string',
          description: '是否显示隐藏文件（以 . 开头），填 "true" 开启，默认不显示'
        }
      }
    }
  },
  handler: async (args, ctx) => {
    if (!ctx.store.get(POWER_MODE_KEY)) {
      return JSON.stringify({ error: '需要开启「Agent 增强模式」才能列出目录。' })
    }
    const showHidden = String(args.show_hidden) === 'true'
    const dirs = args.path
      ? [String(args.path).trim()]
      : [app.getPath('desktop'), app.getPath('documents'), app.getPath('downloads')]

    const result: Record<string, unknown> = {}
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) { result[dir] = { error: '目录不存在' }; continue }
      if (!fs.statSync(dir).isDirectory()) { result[dir] = { error: '不是目录' }; continue }
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => showHidden || !e.name.startsWith('.'))
        .slice(0, 200)
        .map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          path: path.join(dir, e.name)
        }))
      result[dir] = entries
    }
    return JSON.stringify(result)
  }
})
