export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentPart[]
}

export interface StreamOptions {
  apiKey: string
  baseUrl: string
  model: string
  messages: ChatMessage[]
  onChunk: (text: string) => void
  onDone: (usage: { prompt_tokens: number; completion_tokens: number }) => void
  onError: (err: Error) => void
  signal?: AbortSignal
}

export async function streamChat(opts: StreamOptions): Promise<void> {
  const { apiKey, baseUrl, model, messages, onChunk, onDone, onError, signal } = opts

  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal
    })
  } catch (e: unknown) {
    if ((e as Error).name === 'AbortError') return
    onError(e as Error)
    return
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    onError(new Error(`API 错误 ${response.status}: ${text}`))
    return
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let usage = { prompt_tokens: 0, completion_tokens: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') { onDone(usage); return }
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) onChunk(delta)
        if (json.usage) usage = json.usage
      } catch { /* partial JSON, skip */ }
    }
  }
  onDone(usage)
}

export async function testConnection(apiKey: string, baseUrl: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        stream: false
      }),
      signal: AbortSignal.timeout(8000)
    })
    return res.ok
  } catch { return false }
}
