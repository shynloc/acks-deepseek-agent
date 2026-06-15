/**
 * Native .pptx generation tool
 * Design system: adapted from ACKS Studio Document Design System v1.0
 * Brand: DeepSeek Blue #4D6BFE
 *
 * Uses pptxgenjs — no external runtime required.
 */
import { app, shell } from 'electron'
import path from 'path'
import PptxGenJS from 'pptxgenjs'
import { toolRegistry } from '../registry'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  primary:     '4D6BFE',
  primaryDeep: '3A55D4',
  primarySoft: 'EEF2FF',
  ink:         '1A1A1A',
  inkMid:      '4A4A4A',
  inkLight:    '9A9A9A',
  surface:     'FFFFFF',
  border:      'E4E4E4',
  bg:          'F8F9FF',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uniquePath(dir: string, name: string, ext: string): string {
  let p = path.join(dir, `${name}.${ext}`)
  let i = 1
  while (require('fs').existsSync(p)) {
    p = path.join(dir, `${name} (${i++}).${ext}`)
  }
  return p
}

function hex(c: string) { return `#${c}` }

// ── Slide builders ────────────────────────────────────────────────────────────

/** Cover slide */
function addCoverSlide(prs: PptxGenJS, title: string, subtitle: string, meta: Record<string, string>) {
  const slide = prs.addSlide()

  // Background gradient block
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 2.8,
    fill: { type: 'solid', color: T.primary },
  })

  // Decorative accent bar
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 2.8, w: '100%', h: 0.08,
    fill: { type: 'solid', color: T.primaryDeep },
  })

  // Title
  slide.addText(title, {
    x: 0.5, y: 0.55, w: 9, h: 1.4,
    fontSize: 36, bold: true, color: T.surface,
    fontFace: 'Arial',
    valign: 'middle',
  })

  // Subtitle
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 1.95, w: 9, h: 0.6,
      fontSize: 16, color: 'D0D8FF',
      fontFace: 'Arial',
    })
  }

  // Meta block bottom-left
  const metaLines = Object.entries(meta).map(([k, v]) => `${k}：${v}`).join('   ')
  if (metaLines) {
    slide.addText(metaLines, {
      x: 0.5, y: 2.35, w: 9, h: 0.35,
      fontSize: 10, color: 'A0B0FF',
      fontFace: 'Arial',
    })
  }

  // Logo mark — colored rect
  slide.addShape(prs.ShapeType.rect, {
    x: 0.5, y: 3.2, w: 0.2, h: 0.2,
    fill: { type: 'solid', color: T.primary },
    line: { color: T.primary, width: 0 },
  })
  slide.addText('DeepSeek Notes', {
    x: 0.75, y: 3.15, w: 3, h: 0.3,
    fontSize: 9, color: T.inkLight, fontFace: 'Arial',
  })
}

/** Section title slide */
function addSectionSlide(prs: PptxGenJS, title: string, subtitle?: string) {
  const slide = prs.addSlide()

  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: '100%',
    fill: { type: 'solid', color: T.primary },
  })

  slide.addText(title, {
    x: 0.6, y: 1.5, w: 9, h: 1.2,
    fontSize: 28, bold: true, color: T.ink,
    fontFace: 'Arial',
  })

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6, y: 2.7, w: 9, h: 0.5,
      fontSize: 14, color: T.inkMid,
      fontFace: 'Arial',
    })
  }
}

/** Bullet slide */
function addBulletSlide(prs: PptxGenJS, title: string, bullets: string[], notes?: string) {
  const slide = prs.addSlide()

  // Header bar
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.6,
    fill: { type: 'solid', color: T.primary },
  })
  slide.addText(title, {
    x: 0.3, y: 0, w: 9.4, h: 0.6,
    fontSize: 18, bold: true, color: T.surface,
    fontFace: 'Arial', valign: 'middle',
  })

  // Bullets
  const bulletObjs = bullets.map(b => ({
    text: b,
    options: { bullet: { type: 'bullet' as const }, fontSize: 15, color: T.ink, fontFace: 'Arial', paraSpaceBefore: 6 },
  }))
  slide.addText(bulletObjs, {
    x: 0.4, y: 0.8, w: 9.2, h: 4.4,
    valign: 'top',
  })

  if (notes) slide.addNotes(notes)
}

/** Two-column slide */
function addTwoColumnSlide(prs: PptxGenJS, title: string, leftTitle: string, leftItems: string[], rightTitle: string, rightItems: string[]) {
  const slide = prs.addSlide()

  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.6,
    fill: { type: 'solid', color: T.primary },
  })
  slide.addText(title, {
    x: 0.3, y: 0, w: 9.4, h: 0.6,
    fontSize: 18, bold: true, color: T.surface,
    fontFace: 'Arial', valign: 'middle',
  })

  // Left column
  slide.addText(leftTitle, {
    x: 0.3, y: 0.75, w: 4.5, h: 0.4,
    fontSize: 13, bold: true, color: T.primary, fontFace: 'Arial',
  })
  slide.addShape(prs.ShapeType.rect, {
    x: 0.3, y: 1.15, w: 4.5, h: 0.04,
    fill: { type: 'solid', color: T.primary },
  })
  if (leftItems.length) {
    slide.addText(leftItems.map(t => ({ text: t, options: { bullet: { type: 'bullet' as const }, fontSize: 13, color: T.inkMid, fontFace: 'Arial', paraSpaceBefore: 5 } })), {
      x: 0.3, y: 1.25, w: 4.5, h: 4,
    })
  }

  // Right column
  slide.addText(rightTitle, {
    x: 5.2, y: 0.75, w: 4.5, h: 0.4,
    fontSize: 13, bold: true, color: T.primary, fontFace: 'Arial',
  })
  slide.addShape(prs.ShapeType.rect, {
    x: 5.2, y: 1.15, w: 4.5, h: 0.04,
    fill: { type: 'solid', color: T.primary },
  })
  if (rightItems.length) {
    slide.addText(rightItems.map(t => ({ text: t, options: { bullet: { type: 'bullet' as const }, fontSize: 13, color: T.inkMid, fontFace: 'Arial', paraSpaceBefore: 5 } })), {
      x: 5.2, y: 1.25, w: 4.5, h: 4,
    })
  }
}

/** Table slide */
function addTableSlide(prs: PptxGenJS, title: string, headers: string[], rows: string[][]) {
  const slide = prs.addSlide()

  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.6,
    fill: { type: 'solid', color: T.primary },
  })
  slide.addText(title, {
    x: 0.3, y: 0, w: 9.4, h: 0.6,
    fontSize: 18, bold: true, color: T.surface,
    fontFace: 'Arial', valign: 'middle',
  })

  const colW = 9.4 / Math.max(headers.length, 1)
  const tableRows = [
    headers.map(h => ({
      text: h,
      options: { bold: true, fontSize: 12, color: T.surface, fontFace: 'Arial', fill: { color: T.primary }, align: 'center' as const },
    })),
    ...rows.map(row => row.map(cell => ({
      text: cell,
      options: { fontSize: 11, color: T.inkMid, fontFace: 'Arial' },
    }))),
  ]

  slide.addTable(tableRows, {
    x: 0.3, y: 0.75, w: 9.4,
    colW: headers.map(() => colW),
    border: { pt: 0.5, color: T.border },
    autoPage: false,
  })
}

/** Quote / highlight slide */
function addQuoteSlide(prs: PptxGenJS, quote: string, author?: string) {
  const slide = prs.addSlide()

  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { type: 'solid', color: T.bg },
  })
  slide.addShape(prs.ShapeType.rect, {
    x: 0.5, y: 0.5, w: 0.15, h: 4.5,
    fill: { type: 'solid', color: T.primary },
  })

  slide.addText(`"${quote}"`, {
    x: 1, y: 0.8, w: 8.5, h: 3.5,
    fontSize: 22, color: T.ink, italic: true,
    fontFace: 'Arial', valign: 'middle',
  })

  if (author) {
    slide.addText(`— ${author}`, {
      x: 1, y: 4.4, w: 8.5, h: 0.4,
      fontSize: 13, color: T.inkMid, fontFace: 'Arial',
    })
  }
}

/** Closing / thank-you slide */
function addClosingSlide(prs: PptxGenJS, message: string, contact?: string) {
  const slide = prs.addSlide()

  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { type: 'solid', color: T.primary },
  })

  slide.addText(message, {
    x: 0.5, y: 1.5, w: 9, h: 2,
    fontSize: 36, bold: true, color: T.surface,
    fontFace: 'Arial', valign: 'middle', align: 'center',
  })

  if (contact) {
    slide.addText(contact, {
      x: 0.5, y: 3.6, w: 9, h: 0.5,
      fontSize: 13, color: 'D0D8FF', fontFace: 'Arial', align: 'center',
    })
  }

  slide.addText('DeepSeek Notes', {
    x: 0.5, y: 4.8, w: 9, h: 0.3,
    fontSize: 9, color: '7090EE', fontFace: 'Arial', align: 'center',
  })
}

// ── Slide type definitions ─────────────────────────────────────────────────────
type SlideSpec =
  | { type: 'cover';       title: string; subtitle?: string; meta?: Record<string, string> }
  | { type: 'section';     title: string; subtitle?: string }
  | { type: 'bullets';     title: string; bullets: string[]; notes?: string }
  | { type: 'two_columns'; title: string; left_title: string; left_items: string[]; right_title: string; right_items: string[] }
  | { type: 'table';       title: string; headers: string[]; rows: string[][] }
  | { type: 'quote';       quote: string; author?: string }
  | { type: 'closing';     message: string; contact?: string }

// ── Tool registration ─────────────────────────────────────────────────────────

toolRegistry.register({
  name:       'create_pptx',
  emoji:      '📊',
  idempotent: false,
  schema: {
    name:        'create_pptx',
    description: '生成专业 PowerPoint 演示文稿（.pptx），支持封面、章节页、要点页、双栏对比、数据表格、引用页和结尾页，保存到桌面。调用前请先将内容结构化为幻灯片序列。',
    parameters: {
      type:       'object',
      required:   ['filename', 'slides'],
      properties: {
        filename: {
          type:        'string',
          description: '文件名（不含扩展名），例如 "Q3 战略汇报"',
        },
        slides: {
          type:        'array',
          description: '幻灯片序列，每个元素描述一张幻灯片',
          items: {
            type:       'object',
            required:   ['type'],
            properties: {
              type: {
                type: 'string',
                enum: ['cover', 'section', 'bullets', 'two_columns', 'table', 'quote', 'closing'],
                description: 'cover=封面, section=章节过渡页, bullets=要点列表, two_columns=双栏对比, table=数据表格, quote=金句引用, closing=结束页',
              },
              title:       { type: 'string',  description: '幻灯片标题（cover/section/bullets/two_columns/table 必填）' },
              subtitle:    { type: 'string',  description: '副标题（cover/section 可选）' },
              meta:        { type: 'object',  description: '封面元数据键值对，最多4项，例如 {"日期":"2026-06","作者":"张三"}' },
              bullets:     { type: 'array',  items: { type: 'string' }, description: '要点文本列表（bullets 幻灯片必填）' },
              notes:       { type: 'string',  description: '演讲者备注（bullets 可选）' },
              left_title:  { type: 'string',  description: '左栏标题（two_columns 必填）' },
              left_items:  { type: 'array',  items: { type: 'string' }, description: '左栏要点（two_columns 必填）' },
              right_title: { type: 'string',  description: '右栏标题（two_columns 必填）' },
              right_items: { type: 'array',  items: { type: 'string' }, description: '右栏要点（two_columns 必填）' },
              headers:     { type: 'array',  items: { type: 'string' }, description: '表头列名（table 必填）' },
              rows:        { type: 'array',  items: { type: 'array', items: { type: 'string' } }, description: '数据行（table 必填）' },
              quote:       { type: 'string',  description: '引用内容（quote 必填）' },
              author:      { type: 'string',  description: '引用来源（quote 可选）' },
              message:     { type: 'string',  description: '结束语（closing 必填）' },
              contact:     { type: 'string',  description: '联系方式（closing 可选）' },
            },
          },
        },
      },
    },
  },

  handler: async (args: { filename: string; slides: SlideSpec[] }) => {
    const desktopDir = app.getPath('desktop')
    const outPath    = uniquePath(desktopDir, args.filename, 'pptx')

    const prs = new PptxGenJS()
    prs.layout = 'LAYOUT_WIDE'  // 16:9

    for (const s of args.slides) {
      switch (s.type) {
        case 'cover':
          addCoverSlide(prs, s.title, s.subtitle ?? '', s.meta ?? {})
          break
        case 'section':
          addSectionSlide(prs, s.title, s.subtitle)
          break
        case 'bullets':
          addBulletSlide(prs, s.title, s.bullets, s.notes)
          break
        case 'two_columns':
          addTwoColumnSlide(prs, s.title, s.left_title, s.left_items, s.right_title, s.right_items)
          break
        case 'table':
          addTableSlide(prs, s.title, s.headers, s.rows)
          break
        case 'quote':
          addQuoteSlide(prs, s.quote, s.author)
          break
        case 'closing':
          addClosingSlide(prs, s.message, s.contact)
          break
      }
    }

    await prs.writeFile({ fileName: outPath })
    await shell.openPath(outPath)

    const slideCount = args.slides.length
    return {
      success:    true,
      filePath:   outPath,
      result:     `✅ 演示文稿已生成：${path.basename(outPath)}（${slideCount} 张幻灯片），已保存到桌面。`,
      artifacts: [{ type: 'pptx', path: outPath, name: path.basename(outPath) }],
    }
  },
})
