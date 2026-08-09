<template>
  <Teleport to="body">
    <!-- 位置跟随顶栏高度 token，不再硬编码 72px（原值 = 顶栏 56 + 16，
         顶栏一改就会重叠或脱节，且两处没有任何关联标记） -->
    <div
      class="fixed left-1/2 -translate-x-1/2 z-toast flex flex-col items-center gap-2 pointer-events-none"
      :style="{ top: 'calc(var(--banner-h) + 16px)' }"
    >
      <TransitionGroup name="toast">
        <div
          v-for="t in toast.toasts"
          :key="t.id"
          class="flex items-start gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium
                 pointer-events-auto cursor-pointer max-w-md
                 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700
                 text-zinc-800 dark:text-zinc-100"
          @click="toast.dismiss(t.id)"
          :title="t.message"
        >
          <CheckCircle   v-if="t.type === 'success'"    class="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <XCircle       v-else-if="t.type === 'error'" class="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <Info          v-else-if="t.type === 'info'"  class="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <AlertTriangle v-else                         class="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span class="line-clamp-2 select-text">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CheckCircle, XCircle, Info, AlertTriangle } from '@lucide/vue'
import { useToastStore } from '@/stores/toast'
const toast = useToastStore()
</script>

<style scoped>
.toast-enter-active { transition: all .25s ease; }
.toast-leave-active { transition: all .2s ease; }
.toast-enter-from   { opacity: 0; transform: translateY(-8px) scale(.95); }
.toast-leave-to     { opacity: 0; transform: translateY(-8px) scale(.95); }
</style>
