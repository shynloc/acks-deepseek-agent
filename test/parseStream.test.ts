import { describe, it, expect } from 'vitest'
import { parseStream } from '../electron/main/agent/loop'
import type { AgentCallbacks } from '../electron/main/agent/loop'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a Response whose body yields exactly the given chunks, so tests control
 * where the network would have split the SSE stream. This is the whole point:
 * DeepSeek splits tool_call arguments across chunks and can split a single SSE
 * line mid-JSON.
 */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    }
  })
  return new Response(stream)
}

/** Build the raw bytes for a stream, then re-split them at a byte boundary. */
function sseResponseSplitAt(full: string, index: number): Response {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(full)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, index))
      controller.enqueue(bytes.slice(index))
      controller.close()
    }
  })
  return new Response(stream)
}

function data(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

function textDelta(content: string): string {
  return data({ choices: [{ delta: { content } }] })
}

interface Recorder {
  callbacks: AgentCallbacks
  deltas: string[]
  errors: string[]
}

function recorder(): Recorder {
  const deltas: string[] = []
  const errors: string[] = []
  return {
    deltas,
    errors,
    callbacks: {
      onDelta:      t => deltas.push(t),
      onToolCall:   () => {},
      onToolResult: () => {},
      onDone:       () => {},
      onError:      m => errors.push(m)
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseStream', () => {
  describe('text content', () => {
    it('accumulates content deltas and emits each one', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([textDelta('你好'), textDelta('，'), textDelta('世界'), 'data: [DONE]\n\n']),
        r.callbacks
      )
      expect(res.textContent).toBe('你好，世界')
      expect(r.deltas).toEqual(['你好', '，', '世界'])
    })

    it('ignores empty-string content deltas', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([textDelta('a'), textDelta(''), textDelta('b'), 'data: [DONE]\n\n']),
        r.callbacks
      )
      expect(res.textContent).toBe('ab')
    })
  })

  describe('stream termination', () => {
    it('marks the stream complete on [DONE]', async () => {
      const r = recorder()
      const res = await parseStream(sseResponse([textDelta('hi'), 'data: [DONE]\n\n']), r.callbacks)
      expect(res.streamComplete).toBe(true)
    })

    it('marks the stream complete on a finish_reason', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([textDelta('hi'), data({ choices: [{ delta: {}, finish_reason: 'stop' }] })]),
        r.callbacks
      )
      expect(res.streamComplete).toBe(true)
      expect(res.finishReason).toBe('stop')
    })

    it('reports finish_reason "length" for truncated replies', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([textDelta('hi'), data({ choices: [{ delta: {}, finish_reason: 'length' }] })]),
        r.callbacks
      )
      expect(res.finishReason).toBe('length')
    })

    it('reports an incomplete stream when it just stops', async () => {
      // This is what drives the non-streaming fallback in runAgentLoop.
      const r = recorder()
      const res = await parseStream(sseResponse([textDelta('partial')]), r.callbacks)
      expect(res.streamComplete).toBe(false)
      expect(res.textContent).toBe('partial')
    })
  })

  describe('tool call reassembly', () => {
    it('joins argument fragments split across chunks', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([
          data({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search_notes', arguments: '{"que' } }] } }] }),
          data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"电池' } }] } }] }),
          data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '技术"}' } }] } }] }),
          data({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
        ]),
        r.callbacks
      )
      expect(res.toolCalls).toHaveLength(1)
      expect(res.toolCalls[0].id).toBe('call_1')
      expect(res.toolCalls[0].function.name).toBe('search_notes')
      expect(JSON.parse(res.toolCalls[0].function.arguments)).toEqual({ query: '电池技术' })
    })

    it('keeps parallel tool calls separate by index', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([
          data({ choices: [{ delta: { tool_calls: [
            { index: 0, id: 'a', function: { name: 'get_note', arguments: '{"id":' } },
            { index: 1, id: 'b', function: { name: 'web_search', arguments: '{"query":' } }
          ] } }] }),
          data({ choices: [{ delta: { tool_calls: [
            { index: 1, function: { arguments: '"x"}' } },
            { index: 0, function: { arguments: '"n1"}' } }
          ] } }] }),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      expect(res.toolCalls).toHaveLength(2)
      const byName = Object.fromEntries(res.toolCalls.map(t => [t.function.name, t.function.arguments]))
      expect(JSON.parse(byName.get_note)).toEqual({ id: 'n1' })
      expect(JSON.parse(byName.web_search)).toEqual({ query: 'x' })
    })

    it('defaults a missing index to 0', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([
          data({ choices: [{ delta: { tool_calls: [{ id: 'a', function: { name: 'get_stats', arguments: '{' } }] } }] }),
          data({ choices: [{ delta: { tool_calls: [{ function: { arguments: '}' } }] } }] }),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      expect(res.toolCalls).toHaveLength(1)
      expect(res.toolCalls[0].function.arguments).toBe('{}')
    })

    it('drops fragments that never produced a tool name', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([
          data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] } }] }),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      expect(res.toolCalls).toHaveLength(0)
    })

    it('synthesizes an id when the API omits one', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([
          data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'get_datetime', arguments: '{}' } }] } }] }),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      expect(res.toolCalls).toHaveLength(1)
      expect(res.toolCalls[0].id).toBeTruthy()
    })
  })

  describe('chunk boundary handling', () => {
    it('rejoins an SSE line split mid-JSON', async () => {
      const full = textDelta('hello') + 'data: [DONE]\n\n'
      // Split inside the first JSON payload
      const res = await parseStream(sseResponseSplitAt(full, 20), recorder().callbacks)
      expect(res.textContent).toBe('hello')
      expect(res.streamComplete).toBe(true)
    })

    it('rejoins a multi-byte character split across chunks', async () => {
      // '世' is 3 bytes in UTF-8; cut through the middle of it.
      const full = textDelta('世界') + 'data: [DONE]\n\n'
      const cut = new TextEncoder().encode(full).indexOf(0xe4) + 1  // mid '世'
      const res = await parseStream(sseResponseSplitAt(full, cut), recorder().callbacks)
      expect(res.textContent).toBe('世界')
    })

    it('drops a trailing line that never got its newline', async () => {
      // Deliberate: the parser holds the last partial line in `remainder` and never
      // flushes it at end-of-stream. A truncated final event therefore leaves
      // streamComplete false, which is what triggers the non-streaming fallback in
      // runAgentLoop. Flushing it instead could mark a cut-off stream as complete
      // and suppress that recovery path.
      const res = await parseStream(
        sseResponse([textDelta('a'), 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}']),
        recorder().callbacks
      )
      expect(res.textContent).toBe('a')
      expect(res.finishReason).toBeNull()
      expect(res.streamComplete).toBe(false)
    })

    it('handles several SSE events arriving in one chunk', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([textDelta('a') + textDelta('b') + textDelta('c') + 'data: [DONE]\n\n']),
        r.callbacks
      )
      expect(res.textContent).toBe('abc')
      expect(r.deltas).toEqual(['a', 'b', 'c'])
    })
  })

  describe('robustness', () => {
    it('skips malformed JSON without throwing', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse(['data: {not json\n\n', textDelta('ok'), 'data: [DONE]\n\n']),
        r.callbacks
      )
      expect(res.textContent).toBe('ok')
    })

    it('ignores non-data SSE lines such as comments', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([': keep-alive\n\n', textDelta('ok'), 'data: [DONE]\n\n']),
        r.callbacks
      )
      expect(res.textContent).toBe('ok')
    })

    it('returns zeroed usage when the API sends none', async () => {
      const res = await parseStream(sseResponse([textDelta('x'), 'data: [DONE]\n\n']), recorder().callbacks)
      expect(res.usage).toEqual({
        promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0
      })
    })
  })

  describe('usage accounting', () => {
    it('captures prompt/completion and KV cache token counts', async () => {
      const res = await parseStream(
        sseResponse([
          textDelta('x'),
          data({
            choices: [{ delta: {} }],
            usage: {
              prompt_tokens: 100, completion_tokens: 20,
              prompt_cache_hit_tokens: 64, prompt_cache_miss_tokens: 36
            }
          }),
          'data: [DONE]\n\n'
        ]),
        recorder().callbacks
      )
      expect(res.usage).toEqual({
        promptTokens: 100, completionTokens: 20, cacheHitTokens: 64, cacheMissTokens: 36
      })
    })
  })

  describe('thinking mode (reasoning_content)', () => {
    it('flushes the reasoning block before the first content token', async () => {
      const r = recorder()
      await parseStream(
        sseResponse([
          data({ choices: [{ delta: { reasoning_content: '先想一下' } }] }),
          data({ choices: [{ delta: { reasoning_content: '再想一下' } }] }),
          textDelta('答案'),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      expect(r.deltas[0]).toContain('<details class="thinking-block">')
      expect(r.deltas[0]).toContain('先想一下再想一下')
      expect(r.deltas[1]).toBe('答案')
    })

    it('flushes reasoning at [DONE] when no content followed', async () => {
      const r = recorder()
      await parseStream(
        sseResponse([
          data({ choices: [{ delta: { reasoning_content: '只有思考' } }] }),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      expect(r.deltas).toHaveLength(1)
      expect(r.deltas[0]).toContain('只有思考')
    })

    it('emits the reasoning block exactly once', async () => {
      const r = recorder()
      await parseStream(
        sseResponse([
          data({ choices: [{ delta: { reasoning_content: '思考' } }] }),
          textDelta('一'),
          textDelta('二'),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      const blocks = r.deltas.filter(d => d.includes('thinking-block'))
      expect(blocks).toHaveLength(1)
    })

    it('keeps reasoning out of textContent', async () => {
      const r = recorder()
      const res = await parseStream(
        sseResponse([
          data({ choices: [{ delta: { reasoning_content: '思考过程' } }] }),
          textDelta('最终答案'),
          'data: [DONE]\n\n'
        ]),
        r.callbacks
      )
      expect(res.textContent).toBe('最终答案')
    })
  })
})
