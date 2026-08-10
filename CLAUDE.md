# DeepSeek Notes

本地优先的 AI 知识管理桌面应用。核心理念「对话即笔记，笔记即上下文」。

- 已发布产品，当前 v1.0.37（版本号以 `package.json` 为准）
- Electron 28 + Vue 3 + TypeScript + Vite（electron-vite）+ Tailwind + better-sqlite3(FTS5) + Pinia
- 全部数据本地存储；Memos / WebDAV 同步、Cloudflare R2 图床、语义搜索均为可选功能

## 命令

首次安装（Node ≥ 24 上不能直接 `npm install`，原因见「已知陷阱」）：

```bash
npm install --ignore-scripts && npm rebuild electron --foreground-scripts && npx electron-rebuild -f -w better-sqlite3
```

```bash
npm run dev          # 启动开发环境
npm run build        # 构建（不打包）
npm run typecheck    # 类型检查：主进程 tsc + 渲染进程 vue-tsc
npm test             # vitest 单测（test/ 目录）
npm run test:watch   # 单测 watch 模式
npm run package:win  # 打包 Windows NSIS
npm run package:mac  # 打包 macOS dmg
npm run rebuild      # 单独重编译 better-sqlite3 原生模块
```

**改完代码跑 `npm run typecheck && npm test`，当前都是全绿的，要保持。** 项目没有 lint，这两项是仅有的自动化兜底 —— typecheck 首次接入时一口气查出 82 个存量错误，其中包含数个已发布的运行时 bug。

## 测试

`test/` 下用 vitest，只覆盖三块纯逻辑、出错代价最高的代码，不做 UI 测试：

| 文件 | 覆盖对象 |
|------|---------|
| `test/parseStream.test.ts` | `agent/loop.ts` 的 SSE 解析器：tool_calls 跨 chunk 分片重组、行/多字节字符跨 chunk 边界、思考块折叠、usage 统计、流中断判定 |
| `test/guardrails.test.ts` | `agent/guardrails.ts` 的三套计数器及其相互作用 |
| `test/rag.test.ts` | `agent/rag.ts` 的 floor + gap 截断 |
| `test/migrations.test.ts` | `db/migrations.ts` 的迁移选择与排序规则 |

测试跑在纯 Node 下，`vitest.config.mts` 把 `electron` 别名指向 `test/stubs/electron.ts`（一个会抛异常的 `net.fetch` 桩，兼作"单测不该发网络请求"的保险）。

写主进程逻辑时，把纯计算部分抽成不依赖 electron / db 的模块（`agent/rag.ts`、`db/migrations.ts` 的 `pendingMigrations` 都是这么来的），这样才测得动。

**测不了真实数据库**：better-sqlite3 编译产物是 Electron ABI（NODE_MODULE_VERSION 119），Node 测试进程（137）加载不了。涉及真实 SQL 的改动只能靠跑应用验证。只读地检查库文件可以用 Node 自带的 `node:sqlite`，它不依赖那个原生模块。

## 目录结构

```
electron/main/      主进程
  index.ts          窗口 / 托盘 / 自动同步定时器 / memos-asset:// 协议
  agent/            Agent 循环、Guardrails
  tools/            工具注册表 + builtin 工具集
  db/               SQLite 初始化、schema、迁移
  ipc/index.ts      全部 IPC handler（单文件，~70 channel）
  sync/             Memos / WebDAV 同步
  services/         embedding
electron/preload/   contextBridge 暴露 window.api
src/                渲染进程（Vue）
  views/            AIChat / Notebook / Profile / Help 四个路由页
  stores/           Pinia
  data/agents.ts    29 个预设 Agent 人设，prompt 用 ?raw 从 md 导入
```

渲染进程用 `@/` 别名指向 `src/`（仅渲染进程有效，主进程用相对路径）。

## 关键机制

**Agent 循环** — `electron/main/agent/loop.ts` 是最核心的文件。

- 最多 10 轮迭代，直连 DeepSeek `/chat/completions`（OpenAI 兼容格式），用 `net.fetch` 在主进程发请求
- `parseStream()` 是手写的 SSE 解析器：跨 chunk 缓冲 tool_calls 的分片 arguments（按 index 聚合）、累积 `reasoning_content` 包成折叠块、保留残行到下一 chunk。**改这里务必考虑分片边界**
- 流异常中断且未拿到 tool_calls → 降级重发非流式请求，强制 `tool_choice:'none'` 防止死循环，之后直接结束
- 首轮若用户消息命中 `ACTION_KEYWORDS` → `tool_choice:'required'` 强制调工具
- `CONFIRM_REQUIRED` 里的删除类工具会通过 IPC 往返向前端要确认，60 秒超时按取消处理

**Guardrails** — `agent/guardrails.ts`，防工具调用死循环。同参失败 2 次警告 / 5 次中止；单工具累计失败 3 / 8；只读工具连续无进展 2 / 5。halt 后注入系统提示并跑一次无工具的收尾回答。

**RAG** — `agent/index.ts` 的 `buildRagContext()`：语义检索结果拼进 system message。阈值 0.50 + gap 检测（相邻分差 ≥0.08 处截断）+ 最多 3 篇，每篇截 800 字。

**工具系统** — 自注册模式：builtin 文件在 import 时调用 `toolRegistry.register()`，由 `tools/index.ts` 统一 import 触发。`checkFn` 做运行时门控（如未配 Tavily Key 则 `web_search` 不暴露给模型）。另有两条动态注册路径：Plugin（`plugins` 表存 HTTP endpoint，每次 `agent:run` 时 `loadPluginsFromDb()` 注册）和腾讯文档（按 token 配置注册）。

## 约定

- 注释用英文，`// ── 分节标题 ─────` 作为区块分隔；面向用户的字符串、工具 description 用中文
- **工具 handler 必须返回 `string`**（`ToolEntry.handler` 的签名）。Agent 循环会把返回值直接塞进 tool 消息，返回对象会被 JS 隐式转成 `"[object Object]"`
- 生成文件的工具，返回串里要带 `文件：<文件名>` 标记 —— 渲染层 `parseArtifactsFromResult()` 靠这个正则生成产物卡片
- 出错时返回 `JSON.stringify({ error })` 而不是抛异常
- IPC channel 命名 `域:资源:动作`，如 `db:notes:update`、`semantic:search`
- DB id 用 `crypto.randomUUID()`，时间戳用 `Date.now()` 存 INTEGER
- 模板里访问不到 `window`（不在 Vue 的全局白名单里，会编译成 `_ctx.window` → undefined）。需要用 `window.api.*` 时在 `<script setup>` 里包一层函数

## 已知陷阱

**加一个工具只需改 2 处**：
1. `tools/builtin/xxx.ts` 里 `toolRegistry.register()`（`emoji` 和 `idempotent` 都在这里声明）
2. `tools/index.ts` 加 import —— **漏了不会报错，工具永远不会注册**

emoji 由前端启动时经 `agent:get-tools` 拉取，只读标记由 Guardrails 直接查注册表，都不需要再单独维护一份清单。

**preload API 的类型是自动的**。`src/env.d.ts` 直接引用 preload 导出的 `ElectronAPI`，新增 API 不需要改它。但要保证 preload 里的返回值类型标注和主进程 handler 的真实返回值一致 —— 标注滞后不会报错，只会让渲染层拿到错的类型。

**DB 迁移走 `db/migrations.ts` 的顺序迁移器**（`PRAGMA user_version` 驱动）。加迁移就往 `MIGRATIONS` 数组追加一项，版本号连续、从 1 开始。第 1 号是基线，语义等同于早期的「加列失败即忽略」，用于把 1.0.37 及更早的库（`user_version` 为 0 但列已存在）平滑升上来 —— **不要改它**。第 2 号起严格执行，失败即回滚并中止启动。

**Node ≥ 24 上 `npm install` 会失败**。better-sqlite3 9.6.0 没有 Node 24 的预编译产物，回退源码编译时会用 Node 24 的 `common.gypi`，它要求 ClangCL 工具集。而应用真正需要的是 Electron ABI 的产物，这次编译本身是多余的 —— 用上面「命令」一节的三步安装序列绕开。

## 结构债

以下文件已到影响开发效率的体量，**动到它们时顺手拆分**，但不要在没有测试兜底时做大规模重构：

- `src/views/Profile.vue`（108 KB）— 按设置分区拆子组件
- `electron/main/ipc/index.ts`（52 KB）— 按域拆 `ipc/notes.ts`、`ipc/sync.ts` 等
- `src/views/Help.vue`（41 KB）、`src/views/Notebook.vue`（38 KB）、`src/components/notes/NoteEditor.vue`（37 KB）

## 文档

`PRD.md` 产品需求 · `TECH_STACK.md` 架构与 Schema · `AGENT_DEV_PLAN.md` Agent 化改造全案（Sprint A~D，已落地）· `DEV_PLAN.md` 早期 7 Sprint 计划（历史文档）· `docs/PLUGIN_DEV_GUIDE.md` 插件开发指南
