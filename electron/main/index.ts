import { app, BrowserWindow, shell, dialog, protocol, net, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { initDatabase, closeDatabase, getDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { registerAgentIpc } from './agent'
import { syncMemos } from './sync/memos'

// ── Global error guards ────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
  dialog.showErrorBox('发生错误', `${err.message}\n\n应用将继续运行，但建议重启。`)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createTray(): void {
  // Resolve tray icon: dev uses source file, production uses extraResources copy
  // macOS: .icns works; Windows/Linux: .png needed — both provided in resources/
  const iconFile = process.platform === 'darwin' ? 'icon.icns' : 'tray-icon.png'
  const iconPath = is.dev
    ? join(__dirname, `../../resources/${iconFile}`)
    : join(process.resourcesPath, iconFile)

  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  if (process.platform === 'darwin') icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('DeepSeek Notes')

  const buildMenu = () => Menu.buildFromTemplate([
    { label: '显示 DeepSeek Notes', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: '新建对话',  click: () => { mainWindow?.show(); mainWindow?.webContents.send('tray:new-chat') } },
    { label: '新建笔记',  click: () => { mainWindow?.show(); mainWindow?.webContents.send('tray:new-note') } },
    { type: 'separator' },
    { label: '退出', click: () => { tray?.destroy(); app.quit() } }
  ])

  tray.setContextMenu(buildMenu())

  // macOS: click on tray icon toggles window; Windows/Linux: double-click
  if (process.platform === 'darwin') {
    tray.on('click', () => {
      if (mainWindow?.isVisible()) { mainWindow.hide() } else { mainWindow?.show(); mainWindow?.focus() }
    })
  } else {
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // macOS: hiddenInset keeps traffic lights; Windows/Linux: hidden lets our custom controls take over
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    // traffic lights centered in 56px banner: (56-12)/2 = 22 — macOS only
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 20 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Notify renderer when maximize state changes (for custom title bar controls)
  mainWindow.on('maximize',   () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))

  // Hide to tray on close (Windows / Linux); macOS keeps the app running in dock
  mainWindow.on('close', (e) => {
    if (process.platform !== 'darwin' && tray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── memos-asset:// protocol — proxy authenticated Memos images ────────────────
protocol.registerSchemesAsPrivileged([
  { scheme: 'memos-asset', privileges: { secure: true, supportFetchAPI: true, corsEnabled: true } }
])

const cfgStore = new Store()
let autoSyncTimer: ReturnType<typeof setInterval> | null = null

function startAutoSync(): void {
  if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null }
  const intervalMins = (cfgStore.get('memosSyncInterval') as number | undefined) ?? 15
  if (intervalMins <= 0) return  // manual only
  autoSyncTimer = setInterval(async () => {
    const url   = (cfgStore.get('memosUrl')            as string | undefined)?.trim() ?? ''
    const token = (cfgStore.get('memosToken')          as string | undefined)?.trim() ?? ''
    const enabled = cfgStore.get('memosPluginEnabled') as boolean | undefined
    if (!url || !token || enabled === false) return
    try { await syncMemos(getDatabase(), { url, token }) } catch (e) { console.error('[memos-auto-sync]', e) }
  }, intervalMins * 60 * 1000)
}

app.whenReady().then(() => {
  // Register memos-asset:// protocol
  protocol.handle('memos-asset', async (request) => {
    const token = (cfgStore.get('memosToken') as string | undefined)?.trim() ?? ''
    const realUrl = request.url.replace(/^memos-asset:\/\//, 'https://')
    try {
      return await net.fetch(realUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
    } catch (e: any) {
      return new Response(`Image load failed: ${e.message}`, { status: 502 })
    }
  })

  initDatabase()
  registerIpcHandlers()
  createWindow()
  if (mainWindow) registerAgentIpc(mainWindow)
  startAutoSync()

  // Window control IPC (used by custom title bar on Windows / Linux)
  createTray()

  ipcMain.handle('window:minimize',    () => { mainWindow?.minimize() })
  ipcMain.handle('window:maximize',    () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.handle('window:close',       () => { mainWindow?.close() })
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
