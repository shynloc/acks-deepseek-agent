/**
 * Document & Spreadsheet generation tools
 * Design system adapted from ACKS Studio Design System v1.0
 * Brand tokens replaced: orange #FF6B1A → DeepSeek Blue #4D6BFE
 */
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { toolRegistry } from '../registry'

// ── DeepSeek brand tokens (ported from design system) ────────────────────────
const DS = {
  primary:     '#4D6BFE',
  primaryDeep: '#3A55D4',
  primarySoft: '#EEF2FF',
  ink:  '#1A1A1A', ink2: '#444444', ink3: '#888888',
  bg1: '#FFFFFF', bg2: '#F5F5F7', bg3: '#EEEEEF', rule: '#D9D9DC',
  fonts: `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600;700&family=Noto+Serif+SC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');`
}

const DOCTYPE_LABELS: Record<string, string> = {
  report:   'REPORT · 分析报告',
  proposal: 'PROPOSAL · 商业提案',
  analysis: 'ANALYSIS · 数据分析',
  brief:    'BRIEF · 执行简报',
  plan:     'PLAN · 项目计划',
}

// ── Minimal Markdown → HTML (runs in main process without DOM) ───────────────
function mdToHtml(md: string): string {
  return md
    .replace(/^#{3}\s+(.+)$/gm,   '<h4 class="label">$1</h4>')
    .replace(/^#{2}\s+(.+)$/gm,   '<h3 class="sub-h">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g,    '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,        '<em>$1</em>')
    .replace(/`(.+?)`/g,          '<code>$1</code>')
    .replace(/^[-*]\s+(.+)$/gm,   '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/^(?!<[hul])(.+)$/gm, line => line.trim() ? `<p>${line}</p>` : '')
}

// ── Shared CSS (inserted into every generated document) ─────────────────────
function baseCSS(): string {
  return `${DS.fonts}
:root{
  --primary:      ${DS.primary};
  --primary-deep: ${DS.primaryDeep};
  --primary-soft: ${DS.primarySoft};
  --bg-1:${DS.bg1}; --bg-2:${DS.bg2}; --bg-3:${DS.bg3};
  --ink:${DS.ink}; --ink-2:${DS.ink2}; --ink-3:${DS.ink3}; --rule:${DS.rule};
  --f-display:"Space Grotesk","Noto Sans SC",system-ui,sans-serif;
  --f-body:   "DM Sans","Noto Sans SC",system-ui,sans-serif;
  --f-zh:     "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;
  --f-mono:   "JetBrains Mono",ui-monospace,Menlo,monospace;
  --f-serif:  "Noto Serif SC","Songti SC",serif;
}
*{box-sizing:border-box;}html,body{margin:0;padding:0;}
body{background:#E8E8EA;font-family:var(--f-body);color:var(--ink);-webkit-font-smoothing:antialiased;}
.sheet{width:210mm;min-height:297mm;background:#fff;margin:12mm auto;
  box-shadow:0 12px 40px -16px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.06);
  position:relative;overflow:hidden;page-break-after:always;break-after:page;font-size:10.5pt;line-height:1.6;}
.sheet:last-child{page-break-after:auto;}
.frame{position:absolute;top:18mm;left:22mm;right:22mm;bottom:16mm;display:flex;flex-direction:column;}
.hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:6pt;
  border-bottom:1px solid var(--ink);margin-bottom:18pt;flex-shrink:0;}
.hdr .brand{font-family:var(--f-display);font-weight:600;font-size:9pt;letter-spacing:.1em;color:var(--ink);}
.hdr .brand .dot{color:var(--primary);margin:0 2pt;}
.hdr .right{font-family:var(--f-mono);font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);}
.ftr{margin-top:auto;padding-top:6pt;border-top:1px solid var(--ink);display:flex;
  justify-content:space-between;align-items:center;font-family:var(--f-mono);font-size:8pt;
  color:var(--ink-3);letter-spacing:.12em;text-transform:uppercase;flex-shrink:0;}
.ftr .pg{display:flex;align-items:center;gap:6pt;}
.ftr .pg .accent{width:6pt;height:6pt;background:var(--primary);display:inline-block;}
.ftr .pg b{font-family:var(--f-display);font-weight:600;color:var(--ink);font-size:11pt;letter-spacing:0;}
.body{flex:1;display:flex;flex-direction:column;}
.eyebrow{font-family:var(--f-mono);font-size:8pt;letter-spacing:.18em;text-transform:uppercase;
  color:var(--primary);margin-bottom:6pt;}
h2.sec-title{font-family:var(--f-display);font-weight:600;font-size:24pt;line-height:1.15;
  letter-spacing:-.01em;margin-bottom:4pt;}
h2.sec-title .zh{display:block;font-family:var(--f-zh);font-size:14pt;font-weight:500;color:var(--ink-2);margin-top:2pt;}
.sec-rule{border:none;border-top:1px solid var(--rule);margin:12pt 0;}
h3.sub-h{font-family:var(--f-display);font-weight:600;font-size:14pt;letter-spacing:-.005em;
  margin:14pt 0 6pt;padding-bottom:4pt;border-bottom:1px solid var(--ink);}
h4.label{font-family:var(--f-display);font-weight:600;font-size:9pt;letter-spacing:.06em;
  text-transform:uppercase;margin:10pt 0 4pt;}
p{font-family:var(--f-zh);font-size:10pt;line-height:1.75;margin:0 0 8pt;text-align:justify;}
p.lede{font-size:12pt;font-weight:500;margin-bottom:14pt;line-height:1.7;}
ul{margin:0 0 8pt;padding-left:16pt;}
li{font-family:var(--f-zh);font-size:10pt;line-height:1.75;margin-bottom:3pt;}
code{font-family:var(--f-mono);font-size:.85em;background:var(--bg-2);padding:1pt 4pt;border-radius:3pt;}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(90pt,1fr));gap:10pt;margin:10pt 0 14pt;}
.kpi{background:var(--bg-2);padding:10pt 12pt 8pt;}
.kpi .lbl{font-family:var(--f-mono);font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);}
.kpi .val{font-family:var(--f-display);font-weight:600;font-size:22pt;line-height:1.1;
  letter-spacing:-.02em;color:var(--ink);margin:3pt 0 2pt;}
.kpi .delta{font-family:var(--f-mono);font-size:8pt;color:var(--primary-deep);font-weight:500;}
.data-table{width:100%;border-collapse:collapse;margin:10pt 0 14pt;font-size:9pt;}
.data-table th{font-family:var(--f-mono);font-size:7.5pt;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;padding:6pt 8pt;background:var(--ink);color:#fff;text-align:left;}
.data-table td{font-family:var(--f-zh);padding:5pt 8pt;border-bottom:1px solid var(--rule);}
.data-table tr:nth-child(even) td{background:var(--bg-2);}
.data-table .footer td{font-weight:600;background:var(--bg-3);border-top:1px solid var(--ink);}
.callout{border-left:3px solid var(--primary);background:var(--primary-soft);padding:8pt 12pt;margin:10pt 0;}
.callout p{margin:0;font-weight:500;color:var(--primary-deep);}
blockquote{font-family:var(--f-serif);font-size:11pt;line-height:1.7;color:var(--ink-2);
  border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);padding:10pt 0;margin:12pt 0;}
blockquote .src{font-family:var(--f-mono);font-size:8pt;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-3);margin-top:6pt;}
@media print{body{background:#fff;}.sheet{margin:0;box-shadow:none;border-radius:0;}}
@page{size:A4;margin:0;}`
}

// ── HTML component builders ──────────────────────────────────────────────────

function renderHeader(brandText: string, rightText: string): string {
  return `<div class="hdr"><span class="brand">DeepSeek Notes<span class="dot">·</span>${brandText}</span><span class="right">${rightText}</span></div>`
}

function renderFooter(pageNo: number, total: number, footerLeft: string): string {
  return `<div class="ftr"><span>${footerLeft}</span><span class="pg"><span class="accent"></span><b>${pageNo}</b><span class="of"> / ${total}</span></span></div>`
}

function renderKpis(kpis: Array<{ label: string; value: string; delta?: string }>): string {
  const cards = kpis.map(k =>
    `<div class="kpi"><div class="lbl">${k.label}</div><div class="val">${k.value}</div>${k.delta ? `<div class="delta">${k.delta}</div>` : ''}</div>`
  ).join('')
  return `<div class="kpi-row">${cards}</div>`
}

function renderTable(table: { headers: string[]; rows: string[][]; footer?: string[] }): string {
  const ths = table.headers.map(h => `<th>${h}</th>`).join('')
  const trs = table.rows.map(row =>
    `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`
  ).join('')
  const foot = table.footer
    ? `<tr class="footer">${table.footer.map(c => `<td>${c}</td>`).join('')}</tr>`
    : ''
  return `<table class="data-table"><thead><tr>${ths}</tr></thead><tbody>${trs}${foot}</tbody></table>`
}

// ── Document generation interfaces ─────────────────────────────────────────

interface DocSection {
  heading_en:  string
  heading_zh:  string
  tag?:        string
  content:     string
  kpis?:       Array<{ label: string; value: string; delta?: string }>
  table?:      { headers: string[]; rows: string[][]; footer?: string[] }
  callout?:    string
  quote?:      { text: string; source?: string }
}

interface DocInput {
  doc_type?: string
  title_en:  string
  title_zh:  string
  lede?:     string
  filename:  string
  meta?:     Record<string, string>
  sections:  DocSection[]
}

function buildDocumentHtml(d: DocInput): string {
  const totalSheets = 1 + 1 + d.sections.length  // cover + toc + sections
  const docLabel = DOCTYPE_LABELS[d.doc_type ?? 'report'] ?? 'REPORT · 报告'
  const issued = new Date().toLocaleDateString('zh-CN')
  const footerLeft = d.title_en.toUpperCase()

  // ── Cover sheet ──────────────────────────────────────────────────────────
  const metaEntries = Object.entries(d.meta ?? { Date: issued })
  const metaCols = metaEntries.map(([k, v]) => `<div><div>${k}</div><b>${v}</b></div>`).join('')

  const cover = `
<div class="sheet" style="background:#fff;position:relative;">
  <div class="cover" style="padding:22mm 22mm 0;height:297mm;display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;gap:8pt;font-family:var(--f-display);font-weight:600;font-size:9pt;letter-spacing:.1em;">
      <span style="color:var(--primary-deep);">DeepSeek</span><span style="color:var(--ink-3);margin:0 4pt;">·</span>Notes
    </div>
    <div style="margin-top:36mm;">
      <div style="font-family:var(--f-mono);font-size:9pt;letter-spacing:.2em;text-transform:uppercase;color:var(--primary);margin-bottom:12pt;">${docLabel}</div>
      <h1 style="font-family:var(--f-display);font-weight:600;font-size:64pt;line-height:.95;letter-spacing:-.04em;margin:0;">${d.title_en}</h1>
      <div style="font-family:var(--f-zh);font-weight:600;font-size:22pt;margin-top:14pt;">${d.title_zh}</div>
      ${d.lede ? `<p class="lede" style="max-width:75%;margin-top:14pt;">${d.lede}</p>` : ''}
    </div>
    <div style="margin-top:auto;margin-bottom:24mm;border-top:1px solid var(--ink);padding-top:10pt;display:grid;grid-template-columns:repeat(${Math.min(metaEntries.length, 4)},1fr);gap:12pt;font-family:var(--f-mono);font-size:8pt;text-transform:uppercase;letter-spacing:.12em;color:var(--ink-3);">
      ${metaCols}
    </div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:16mm;background:var(--primary);display:flex;align-items:center;padding:0 22mm;justify-content:space-between;color:#fff;">
    <span style="font-family:var(--f-display);font-weight:600;font-size:11pt;letter-spacing:.04em;">${d.title_zh}</span>
    <span style="font-family:var(--f-mono);font-size:8pt;letter-spacing:.16em;text-transform:uppercase;opacity:.85;">${issued}</span>
  </div>
</div>`

  // ── TOC sheet ────────────────────────────────────────────────────────────
  const tocRows = d.sections.map((s, i) => `
<div style="display:grid;grid-template-columns:50pt 1fr 80pt 40pt;align-items:baseline;padding:14pt 0;border-bottom:1px solid var(--rule);gap:16pt;">
  <div style="font-family:var(--f-display);font-weight:600;font-size:18pt;letter-spacing:-.02em;"><span style="color:var(--primary)">${String(i + 1).padStart(2, '0').slice(0, 1)}</span>${String(i + 1).padStart(2, '0').slice(1)}</div>
  <div>
    <div style="font-family:var(--f-display);font-weight:600;font-size:14pt;letter-spacing:-.005em;">${s.heading_en}</div>
    <div style="font-family:var(--f-zh);font-size:10pt;font-weight:500;color:var(--ink-2);margin-top:1pt;">${s.heading_zh}</div>
  </div>
  <div style="font-family:var(--f-mono);font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);text-align:right;">${s.tag ?? ''}</div>
  <div style="font-family:var(--f-mono);font-size:11pt;color:var(--ink);text-align:right;font-weight:500;">${i + 3}</div>
</div>`).join('')

  const toc = `
<div class="sheet"><div class="frame">
  ${renderHeader(docLabel, issued)}
  <div class="body">
    <div class="eyebrow">Contents · 目录</div>
    <h2 class="sec-title">Table of Contents<span class="zh">文件目录</span></h2>
    <div style="border-top:2px solid var(--ink);margin-top:8pt;">${tocRows}</div>
  </div>
  ${renderFooter(2, totalSheets, footerLeft)}
</div></div>`

  // ── Content sheets ───────────────────────────────────────────────────────
  const contentSheets = d.sections.map((s, i) => {
    const bodyParts: string[] = []
    if (s.kpis?.length)  bodyParts.push(renderKpis(s.kpis))
    if (s.content)       bodyParts.push(mdToHtml(s.content))
    if (s.table)         bodyParts.push(renderTable(s.table))
    if (s.callout)       bodyParts.push(`<div class="callout"><p>${s.callout}</p></div>`)
    if (s.quote)         bodyParts.push(`<blockquote>${s.quote.text}${s.quote.source ? `<div class="src">${s.quote.source}</div>` : ''}</blockquote>`)

    return `
<div class="sheet"><div class="frame">
  ${renderHeader(docLabel, d.title_en.toUpperCase())}
  <div class="body">
    <div class="eyebrow">${String(i + 1).padStart(2, '0')} · ${s.tag ?? 'Section'}</div>
    <h2 class="sec-title">${s.heading_en}<span class="zh">${s.heading_zh}</span></h2>
    <hr class="sec-rule" />
    ${bodyParts.join('\n')}
  </div>
  ${renderFooter(i + 3, totalSheets, footerLeft)}
</div></div>`
  }).join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${d.title_zh} · ${d.title_en}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseCSS()}</style>
</head>
<body>
${cover}
${toc}
${contentSheets}
<div style="text-align:center;padding:6mm 0;font-family:var(--f-mono);font-size:8pt;letter-spacing:.12em;color:#aaa;text-transform:uppercase;">
  Generated by DeepSeek Notes · ${issued}
</div>
</body>
</html>`
}

// ── Tool registration: generate_document ────────────────────────────────────

toolRegistry.register({
  name:       'generate_document',
  emoji:      '📄',
  idempotent: false,
  schema: {
    name:        'generate_document',
    description: '根据 DeepSeek Notes 设计规范生成专业 A4 文档（报告/提案/分析/简报/计划），保存到桌面，打印就绪，可直接导出为 PDF。调用前请先将文档内容结构化为章节。',
    parameters: {
      type:       'object',
      properties: {
        doc_type:  { type: 'string', description: '文档类型', enum: ['report', 'proposal', 'analysis', 'brief', 'plan'] },
        title_en:  { type: 'string', description: '英文主标题（2-4 个词，大写）' },
        title_zh:  { type: 'string', description: '中文副标题' },
        lede:      { type: 'string', description: '封面摘要（一句话说明文档目的，50字以内）' },
        filename:  { type: 'string', description: '保存的文件名（不含扩展名）' },
        meta:      { type: 'object', description: '封面底部元数据，最多4个字段，例如：{"日期": "2026-06", "作者": "张三", "版本": "v1.0"}' },
        sections: {
          type:        'array',
          description: '文档章节列表，每节一页',
          items: {
            type: 'object',
            properties: {
              heading_en: { type: 'string', description: '章节英文标题' },
              heading_zh: { type: 'string', description: '章节中文标题' },
              tag:        { type: 'string', description: '章节类型标签，如 Overview / Analysis / Strategy / Data' },
              content:    { type: 'string', description: '章节正文（支持 Markdown：**加粗** / - 列表 / ## 小标题），不超过 400 字' },
              kpis: {
                type:        'array',
                description: 'KPI 指标卡片（最多 4 个），用于数据/业绩页',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string', description: '主要数值，如 ¥420M' },
                    delta: { type: 'string', description: '变化量，如 ▲ +22% YoY' }
                  },
                  required: ['label', 'value']
                }
              },
              table: {
                type:        'object',
                description: '数据表格（可选）',
                properties: {
                  headers: { type: 'array', items: { type: 'string' } },
                  rows:    { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  footer:  { type: 'array', items: { type: 'string' }, description: '汇总行（可选）' }
                },
                required: ['headers', 'rows']
              },
              callout: { type: 'string', description: '关键洞察/重要提示框（橙/蓝色边框高亮）' },
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
    const d = args as DocInput
    if (!d.sections?.length) return '❌ 至少需要一个章节（sections 不能为空）'

    const html     = buildDocumentHtml(d)
    const dir      = app.getPath('desktop')
    const safeName = (d.filename || d.title_zh || 'document').replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 80)
    let outPath    = path.join(dir, `${safeName}.html`)
    let n = 1
    while (fs.existsSync(outPath)) outPath = path.join(dir, `${safeName}_${n++}.html`)

    fs.writeFileSync(outPath, html, 'utf8')
    shell.showItemInFolder(outPath)

    return `✅ 文档已生成并保存到桌面\n📄 文件：${path.basename(outPath)}\n📑 页数：${1 + 1 + d.sections.length} 页（封面 + 目录 + ${d.sections.length} 章）\n🖨️ 用浏览器打开 → 点「打印」→ 选「存储为 PDF」即可导出精美 PDF`
  }
})
