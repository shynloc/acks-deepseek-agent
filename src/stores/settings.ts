import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { testConnection } from '@/services/deepseek'

export const useSettingsStore = defineStore('settings', () => {
  // ── DeepSeek ──────────────────────────────────────────────────────────────
  const apiKey   = ref('')
  const baseUrl  = ref('https://api.deepseek.com')
  const model    = ref('deepseek-v4-flash')
  const isTesting   = ref(false)
  const testResult  = ref<'success' | 'fail' | null>(null)

  // ── Output length ─────────────────────────────────────────────────────────
  const maxTokens   = ref(8192)    // DeepSeek default ~4096, flash/pro support up to 384K
  const temperature = ref(1.0)     // 0 = deterministic, 1 = balanced, 2 = creative

  // ── Soul (Agent 身份注入) ─────────────────────────────────────────────────
  const soulContent = ref('')
  const soulEnabled = computed(() => !!soulContent.value.trim())

  // ── Tavily (联网搜索) ────────────────────────────────────────────────────────
  const tavilyKey = ref('')
  // Only printable ASCII allowed in HTTP headers; check after stripping junk chars
  const tavilyEnabled = computed(() => !!tavilyKey.value.replace(/[^\x20-\x7E]/g, '').trim())

  // ── Vision (MiMo) ─────────────────────────────────────────────────────────
  const visionApiKey  = ref('')
  const visionBaseUrl = ref('https://token-plan-cn.xiaomimimo.com/v1')
  const visionModel   = ref('mimo-v2.5')
  const isTestingVision   = ref(false)
  const visionTestResult  = ref<'success' | 'fail' | null>(null)
  const visionTestError   = ref('')

  const visionEnabled = computed(() => !!visionApiKey.value.trim())

  // ── Load / Save ───────────────────────────────────────────────────────────
  let _loaded = false

  async function load(): Promise<void> {
    if (_loaded) return  // already loaded in this session, don't overwrite in-memory edits
    apiKey.value   = (await window.api.config.get('apiKey')   as string) ?? ''
    baseUrl.value  = (await window.api.config.get('baseUrl')  as string) ?? 'https://api.deepseek.com'
    model.value    = (await window.api.config.get('model')    as string) ?? 'deepseek-v4-flash'
    maxTokens.value   = Number((await window.api.config.get('maxTokens'))   ?? 8192) || 8192
    temperature.value = Number((await window.api.config.get('temperature')) ?? 1.0)
    soulContent.value = (await window.api.config.get('soulContent') as string) ?? ''
    tavilyKey.value = (await window.api.config.get('tavilyKey') as string) ?? ''
    visionApiKey.value  = (await window.api.config.get('visionApiKey')  as string) ?? ''
    visionBaseUrl.value = (await window.api.config.get('visionBaseUrl') as string) ?? 'https://token-plan-cn.xiaomimimo.com/v1'
    visionModel.value   = (await window.api.config.get('visionModel')   as string) ?? 'mimo-v2.5'
    _loaded = true
  }

  async function save(): Promise<void> {
    await window.api.config.set('apiKey',  apiKey.value)
    await window.api.config.set('baseUrl', baseUrl.value)
    await window.api.config.set('model',      model.value)
    await window.api.config.set('maxTokens',   maxTokens.value)
    await window.api.config.set('temperature', temperature.value)
    await window.api.config.set('soulContent', soulContent.value)
    await window.api.config.set('tavilyKey', tavilyKey.value)
    await window.api.config.set('visionApiKey',  visionApiKey.value)
    await window.api.config.set('visionBaseUrl', visionBaseUrl.value)
    await window.api.config.set('visionModel',   visionModel.value)
  }

  async function testApi(): Promise<void> {
    isTesting.value = true
    testResult.value = null
    const ok = await testConnection(apiKey.value, baseUrl.value, model.value)
    testResult.value = ok ? 'success' : 'fail'
    isTesting.value = false
  }

  async function testVisionApi(): Promise<void> {
    isTestingVision.value = true
    visionTestResult.value = null
    visionTestError.value = ''
    const result = await window.api.apiTest({
      url: visionBaseUrl.value,
      apiKey: visionApiKey.value.trim(),
      model: visionModel.value
    })
    if (result.ok) {
      visionTestResult.value = 'success'
    } else {
      visionTestResult.value = 'fail'
      visionTestError.value = result.status
        ? `HTTP ${result.status}`
        : (result.error ?? '网络错误')
    }
    isTestingVision.value = false
  }

  return {
    apiKey, baseUrl, model, maxTokens, temperature, isTesting, testResult,
    soulContent, soulEnabled,
    tavilyKey, tavilyEnabled,
    visionApiKey, visionBaseUrl, visionModel, visionEnabled, isTestingVision, visionTestResult, visionTestError,
    load, save, testApi, testVisionApi
  }
})
