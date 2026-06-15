/**
 * Picbed service — Cloudflare Worker + R2 image hosting.
 * All network calls go through the main process (net.fetch via IPC) to avoid
 * file:// cross-origin restrictions in packaged Electron apps.
 */

export interface PicbedConfig {
  url:   string   // base URL, e.g. https://img.example.com
  token: string   // management password
}

export interface UploadResult {
  key: string   // server-assigned path, e.g. "2026/06/abc123_photo.jpg"
}

export function imageUrl(key: string, baseUrl: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/$/, '')}/${encoded}`
}

export async function testPicbed(_config: PicbedConfig): Promise<{ ok: boolean; error?: string }> {
  return window.api.picbedIpc.test()
}

export async function uploadFile(file: File, _config: PicbedConfig, folder = ''): Promise<UploadResult> {
  const buffer = await file.arrayBuffer()
  return window.api.picbedIpc.upload({
    buffer,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    folder
  })
}
