<script setup lang="ts">
import { computed } from 'vue'
import { X } from '@lucide/vue'

defineEmits<{ close: [] }>()

// Use preload-injected platform — macOS shows ⌘, Windows/Linux shows Ctrl
const isMac = window.api.env.platform === 'darwin'
const mod   = isMac ? '⌘' : 'Ctrl'
const alt   = isMac ? '⌥' : 'Alt'

const groups = computed(() => [
  {
    title: '全局',
    shortcuts: [
      { keys: [`${mod}`, ','],         desc: '打开个人中心' },
      { keys: [`${mod}`, 'N'],         desc: '新建对话' },
      { keys: [`${mod}`, '⇧', 'F'],   desc: '全局搜索' },
      { keys: [`${mod}`, '⇧', 'E'],   desc: '跳转笔记本' },
      { keys: [`${mod}`, '?'],         desc: '显示此快捷键表' },
    ]
  },
  {
    title: '笔记编辑器',
    shortcuts: [
      { keys: [`${mod}`, 'S'],         desc: '保存笔记' },
      { keys: [`${mod}`, 'B'],         desc: '加粗' },
      { keys: [`${mod}`, 'I'],         desc: '斜体' },
      { keys: [`${mod}`, 'K'],         desc: '插入链接' },
      { keys: [`${mod}`, `${alt}`, 'C'], desc: '插入代码块' },
      { keys: ['Tab'],                 desc: '增加缩进' },
      { keys: ['⇧', 'Tab'],           desc: '减少缩进' },
    ]
  },
  {
    title: 'AI 对话',
    shortcuts: [
      { keys: ['Enter'],               desc: '发送消息' },
      { keys: ['⇧', 'Enter'],         desc: '换行' },
      { keys: [`${mod}`, '⇧', 'F'],   desc: '在对话中搜索' },
      { keys: ['Escape'],              desc: '取消流式输出' },
    ]
  },
  {
    title: '笔记本',
    shortcuts: [
      { keys: [`${mod}`, 'F'],         desc: '搜索笔记' },
      { keys: ['↑ / ↓'],              desc: '在列表中移动选择' },
      { keys: ['Enter / 双击'],        desc: '打开笔记编辑器' },
      { keys: ['Delete'],              desc: '删除选中笔记（需确认）' },
    ]
  }
])
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div class="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">键盘快捷键</h2>
          <button
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            @click="$emit('close')"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 grid grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
          <div v-for="group in groups" :key="group.title">
            <h3 class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              {{ group.title }}
            </h3>
            <ul class="space-y-1.5">
              <li
                v-for="s in group.shortcuts"
                :key="s.desc"
                class="flex items-center justify-between gap-2"
              >
                <span class="text-xs text-gray-600 dark:text-gray-400 flex-1">{{ s.desc }}</span>
                <div class="flex items-center gap-1 shrink-0">
                  <kbd
                    v-for="k in s.keys"
                    :key="k"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono
                           border border-gray-300 dark:border-gray-600
                           bg-gray-100 dark:bg-gray-800
                           text-gray-700 dark:text-gray-300"
                  >{{ k }}</kbd>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
          <span class="text-[11px] text-gray-400">按 Esc 或点击背景关闭</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
