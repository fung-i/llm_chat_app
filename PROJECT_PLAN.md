# LLM Chat App 项目文档

## 1. 项目定位

这是一个桌面端大模型对话工具，核心差异化能力不是“普通聊天”，而是“上下文可视化与可控”。

产品目标：

- 支持多模型统一接入：ChatGPT、Claude、Gemini、Qwen、Doubao、Kimi、GLM
- 支持自动与手动混合的上下文管理
- 对每一轮请求做到“可解释”：清楚看到真实对话与实际发送上下文的差异

核心体验：

- 左栏展示完整真实对话历史
- 右栏展示每轮实际发送给模型的上下文，可手动增删改
- 右栏操作会实时反馈到左栏状态（在上下文中/已移除/已改写）

---

## 2. 技术架构与选型结论

采用混合架构：

- 前端：React + TypeScript + Zustand（高频交互状态在前端内存）
- 桌面容器：Tauri 2（Rust）
- LLM 服务层：Bun Sidecar + Hono（TypeScript，负责多模型调用与流式输出）
- 本地存储：SQLite（经 Tauri IPC）
- 密钥存储：Stronghold（系统安全存储）

架构原则：

- 高频 UI 交互放前端，保证响应速度
- 密钥与本地安全能力放 Rust/Tauri
- 复杂 LLM 协议适配放 TypeScript sidecar，利用成熟 SDK 生态

---

## 3. 当前代码状态（基于仓库现状）

已完成：

- `frontend` 已有双栏 UI MVP
- 已有 `Zustand` 状态管理，支持上下文消息移除/恢复/编辑/手动添加
- 已有 `sidecar` MVP，提供 `/health` 与 `/chat/stream`（当前为 mock 流）
- 已有 `src-tauri` 工程骨架与占位命令（`save_conversation`、`save_api_key`）
- 前端构建通过

未完成：

- sidecar 多模型真实适配
- SQLite 持久化 CRUD 与迁移
- Stronghold 密钥读写打通
- Tauri sidecar 生命周期与端口协商
- 会话列表、设置页、上下文摘要压缩策略

---

## 4. 模块设计

### 4.1 前端模块（`frontend/src`）

- `components/ConversationPane`: 左栏真实对话显示
- `components/ContextPane`: 右栏上下文编辑与 token 展示
- `components/MessageInput`: 消息输入
- `components/ModelSelector`: 模型选择
- `stores/chatStore`: 全局状态、发送流程编排
- `lib/sidecarClient`: 与 sidecar 的 HTTP/SSE 通信
- `lib/tauriBridge`: Tauri IPC 调用封装

前端职责：

- 负责所有交互与渲染
- 维护当前会话工作状态（包含 context 编辑态）
- 发起发送请求与处理流式渲染

### 4.2 Sidecar 模块（`sidecar/src`）

- `index.ts`: Hono 入口
- 后续新增：
  - `adapters/`: 各模型适配器
  - `services/contextManager.ts`: auto_trim/manual/summarize
  - `services/tokenCounter.ts`: token 统计

sidecar 职责：

- 统一多模型接口
- 屏蔽不同厂商流式协议差异
- 作为“LLM 编排中枢”

### 4.3 Tauri/Rust 模块（`src-tauri`）

- `src/main.rs`: 插件注册与命令暴露
- 后续新增：
  - 数据库初始化与迁移
  - Stronghold 密钥服务
  - sidecar 进程拉起与端口通知

Rust 职责：

- 安全能力（密钥）
- 本地系统能力（进程、文件、数据库桥接）
- 应用生命周期管理

### 4.4 与早期「目录树 / 要点」文档的对照（建议以此为准）

你之前贴的结构**方向正确**，但与**当前仓库**有几处需要改写法或标注「目标 vs 现状」：

| 条目 | 原计划写法 | 建议修正 |
| --- | --- | --- |
| 前端根目录 | 根目录 `src/` | 当前为 **`frontend/src/`**（Vite 默认）；文档与脚本一律写 `frontend/src` |
| Rust 命令拆分 | `commands.rs` | **尚未拆分**，命令在 `src-tauri/src/main.rs`；`commands.rs` 可作为后续重构项 |
| 样式方案 | TailwindCSS | 计划里提过；**当前 MVP 用 `App.css`/`index.css`**，是否上 Tailwind 可后置决定 |
| Zustand 模型 | `messages` + `contextMessages` 双数组 | **当前实现为单数组** `messages[]`，每条含 `displayContent` / `contextContent` / `inContext`；双数组适合「右栏独立排序、影子消息」时再演进 |
| Stronghold | `invoke('plugin:stronghold|save_secret', …)` | **目标形态**；当前为占位 `save_api_key` 命令，尚未写入 vault |
| Sidecar 端口 | 随机端口 + Tauri `emit` | sidecar 已 `console.log('SIDECAR_READY:…')`，默认 **`8765`**（`SIDECAR_PORT`）；**Tauri 消费端口并通知前端仍为待办** |
| 浏览器开发 | 仅写 fetch 链路 | **`localhost:5173` → `127.0.0.1:8765` 可能 CORS**；需在 sidecar 加 CORS 头，或 Vite `proxy`，或仅在 Tauri webview 同源下开发 |
| `providers.json` | 已存在 | **尚未添加**，属 Phase 1 侧工作 |
| `externalBin` | 打包嵌入 sidecar | `tauri.conf.json` 已配置路径；**需先 `bun build` 产出二进制**，否则正式打包会失败 |

### 4.5 目录结构（当前实际）

```
llm_chat_app/
├── frontend/                 # React + Vite（源码在 frontend/src）
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── components/       # ConversationPane, ContextPane, MessageInput, ModelSelector
│   │   ├── stores/chatStore.ts
│   │   ├── lib/sidecarClient.ts
│   │   ├── lib/tauriBridge.ts
│   │   └── types.ts
│   └── …
├── sidecar/
│   ├── src/index.ts          # Hono + /health + /chat/stream（mock SSE）
│   └── package.json
├── src-tauri/
│   ├── src/main.rs           # 插件注册 + save_conversation / save_api_key 占位
│   ├── Cargo.toml
│   └── tauri.conf.json
├── PROJECT_PLAN.md
├── README.md
└── package.json              # workspaces：frontend、sidecar
```

### 4.6 目录结构（目标演进，可与早期文档对齐）

在 Phase 1～3 逐步靠拢以下结构（与 `.cursor/plans` 中设计一致）：

```
llm_chat_app/
├── src-tauri/
│   └── src/
│       ├── main.rs           # 入口：注册插件、spawn sidecar
│       └── commands.rs       # 自定义命令（端口、密钥、DB 桥接等）
├── frontend/src/
│   ├── components/
│   │   ├── layout/           # Sidebar 等
│   │   ├── message/          # MessageBubble、ContextMessageItem
│   │   ├── input/
│   │   └── settings/
│   ├── stores/               # conversationStore / messageStore / modelStore（或保留 chatStore 再拆）
│   ├── lib/                  # db.ts、sidecarClient.ts、keychain.ts
│   └── types/                # 与 sidecar 共享的 DTO（或 packages/types）
├── sidecar/src/
│   ├── index.ts
│   ├── routes/chat.ts
│   ├── adapters/
│   └── services/
└── sidecar/providers.json
```

### 4.7 关键实现要点（修订版）

**流式输出（目标协议不变）**

```
React → POST /chat/stream（JSON：conversationId、modelId、messages）
     ← SSE: data: {"delta":"..."}\n\n
     ← SSE: data: {"usage":{...}}\n\n   # 可选，待实现
     ← data: [DONE]\n\n
```

**Sidecar 就绪通知**

- 现状：sidecar 启动时打印 `SIDECAR_READY:${port}`（见 `sidecar/src/index.ts`）。
- 待办：Rust 读取 stdout 或通过受控参数启动 sidecar，再用 `app.emit('sidecar-ready', { port })` 或 `invoke` 返回端口给前端；前端 `localStorage.sidecar_url` 仅作开发兜底。

**双栏状态（文档与代码对齐说明）**

- MVP：`messages: ChatMessage[]`，右栏通过 `inContext` + `contextContent` 派生展示；发送时 `filter(inContext)` 组装 payload。
- 若后续需要右栏**独立排序**或**仅存在于上下文的条目**（左栏不显示），再引入 `contextMessages[]` 或 `contextOrder: string[]`。

**API Key**

- 目标：`tauri-plugin-stronghold` 插件 API 或封装后的 `invoke('save_api_key', …)` 写入 vault，**不落明文配置文件**。
- Sidecar 需要 key 时：由前端经 IPC 取回后**单次请求传入**或 session 握手写入 sidecar 内存（设计文档中写清，避免 key 常驻前端）。

**打包**

- `bun build src/index.ts --compile --outfile dist/llm-sidecar`（与 `sidecar/package.json` 脚本一致）。
- `tauri.conf.json` 的 `bundle.externalBin` 已指向 `../sidecar/dist/llm-sidecar`；发布流水线需包含 **先构建 sidecar 再 `tauri build`**。

---

## 5. 数据模型（目标）

### conversations

- `id`
- `title`
- `model_id`
- `system_prompt`
- `context_strategy` (`auto_trim` | `manual` | `summarize`)
- `created_at`
- `updated_at`

### messages

- `id`
- `conversation_id`
- `role` (`system` | `user` | `assistant`)
- `display_content`（左栏显示原文）
- `context_content`（右栏发给模型内容）
- `in_context`（是否参与当前上下文）
- `is_context_modified`（是否改写）
- `token_count`
- `created_at`

### model_profiles

- `id`
- `name`
- `provider`
- `adapter`
- `base_url`
- `context_window`
- `default_params`（JSON）

---

## 6. 关键数据流

### 6.1 发送消息主链路

1. 用户输入消息
2. 前端将用户消息写入左栏与右栏状态
3. 前端组装“当前右栏 in_context 消息”请求 sidecar
4. sidecar 调用目标模型并 SSE 回流
5. 前端增量渲染 assistant 回复
6. 结束后持久化会话与消息

### 6.2 上下文编辑链路

1. 用户在右栏移除/恢复/改写消息
2. 前端立即更新状态与左栏标签状态
3. 异步落盘，不阻塞 UI

### 6.3 密钥链路

1. 用户在设置页输入 API Key
2. 前端调用 Tauri 命令存入 Stronghold
3. 发送前通过受控流程提供给 sidecar 使用（仅内存）

---

## 7. 分阶段实施计划

## Phase 0 - 骨架（已完成）

- [x] React/Tauri/sidecar 基础目录
- [x] 双栏 MVP 页面
- [x] SSE 客户端协议骨架
- [x] sidecar mock 流式响应

## Phase 1 - 可用聊天闭环（优先级最高）

- [ ] sidecar 接入 OpenAI-compatible 适配器（先打通 GPT + Qwen + Kimi + Doubao）
- [ ] 增加统一错误处理（超时、429、401、网络中断）
- [ ] 前端流式中断/重试机制
- [ ] 端到端验证真实模型输出

交付标准：

- 能选择至少 2 个真实模型并稳定流式对话

## Phase 2 - 本地数据与安全

- [ ] SQLite schema + migration
- [ ] conversations/messages CRUD
- [ ] Stronghold API Key 存取
- [ ] 会话恢复（重启后能还原）

交付标准：

- 关闭应用再打开，会话与配置可恢复

## Phase 3 - 上下文管理能力增强

- [ ] auto_trim 策略
- [ ] summarize 策略
- [ ] token 精确统计（接入 tiktoken/模型计数策略）
- [ ] 右栏高级操作（批量移除、摘要替换）

交付标准：

- 长对话下仍能稳定控制上下文并可解释

## Phase 4 - 桌面化发布能力

- [ ] Tauri 启动/关闭 sidecar 生命周期
- [ ] sidecar 端口协商与健康检查
- [ ] bun compile 后 externalBin 打包
- [ ] macOS 首发包验证

交付标准：

- 用户无需本地安装 Bun/Python/Rust 即可运行发行版

---

## 8. 风险与对策

- Sidecar 不可达导致 `Failed to fetch`
  - 对策：启动健康探测、UI 明确提示、自动重连
- 多厂商 API 兼容差异
  - 对策：适配器模式 + 统一错误模型
- Token 估算误差导致截断
  - 对策：预估 + 安全边界 + 供应商计数接口优先
- 密钥暴露风险
  - 对策：Stronghold 持久化、sidecar 内存短驻、日志脱敏

---

## 9. 验收标准（MVP）

MVP 必须满足以下条件：

- 能在桌面端完成至少 2 个模型的流式对话
- 左右双栏行为一致且可解释
- 支持手动上下文管理（移除、恢复、改写、手动插入）
- 能保存并恢复会话
- API Key 不明文落盘

---

## 10. 开发规范建议

- 所有接口定义统一放在共享 types（后续建议建立 `packages/types`）
- sidecar 对外只暴露稳定 DTO，避免泄漏供应商细节到前端
- 前端与 sidecar 的错误码采用统一枚举
- 每个 Phase 结束前必须补一轮最小集成测试（至少 smoke）

---

## 11. 下一步执行建议

建议立即进入 Phase 1，按以下顺序推进：

1. 先打通 OpenAI-compatible（一套代码覆盖多厂商）
2. 再接 Anthropic 与 Gemini
3. 最后补 GLM 与统一错误处理

这样可以最早拿到“真实可用”的业务价值，并降低首次上线风险。
