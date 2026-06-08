<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import {
  MessageSquare, FileText, Type, Zap, Key, Sun, Moon,
  CheckCircle, XCircle, Loader, Download, Upload,
  FolderOpen, FileJson, BookOpen, AlertCircle, Eye, Globe, Bot, Sparkles, Pencil, Trash2, Plus, Puzzle, ToggleLeft, ToggleRight
} from '@lucide/vue'
import SkillDialog from '@/components/skills/SkillDialog.vue'
import PluginDialog from '@/components/plugins/PluginDialog.vue'
import { useSkillsStore, type Skill } from '@/stores/skills'
import { usePluginsStore, type Plugin } from '@/stores/plugins'
import { useUIStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import ActivityChart from '@/components/ActivityChart.vue'

const uiStore  = useUIStore()
const settings = useSettingsStore()
const skillsStore   = useSkillsStore()
const pluginsStore  = usePluginsStore()
const chat     = useChatStore()
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')

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

      <!-- ── 图像识别模型 ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <Eye class="w-4 h-4 text-violet-500" />
            <h2 class="text-base font-semibold">图像识别模型</h2>
          </div>
          <!-- Enabled badge -->
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium"
            :class="settings.visionEnabled
              ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
          >{{ settings.visionEnabled ? '已启用' : '未启用' }}</span>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          由 Xiaomi MiMo 提供图像理解能力，配置后上传图片将由视觉模型解读，描述内容后再发送给 DeepSeek。
        </p>

        <div class="space-y-4">
          <!-- Vision API Key -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">MiMo API Key</label>
            <div class="flex gap-2">
              <input
                v-model="settings.visionApiKey"
                type="password"
                placeholder="输入 MiMo API Key 即可启用图像识别…"
                class="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                @blur="settings.save()"
              />
              <button
                @click="settings.testVisionApi()"
                :disabled="!settings.visionApiKey || settings.isTestingVision"
                class="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <Loader v-if="settings.isTestingVision" class="w-3.5 h-3.5 animate-spin" />
                <CheckCircle v-else-if="settings.visionTestResult === 'success'" class="w-3.5 h-3.5 text-emerald-500" />
                <XCircle v-else-if="settings.visionTestResult === 'fail'" class="w-3.5 h-3.5 text-red-500" />
                测试连接
              </button>
            </div>
            <p v-if="settings.visionTestResult === 'success'" class="text-xs text-emerald-500 mt-1.5">✓ 连接成功，图像识别已就绪</p>
            <p v-if="settings.visionTestResult === 'fail'" class="text-xs text-red-500 mt-1.5">
              ✗ 连接失败{{ settings.visionTestError ? `（${settings.visionTestError}）` : '' }}，请检查 API Key 或网络
            </p>
          </div>

          <!-- Vision Model -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">模型选择</label>
            <select
              v-model="settings.visionModel"
              class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              @change="settings.save()"
            >
              <option value="mimo-v2.5">mimo-v2.5（推荐，均衡速度与质量）</option>
              <option value="mimo-v2-omni">mimo-v2-omni（全能版，更强理解力）</option>
            </select>
          </div>

          <!-- Vision Base URL -->
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">API 地址</label>
            <input
              v-model="settings.visionBaseUrl"
              type="text"
              class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-gray-600 dark:text-gray-400"
              @blur="settings.save()"
            />
          </div>

          <!-- Usage hint -->
          <div class="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-3 text-xs text-violet-700 dark:text-violet-400 space-y-1">
            <p class="font-medium">使用说明</p>
            <p>• 上传图片时，将先由 MiMo 生成图片描述，再注入到输入框发送给 DeepSeek</p>
            <p>• 未配置时退回 Tesseract.js 本地 OCR（仅识别文字，不理解图片语义）</p>
            <p>• 支持格式：JPEG · PNG · GIF · WebP · BMP，单张最大 50 MB</p>
          </div>
        </div>
      </section>

      <!-- ── 联网搜索 (Tavily) ── -->
      <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <Globe class="w-4 h-4 text-emerald-500" />
            <h2 class="text-base font-semibold">联网搜索</h2>
          </div>
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium"
            :class="settings.tavilyEnabled
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
          >{{ settings.tavilyEnabled ? '已启用' : '未启用' }}</span>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          由 Tavily 提供实时网络搜索，配置后可在对话输入框开启"联网搜索"按钮。
        </p>
        <div>
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">Tavily API Key</label>
          <input
            v-model="settings.tavilyKey"
            type="password"
            placeholder="tvly-xxxxxxxxxxxxxxxx"
            class="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            @blur="settings.save()"
          />
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1.5">免费额度 1000 次/月，详见 tavily.com</p>
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

      <div class="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">DeepSeek Notes v1.0.3</div>
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
