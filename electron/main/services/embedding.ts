import { net } from 'electron'
import Store from 'electron-store'

const store = new Store()

function getConfig() {
  const apiUrl = (store.get('baseUrl') as string | undefined)?.trim() ?? 'https://api.deepseek.com'
  const apiKey = (store.get('apiKey') as string | undefined)?.trim() ?? ''
  const model  = (store.get('embeddingModel') as string | undefined)?.trim() ?? 'text-embedding-3-small'
  // Normalise base: strip trailing /v1 then re-append it
  const base   = apiUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '') + '/v1'
  return { apiKey, model, base }
}

export async function embedText(text: string): Promise<number[] | null> {
  const { apiKey, model, base } = getConfig()
  if (!apiKey) return null
  try {
    const resp = await net.fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text.slice(0, 8000) })
    })
    if (!resp.ok) return null
    const data = await resp.json() as any
    return data.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    magA  += a[i] * a[i]
    magB  += b[i] * b[i]
  }
  if (!magA || !magB) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export function getEmbeddingModel(): string {
  return (store.get('embeddingModel') as string | undefined)?.trim() ?? 'text-embedding-3-small'
}
