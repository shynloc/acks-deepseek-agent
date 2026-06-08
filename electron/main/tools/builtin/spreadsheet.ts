/**
 * Excel spreadsheet generation tool
 * Design system adapted from ACKS Studio Excel Design System v1.0
 * Uses the xlsx package (already a project dependency)
 */
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import * as XLSX from 'xlsx'
import { toolRegistry } from '../registry'

// ── Design system colors (used for sheet comments, not cell bg — xlsx has limited color support) ──
const DS_PRIMARY = 'FF4D6BFE'  // DeepSeek blue in ARGB
const DS_INK     = 'FF1A1A1A'
const DS_BG2     = 'FFF5F5F7'
const DS_BG3     = 'FFEEEEEF'

interface SheetDef {
  name:         string
  title?:       string
  subtitle?:    string
  headers:      string[]
  rows:         string[][]
  footer?:      string[]   // summary/total row
  number_cols?: number[]   // 0-based column indices to right-align
}

interface SpreadsheetInput {
  filename: string
  sheets:   SheetDef[]
}

function buildSheet(ws: XLSX.WorkSheet, def: SheetDef): void {
  const AOA: unknown[][] = []

  // Title row (if provided)
  if (def.title) {
    AOA.push([def.title])
    if (def.subtitle) AOA.push([def.subtitle])
    AOA.push([])  // blank spacer
  }

  // Header row
  AOA.push(def.headers)

  // Data rows
  for (const row of def.rows) {
    AOA.push(row.map(cell => {
      // Try to parse as number for numeric cells
      const n = Number(cell.replace(/[%,¥$]/g, ''))
      return isNaN(n) || !cell.trim() ? cell : n
    }))
  }

  // Footer / summary row
  if (def.footer) AOA.push(def.footer)

  const newWs = XLSX.utils.aoa_to_sheet(AOA)

  // Apply column widths based on content
  const cols: XLSX.ColInfo[] = def.headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...def.rows.map(r => (r[i] ?? '').length),
      def.footer ? (def.footer[i] ?? '').length : 0
    )
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })
  newWs['!cols'] = cols

  // Style the header row and title rows using cell metadata
  const startRow = (def.title ? (def.subtitle ? 3 : 2) : 0)
  const headerRef = XLSX.utils.encode_row(startRow)

  // Apply bold + background to header cells
  for (let c = 0; c < def.headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: startRow, c })
    if (newWs[cellRef]) {
      newWs[cellRef].s = {
        font:    { bold: true, color: { rgb: 'FFFFFFFF' } },
        fill:    { fgColor: { rgb: DS_INK } },
        alignment: { horizontal: 'left' }
      }
    }
  }

  // Style title cell if present
  if (def.title && newWs['A1']) {
    newWs['A1'].s = {
      font:  { bold: true, sz: 16, color: { rgb: DS_PRIMARY } },
      fill:  { fgColor: { rgb: 'FFFFFFFF' } }
    }
  }

  // Style footer row
  if (def.footer) {
    const footRow = startRow + 1 + def.rows.length
    for (let c = 0; c < def.footer.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: footRow, c })
      if (newWs[cellRef]) {
        newWs[cellRef].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: DS_BG3 } },
          border: { top: { style: 'medium', color: { rgb: DS_INK } } }
        }
      }
    }
  }

  // Merge title cell across all columns
  if (def.title && def.headers.length > 1) {
    newWs['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: def.headers.length - 1 } },
      ...(def.subtitle
        ? [{ s: { r: 1, c: 0 }, e: { r: 1, c: def.headers.length - 1 } }]
        : [])
    ]
  }

  // Copy cells from temp sheet to ws
  Object.assign(ws, newWs)
  ws['!ref']    = newWs['!ref']
  ws['!cols']   = newWs['!cols']
  ws['!merges'] = newWs['!merges']
}

toolRegistry.register({
  name:       'generate_spreadsheet',
  emoji:      '📊',
  idempotent: false,
  schema: {
    name:        'generate_spreadsheet',
    description: '生成带格式的 Excel 工作簿（.xlsx），支持多 Sheet、标题行、数据表格、汇总行。保存到桌面。',
    parameters: {
      type:       'object',
      properties: {
        filename: { type: 'string', description: '文件名（不含扩展名）' },
        sheets: {
          type:        'array',
          description: 'Sheet 列表，每个元素生成一个工作表',
          items: {
            type: 'object',
            properties: {
              name:        { type: 'string', description: 'Sheet 名称（标签名）' },
              title:       { type: 'string', description: 'Sheet 内大标题（可选）' },
              subtitle:    { type: 'string', description: '副标题/说明（可选）' },
              headers:     { type: 'array',  items: { type: 'string' }, description: '表头列名数组' },
              rows:        { type: 'array',  items: { type: 'array', items: { type: 'string' } }, description: '数据行，每行是字符串数组' },
              footer:      { type: 'array',  items: { type: 'string' }, description: '汇总/合计行（可选）' },
              number_cols: { type: 'array',  items: { type: 'number' }, description: '需要右对齐的列索引（0-based，可选）' }
            },
            required: ['name', 'headers', 'rows']
          }
        }
      },
      required: ['filename', 'sheets']
    }
  },
  handler: async (args) => {
    const { filename, sheets } = args as SpreadsheetInput
    if (!sheets?.length) return '❌ 至少需要一个 Sheet'

    const wb = XLSX.utils.book_new()

    for (const def of sheets) {
      const ws: XLSX.WorkSheet = {}
      buildSheet(ws, def)
      XLSX.utils.book_append_sheet(wb, ws, (def.name || 'Sheet').slice(0, 31))
    }

    const dir      = app.getPath('desktop')
    const safeName = (filename || 'workbook').replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 80)
    let outPath    = path.join(dir, `${safeName}.xlsx`)
    let n = 1
    while (fs.existsSync(outPath)) outPath = path.join(dir, `${safeName}_${n++}.xlsx`)

    XLSX.writeFile(wb, outPath)
    shell.showItemInFolder(outPath)

    const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0)
    return `✅ Excel 工作簿已保存到桌面\n📊 文件：${path.basename(outPath)}\n📋 Sheet 数：${sheets.length}，共 ${totalRows} 行数据\n💡 用 Excel / Numbers / WPS 打开即可查看和编辑`
  }
})
