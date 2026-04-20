# LLM Chat App

一个本地运行的多模型大模型对话桌面应用：左栏看完整对话历史，右栏直接编辑实际发送给模型的上下文，自带 SQLite 持久化与本地加密的 API Key 存储。

> 目前提供 macOS（Apple Silicon）与 Windows 安装包，所有数据都只在本机。

---

## 一、使用方式

### 1. 下载安装包

到仓库的 [Releases 页面](https://github.com/fung-i/llm_chat_app/releases) 选最新版本：

- **macOS（Apple Silicon）**：`LLM Chat App_*.dmg` 或 `LLM Chat App.app.tar.gz`
- **Windows**：`LLM Chat App_*_x64-setup.exe` 或 `*.msi`

> 暂未提供 Intel Mac 包。如果你是 Intel Mac，需要按文末"开发者"一节自行打包。

### 2. macOS 首次打开必做一步（清除"已损坏"提示）

下载下来的 `.app` 由于**未做 Apple 公证**，macOS 会标记为"已损坏，无法打开"。把 App 拖进 `/Applications/` 之后，在终端执行一次：

```bash
xattr -cr "/Applications/LLM Chat App.app"
```

`-r` 必须有，要递归清掉包内所有文件（包括内嵌的 sidecar 进程）的 `com.apple.quarantine` 隔离属性，否则即便主程序能开，模型列表也会拉不到。

清完之后双击打开即可。

> Windows 首次安装会触发 SmartScreen "未识别的发布者"，点 **More info → Run anyway** 即可。

### 3. 配置 API Key

打开 App 后，右上角进入 **「密钥与参数」**，按厂商把 API Key 填进去保存。Key 通过 Tauri Stronghold（Argon2 加密）存在本机，**不会上传任何服务器**。

支持的模型：

| 厂商 | 模型示例 | 备注 |
|------|------|------|
| OpenAI | GPT-4o、GPT-4o mini | 官方 endpoint |
| Anthropic | Claude 3.7 Sonnet | 官方 endpoint |
| Google | Gemini 2.5 Pro | 官方 endpoint |
| 阿里云 | Qwen Max | DashScope 兼容模式 |
| 字节 | Doubao Pro | 火山方舟 |
| Moonshot | Kimi Latest | |
| 智谱 | GLM-4 | |
| DeepSeek | DeepSeek Chat / Reasoner (R1) | |

> 完整清单见 [`sidecar/providers.json`](sidecar/providers.json)。每条只在你**填了对应厂商 Key 后**才能实际发起请求。

### 4. 开始用

- **左栏 — 真实对话**：你和模型完整的来回。
- **右栏 — 实际上下文**：每次发送时**真正会传给模型**的内容，可以单独移除/恢复某条、改写某条文字、手动插入一段。这一栏是这个 App 的核心区别——你可以在长对话里精确控制"模型这一轮看到的是什么"。
- **顶栏模型选择**：下拉切换。每个对话各自记忆上次用的模型。
- **底栏上下文策略**：
  - `manual`：完全由你在右栏决定；
  - `auto_trim`：超过模型上下文窗口时自动从最旧的非系统消息开始裁；
  - `summarize`：超出时按你点击的"摘要"动作把早期消息折叠成摘要。

### 5. 数据放在哪 / 怎么清掉

- **会话与消息**（SQLite）：`~/Library/Application Support/com.leey.llmchat/llm_chat.db`（macOS）；Windows 在 `%APPDATA%\com.leey.llmchat\`。
- **API Key**（Stronghold 加密快照）：同目录下的 `llm-chat.stronghold` 与 `stronghold_salt.txt`。
- 想完全重置：退出 App，删上面这几个文件即可，重新打开就是干净状态。

### 6. 出问题了？

| 现象 | 看哪 |
|------|------|
| macOS 提示"已损坏，无法打开" | 上面第 2 步 `xattr -cr` |
| 打开后底栏 `Load failed`、模型选择器只有几个 | sidecar 没起来 → [docs/macos-sidecar-bun.md](docs/macos-sidecar-bun.md) |
| 发消息报 `Missing API key` | 在「密钥与参数」里确认对应厂商已填，看 [docs/desktop-build.md → "Stronghold"](docs/desktop-build.md) |
| 其它 | [docs/desktop-build.md → 故障排查](docs/desktop-build.md) |

---

## 二、功能特性

- **完整对话 / 实际上下文 双栏**：所见即所发，长对话里精确控制每一轮喂给模型的内容
- **多家模型一处切换**：OpenAI、Anthropic、Gemini、GLM、Qwen、Doubao、Kimi、DeepSeek（含 R1）
- **三种上下文策略**：`manual` / `auto_trim` / `summarize`，sidecar 在请求前裁剪；摘要走 `/summarize`
- **本地优先**：会话历史 SQLite 存本机；API Key 走 Tauri Stronghold（Argon2 派生密钥）加密落盘
- **零外部依赖运行**：所有 LLM 请求由本地 sidecar（`127.0.0.1:8765`，仅监听本地回环）转发到各厂商
- **跨平台**：macOS（Apple Silicon）与 Windows 由 GitHub Actions 自动出包

---

## 三、开发者：本地跑 / 自己打包

### 环境要求

- Node.js 20+
- Bun 1+（**macOS 上打 sidecar 单文件时请勿使用 Bun 1.3.12**，见 [docs/macos-sidecar-bun.md](docs/macos-sidecar-bun.md)；推荐用 **1.3.11** 执行 `npm run build:sidecar`）
- Rust + Tauri 2 桌面依赖（仅打包/运行桌面时需要）

### 浏览器开发模式

```bash
bun --cwd sidecar run dev          # 启动 sidecar（127.0.0.1:8765）
npm --prefix frontend run dev      # 启动前端，Vite 把 /sidecar-proxy 代理到 sidecar
```

### Tauri 桌面开发

```bash
npm --prefix frontend install
cd src-tauri && cargo tauri dev
```

开发模式下 sidecar 不由 Tauri 拉起，需自行运行（或依赖前端收到的 `sidecar-ready` 端口）。

### 桌面发布构建

```bash
npm run build:sidecar              # 在 sidecar/dist/ 出单文件二进制
cd src-tauri && cargo tauri build  # 触发前端构建并出 .app / .dmg / .msi 等
```

完整说明、跨架构、Windows / macOS workflow 见 [docs/desktop-build.md](docs/desktop-build.md)。

### 目录结构

- `frontend/` — React + Vite + Zustand
- `sidecar/` — Bun + Hono，各厂商适配器与 `providers.json`
- `src-tauri/` — Rust 主程序、SQL 迁移、capabilities、release 下拉起 sidecar 子进程
- `.github/workflows/release.yml` — 多平台并行打包，tag `v*` 时自动建 draft Release

---

## 相关文档

- [PROJECT_PLAN.md](PROJECT_PLAN.md) — 执行级设计说明
- [docs/desktop-build.md](docs/desktop-build.md) — 桌面包怎么打 / 故障排查
- [docs/macos-sidecar-bun.md](docs/macos-sidecar-bun.md) — macOS sidecar 启动失败两类成因（Bun 1.3.12 / wasm 副产物）
