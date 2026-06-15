<div align="center">

# DeepSeek Notes

**本地优先的 AI 知识管理工具**

对话即笔记，笔记即上下文

[![Version](https://img.shields.io/badge/version-1.0.33-blue?style=flat-square)](https://github.com/shynloc/acks-deepseek-agent/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/shynloc/acks-deepseek-agent/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Issues](https://img.shields.io/github/issues/shynloc/acks-deepseek-agent?style=flat-square)](https://github.com/shynloc/acks-deepseek-agent/issues)

[下载](#下载) · [快速开始](#快速开始) · [功能介绍](#功能介绍) · [配置指南](#配置指南) · [常见问题](#常见问题) · [反馈](#反馈与联系)

</div>

---

## 简介

DeepSeek Notes 是一款运行在本地的 AI 知识管理工具，将 **DeepSeek 大模型对话**与**Markdown 笔记管理**深度融合。

- **AI 对话**中的任意回答，一键存入笔记本
- **笔记**可作为上下文注入 AI 对话，让 AI 了解你的知识库
- 数据**完全本地存储**，隐私安全，无需云端账号
- 支持 Memos / WebDAV **跨设备同步**，按需启用

---

## 下载

前往 [Releases](https://github.com/shynloc/acks-deepseek-agent/releases) 页面下载最新版本。

| 平台 | 文件 |
|------|------|
| macOS Apple Silicon | `DeepSeek Notes-x.x.x-arm64.dmg` |
| macOS Intel | `DeepSeek Notes-x.x.x.dmg` |
| Windows | `DeepSeek Notes Setup x.x.x.exe` *(即将支持)* |

---

## 快速开始

**三步完成基础配置：**

**① 获取 DeepSeek API Key**

前往 [platform.deepseek.com](https://platform.deepseek.com) 注册账号并创建 API Key。新用户享有免费额度。

**② 填写 API Key**

打开应用 → 点击顶部「**个人中心**」→ 在「API 配置」中粘贴 API Key → 点击「测试连接」。

**③ 开始使用**

- 点击「**AI 笔记**」开始与 AI 对话
- 点击「**笔记本**」新建和管理 Markdown 笔记
- 点击「**帮助**」查看完整使用指南

> 💡 同步、图床、语义搜索等高级功能均为可选，按需配置，不影响基础使用。

---

## 功能介绍

### AI 笔记

基于 DeepSeek 模型的智能对话，支持工具调用和上下文增强。

- **多轮对话** — 自动保存对话历史，左侧侧边栏随时切换
- **引用笔记** — 在消息中输入 `[[笔记标题]]` 将笔记内容注入上下文
- **存入笔记** — 任意 AI 回复一键保存为笔记本条目
- **联网搜索** — 接入 Tavily API 实现实时搜索（可选）
- **生成文件** — AI 可生成 `.docx` / `.pptx` / `.xlsx` 并保存到桌面
- **记忆系统** — AI 自动提炼和记忆对话中的关键信息

### 笔记本

功能完整的本地 Markdown 笔记管理器。

- **分类 & 标签** — 多级分类 + 彩色标签，灵活组织笔记
- **全文搜索** — FTS5 全文索引，结果高亮显示匹配片段
- **语义搜索** — 向量相似度搜索，用自然语言找相关笔记（需配置 Embedding API）
- **分栏编辑** — 宽屏下自动分栏，左侧列表 + 右侧编辑，切换笔记单击即可
- **多主题预览** — 前卫海报 / 简约白 / 学术论文等多种排版主题
- **版本历史** — 每次保存自动留存版本，支持一键回滚
- **Wiki 链接** — `[[笔记标题]]` 语法实现跨笔记跳转
- **图片上传** — 粘贴或拖拽图片，自动上传至图床或 Memos 附件
- **导入 / 导出** — 批量导出为 Markdown 文件夹或 JSON；支持从 Markdown 导入
- **快捷方式** — 常用笔记固定到侧边栏，一键直达

### 同步与云端

| 功能 | 说明 | 是否需要自部署 |
|------|------|:--------------:|
| Memos 同步 | 双向同步笔记到 Memos 服务，支持手机端访问 | ✅ 需要 |
| WebDAV 同步 | 同步到 Nextcloud / 坚果云 / 群晖等 | 视服务而定 |
| 图床（CF+R2） | 图片上传到 Cloudflare R2，生成永久链接 | ✅ 需要 |

---

## 配置指南

### API Key 配置

```
个人中心 → API 配置 → 填写 API Key → 测试连接
```

- **API 地址**：默认 `https://api.deepseek.com`，兼容其他 OpenAI 格式服务
- **对话模型**：推荐 `deepseek-chat`（DeepSeek-V3）
- **Tavily API Key**：联网搜索功能所需，在 [tavily.com](https://tavily.com) 免费获取

---

### Memos 同步配置

Memos 是一款开源的碎片笔记服务，需要自托管。

**第一步：部署 Memos（Docker 一键安装）**

```bash
docker run -d \
  --name memos \
  --publish 5230:5230 \
  --volume ~/.memos/:/var/opt/memos \
  neosmemo/memos:stable
```

部署后访问 `http://服务器IP:5230` 完成注册，建议配置 HTTPS 反向代理。

> ⚠️ 请确保 Memos 版本 ≥ v0.23，本应用使用新版 API 格式。

**第二步：获取 Access Token**

Memos → 右上角头像 → 设置 → Access Tokens → Generate Token

Token 格式为 `memos_pat_xxx`。

**第三步：在应用中配置**

```
个人中心 → Memos 同步 → 填写服务器地址和 Token → 测试连接 → 手动同步
```

同步策略：双向同步，以最后修改时间为准（last-write-wins）。

---

### WebDAV 同步配置

支持任何标准 WebDAV 服务：

| 服务 | WebDAV 地址格式 |
|------|-----------------|
| 坚果云 | `https://dav.jianguoyun.com/dav/` |
| Nextcloud | `https://your.nc/remote.php/dav/files/用户名/` |
| 群晖 NAS | `https://your.nas:5006/` |

```
个人中心 → WebDAV 同步 → 填写地址、账号、密码 → 测试连接
```

数据存储在 WebDAV 目录下的 `/DeepSeekNotes/notes_sync.json`。

---

### 图床配置（Cloudflare R2）

需要 Cloudflare 账号（免费）：

1. 登录 Cloudflare → 创建 R2 存储桶
2. 部署配套的 Cloudflare Worker 脚本（管理上传鉴权）
3. 在应用中配置 Worker URL 和管理密码：

```
个人中心 → 图床设置 → 填写 URL 和密码 → 测试连接
```

> 💡 已配置 Memos 同步的用户，图片也可直接上传到 Memos 附件，无需单独配置图床。

---

### 语义搜索配置

用自然语言描述你想找的内容，AI 返回语义相近的笔记。

需要支持 OpenAI Embedding 格式的 API：

```
个人中心 → 语义搜索 → 填写 Embedding 模型名 → 全量建立索引
```

- **推荐模型**：`text-embedding-3-small`（OpenAI）
- API Key 与 AI 对话共用，无需单独配置
- 首次建立索引后，每次保存笔记自动更新
- 在笔记本搜索栏点击紫色 **✦** 图标切换语义搜索模式

---

## 快捷键

| 操作 | macOS | Windows / Linux |
|------|-------|-----------------|
| 新建对话 | `⌘N` | `Ctrl+N` |
| 发送消息 | `⌘↩` | `Ctrl+Enter` |
| 全局搜索 | `⌘⇧F` | `Ctrl+Shift+F` |
| 打开设置 | `⌘,` | `Ctrl+,` |
| 进入笔记本 | `⌘⇧E` | `Ctrl+Shift+E` |
| 快捷键帮助 | `⌘?` | `Ctrl+?` |

---

## 常见问题

<details>
<summary><strong>AI 对话报错「API Key 无效」</strong></summary>

1. 检查个人中心 API Key 是否填写正确，注意前后不要有空格
2. 确认 API Key 在 DeepSeek 控制台未过期或被禁用
3. 点击「测试连接」按钮确认连通性
4. 如果使用第三方 API 转发，检查 API 地址是否正确

</details>

<details>
<summary><strong>图片上传失败</strong></summary>

1. **图床未配置**：进入个人中心配置图床或 Memos 同步
2. **网络问题**：检查 Cloudflare Worker / Memos 服务是否可访问
3. **Token 过期**：重新生成 Memos Token 并更新配置
4. **文件过大**：建议图片压缩到 5MB 以下

</details>

<details>
<summary><strong>Memos 同步报错 404</strong></summary>

1. 确认 Memos 版本 ≥ v0.23
2. 服务器地址末尾不要加 `/`，使用 HTTPS
3. Token 格式应为 `memos_pat_xxx` 开头

</details>

<details>
<summary><strong>语义搜索无结果</strong></summary>

1. 确认已点击「全量建立索引」并等待完成
2. 在个人中心查看索引状态（已索引 N / 共 N 篇）
3. Embedding 模型须与 API Key 对应的服务支持

</details>

<details>
<summary><strong>应用打开后白屏 / 闪退</strong></summary>

1. 尝试完全退出后重新打开
2. macOS 版本需 ≥ 12（Monterey）
3. 确认已将应用移动到「应用程序」文件夹
4. 重置应用数据：删除 `~/Library/Application Support/deepseek-notes/`

</details>

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 桌面框架 | Electron 28 |
| 前端框架 | Vue 3 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| 本地数据库 | SQLite（better-sqlite3）+ FTS5 全文索引 |
| AI 接入 | DeepSeek API（OpenAI 兼容格式） |
| 同步协议 | WebDAV / Memos API v1 |
| 图床 | Cloudflare Worker + R2 |
| 向量搜索 | Embedding + 余弦相似度（本地计算） |

---

## 反馈与联系

遇到 Bug 或有功能建议，欢迎通过以下方式反馈：

- **GitHub Issues**：[提交 Issue](https://github.com/shynloc/acks-deepseek-agent/issues)（推荐，附上截图和操作步骤）
- **邮件**：[telafuka@gmail.com](mailto:telafuka@gmail.com)

提交 Bug 时请附上：操作步骤、错误截图、系统版本、应用版本号（个人中心底部可查）。

---

## License

[MIT](LICENSE) © 2026 shynloc
