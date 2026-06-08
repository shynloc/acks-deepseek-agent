<script setup lang="ts">
import { computed, ref } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import { BookmarkPlus, Copy, Check, FileText, ImageIcon } from '@lucide/vue'
import type { Message } from '@/stores/chat'

const props = defineProps<{ message: Message; isStreaming?: boolean }>()
const emit = defineEmits<{ 'save-to-notebook': [message: Message] }>()

marked.setOptions({ breaks: true, gfm: true })

// @ts-ignore
marked.use({
  renderer: {
    code(code: string, lang: string) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext'
      const highlighted = hljs.highlight(code, { language }).value
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ''
      return `<pre class="code-block">${langLabel}<code class="hljs language-${language}">${highlighted}</code></pre>`
    }
  }
})

const renderedContent = computed(() => {
  if (props.message.role === 'user') return ''
  const raw = marked.parse(props.message.content) as string
  return DOMPurify.sanitize(raw)
})

const isUser       = computed(() => props.message.role === 'user')
const bubbleText   = computed(() => props.message.displayText ?? props.message.content)
const hasAttachments = computed(() => !!props.message.attachments?.length)

const copied = ref(false)
async function copyContent() {
  await navigator.clipboard.writeText(props.message.content)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <div class="group px-4 py-3" :class="isUser ? 'flex justify-end' : ''">

    <!-- User message: compact bubble -->
    <div v-if="isUser" class="max-w-[72%] flex flex-col items-end gap-1.5">
      <!-- Attachment previews (images + file chips) -->
      <template v-if="hasAttachments">
        <div class="flex flex-wrap gap-1.5 justify-end">
          <template v-for="att in message.attachments" :key="att.name">
            <!-- Image thumbnail -->
            <div v-if="att.preview" class="relative rounded-xl overflow-hidden border border-white/20 shadow-sm">
              <img :src="att.preview" class="max-w-[200px] max-h-[160px] object-cover rounded-xl" />
              <div v-if="att.visionUsed" class="absolute bottom-1 right-1 bg-violet-600 text-white text-[8px] px-1.5 py-0.5 rounded font-medium">AI 视觉</div>
              <div v-else-if="att.isOcr"   class="absolute bottom-1 right-1 bg-blue-600 text-white text-[8px] px-1.5 py-0.5 rounded font-medium">OCR</div>
            </div>
            <!-- File chip -->
            <div v-else class="flex items-center gap-1.5 bg-blue-500 text-white text-xs px-2.5 py-1.5 rounded-xl">
              <FileText class="w-3 h-3 shrink-0" />
              <span class="max-w-[120px] truncate">{{ att.name }}</span>
              <span class="opacity-70 text-[10px]">{{ att.type }}</span>
            </div>
          </template>
        </div>
      </template>

      <!-- User text bubble (empty check: don't show if pure attachment message with no text) -->
      <div
        v-if="bubbleText"
        class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words select-text"
      >
        {{ bubbleText }}
      </div>
    </div>

    <!-- Assistant message: full-width document style -->
    <div v-else class="flex gap-3 w-full">
      <!-- Avatar -->
      <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-none mt-0.5 shadow-sm shrink-0">
        <span class="text-white text-[10px] font-bold">DS</span>
      </div>

      <div class="flex-1 min-w-0">
        <!-- Content -->
        <div
          class="ai-message select-text text-zinc-800 dark:text-zinc-200"
          :class="{ 'streaming-cursor': isStreaming }"
        >
          <!-- Bouncing dots when empty -->
          <span v-if="isStreaming && message.content === ''" class="inline-flex gap-1 items-center h-5">
            <span class="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style="animation-delay:0ms" />
            <span class="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style="animation-delay:150ms" />
            <span class="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style="animation-delay:300ms" />
          </span>
          <div v-else v-html="renderedContent || message.content" />
        </div>

        <!-- Action buttons -->
        <div
          v-if="!isStreaming && message.content"
          class="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <button
            class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            @click="emit('save-to-notebook', message)"
          >
            <BookmarkPlus class="w-3 h-3" />存入笔记
          </button>
          <button
            class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            @click="copyContent"
          >
            <Check v-if="copied" class="w-3 h-3 text-green-500" />
            <Copy v-else class="w-3 h-3" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── AI message typography ──────────────────────────────────── */
.ai-message { font-size: 0.875rem; line-height: 1.75; }

.ai-message :deep(p)           { margin-bottom: 0.6em; }
.ai-message :deep(p:last-child){ margin-bottom: 0; }

.ai-message :deep(h1) { font-size: 1.1rem;  font-weight: 700; margin: 1em 0 0.4em; color: #111827; }
.ai-message :deep(h2) { font-size: 1rem;    font-weight: 700; margin: 0.9em 0 0.4em; color: #111827; }
.ai-message :deep(h3) { font-size: 0.9rem;  font-weight: 600; margin: 0.8em 0 0.3em; color: #1f2937; }

.dark .ai-message :deep(h1),
.dark .ai-message :deep(h2) { color: #f3f4f6; }
.dark .ai-message :deep(h3)  { color: #e5e7eb; }

.ai-message :deep(strong) { font-weight: 700; color: #111827; }
.dark .ai-message :deep(strong) { color: #f9fafb; }

.ai-message :deep(em) { font-style: italic; color: #374151; }
.dark .ai-message :deep(em) { color: #d1d5db; }

.ai-message :deep(ul) { list-style: disc;    padding-left: 1.4em; margin: 0.5em 0; space-y: 0.25em; }
.ai-message :deep(ol) { list-style: decimal; padding-left: 1.4em; margin: 0.5em 0; }
.ai-message :deep(li) { margin-bottom: 0.2em; }
.ai-message :deep(li > p) { margin: 0; }

.ai-message :deep(blockquote) {
  border-left: 3px solid #3b82f6;
  padding: 0.4em 0.8em;
  margin: 0.6em 0;
  color: #6b7280;
  background: #f0f9ff;
  border-radius: 0 6px 6px 0;
}
.dark .ai-message :deep(blockquote) {
  color: #9ca3af;
  background: #0c1a2e;
}

.ai-message :deep(code):not(.hljs) {
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 0.82em;
  background: #f3f4f6;
  color: #e11d48;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}
.dark .ai-message :deep(code):not(.hljs) {
  background: #1f2937;
  color: #fb7185;
  border-color: #374151;
}

.ai-message :deep(.code-block) {
  position: relative;
  background: #1e1e2e;
  border-radius: 10px;
  margin: 0.7em 0;
  overflow: hidden;
  font-size: 0.8rem;
}
.ai-message :deep(.code-lang) {
  display: block;
  padding: 6px 14px;
  background: #2a2a3e;
  color: #7c7c99;
  font-size: 0.7rem;
  font-family: monospace;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.ai-message :deep(.code-block code) {
  display: block;
  padding: 12px 14px;
  overflow-x: auto;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  line-height: 1.6;
}

.ai-message :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.7em 0;
  font-size: 0.82rem;
}
.ai-message :deep(th) {
  background: #f9fafb;
  font-weight: 600;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  text-align: left;
}
.ai-message :deep(td) {
  padding: 5px 10px;
  border: 1px solid #e5e7eb;
}
.dark .ai-message :deep(th) { background: #1f2937; border-color: #374151; }
.dark .ai-message :deep(td) { border-color: #374151; }
.ai-message :deep(tr:nth-child(even) td) { background: #f9fafb; }
.dark .ai-message :deep(tr:nth-child(even) td) { background: #111827; }

.ai-message :deep(a) { color: #3b82f6; text-decoration: underline; }
.ai-message :deep(a:hover) { color: #2563eb; }

.ai-message :deep(hr) { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }
.dark .ai-message :deep(hr) { border-color: #374151; }

/* Streaming cursor */
.streaming-cursor :deep(p:last-child)::after,
.streaming-cursor::after {
  content: '▍';
  color: #3b82f6;
  animation: blink 1s step-end infinite;
  margin-left: 1px;
}
@keyframes blink { 50% { opacity: 0; } }
</style>
