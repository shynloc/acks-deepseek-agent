// Port of Hermes agent/tool_guardrails.py — prevents infinite tool-call loops

// Read-only tools: repeating without mutation signals no-progress
const IDEMPOTENT_TOOLS = new Set([
  'search_notes', 'get_note', 'list_notes',
  'get_datetime', 'get_stats', 'web_search'
])


const CFG = {
  exactFailWarn:  2,
  exactFailHalt:  5,
  toolFailWarn:   3,
  toolFailHalt:   8,
  noProgressWarn: 2,
  noProgressHalt: 5
}

export type GuardrailAction = 'allow' | 'warn' | 'halt'

export interface GuardrailDecision {
  action: GuardrailAction
  message?: string
}

export class ToolGuardrails {
  // sig → failure count (same tool + same args)
  private exactFailures = new Map<string, number>()
  // toolName → total failures
  private toolFailures  = new Map<string, number>()
  // consecutive idempotent-only calls with no state change
  private noProgressCount = 0

  beforeCall(name: string, args: Record<string, unknown>): GuardrailDecision {
    const sig   = this.sig(name, args)
    const exact = this.exactFailures.get(sig) ?? 0
    const total = this.toolFailures.get(name)  ?? 0

    if (exact >= CFG.exactFailHalt)
      return { action: 'halt', message: `工具 ${name} 以相同参数已失败 ${exact} 次，停止重试。请直接告知用户遇到的问题。` }
    if (total >= CFG.toolFailHalt)
      return { action: 'halt', message: `工具 ${name} 累计失败 ${total} 次，请停止并向用户说明情况。` }
    if (this.noProgressCount >= CFG.noProgressHalt)
      return { action: 'halt', message: '检测到重复的只读操作且无实际进展，请停止循环并向用户汇报当前状态。' }
    if (exact >= CFG.exactFailWarn)
      return { action: 'warn', message: `工具 ${name} 已用相同参数失败 ${exact} 次，请尝试换种方式或参数。` }
    if (total >= CFG.toolFailWarn)
      return { action: 'warn', message: `工具 ${name} 本轮已失败 ${total} 次，请谨慎继续。` }

    return { action: 'allow' }
  }

  afterCall(name: string, args: Record<string, unknown>, failed: boolean): void {
    if (failed) {
      const sig = this.sig(name, args)
      this.exactFailures.set(sig, (this.exactFailures.get(sig) ?? 0) + 1)
      this.toolFailures.set(name, (this.toolFailures.get(name) ?? 0) + 1)
    }

    if (IDEMPOTENT_TOOLS.has(name)) {
      this.noProgressCount++
    } else {
      // A mutating tool means progress was made — reset counter
      this.noProgressCount = 0
    }
  }

  private sig(name: string, args: Record<string, unknown>): string {
    return `${name}:${JSON.stringify(args, Object.keys(args).sort())}`
  }
}
