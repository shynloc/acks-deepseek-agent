<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Zap, MessageSquare, BookOpen, RefreshCw, Cloud, Image,
  Search, AlertCircle, MessageCircle, ChevronRight, ExternalLink,
  Key, Server, Globe, Mail, GitBranch, Copy, Check
} from '@lucide/vue'

const activeSection = ref('quickstart')
const copiedId = ref<string | null>(null)

const sections = [
  { id: 'quickstart',  label: '快速开始',    icon: Zap },
  { id: 'ai-chat',     label: 'AI 笔记',      icon: MessageSquare },
  { id: 'notebook',    label: '笔记本',       icon: BookOpen },
  { id: 'memos-sync',  label: 'Memos 同步',   icon: RefreshCw },
  { id: 'webdav-sync', label: 'WebDAV 同步',  icon: Cloud },
  { id: 'picbed',      label: '图床集成',     icon: Image },
  { id: 'semantic',    label: '语义搜索',     icon: Search },
  { id: 'faq',         label: '常见问题',     icon: AlertCircle },
  { id: 'feedback',    label: '反馈与联系',   icon: MessageCircle },
]

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  activeSection.value = id
}

async function copyText(text: string, id: string) {
  await navigator.clipboard.writeText(text)
  copiedId.value = id
  setTimeout(() => { copiedId.value = null }, 1500)
}

let observers: IntersectionObserver[] = []

onMounted(() => {
  sections.forEach(({ id }) => {
    const el = document.getElementById(id)
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) activeSection.value = id },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    obs.observe(el)
    observers.push(obs)
  })
})

onUnmounted(() => { observers.forEach(o => o.disconnect()) })
</script>

<template>
  <div class="flex h-full overflow-hidden bg-white dark:bg-zinc-950">

    <!-- ── Left sidebar TOC ───────────────────────────────────────────────── -->
    <aside class="w-52 shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto py-6 px-3">
      <p class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 px-3 mb-3">使用指南</p>
      <nav class="space-y-0.5">
        <button
          v-for="s in sections"
          :key="s.id"
          @click="scrollTo(s.id)"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left"
          :class="activeSection === s.id
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'"
        >
          <component :is="s.icon" class="w-3.5 h-3.5 shrink-0" />
          {{ s.label }}
        </button>
      </nav>
    </aside>

    <!-- ── Main content ───────────────────────────────────────────────────── -->
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-3xl mx-auto px-8 py-10 space-y-16">

        <!-- ① 快速开始 -->
        <section id="quickstart">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
              <Zap class="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">快速开始</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-6">三步完成基础配置，即可开始使用 DeepSeek Notes。</p>

          <div class="space-y-4">
            <div class="flex gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">1</div>
              <div>
                <p class="font-medium text-zinc-900 dark:text-zinc-100 mb-1">获取 DeepSeek API Key</p>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">前往 <span class="font-mono text-blue-600 dark:text-blue-400">platform.deepseek.com</span> 注册账号并创建 API Key。新用户有免费额度。</p>
              </div>
            </div>
            <div class="flex gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">2</div>
              <div>
                <p class="font-medium text-zinc-900 dark:text-zinc-100 mb-1">填写 API Key</p>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">进入 <strong>个人中心 → API 配置</strong>，粘贴你的 API Key，点击「测试连接」确认可用。</p>
              </div>
            </div>
            <div class="flex gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">3</div>
              <div>
                <p class="font-medium text-zinc-900 dark:text-zinc-100 mb-1">开始对话或记笔记</p>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">点击顶部「AI 笔记」开始和 AI 对话；点击「笔记本」管理本地 Markdown 笔记。</p>
              </div>
            </div>
          </div>

          <div class="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p class="text-sm text-amber-800 dark:text-amber-300"><strong>提示：</strong>其他高级功能（同步、图床、语义搜索）均为可选，按需配置即可，不影响基础使用。</p>
          </div>
        </section>

        <!-- ② AI 笔记 -->
        <section id="ai-chat">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
              <MessageSquare class="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">AI 笔记</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-6">基于 DeepSeek 模型的智能对话，支持引用笔记、联网搜索、工具调用。</p>

          <div class="space-y-5">
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">必要配置</h3>
              <div class="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <div class="flex items-start gap-2"><Key class="w-3.5 h-3.5 mt-0.5 text-zinc-400 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">API Key</strong> — 在个人中心填写 DeepSeek API Key</span></div>
                <div class="flex items-start gap-2"><Globe class="w-3.5 h-3.5 mt-0.5 text-zinc-400 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">API 地址</strong>（可选）— 默认 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">https://api.deepseek.com</code>，使用兼容 OpenAI 格式的其他服务时修改</span></div>
              </div>
            </div>

            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">功能说明</h3>
              <div class="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">对话历史</strong> — 所有对话自动保存，左侧侧边栏可管理和切换</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">引用笔记</strong> — 输入 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">[[笔记标题]]</code> 可将笔记内容注入上下文</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">联网搜索</strong> — 工具栏开启后，AI 可实时搜索网页（需配置 Tavily API Key）</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">存入笔记</strong> — 对话中任意消息可一键存为笔记本中的笔记</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">生成文件</strong> — AI 可生成 .docx / .pptx / .xlsx 文件并保存到桌面</span></div>
              </div>
            </div>

            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">快捷键</h3>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
                  <span class="text-zinc-600 dark:text-zinc-400">新建对话</span>
                  <kbd class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-xs font-mono text-zinc-700 dark:text-zinc-300">⌘N</kbd>
                </div>
                <div class="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
                  <span class="text-zinc-600 dark:text-zinc-400">发送消息</span>
                  <kbd class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-xs font-mono text-zinc-700 dark:text-zinc-300">⌘↩</kbd>
                </div>
                <div class="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
                  <span class="text-zinc-600 dark:text-zinc-400">进入笔记本</span>
                  <kbd class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-xs font-mono text-zinc-700 dark:text-zinc-300">⌘⇧E</kbd>
                </div>
                <div class="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
                  <span class="text-zinc-600 dark:text-zinc-400">全局搜索</span>
                  <kbd class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-xs font-mono text-zinc-700 dark:text-zinc-300">⌘⇧F</kbd>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ③ 笔记本 -->
        <section id="notebook">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <BookOpen class="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">笔记本</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-6">本地 Markdown 笔记管理，支持全文搜索、分类标签、多主题预览、分栏编辑。</p>

          <div class="space-y-5">
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">核心功能</h3>
              <div class="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">分类 & 标签</strong> — 左侧新建分类；编辑器内「+ 新标签」可打标签，支持颜色区分</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">全文搜索</strong> — 搜索栏输入关键词即可，结果高亮显示匹配片段</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">语义搜索</strong> — 点击搜索栏旁边的紫色 ✦ 图标切换，用自然语言搜索相似笔记（需额外配置，见下方）</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">分栏编辑</strong> — 宽屏下打开笔记自动分栏；编辑 / 分栏 / 预览 三种视图可切换</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">笔记颜色</strong> — 编辑器右上角色块可标记笔记颜色，便于区分</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">主题预览</strong> — 预览模式下可切换「前卫海报 / 简约白 / 学术论文」等排版主题</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">版本历史</strong> — 编辑器右上角时钟图标查看历史版本，可回滚</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">导入 / 导出</strong> — 个人中心支持批量导出为 Markdown 文件夹或 JSON；也可从 Markdown 导入</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span><strong class="text-zinc-800 dark:text-zinc-200">Wiki 链接</strong> — 笔记内写 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">[[其他笔记标题]]</code> 可跨笔记跳转</span></div>
              </div>
            </div>

            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">图片插入</h3>
              <div class="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span>编辑器工具栏点击「图片」按钮可上传图片（需配置图床或 Memos）</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" /><span>也可直接粘贴图片（Cmd+V）或拖拽图片到编辑区</span></div>
              </div>
            </div>
          </div>
        </section>

        <!-- ④ Memos 同步 -->
        <section id="memos-sync">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
              <RefreshCw class="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Memos 同步</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-4">将笔记双向同步到自托管的 <strong>Memos</strong> 服务，实现跨设备访问和手机端查阅。</p>

          <div class="mb-5 p-4 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
            <p class="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-1">⚠️ 使用前需准备</p>
            <p class="text-sm text-orange-700 dark:text-orange-400">需要一台可访问的服务器，自行部署 Memos 服务（开源免费）。</p>
          </div>

          <div class="space-y-5">
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-3">第一步：部署 Memos</h3>
              <p class="text-sm text-zinc-600 dark:text-zinc-400 mb-3">推荐使用 Docker 一键部署：</p>
              <div class="relative">
                <pre class="bg-zinc-900 dark:bg-zinc-800 text-zinc-100 rounded-xl p-4 text-xs overflow-x-auto font-mono leading-relaxed">docker run -d \
  --name memos \
  --publish 5230:5230 \
  --volume ~/.memos/:/var/opt/memos \
  neosmemo/memos:stable</pre>
                <button
                  class="absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
                  @click="copyText('docker run -d \\\n  --name memos \\\n  --publish 5230:5230 \\\n  --volume ~/.memos/:/var/opt/memos \\\n  neosmemo/memos:stable', 'memos-docker')"
                >
                  <Check v-if="copiedId === 'memos-docker'" class="w-3.5 h-3.5 text-green-400" />
                  <Copy v-else class="w-3.5 h-3.5" />
                </button>
              </div>
              <p class="text-xs text-zinc-400 mt-2">部署后访问 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">http://服务器IP:5230</code> 完成初始化注册。建议配置 HTTPS 反代。</p>
            </div>

            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-3">第二步：获取 Token</h3>
              <div class="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" /><span>登录 Memos → 右上角头像 → <strong>设置</strong></span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" /><span>找到「Access Tokens」→ 点击「Generate Token」</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" /><span>复制生成的 Token（<code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">memos_pat_xxx</code> 格式）</span></div>
              </div>
            </div>

            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-3">第三步：在 DeepSeek Notes 中配置</h3>
              <div class="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" /><span>进入 <strong>个人中心 → Memos 同步</strong></span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" /><span>填写服务器地址（如 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">https://memos.yourdomain.com</code>）和 Token</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" /><span>点击「测试连接」，成功后设置同步间隔，点击「手动同步」即可</span></div>
              </div>
            </div>

            <div class="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-500 dark:text-zinc-400">
              <strong class="text-zinc-700 dark:text-zinc-300">同步策略：</strong>双向同步，以最后修改时间为准（last-write-wins）。笔记图片通过 Memos 附件存储，预览时自动加载。
            </div>
          </div>
        </section>

        <!-- ⑤ WebDAV 同步 -->
        <section id="webdav-sync">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-950 flex items-center justify-center">
              <Cloud class="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">WebDAV 同步</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-4">通过 WebDAV 协议将笔记数据同步到云端，适合 Nextcloud、坚果云、群晖等支持 WebDAV 的服务。</p>

          <div class="mb-5 p-4 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800">
            <p class="text-sm font-semibold text-cyan-800 dark:text-cyan-300 mb-1">使用前需准备</p>
            <p class="text-sm text-cyan-700 dark:text-cyan-400">需要一个支持 WebDAV 的存储服务，并获取访问地址、账号、密码。</p>
          </div>

          <div class="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">支持的服务</h3>
              <div class="grid grid-cols-2 gap-2">
                <div class="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                  <p class="font-medium text-zinc-800 dark:text-zinc-200 mb-0.5">坚果云</p>
                  <p class="text-xs text-zinc-400">账户设置 → 第三方应用管理 → 生成密码</p>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                  <p class="font-medium text-zinc-800 dark:text-zinc-200 mb-0.5">Nextcloud</p>
                  <p class="text-xs text-zinc-400">地址格式：<code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">https://your.nc/remote.php/dav/files/用户名/</code></p>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                  <p class="font-medium text-zinc-800 dark:text-zinc-200 mb-0.5">群晖 NAS</p>
                  <p class="text-xs text-zinc-400">控制面板 → 文件服务 → WebDAV</p>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                  <p class="font-medium text-zinc-800 dark:text-zinc-200 mb-0.5">自托管</p>
                  <p class="text-xs text-zinc-400">Nginx WebDAV 模块或 rclone serve webdav</p>
                </div>
              </div>
            </div>
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">配置步骤</h3>
              <div class="space-y-1">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-cyan-500 shrink-0" /><span>进入 <strong>个人中心 → WebDAV 同步</strong></span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-cyan-500 shrink-0" /><span>填写 WebDAV 地址、用户名、密码，点击「测试连接」</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-cyan-500 shrink-0" /><span>连接成功后点击「立即同步」，数据存储在 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">/DeepSeekNotes/notes_sync.json</code></span></div>
              </div>
            </div>
          </div>
        </section>

        <!-- ⑥ 图床集成 -->
        <section id="picbed">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-950 flex items-center justify-center">
              <Image class="w-4 h-4 text-pink-600 dark:text-pink-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">图床集成</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-4">将笔记中的图片上传到云端图床，生成可分享的永久链接。基于 Cloudflare Worker + R2 实现。</p>

          <div class="mb-5 p-4 rounded-xl bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800">
            <p class="text-sm font-semibold text-pink-800 dark:text-pink-300 mb-1">⚠️ 使用前需准备</p>
            <ul class="text-sm text-pink-700 dark:text-pink-400 space-y-1">
              <li>• Cloudflare 账号（免费）</li>
              <li>• 创建一个 R2 存储桶</li>
              <li>• 部署配套的 Cloudflare Worker（管理上传鉴权）</li>
            </ul>
          </div>

          <div class="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">配置步骤</h3>
              <div class="space-y-1">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-pink-500 shrink-0" /><span>登录 Cloudflare → 创建 R2 存储桶，记录桶名</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-pink-500 shrink-0" /><span>部署 Worker 脚本（获取 Worker URL 和管理密码）</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-pink-500 shrink-0" /><span>进入 <strong>个人中心 → 图床设置</strong>，填写 Worker URL 和密码</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-pink-500 shrink-0" /><span>点击「测试连接」成功后，即可在编辑器工具栏上传图片</span></div>
              </div>
            </div>
            <div class="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
              <strong class="text-zinc-700 dark:text-zinc-300">提示：</strong>Memos 同步启用后，图片也可直接上传到 Memos 附件，无需单独配置图床。
            </div>
          </div>
        </section>

        <!-- ⑦ 语义搜索 -->
        <section id="semantic">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
              <Search class="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">语义搜索</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-4">用自然语言描述你想找的内容，AI 会返回语义相近的笔记，而不仅仅是关键词匹配。</p>

          <div class="mb-5 p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
            <p class="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-1">使用前需准备</p>
            <p class="text-sm text-purple-700 dark:text-purple-400">需要 Embedding API 访问权限。支持 OpenAI 格式的 Embedding 接口（如 OpenAI <code class="bg-purple-100 dark:bg-purple-900 px-1 rounded">text-embedding-3-small</code>，或兼容服务）。</p>
          </div>

          <div class="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">配置步骤</h3>
              <div class="space-y-1">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-purple-500 shrink-0" /><span>进入 <strong>个人中心 → 语义搜索</strong></span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-purple-500 shrink-0" /><span>填写 Embedding 模型名称（默认 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">text-embedding-3-small</code>），API Key 与 AI 笔记共用</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-purple-500 shrink-0" /><span>点击「全量建立索引」为现有笔记生成向量（首次使用需等待）</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-purple-500 shrink-0" /><span>之后每次保存笔记时自动更新索引</span></div>
              </div>
            </div>
            <div>
              <h3 class="font-semibold text-zinc-800 dark:text-zinc-200 mb-2">使用方法</h3>
              <div class="space-y-1">
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-purple-500 shrink-0" /><span>笔记本搜索栏右侧点击紫色 <strong>✦</strong> 图标切换为语义搜索模式</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-purple-500 shrink-0" /><span>输入自然语言描述，如「关于产品设计的想法」</span></div>
                <div class="flex items-start gap-2"><ChevronRight class="w-3.5 h-3.5 mt-0.5 text-purple-500 shrink-0" /><span>结果按相似度排序，右上角显示匹配分数</span></div>
              </div>
            </div>
          </div>
        </section>

        <!-- ⑧ 常见问题 -->
        <section id="faq">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
              <AlertCircle class="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">常见问题 & 报错处理</h2>
          </div>

          <div class="space-y-4">
            <details class="group border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              <summary class="flex items-center justify-between p-4 cursor-pointer bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors list-none">
                <span class="font-medium text-zinc-800 dark:text-zinc-200">AI 对话报错「API Key 无效」</span>
                <ChevronRight class="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90" />
              </summary>
              <div class="p-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2 border-t border-zinc-200 dark:border-zinc-700">
                <p>1. 检查个人中心 API Key 是否填写正确，注意前后不能有空格</p>
                <p>2. 确认 API Key 在 DeepSeek 控制台未过期或被禁用</p>
                <p>3. 点击「测试连接」按钮确认是否可以正常连通</p>
                <p>4. 如果使用第三方 API 转发，检查 API 地址是否填写正确</p>
              </div>
            </details>

            <details class="group border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              <summary class="flex items-center justify-between p-4 cursor-pointer bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors list-none">
                <span class="font-medium text-zinc-800 dark:text-zinc-200">图片上传失败</span>
                <ChevronRight class="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90" />
              </summary>
              <div class="p-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2 border-t border-zinc-200 dark:border-zinc-700">
                <p>1. <strong>图床未配置</strong>：进入个人中心配置图床或 Memos 同步</p>
                <p>2. <strong>网络问题</strong>：检查 Cloudflare Worker / Memos 服务是否可以访问</p>
                <p>3. <strong>Token 过期</strong>：重新生成 Memos Token 并更新配置</p>
                <p>4. <strong>文件过大</strong>：图片建议压缩到 5MB 以下</p>
              </div>
            </details>

            <details class="group border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              <summary class="flex items-center justify-between p-4 cursor-pointer bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors list-none">
                <span class="font-medium text-zinc-800 dark:text-zinc-200">Memos 同步报错「未找到」或 404</span>
                <ChevronRight class="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90" />
              </summary>
              <div class="p-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2 border-t border-zinc-200 dark:border-zinc-700">
                <p>1. 确认 Memos 版本 ≥ v0.23（本应用使用新版 API 格式）</p>
                <p>2. 检查服务器地址末尾不要加 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">/</code>，使用 HTTPS 地址</p>
                <p>3. Token 格式应为 <code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">memos_pat_xxx</code> 开头</p>
              </div>
            </details>

            <details class="group border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              <summary class="flex items-center justify-between p-4 cursor-pointer bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors list-none">
                <span class="font-medium text-zinc-800 dark:text-zinc-200">语义搜索无结果 / 结果不准</span>
                <ChevronRight class="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90" />
              </summary>
              <div class="p-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2 border-t border-zinc-200 dark:border-zinc-700">
                <p>1. 确认已在个人中心点击「全量建立索引」，等待完成</p>
                <p>2. 查看索引状态（已索引 N / 共 N 篇），未索引的笔记搜不到</p>
                <p>3. Embedding 模型需与 API Key 对应的服务支持</p>
                <p>4. 相似度阈值为 0.3，描述越具体，结果越准确</p>
              </div>
            </details>

            <details class="group border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              <summary class="flex items-center justify-between p-4 cursor-pointer bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors list-none">
                <span class="font-medium text-zinc-800 dark:text-zinc-200">应用打开后白屏 / 闪退</span>
                <ChevronRight class="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90" />
              </summary>
              <div class="p-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2 border-t border-zinc-200 dark:border-zinc-700">
                <p>1. 尝试完全退出后重新打开</p>
                <p>2. 检查 macOS 系统版本是否 ≥ 12（Monterey）</p>
                <p>3. 如果是从 ZIP 解压安装，确认已移动到「应用程序」文件夹</p>
                <p>4. 尝试删除应用数据重置：<code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/Library/Application Support/deepseek-notes/</code></p>
              </div>
            </details>
          </div>
        </section>

        <!-- ⑨ 反馈与联系 -->
        <section id="feedback" class="pb-10">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <MessageCircle class="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            </div>
            <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">反馈与联系</h2>
          </div>

          <p class="text-zinc-600 dark:text-zinc-400 mb-6">遇到 Bug？有功能建议？欢迎通过以下方式联系我们。</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="https://github.com/shynloc/acks-deepseek-agent/issues"
              target="_blank"
              rel="noopener"
              class="flex items-start gap-4 p-5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all group"
            >
              <div class="w-9 h-9 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shrink-0">
                <GitBranch class="w-5 h-5 text-white dark:text-zinc-900" />
              </div>
              <div>
                <p class="font-semibold text-zinc-900 dark:text-zinc-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1">
                  GitHub Issues
                  <ExternalLink class="w-3 h-3 opacity-50" />
                </p>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">提交 Bug 报告或功能建议，优先处理有详细描述和截图的 Issue</p>
              </div>
            </a>

            <a
              href="mailto:telafuka@gmail.com"
              class="flex items-start gap-4 p-5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all group"
            >
              <div class="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                <Mail class="w-5 h-5 text-white" />
              </div>
              <div>
                <p class="font-semibold text-zinc-900 dark:text-zinc-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1">
                  发送邮件
                  <ExternalLink class="w-3 h-3 opacity-50" />
                </p>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">telafuka@gmail.com — 适合私密反馈或合作咨询</p>
              </div>
            </a>
          </div>

          <div class="mt-6 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-500 dark:text-zinc-400">
            <strong class="text-zinc-700 dark:text-zinc-300">提交 Bug 时请附上：</strong>操作步骤、错误截图、系统版本（macOS / Windows / Linux）、应用版本号（个人中心底部可查）。
          </div>
        </section>

      </div>
    </main>
  </div>
</template>
