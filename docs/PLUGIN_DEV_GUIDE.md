# DeepSeek Notes 插件开发指南

> 版本：v1.0 · 适用于 DeepSeek Notes v1.0.18+

---

## 目录

1. [插件系统概览](#1-插件系统概览)
2. [插件类型对比](#2-插件类型对比)
3. [Builtin 工具层（开发者）](#3-builtin-工具层开发者)
4. [Local Plugin 格式（.dnplugin）](#4-local-plugin-格式dnplugin)
5. [Remote Webhook 插件（无需编程）](#5-remote-webhook-插件无需编程)
6. [ToolContext API 参考](#6-toolcontext-api-参考)
7. [settings.schema.json 规范](#7-settingsschemajson-规范)
8. [完整示例：替代搜索引擎插件](#8-完整示例替代搜索引擎插件)
9. [安全模型与权限声明](#9-安全模型与权限声明)
10. [调试与测试](#10-调试与测试)
11. [发布规范](#11-发布规范)

---

## 1. 插件系统概览

DeepSeek Notes 的 Agent 能力通过「工具（Tool）」扩展。每个工具是一个函数，Agent 在对话推理过程中可以自主决策是否调用、传入什么参数。

**插件 = 一组工具 + 可选的设置项声明。**

插件不修改 UI 核心代码。它声明自己需要哪些配置（API Key、URL、开关），运行时会自动在「插件」面板渲染对应的设置 UI；插件声明的工具会自动注册到 Agent 工具链，无需改动配置页。

```
用户发送消息
    │
    ▼
Agent (DeepSeek) 推理
    │  根据对话上下文决定调用哪个工具
    ▼
工具注册表 (ToolRegistry)
    │  查找工具处理函数
    ▼
插件 Handler 执行
    │  可读写 DB、读取设置、发起 HTTP 请求
    ▼
结果返回给 Agent
    │
    ▼
Agent 继续生成回复
```

---

## 2. 插件类型对比

| 类型 | 适合场景 | 需要编程 | 分发方式 |
|------|---------|---------|---------|
| **Builtin**（内置工具） | 核心功能，随应用发布 | TypeScript | 源码 PR |
| **Local Plugin**（本地插件） | 本地逻辑、文件操作、调用本地服务 | JavaScript (CommonJS) | `.dnplugin` 文件安装 |
| **Remote Webhook**（远程插件） | 调用外部 HTTP API | 无需编程 | 应用内配置 |

**何时选择哪种类型：**

- 需要访问本地文件系统、运行本地命令、调用本地数据库 → **Local Plugin**
- 已有现成的 REST API（自建服务、Notion、Slack 等） → **Remote Webhook**
- 替代内置的 Tavily 搜索（如用 Serper、SerpAPI） → **Local Plugin**（需要读取 API Key 设置）
- 核心功能，需要打包进应用 → **Builtin**

---

## 3. Builtin 工具层（开发者）

这是最底层，工具用 TypeScript 编写，直接与应用源码一起编译。

### 3.1 文件位置

```
electron/main/tools/builtin/
    system.ts     ← get_datetime, get_stats
    notes.ts      ← search_notes, get_note, create_note, update_note
    memory.ts     ← save_memory, recall_memories, delete_memory
    web.ts        ← web_search (Tavily)
    files.ts      ← 文件操作
    documents.ts  ← HTML 文档生成
    docx.ts       ← Word 文档生成
    spreadsheet.ts← Excel 生成
    pptx.ts       ← PPT 生成
```

### 3.2 注册方式

在 `electron/main/tools/index.ts` 中 import 你的文件即可触发注册：

```typescript
// electron/main/tools/index.ts
import './builtin/my_tool'  // 添加这一行
```

### 3.3 工具定义结构

```typescript
import { toolRegistry } from '../registry'

toolRegistry.register({
  // ── 必填 ──────────────────────────────────────────
  name: 'my_tool_name',          // 工具唯一标识，snake_case
  schema: {
    name: 'my_tool_name',
    description: '描述工具的用途，Agent 靠这段文字决定是否调用',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '参数说明' },
        param2: { type: 'number', description: '数值参数' },
        param3: {
          type: 'string',
          description: '枚举参数',
          enum: ['option_a', 'option_b', 'option_c']
        }
      },
      required: ['param1']       // 必填参数列表
    }
  },
  handler: async (args, ctx) => {
    // args: 已经过类型推断的参数对象
    // ctx:  { db, store } — 见第 6 节
    const value = String(args.param1)
    // ... 处理逻辑
    return JSON.stringify({ result: value })  // 必须返回 JSON 字符串
  },

  // ── 可选 ──────────────────────────────────────────
  emoji: '🔧',                   // 工具调用时 UI 显示的图标
  idempotent: true,              // true = 只读操作，false = 有副作用
  maxResultChars: 5000,          // 结果超出此长度时自动截断
  checkFn: () => {               // 返回 false 时工具不会出现在 Agent 工具列表
    // 通常用于检查 API Key 是否配置
    return true
  }
})
```

### 3.4 Handler 返回规范

- **必须返回 JSON 字符串**，Agent 会解析这段 JSON 来理解工具执行结果
- 成功时：`JSON.stringify({ ...结果字段 })`
- 失败时：`JSON.stringify({ error: '错误描述' })` — 不要 throw，返回 error 字段
- 结果字段命名用英文 camelCase 或中文均可，但要在 description 里说清楚
- 避免在结果里包含无关的大段原始文本，Agent 的上下文窗口有限

---

## 4. Local Plugin 格式（.dnplugin）

`.dnplugin` 是一个压缩包（ZIP）或目录，包含以下文件：

```
my-plugin.dnplugin/
├── manifest.json          ← 必填：插件元数据与权限声明
├── tools.js               ← 必填：工具处理函数（CommonJS）
├── settings.schema.json   ← 可选：设置项声明（自动生成 UI）
└── README.md              ← 推荐：用户文档
```

安装方式：拖拽 `.dnplugin` 文件到应用，或通过「插件系统 → 从文件安装」。

### 4.1 manifest.json

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "displayName": "我的插件",
  "version": "1.0.0",
  "description": "一句话描述插件的功能",
  "author": "Your Name",
  "homepage": "https://github.com/example/my-plugin",
  "minAppVersion": "1.0.18",

  "permissions": [
    "net.fetch",        ← 发起 HTTP 请求
    "db.read",          ← 读取 SQLite 数据库
    "db.write",         ← 写入 SQLite 数据库
    "store.read",       ← 读取用户设置
    "store.write"       ← 写入用户设置（仅限本插件命名空间）
  ],

  "tools": [
    "my_search_tool",   ← tools.js 中导出的工具名，用于声明插件提供哪些工具
    "my_other_tool"
  ]
}
```

**权限说明：**

| 权限 | 允许操作 |
|------|---------|
| `net.fetch` | 通过 Electron `net.fetch` 发起 HTTP/HTTPS 请求（走系统代理） |
| `db.read` | `ctx.db.prepare(...).get()` / `.all()` |
| `db.write` | `ctx.db.prepare(...).run()` / `.exec()` |
| `store.read` | `ctx.store.get('plugins.{id}.*')` 及公共只读键 |
| `store.write` | `ctx.store.set('plugins.{id}.*')` — 仅限本插件命名空间 |

未声明的权限在运行时会抛出错误并阻止调用。

### 4.2 tools.js

CommonJS 模块，导出工具定义数组：

```javascript
// tools.js
module.exports = [
  {
    name: 'my_search_tool',
    emoji: '🔍',
    idempotent: true,
    maxResultChars: 6000,
    schema: {
      name: 'my_search_tool',
      description: '使用自定义搜索引擎查找信息',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' }
        },
        required: ['query']
      }
    },
    handler: async (args, ctx) => {
      // ctx.net  — Electron net 模块（需要 net.fetch 权限）
      // ctx.db   — better-sqlite3 Database 实例（需要 db.read/write 权限）
      // ctx.store — electron-store 实例（需要 store.read/write 权限）
      // ctx.pluginId — 本插件的 ID（用于命名空间隔离）

      const apiKey = ctx.store.get(`plugins.${ctx.pluginId}.apiKey`) ?? ''
      if (!apiKey) {
        return JSON.stringify({ error: '请先在插件设置中配置 API Key' })
      }

      try {
        const res = await ctx.net.fetch('https://api.example.com/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: args.query })
        })
        if (!res.ok) {
          return JSON.stringify({ error: `HTTP ${res.status}` })
        }
        const data = await res.json()
        return JSON.stringify({ results: data.items?.slice(0, 5) ?? [] })
      } catch (e) {
        return JSON.stringify({ error: e.message ?? '请求失败' })
      }
    }
  }
]
```

**注意事项：**
- `tools.js` 在 Electron 主进程中运行，不能访问 DOM 或 renderer API
- 不能使用 `require('electron').ipcRenderer`
- 可以 `require` Node.js 内置模块（`path`, `fs`, `crypto` 等）
- 可以在 `.dnplugin` 包内捆绑第三方 npm 包（打包到 `node_modules/` 子目录）
- 所有 `require` 的路径相对于 `tools.js` 所在目录

### 4.3 settings.schema.json

声明插件需要的配置项，应用会自动在「插件」面板生成对应 UI，无需修改配置页代码。

```json
{
  "sections": [
    {
      "title": "API 配置",
      "fields": [
        {
          "key": "apiKey",
          "type": "password",
          "label": "API Key",
          "placeholder": "sk-xxxxxxxx",
          "description": "在 example.com 申请，免费额度 1000 次/月",
          "required": true
        },
        {
          "key": "baseUrl",
          "type": "text",
          "label": "API 地址",
          "default": "https://api.example.com/v1",
          "description": "自定义部署时修改"
        }
      ]
    },
    {
      "title": "行为设置",
      "fields": [
        {
          "key": "maxResults",
          "type": "number",
          "label": "最多返回条数",
          "default": 5,
          "min": 1,
          "max": 20
        },
        {
          "key": "enabled",
          "type": "toggle",
          "label": "启用此插件",
          "default": true
        },
        {
          "key": "searchDepth",
          "type": "select",
          "label": "搜索深度",
          "default": "basic",
          "options": [
            { "value": "basic",    "label": "基础（快速）" },
            { "value": "advanced", "label": "深度（精准）" }
          ]
        }
      ]
    }
  ]
}
```

**字段类型说明：**

| type | 渲染为 | 特有字段 |
|------|--------|---------|
| `text` | 单行文本输入 | `placeholder`, `default` |
| `password` | 密码输入（脱敏显示） | `placeholder` |
| `number` | 数字输入 + 步进 | `min`, `max`, `step`, `default` |
| `toggle` | 开关 | `default` (bool) |
| `select` | 下拉选择 | `options: [{value, label}]`, `default` |
| `textarea` | 多行文本 | `rows`, `placeholder` |

所有配置值存储在 `plugins.{pluginId}.{key}` 命名空间，在 `tools.js` 中通过 `ctx.store.get(`plugins.${ctx.pluginId}.{key}`)` 读取。

---

## 5. Remote Webhook 插件（无需编程）

适合已有 REST API 的场景，直接在应用内配置，无需安装文件。

在「个人中心 → 插件系统 → 添加插件」中填写：

| 字段 | 说明 | 示例 |
|------|------|------|
| 工具名 | snake_case，Agent 调用时使用 | `notion_create_page` |
| 显示名 | 用户界面显示 | `Notion 建页` |
| 描述 | Agent 靠此决定调用时机 | `在 Notion 中创建一个新页面，内容由用户指定` |
| Endpoint URL | 完整 HTTP 地址 | `https://my-server.com/api/notion` |
| 方法 | GET 或 POST | `POST` |
| 请求头 | JSON 格式键值对 | `{"Authorization": "Bearer xxx"}` |
| 参数 Schema | JSON Schema，定义 Agent 可传入的参数 | 见下方示例 |

**参数 Schema 示例：**

```json
{
  "type": "object",
  "properties": {
    "title":   { "type": "string", "description": "页面标题" },
    "content": { "type": "string", "description": "页面正文（Markdown 格式）" },
    "emoji":   { "type": "string", "description": "页面图标，如 📝" }
  },
  "required": ["title", "content"]
}
```

Agent 调用时，应用会将参数以 JSON Body 发送给 Endpoint，并将响应体（JSON）原样返回给 Agent。

**Webhook 服务端要求：**
- 接受 `Content-Type: application/json` 的 POST 请求
- 在 10 秒内响应（超时视为失败）
- 返回 JSON 对象，字段内容即为 Agent 看到的工具结果

---

## 6. ToolContext API 参考

Handler 函数的第二个参数 `ctx` 提供以下能力（Local Plugin 需在 `manifest.json` 声明对应权限）：

### 6.1 ctx.db — SQLite 数据库

基于 [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)，**同步 API**。

```javascript
// 查询
const note = ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId)
const notes = ctx.db.prepare('SELECT id, title FROM notes ORDER BY updated_at DESC LIMIT ?').all(10)

// 写入
ctx.db.prepare('INSERT INTO notes (id, title, content, ...) VALUES (?, ?, ?, ...)').run(id, title, content)
ctx.db.prepare('UPDATE notes SET content = ? WHERE id = ?').run(newContent, noteId)

// 事务
const tx = ctx.db.transaction(() => {
  ctx.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
  for (const tagId of tagIds) {
    ctx.db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)').run(noteId, tagId)
  }
})
tx()
```

**主要数据表：**

```sql
notes         (id, title, content, category_id, color, word_count, created_at, updated_at)
categories    (id, name, parent_id, order_index, created_at)
tags          (id, name, color, order_index, created_at)
note_tags     (note_id, tag_id)
conversations (id, title, model, created_at, updated_at, system_prompt, agent_id)
messages      (id, conversation_id, role, content, tokens_used, created_at)
memories      (id, content, category, importance, is_pinned, recall_count, last_recalled, is_archived, created_at, updated_at)
skills        (id, name, description, trigger_keywords, system_hint, tool_sequence, usage_count, source, created_at, updated_at)
plugins       (id, name, display_name, description, endpoint_url, method, headers_json, param_schema_json, enabled, created_at)
```

### 6.2 ctx.store — 用户设置

基于 [electron-store](https://github.com/sindresorhus/electron-store)，Key-Value 存储。

```javascript
// 读取（需要 store.read 权限）
const apiKey = ctx.store.get(`plugins.${ctx.pluginId}.apiKey`) ?? ''
const model  = ctx.store.get('model')          // 全局设置（只读访问）

// 写入（需要 store.write 权限，仅限插件命名空间）
ctx.store.set(`plugins.${ctx.pluginId}.lastUsed`, Date.now())

// 全局只读键（无需特殊权限即可读取）：
// 'model', 'baseUrl', 'maxTokens', 'temperature'
// 不可读取：'apiKey'（安全限制）
```

### 6.3 ctx.net — HTTP 客户端（Local Plugin 专用）

等同于 Electron 的 `net.fetch`，走系统代理，无 CORS 限制：

```javascript
// 需要 net.fetch 权限
const res = await ctx.net.fetch('https://api.example.com/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ query: args.query })
})

if (!res.ok) {
  const body = await res.text().catch(() => '')
  return JSON.stringify({ error: `HTTP ${res.status}: ${body.slice(0, 200)}` })
}

const data = await res.json()
```

### 6.4 ctx.pluginId

字符串，等于 `manifest.json` 中的 `id` 字段。用于命名空间隔离：

```javascript
const myKey = `plugins.${ctx.pluginId}.apiKey`
```

---

## 7. settings.schema.json 规范

完整 JSON Schema：

```typescript
interface SettingsSchema {
  sections: Section[]
}

interface Section {
  title: string
  description?: string
  fields: Field[]
}

type Field =
  | { key: string; type: 'text';     label: string; placeholder?: string; default?: string;  description?: string; required?: boolean }
  | { key: string; type: 'password'; label: string; placeholder?: string;                    description?: string; required?: boolean }
  | { key: string; type: 'number';   label: string; default?: number; min?: number; max?: number; step?: number; description?: string }
  | { key: string; type: 'toggle';   label: string; default?: boolean; description?: string }
  | { key: string; type: 'select';   label: string; options: {value: string; label: string}[]; default?: string; description?: string }
  | { key: string; type: 'textarea'; label: string; placeholder?: string; rows?: number; default?: string; description?: string }
```

**key 命名规则：**
- 只用 camelCase 小写字母和数字
- 不要加 `plugin.` 前缀（运行时自动添加命名空间）
- 推荐命名：`apiKey`, `baseUrl`, `enabled`, `maxResults`, `model`

---

## 8. 完整示例：替代搜索引擎插件

以 [Serper.dev](https://serper.dev)（Google 搜索 API）替代内置 Tavily 为例，展示完整的 `.dnplugin` 实现。

### 目录结构

```
serper-search.dnplugin/
├── manifest.json
├── tools.js
└── settings.schema.json
```

### manifest.json

```json
{
  "id": "com.deepseek-notes.serper-search",
  "name": "serper-search",
  "displayName": "Google 搜索（Serper）",
  "version": "1.0.0",
  "description": "通过 Serper.dev API 调用 Google 搜索，替代内置 Tavily",
  "author": "示例",
  "minAppVersion": "1.0.18",
  "permissions": ["net.fetch", "store.read"],
  "tools": ["serper_web_search"]
}
```

### tools.js

```javascript
module.exports = [
  {
    name: 'serper_web_search',
    emoji: '🔍',
    idempotent: true,
    maxResultChars: 6000,
    schema: {
      name: 'serper_web_search',
      description: '通过 Google 搜索互联网获取实时信息。当问题需要最新数据、新闻或笔记库中没有相关内容时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，建议用简短关键词而非完整问句'
          },
          num: {
            type: 'number',
            description: '返回结果条数，默认 5，最大 10'
          }
        },
        required: ['query']
      }
    },
    handler: async (args, ctx) => {
      const enabled = ctx.store.get(`plugins.${ctx.pluginId}.enabled`) !== false
      if (!enabled) {
        return JSON.stringify({ error: 'Serper 搜索插件已禁用' })
      }

      const apiKey = (ctx.store.get(`plugins.${ctx.pluginId}.apiKey`) ?? '').trim()
      if (!apiKey) {
        return JSON.stringify({ error: '请在插件设置中填写 Serper API Key' })
      }

      const query = String(args.query ?? '').trim()
      const num   = Math.min(Number(args.num ?? 5), 10)

      try {
        const res = await ctx.net.fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: query, num })
        })

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          return JSON.stringify({ error: `Serper API 错误 ${res.status}`, detail: body.slice(0, 300) })
        }

        const data = await res.json()
        const results = (data.organic ?? []).slice(0, num).map(r => ({
          title:   r.title,
          url:     r.link,
          snippet: r.snippet
        }))

        return JSON.stringify({
          query,
          answerBox: data.answerBox?.answer ?? null,
          results
        })
      } catch (e) {
        return JSON.stringify({ error: e.message ?? '网络请求失败' })
      }
    }
  }
]
```

### settings.schema.json

```json
{
  "sections": [
    {
      "title": "Serper API 配置",
      "description": "在 serper.dev 免费注册，每月 2500 次免费查询",
      "fields": [
        {
          "key": "apiKey",
          "type": "password",
          "label": "API Key",
          "placeholder": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          "required": true
        }
      ]
    },
    {
      "title": "搜索设置",
      "fields": [
        {
          "key": "enabled",
          "type": "toggle",
          "label": "启用 Google 搜索",
          "default": true
        },
        {
          "key": "defaultNum",
          "type": "number",
          "label": "默认结果条数",
          "default": 5,
          "min": 1,
          "max": 10,
          "description": "Agent 未指定时的默认返回数量"
        }
      ]
    }
  ]
}
```

---

## 9. 安全模型与权限声明

### 9.1 主进程沙箱

Local Plugin 的 `tools.js` 在 Electron 主进程中执行，**不在独立沙箱内**。这意味着：

- 可以访问 Node.js 全部 API（`fs`, `child_process` 等）
- 未来版本可能引入 VM 沙箱限制

当前阶段，`manifest.json` 中的权限声明是**语义约定而非技术强制**，主要用于：
1. 让用户在安装时了解插件需要哪些能力
2. 让 AI Agent 在代码审查时有据可查
3. 为未来沙箱实现预留接口

### 9.2 安全建议

**插件开发者应遵守：**
- 只读取和 `pluginId` 命名空间相关的 store 键
- 不读取 `apiKey`（主 API Key）等敏感全局设置
- HTTP 请求只发往声明或文档中注明的域名
- 不在工具 handler 中写入 `notes`, `conversations`, `messages` 表（除非插件明确提供笔记能力）
- `maxResultChars` 不要超过 10000（避免塞满 Agent 上下文）

**用户安装插件前应确认：**
- 来源可信（官方仓库、知名开发者）
- `manifest.json` 声明的权限与插件功能匹配（一个搜索插件不应要求 `db.write`）
- 开源插件可直接审查 `tools.js` 源码

### 9.3 store 命名空间隔离规则

```
允许读写：plugins.{pluginId}.*
允许只读：model, baseUrl, maxTokens, temperature
禁止访问：apiKey, tavilyKey, visionApiKey, 及所有其他用户隐私数据
```

---

## 10. 调试与测试

### 10.1 开发模式调试

以 Builtin 工具为例，在 `handler` 中打印日志会出现在 Electron 主进程控制台：

```typescript
handler: async (args, ctx) => {
  console.log('[my_tool] called with:', args)
  // ...
  console.log('[my_tool] result:', result)
  return JSON.stringify(result)
}
```

启动开发模式：

```bash
cd "DeepSeek Notes"
npm run dev
```

主进程日志在终端可见；renderer 日志在 DevTools（⌘⌥I）Console 可见。

### 10.2 测试 Handler 逻辑

在 `electron/main/tools/` 下新建测试脚本：

```javascript
// test-my-tool.js（开发时临时文件）
const Database = require('better-sqlite3')
const db = new Database('/tmp/test.db')
// 构造 mock ctx
const ctx = {
  db,
  store: { get: (k) => k === 'plugins.test.apiKey' ? 'test-key' : null }
}

const tools = require('./builtin/my-tool-tools.js')
tools[0].handler({ query: '测试关键词' }, ctx).then(r => {
  console.log('result:', r)
})
```

### 10.3 常见问题

| 症状 | 排查方向 |
|------|---------|
| 工具不出现在 Agent 工具列表 | 检查 `checkFn` 是否返回 false；检查 import 是否加入 `tools/index.ts` |
| Agent 不调用工具 | 检查 `schema.description` 是否足够清晰；尝试在对话中明确说"请使用XXX工具" |
| Handler 报错但 Agent 继续 | 正常——错误会作为工具结果返回，Agent 会尝试其他方式回答 |
| 结果被截断 | 调高 `maxResultChars` 或减少返回的字段 |
| ctx.net undefined | Local Plugin 需要在 `manifest.json` 中声明 `net.fetch` 权限 |

---

## 11. 发布规范

### 11.1 文件命名

```
{author}-{name}-v{version}.dnplugin
示例: example-serper-search-v1.0.0.dnplugin
```

### 11.2 推荐的 README.md 结构

```markdown
# 插件名称

一句话描述。

## 安装

1. 下载 .dnplugin 文件
2. 在 DeepSeek Notes「个人中心 → 插件系统」中选择「从文件安装」
3. 在插件设置中填写 API Key

## 配置项

| 设置项 | 说明 | 获取方式 |
|--------|------|---------|
| API Key | 认证密钥 | 注册 example.com 后在控制台获取 |

## 提供的工具

### `tool_name`
- **触发时机**：描述 Agent 会在什么情况下调用
- **参数**：`query`（必填）搜索关键词

## 许可证

MIT
```

### 11.3 版本管理建议

- 遵循 semver：`MAJOR.MINOR.PATCH`
- 工具名、参数名变更 → MAJOR 版本升级（否则会破坏已有对话中的工具调用历史）
- 新增参数（可选）→ MINOR
- Bug 修复 → PATCH

---

*DeepSeek Notes Plugin SDK · 如有疑问请在项目 Issues 中反馈*
