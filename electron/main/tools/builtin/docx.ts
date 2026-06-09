/**
 * Native .docx generation tool
 * Design system: adapted from ACKS Studio Document Design System v1.0
 * Brand: DeepSeek Blue #4D6BFE (replaces orange #FF6B1A)
 *
 * Uses the `docx` npm package — no external runtime required.
 */
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, PageOrientation,
  Header, Footer, PageNumber, PageNumberElement,
  Tab, TabStopType,
  convertInchesToTwip, convertMillimetersToTwip,
  TableLayoutType
} from 'docx'
import { toolRegistry } from '../registry'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  // DeepSeek Blue palette (orange → blue swap)
  primary:     '4D6BFE',
  primaryDeep: '3A55D4',
  primarySoft: 'EEF2FF',

  // Neutrals
  ink:   '1A1A1A',
  ink2:  '444444',
  ink3:  '888888',
  white: 'FFFFFF',
  bg2:   'F5F5F7',
  bg3:   'EEEEEF',
  rule:  'D9D9DC',

  // Fonts
  fDisplay: 'Space Grotesk',
  fBody:    'DM Sans',
  fZh:      'Noto Sans SC',
  fMono:    'JetBrains Mono',

  // Sizes (half-points: 1pt = 2 half-pts)
  h1:   96,  // 48pt
  h2:   48,  // 24pt
  h3:   32,  // 16pt
  h4:   22,  // 11pt
  body: 21,  // 10.5pt
  cap:  18,  // 9pt
  meta: 16,  // 8pt
}

// ── Helper builders ───────────────────────────────────────────────────────────

function run(text: string, opts: {
  bold?: boolean; color?: string; font?: string; size?: number;
  allCaps?: boolean; italic?: boolean; break?: boolean
} = {}): TextRun {
  return new TextRun({
    text,
    bold:    opts.bold,
    italics: opts.italic,
    color:   opts.color ?? T.ink,
    font:    { name: opts.font ?? T.fZh },
    size:    opts.size ?? T.body,
    allCaps: opts.allCaps,
    break:   opts.break ? 1 : undefined
  })
}

function eyebrow(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 40 },
    children: [run(text.toUpperCase(), {
      font: T.fMono, size: T.meta, color: T.primary, bold: true, allCaps: true
    })]
  })
}

function heading1(enText: string, zhText?: string): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: T.ink } },
      children: [
        run(enText, { font: T.fDisplay, size: T.h2, bold: true, color: T.ink }),
      ]
    })
  ]
  if (zhText) {
    paras.push(new Paragraph({
      spacing: { before: 20, after: 80 },
      children: [run(zhText, { font: T.fZh, size: T.h3 - 4, color: T.ink2 })]
    }))
  }
  return paras
}

function heading2(text: string, zhText?: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: T.ink } },
    children: [
      run(text, { font: T.fDisplay, size: T.h3, bold: true, color: T.ink }),
      ...(zhText ? [run('  ' + zhText, { font: T.fZh, size: T.cap, color: T.ink2 })] : [])
    ]
  })
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 140, after: 40 },
    children: [run(text.toUpperCase(), { font: T.fDisplay, size: T.h4, bold: true, allCaps: true })]
  })
}

// ── Inline Markdown → TextRun[] ──────────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, and plain text segments
function inlineRuns(text: string, base: { font?: string; size?: number; color?: string } = {}): TextRun[] {
  const runs: TextRun[] = []
  // Order matters: match ** before * to avoid partial match
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  let lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) {
      runs.push(run(text.slice(lastIndex, m.index), base))
    }
    if (m[1] !== undefined) {
      runs.push(run(m[1], { ...base, bold: true }))
    } else if (m[2] !== undefined) {
      runs.push(run(m[2], { ...base, italic: true }))
    } else if (m[3] !== undefined) {
      runs.push(run(m[3], { ...base, font: T.fMono }))
    }
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    runs.push(run(text.slice(lastIndex), base))
  }
  return runs.length > 0 ? runs : [run(text, base)]
}

function bodyPara(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 100 },
    alignment: AlignmentType.JUSTIFIED,
    children: inlineRuns(text, { font: T.fZh, size: T.body })
  })
}

function bulletPara(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 20, after: 20 },
    children: inlineRuns(text, { font: T.fZh, size: T.body })
  })
}

function calloutPara(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: convertInchesToTwip(0.2) },
    border: {
      left: { style: BorderStyle.THICK, size: 12, color: T.primary },
    },
    shading: { type: ShadingType.SOLID, color: T.primarySoft, fill: T.primarySoft },
    children: [run(text, { font: T.fZh, size: T.body, bold: true, color: T.primaryDeep })]
  })
}

function quotePara(text: string, source?: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 120, after: 40 },
      alignment: AlignmentType.LEFT,
      border: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: T.ink },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: T.ink },
      },
      children: [run(text, { font: 'Noto Serif SC', size: T.body + 2, italic: true, color: T.ink2 })]
    }),
    ...(source ? [new Paragraph({
      spacing: { before: 20, after: 120 },
      children: [run('— ' + source, { font: T.fMono, size: T.meta, color: T.ink3, allCaps: true })]
    })] : [])
  ]
}

function kpiTable(kpis: Array<{ label: string; value: string; delta?: string }>): Table {
  const cells = kpis.slice(0, 4).map(k =>
    new TableCell({
      width: { size: 100 / kpis.length, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: T.bg2, fill: T.bg2 },
      margins: { top: 120, bottom: 120, left: 140, right: 140 },
      children: [
        new Paragraph({ spacing: { after: 20 }, children: [run(k.label.toUpperCase(), { font: T.fMono, size: T.meta, color: T.ink3, allCaps: true })] }),
        new Paragraph({ spacing: { after: 20 }, children: [run(k.value, { font: T.fDisplay, size: T.h2, bold: true, color: T.ink })] }),
        ...(k.delta ? [new Paragraph({ children: [run(k.delta, { font: T.fMono, size: T.meta, bold: true, color: T.primaryDeep })] })] : [])
      ]
    })
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: cells })]
  })
}

function dataTable(headers: string[], rows: string[][], footer?: string[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: T.ink, fill: T.ink },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ children: [run(h, { bold: true, color: T.white, font: T.fMono, size: T.meta, allCaps: true })] })]
      })
    )
  })

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: ri % 2 === 1
            ? { type: ShadingType.SOLID, color: T.bg2, fill: T.bg2 }
            : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [run(cell, { font: T.fZh, size: T.body - 1 })] })]
        })
      )
    })
  )

  const allRows = [headerRow, ...dataRows]

  if (footer) {
    allRows.push(new TableRow({
      children: footer.map(cell =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: T.bg3, fill: T.bg3 },
          borders: { top: { style: BorderStyle.MEDIUM, size: 4, color: T.ink } },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({ children: [run(cell, { bold: true, font: T.fZh, size: T.body - 1 })] })]
        })
      )
    }))
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: allRows
  })
}

// ── Markdown-lite parser → docx paragraphs ───────────────────────────────────
function parseMdToParagraphs(md: string): (Paragraph | Table)[] {
  const lines = md.split('\n')
  const result: (Paragraph | Table)[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('### '))  { result.push(heading3(trimmed.slice(4))); continue }
    if (trimmed.startsWith('## '))   { result.push(heading2(trimmed.slice(3))); continue }
    // Bullet: starts with "- ", "* ", "• " (but not **bold**)
    if (/^[-•]\s+/.test(trimmed) || /^\*\s+/.test(trimmed)) {
      result.push(bulletPara(trimmed.replace(/^[-•*]\s+/, '')))
      continue
    }
    // Body paragraph: inline runs handle **bold**, *italic*, `code`
    result.push(bodyPara(trimmed))
  }
  return result
}

// ── Tool registration ─────────────────────────────────────────────────────────

export interface DocxSection {
  heading_en:  string
  heading_zh:  string
  tag?:        string
  content:     string
  kpis?:       Array<{ label: string; value: string; delta?: string }>
  table?:      { headers: string[]; rows: string[][]; footer?: string[] }
  callout?:    string
  quote?:      { text: string; source?: string }
}

export interface DocxInput {
  doc_type?: string
  title_en:  string
  title_zh:  string
  lede?:     string
  filename:  string
  meta?:     Record<string, string>
  sections:  DocxSection[]
}

toolRegistry.register({
  name:       'generate_docx',
  emoji:      '📝',
  idempotent: false,
  schema: {
    name:        'generate_docx',
    description: '生成真实的 Microsoft Word 文档（.docx），带有 DeepSeek 品牌设计规范，包含封面标题、多章节内容、KPI 指标卡、数据表、高亮框等。保存到桌面，可用 Word / Pages / WPS 直接打开编辑。',
    parameters: {
      type:       'object',
      properties: {
        doc_type:  { type: 'string', description: '文档类型', enum: ['report', 'proposal', 'analysis', 'brief', 'plan'] },
        title_en:  { type: 'string', description: '英文主标题（2-4个词）' },
        title_zh:  { type: 'string', description: '中文标题' },
        lede:      { type: 'string', description: '封面摘要一句话（50字以内）' },
        filename:  { type: 'string', description: '文件名（不含扩展名）' },
        meta:      { type: 'object', description: '封面元数据，如 {"日期": "2026-06", "作者": "张三"}' },
        sections: {
          type:        'array',
          description: '文档章节列表',
          items: {
            type: 'object',
            properties: {
              heading_en: { type: 'string', description: '章节英文标题' },
              heading_zh: { type: 'string', description: '章节中文标题' },
              tag:        { type: 'string', description: '章节标签，如 Overview / Analysis / Strategy' },
              content:    { type: 'string', description: '章节正文，支持 Markdown（**加粗** / - 列表 / ## 小标题），不超过 500 字' },
              kpis: {
                type:  'array',
                description: 'KPI 指标（最多4个）',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' }, value: { type: 'string' }, delta: { type: 'string' }
                  },
                  required: ['label', 'value']
                }
              },
              table: {
                type: 'object',
                properties: {
                  headers: { type: 'array', items: { type: 'string' } },
                  rows:    { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  footer:  { type: 'array', items: { type: 'string' } }
                },
                required: ['headers', 'rows']
              },
              callout: { type: 'string', description: '关键洞察框（蓝色左边线高亮）' },
              quote:   {
                type: 'object',
                properties: { text: { type: 'string' }, source: { type: 'string' } },
                required: ['text']
              }
            },
            required: ['heading_en', 'heading_zh', 'content']
          }
        }
      },
      required: ['title_en', 'title_zh', 'filename', 'sections']
    }
  },
  handler: async (args) => {
    const d = args as DocxInput
    if (!d.sections?.length) return '❌ 至少需要一个章节（sections 不能为空）'

    const docTypeLabel = ({
      report: '分析报告 · Report', proposal: '商业提案 · Proposal',
      analysis: '数据分析 · Analysis', brief: '执行简报 · Brief', plan: '项目计划 · Plan'
    })[d.doc_type ?? 'report'] ?? 'Report'

    const issued = new Date().toLocaleDateString('zh-CN')
    const metaEntries = Object.entries(d.meta ?? { 日期: issued })

    // ── Cover ────────────────────────────────────────────────────────────────
    const coverChildren: Paragraph[] = [
      new Paragraph({ spacing: { before: 0, after: 600 }, children: [
        run('DeepSeek Notes', { font: T.fDisplay, size: 28, bold: true, color: T.primary }),
        run('  ·  ', { size: 24, color: T.ink3 }),
        run(docTypeLabel.toUpperCase(), { font: T.fMono, size: T.meta, color: T.ink3, allCaps: true })
      ]}),
      new Paragraph({ spacing: { before: 0, after: 160 }, children: [
        run(d.title_en, { font: T.fDisplay, size: T.h1, bold: true, color: T.ink })
      ]}),
      new Paragraph({ spacing: { before: 0, after: 200 }, children: [
        run(d.title_zh, { font: T.fZh, size: T.h2 - 8, bold: true, color: T.ink })
      ]}),
      ...(d.lede ? [new Paragraph({ spacing: { before: 0, after: 400 }, children: [
        run(d.lede, { font: T.fZh, size: T.h4, color: T.ink2 })
      ]})] : []),
      // Meta row
      new Paragraph({ spacing: { before: 200, after: 80 }, border: { top: { style: BorderStyle.MEDIUM, size: 8, color: T.ink }}, children: [] }),
      ...metaEntries.map(([k, v]) =>
        new Paragraph({ spacing: { before: 60, after: 0 }, children: [
          run(k.toUpperCase(), { font: T.fMono, size: T.meta, color: T.ink3, allCaps: true }),
          run('  ', {}),
          run(v, { font: T.fDisplay, size: T.body + 2, bold: true, color: T.ink })
        ]})
      ),
      new Paragraph({ spacing: { before: 80, after: 0 }, border: { bottom: { style: BorderStyle.MEDIUM, size: 8, color: T.primary }}, children: [] }),
      new Paragraph({ pageBreakBefore: true, children: [] }),
    ]

    // ── Section pages ────────────────────────────────────────────────────────
    const sectionChildren: (Paragraph | Table)[] = []

    for (let i = 0; i < d.sections.length; i++) {
      const s = d.sections[i]
      if (i > 0) sectionChildren.push(new Paragraph({ pageBreakBefore: true, children: [] }))

      sectionChildren.push(eyebrow(`${String(i + 1).padStart(2, '0')}  ·  ${s.tag ?? 'Section'}`))
      sectionChildren.push(...heading1(s.heading_en, s.heading_zh))

      if (s.kpis?.length) sectionChildren.push(kpiTable(s.kpis))
      sectionChildren.push(...parseMdToParagraphs(s.content))
      if (s.table)   sectionChildren.push(dataTable(s.table.headers, s.table.rows, s.table.footer))
      if (s.callout) sectionChildren.push(calloutPara(s.callout))
      if (s.quote)   sectionChildren.push(...quotePara(s.quote.text, s.quote.source))
    }

    // ── Build document ────────────────────────────────────────────────────────
    const doc = new Document({
      creator:  'DeepSeek Notes',
      title:    d.title_zh,
      subject:  d.title_en,
      keywords: 'DeepSeek Notes',
      styles: {
        default: {
          document: {
            run: { font: { name: T.fZh }, size: T.body, color: T.ink }
          }
        },
        paragraphStyles: [
          {
            id: 'Heading1', name: 'Heading 1', basedOn: 'Normal',
            run: { font: { name: T.fDisplay }, bold: true, size: T.h2, color: T.ink }
          },
          {
            id: 'Heading2', name: 'Heading 2', basedOn: 'Normal',
            run: { font: { name: T.fDisplay }, bold: true, size: T.h3, color: T.ink }
          },
          {
            id: 'Heading3', name: 'Heading 3', basedOn: 'Normal',
            run: { font: { name: T.fDisplay }, bold: true, size: T.h4, color: T.ink, allCaps: true }
          }
        ]
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top:    convertMillimetersToTwip(25),
                bottom: convertMillimetersToTwip(22),
                left:   convertMillimetersToTwip(22),
                right:  convertMillimetersToTwip(22),
              }
            }
          },
          headers: {
            default: new Header({
              children: [new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: T.ink } },
                spacing: { after: 0 },
                children: [
                  run('DeepSeek Notes', { font: T.fDisplay, size: T.meta, bold: true, color: T.ink }),
                  run('  ·  ', { size: T.meta, color: T.ink3 }),
                  run(d.title_zh, { font: T.fZh, size: T.meta, color: T.ink3 })
                ]
              })]
            })
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: T.ink } },
                spacing: { before: 0 },
                children: [
                  run(d.title_en.toUpperCase(), { font: T.fMono, size: T.meta, color: T.ink3, allCaps: true }),
                  run('  ', {}),
                  new TextRun({ children: [new PageNumberElement()], size: T.meta, font: { name: T.fMono } })
                ]
              })]
            })
          },
          children: [...coverChildren, ...sectionChildren]
        }
      ]
    })

    // ── Save ─────────────────────────────────────────────────────────────────
    const dir      = app.getPath('desktop')
    const safeName = (d.filename || d.title_zh || 'document')
      .replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 80)
    let outPath = path.join(dir, `${safeName}.docx`)
    let n = 1
    while (fs.existsSync(outPath)) outPath = path.join(dir, `${safeName}_${n++}.docx`)

    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(outPath, buffer)
    shell.showItemInFolder(outPath)

    return `✅ Word 文档已保存到桌面\n📝 文件：${path.basename(outPath)}\n📑 章节数：${d.sections.length} 章\n💡 可用 Word / Pages / WPS 直接打开编辑`
  }
})
