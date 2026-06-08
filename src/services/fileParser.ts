/**
 * File parser service — extracts text from various file formats.
 *
 * Supported:
 *   Text/Markup : .txt .md .html .htm .csv
 *   Office      : .docx  .xlsx .xls  .pptx
 *   PDF         : .pdf
 *   Images      : .png .jpg .jpeg .webp .bmp .tiff
 *                 → Vision API (MiMo) if configured, else Tesseract.js OCR
 */

import type { VisionConfig } from './visionApi'

export interface ParseOptions {
  vision?: VisionConfig            // if set, use vision API for images
  imagePrompt?: string             // custom prompt sent to vision model
}

export interface ParseResult {
  text: string       // extracted plain text
  type: string       // human-readable format name
  pages?: number     // page / sheet count, if applicable
  warning?: string   // non-fatal notice to show the user
  isOcr?: boolean    // true when text came from OCR / vision
  visionUsed?: boolean  // true when MiMo vision API was used
}

const MAX_CHARS = 12_000   // truncate injected context beyond this

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
export async function parseFile(file: File, options?: ParseOptions): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mime = file.type

  if (mime.startsWith('image/') || ['png','jpg','jpeg','webp','bmp','tiff','gif'].includes(ext)) {
    return parseImage(file, options)
  }

  switch (ext) {
    case 'txt':   return parseText(file)
    case 'md':    return parseText(file)
    case 'html':
    case 'htm':   return parseHtml(file)
    case 'csv':   return parseCsv(file)
    case 'pdf':   return parsePdf(file)
    case 'docx':  return parseDocx(file)
    case 'xlsx':
    case 'xls':   return parseExcel(file, ext)
    case 'pptx':  return parsePptx(file)
    default:
      // Best-effort: try to read as UTF-8 text
      try { return await parseText(file) } catch {
        throw new Error(`不支持的文件格式：.${ext}`)
      }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain text / Markdown
// ─────────────────────────────────────────────────────────────────────────────
async function parseText(file: File): Promise<ParseResult> {
  const text = await readText(file)
  return { text: trunc(text), type: 'Text' }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────
async function parseHtml(file: File): Promise<ParseResult> {
  const raw = await readText(file)
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  // Remove script / style nodes
  doc.querySelectorAll('script,style,noscript').forEach(el => el.remove())
  const text = (doc.body?.innerText ?? doc.documentElement.textContent ?? '').replace(/\s{3,}/g, '\n\n').trim()
  return { text: trunc(text), type: 'HTML' }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────
async function parseCsv(file: File): Promise<ParseResult> {
  const raw = await readText(file)
  const lines = raw.trim().split('\n').slice(0, 200)
  const text = lines.map(l => l.replace(/,/g, ' | ')).join('\n')
  return {
    text: trunc(text),
    type: 'CSV',
    warning: lines.length >= 200 ? '仅导入前 200 行' : undefined
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF  (pdfjs-dist)
// ─────────────────────────────────────────────────────────────────────────────
async function parsePdf(file: File): Promise<ParseResult> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')

  // Configure worker — use inline worker bundled by Vite
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).href
  }

  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter((it: any) => 'str' in it)
      .map((it: any) => it.str)
      .join(' ')
      .trim()
    if (pageText) pageTexts.push(`（第 ${i} 页）\n${pageText}`)
  }

  const text = trunc(pageTexts.join('\n\n'))
  const warning = pdf.numPages > 50 ? `PDF 共 ${pdf.numPages} 页，已提取前 50 页` : undefined

  if (!text.trim()) {
    // No text layer — likely a scanned image PDF
    return {
      text: '',
      type: 'PDF（扫描件）',
      pages: pdf.numPages,
      warning: '该 PDF 无文字层（可能是扫描件），无法提取文本。建议手动描述内容。',
      isOcr: false
    }
  }

  return { text, type: 'PDF', pages: pdf.numPages, warning }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX  (mammoth)
// ─────────────────────────────────────────────────────────────────────────────
async function parseDocx(file: File): Promise<ParseResult> {
  const mammoth = await import('mammoth')
  const buffer = await file.arrayBuffer()
  const result = await (mammoth as any).extractRawText({ arrayBuffer: buffer })
  const text = (result.value as string).trim()
  const warning = result.messages?.length ? '部分格式无法转换（图表、公式等）' : undefined
  return { text: trunc(text), type: 'Word 文档', warning }
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel / XLS  (SheetJS)
// ─────────────────────────────────────────────────────────────────────────────
async function parseExcel(file: File, ext: string): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheetTexts: string[] = []
  for (const name of workbook.SheetNames.slice(0, 10)) {
    const sheet = workbook.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    const lines = csv.trim().split('\n').slice(0, 150)
    if (lines.some(l => l.replace(/,/g, '').trim())) {
      const md = lines.map(l => '| ' + l.split(',').join(' | ') + ' |').join('\n')
      sheetTexts.push(`## 工作表：${name}\n\n${md}`)
    }
  }

  const text = trunc(sheetTexts.join('\n\n'))
  const warning = workbook.SheetNames.length > 10 ? `共 ${workbook.SheetNames.length} 个工作表，已提取前 10 个` : undefined
  return { text, type: ext === 'csv' ? 'CSV' : 'Excel 表格', pages: workbook.SheetNames.length, warning }
}

// ─────────────────────────────────────────────────────────────────────────────
// PPTX  (JSZip + XML parsing)
// ─────────────────────────────────────────────────────────────────────────────
async function parsePptx(file: File): Promise<ParseResult> {
  const JSZip = (await import('jszip')).default
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  // Find all slide XML files in order
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? '0')
      const numB = parseInt(b.match(/\d+/)?.[0] ?? '0')
      return numA - numB
    })

  const slideTexts: string[] = []
  for (let i = 0; i < Math.min(slideFiles.length, 50); i++) {
    const xml = await zip.files[slideFiles[i]].async('string')
    // Extract all <a:t> text nodes
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? []
    const text = matches
      .map(m => m.replace(/<[^>]+>/g, ''))
      .filter(Boolean)
      .join(' ')
      .trim()
    if (text) slideTexts.push(`（第 ${i + 1} 页）${text}`)
  }

  const warning = [
    slideFiles.length > 50 ? `共 ${slideFiles.length} 页，已提取前 50 页` : null,
    '图表、图片、表格样式等非文字内容无法提取'
  ].filter(Boolean).join('；') || undefined

  return {
    text: trunc(slideTexts.join('\n')),
    type: 'PowerPoint',
    pages: slideFiles.length,
    warning
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Images  — Vision API (MiMo) preferred, Tesseract.js OCR as fallback
// ─────────────────────────────────────────────────────────────────────────────
async function parseImage(file: File, options?: ParseOptions): Promise<ParseResult> {
  // ── Path 1: MiMo Vision API ───────────────────────────────────────────────
  if (options?.vision?.apiKey) {
    const { describeImage } = await import('./visionApi')
    const dataUrl = await readAsDataURL(file)
    const prompt = options.imagePrompt ?? '请详细描述这张图片的内容，包括文字、图表、图形等所有可见信息'

    try {
      const description = await describeImage(dataUrl, prompt, options.vision)
      return {
        text: trunc(description),
        type: `图片（${options.vision.model}）`,
        isOcr: true,
        visionUsed: true
      }
    } catch (err: any) {
      // Vision API failed — fall through to Tesseract with a warning
      return {
        text: '',
        type: '图片',
        warning: `视觉 API 调用失败（${err.message}），请检查 API Key 或网络`,
        isOcr: true,
        visionUsed: true
      }
    }
  }

  // ── Path 2: Tesseract.js OCR (text-only) ─────────────────────────────────
  const { createWorker } = await import('tesseract.js')

  const worker = await createWorker(['chi_sim', 'eng'], 1, {
    logger: () => {}
  })

  try {
    const { data } = await worker.recognize(file)
    const text = data.text.trim()

    if (!text || data.confidence < 10) {
      return {
        text: '',
        type: '图片',
        warning: '未识别到文字（置信度过低）。启用"图像识别模型"可理解图片的完整内容。',
        isOcr: true
      }
    }

    return {
      text: trunc(text),
      type: '图片（OCR）',
      isOcr: true,
      warning: `Tesseract OCR，置信度 ${Math.round(data.confidence)}%。启用"图像识别模型"可获得更准确的理解。`
    }
  } finally {
    await worker.terminate()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file, 'utf-8')
  })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function trunc(text: string): string {
  if (text.length <= MAX_CHARS) return text
  return text.slice(0, MAX_CHARS) + `\n\n…（内容过长，已截取前 ${MAX_CHARS} 字符）`
}
