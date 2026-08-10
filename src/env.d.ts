/// <reference types="vite/client" />

// 由 electron.vite.config.ts 的 define 从 package.json 注入
declare const __APP_VERSION__: string

// window.api 的类型直接复用 preload 导出的 ElectronAPI，避免两处手工维护导致漂移。
// 新增 preload API 时无需改动本文件。
interface Window {
  api: import('../electron/preload').ElectronAPI
}
