<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ScanLine, X } from '@lucide/vue'
import { ocrPdfFile } from '@/services/pdfOcr'

const props = defineProps<{
  file:       File
  totalPages: number
}>()

const emit = defineEmits<{
  done:   [text: string, pagesProcessed: number]
  cancel: []
}>()

const currentPage = ref(0)
const etaSecs     = ref(0)
const abortCtrl   = new AbortController()

const progress = computed(() =>
  props.totalPages > 0
    ? Math.round((currentPage.value / props.totalPages) * 100)
    : 0
)

function fmtEta(s: number): string {
  if (s <= 0)  return '即将完成…'
  if (s < 60)  return `约 ${s} 秒`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `约 ${m} 分 ${r} 秒` : `约 ${m} 分钟`
}

function cancel() {
  abortCtrl.abort()
  emit('cancel')
}

onMounted(async () => {
  const result = await ocrPdfFile(props.file, abortCtrl.signal, (p) => {
    currentPage.value = p.currentPage
    etaSecs.value     = p.etaSecs
  })
  if (!result.cancelled) {
    emit('done', result.text, result.pagesProcessed)
  }
})

onBeforeUnmount(() => {
  abortCtrl.abort()
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-[440px] mx-4 p-6">

        <!-- Header -->
        <div class="flex items-center gap-3 mb-6">
          <div class="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <ScanLine class="w-5 h-5 text-blue-600 dark:text-blue-400" :class="currentPage > 0 ? 'animate-pulse' : ''" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold text-zinc-900 dark:text-zinc-100 text-sm leading-tight">
              扫描版 PDF · OCR 识别
            </h3>
            <p class="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{{ file.name }}</p>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between text-xs">
            <span class="text-zinc-600 dark:text-zinc-400">
              <template v-if="currentPage === 0">正在初始化识别引擎…</template>
              <template v-else>第 <b class="text-zinc-900 dark:text-zinc-100">{{ currentPage }}</b> / {{ totalPages }} 页</template>
            </span>
            <span class="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">{{ progress }}%</span>
          </div>

          <div class="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
              :style="{ width: progress + '%' }"
            />
          </div>

          <p class="text-xs text-zinc-400 dark:text-zinc-500 text-center h-4">
            <template v-if="currentPage > 0">
              {{ fmtEta(etaSecs) }}
            </template>
          </p>
        </div>

        <!-- Tip -->
        <div class="mt-5 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl">
          <p class="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed text-center">
            每次只处理一页，不会撑爆内存<br/>识别期间可正常操作其他功能
          </p>
        </div>

        <!-- Cancel -->
        <div class="mt-5 flex justify-center">
          <button
            @click="cancel"
            class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <X class="w-3.5 h-3.5" />取消识别
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>
