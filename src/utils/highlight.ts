export function highlightText(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text)
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escapeHtml(text).replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5 not-italic">$1</mark>'
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
