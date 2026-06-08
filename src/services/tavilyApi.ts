export interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

export interface TavilyResponse {
  results: TavilyResult[]
  answer?: string
}

// Calls via main-process IPC to avoid renderer CORS/CSP restrictions
export async function tavilySearch(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<TavilyResponse> {
  const result = await window.api.tavilySearch({ query, apiKey, maxResults })
  if (!result.ok) {
    const detail = result.status ? `HTTP ${result.status}` : (result.error ?? '网络错误')
    throw new Error(detail)
  }
  return result.data as TavilyResponse
}

export function formatSearchResults(resp: TavilyResponse): string {
  const lines: string[] = ['【联网搜索结果】']
  if (resp.answer) lines.push(`摘要：${resp.answer}\n`)
  resp.results.slice(0, 5).forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.title}`)
    lines.push(`来源：${r.url}`)
    lines.push(r.content.slice(0, 400))
    lines.push('')
  })
  lines.push('---\n')
  return lines.join('\n')
}
