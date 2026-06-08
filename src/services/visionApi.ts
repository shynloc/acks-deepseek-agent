export interface VisionConfig {
  apiKey: string
  baseUrl: string
  model: string
}

/**
 * Send an image (base64 data URL or public HTTPS URL) to a MiMo-compatible
 * vision API and return the model's description.
 */
export async function describeImage(
  imageDataUrl: string,
  userPrompt: string,
  config: VisionConfig
): Promise<string> {
  const { apiKey, baseUrl, model } = config

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageDataUrl }
            },
            {
              type: 'text',
              text: userPrompt
            }
          ]
        }
      ],
      max_tokens: 1024,
      stream: false
    }),
    signal: AbortSignal.timeout(30000)
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`视觉 API 错误 ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('视觉 API 返回了空内容')
  return text.trim()
}
