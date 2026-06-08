import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { toolRegistry } from '../registry'

const SAFE_FORMATS = new Set(['md', 'txt', 'json', 'csv', 'html'])

function safeName(raw: string): string {
  return (raw || 'output').replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 100)
}

function resolveDir(dir?: string): string {
  const map: Record<string, string> = {
    desktop:   app.getPath('desktop'),
    documents: app.getPath('documents'),
    downloads: app.getPath('downloads')
  }
  return map[dir as string] ?? app.getPath('desktop')
}

function uniquePath(dir: string, name: string, ext: string): string {
  let p = path.join(dir, `${name}.${ext}`)
  let n = 1
  while (fs.existsSync(p)) { p = path.join(dir, `${name}_${n++}.${ext}`) }
  return p
}

toolRegistry.register({
  name:       'write_file',
  emoji:      '💾',
  idempotent: false,
  schema: {
    name:        'write_file',
    description: '将文本内容写入本地文件并保存到用户桌面（默认）。支持 md / txt / json / csv / html 格式。写完后自动在 Finder 中定位文件。如需生成 Word 文档，请选 html 格式（Word 可直接打开）。',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type:        'string',
          description: '文件名（不含扩展名），例如 "会议记录" 或 "2026年报告"'
        },
        content: {
          type:        'string',
          description: '要写入文件的完整文本内容'
        },
        format: {
          type:        'string',
          description: '文件格式：md（Markdown）、txt（纯文本）、json、csv、html（Word 可打开）',
          enum:        ['md', 'txt', 'json', 'csv', 'html']
        },
        directory: {
          type:        'string',
          description: '保存位置：desktop（桌面，默认）/ documents（文稿）/ downloads（下载）',
          enum:        ['desktop', 'documents', 'downloads']
        }
      },
      required: ['filename', 'content', 'format']
    }
  },
  handler: async (args) => {
    const { filename, content, format, directory } = args as {
      filename: string; content: string; format: string; directory?: string
    }

    const ext     = SAFE_FORMATS.has(format) ? format : 'txt'
    const dir     = resolveDir(directory)
    const name    = safeName(filename)
    const outPath = uniquePath(dir, name, ext)

    let finalContent = content as string

    // For HTML, wrap with minimal boilerplate so Word opens correctly
    if (ext === 'html') {
      const hasHtmlTag = /<html/i.test(finalContent)
      if (!hasHtmlTag) {
        finalContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; line-height: 1.8; max-width: 900px; margin: 2em auto; padding: 0 1em; }
    h1,h2,h3 { color: #1a1a2e; } code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 1em; border-radius: 6px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; } th,td { border: 1px solid #ddd; padding: 6px 12px; }
  </style>
</head>
<body>
${finalContent}
</body>
</html>`
      }
    }

    fs.writeFileSync(outPath, finalContent, 'utf8')
    shell.showItemInFolder(outPath)

    const readablePath = outPath.replace(app.getPath('home'), '~')
    return `✅ 文件已保存\n📄 文件名：${path.basename(outPath)}\n📁 路径：${readablePath}\n📝 格式：${ext.toUpperCase()}${ext === 'html' ? '（Word 可直接打开此文件）' : ''}`
  }
})
