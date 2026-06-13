// Copies rendered Markdown as WeChat-compatible rich text.
// juice inlines ALL CSS (including ::before/::after pseudo-elements) into inline styles,
// since WeChat's editor strips <style> tags and class attributes on paste.
// Electron's native clipboard API is used — navigator.clipboard.write doesn't support
// text/html in Electron's renderer process.

import juice from 'juice'
import rawCss from '@/assets/markdown-themes/index.css?inline'

// Remove the CSS gradient-text technique — WeChat renders -webkit-background-clip:text
// as invisible (transparent). Strip gradient+clip so the element inherits body text color.
function fixGradientText(html: string): string {
  return html.replace(/style="([^"]*?)"/g, (match, styleAttr: string) => {
    const hasClip =
      /-webkit-background-clip\s*:\s*text/i.test(styleAttr) ||
      /\bbackground-clip\s*:\s*text/i.test(styleAttr)
    if (!hasClip) return match

    let s = styleAttr
    s = s.replace(/-webkit-background-clip\s*:\s*text\s*;?\s*/gi, '')
    s = s.replace(/\bbackground-clip\s*:\s*text\s*;?\s*/gi, '')
    s = s.replace(/-webkit-text-fill-color\s*:\s*transparent\s*;?\s*/gi, '')
    s = s.replace(/\bcolor\s*:\s*transparent\s*;?\s*/gi, '')
    // Remove the gradient background (was only useful for text clipping, now orphaned)
    s = s.replace(
      /\bbackground\s*:\s*(?:linear|radial)-gradient\([^;)]*(?:\([^)]*\)[^;)]*)*\)\s*;?\s*/gi,
      ''
    )
    return `style="${s}"`
  })
}

// Protect code-block indentation — WeChat's editor strips leading spaces on paste.
// Non-breaking spaces (U+00A0) survive where regular spaces don't.
function protectCodeIndent(html: string): string {
  const NBSP = ' '
  return html.replace(
    /(<pre\b[^>]*>)([\s\S]*?)(<\/pre>)/gi,
    (_: string, preOpen: string, preContent: string, preClose: string) => {
      const fixed = preContent.replace(
        /(<code\b[^>]*>)([\s\S]*?)(<\/code>)/gi,
        (__: string, codeOpen: string, code: string, codeClose: string) => {
          const indented = code
            .replace(/^( +)/gm, (spaces: string) => NBSP.repeat(spaces.length))
            .replace(/\t/g, NBSP + NBSP)
          return codeOpen + indented + codeClose
        }
      )
      return preOpen + fixed + preClose
    }
  )
}

export async function copyToWeChat(renderedHtml: string, theme: string): Promise<void> {
  const wrapper = `<div class="md-preview theme-${theme}">${renderedHtml}</div>`

  // juice inlines all CSS selectors as inline styles, and converts ::before/::after
  // pseudo-elements into real <span> elements so WeChat sees them
  let inlined = juice.inlineContent(wrapper, rawCss, {
    inlinePseudoElements: true,
    preserveImportant: true,
    applyWidthAttributes: false,
    applyTableAttributes: false,
  })

  inlined = fixGradientText(inlined)
  inlined = protectCodeIndent(inlined)

  // Extract plain-text fallback for clipboard
  const tmp = document.createElement('div')
  tmp.innerHTML = inlined
  const plainText = tmp.innerText ?? tmp.textContent ?? ''

  await (window as any).api.clipboard.writeHtml(
    `<meta charset="utf-8">${inlined}`,
    plainText
  )
}
