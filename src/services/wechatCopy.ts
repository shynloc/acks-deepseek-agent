// Copies rendered Markdown as WeChat-compatible rich text.
// WeChat's editor strips <style> tags and class attributes — we inline
// computed styles before writing HTML to the clipboard via Electron's
// native clipboard API (navigator.clipboard.write doesn't support text/html in Electron).

const INLINE_PROPS = [
  'color', 'background-color',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-indent',
  'text-decoration', 'text-decoration-color', 'text-decoration-style',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border-left', 'border-top', 'border-bottom', 'border-right', 'border-radius',
  'display', 'float', 'word-break', 'white-space', 'max-width', 'width',
] as const

const SKIP_VALUES = new Set(['none', 'normal', 'auto', '0px', 'rgba(0, 0, 0, 0)', 'initial', 'inherit'])

function inlineStyles(el: Element): void {
  const computed = window.getComputedStyle(el)
  const style = (el as HTMLElement).style
  for (const prop of INLINE_PROPS) {
    const val = computed.getPropertyValue(prop).trim()
    if (val && !SKIP_VALUES.has(val)) {
      style.setProperty(prop, val)
    }
  }
  el.removeAttribute('class')
  el.removeAttribute('id')
  for (const child of Array.from(el.children)) {
    inlineStyles(child)
  }
}

export async function copyToWeChat(
  renderedHtml: string,
  theme: string
): Promise<void> {
  const wrap = document.createElement('div')
  wrap.className = `md-preview theme-${theme}`
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;width:680px;visibility:hidden;'
  wrap.innerHTML = renderedHtml
  document.body.appendChild(wrap)

  // Two rAFs: first applies layout, second lets computed styles settle
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

  const plainText = wrap.innerText ?? wrap.textContent ?? ''
  inlineStyles(wrap)
  const html = `<meta charset="utf-8">${wrap.innerHTML}`

  document.body.removeChild(wrap)

  // Use Electron's native clipboard (navigator.clipboard.write doesn't support text/html in Electron)
  await (window as any).api.clipboard.writeHtml(html, plainText)
}
