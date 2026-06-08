<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Plus, Loader, CheckCircle, XCircle } from '@lucide/vue'
import type { Plugin } from '@/stores/plugins'

const props = defineProps<{ mode: 'create' | 'edit'; plugin?: Plugin }>()
const emit  = defineEmits<{ save: [data: Omit<Plugin, 'id' | 'createdAt'>]; cancel: [] }>()

const displayName    = ref('')
const name           = ref('')
const description    = ref('')
const endpointUrl    = ref('')
const method         = ref<'GET' | 'POST'>('POST')
const headersText    = ref('{}')
const paramSchemaText = ref(`{
  "type": "object",
  "properties": {
    "input": {
      "type": "string",
      "description": "输入内容"
    }
  },
  "required": ["input"]
}`)

// Header rows for key-value editor
interface HeaderRow { key: string; value: string }
const headerRows = ref<HeaderRow[]>([{ key: '', value: '' }])

const testStatus  = ref<'idle' | 'testing' | 'ok' | 'error'>('idle')
const testResult  = ref('')

watch(() => props, () => {
  if (props.mode === 'edit' && props.plugin) {
    const p = props.plugin
    displayName.value     = p.displayName
    name.value            = p.name
    description.value     = p.description
    endpointUrl.value     = p.endpointUrl
    method.value          = p.method
    paramSchemaText.value = p.paramSchemaJson || paramSchemaText.value
    try {
      const h = JSON.parse(p.headersJson || '{}')
      headerRows.value = Object.entries(h).map(([k, v]) => ({ key: k, value: String(v) }))
      if (!headerRows.value.length) headerRows.value = [{ key: '', value: '' }]
    } catch { headerRows.value = [{ key: '', value: '' }] }
  }
}, { immediate: true, deep: true })

// Auto-generate snake_case name from displayName
watch(displayName, (v) => {
  if (props.mode === 'create') {
    name.value = v.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32)
  }
})

function addHeaderRow()           { headerRows.value.push({ key: '', value: '' }) }
function removeHeaderRow(i: number) { headerRows.value.splice(i, 1) }

function buildHeaders(): string {
  const obj: Record<string, string> = {}
  for (const r of headerRows.value) {
    if (r.key.trim()) obj[r.key.trim()] = r.value
  }
  return JSON.stringify(obj)
}

async function testPlugin() {
  testStatus.value = 'testing'
  testResult.value = ''
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...JSON.parse(buildHeaders()) }
    const res = await fetch(endpointUrl.value, {
      method: method.value,
      headers,
      body: method.value === 'POST' ? JSON.stringify({ test: true }) : undefined,
      signal: AbortSignal.timeout(8000)
    })
    testStatus.value = res.ok ? 'ok' : 'error'
    const body = await res.text()
    testResult.value = `HTTP ${res.status} — ${body.slice(0, 200)}`
  } catch (e: any) {
    testStatus.value = 'error'
    testResult.value = e?.message ?? '请求失败'
  }
}

function handleSave() {
  if (!name.value.trim() || !endpointUrl.value.trim()) return
  emit('save', {
    displayName:    displayName.value.trim(),
    name:           name.value.trim(),
    description:    description.value.trim(),
    endpointUrl:    endpointUrl.value.trim(),
    method:         method.value,
    headersJson:    buildHeaders(),
    paramSchemaJson: paramSchemaText.value.trim(),
    enabled:        1
  })
}

const inputCls = 'w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="emit('cancel')">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('cancel')" />

    <div class="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[90vh] flex flex-col">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <h2 class="font-semibold text-gray-900 dark:text-gray-100">{{ mode === 'edit' ? '编辑插件' : '添加插件' }}</h2>
        <button @click="emit('cancel')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg transition-colors">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form (scrollable) -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        <!-- Display name + tool name -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">插件名称 <span class="text-red-400">*</span></label>
            <input v-model="displayName" type="text" placeholder="搜索 Notion" :class="inputCls" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">工具函数名
              <span class="text-xs text-gray-400 font-normal">DeepSeek 调用时用</span>
            </label>
            <input v-model="name" type="text" placeholder="search_notion" :class="inputCls" class="font-mono" />
          </div>
        </div>

        <!-- Description -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">描述
            <span class="text-xs text-gray-400 font-normal">告诉 DeepSeek 什么时候调用</span>
          </label>
          <input v-model="description" type="text" placeholder="在 Notion 中搜索相关页面和内容" :class="inputCls" />
        </div>

        <!-- URL + Method -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">请求地址 <span class="text-red-400">*</span></label>
          <div class="flex gap-2">
            <select v-model="method" class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-24">
              <option>POST</option>
              <option>GET</option>
            </select>
            <input v-model="endpointUrl" type="url" placeholder="https://api.example.com/search" class="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
          </div>
        </div>

        <!-- Headers -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">请求 Headers</label>
            <button @click="addHeaderRow" class="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1">
              <Plus class="w-3 h-3" />添加
            </button>
          </div>
          <div class="space-y-1.5">
            <div v-for="(row, i) in headerRows" :key="i" class="flex gap-2 items-center">
              <input v-model="row.key"   type="text" placeholder="Authorization" class="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input v-model="row.value" type="text" placeholder="Bearer token..." class="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button @click="removeHeaderRow(i)" class="text-gray-400 hover:text-red-500 transition-colors shrink-0"><X class="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        <!-- Param schema -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">参数 Schema
            <span class="text-xs text-gray-400 font-normal">OpenAI function.parameters 格式</span>
          </label>
          <textarea v-model="paramSchemaText" rows="7"
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed" />
        </div>

        <!-- Test -->
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <button @click="testPlugin" :disabled="!endpointUrl || testStatus === 'testing'"
              class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors disabled:opacity-50">
              <Loader v-if="testStatus === 'testing'" class="w-3 h-3 animate-spin" />
              <CheckCircle v-else-if="testStatus === 'ok'"    class="w-3 h-3 text-emerald-500" />
              <XCircle     v-else-if="testStatus === 'error'" class="w-3 h-3 text-red-500" />
              测试请求
            </button>
            <span v-if="testResult" class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ testResult }}</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <button @click="emit('cancel')" class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">取消</button>
        <button @click="handleSave" :disabled="!name.trim() || !endpointUrl.trim()"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50">
          <Plus class="w-4 h-4" />{{ mode === 'edit' ? '保存修改' : '添加插件' }}
        </button>
      </div>
    </div>
  </div>
</template>
