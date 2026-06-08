# DeepSeek Notes — 技术栈与架构设计

> 版本：v1.0 | 创建日期：2026-06-08

---

## 一、技术选型总览

### 1.1 核心技术栈

| 层次 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| 桌面框架 | Electron | 28+ | 跨平台（macOS/Windows），可访问本地文件系统和 SQLite |
| 前端框架 | Vue 3 + TypeScript | 3.4+ | 响应式强，Composition API 适合复杂状态管理 |
| 构建工具 | Vite | 5+ | 极速热重载，Electron 生态支持好 |
| 状态管理 | Pinia | 2+ | Vue 官方推荐，TypeScript 友好 |
| 样式框架 | Tailwind CSS | 3+ | 原子类，避免 CSS 命名混乱，暗色模式原生支持 |
| 图标库 | Lucide Vue | latest | 轻量、风格统一、MIT 协议 |
| 数据库 | SQLite (better-sqlite3) | latest | 本地零配置，支持 FTS5 全文搜索 |
| AI 接入 | DeepSeek API | - | OpenAI 兼容格式，支持 Streaming |
| Markdown | marked.js + highlight.js | latest | 成熟稳定，主题定制灵活 |
| 安全 | DOMPurify | latest | 渲染 Markdown 前 XSS 过滤 |
| 时间处理 | Day.js | latest | 轻量，2kB |
| 配置存储 | electron-store | 8+ | 加密存储 API Key 等敏感配置 |
| 文档解析 | pdf-parse + mammoth.js | latest | 处理 PDF/DOCX 附件 |
| 网络搜索 | Tavily API（可选） | - | 专为 AI 设计的搜索 API |

### 1.2 为什么选 Electron 而非纯 HTML？

| 需求 | 纯 HTML（浏览器） | Electron |
|------|----------|---------|
| SQLite 数据库 | ❌ 需要额外 server | ✅ Node.js 原生支持 |
| 文件系统访问 | ❌ 受浏览器沙箱限制 | ✅ 原生 fs 模块 |
| API Key 安全存储 | ❌ localStorage 明文 | ✅ 加密存储 |
| CORS（DeepSeek API） | ❌ 需要代理服务器 | ✅ 无 CORS 限制 |
| 本地文件拖拽 | ❌ 受限 | ✅ 完整支持 |

**结论：** Electron 是"本地 HTML 搭配小型数据库"需求的最优解，无需用户安装数据库或启动服务器，双击即用。

---

## 二、架构设计

### 2.1 Electron 进程架构

```
┌─────────────────────────────────────────────────────┐
│                   Electron App                      │
│                                                     │
│  ┌─────────────────────┐   ┌─────────────────────┐  │
│  │    Main Process      │   │  Renderer Process   │  │
│  │    (Node.js)         │   │  (Vue 3 + Browser)  │  │
│  │                     │   │                     │  │
│  │  - SQLite 操作       │◄─►│  - UI 渲染          │  │
│  │  - 文件 I/O          │IPC│  - DeepSeek API 调用│  │
│  │  - 加密配置存储      │   │  - 状态管理         │  │
│  │  - 菜单/系统托盘     │   │  - 路由             │  │
│  └─────────────────────┘   └─────────────────────┘  │
│           ▲                          ▲               │
│           └──────── Preload ─────────┘               │
│                   (IPC 桥接)                          │
└─────────────────────────────────────────────────────┘
```

**IPC 通信设计原则：**
- 所有数据库操作通过 IPC 在 Main Process 执行（安全隔离）
- DeepSeek API 调用在 Renderer Process 执行（便于流式处理）
- API Key 由 Main Process 通过 electron-store 管理，Renderer 通过 IPC 获取

### 2.2 项目目录结构

```
deepseek-notes/
├── electron/
│   ├── main.ts              # Electron 主进程入口
│   ├── preload.ts           # IPC 预加载脚本（暴露安全 API）
│   └── db/
│       ├── index.ts         # 数据库连接与初始化
│       ├── schema.sql       # 表结构定义
│       ├── migrations/      # 版本迁移脚本
│       └── handlers/        # IPC 数据库处理器
│           ├── conversations.ts
│           ├── messages.ts
│           ├── notes.ts
│           ├── categories.ts
│           └── settings.ts
├── src/
│   ├── main.ts              # Vue 应用入口
│   ├── App.vue              # 根组件（Banner + Tab 路由）
│   ├── router/
│   │   └── index.ts         # Tab 路由配置
│   ├── stores/              # Pinia 状态
│   │   ├── chat.ts          # 对话状态
│   │   ├── notes.ts         # 笔记状态
│   │   ├── ui.ts            # UI 状态（主题/侧栏展开等）
│   │   └── settings.ts      # 用户配置
│   ├── views/
│   │   ├── AIChat.vue       # Tab 1：AI 笔记
│   │   ├── Notebook.vue     # Tab 2：笔记本
│   │   └── Profile.vue      # Tab 3：个人中心
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppBanner.vue          # 顶部 Banner
│   │   │   └── ThreeColumnLayout.vue  # 三栏布局基础组件
│   │   ├── chat/
│   │   │   ├── ChatHistory.vue        # 左侧历史对话栏
│   │   │   ├── ChatWindow.vue         # 中间对话区
│   │   │   ├── MessageBubble.vue      # 单条消息气泡
│   │   │   ├── ChatInput.vue          # 输入框组件
│   │   │   ├── NoteRefPicker.vue      # 笔记引用选择器
│   │   │   └── BookmarkSidebar.vue    # 右侧书签栏
│   │   ├── notes/
│   │   │   ├── CategoryTree.vue       # 左侧分类树
│   │   │   ├── TagList.vue            # 标签列表
│   │   │   ├── NoteGrid.vue           # 笔记卡片/列表展示
│   │   │   ├── NoteCard.vue           # 单张笔记卡片
│   │   │   ├── NoteEditor.vue         # 笔记编辑弹窗
│   │   │   ├── MarkdownRenderer.vue   # Markdown 渲染（5 主题）
│   │   │   ├── MarkdownToolbar.vue    # Markdown 编辑工具栏
│   │   │   └── ShortcutSidebar.vue    # 右侧快捷方式栏
│   │   └── common/
│   │       ├── SearchBox.vue          # 通用搜索框
│   │       ├── TagBadge.vue           # 标签徽章
│   │       ├── ConfirmDialog.vue      # 二次确认弹窗
│   │       ├── SaveNoteModal.vue      # 存入笔记弹窗
│   │       └── WelcomeGuide.vue       # 首次启动引导
│   ├── services/
│   │   ├── deepseek.ts      # DeepSeek API 封装（含 Streaming）
│   │   ├── search.ts        # 搜索服务（关键词 + 预留语义搜索）
│   │   ├── fileParser.ts    # 文件解析（PDF/DOCX/TXT/MD）
│   │   └── webSearch.ts     # 联网搜索（Tavily API）
│   ├── utils/
│   │   ├── tokenCounter.ts  # Token 数量估算
│   │   ├── markdown.ts      # Markdown 工具函数
│   │   └── dateFormat.ts    # 时间格式化
│   └── types/
│       └── index.ts         # 全局 TypeScript 类型定义
├── public/
│   └── icons/               # 应用图标
├── electron-builder.json    # 打包配置
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 三、数据库设计

### 3.1 Schema

```sql
-- 对话历史
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,        -- UUID
  title       TEXT NOT NULL DEFAULT '新对话',
  model       TEXT NOT NULL,           -- 使用的模型
  created_at  INTEGER NOT NULL,        -- Unix timestamp
  updated_at  INTEGER NOT NULL,
  system_prompt TEXT                   -- 自定义 System Prompt
);

-- 消息记录
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  tokens_used     INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL,
  metadata        TEXT                 -- JSON: 附件信息、搜索结果等
);

-- 笔记本
CREATE TABLE notes (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  category_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
  color        TEXT DEFAULT 'none',    -- 颜色标记
  word_count   INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  source_type  TEXT,                   -- 'chat' | 'manual' | 'import'
  source_id    TEXT,                   -- conversation_id（如来自对话）
  source_msg_id TEXT                   -- message_id
);

-- 笔记全文搜索虚表（FTS5）
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, content, content=notes, content_rowid=rowid
);

-- 笔记版本历史
CREATE TABLE note_versions (
  id         TEXT PRIMARY KEY,
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  saved_at   INTEGER NOT NULL
);

-- 分类
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES categories(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- 标签
CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT DEFAULT '#6B7280',
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- 笔记-标签关联
CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- 书签（对话内存笔记的引用）
CREATE TABLE bookmarks (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  note_id         TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL
);

-- 快捷方式
CREATE TABLE shortcuts (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- Token 消耗统计
CREATE TABLE token_stats (
  id             TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  model          TEXT NOT NULL,
  prompt_tokens  INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  recorded_at    INTEGER NOT NULL
);

-- 应用配置（Key-Value）
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 3.2 索引

```sql
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_notes_category ON notes(category_id);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX idx_note_tags_note ON note_tags(note_id);
CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX idx_bookmarks_conversation ON bookmarks(conversation_id);
CREATE INDEX idx_token_stats_date ON token_stats(recorded_at);
```

---

## 四、DeepSeek API 集成

### 4.1 API 封装设计

```typescript
// services/deepseek.ts 核心接口

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];  // 支持多模态
}

interface ChatOptions {
  model: string;               // deepseek-v4-flash | deepseek-v4-pro
  messages: ChatMessage[];
  stream: boolean;             // 默认 true
  temperature?: number;        // 默认 1.0
  max_tokens?: number;
  onChunk?: (chunk: string) => void;  // 流式回调
  onDone?: (usage: TokenUsage) => void;
}

// 流式调用示例
async function streamChat(options: ChatOptions): Promise<void> {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...options, stream: true }),
  });

  const reader = response.body!.getReader();
  // 逐 chunk 解析 SSE 数据...
}
```

### 4.2 模型参数参考

| 模型 | 上下文窗口 | 用途 |
|------|-----------|------|
| deepseek-v4-flash | 1M tokens | 日常对话、笔记整理，响应快 |
| deepseek-v4-pro | 1M tokens | 深度推理、复杂分析 |

**计费参考（截至文档日期，人民币）：**
- deepseek-v4-flash：输入 ¥1/M tokens（缓存命中 ¥0.02），输出 ¥2/M tokens
- deepseek-v4-pro：输入 ¥3/M tokens（缓存命中 ¥0.025），输出 ¥6/M tokens

### 4.3 联网搜索集成

使用 **Tavily API** 实现：
1. 检测到用户开启"联网搜索"开关
2. 先调用 Tavily API 搜索用户问题
3. 将搜索结果作为额外上下文注入 System Prompt
4. 再调用 DeepSeek 生成最终回答

---

## 五、Markdown 主题实现

### 5.1 主题切换方案

通过 CSS Custom Properties 实现主题，切换时仅替换 CSS 类名：

```typescript
const MARKDOWN_THEMES = {
  github:   'theme-github',
  dark:     'theme-dark',
  minimal:  'theme-minimal',
  academic: 'theme-academic',
  terminal: 'theme-terminal',
} as const;
```

### 5.2 主题样式目录

```
src/styles/markdown-themes/
├── base.css       # 共用基础样式
├── github.css
├── dark.css
├── minimal.css
├── academic.css
└── terminal.css
```

---

## 六、构建与打包

### 6.1 开发环境

```bash
npm run dev        # 启动 Vite dev server + Electron
npm run dev:web    # 仅启动 Web（无 Electron，用于 UI 开发）
```

### 6.2 生产打包

使用 **electron-builder**：

```json
{
  "appId": "com.deepseek.notes",
  "productName": "DeepSeek Notes",
  "directories": { "output": "dist-electron" },
  "mac": {
    "target": ["dmg", "zip"],
    "arch": ["x64", "arm64"]
  },
  "win": {
    "target": ["nsis"],
    "arch": ["x64"]
  }
}
```

### 6.3 数据文件位置

| 平台 | 数据目录 |
|------|----------|
| macOS | `~/Library/Application Support/DeepSeek Notes/` |
| Windows | `%APPDATA%\DeepSeek Notes\` |

- `database.sqlite` — 主数据库
- `config.json` — 加密配置（electron-store）
- `attachments/` — 上传的附件文件
