import { describe, it, expect, beforeAll } from 'vitest'
import { ToolGuardrails } from '../electron/main/agent/guardrails'
import { toolRegistry } from '../electron/main/tools/registry'

// Guardrails reads the read-only flag from the tool registry, so the tools used
// here have to exist in it. Registering stubs keeps the test independent of the
// real builtin tools (which pull in electron at import time).
function registerStub(name: string, idempotent: boolean): void {
  toolRegistry.register({
    name,
    schema: { name, description: '', parameters: { type: 'object', properties: {} } },
    handler: async () => '',
    idempotent
  })
}

beforeAll(() => {
  for (const n of ['search_notes', 'get_note', 'list_notes', 'get_datetime', 'get_stats', 'web_search']) {
    registerStub(n, true)
  }
  for (const n of ['create_note', 'update_note']) {
    registerStub(n, false)
  }
})

// Thresholds mirrored from guardrails.ts CFG
const EXACT_FAIL_WARN  = 2
const EXACT_FAIL_HALT  = 5
const TOOL_FAIL_WARN   = 3
const TOOL_FAIL_HALT   = 8
const NO_PROGRESS_HALT = 5

// guardrails.ts classifies these as read-only; everything else counts as progress.
const READ_ONLY = 'search_notes'
const MUTATING  = 'create_note'

/**
 * Failure-counter tests use a MUTATING tool on purpose: read-only tools also feed
 * the no-progress counter, which would halt the run for an unrelated reason and
 * make the assertion meaningless.
 */
function failNTimes(g: ToolGuardrails, name: string, args: Record<string, unknown>, n: number): void {
  for (let i = 0; i < n; i++) g.afterCall(name, args, true)
}

describe('ToolGuardrails', () => {
  it('allows a call with no history', () => {
    const g = new ToolGuardrails()
    expect(g.beforeCall(READ_ONLY, { query: 'a' }).action).toBe('allow')
  })

  it('keeps allowing while a mutating tool succeeds', () => {
    const g = new ToolGuardrails()
    for (let i = 0; i < 20; i++) g.afterCall(MUTATING, { title: 'x' }, false)
    expect(g.beforeCall(MUTATING, { title: 'x' }).action).toBe('allow')
  })

  describe('same tool + same args (exact signature)', () => {
    it(`allows below ${EXACT_FAIL_WARN} failures`, () => {
      const g = new ToolGuardrails()
      failNTimes(g, MUTATING, { title: 'x' }, EXACT_FAIL_WARN - 1)
      expect(g.beforeCall(MUTATING, { title: 'x' }).action).toBe('allow')
    })

    it(`warns at ${EXACT_FAIL_WARN} failures`, () => {
      const g = new ToolGuardrails()
      failNTimes(g, MUTATING, { title: 'x' }, EXACT_FAIL_WARN)
      const d = g.beforeCall(MUTATING, { title: 'x' })
      expect(d.action).toBe('warn')
      expect(d.message).toContain(MUTATING)
    })

    it(`halts at ${EXACT_FAIL_HALT} failures`, () => {
      const g = new ToolGuardrails()
      failNTimes(g, MUTATING, { title: 'x' }, EXACT_FAIL_HALT)
      expect(g.beforeCall(MUTATING, { title: 'x' }).action).toBe('halt')
    })

    it('does not carry the exact-signature count across different args', () => {
      const g = new ToolGuardrails()
      failNTimes(g, MUTATING, { title: 'x' }, EXACT_FAIL_HALT)
      // Fresh signature; the tool total (5) is still below TOOL_FAIL_HALT (8),
      // so this must not halt — only the softer per-tool warning applies.
      expect(g.beforeCall(MUTATING, { title: 'different' }).action).toBe('warn')
    })

    it('treats argument key order as the same signature', () => {
      const g = new ToolGuardrails()
      failNTimes(g, MUTATING, { title: 'a', content: 'b' }, EXACT_FAIL_HALT)
      expect(g.beforeCall(MUTATING, { content: 'b', title: 'a' }).action).toBe('halt')
    })
  })

  describe('per-tool failure totals (across differing args)', () => {
    it(`warns at ${TOOL_FAIL_WARN} failures with all-different args`, () => {
      const g = new ToolGuardrails()
      for (let i = 0; i < TOOL_FAIL_WARN; i++) g.afterCall(MUTATING, { title: `n${i}` }, true)
      expect(g.beforeCall(MUTATING, { title: 'fresh' }).action).toBe('warn')
    })

    it(`halts at ${TOOL_FAIL_HALT} failures with all-different args`, () => {
      const g = new ToolGuardrails()
      for (let i = 0; i < TOOL_FAIL_HALT; i++) g.afterCall(MUTATING, { title: `n${i}` }, true)
      expect(g.beforeCall(MUTATING, { title: 'fresh' }).action).toBe('halt')
    })

    it('counts failures per tool, not globally', () => {
      const g = new ToolGuardrails()
      for (let i = 0; i < TOOL_FAIL_HALT; i++) g.afterCall(MUTATING, { title: `n${i}` }, true)
      expect(g.beforeCall('update_note', { id: 'x' }).action).toBe('allow')
    })
  })

  describe('no-progress detection', () => {
    it(`does not halt at ${NO_PROGRESS_HALT - 1} read-only calls`, () => {
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT - 1; i++) g.afterCall(READ_ONLY, { query: `q${i}` }, false)
      expect(g.beforeCall(READ_ONLY, { query: 'again' }).action).not.toBe('halt')
    })

    it(`halts after ${NO_PROGRESS_HALT} consecutive read-only calls`, () => {
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT; i++) g.afterCall(READ_ONLY, { query: `q${i}` }, false)
      expect(g.beforeCall(READ_ONLY, { query: 'again' }).action).toBe('halt')
    })

    it('counts read-only calls even when they succeed', () => {
      // The rule is about repetition without state change, not about failure.
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT; i++) g.afterCall('get_datetime', {}, false)
      expect(g.beforeCall('get_datetime', {}).action).toBe('halt')
    })

    it('accumulates across different read-only tools', () => {
      const g = new ToolGuardrails()
      for (const name of ['search_notes', 'get_note', 'list_notes', 'get_datetime', 'get_stats']) {
        g.afterCall(name, {}, false)
      }
      expect(g.beforeCall('web_search', { query: 'x' }).action).toBe('halt')
    })

    it('resets the counter when a mutating tool runs', () => {
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT - 1; i++) g.afterCall(READ_ONLY, { query: `q${i}` }, false)
      g.afterCall(MUTATING, { title: 'progress' }, false)
      for (let i = 0; i < NO_PROGRESS_HALT - 1; i++) g.afterCall(READ_ONLY, { query: `r${i}` }, false)
      expect(g.beforeCall(READ_ONLY, { query: 'again' }).action).not.toBe('halt')
    })

    it('a mutating tool resets progress even when it fails', () => {
      // afterCall() resets the counter for any non-read-only tool regardless of
      // outcome. Pinning this down: a failed write still counts as "progress".
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT - 1; i++) g.afterCall(READ_ONLY, { query: `q${i}` }, false)
      g.afterCall(MUTATING, { title: 'boom' }, true)
      expect(g.beforeCall(READ_ONLY, { query: 'again' }).action).not.toBe('halt')
    })
  })

  describe('read-only classification comes from the registry', () => {
    it('counts a tool flagged idempotent in the registry', () => {
      registerStub('probe_readonly', true)
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT; i++) g.afterCall('probe_readonly', {}, false)
      expect(g.beforeCall('probe_readonly', {}).action).toBe('halt')
    })

    it('treats a tool not flagged idempotent as progress', () => {
      registerStub('probe_mutating', false)
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT * 2; i++) g.afterCall('probe_mutating', {}, false)
      expect(g.beforeCall('probe_mutating', {}).action).toBe('allow')
    })

    it('treats an unregistered tool name as progress', () => {
      // Hallucinated tool names and runtime-registered plugins land here.
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT * 2; i++) g.afterCall('no_such_tool', {}, false)
      expect(g.beforeCall('no_such_tool', {}).action).toBe('allow')
    })
  })

  describe('rule interaction', () => {
    it('halts a repeatedly failing read-only tool via no-progress before the failure count', () => {
      // Read-only tools feed both counters. no-progress (5) is reached at the same
      // time as the exact-failure halt (5), and both are checked before the warns,
      // so a failing read-only loop is always stopped by iteration 5.
      const g = new ToolGuardrails()
      for (let i = 0; i < NO_PROGRESS_HALT; i++) g.afterCall('web_search', { query: `q${i}` }, true)
      expect(g.beforeCall('web_search', { query: 'brand new' }).action).toBe('halt')
    })

    it('returns a message on every non-allow decision', () => {
      const g = new ToolGuardrails()
      failNTimes(g, MUTATING, { title: 'x' }, EXACT_FAIL_WARN)
      expect(g.beforeCall(MUTATING, { title: 'x' }).message).toBeTruthy()

      failNTimes(g, MUTATING, { title: 'x' }, EXACT_FAIL_HALT - EXACT_FAIL_WARN)
      const halt = g.beforeCall(MUTATING, { title: 'x' })
      expect(halt.action).toBe('halt')
      expect(halt.message).toBeTruthy()
    })
  })
})
