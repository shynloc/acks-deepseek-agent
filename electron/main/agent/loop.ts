import { net } from 'electron'
import { randomUUID } from 'crypto'
import { toolRegistry, type ToolContext } from '../tools/registry'
import { ToolGuardrails } from './guardrails'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface AgentCallbacks {
  onDelta:      (text: string) => void
  onToolCall:   (name: string, args: Record<string, unknown>, callId: string) => void
  onToolResult: (name: string, result: string, isError: boolean, callId: string) => void
  onDone:       (usage: { promptTokens: number; completionTokens: number }) => void
  onError:      (message: string) => void
  signal?:      AbortSignal
}

const MAX_ITERATIONS = 10

export async function runAgentLoop(
  messages: ChatMessage[],
  ctx: ToolContext,
  callbacks: AgentCallbacks
): Promise<void> {
  const guardrails = new ToolGuardrails()
  const tools      = toolRegistry.getAll({ enabledOnly: true })
  const toolsDef   = toolRegistry.toApiFormat(tools)

  const apiKey    = (ctx.store.get('apiKey')    as string | undefined) ?? ''
  const baseUrl   = ((ctx.store.get('baseUrl') as string | undefined) ?? 'https://api.deepseek.com').replace(/\/$/, '')
  const model     = (ctx.store.get('model')    as string | undefined) ?? 'deepseek-v4-flash'
  const maxTokens      = Number((ctx.store.get('maxTokens')      as number  | undefined) ?? 8192) || 8192
  const temperature    = Number((ctx.store.get('temperature')    as number  | undefined) ?? 1.0)
  const thinkingEnabled = (ctx.store.get('thinkingEnabled') as boolean | undefined) ?? false
  const reasoningEffort = (ctx.store.get('reasoningEffort') as string  | undefined) ?? 'high'

  if (!apiKey) { callbacks.onError('请先在设置中配置 DeepSeek API Key'); return }

  let totalUsage = { promptTokens: 0, completionTokens: 0 }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // ── Stream one LLM turn, fall back to non-streaming if SSE drops ─────────
    const thinkingParams = thinkingEnabled
      ? { thinking: { type: 'enabled' }, reasoning_effort: reasoningEffort }
      : { thinking: { type: 'disabled' } }
    // Thinking mode does not support temperature/presence_penalty/frequency_penalty
    const requestBody = {
      model, messages, tools: toolsDef, tool_choice: 'auto',
      max_tokens: maxTokens,
      ...(thinkingEnabled ? {} : { temperature }),
      ...thinkingParams
    }
    const headers     = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    const signal      = callbacks.signal as RequestInit['signal']

    let textContent    = ''
    let toolCalls: ToolCall[] = []
    let finishReason: string | null = null
    let usage = { promptTokens: 0, completionTokens: 0 }

    // ① Try streaming
    let streamResponse: Response | null = null
    try {
      streamResponse = await net.fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', headers,
        body: JSON.stringify({ ...requestBody, stream: true }),
        signal
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      callbacks.onError(e?.message ?? '网络请求失败')
      return
    }
    if (!streamResponse.ok) {
      const errText = await streamResponse.text().catch(() => streamResponse!.statusText)
      callbacks.onError(`API ${streamResponse.status}: ${errText.slice(0, 200)}`)
      return
    }

    const parsed = await parseStream(streamResponse, callbacks)
    textContent  = parsed.textContent
    toolCalls    = parsed.toolCalls
    finishReason = parsed.finishReason
    usage        = parsed.usage

    console.log(`[agent iter=${iter}] stream done: complete=${parsed.streamComplete} text=${JSON.stringify(textContent.slice(0,80))} toolCalls=${toolCalls.length} finishReason=${finishReason}`)

    // ② Stream dropped before tool_calls arrived → fallback to non-streaming
    if (!parsed.streamComplete && !toolCalls.length) {
      console.log(`[agent iter=${iter}] stream dropped, falling back to non-streaming`)
      // Clear the partial streamed text the user already saw (only if there was partial text)
      if (textContent) callbacks.onDelta('')

      try {
        // tool_choice:'none' forces a text response, preventing the fallback from returning
        // tool_calls (which would loop indefinitely when the stream keeps dropping)
        const fbResp = await net.fetch(`${baseUrl}/chat/completions`, {
          method: 'POST', headers,
          body: JSON.stringify({ ...requestBody, stream: false, tool_choice: 'none' }),
          signal
        })
        console.log(`[agent iter=${iter}] fallback response status=${fbResp.status}`)
        if (fbResp.ok) {
          const fbData = await fbResp.json()
          const choice = fbData.choices?.[0]
          textContent  = choice?.message?.content ?? ''
          finishReason = choice?.finish_reason ?? null
          usage        = {
            promptTokens:     fbData.usage?.prompt_tokens     ?? 0,
            completionTokens: fbData.usage?.completion_tokens ?? 0
          }
          console.log(`[agent iter=${iter}] fallback result: text=${JSON.stringify(textContent.slice(0,120))}`)
          if (textContent) callbacks.onDelta(textContent)
          else {
            // Model returned empty content despite tool_choice:'none' — treat as an error
            callbacks.onDelta('\n\n> ⚠️ AI 返回了空响应，请重试。')
          }
        } else {
          // Non-200 from fallback — surface the error so the user knows something went wrong
          const errText = await fbResp.text().catch(() => fbResp.statusText)
          console.log(`[agent iter=${iter}] fallback error: ${fbResp.status} ${errText.slice(0,200)}`)
          callbacks.onDelta(`\n\n> ⚠️ API 错误 ${fbResp.status}，请稍后重试。`)
        }
      } catch (e: any) {
        if ((e as any)?.name === 'AbortError') return
        console.log(`[agent iter=${iter}] fallback threw: ${(e as any)?.message}`)
        callbacks.onDelta('\n\n> ⚠️ 网络连接不稳定，请重试。')
      }
      // Fallback always ends the loop — no tool execution after non-streaming request
      callbacks.onDone(totalUsage)
      return
    }

    totalUsage.promptTokens     += usage.promptTokens
    totalUsage.completionTokens += usage.completionTokens

    // ── No tool calls → final answer, exit loop ──────────────────────────────
    if (!toolCalls.length) {
      if (finishReason === 'length') {
        callbacks.onDelta('\n\n> ⚠️ 回复已达到最大输出长度（max_tokens=' + maxTokens + '），内容可能不完整。可在设置中调大「最大输出」。')
      }
      callbacks.onDone(totalUsage)
      return
    }

    // Append assistant message with tool_calls
    messages.push({ role: 'assistant', content: textContent || null, tool_calls: toolCalls })

    // ── Execute each tool call ───────────────────────────────────────────────
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* malformed */ }

      const decision = guardrails.beforeCall(tc.function.name, args)

      if (decision.action === 'halt') {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: decision.message ?? 'Halted by guardrails.' })
        callbacks.onToolResult(tc.function.name, decision.message ?? '', true, tc.id)
        // Inject a final hint so DeepSeek wraps up instead of looping
        messages.push({ role: 'user', content: `[系统提示] 工具调用已被安全机制中止（${decision.message}），请直接告知用户遇到的问题，不要继续调用工具。` })
        // Run one final non-tool turn to get a human-readable reply
        await runFinalTurn(messages, apiKey, baseUrl, model, callbacks, totalUsage, maxTokens, temperature)
        return
      }

      const warningNote = decision.action === 'warn' ? `\n[注意] ${decision.message}` : ''

      callbacks.onToolCall(tc.function.name, args, tc.id)

      const tool   = toolRegistry.get(tc.function.name)
      let result   = ''
      let isError  = false

      if (!tool) {
        result  = JSON.stringify({ error: `未知工具: ${tc.function.name}` })
        isError = true
      } else {
        try {
          result = await tool.handler(args, ctx)
          if (tool.maxResultChars && result.length > tool.maxResultChars) {
            result = result.slice(0, tool.maxResultChars) + '\n…[结果已截断]'
          }
          result += warningNote
        } catch (e: any) {
          result  = JSON.stringify({ error: e?.message ?? String(e) })
          isError = true
        }
      }

      guardrails.afterCall(tc.function.name, args, isError)
      callbacks.onToolResult(tc.function.name, result, isError, tc.id)
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
    }
  }

  // Exceeded max iterations
  callbacks.onError(`Agent 超过最大迭代次数 (${MAX_ITERATIONS})，已中止`)
}

// One final streaming turn without tools (used after guardrail halt)
async function runFinalTurn(
  messages: ChatMessage[],
  apiKey: string,
  baseUrl: string,
  model: string,
  callbacks: AgentCallbacks,
  totalUsage: { promptTokens: number; completionTokens: number },
  maxTokens: number,
  temperature: number
): Promise<void> {
  try {
    const res = await net.fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: maxTokens, temperature })
    })
    if (!res.ok) { callbacks.onDone(totalUsage); return }
    const { usage } = await parseStream(res, callbacks)
    totalUsage.promptTokens     += usage.promptTokens
    totalUsage.completionTokens += usage.completionTokens
    callbacks.onDone(totalUsage)
  } catch {
    callbacks.onDone(totalUsage)
  }
}

// ── Stream parser ─────────────────────────────────────────────────────────────
// Buffers tool_call argument fragments across SSE chunks (DeepSeek streams them split)
async function parseStream(
  response: Response,
  callbacks: AgentCallbacks
): Promise<{
  textContent:    string
  toolCalls:      ToolCall[]
  usage:          { promptTokens: number; completionTokens: number }
  finishReason:   string | null
  streamComplete: boolean   // true only if stream ended with [DONE] or a finish_reason
}> {
  const reader  = response.body!.getReader()
  const decoder = new TextDecoder()

  let textContent       = ''
  let reasoningContent  = ''
  let reasoningEmitted  = false
  let finishReason      = null as string | null
  let streamComplete    = false
  const tcBufs = new Map<number, { id: string; name: string; args: string }>()
  let usage     = { promptTokens: 0, completionTokens: 0 }
  let remainder = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const raw   = remainder + decoder.decode(value, { stream: true })
    const lines = raw.split('\n')
    remainder   = lines.pop() ?? ''   // last incomplete line held for next chunk

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') {
        // Flush reasoning block before [DONE]
        if (reasoningContent && !reasoningEmitted) {
          callbacks.onDelta(`<details class="thinking-block">\n<summary>💭 思考过程</summary>\n\n${reasoningContent}\n</details>\n\n`)
          reasoningEmitted = true
        }
        streamComplete = true
        continue
      }

      try {
        const json  = JSON.parse(data)
        const delta = json.choices?.[0]?.delta

        // Accumulate reasoning_content (thinking mode)
        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content
        }

        if (delta?.content) {
          // Flush reasoning block before first content token
          if (reasoningContent && !reasoningEmitted) {
            callbacks.onDelta(`<details class="thinking-block">\n<summary>💭 思考过程</summary>\n\n${reasoningContent}\n</details>\n\n`)
            reasoningEmitted = true
          }
          textContent += delta.content
          callbacks.onDelta(delta.content)
        }

        const fr = json.choices?.[0]?.finish_reason
        if (fr) { finishReason = fr; streamComplete = true }

        // Buffer fragmented tool_call JSON arguments
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!tcBufs.has(idx)) tcBufs.set(idx, { id: '', name: '', args: '' })
            const buf = tcBufs.get(idx)!
            if (tc.id)                   buf.id    = tc.id
            if (tc.function?.name)       buf.name  = tc.function.name
            if (tc.function?.arguments)  buf.args += tc.function.arguments
          }
        }

        if (json.usage) {
          usage = { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0 }
        }
      } catch { /* partial JSON line, skip */ }
    }
  }

  const toolCalls: ToolCall[] = [...tcBufs.values()].map(buf => ({
    id:       buf.id || randomUUID(),
    type:     'function',
    function: { name: buf.name, arguments: buf.args }
  }))

  return { textContent, toolCalls: toolCalls.filter(t => t.function.name), usage, finishReason, streamComplete }
}
