<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import {
  MessageSquare, FileText, Type, Zap, Key, Sun, Moon,
  CheckCircle, XCircle, Loader, Loader2, Download, Upload,
  FolderOpen, FileJson, BookOpen, AlertCircle, Globe, Bot, Sparkles, Pencil, Trash2, Plus,
  Puzzle, ToggleLeft, ToggleRight, User, Brain, Star, Search, X, ChevronDown,
  Bookmark, Archive, ArchiveRestore, Dna, Cloud, RefreshCw
} from '@lucide/vue'
import SkillDialog from '@/components/skills/SkillDialog.vue'
import PluginDialog from '@/components/plugins/PluginDialog.vue'
import { useSkillsStore, type Skill } from '@/stores/skills'
import { usePluginsStore, type Plugin } from '@/stores/plugins'
import { useUIStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { useMemoriesStore, MEMORY_CATEGORIES, type Memory } from '@/stores/memories'
import ActivityChart from '@/components/ActivityChart.vue'

const uiStore  = useUIStore()
const settings = useSettingsStore()
const webSearchExpanded = ref(false)
const visionExpanded    = ref(false)
const memosExpanded     = ref(false)
const picbedExpanded    = ref(false)
const skillsStore   = useSkillsStore()
const pluginsStore  = usePluginsStore()
const memoriesStore = useMemoriesStore()
const chat     = useChatStore()
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')

// ── Memory management ─────────────────────────────────────────────────────────
const memSearchQuery   = ref('')
const memEditingId     = ref<string | null>(null)
const memEditContent   = ref('')
const memSearchResults = ref<Memory[]>([])
const memSearching     = ref(false)
const newMemContent    = ref('')
const newMemCategory   = ref<'user'|'preference'|'project'|'general'>('general')
const newMemImportance = ref(5)
const addingMem        = ref(false)

async function searchMemories() {
  if (!memSearchQuery.value.trim()) { memSearchResults.value = []; return }
  memSearching.value = true
  memSearchResults.value = await memoriesStore.search(memSearchQuery.value)
  memSearching.value = false
}

async function addMemory() {
  if (!newMemContent.value.trim()) return
  addingMem.value = true
  await memoriesStore.create({ content: newMemContent.value.trim(), category: newMemCategory.value, importance: newMemImportance.value })
  newMemContent.value = ''
  newMemImportance.value = 5
  addingMem.value = false
}

function startEditMem(m: Memory) { memEditingId.value = m.id; memEditContent.value = m.content }
async function saveEditMem(id: string) {
  if (memEditContent.value.trim()) await memoriesStore.update(id, { content: memEditContent.value.trim() })
  memEditingId.value = null
}
async function deleteMem(id: string) {
  await memoriesStore.remove(id)
  memSearchResults.value = memSearchResults.value.filter(m => m.id !== id)
}

const displayedMemories = computed(() =>
  memSearchQuery.value.trim() ? memSearchResults.value : memoriesStore.memories
)

async function consolidateMemories() {
  const result = await memoriesStore.consolidate()
  if (result) {
    showStatus('success', `🧬 整理完成：保留 ${result.kept} 条，删除 ${result.deleted} 条`)
  } else {
    showStatus('error', '整理失败，请检查 API Key 是否配置')
  }
}

// ── Plugin management ─────────────────────────────────────────────────────────
const pluginDialogMode    = ref<'create' | 'edit'>('create')
const pluginDialogVisible = ref(false)
const editingPlugin       = ref<Plugin | undefined>(undefined)

function openCreatePlugin()         { pluginDialogMode.value = 'create'; editingPlugin.value = undefined; pluginDialogVisible.value = true }
function openEditPlugin(p: Plugin)  { pluginDialogMode.value = 'edit';   editingPlugin.value = p;         pluginDialogVisible.value = true }

async function savePlugin(data: any) {
  if (pluginDialogMode.value === 'edit' && editingPlugin.value) {
    await pluginsStore.update(editingPlugin.value.id, data)
  } else {
    await pluginsStore.create(data)
  }
  pluginDialogVisible.value = false
}

async function deletePlugin(id: string) {
  if (confirm('确定删除这个插件？删除后 DeepSeek 将无法调用它。')) await pluginsStore.remove(id)
}

// ── Skills management ─────────────────────────────────────────────────────────
const skillDialogMode    = ref<'create' | 'edit'>('create')
const skillDialogVisible = ref(false)
const editingSkill       = ref<Skill | undefined>(undefined)

function openCreateSkill()      { skillDialogMode.value = 'create'; editingSkill.value = undefined; skillDialogVisible.value = true }
function openEditSkill(s: Skill){ skillDialogMode.value = 'edit';   editingSkill.value = s;         skillDialogVisible.value = true }

async function saveSkill(data: any) {
  if (skillDialogMode.value === 'edit' && editingSkill.value) {
    await skillsStore.update(editingSkill.value.id, data)
  } else {
    await skillsStore.create({ ...data, toolSequence: null })
  }
  skillDialogVisible.value = false
}

async function deleteSkill(id: string) {
  if (confirm('确定删除这个技能？')) await skillsStore.remove(id)
}

function kwList(s: Skill): string[] {
  try { return JSON.parse(s.triggerKeywords) } catch { return [] }
}

const SOUL_TEMPLATE = `# Agent 身份

你是一位专注知识管理的 AI 助手，帮助用户梳理想法、记录知识、深度分析。

## 行为风格
- 回答简洁有力，不废话
- 复杂问题先拆解再回答
- 不确定时主动澄清，不乱猜

## 用户信息
- 姓名：（填写你的名字）
- 职业：（填写你的职业）
- 关注领域：（填写你关注的领域）

## 特别说明
- 优先引用用户已有的笔记内容作为上下文
- 今天的日期会自动注入，不必重复告知`

function applySoulTemplate() {
  if (!settings.soulContent.trim()) {
    settings.soulContent = SOUL_TEMPLATE
    settings.save()
  }
}

async function saveSoul() {
  await settings.save()
}

// Stats
const statsData = ref<{
  noteCount: number; wordCount: number; convCount: number; tokenCount: number
  days: Array<{ label: string; notes: number; messages: number }>
} | null>(null)

// Operation feedback
const opStatus = ref<{ type: 'success' | 'error'; msg: string } | null>(null)
const opLoading = ref<string | null>(null)  // which operation is running

function showStatus(type: 'success' | 'error', msg: string) {
  opStatus.value = { type, msg }
  setTimeout(() => { opStatus.value = null }, 4000)
}

async function handleSave(): Promise<void> {
  saveStatus.value = 'saving'
  await settings.save()
  saveStatus.value = 'saved'
  setTimeout(() => { saveStatus.value = 'idle' }, 2000)
}

async function loadStats() {
  try {
    statsData.value = await window.api.db.stats.get()
  } catch { /* stats not critical */ }
}

onMounted(async () => {
  await settings.load()
  await skillsStore.load()
  await pluginsStore.load()
  await memoriesStore.load()
  if (chat.conversations.length === 0) await chat.loadConversations()
  await loadStats()
})

const statCards = computed(() => [
  {
    label: 'AI 对话', icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20',
    value: fmt(statsData.value?.convCount ?? chat.conversations.length)
  },
  {
    label: '笔记数量', icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    value: fmt(statsData.value?.noteCount ?? 0)
  },
  {
    label: '累计字数', icon: Type, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20',
    value: fmtLarge(statsData.value?.wordCount ?? 0)
  },
  {
    label: 'Token 用量', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20',
    value: fmtLarge(statsData.value?.tokenCount ?? 0)
  }
])

// Token cost estimate (deepseek-v4-flash: ~$0.28/1M output tokens)
const costEstimate = computed(() => {
  if (!statsData.value) return null
  const cost = (statsData.value.tokenCount / 1_000_000) * 0.28
  return cost < 0.01 ? '< $0.01' : `~$${cost.toFixed(2)}`
})

function fmt(n: number): string { return n.toLocaleString('zh-CN') }
function fmtLarge(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  return n.toLocaleString('zh-CN')
}

// ── Export ────────────────────────────────────────────────────────────────────
async function exportJson() {
  opLoading.value = 'exportJson'
  try {
    const r = await window.api.db.export.json()
    if (r.success) showStatus('success', `已导出到 ${r.filePath}`)
    else showStatus('error', '导出已取消')
  } catch (e: any) { showStatus('error', `导出失败：${e.message}`) }
  opLoading.value = null
}

async function exportMarkdown() {
  opLoading.value = 'exportMd'
  try {
    const r = await window.api.db.export.markdown()
    if (r.success) showStatus('success', `已导出 ${r.count} 篇笔记到 ${r.dir}`)
    else showStatus('error', '导出已取消')
  } catch (e: any) { showStatus('error', `导出失败：${e.message}`) }
  opLoading.value = null
}

// ── Import ────────────────────────────────────────────────────────────────────
async function importJson() {
  opLoading.value = 'importJson'
  try {
    const r = await window.api.db.import.json()
    if (r.success) {
      showStatus('success', `已导入 ${r.count} 篇笔记`)
      await loadStats()
    } else showStatus('error', '导入已取消')
  } catch (e: any) { showStatus('error', `导入失败：${e.message}`) }
  opLoading.value = null
}

async function importMarkdown() {
  opLoading.value = 'importMd'
  try {
    const r = await window.api.db.import.markdown()
    if (r.success) {
      showStatus('success', `已导入 ${r.count} 篇 Markdown 笔记`)
      await loadStats()
    } else showStatus('error', '导入已取消')
  } catch (e: any) { showStatus('error', `导入失败：${e.message}`) }
  opLoading.value = null
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
    <div class="max-w-2xl mx-auto p-6 space-y-6">

      <!-- ── Status toast ── -->
      <Transition name="slide-down">
        <div
          v-if="opStatus"
          class="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium"
          :class="opStatus.type === 'success'
            ? 'bg-emerald-500 text-white'
            : 'bg-red-500 text-white'"
        >
          <CheckCircle v-if="opStatus.type === 'success'" class="w-4 h-4" />
          <AlertCircle v-else class="w-4 h-4" />
          {{ opStatus.msg }}
        </div>
      </Transition>

      <!-- ── Dashboard stats ── -->
      <section>
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">数据概览</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="s in statCards"
            :key="s.label"
            class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-col gap-2"
          >
            <div class="w-8 h-8 rounded-xl flex items-center justify-center" :class="s.bg">
              <component :is="s.icon" class="w-4 h-4" :class="s.color" />
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ s.value }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ s.label }}</div>
          </div>
        </div>

        <!-- Token cost hint -->
        <div v-if="costEstimate" class="mt-2 text-xs text-gray-400 dark:text-gray-500 text-right">
          预估消费 {{ costEstimate }}（基于 flash 定价）
        </div>
      </section>

      <!-- ── 7-day activity chart ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">近 7 日活跃</h2>
        <div v-if="statsData && statsData.days.some(d => d.notes > 0 || d.messages > 0)">
          <ActivityChart :data="statsData.days" :height="90" />
        </div>
        <div v-else class="h-20 flex items-center justify-center text-sm text-gray-400">
          暂无活跃数据
        </div>
      </section>

      <!-- ── API 配置 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <Key class="w-4 h-4 text-blue-500" />
          <h2 class="text-base font-semibold">API 配置</h2>
        </div>

        <div class="space-y-4">
          <!-- API Key -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">API Key</label>
            <div class="flex gap-2">
              <input
                v-model="settings.apiKey"
                type="password"
                placeholder="sk-xxxxxxxxxxxxxxxx"
                class="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                @click="settings.testApi()"
                :disabled="!settings.apiKey || settings.isTesting"
                class="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <Loader v-if="settings.isTesting" class="w-3.5 h-3.5 animate-spin" />
                <CheckCircle v-else-if="settings.testResult === 'success'" class="w-3.5 h-3.5 text-emerald-500" />
                <XCircle v-else-if="settings.testResult === 'fail'" class="w-3.5 h-3.5 text-red-500" />
                测试连接
              </button>
            </div>
            <p v-if="settings.testResult === 'success'" class="text-xs text-emerald-500 mt-1.5">✓ 连接成功</p>
            <p v-if="settings.testResult === 'fail'" class="text-xs text-red-500 mt-1.5">✗ 连接失败，请检查 API Key 和网络</p>
          </div>

          <!-- Model -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">模型选择</label>
            <select
              v-model="settings.model"
              class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="deepseek-v4-flash">deepseek-v4-flash（通用对话，速度快）</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro（深度推理，适合复杂分析）</option>
            </select>
          </div>

          <!-- Max Tokens -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
              最大输出 Token
              <span class="text-xs text-gray-400 font-normal ml-1">（flash/pro 上限 384K，默认 8192 约 2 万字）</span>
            </label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="settings.maxTokens"
                type="range" min="2048" max="65536" step="2048"
                class="flex-1 accent-blue-500"
                @change="settings.save()"
              />
              <span class="text-sm font-mono w-16 text-right text-gray-600 dark:text-gray-400">{{ settings.maxTokens.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between text-xs text-gray-400 mt-0.5 px-0.5">
              <span>2K</span><span>8K（推荐）</span><span>32K</span><span>64K</span>
            </div>
          </div>

          <!-- Temperature -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
              Temperature（创意度）
              <span class="text-xs text-gray-400 font-normal ml-1">0 = 精确/确定性，1 = 均衡，2 = 发散/创意</span>
            </label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="settings.temperature"
                type="range" min="0" max="2" step="0.1"
                class="flex-1 accent-blue-500"
                @change="settings.save()"
              />
              <span class="text-sm font-mono w-8 text-right text-gray-600 dark:text-gray-400">{{ settings.temperature.toFixed(1) }}</span>
            </div>
            <div class="flex justify-between text-xs text-gray-400 mt-0.5 px-0.5">
              <span>精确 0</span><span>均衡 1（推荐）</span><span>创意 2</span>
            </div>
          </div>

          <!-- Base URL -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">API 地址</label>
            <input
              v-model="settings.baseUrl"
              type="text"
              class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-gray-600 dark:text-gray-400"
            />
          </div>

          <button
            @click="handleSave"
            :disabled="saveStatus === 'saving'"
            class="w-full rounded-xl py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2"
            :class="saveStatus === 'saved'
              ? 'bg-emerald-500 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70'"
          >
            <Loader v-if="saveStatus === 'saving'" class="w-4 h-4 animate-spin" />
            <CheckCircle v-else-if="saveStatus === 'saved'" class="w-4 h-4" />
            {{ saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : '保存配置' }}
          </button>
        </div>
      </section>

      <!-- ── 内置插件 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <Puzzle class="w-4 h-4 text-blue-500" />
            <h2 class="text-base font-semibold">内置插件</h2>
          </div>
          <span class="text-xs text-gray-400 dark:text-gray-500">{{ [settings.webSearchActive, settings.visionActive, settings.memosActive, settings.picbedActive].filter(Boolean).length }}/4 已激活</span>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          官方内置的能力扩展，可独立开关，不影响其他功能。
        </p>

        <div class="space-y-3">
          <!-- ── 联网搜索 ── -->
          <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="text-xl shrink-0">🌐</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">联网搜索</span>
                  <span class="text-xs text-gray-400">Tavily</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    :class="settings.webSearchActive
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                      : settings.tavilyEnabled
                        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'"
                  >
                    {{ settings.webSearchActive ? '已激活' : settings.tavilyEnabled ? '已配置·已关闭' : '未配置' }}
                  </span>
                </div>
                <p class="text-[11px] text-gray-400 mt-0.5">实时搜索互联网，获取最新信息与新闻</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  @click="settings.webSearchEnabled = !settings.webSearchEnabled; settings.save()"
                  :disabled="!settings.tavilyEnabled"
                  class="transition-colors disabled:opacity-40"
                  :class="settings.webSearchActive ? 'text-emerald-500 hover:text-emerald-600' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500'"
                  :title="settings.tavilyEnabled ? (settings.webSearchEnabled ? '点击关闭' : '点击开启') : '请先配置 API Key'"
                >
                  <ToggleRight v-if="settings.webSearchActive" class="w-6 h-6" />
                  <ToggleLeft  v-else                          class="w-6 h-6" />
                </button>
                <button
                  @click="webSearchExpanded = !webSearchExpanded"
                  class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ChevronDown class="w-4 h-4 transition-transform" :class="webSearchExpanded ? 'rotate-180' : ''" />
                </button>
              </div>
            </div>
            <!-- Expanded config -->
            <div v-if="webSearchExpanded" class="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 bg-gray-50 dark:bg-gray-800/50">
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Tavily API Key</label>
                <input
                  v-model="settings.tavilyKey"
                  type="password"
                  placeholder="tvly-xxxxxxxxxxxxxxxx"
                  class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  @blur="settings.save()"
                />
                <p class="text-[11px] text-gray-400 mt-1">免费额度 1000 次/月</p>
              </div>
            </div>
          </div>

          <!-- ── 图像识别 ── -->
          <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="text-xl shrink-0">👁️</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">图像识别</span>
                  <span class="text-xs text-gray-400">Xiaomi MiMo</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    :class="settings.visionActive
                      ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                      : settings.visionEnabled
                        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'"
                  >
                    {{ settings.visionActive ? '已激活' : settings.visionEnabled ? '已配置·已关闭' : '未配置' }}
                  </span>
                </div>
                <p class="text-[11px] text-gray-400 mt-0.5">上传图片时由 AI 视觉模型解读，未配置时回退本地 OCR</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  @click="settings.visionPluginEnabled = !settings.visionPluginEnabled; settings.save()"
                  :disabled="!settings.visionEnabled"
                  class="transition-colors disabled:opacity-40"
                  :class="settings.visionActive ? 'text-violet-500 hover:text-violet-600' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500'"
                  :title="settings.visionEnabled ? (settings.visionPluginEnabled ? '点击关闭' : '点击开启') : '请先配置 API Key'"
                >
                  <ToggleRight v-if="settings.visionActive" class="w-6 h-6" />
                  <ToggleLeft  v-else                       class="w-6 h-6" />
                </button>
                <button
                  @click="visionExpanded = !visionExpanded"
                  class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ChevronDown class="w-4 h-4 transition-transform" :class="visionExpanded ? 'rotate-180' : ''" />
                </button>
              </div>
            </div>
            <!-- Expanded config -->
            <div v-if="visionExpanded" class="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 bg-gray-50 dark:bg-gray-800/50">
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">MiMo API Key</label>
                <div class="flex gap-2">
                  <input
                    v-model="settings.visionApiKey"
                    type="password"
                    placeholder="输入 MiMo API Key…"
                    class="flex-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    @blur="settings.save()"
                  />
                  <button
                    @click="settings.testVisionApi()"
                    :disabled="!settings.visionApiKey || settings.isTestingVision"
                    class="flex items-center gap-1 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 border border-gray-200 dark:border-gray-500 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <Loader v-if="settings.isTestingVision" class="w-3 h-3 animate-spin" />
                    <CheckCircle v-else-if="settings.visionTestResult === 'success'" class="w-3 h-3 text-emerald-500" />
                    <XCircle    v-else-if="settings.visionTestResult === 'fail'"    class="w-3 h-3 text-red-500" />
                    测试
                  </button>
                </div>
                <p v-if="settings.visionTestResult === 'success'" class="text-[11px] text-emerald-500 mt-1">✓ 连接成功</p>
                <p v-if="settings.visionTestResult === 'fail'"    class="text-[11px] text-red-500 mt-1">✗ 连接失败{{ settings.visionTestError ? `（${settings.visionTestError}）` : '' }}</p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">模型</label>
                  <select v-model="settings.visionModel" class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs focus:outline-none" @change="settings.save()">
                    <option value="mimo-v2.5">mimo-v2.5（推荐）</option>
                    <option value="mimo-v2-omni">mimo-v2-omni（全能）</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">API 地址</label>
                  <input v-model="settings.visionBaseUrl" type="text" class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none" @blur="settings.save()" />
                </div>
              </div>
            </div>
          </div>

          <!-- ── Memos 同步 ── -->
          <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="text-xl shrink-0">🔄</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">Memos 同步</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    :class="settings.memosActive
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                      : settings.memosConfigured
                        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'"
                  >{{ settings.memosActive ? '已激活' : settings.memosConfigured ? '已配置·已关闭' : '未配置' }}</span>
                </div>
                <p class="text-[11px] text-gray-400 mt-0.5">笔记与 Memos 实例双向同步，私有图片走 Memos 存储</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  @click="settings.memosPluginEnabled = !settings.memosPluginEnabled; settings.save()"
                  :disabled="!settings.memosConfigured"
                  class="transition-colors disabled:opacity-40"
                  :class="settings.memosActive ? 'text-emerald-500 hover:text-emerald-600' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500'"
                  :title="settings.memosConfigured ? (settings.memosPluginEnabled ? '点击关闭' : '点击开启') : '请先配置 Memos'"
                >
                  <ToggleRight v-if="settings.memosActive" class="w-6 h-6" />
                  <ToggleLeft  v-else                       class="w-6 h-6" />
                </button>
                <button
                  @click="memosExpanded = !memosExpanded"
                  class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ChevronDown class="w-4 h-4 transition-transform" :class="memosExpanded ? 'rotate-180' : ''" />
                </button>
              </div>
            </div>

            <!-- Expanded config -->
            <div v-if="memosExpanded" class="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 bg-gray-50 dark:bg-gray-800/50">
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Memos 服务器地址</label>
                <input
                  v-model="settings.memosUrl"
                  type="url"
                  placeholder="https://memos.example.com"
                  class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  @blur="settings.save()"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">API Token</label>
                <input
                  v-model="settings.memosToken"
                  type="password"
                  placeholder="在 Memos → 设置 → 开发者 中复制"
                  class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  @blur="settings.save()"
                />
              </div>
              <!-- Test connection -->
              <div class="flex items-center gap-2">
                <button
                  @click="settings.testMemosConnection()"
                  :disabled="settings.isTestingMemos || !settings.memosUrl || !settings.memosToken"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-40"
                >
                  <span v-if="settings.isTestingMemos" class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  {{ settings.isTestingMemos ? '连接中…' : '测试连接' }}
                </button>
                <span v-if="settings.memosTestResult === 'success'" class="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle class="w-3.5 h-3.5" /> {{ settings.memosTestUser }}
                </span>
                <span v-else-if="settings.memosTestResult === 'fail'" class="text-xs text-red-500 flex items-center gap-1">
                  <XCircle class="w-3.5 h-3.5" /> {{ settings.memosTestError }}
                </span>
              </div>
              <!-- Sync interval -->
              <div class="flex items-center gap-3">
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">自动同步</label>
                <select
                  v-model="settings.memosSyncInterval"
                  class="flex-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  @change="settings.save()"
                >
                  <option :value="0">手动</option>
                  <option :value="5">每 5 分钟</option>
                  <option :value="15">每 15 分钟</option>
                  <option :value="30">每 30 分钟</option>
                  <option :value="60">每小时</option>
                </select>
                <button
                  @click="settings.runMemosSync()"
                  :disabled="settings.memosSyncing || !settings.memosConfigured"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-40 shrink-0"
                >
                  <span v-if="settings.memosSyncing" class="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {{ settings.memosSyncing ? '同步中…' : '立即同步' }}
                </button>
              </div>
              <!-- Last sync result -->
              <div v-if="settings.memosSyncResult" class="text-xs rounded-lg px-3 py-2"
                :class="settings.memosSyncResult.ok
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'"
              >
                <span v-if="settings.memosSyncResult.ok">
                  同步完成 · 新增 {{ settings.memosSyncResult.added }} · 更新 {{ settings.memosSyncResult.updated }} · 归档 {{ settings.memosSyncResult.deleted }}
                </span>
                <span v-else>同步失败：{{ settings.memosSyncResult.errors[0] }}</span>
              </div>
            </div>
          </div>

          <!-- ── 图床 ── -->
          <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="text-xl shrink-0">🖼️</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">图床</span>
                  <span class="text-xs text-gray-400">Cloudflare R2</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    :class="settings.picbedActive
                      ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                      : settings.picbedConfigured
                        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'"
                  >{{ settings.picbedActive ? '已激活' : settings.picbedConfigured ? '已配置·已关闭' : '未配置' }}</span>
                </div>
                <p class="text-[11px] text-gray-400 mt-0.5">公开笔记图片 CDN 存储，复制到微信公众号时图片正常显示</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  @click="settings.picbedPluginEnabled = !settings.picbedPluginEnabled; settings.save()"
                  :disabled="!settings.picbedConfigured"
                  class="transition-colors disabled:opacity-40"
                  :class="settings.picbedActive ? 'text-orange-500 hover:text-orange-600' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500'"
                  :title="settings.picbedConfigured ? (settings.picbedPluginEnabled ? '点击关闭' : '点击开启') : '请先配置图床'"
                >
                  <ToggleRight v-if="settings.picbedActive" class="w-6 h-6" />
                  <ToggleLeft  v-else                        class="w-6 h-6" />
                </button>
                <button
                  @click="picbedExpanded = !picbedExpanded"
                  class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ChevronDown class="w-4 h-4 transition-transform" :class="picbedExpanded ? 'rotate-180' : ''" />
                </button>
              </div>
            </div>
            <div v-if="picbedExpanded" class="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 bg-gray-50 dark:bg-gray-800/50">
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">图床地址</label>
                <input
                  v-model="settings.picbedUrl"
                  type="url"
                  placeholder="https://img.example.com"
                  class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  @blur="settings.save()"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">管理密码</label>
                <input
                  v-model="settings.picbedToken"
                  type="password"
                  placeholder="图床 Worker 管理密码"
                  class="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  @blur="settings.save()"
                />
                <p class="text-[11px] text-gray-400 mt-1">使用 ACKS 图床项目搭建，或自建 Cloudflare Worker + R2</p>
              </div>
              <div class="flex items-center gap-2">
                <button
                  @click="settings.testPicbedConnection()"
                  :disabled="settings.isTestingPicbed || !settings.picbedUrl || !settings.picbedToken"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-40"
                >
                  <span v-if="settings.isTestingPicbed" class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  {{ settings.isTestingPicbed ? '测试中…' : '测试连接' }}
                </button>
                <span v-if="settings.picbedTestResult === 'success'" class="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle class="w-3.5 h-3.5" /> 连接成功
                </span>
                <span v-else-if="settings.picbedTestResult === 'fail'" class="text-xs text-red-500 flex items-center gap-1">
                  <XCircle class="w-3.5 h-3.5" /> {{ settings.picbedTestError }}
                </span>
              </div>
            </div>
          </div>

          <!-- ── Agent 增强模式 ── -->
          <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="text-xl shrink-0">🔓</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">Agent 增强模式</span>
                  <span v-if="settings.agentPowerMode" class="text-[10px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 rounded-full font-medium">已开启</span>
                </div>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  开启后 Agent 可读取本地文件（read_file）、列出目录（list_dir），适合高级用户
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" class="sr-only peer" v-model="settings.agentPowerMode" @change="settings.save()" />
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>
            <div v-if="settings.agentPowerMode" class="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5 bg-orange-50 dark:bg-orange-900/10">
              <p class="text-[11px] text-orange-600 dark:text-orange-400">
                ⚠️ 增强模式下 Agent 可访问本地文件系统，请勿在不受信任的对话中启用。系统敏感路径（.ssh、密钥、凭证等）已被屏蔽。
              </p>
            </div>
          </div>

          <!-- Future plugins placeholder -->
          <div class="border border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400 dark:text-gray-600">
            <Plus class="w-4 h-4 shrink-0" />
            <div class="text-xs">
              <span class="font-medium">即将支持第三方插件</span>
              <span class="ml-1">· 通过 .dnplugin 文件安装，扩展更多 Agent 能力</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ── 用户信息 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <User class="w-4 h-4 text-blue-500" />
            <h2 class="text-base font-semibold">用户信息</h2>
          </div>
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium"
            :class="settings.userEnabled
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
          >{{ settings.userEnabled ? '已配置' : '未填写' }}</span>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          告诉 AI 你是谁，让每次对话都能从你的视角出发，而不是一个陌生人。
        </p>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">姓名 / 昵称</label>
              <input
                v-model="settings.userName"
                type="text"
                placeholder="你的名字"
                class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                @blur="settings.save()"
              />
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">职业 / 身份</label>
              <input
                v-model="settings.userRole"
                type="text"
                placeholder="如：产品设计师、工程师…"
                class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                @blur="settings.save()"
              />
            </div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">背景信息</label>
            <textarea
              v-model="settings.userContext"
              rows="3"
              placeholder="关注领域、工作背景、偏好风格……AI 会根据这些信息调整回答方式"
              class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              @blur="settings.save()"
            />
          </div>
        </div>
      </section>

      <!-- ── Agent 灵魂 (SOUL) ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <Bot class="w-4 h-4 text-purple-500" />
            <h2 class="text-base font-semibold">Agent 灵魂</h2>
          </div>
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium"
            :class="settings.soulEnabled
              ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
          >{{ settings.soulEnabled ? '已自定义' : '默认提示词' }}</span>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          定义 AI 助手的身份、风格与行为准则（Markdown 格式），内容会作为系统提示注入到每次对话开头。
        </p>

        <div class="space-y-3">
          <textarea
            v-model="settings.soulContent"
            rows="12"
            placeholder="用 Markdown 描述你的 AI 助手身份……&#10;&#10;例如：&#10;你是一位专注技术研究的 AI 助手，回答简洁精准……"
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600"
            @blur="saveSoul()"
          />
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-400 dark:text-gray-500">
              {{ settings.soulContent.length }} 字符
              <span v-if="settings.soulEnabled">· 已注入系统提示</span>
            </span>
            <div class="flex gap-2">
              <button
                v-if="!settings.soulContent.trim()"
                @click="applySoulTemplate()"
                class="text-xs px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800 transition-colors"
              >使用默认模板</button>
              <button
                v-if="settings.soulEnabled"
                @click="settings.soulContent = ''; saveSoul()"
                class="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-colors"
              >清空</button>
            </div>
          </div>

          <!-- Hint box -->
          <div class="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 text-xs text-purple-700 dark:text-purple-400 space-y-1">
            <p class="font-medium">提示</p>
            <p>• 可定义 AI 的名字、语气、专业领域、回答风格</p>
            <p>• 支持 Markdown 标题结构，便于分区描述不同方面</p>
            <p>• 当前日期会自动注入，无需手写</p>
            <p>• 留空则使用内置默认提示词</p>
          </div>
        </div>
      </section>

      <!-- ── 记忆管理 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <Brain class="w-4 h-4 text-rose-500" />
            <h2 class="text-base font-semibold">记忆管理</h2>
            <span v-if="memoriesStore.memories.length" class="text-xs px-2 py-0.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-full">{{ memoriesStore.memories.length }}</span>
          </div>
          <!-- Consolidate button -->
          <button
            @click="consolidateMemories"
            :disabled="memoriesStore.consolidating || memoriesStore.memories.length < 3"
            class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 font-medium"
            :class="memoriesStore.consolidating
              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-500'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400'"
            title="让 AI 合并相似记忆、删除过时内容"
          >
            <Loader v-if="memoriesStore.consolidating" class="w-3.5 h-3.5 animate-spin" />
            <Dna v-else class="w-3.5 h-3.5" />
            整理记忆
          </button>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Agent 会在对话中自动保存重要信息，并在后续对话中自动加载。📌 固定的记忆始终出现在上下文中。
        </p>

        <!-- Add memory -->
        <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-4 space-y-2">
          <div class="flex gap-2">
            <input
              v-model="newMemContent"
              type="text"
              placeholder="手动添加一条记忆…"
              class="flex-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
              @keydown.enter="addMemory"
            />
            <button
              @click="addMemory"
              :disabled="!newMemContent.trim() || addingMem"
              class="flex items-center gap-1 text-xs px-3 py-1.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
            >
              <Plus class="w-3.5 h-3.5" />添加
            </button>
          </div>
          <div class="flex items-center gap-2">
            <select
              v-model="newMemCategory"
              class="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 focus:outline-none"
            >
              <option v-for="c in MEMORY_CATEGORIES" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
            <span class="text-xs text-gray-400">重要性</span>
            <input v-model.number="newMemImportance" type="range" min="1" max="10" step="1" class="w-20 accent-rose-500" />
            <span class="text-xs font-mono text-gray-500 w-4">{{ newMemImportance }}</span>
          </div>
        </div>

        <!-- Search -->
        <div class="relative mb-3">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            v-model="memSearchQuery"
            type="text"
            placeholder="搜索记忆…"
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            @input="searchMemories"
          />
          <button v-if="memSearchQuery" @click="memSearchQuery = ''; memSearchResults = []" class="absolute right-3 top-1/2 -translate-y-1/2">
            <X class="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <!-- Empty state -->
        <div v-if="!displayedMemories.length" class="text-center py-8 text-gray-400 dark:text-gray-600">
          <Brain class="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p class="text-sm">暂无记忆。在对话中 Agent 会自动保存重要信息，或在上方手动添加。</p>
        </div>

        <!-- Memory list -->
        <div v-else class="space-y-1.5 max-h-72 overflow-y-auto">
          <div
            v-for="mem in displayedMemories"
            :key="mem.id"
            class="group flex items-start gap-2.5 rounded-xl p-2.5 border transition-colors"
            :class="mem.isPinned
              ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700'
              : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-rose-200 dark:hover:border-rose-700'"
          >
            <!-- Category dot / pin indicator -->
            <span
              class="mt-1 w-2 h-2 rounded-full shrink-0"
              :class="{
                'bg-blue-400':   mem.category === 'user',
                'bg-violet-400': mem.category === 'preference',
                'bg-emerald-400':mem.category === 'project',
                'bg-zinc-400':   mem.category === 'general'
              }"
            />
            <div class="flex-1 min-w-0">
              <!-- View mode -->
              <template v-if="memEditingId !== mem.id">
                <p class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{{ mem.content }}</p>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span class="text-[10px] text-gray-400">
                    {{ MEMORY_CATEGORIES.find(c => c.id === mem.category)?.label }}
                  </span>
                  <span class="flex items-center gap-0.5 text-[10px] text-amber-500">
                    <Star class="w-2.5 h-2.5 fill-current" />{{ mem.importance }}
                  </span>
                  <span v-if="mem.recallCount > 0" class="text-[10px] text-gray-400">
                    召回 {{ mem.recallCount }} 次
                  </span>
                  <span v-if="mem.isPinned" class="text-[10px] text-amber-600 dark:text-amber-400 font-medium">📌 固定</span>
                </div>
              </template>
              <!-- Edit mode -->
              <template v-else>
                <input
                  v-model="memEditContent"
                  type="text"
                  class="w-full text-xs bg-white dark:bg-gray-700 border border-rose-300 rounded-lg px-2 py-1 focus:outline-none"
                  @keydown.enter="saveEditMem(mem.id)"
                  @keydown.esc="memEditingId = null"
                />
                <div class="flex gap-1 mt-1">
                  <button @click="saveEditMem(mem.id)" class="text-[10px] px-2 py-0.5 bg-rose-500 text-white rounded-lg">保存</button>
                  <button @click="memEditingId = null" class="text-[10px] px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded-lg">取消</button>
                </div>
              </template>
            </div>
            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <!-- Pin toggle -->
              <button
                @click="memoriesStore.pin(mem.id)"
                class="p-1 rounded-lg transition-colors"
                :class="mem.isPinned
                  ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                  : 'text-gray-400 hover:text-amber-500 hover:bg-gray-200 dark:hover:bg-gray-700'"
                :title="mem.isPinned ? '取消固定' : '固定到上下文'"
              >
                <Bookmark class="w-3 h-3" :class="mem.isPinned ? 'fill-current' : ''" />
              </button>
              <!-- Edit -->
              <button @click="startEditMem(mem)" class="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors">
                <Pencil class="w-3 h-3" />
              </button>
              <!-- Archive -->
              <button
                @click="memoriesStore.archive(mem.id)"
                class="p-1 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 text-gray-400 hover:text-orange-500 transition-colors"
                title="归档（停止加载，不删除）"
              >
                <Archive class="w-3 h-3" />
              </button>
              <!-- Delete -->
              <button @click="deleteMem(mem.id)" class="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Archived memories section -->
        <div class="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
          <button
            @click="memoriesStore.showArchived = !memoriesStore.showArchived"
            class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full"
          >
            <Archive class="w-3.5 h-3.5" />
            <span>归档记忆（{{ memoriesStore.archivedMemories.length }} 条）</span>
            <ChevronDown class="w-3 h-3 ml-auto transition-transform" :class="memoriesStore.showArchived ? 'rotate-180' : ''" />
          </button>
          <div v-if="memoriesStore.showArchived && memoriesStore.archivedMemories.length" class="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            <div
              v-for="mem in memoriesStore.archivedMemories"
              :key="mem.id"
              class="group flex items-start gap-2.5 bg-gray-50/50 dark:bg-gray-800/50 rounded-xl p-2.5 border border-dashed border-gray-200 dark:border-gray-700 opacity-60 hover:opacity-100 transition-opacity"
            >
              <span class="mt-1 w-2 h-2 rounded-full shrink-0 bg-zinc-300 dark:bg-zinc-600" />
              <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{{ mem.content }}</p>
                <span class="text-[10px] text-gray-400">{{ MEMORY_CATEGORIES.find(c => c.id === mem.category)?.label }}</span>
              </div>
              <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  @click="memoriesStore.restore(mem.id)"
                  class="p-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-gray-400 hover:text-emerald-500 transition-colors"
                  title="恢复到活跃记忆"
                >
                  <ArchiveRestore class="w-3 h-3" />
                </button>
                <button @click="memoriesStore.remove(mem.id)" class="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          <div v-else-if="memoriesStore.showArchived" class="mt-2 text-center py-4 text-xs text-gray-400">暂无归档记忆</div>
        </div>
      </section>

      <!-- ── 技能库 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-amber-500" />
            <h2 class="text-base font-semibold">技能库</h2>
            <span v-if="skillsStore.skills.length" class="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full">{{ skillsStore.skills.length }}</span>
          </div>
          <button @click="openCreateSkill"
            class="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium">
            <Plus class="w-3.5 h-3.5" />新建技能
          </button>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          技能会在用户输入命中触发关键词时自动激活，将附加指令注入当次对话。对话中调用 3 次以上工具后，AI 会自动提炼技能供你保存。
        </p>

        <!-- Empty state -->
        <div v-if="!skillsStore.skills.length" class="text-center py-8 text-gray-400 dark:text-gray-600">
          <Sparkles class="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p class="text-sm">暂无技能，点击「新建技能」手动创建，或在对话中调用工具后等待 AI 自动提炼</p>
        </div>

        <!-- Skills list -->
        <div v-else class="space-y-2">
          <div v-for="skill in skillsStore.skills" :key="skill.id"
            class="group flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 hover:border-amber-200 dark:hover:border-amber-700 transition-colors">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ skill.name }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded-full"
                  :class="skill.source === 'auto'
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'">
                  {{ skill.source === 'auto' ? 'AI 提炼' : '手动' }}
                </span>
                <span class="text-xs text-gray-400">{{ skill.usageCount }} 次</span>
              </div>
              <p v-if="skill.description" class="text-xs text-gray-500 dark:text-gray-400 mb-1.5 line-clamp-1">{{ skill.description }}</p>
              <div class="flex flex-wrap gap-1">
                <span v-for="kw in kwList(skill)" :key="kw"
                  class="text-xs px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-full">
                  {{ kw }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button @click="openEditSkill(skill)" class="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <Pencil class="w-3.5 h-3.5" />
              </button>
              <button @click="deleteSkill(skill.id)" class="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── 插件系统 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <Puzzle class="w-4 h-4 text-blue-500" />
            <h2 class="text-base font-semibold">插件系统</h2>
            <span v-if="pluginsStore.plugins.length" class="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full">{{ pluginsStore.plugins.length }}</span>
          </div>
          <button @click="openCreatePlugin"
            class="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium">
            <Plus class="w-3.5 h-3.5" />添加插件
          </button>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          通过 HTTP Webhook 扩展 DeepSeek 能力，将任意外部服务（Notion、Slack、自建 API 等）接入 Agent 工具链。
        </p>

        <!-- Empty state -->
        <div v-if="!pluginsStore.plugins.length" class="text-center py-8 text-gray-400 dark:text-gray-600">
          <Puzzle class="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p class="text-sm">暂无插件，点击「添加插件」接入外部服务</p>
        </div>

        <!-- Plugins list -->
        <div v-else class="space-y-2">
          <div v-for="plugin in pluginsStore.plugins" :key="plugin.id"
            class="group flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 transition-colors"
            :class="plugin.enabled ? 'hover:border-blue-200 dark:hover:border-blue-700' : 'opacity-60'">
            <!-- Toggle -->
            <button @click="pluginsStore.toggle(plugin.id)" class="shrink-0 text-gray-400 transition-colors"
              :class="plugin.enabled ? 'text-blue-500 hover:text-blue-600' : 'hover:text-gray-600 dark:hover:text-gray-300'">
              <ToggleRight v-if="plugin.enabled" class="w-5 h-5" />
              <ToggleLeft  v-else                class="w-5 h-5" />
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ plugin.displayName }}</span>
                <code class="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded font-mono">{{ plugin.name }}</code>
                <span class="text-xs px-1.5 py-0.5 rounded-full"
                  :class="plugin.method === 'POST'
                    ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                    : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'">
                  {{ plugin.method }}
                </span>
              </div>
              <p v-if="plugin.description" class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ plugin.description }}</p>
              <p class="text-[11px] text-gray-400 font-mono truncate mt-0.5">{{ plugin.endpointUrl }}</p>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button @click="openEditPlugin(plugin)" class="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <Pencil class="w-3.5 h-3.5" />
              </button>
              <button @click="deletePlugin(plugin.id)" class="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── 界面偏好 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">界面偏好</h2>
        <div class="flex gap-2">
          <button
            @click="uiStore.isDark = false"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all"
            :class="!uiStore.isDark
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'"
          ><Sun class="w-4 h-4" />浅色</button>
          <button
            @click="uiStore.isDark = true"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all"
            :class="uiStore.isDark
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'"
          ><Moon class="w-4 h-4" />深色</button>
        </div>
      </section>

      <!-- ── 数据管理 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">数据管理</h2>

        <div class="space-y-3">
          <!-- Export -->
          <div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mb-2 font-medium uppercase tracking-wider">导出</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                class="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm transition-all text-left"
                :disabled="opLoading === 'exportJson'"
                @click="exportJson"
              >
                <span class="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <Loader v-if="opLoading === 'exportJson'" class="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  <FileJson v-else class="w-3.5 h-3.5 text-blue-500" />
                </span>
                <div>
                  <div class="font-medium text-gray-800 dark:text-gray-200 text-xs">JSON 全量备份</div>
                  <div class="text-[11px] text-gray-400">含笔记 + 分类 + 标签</div>
                </div>
              </button>

              <button
                class="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm transition-all text-left"
                :disabled="opLoading === 'exportMd'"
                @click="exportMarkdown"
              >
                <span class="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <Loader v-if="opLoading === 'exportMd'" class="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                  <FolderOpen v-else class="w-3.5 h-3.5 text-emerald-500" />
                </span>
                <div>
                  <div class="font-medium text-gray-800 dark:text-gray-200 text-xs">Markdown 文件</div>
                  <div class="text-[11px] text-gray-400">每篇笔记导出为 .md</div>
                </div>
              </button>
            </div>
          </div>

          <!-- Import -->
          <div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mb-2 font-medium uppercase tracking-wider">导入</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                class="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-sm transition-all text-left"
                :disabled="opLoading === 'importJson'"
                @click="importJson"
              >
                <span class="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                  <Loader v-if="opLoading === 'importJson'" class="w-3.5 h-3.5 text-purple-500 animate-spin" />
                  <Upload v-else class="w-3.5 h-3.5 text-purple-500" />
                </span>
                <div>
                  <div class="font-medium text-gray-800 dark:text-gray-200 text-xs">还原 JSON 备份</div>
                  <div class="text-[11px] text-gray-400">合并导入，不覆盖</div>
                </div>
              </button>

              <button
                class="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-sm transition-all text-left"
                :disabled="opLoading === 'importMd'"
                @click="importMarkdown"
              >
                <span class="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                  <Loader v-if="opLoading === 'importMd'" class="w-3.5 h-3.5 text-orange-500 animate-spin" />
                  <BookOpen v-else class="w-3.5 h-3.5 text-orange-500" />
                </span>
                <div>
                  <div class="font-medium text-gray-800 dark:text-gray-200 text-xs">导入 Markdown</div>
                  <div class="text-[11px] text-gray-400">选择 .md / .txt 文件</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── WebDAV 同步 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
        <div class="px-5 py-4 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Cloud class="w-4 h-4 text-blue-500" />
            <h2 class="text-base font-semibold">WebDAV 同步</h2>
            <span v-if="settings.webdavConfigured" class="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full font-medium">已配置</span>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="settings.webdavLastSync" class="text-xs text-gray-400">
              上次同步 {{ new Date(settings.webdavLastSync).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) }}
            </span>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              :disabled="settings.webdavSyncing || !settings.webdavConfigured"
              @click="settings.runWebDavSync()"
            >
              <Loader2 v-if="settings.webdavSyncing" class="w-3 h-3 animate-spin" />
              <RefreshCw v-else class="w-3 h-3" />
              {{ settings.webdavSyncing ? '同步中…' : '立即同步' }}
            </button>
          </div>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-800 px-5 py-4 space-y-3 bg-gray-50 dark:bg-gray-800/50">
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">WebDAV URL</label>
              <input
                v-model="settings.webdavUrl"
                placeholder="https://webdav.example.com"
                class="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 dark:focus:border-blue-500"
                @blur="settings.save()"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">用户名</label>
                <input
                  v-model="settings.webdavUser"
                  placeholder="username"
                  class="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
                  @blur="settings.save()"
                />
              </div>
              <div>
                <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">密码</label>
                <input
                  v-model="settings.webdavPass"
                  type="password"
                  placeholder="••••••••"
                  class="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
                  @blur="settings.save()"
                />
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              class="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
              :disabled="settings.isTestingWebdav || !settings.webdavUrl"
              @click="settings.testWebDavConnection()"
            >
              <Loader2 v-if="settings.isTestingWebdav" class="w-3 h-3 inline animate-spin mr-1" />
              测试连接
            </button>
            <span v-if="settings.webdavTestResult === 'success'" class="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle class="w-3.5 h-3.5" /> 连接成功
            </span>
            <span v-else-if="settings.webdavTestResult === 'fail'" class="text-xs text-red-500 flex items-center gap-1">
              <XCircle class="w-3.5 h-3.5" /> {{ settings.webdavTestError }}
            </span>
          </div>

          <!-- Sync result -->
          <div v-if="settings.webdavSyncResult" class="text-xs rounded-lg px-3 py-2"
               :class="settings.webdavSyncResult.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600'">
            <span v-if="settings.webdavSyncResult.ok">
              同步完成 · 推送 {{ settings.webdavSyncResult.pushed }} 篇，拉取 {{ settings.webdavSyncResult.pulled }} 篇
            </span>
            <span v-else>同步失败：{{ settings.webdavSyncResult.error }}</span>
          </div>

          <!-- Embedding model -->
          <div class="pt-1 border-t border-gray-200 dark:border-gray-700">
            <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">AI 语义搜索 Embedding 模型</label>
            <input
              v-model="settings.embeddingModel"
              placeholder="text-embedding-3-small"
              class="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
              @blur="settings.save()"
            />
            <p class="text-[11px] text-gray-400 mt-1">使用 OpenAI 兼容的 Embedding API，需 API Key 支持此模型</p>
          </div>
        </div>
      </section>

      <!-- ── 快捷键参考 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">键盘快捷键</h2>
        <div class="space-y-2">
          <div v-for="sc in shortcuts" :key="sc.key" class="flex items-center justify-between">
            <span class="text-sm text-gray-600 dark:text-gray-400">{{ sc.desc }}</span>
            <kbd class="text-xs px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 font-mono">{{ sc.key }}</kbd>
          </div>
        </div>
      </section>

      <div class="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">DeepSeek Notes v1.0.18</div>
    </div>
  </div>

  <!-- Skill create / edit dialog -->
  <SkillDialog
    v-if="skillDialogVisible"
    :mode="skillDialogMode"
    :skill="editingSkill"
    @save="saveSkill"
    @cancel="skillDialogVisible = false"
  />

  <!-- Plugin create / edit dialog -->
  <PluginDialog
    v-if="pluginDialogVisible"
    :mode="pluginDialogMode"
    :plugin="editingPlugin"
    @save="savePlugin"
    @cancel="pluginDialogVisible = false"
  />
</template>

<script lang="ts">
const shortcuts = [
  { key: '⌘⇧F', desc: '全局搜索（跨笔记和对话）' },
  { key: '⌘⇧N', desc: '新建对话' },
  { key: '⌘⇧E', desc: '跳转至笔记本' }
]
</script>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
.slide-down-leave-to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
</style>
