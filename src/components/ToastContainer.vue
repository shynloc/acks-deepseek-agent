<template>
  <Teleport to="body">
    <div class="fixed top-[72px] left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="t in toast.toasts"
          :key="t.id"
          class="flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto cursor-pointer max-w-sm"
          :class="{
            'bg-emerald-500 text-white': t.type === 'success',
            'bg-red-500 text-white':     t.type === 'error',
            'bg-blue-500 text-white':    t.type === 'info',
            'bg-amber-500 text-white':   t.type === 'warning'
          }"
          @click="toast.dismiss(t.id)"
        >
          <CheckCircle  v-if="t.type === 'success'" class="w-4 h-4 shrink-0" />
          <XCircle      v-else-if="t.type === 'error'"   class="w-4 h-4 shrink-0" />
          <Info         v-else-if="t.type === 'info'"    class="w-4 h-4 shrink-0" />
          <AlertTriangle v-else                           class="w-4 h-4 shrink-0" />
          <span>{{ t.message }}</span>
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
