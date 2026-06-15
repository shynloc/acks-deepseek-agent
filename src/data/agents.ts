import promptEngineerPrompt      from './agent-prompts/prompt-engineer.md?raw'
import frontendDeveloperPrompt   from './agent-prompts/frontend-developer.md?raw'
import backendArchitectPrompt    from './agent-prompts/backend-architect.md?raw'
import codeReviewerPrompt        from './agent-prompts/code-reviewer.md?raw'
import productManagerPrompt      from './agent-prompts/product-manager.md?raw'
import businessStrategistPrompt  from './agent-prompts/business-strategist.md?raw'
import dataEngineerPrompt        from './agent-prompts/data-engineer.md?raw'
import technicalWriterPrompt     from './agent-prompts/technical-writer.md?raw'
import contentCreatorPrompt      from './agent-prompts/content-creator.md?raw'
import xiaohongshuPrompt         from './agent-prompts/xiaohongshu.md?raw'
import uxArchitectPrompt         from './agent-prompts/ux-architect.md?raw'
import realityCheckerPrompt      from './agent-prompts/reality-checker.md?raw'
// New engineering agents
import debugDetectivePrompt      from './agent-prompts/debug-detective.md?raw'
import mobileEngineerPrompt      from './agent-prompts/mobile-engineer.md?raw'
import securityEngineerPrompt    from './agent-prompts/security-engineer.md?raw'
import pythonExpertPrompt        from './agent-prompts/python-expert.md?raw'
import cloudArchitectPrompt      from './agent-prompts/cloud-architect.md?raw'
import aiEngineerPrompt          from './agent-prompts/ai-engineer.md?raw'
// New knowledge/office agents
import dataAnalystPrompt         from './agent-prompts/data-analyst.md?raw'
import workplaceCommunicatorPrompt from './agent-prompts/workplace-communicator.md?raw'
import legalAssistantPrompt      from './agent-prompts/legal-assistant.md?raw'
import financialAnalystPrompt    from './agent-prompts/financial-analyst.md?raw'
// New learning agents
import socraticTutorPrompt       from './agent-prompts/socratic-tutor.md?raw'
import languageCoachPrompt       from './agent-prompts/language-coach.md?raw'
import researchAssistantPrompt   from './agent-prompts/research-assistant.md?raw'
// New creative agents
import storyWriterPrompt         from './agent-prompts/story-writer.md?raw'
import shortVideoPlannerPrompt   from './agent-prompts/short-video-planner.md?raw'
import creativeDirectorPrompt    from './agent-prompts/creative-director.md?raw'

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
  { id: 'learning',    label: '📚 学习成长' },
  { id: 'creative',    label: '🎬 创意内容' },
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
  {
    id:           'debug-detective',
    name:         'Debug Detective',
    nameZh:       'Debug 侦探',
    emoji:        '🔍',
    description:  '专业 Bug 诊断，根因分析、最小化修复、防止同类问题复发',
    category:     'engineering',
    systemPrompt: debugDetectivePrompt,
  },
  {
    id:           'mobile-engineer',
    name:         'Mobile Engineer',
    nameZh:       '移动端工程师',
    emoji:        '📱',
    description:  'iOS/Android/React Native/Flutter，移动端架构与最佳实践',
    category:     'engineering',
    systemPrompt: mobileEngineerPrompt,
  },
  {
    id:           'security-engineer',
    name:         'Security Engineer',
    nameZh:       '安全工程师',
    emoji:        '🛡️',
    description:  '应用安全审计、威胁建模、OWASP Top 10、安全加固建议',
    category:     'engineering',
    systemPrompt: securityEngineerPrompt,
  },
  {
    id:           'python-expert',
    name:         'Python Expert',
    nameZh:       'Python 专家',
    emoji:        '🐍',
    description:  '全栈 Python：Web/数据/AI/自动化，生产级代码与最佳实践',
    category:     'engineering',
    systemPrompt: pythonExpertPrompt,
  },
  {
    id:           'cloud-architect',
    name:         'Cloud Architect',
    nameZh:       '云架构师',
    emoji:        '☁️',
    description:  'AWS/GCP/Azure 架构设计，Kubernetes、IaC、成本优化与高可用',
    category:     'engineering',
    systemPrompt: cloudArchitectPrompt,
  },
  {
    id:           'ai-engineer',
    name:         'AI Engineer',
    nameZh:       'AI 工程师',
    emoji:        '🤖',
    description:  'LLM 应用开发、RAG 系统、AI Agent 架构，生产级 AI 落地',
    category:     'engineering',
    systemPrompt: aiEngineerPrompt,
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
  {
    id:           'data-analyst',
    name:         'Data Analyst',
    nameZh:       '数据分析师',
    emoji:        '📈',
    description:  '数据洞察、统计分析、A/B 测试、SQL 查询与可视化报表',
    category:     'knowledge',
    systemPrompt: dataAnalystPrompt,
  },
  {
    id:           'workplace-communicator',
    name:         'Workplace Communicator',
    nameZh:       '职场沟通专家',
    emoji:        '💼',
    description:  '邮件、汇报、提案、难以开口的对话，专业职场表达全搞定',
    category:     'knowledge',
    systemPrompt: workplaceCommunicatorPrompt,
  },
  {
    id:           'legal-assistant',
    name:         'Legal Assistant',
    nameZh:       '法律助手',
    emoji:        '⚖️',
    description:  '合同解读、法律概念解释、风险条款识别，普法不替代律师',
    category:     'knowledge',
    systemPrompt: legalAssistantPrompt,
  },
  {
    id:           'financial-analyst',
    name:         'Financial Analyst',
    nameZh:       '财务分析师',
    emoji:        '💰',
    description:  '财报解读、估值建模、个人理财、创业融资与单位经济分析',
    category:     'knowledge',
    systemPrompt: financialAnalystPrompt,
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
  // ── Learning / Growth ────────────────────────────────────────────────────────
  {
    id:           'socratic-tutor',
    name:         'Socratic Tutor',
    nameZh:       '苏格拉底导师',
    emoji:        '🦉',
    description:  '引导式提问教学，帮你真正理解知识而非死记硬背',
    category:     'learning',
    systemPrompt: socraticTutorPrompt,
  },
  {
    id:           'language-coach',
    name:         'Language Coach',
    nameZh:       '语言学习教练',
    emoji:        '🗣️',
    description:  '英语/中文/日语/西班牙语，口语、写作、词汇、发音全面提升',
    category:     'learning',
    systemPrompt: languageCoachPrompt,
  },
  {
    id:           'research-assistant',
    name:         'Research Assistant',
    nameZh:       '研究助手',
    emoji:        '🔬',
    description:  '文献综述、信息检索、来源评估、研究报告结构化整理',
    category:     'learning',
    systemPrompt: researchAssistantPrompt,
  },
  // ── Creative Content ─────────────────────────────────────────────────────────
  {
    id:           'story-writer',
    name:         'Story Writer',
    nameZh:       '故事作家',
    emoji:        '📖',
    description:  '小说、剧本、短篇创作，角色构建、情节架构、对话与叙事',
    category:     'creative',
    systemPrompt: storyWriterPrompt,
  },
  {
    id:           'short-video-planner',
    name:         'Short Video Planner',
    nameZh:       '短视频策划师',
    emoji:        '🎥',
    description:  '抖音/小红书/视频号爆款策划，脚本、钩子设计、内容日历',
    category:     'creative',
    systemPrompt: shortVideoPlannerPrompt,
  },
  {
    id:           'creative-director',
    name:         'Creative Director',
    nameZh:       '创意总监',
    emoji:        '🎨',
    description:  '品牌策略、广告创意、文案写作、内容策略与视觉方向',
    category:     'creative',
    systemPrompt: creativeDirectorPrompt,
  },
]

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find(a => a.id === id)
}
