<template>
  <div>
    <svg :width="width" :height="height" class="w-full overflow-visible">
      <!-- Grid lines -->
      <line
        v-for="i in 3"
        :key="i"
        x1="0" :x2="width"
        :y1="chartTop + (chartH / 3) * (i - 1)"
        :y2="chartTop + (chartH / 3) * (i - 1)"
        class="stroke-gray-100 dark:stroke-gray-800"
        stroke-width="1"
      />

      <!-- Note bars -->
      <rect
        v-for="(d, i) in data"
        :key="'n' + i"
        :x="barX(i)"
        :y="barY(d.notes)"
        :width="barW * 0.45"
        :height="barH(d.notes)"
        class="fill-blue-400 dark:fill-blue-500 opacity-80"
        rx="3"
      />

      <!-- Message bars -->
      <rect
        v-for="(d, i) in data"
        :key="'m' + i"
        :x="barX(i) + barW * 0.47"
        :y="barY(d.messages)"
        :width="barW * 0.45"
        :height="barH(d.messages)"
        class="fill-purple-400 dark:fill-purple-500 opacity-80"
        rx="3"
      />

      <!-- X-axis labels -->
      <text
        v-for="(d, i) in data"
        :key="'l' + i"
        :x="barX(i) + barW * 0.45"
        :y="height - 2"
        text-anchor="middle"
        class="fill-gray-400 text-[9px]"
        font-size="9"
      >{{ d.label }}</text>
    </svg>

    <!-- Legend -->
    <div class="flex items-center gap-4 mt-1">
      <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <span class="w-2.5 h-2.5 rounded-sm bg-blue-400" />新增笔记
      </div>
      <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <span class="w-2.5 h-2.5 rounded-sm bg-purple-400" />对话次数
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: Array<{ label: string; notes: number; messages: number }>
  width?: number
  height?: number
}>()

const width = computed(() => props.width ?? 400)
const height = computed(() => props.height ?? 100)
const chartTop = 4
const chartH = computed(() => height.value - 22)
const barW = computed(() => width.value / props.data.length)

const maxVal = computed(() => Math.max(1, ...props.data.map(d => Math.max(d.notes, d.messages))))

function barX(i: number): number { return i * barW.value + barW.value * 0.05 }
function barY(v: number): number { return chartTop + chartH.value * (1 - v / maxVal.value) }
function barH(v: number): number { return Math.max(2, chartH.value * (v / maxVal.value)) }
</script>
