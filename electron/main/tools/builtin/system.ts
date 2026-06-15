import os from 'os'
import path from 'path'
import { app } from 'electron'
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
  name: 'get_system_info',
  emoji: '💻',
  idempotent: true,
  schema: {
    name: 'get_system_info',
    description: '获取当前运行环境信息：操作系统、内存、CPU、Node.js 版本、应用版本等。当用户问"帮我检查运行环境"或"我的电脑配置"时使用。',
    parameters: { type: 'object', properties: {} }
  },
  handler: async () => {
    const cpus = os.cpus()
    // os.type(): 'Darwin' | 'Windows_NT' | 'Linux'
    const platformLabel: Record<string, string> = {
      darwin:  'macOS',
      win32:   'Windows',
      linux:   'Linux'
    }
    return JSON.stringify({
      platform:    platformLabel[process.platform] ?? process.platform,
      osType:      os.type(),      // Darwin / Windows_NT / Linux
      osRelease:   os.release(),   // kernel / build version
      arch:        os.arch(),      // x64 / arm64
      cpuModel:    cpus[0]?.model ?? 'unknown',
      cpuCount:    cpus.length,
      totalMemGB:  (os.totalmem() / 1_073_741_824).toFixed(1),
      freeMemGB:   (os.freemem()  / 1_073_741_824).toFixed(1),
      nodeVersion: process.versions.node,
      electronVer: process.versions.electron,
      chromeVer:   process.versions.chrome,
      appVersion:  app.getVersion(),
      homeDir:     os.homedir(),
      locale:      app.getLocale(),
      pathSep:     path.sep   // '/' on Mac/Linux, '\' on Windows
    })
  }
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
