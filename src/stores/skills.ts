import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Skill {
  id: string
  name: string
  description: string
  triggerKeywords: string   // JSON string array e.g. '["整理","摘要"]'
  systemHint: string
  toolSequence?: string
  usageCount: number
  source: 'manual' | 'auto'
  createdAt: number
  updatedAt: number
}

export interface ProposedSkill {
  name: string
  description: string
  triggerKeywords: string[]
  systemHint: string
  toolSequenceSummary?: string  // human-readable summary of the tool calls
}

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<Skill[]>([])
  let _loaded = false

  async function load(): Promise<void> {
    if (_loaded) return
    skills.value = (await window.api.db.skills.list()) as Skill[]
    _loaded = true
  }

  async function create(data: Omit<Skill, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>): Promise<Skill> {
    const skill = { ...data, id: crypto.randomUUID() }
    const saved = await window.api.db.skills.create(skill) as Skill
    skills.value.unshift(saved)
    return saved
  }

  async function update(id: string, patch: Partial<Skill>): Promise<void> {
    await window.api.db.skills.update(id, patch)
    const idx = skills.value.findIndex(s => s.id === id)
    if (idx !== -1) skills.value[idx] = { ...skills.value[idx], ...patch }
  }

  async function remove(id: string): Promise<void> {
    await window.api.db.skills.delete(id)
    skills.value = skills.value.filter(s => s.id !== id)
  }

  async function incrementUsage(id: string): Promise<void> {
    const skill = skills.value.find(s => s.id === id)
    if (!skill) return
    const newCount = skill.usageCount + 1
    await update(id, { usageCount: newCount })
  }

  // Returns skills whose trigger_keywords match the user input
  function matchForInput(input: string): Skill[] {
    const lower = input.toLowerCase()
    return skills.value.filter(s => {
      try {
        const keywords = JSON.parse(s.triggerKeywords) as string[]
        return keywords.some(k => k && lower.includes(k.toLowerCase()))
      } catch { return false }
    })
  }

  // Build the system_hint injection string for matched skills
  function buildSystemHintFor(matched: Skill[]): string {
    if (!matched.length) return ''
    return '\n\n' + matched
      .filter(s => s.systemHint?.trim())
      .map(s => `## 激活技能：${s.name}\n${s.systemHint}`)
      .join('\n\n')
  }

  return { skills, load, create, update, remove, incrementUsage, matchForInput, buildSystemHintFor }
})
