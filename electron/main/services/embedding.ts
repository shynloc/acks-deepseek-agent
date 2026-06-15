import { net } from 'electron'
import Store from 'electron-store'

const store = new Store()

const PROVIDER_PRESETS: Record<string, { url: string; model: string }> = {
  siliconflow: { url: 'https://api.siliconflow.cn/v1', model: 'BAAI/bge-m3' },
  jina:        { url: 'https://api.jina.ai/v1',        model: 'jina-embeddings-v3' },
  voyage:      { url: 'https://api.voyageai.com/v1',   model: 'voyage-3-lite' },
  ollama:      { url: 'http://localhost:11434/v1',      model: 'nomic-embed-text' },
}

function getConfig() {
  const provider = (store.get('embeddingProvider') as string | undefined)?.trim() || 'siliconflow'
  const preset   = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.siliconflow
  const model    = (store.get('embeddingModel') as string | undefined)?.trim() || preset.model
  const rawKey   = (store.get('embeddingApiKey') as string | undefined)?.trim()
  // Ollama doesn't need a key; others fall back to main API key if embedding key not set
  const apiKey   = provider === 'ollama'
    ? (rawKey || 'ollama')
    : (rawKey || (store.get('apiKey') as string | undefined)?.trim() || '')
  const base     = preset.url.replace(/\/v1\/?$/, '').replace(/\/$/, '') + '/v1'
  return { apiKey, model, base, provider }
}

export function isEmbeddingEnabled(): boolean {
  const enabled = store.get('embeddingPluginEnabled') as boolean | undefined
  if (enabled === false) return false
  const { provider, apiKey } = getConfig()
  return provider === 'ollama' || !!apiKey
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!isEmbeddingEnabled()) return null
  const { apiKey, model, base } = getConfig()
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

export async function testEmbedding(): Promise<{ ok: boolean; error?: string }> {
  const { apiKey, model, base, provider } = getConfig()
  if (provider !== 'ollama' && !apiKey) {
    return { ok: false, error: '请先填写 API Key' }
  }
  try {
    const resp = await net.fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: 'test' })
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { ok: false, error: `HTTP ${resp.status}${txt ? '：' + txt.slice(0, 80) : ''}` }
    }
    const data = await resp.json() as any
    if (!data.data?.[0]?.embedding) return { ok: false, error: '响应格式异常，请检查模型名称' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message ?? '网络错误' }
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
  const provider = (store.get('embeddingProvider') as string | undefined)?.trim() || 'siliconflow'
  const preset   = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.siliconflow
  return (store.get('embeddingModel') as string | undefined)?.trim() || preset.model
}
