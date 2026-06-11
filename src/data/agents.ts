import promptEngineerPrompt    from './agent-prompts/prompt-engineer.md?raw'
import frontendDeveloperPrompt  from './agent-prompts/frontend-developer.md?raw'
import backendArchitectPrompt   from './agent-prompts/backend-architect.md?raw'
import codeReviewerPrompt       from './agent-prompts/code-reviewer.md?raw'
import productManagerPrompt     from './agent-prompts/product-manager.md?raw'
import businessStrategistPrompt from './agent-prompts/business-strategist.md?raw'
import dataEngineerPrompt       from './agent-prompts/data-engineer.md?raw'
import technicalWriterPrompt    from './agent-prompts/technical-writer.md?raw'
import contentCreatorPrompt     from './agent-prompts/content-creator.md?raw'
import xiaohongshuPrompt        from './agent-prompts/xiaohongshu.md?raw'
import uxArchitectPrompt        from './agent-prompts/ux-architect.md?raw'
import realityCheckerPrompt     from './agent-prompts/reality-checker.md?raw'

export interface AgentDef {
  id:           string
  name:         string
  nameZh:       string
  emoji:        string
  description:  string
  category:     string
  systemPrompt: string
}

export const AGENT_CATEGORIES = [
  { id: 'engineering', label: '⚙️ 工程技术' },
  { id: 'knowledge',   label: '📊 知识分析' },
  { id: 'writing',     label: '✍️ 写作创作' },
  { id: 'design',      label: '🎨 设计体验' },
]

export const AGENTS: AgentDef[] = [
  // ── Engineering ──────────────────────────────────────────────────────────────
  {
    id:           'prompt-engineer',
    name:         'Prompt Engineer',
    nameZh:       '提示词工程师',
    emoji:        '🧬',
    description:  '设计和优化 AI 提示词，让模型输出更精准、可靠',
    category:     'engineering',
    systemPrompt: promptEngineerPrompt,
  },
  {
    id:           'frontend-developer',
    name:         'Frontend Developer',
    nameZh:       '前端开发工程师',
    emoji:        '🖥️',
    description:  'React/Vue/Angular 专家，组件开发、性能优化、Web 最佳实践',
    category:     'engineering',
    systemPrompt: frontendDeveloperPrompt,
  },
  {
    id:           'backend-architect',
    name:         'Backend Architect',
    nameZh:       '后端架构师',
    emoji:        '🏗️',
    description:  '系统设计、API 架构、数据库建模、可扩展性与可靠性',
    category:     'engineering',
    systemPrompt: backendArchitectPrompt,
  },
  {
    id:           'code-reviewer',
    name:         'Code Reviewer',
    nameZh:       '代码审查员',
    emoji:        '👁️',
    description:  '深度代码审查，识别 bug、安全漏洞、性能问题和设计缺陷',
    category:     'engineering',
    systemPrompt: codeReviewerPrompt,
  },
  // ── Knowledge / Analysis ─────────────────────────────────────────────────────
  {
    id:           'product-manager',
    name:         'Product Manager',
    nameZh:       '产品经理',
    emoji:        '📋',
    description:  '产品策略、需求分析、PRD 撰写、路线图规划与交付',
    category:     'knowledge',
    systemPrompt: productManagerPrompt,
  },
  {
    id:           'business-strategist',
    name:         'Business Strategist',
    nameZh:       '商业战略分析师',
    emoji:        '♟️',
    description:  '商业模型分析、战略拆解、竞争研究、增长框架',
    category:     'knowledge',
    systemPrompt: businessStrategistPrompt,
  },
  {
    id:           'data-engineer',
    name:         'Data Engineer',
    nameZh:       '数据工程师',
    emoji:        '🔧',
    description:  '数据架构、SQL 优化、数据管道、分析报表与可视化',
    category:     'knowledge',
    systemPrompt: dataEngineerPrompt,
  },
  // ── Writing / Content ────────────────────────────────────────────────────────
  {
    id:           'technical-writer',
    name:         'Technical Writer',
    nameZh:       '技术文档作者',
    emoji:        '📚',
    description:  '撰写清晰、规范、易读的技术文档、API 文档和用户手册',
    category:     'writing',
    systemPrompt: technicalWriterPrompt,
  },
  {
    id:           'content-creator',
    name:         'Content Creator',
    nameZh:       '内容创作者',
    emoji:        '✍️',
    description:  '多平台内容策划与写作，文章、报告、社媒文案一站式创作',
    category:     'writing',
    systemPrompt: contentCreatorPrompt,
  },
  {
    id:           'xiaohongshu',
    name:         'Xiaohongshu Specialist',
    nameZh:       '小红书运营专家',
    emoji:        '🌸',
    description:  '小红书爆款内容策略、笔记结构、种草文案与流量增长',
    category:     'writing',
    systemPrompt: xiaohongshuPrompt,
  },
  // ── Design / Experience ──────────────────────────────────────────────────────
  {
    id:           'ux-architect',
    name:         'UX Architect',
    nameZh:       'UX 架构师',
    emoji:        '📐',
    description:  'UX 架构设计、交互规范、CSS 设计系统与开发交付物',
    category:     'design',
    systemPrompt: uxArchitectPrompt,
  },
  {
    id:           'reality-checker',
    name:         'Reality Checker',
    nameZh:       '现实核查员',
    emoji:        '🧐',
    description:  '批判性思维、事实核查、方案评估，要求证据驱动的输出',
    category:     'design',
    systemPrompt: realityCheckerPrompt,
  },
]

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find(a => a.id === id)
}
