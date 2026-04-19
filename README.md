# LLM Chat App

Tauri 2 + React + Bun sidecar 的桌面端大模型对话应用：左栏为完整对话，右栏为可编辑的实际上下文；支持多模型、SQLite 持久化、Stronghold 密钥存储。

## 功能概览

- **双栏**：真实对话 / 发送给模型的上下文（可移除、恢复、改写、手动插入）
- **上下文策略**：`manual` / `auto_trim` / `summarize`（sidecar 在请求前裁剪；摘要按钮调用 `/summarize`）
- **多模型**：OpenAI 兼容（含 Qwen、Doubao、Kimi）、Anthropic、Gemini、GLM（见 `sidecar/providers.json`）
- **存储**：`tauri-plugin-sql` + SQLite（`conversations` / `messages` / `model_profiles`）
- **密钥**：`@tauri-apps/plugin-stronghold`（Argon2；默认口令 `llm-chat-app`，构建前端前可用 `VITE_STRONGHOLD_PASSWORD` 覆盖；详见 `docs/desktop-build.md`）
- **Sidecar**：开发时默认 `8765`；Tauri 开发模式会 `emit('sidecar-ready')`；生产包内由 Rust 拉起 `llm-sidecar` 并解析 `SIDECAR_READY:` 日志

## 环境要求

- Node.js 20+
- Bun 1+（**在 macOS 上打 Sidecar 单文件时请勿使用 Bun 1.3.12**，见 [docs/macos-sidecar-bun.md](docs/macos-sidecar-bun.md)；推荐用 **1.3.11** 执行 `npm run build:sidecar`）
- Rust + Tauri 桌面依赖（仅打包/运行桌面时需要）

## 本地开发（浏览器 + Sidecar）

1. 启动 sidecar：`bun --cwd sidecar run dev`
2. 启动前端：`npm --prefix frontend run dev`  
   Vite 将 `/sidecar-proxy` 代理到 `http://127.0.0.1:8765`，避免 CORS。

## Tauri 桌面开发

```bash
npm --prefix frontend install
cd src-tauri && cargo tauri dev
```

开发构建前请自行启动 sidecar（或依赖 `sidecar-ready` 事件中的端口）。

## 桌面发布构建

1. 编译 sidecar 二进制：`npm run build:sidecar`（输出 `sidecar/dist/llm-sidecar`）
2. 构建前端：`npm run build:web`
3. 打包应用：`cd src-tauri && cargo tauri build`

根目录 `npm run build:desktop` = sidecar + 前端（不含 `cargo tauri build`）。

## 配置 API Key

在应用内打开「密钥与参数」，按厂商保存。也可在 Tauri 中通过 Stronghold 快照文件读写（路径由 `app_data_stronghold_path` 命令解析）。

## 目录结构（摘要）

- `frontend/` — React + Vite
- `sidecar/` — Bun + Hono，适配器与 `providers.json`
- `src-tauri/` — Rust、SQL 迁移、capabilities、sidecar 进程（release）

## 相关文档

- 执行级说明见仓库根目录 [PROJECT_PLAN.md](PROJECT_PLAN.md)
- **桌面包怎么打** → [docs/desktop-build.md](docs/desktop-build.md)
- macOS：**Sidecar 无法启动 / 模型列表异常** → [docs/macos-sidecar-bun.md](docs/macos-sidecar-bun.md)
