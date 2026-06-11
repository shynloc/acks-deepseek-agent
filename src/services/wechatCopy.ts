// Copies rendered Markdown as WeChat-compatible rich text.
// WeChat's editor strips <style> tags and class attributes, so we inline
// a curated set of computed style properties before writing to the clipboard.

const INLINE_PROPS = [
  'color', 'background-color',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-indent', 'text-decoration',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border-left', 'border-top', 'border-bottom', 'border-right',
  'border-radius', 'border', 'display', 'float', 'word-break',
  'white-space', 'overflow-x', 'max-width', 'width',
] as const

function inlineStyles(el: Element): void {
  const computed = window.getComputedStyle(el)
  const style = (el as HTMLElement).style
  for (const prop of INLINE_PROPS) {
    const val = computed.getPropertyValue(prop)
    if (val && val !== 'none' && val !== 'normal' && val !== 'auto') {
      style.setProperty(prop, val)
    }
  }
  // Remove class after inlining — WeChat ignores classes anyway
  el.removeAttribute('class')
  for (const child of Array.from(el.children)) {
    inlineStyles(child)
  }
}

export async function copyToWeChat(
  renderedHtml: string,
  theme: string
): Promise<void> {
  // Build a temporary off-screen container with the theme applied
  const wrap = document.createElement('div')
  wrap.className = `md-preview theme-${theme}`
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;width:680px;'
  wrap.innerHTML = renderedHtml
  document.body.appendChild(wrap)

  // Wait one animation frame so the browser computes styles
  await new Promise<void>(r => requestAnimationFrame(() => r()))

  // Inline styles on every element
  inlineStyles(wrap)

  const html = wrap.innerHTML
  document.body.removeChild(wrap)

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([wrap.textContent ?? ''], { type: 'text/plain' }),
    }),
  ])
}
