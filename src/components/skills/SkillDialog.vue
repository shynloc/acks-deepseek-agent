<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Sparkles, Plus } from '@lucide/vue'
import type { Skill, ProposedSkill } from '@/stores/skills'

const props = defineProps<{
  mode: 'create' | 'edit' | 'extract'
  skill?: Skill           // for edit
  proposed?: ProposedSkill // for extract
}>()

const emit = defineEmits<{
  save:   [data: { name: string; description: string; triggerKeywords: string; systemHint: string; source: 'manual' | 'auto' }]
  cancel: []
}>()

// ── Form state ────────────────────────────────────────────────────────────────
const name        = ref('')
const description = ref('')
const systemHint  = ref('')
const keywords    = ref<string[]>([])
const kwInput     = ref('')

watch(() => props, () => {
  if (props.mode === 'edit' && props.skill) {
    name.value        = props.skill.name
    description.value = props.skill.description
    systemHint.value  = props.skill.systemHint ?? ''
    try { keywords.value = JSON.parse(props.skill.triggerKeywords) } catch { keywords.value = [] }
  } else if (props.mode === 'extract' && props.proposed) {
    name.value        = props.proposed.name
    description.value = props.proposed.description
    systemHint.value  = props.proposed.systemHint
    keywords.value    = [...props.proposed.triggerKeywords]
  } else {
    name.value = description.value = systemHint.value = kwInput.value = ''
    keywords.value = []
  }
}, { immediate: true, deep: true })

function addKeyword() {
  const kw = kwInput.value.trim()
  if (kw && !keywords.value.includes(kw)) keywords.value.push(kw)
  kwInput.value = ''
}

function removeKeyword(i: number) { keywords.value.splice(i, 1) }

function onKwKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword() }
  if (e.key === 'Backspace' && !kwInput.value && keywords.value.length) keywords.value.pop()
}

function handleSave() {
  if (!name.value.trim()) return
  emit('save', {
    name:            name.value.trim(),
    description:     description.value.trim(),
    triggerKeywords: JSON.stringify(keywords.value.filter(Boolean)),
    systemHint:      systemHint.value.trim(),
    source:          props.mode === 'extract' ? 'auto' : 'manual'
  })
}

const titles = { create: '新建技能', edit: '编辑技能', extract: 'AI 提炼技能' }
</script>

<template>
  <!-- Overlay -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="emit('cancel')">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('cancel')" />

    <!-- Dialog -->
    <div class="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div class="flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-purple-500" />
          <h2 class="font-semibold text-gray-900 dark:text-gray-100">{{ titles[mode] }}</h2>
          <span v-if="mode === 'extract'" class="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-full">AI 自动提炼</span>
        </div>
        <button @click="emit('cancel')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg transition-colors">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- AI proposal summary (extract mode) -->
      <div v-if="mode === 'extract' && proposed?.toolSequenceSummary"
           class="mx-5 mt-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl px-3 py-2 text-xs text-purple-700 dark:text-purple-400">
        <span class="font-medium">调用序列：</span>{{ proposed.toolSequenceSummary }}
      </div>

      <!-- Form -->
      <div class="px-5 py-4 space-y-4">

        <!-- Name -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">技能名称 <span class="text-red-400">*</span></label>
          <input v-model="name" type="text" placeholder="例：整理笔记摘要"
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <!-- Description -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">描述</label>
          <input v-model="description" type="text" placeholder="一句话说明这个技能的作用"
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <!-- Trigger Keywords -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">触发关键词
            <span class="text-xs text-gray-400 font-normal ml-1">用户输入包含这些词时自动激活</span>
          </label>
          <div class="min-h-[40px] flex flex-wrap gap-1.5 items-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-purple-500">
            <span v-for="(kw, i) in keywords" :key="i"
              class="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs px-2 py-0.5 rounded-full">
              {{ kw }}
              <button @click="removeKeyword(i)" class="hover:text-red-500 transition-colors"><X class="w-3 h-3" /></button>
            </span>
            <input v-model="kwInput" @keydown="onKwKeydown" @blur="addKeyword"
              type="text" placeholder="输入后按 Enter 添加"
              class="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder-gray-400 dark:placeholder-gray-600" />
          </div>
        </div>

        <!-- System Hint -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">附加指令
            <span class="text-xs text-gray-400 font-normal ml-1">激活时注入 system prompt</span>
          </label>
          <textarea v-model="systemHint" rows="3"
            placeholder="执行此类任务时，AI 应特别注意：&#10;1. ...&#10;2. ..."
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
        <button @click="emit('cancel')"
          class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
          取消
        </button>
        <button @click="handleSave" :disabled="!name.trim()"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50">
          <Plus class="w-4 h-4" />
          {{ mode === 'edit' ? '保存修改' : '保存技能' }}
        </button>
      </div>
    </div>
  </div>
</template>
