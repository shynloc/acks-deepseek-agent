<script setup lang="ts">
import { X } from '@lucide/vue'

const emit = defineEmits<{
  pick: [content: string, title: string]
  close: []
}>()

const templates = [
  {
    label: '日记',
    emoji: '📔',
    title: () => `${new Date().toLocaleDateString('zh-CN', { year:'numeric',month:'2-digit',day:'2-digit' })} 日记`,
    content: () => {
      const d = new Date()
      const dateStr = d.toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' })
      return `## ${dateStr}\n\n**今日摘要**\n\n\n\n**收获与思考**\n\n\n\n**明日计划**\n\n- [ ] \n- [ ] \n- [ ] \n`
    }
  },
  {
    label: '会议记录',
    emoji: '📋',
    title: () => `会议记录 ${new Date().toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' })}`,
    content: () => `## 会议信息\n\n- **时间**：${new Date().toLocaleString('zh-CN', { dateStyle:'short', timeStyle:'short' })}\n- **参与人**：\n- **主持人**：\n\n## 议题\n\n1. \n2. \n\n## 讨论记录\n\n\n\n## 决议与行动项\n\n| 事项 | 负责人 | 截止日期 |\n|------|--------|----------|\n| | | |\n\n## 下次会议\n\n`
  },
  {
    label: '读书笔记',
    emoji: '📚',
    title: () => '读书笔记：',
    content: () => `## 基本信息\n\n- **书名**：\n- **作者**：\n- **阅读日期**：${new Date().toLocaleDateString('zh-CN')}\n- **评分**：⭐⭐⭐⭐⭐\n\n## 核心主旨\n\n\n\n## 重要观点\n\n1. \n2. \n3. \n\n## 精彩摘录\n\n> \n\n## 个人感悟\n\n\n\n## 行动清单\n\n- [ ] \n`
  },
  {
    label: '项目周报',
    emoji: '📊',
    title: () => `项目周报 W${getWeekNumber()}`,
    content: () => `## 本周完成\n\n- ✅ \n- ✅ \n\n## 进行中\n\n- 🔄 \n\n## 下周计划\n\n- 📌 \n- 📌 \n\n## 风险与阻碍\n\n\n\n## 数据指标\n\n| 指标 | 本周 | 上周 | 变化 |\n|------|------|------|------|\n| | | | |\n`
  },
  {
    label: 'TODO 清单',
    emoji: '✅',
    title: () => `TODO ${new Date().toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' })}`,
    content: () => `## 今日任务\n\n### 重要且紧急\n- [ ] \n\n### 重要不紧急\n- [ ] \n- [ ] \n\n### 其他\n- [ ] \n\n---\n\n## 备注\n\n`
  },
  {
    label: '技术文档',
    emoji: '⚙️',
    title: () => '技术文档：',
    content: () => `## 概述\n\n\n\n## 背景与动机\n\n\n\n## 方案设计\n\n### 架构\n\n\`\`\`\n\n\`\`\`\n\n### 核心流程\n\n1. \n2. \n3. \n\n## 接口说明\n\n\n\n## 注意事项\n\n- \n\n## 参考资料\n\n- \n`
  }
]

function getWeekNumber(): number {
  const d = new Date()
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div class="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">选择模板</h2>
          <button
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            @click="$emit('close')"
          ><X class="w-4 h-4" /></button>
        </div>

        <div class="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
          <button
            v-for="t in templates"
            :key="t.label"
            class="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700
                   hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20
                   transition-all text-center group"
            @click="emit('pick', t.content(), t.title()); $emit('close')"
          >
            <span class="text-3xl">{{ t.emoji }}</span>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              {{ t.label }}
            </span>
          </button>
        </div>

        <div class="px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
          <span class="text-[11px] text-gray-400">选择后自动填入标题和内容，可随时修改</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
