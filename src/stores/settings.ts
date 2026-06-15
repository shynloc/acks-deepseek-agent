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

  // ── User Profile ──────────────────────────────────────────────────────────
  const userName    = ref('')
  const userRole    = ref('')
  const userContext = ref('')
  const userEnabled = computed(() => !!(userName.value.trim() || userRole.value.trim() || userContext.value.trim()))

  // ── Soul (Agent 身份注入) ─────────────────────────────────────────────────
  const soulContent = ref('')
  const soulEnabled = computed(() => !!soulContent.value.trim())

  // ── Tavily (联网搜索) ────────────────────────────────────────────────────────
  const tavilyKey        = ref('')
  const webSearchEnabled = ref(true)   // per-plugin on/off toggle
  const tavilyEnabled    = computed(() => !!tavilyKey.value.replace(/[^\x20-\x7E]/g, '').trim())
  const webSearchActive  = computed(() => tavilyEnabled.value && webSearchEnabled.value)

  // ── Vision (MiMo) ─────────────────────────────────────────────────────────
  const visionApiKey      = ref('')
  const visionBaseUrl     = ref('https://token-plan-cn.xiaomimimo.com/v1')
  const visionModel       = ref('mimo-v2.5')
  const visionPluginEnabled = ref(true)  // per-plugin on/off toggle
  const isTestingVision   = ref(false)
  const visionTestResult  = ref<'success' | 'fail' | null>(null)
  const visionTestError   = ref('')

  const visionEnabled = computed(() => !!visionApiKey.value.trim())
  const visionActive  = computed(() => visionEnabled.value && visionPluginEnabled.value)

  // ── Memos sync ────────────────────────────────────────────────────────────
  const memosUrl           = ref('')
  const memosToken         = ref('')
  const memosPluginEnabled = ref(true)
  const memosSyncInterval  = ref(15)   // minutes; 0 = manual only
  const memosSyncing       = ref(false)
  const memosSyncResult    = ref<{ ok: boolean; added: number; updated: number; deleted: number; syncedAt: number; errors: string[] } | null>(null)
  const memosTestResult    = ref<'success' | 'fail' | null>(null)
  const memosTestUser      = ref('')
  const memosTestError     = ref('')
  const isTestingMemos     = ref(false)

  const memosConfigured = computed(() => !!memosUrl.value.trim() && !!memosToken.value.trim())
  const memosActive     = computed(() => memosConfigured.value && memosPluginEnabled.value)

  // ── Agent 增强模式 ────────────────────────────────────────────────────────
  const agentPowerMode = ref(false)   // Level 1: read_file + list_dir

  // ── WebDAV 同步 ───────────────────────────────────────────────────────────
  const webdavUrl  = ref('')
  const webdavUser = ref('')
  const webdavPass = ref('')
  const webdavSyncing    = ref(false)
  const webdavSyncResult = ref<{ ok: boolean; pushed?: number; pulled?: number; syncedAt?: number; error?: string } | null>(null)
  const webdavTestResult = ref<'success' | 'fail' | null>(null)
  const webdavTestError  = ref('')
  const isTestingWebdav  = ref(false)
  const webdavLastSync   = ref(0)

  const webdavConfigured = computed(() => !!webdavUrl.value.trim())

  // ── Embedding model ───────────────────────────────────────────────────────
  const embeddingModel = ref('text-embedding-3-small')

  // ── Picbed (Cloudflare Worker + R2) ──────────────────────────────────────
  const picbedUrl           = ref('')
  const picbedToken         = ref('')
  const picbedPluginEnabled = ref(true)
  const isTestingPicbed     = ref(false)
  const picbedTestResult    = ref<'success' | 'fail' | null>(null)
  const picbedTestError     = ref('')

  const picbedConfigured = computed(() => !!picbedUrl.value.trim() && !!picbedToken.value.trim())
  const picbedActive     = computed(() => picbedConfigured.value && picbedPluginEnabled.value)

  // ── Load / Save ───────────────────────────────────────────────────────────
  let _loaded = false

  async function load(): Promise<void> {
    if (_loaded) return  // already loaded in this session, don't overwrite in-memory edits
    apiKey.value   = (await window.api.config.get('apiKey')   as string) ?? ''
    baseUrl.value  = (await window.api.config.get('baseUrl')  as string) ?? 'https://api.deepseek.com'
    model.value    = (await window.api.config.get('model')    as string) ?? 'deepseek-v4-flash'
    maxTokens.value   = Number((await window.api.config.get('maxTokens'))   ?? 8192) || 8192
    temperature.value = Number((await window.api.config.get('temperature')) ?? 1.0)
    userName.value    = (await window.api.config.get('userName')    as string) ?? ''
    userRole.value    = (await window.api.config.get('userRole')    as string) ?? ''
    userContext.value = (await window.api.config.get('userContext') as string) ?? ''
    soulContent.value = (await window.api.config.get('soulContent') as string) ?? ''
    tavilyKey.value        = (await window.api.config.get('tavilyKey')           as string)  ?? ''
    webSearchEnabled.value = (await window.api.config.get('webSearchEnabled')     as boolean) ?? true
    visionPluginEnabled.value = (await window.api.config.get('visionPluginEnabled') as boolean) ?? true
    visionApiKey.value     = (await window.api.config.get('visionApiKey')         as string)  ?? ''
    visionBaseUrl.value = (await window.api.config.get('visionBaseUrl') as string) ?? 'https://token-plan-cn.xiaomimimo.com/v1'
    visionModel.value   = (await window.api.config.get('visionModel')   as string) ?? 'mimo-v2.5'
    memosUrl.value           = (await window.api.config.get('memosUrl')           as string)  ?? ''
    memosToken.value         = (await window.api.config.get('memosToken')         as string)  ?? ''
    memosPluginEnabled.value = (await window.api.config.get('memosPluginEnabled') as boolean) ?? true
    memosSyncInterval.value  = (await window.api.config.get('memosSyncInterval')  as number)  ?? 15
    picbedUrl.value           = (await window.api.config.get('picbedUrl')           as string)  ?? ''
    picbedToken.value         = (await window.api.config.get('picbedToken')         as string)  ?? ''
    picbedPluginEnabled.value = (await window.api.config.get('picbedPluginEnabled') as boolean) ?? true
    agentPowerMode.value      = (await window.api.config.get('agentPowerMode')      as boolean) ?? false
    webdavUrl.value   = (await window.api.config.get('webdavUrl')   as string) ?? ''
    webdavUser.value  = (await window.api.config.get('webdavUser')  as string) ?? ''
    webdavPass.value  = (await window.api.config.get('webdavPass')  as string) ?? ''
    embeddingModel.value = (await window.api.config.get('embeddingModel') as string) ?? 'text-embedding-3-small'
    const wdStatus = await window.api.webdav.status()
    webdavLastSync.value = wdStatus.lastSyncAt
    _loaded = true
  }

  async function save(): Promise<void> {
    await window.api.config.set('apiKey',  apiKey.value)
    await window.api.config.set('baseUrl', baseUrl.value)
    await window.api.config.set('model',      model.value)
    await window.api.config.set('maxTokens',   maxTokens.value)
    await window.api.config.set('temperature', temperature.value)
    await window.api.config.set('userName',    userName.value)
    await window.api.config.set('userRole',    userRole.value)
    await window.api.config.set('userContext', userContext.value)
    await window.api.config.set('soulContent', soulContent.value)
    await window.api.config.set('tavilyKey',           tavilyKey.value)
    await window.api.config.set('webSearchEnabled',    webSearchEnabled.value)
    await window.api.config.set('visionPluginEnabled', visionPluginEnabled.value)
    await window.api.config.set('visionApiKey',        visionApiKey.value)
    await window.api.config.set('visionBaseUrl', visionBaseUrl.value)
    await window.api.config.set('visionModel',   visionModel.value)
    await window.api.config.set('memosUrl',           memosUrl.value)
    await window.api.config.set('memosToken',         memosToken.value)
    await window.api.config.set('memosPluginEnabled', memosPluginEnabled.value)
    await window.api.config.set('memosSyncInterval',  memosSyncInterval.value)
    await window.api.config.set('picbedUrl',           picbedUrl.value)
    await window.api.config.set('picbedToken',         picbedToken.value)
    await window.api.config.set('picbedPluginEnabled', picbedPluginEnabled.value)
    await window.api.config.set('agentPowerMode',      agentPowerMode.value)
    await window.api.config.set('webdavUrl',   webdavUrl.value)
    await window.api.config.set('webdavUser',  webdavUser.value)
    await window.api.config.set('webdavPass',  webdavPass.value)
    await window.api.config.set('embeddingModel', embeddingModel.value)
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

  async function testMemosConnection(): Promise<void> {
    isTestingMemos.value   = true
    memosTestResult.value  = null
    memosTestUser.value    = ''
    memosTestError.value   = ''
    const result = await window.api.memos.test()
    if (result.ok) {
      memosTestResult.value = 'success'
      memosTestUser.value   = result.user ?? '已连接'
    } else {
      memosTestResult.value = 'fail'
      memosTestError.value  = result.error ?? '连接失败'
    }
    isTestingMemos.value = false
  }

  async function runMemosSync(): Promise<void> {
    memosSyncing.value    = true
    memosSyncResult.value = null
    const result = await window.api.memos.sync()
    memosSyncResult.value = result
    memosSyncing.value    = false
  }

  async function testWebDavConnection(): Promise<void> {
    isTestingWebdav.value  = true
    webdavTestResult.value = null
    webdavTestError.value  = ''
    await save()
    const result = await window.api.webdav.test()
    if (result.ok) {
      webdavTestResult.value = 'success'
    } else {
      webdavTestResult.value = 'fail'
      webdavTestError.value  = result.error ?? '连接失败'
    }
    isTestingWebdav.value = false
  }

  async function runWebDavSync(): Promise<void> {
    webdavSyncing.value    = true
    webdavSyncResult.value = null
    await save()
    const result = await window.api.webdav.sync()
    webdavSyncResult.value = result
    if (result.syncedAt) webdavLastSync.value = result.syncedAt
    webdavSyncing.value = false
  }

  async function testPicbedConnection(): Promise<void> {
    isTestingPicbed.value  = true
    picbedTestResult.value = null
    picbedTestError.value  = ''
    try {
      const { testPicbed } = await import('@/services/picbed')
      const result = await testPicbed({ url: picbedUrl.value, token: picbedToken.value })
      picbedTestResult.value = result.ok ? 'success' : 'fail'
      if (!result.ok) picbedTestError.value = result.error ?? '连接失败'
    } catch (e: any) {
      picbedTestResult.value = 'fail'
      picbedTestError.value  = e.message
    }
    isTestingPicbed.value = false
  }

  return {
    apiKey, baseUrl, model, maxTokens, temperature, isTesting, testResult,
    userName, userRole, userContext, userEnabled,
    soulContent, soulEnabled,
    tavilyKey, tavilyEnabled, webSearchEnabled, webSearchActive,
    visionApiKey, visionBaseUrl, visionModel, visionEnabled, visionActive, visionPluginEnabled,
    isTestingVision, visionTestResult, visionTestError,
    memosUrl, memosToken, memosPluginEnabled, memosSyncInterval,
    memosSyncing, memosSyncResult, memosTestResult, memosTestUser, memosTestError, isTestingMemos,
    memosConfigured, memosActive,
    agentPowerMode,
    webdavUrl, webdavUser, webdavPass, webdavConfigured, webdavLastSync,
    webdavSyncing, webdavSyncResult, webdavTestResult, webdavTestError, isTestingWebdav,
    embeddingModel,
    picbedUrl, picbedToken, picbedPluginEnabled, picbedConfigured, picbedActive,
    isTestingPicbed, picbedTestResult, picbedTestError,
    load, save, testApi, testVisionApi, testMemosConnection, runMemosSync,
    testWebDavConnection, runWebDavSync, testPicbedConnection
  }
})
