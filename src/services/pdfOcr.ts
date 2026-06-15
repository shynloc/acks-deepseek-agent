/**
 * PDF OCR service — renders scanned PDF pages to canvas one at a time,
 * then runs Tesseract.js on each page. Never holds more than one page
 * in memory simultaneously.
 */

export interface OcrProgress {
  currentPage: number
  totalPages: number
  etaSecs:    number
}

export interface OcrResult {
  text:           string
  pagesProcessed: number
  cancelled:      boolean
}

// Scale 2.0 ≈ 144 DPI — good OCR quality, ~8 MB per A4 page (vs 32 MB at 4x)
const RENDER_SCALE = 2.0

export async function ocrPdfFile(
  file:       File,
  signal:     AbortSignal,
  onProgress: (p: OcrProgress) => void
): Promise<OcrResult> {
  // ── Load PDF ──────────────────────────────────────────────────────────────
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).href
  }

  const buffer = await file.arrayBuffer()
  if (signal.aborted) return { text: '', pagesProcessed: 0, cancelled: true }

  const pdf        = await getDocument({ data: buffer }).promise
  const totalPages = pdf.numPages

  // ── Init Tesseract worker once (reused across all pages) ─────────────────
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['chi_sim', 'eng'], 1, { logger: () => {} })

  const chunks:       string[] = []
  const recentPageMs: number[] = []
  let cancelled = false

  try {
    for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
      if (signal.aborted) { cancelled = true; break }

      const t0 = Date.now()

      // Render page → canvas
      const page     = await pdf.getPage(pageNo)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas   = document.createElement('canvas')
      canvas.width   = Math.floor(viewport.width)
      canvas.height  = Math.floor(viewport.height)
      const ctx      = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()

      // OCR the canvas
      const { data } = await worker.recognize(canvas)
      const text = data.text.trim()
      if (text) chunks.push(`（第 ${pageNo} 页）\n${text}`)

      // Release canvas memory immediately — critical for large files
      canvas.width  = 0
      canvas.height = 0

      // Rolling ETA over last 5 pages
      recentPageMs.push(Date.now() - t0)
      if (recentPageMs.length > 5) recentPageMs.shift()
      const avg     = recentPageMs.reduce((a, b) => a + b, 0) / recentPageMs.length
      const etaSecs = Math.round((avg * (totalPages - pageNo)) / 1000)

      onProgress({ currentPage: pageNo, totalPages, etaSecs })

      // Yield to UI thread to keep app responsive
      await new Promise<void>(r => setTimeout(r, 0))
    }
  } finally {
    await worker.terminate()
    await pdf.destroy()
  }

  return {
    text:           chunks.join('\n\n'),
    pagesProcessed: chunks.length,
    cancelled,
  }
}
