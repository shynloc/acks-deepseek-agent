<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Bot, Check, X } from '@lucide/vue'
import { AGENTS, AGENT_CATEGORIES, type AgentDef } from '@/data/agents'

const props = defineProps<{
  modelValue: string | null   // selected agentId or null (= default)
  disabled?:  boolean         // locked (conversation already has messages)
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string | null]
}>()

const open    = ref(false)
const panelEl = ref<HTMLDivElement | null>(null)

const selected = computed<AgentDef | null>(() =>
  props.modelValue ? AGENTS.find(a => a.id === props.modelValue) ?? null : null
)

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function select(id: string | null) {
  emit('update:modelValue', id)
  open.value = false
}

// Close on outside click
function onDocClick(e: MouseEvent) {
  if (panelEl.value && !panelEl.value.contains(e.target as Node)) {
    open.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))

const groupedAgents = computed(() =>
  AGENT_CATEGORIES.map(cat => ({
    ...cat,
    agents: AGENTS.filter(a => a.category === cat.id),
  }))
)
</script>

<template>
  <div ref="panelEl" class="relative">
    <!-- Chip trigger -->
    <button
      @click="toggle"
      :disabled="disabled"
      class="flex items-center gap-1 text-xs py-1 px-2 rounded-lg transition-colors select-none"
      :class="[
        disabled
          ? 'cursor-default'
          : 'cursor-pointer',
        selected
          ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/60'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      ]"
      :title="disabled ? '会话已开始，无法切换 Agent' : '选择 Agent 角色'"
    >
      <span v-if="selected" class="text-sm leading-none">{{ selected.emoji }}</span>
      <Bot v-else class="w-3.5 h-3.5" />
      <span class="max-w-[96px] truncate">{{ selected ? selected.nameZh : '默认助手' }}</span>
      <ChevronDown v-if="!disabled" class="w-3 h-3 opacity-60 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>

    <!-- Popover panel -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      leave-active-class="transition-all duration-100 ease-in"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="open"
        class="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden z-50"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-3 pt-3 pb-2">
          <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">选择 Agent 角色</span>
          <button @click="open = false" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Default option -->
        <div class="px-2 pb-1">
          <button
            @click="select(null)"
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors"
            :class="!modelValue
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'"
          >
            <span class="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-sm shrink-0">🤖</span>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium">默认助手</div>
              <div class="text-[10px] text-zinc-400 truncate">通用 DeepSeek 助手，无特定角色</div>
            </div>
            <Check v-if="!modelValue" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
          </button>
        </div>

        <div class="border-t border-zinc-100 dark:border-zinc-800 mx-2" />

        <!-- Agent groups -->
        <div class="overflow-y-auto max-h-72 px-2 py-1.5 space-y-3">
          <div v-for="group in groupedAgents" :key="group.id">
            <div class="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 py-1">
              {{ group.label }}
            </div>
            <div class="space-y-0.5">
              <button
                v-for="agent in group.agents"
                :key="agent.id"
                @click="select(agent.id)"
                class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors"
                :class="modelValue === agent.id
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'"
              >
                <span class="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm shrink-0">{{ agent.emoji }}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">{{ agent.nameZh }}</div>
                  <div class="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{{ agent.description }}</div>
                </div>
                <Check v-if="modelValue === agent.id" class="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        <!-- Footer hint -->
        <div class="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800">
          <p class="text-[10px] text-zinc-400 text-center">Agent 角色绑定至当前会话，发送后不可更换</p>
        </div>
      </div>
    </Transition>
  </div>
</template>
