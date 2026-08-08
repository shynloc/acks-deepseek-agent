/// <reference types="vite/client" />

// window.api 的类型直接复用 preload 导出的 ElectronAPI，避免两处手工维护导致漂移。
// 新增 preload API 时无需改动本文件。
interface Window {
  api: import('../electron/preload').ElectronAPI
}
