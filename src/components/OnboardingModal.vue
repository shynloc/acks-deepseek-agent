<script setup lang="ts">
import { ref } from 'vue'
import { MessageSquare, BookOpen, User, ChevronRight, ChevronLeft, Sparkles } from '@lucide/vue'
import { useRouter } from 'vue-router'

const emit = defineEmits<{ done: [] }>()
const router = useRouter()
const step = ref(0)

const steps = [
  {
    icon: MessageSquare,
    color: 'from-blue-500 to-indigo-600',
    title: '欢迎使用 DeepSeek Notes',
    desc: '基于 DeepSeek 的本地 AI 知识管理工具。所有数据存储在您的本地设备，完全私密。',
    sub: '「对话即笔记，笔记即上下文」'
  },
  {
    icon: BookOpen,
    color: 'from-emerald-500 to-teal-600',
    title: '智能笔记本',
    desc: '在 AI 对话中，悬停任意回复即可一键存入笔记本。支持 Markdown 编辑、5种主题、全文搜索和分类管理。',
    sub: '笔记可引用回对话，让 AI 帮你深度分析'
  },
  {
    icon: User,
    color: 'from-violet-500 to-purple-600',
    title: '开始前，先配置 API Key',
    desc: '前往「个人中心」输入您的 DeepSeek API Key，即可立即开始对话。可选配置图像识别能力。',
    sub: '数据安全：密钥加密存储在本地，永不上传'
  }
]

function finish() {
  emit('done')
  router.push('/profile')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">

        <!-- Progress bar -->
        <div class="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            class="h-full bg-blue-500 transition-all duration-500"
            :style="{ width: `${((step + 1) / steps.length) * 100}%` }"
          />
        </div>

        <!-- Content -->
        <div class="p-8 text-center">
          <!-- Icon -->
          <div
            class="w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-5 shadow-lg"
            :class="steps[step].color"
          >
            <component :is="steps[step].icon" class="w-8 h-8 text-white" />
          </div>

          <!-- Title -->
          <h2 class="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">
            {{ steps[step].title }}
          </h2>

          <!-- Desc -->
          <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
            {{ steps[step].desc }}
          </p>

          <!-- Sub -->
          <p class="text-xs text-gray-400 dark:text-gray-500 italic">
            {{ steps[step].sub }}
          </p>
        </div>

        <!-- Footer -->
        <div class="px-8 pb-8 flex items-center justify-between gap-3">
          <!-- Dots -->
          <div class="flex items-center gap-1.5">
            <button
              v-for="(_, i) in steps"
              :key="i"
              class="rounded-full transition-all duration-300"
              :class="i === step ? 'w-4 h-2 bg-blue-500' : 'w-2 h-2 bg-gray-200 dark:bg-gray-700'"
              @click="step = i"
            />
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="step > 0"
              class="flex items-center gap-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="step--"
            >
              <ChevronLeft class="w-3.5 h-3.5" />上一步
            </button>

            <button
              v-if="step < steps.length - 1"
              class="flex items-center gap-1 px-4 py-2 text-sm rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
              @click="step++"
            >
              下一步<ChevronRight class="w-3.5 h-3.5" />
            </button>
            <button
              v-else
              class="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
              @click="finish"
            >
              <Sparkles class="w-3.5 h-3.5" />去配置 API Key
            </button>
          </div>
        </div>

        <!-- Skip -->
        <button
          class="absolute top-4 right-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded"
          @click="emit('done')"
        >跳过</button>
      </div>
    </div>
  </Teleport>
</template>
