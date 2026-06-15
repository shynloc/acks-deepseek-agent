// Copies rendered Markdown as WeChat-compatible rich text.
//
// Strategy (ported from wechat-cyber-editor-pro):
// 1. Render the content off-screen in the live DOM so the browser applies all CSS
//    (including dark-mode descendant selectors like `.dark .md-preview.theme-x`)
// 2. Use window.getComputedStyle() to read the ACTUAL rendered values — this is
//    the only reliable way to capture dark-mode background colors, because CSS string
//    parsers (juice) can fail to cascade descendant selectors correctly.
// 3. Clone the DOM, inline computed styles on every element.
// 4. Wrap in a sacrificial outer <section> (no background) so WeChat's paste handler
//    strips the root but preserves the inner paper <section>'s background-color.
// 5. As a second pass, run juice on the original HTML (pseudo-element expansion only)
//    to restore ::before / ::after decorative elements (code-block dots, h2 bars, etc.)
//    that getComputedStyle cannot capture because pseudo-elements aren't real DOM nodes.

import juice from 'juice'
import rawCss from '@/assets/markdown-themes/index.css?inline'

// ── Juice-based pseudo-element pass ─────────────────────────────────────────
// Returns an HTML string where ::before/::after are real <span> nodes.
function expandPseudoElements(renderedHtml: string, theme: string, isDark: boolean): string {
  const outerOpen = isDark ? '<div class="dark">' : '<div>'
  const wrapper = `${outerOpen}<div class="md-preview theme-${theme}">${renderedHtml}</div></div>`
  return juice.inlineContent(wrapper, rawCss, {
    inlinePseudoElements: true,
    preserveImportant: true,
    applyWidthAttributes: false,
    applyTableAttributes: false,
  })
}

// ── Code-block indentation guard ─────────────────────────────────────────────
// WeChat strips leading spaces on paste; U+00A0 survives.
function protectCodeIndent(html: string): string {
  const NBSP = ' '
  return html.replace(
    /(<pre\b[^>]*>)([\s\S]*?)(<\/pre>)/gi,
    (_: string, preOpen: string, preContent: string, preClose: string) => {
      const fixed = preContent.replace(
        /(<code\b[^>]*>)([\s\S]*?)(<\/code>)/gi,
        (__: string, codeOpen: string, code: string, codeClose: string) => {
          const indented = code
            .replace(/^( +)/gm, (sp: string) => NBSP.repeat(sp.length))
            .replace(/\t/g, NBSP + NBSP)
          return codeOpen + indented + codeClose
        }
      )
      return preOpen + fixed + preClose
    }
  )
}

// ── Gradient-text fix ─────────────────────────────────────────────────────────
// -webkit-background-clip:text + color:transparent = invisible in WeChat.
function fixGradientText(html: string): string {
  return html.replace(/style="([^"]*?)"/g, (match, s: string) => {
    const hasClip = /-webkit-background-clip\s*:\s*text/i.test(s) || /\bbackground-clip\s*:\s*text/i.test(s)
    if (!hasClip) return match
    let out = s
    out = out.replace(/-webkit-background-clip\s*:\s*text\s*;?\s*/gi, '')
    out = out.replace(/\bbackground-clip\s*:\s*text\s*;?\s*/gi, '')
    out = out.replace(/-webkit-text-fill-color\s*:\s*transparent\s*;?\s*/gi, '')
    out = out.replace(/\bcolor\s*:\s*transparent\s*;?\s*/gi, '')
    out = out.replace(/\bbackground\s*:\s*(?:linear|radial)-gradient\([^;)]*(?:\([^)]*\)[^;)]*)*\)\s*;?\s*/gi, '')
    return `style="${out}"`
  })
}

// ── CSS props to extract via getComputedStyle ─────────────────────────────────
const COMPUTED_PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'backgroundSize',
  'backgroundRepeat', 'backgroundPosition',
  'fontSize', 'fontWeight', 'fontFamily', 'fontStyle',
  'lineHeight', 'letterSpacing', 'textAlign', 'textDecoration',
  'textTransform', 'textShadow',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
  'borderRadius', 'boxShadow', 'display', 'boxSizing',
  'width', 'maxWidth', 'whiteSpace', 'wordBreak', 'overflowWrap',
]

// ── Main export ───────────────────────────────────────────────────────────────
export async function copyToWeChat(renderedHtml: string, theme: string, isDark = false): Promise<void> {
  // ── Step 1: render off-screen with proper CSS class hierarchy ────────────
  const renderRoot = document.createElement('div')
  renderRoot.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0',
    'width:750px', 'pointer-events:none', 'z-index:-9999', 'visibility:hidden',
  ].join(';')
  if (isDark) renderRoot.className = 'dark'

  const renderPreview = document.createElement('div')
  renderPreview.className = `md-preview theme-${theme}`
  renderPreview.innerHTML = renderedHtml
  renderRoot.appendChild(renderPreview)
  document.body.appendChild(renderRoot)

  // Wait two animation frames so the browser fully computes styles
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  // ── Step 2: read the page background from computed styles ─────────────────
  const computedPreview = window.getComputedStyle(renderPreview)
  const pageBg = computedPreview.backgroundColor          // e.g. "rgb(10, 10, 10)"
  const pageColor = computedPreview.color

  // ── Step 3: build the export structure ────────────────────────────────────
  // outerSection = sacrificial root (WeChat strips its styles; fine, it has none)
  // paperSection = inner element that carries the page background (WeChat preserves this)
  const outerSection = document.createElement('section')
  outerSection.style.cssText = 'padding:0;margin:0;width:100%;box-sizing:border-box;overflow:hidden;'

  const paperSection = document.createElement('section')
  // Pull visual props from the preview's computed style
  const paperProps = [
    'backgroundColor', 'backgroundImage', 'backgroundSize',
    'backgroundRepeat', 'backgroundPosition', 'borderRadius',
  ] as const
  paperProps.forEach(p => { (paperSection.style as any)[p] = (computedPreview as any)[p] })
  paperSection.style.color  = pageColor
  paperSection.style.padding = '20px 15px'
  paperSection.style.display = 'block'
  paperSection.style.width   = '100%'
  paperSection.style.boxSizing = 'border-box'

  // ── Step 4: clone content, inline computed styles on every element ────────
  const clone = renderPreview.cloneNode(true) as HTMLElement
  clone.style.padding    = '0'
  clone.style.margin     = '0'
  clone.style.background = 'transparent'
  clone.style.boxShadow  = 'none'
  clone.style.minHeight  = 'auto'

  const allCloned   = Array.from(clone.querySelectorAll('*')) as HTMLElement[]
  const allOriginal = Array.from(renderPreview.querySelectorAll('*')) as HTMLElement[]

  allCloned.forEach((target, i) => {
    const source = allOriginal[i]
    if (!source) return
    const cs = window.getComputedStyle(source)
    COMPUTED_PROPS.forEach(prop => {
      if (prop === 'maxWidth' && cs.display === 'block') {
        target.style.maxWidth = '100%'
      } else if (prop === 'width' && cs.display !== 'inline' && cs.display !== 'inline-block') {
        // Don't hard-code block widths — let them flow
      } else {
        (target.style as any)[prop] = (cs as any)[prop]
      }
    })
    // WeChat doesn't support background-clip:text — strip it
    if (target.style.webkitBackgroundClip === 'text' || (target.style as any).backgroundClip === 'text') {
      target.style.backgroundImage = 'none'
      target.style.webkitBackgroundClip = 'unset' as any
      ;(target.style as any).backgroundClip = 'unset'
      ;(target.style as any).webkitTextFillColor = 'unset'
      target.style.color = cs.color  // restore the computed color (which may be transparent)
      // If color is transparent (gradient-text effect), fallback to a sensible colour
      if (target.style.color === 'rgba(0, 0, 0, 0)' || target.style.color === 'transparent') {
        target.style.color = pageColor
      }
    }
  })

  document.body.removeChild(renderRoot)

  // ── Step 5: restore pseudo-elements via juice ────────────────────────────
  // getComputedStyle cannot capture ::before/::after (pre code-block dots,
  // h2 decorative bars, etc.). Run a juice pass to expand them into real spans,
  // then graft those spans into the corresponding elements in the clone.
  const juiceHtml = expandPseudoElements(renderedHtml, theme, isDark)
  const juiceDoc  = new DOMParser().parseFromString(juiceHtml, 'text/html')

  // juice output is <div class="dark"?><div class="md-preview ...">...</div></div>
  // Navigate to the inner .md-preview div
  let juicePreview = juiceDoc.body.querySelector(`.md-preview.theme-${theme}`) as HTMLElement | null
  if (!juicePreview) juicePreview = juiceDoc.body.firstElementChild as HTMLElement | null

  if (juicePreview) {
    // Copy juice-generated ::before/::after spans onto clone elements
    const juiceEls  = Array.from(juicePreview.querySelectorAll('*')) as HTMLElement[]
    const cloneEls  = allCloned  // same order as original

    juiceEls.forEach((juicEl, i) => {
      const cloneEl = cloneEls[i]
      if (!cloneEl) return
      // A juice pseudo-element span has data-pseudo-element attribute
      // Check if juice injected ::before or ::after children
      const firstChild  = juicEl.firstElementChild as HTMLElement | null
      const lastChild   = juicEl.lastElementChild as HTMLElement | null

      if (firstChild?.dataset?.pseudoElement === '::before') {
        const span = firstChild.cloneNode(true) as HTMLElement
        cloneEl.prepend(span)
      }
      if (lastChild?.dataset?.pseudoElement === '::after') {
        const span = lastChild.cloneNode(true) as HTMLElement
        cloneEl.append(span)
      }
    })
  }

  paperSection.appendChild(clone)
  outerSection.appendChild(paperSection)

  // ── Step 6: final string fixes ────────────────────────────────────────────
  let html = outerSection.outerHTML
  html = fixGradientText(html)
  html = protectCodeIndent(html)

  // ── Step 7: write to clipboard ────────────────────────────────────────────
  const plainText = renderPreview.innerText ?? renderPreview.textContent ?? ''

  await (window as any).api.clipboard.writeHtml(
    `<meta charset="utf-8">${html}`,
    plainText
  )
}
