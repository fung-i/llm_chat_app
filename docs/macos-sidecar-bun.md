# macOS：Sidecar 无法监听 / 模型列表只有兜底几项

## 现象

- 打包后的 `.app` 里，`curl http://127.0.0.1:8765/providers` **连接被拒绝**；`lsof -iTCP:8765` **无监听**。
- 终端直接运行 `Contents/MacOS/llm-sidecar` 时出现 **`zsh: killed`**（进程被系统立即终止）。
- 对 `llm-sidecar` 执行 `codesign --force --sign - ./llm-sidecar` 时出现 **`invalid or unsupported format for signature`** 或 **`main executable failed strict validation`**。

## 原因（摘要）

1. **数据流**：界面上的模型列表来自前端请求 **`GET /providers`**（Sidecar 内嵌 `providers.json`），不是直接读仓库里的 JSON。Sidecar 未启动时，前端会落入 `modelStore` / `ModelSelector` 的兜底列表（仅少数几条）。
2. **macOS 与 Bun `build --compile`**：Sidecar 由 `bun build --compile` 生成单文件可执行体。在 **Bun 1.3.12**（当前稳定版曾存在的问题版本）下，**arm64** 产物的 Mach-O / 内嵌代码签名布局有误，会导致：
   - 运行时 **SIGKILL**（表现为 `killed`）；
   - **`codesign` 无法写入合法签名**。

上游讨论与修复方向见：[oven-sh/bun#29270](https://github.com/oven-sh/bun/issues/29270)、[oven-sh/bun#29272](https://github.com/oven-sh/bun/pull/29272) 等。

## 推荐解决方案

### A. 在 macOS 上编译 Sidecar 时使用 Bun 1.3.11（推荐）

稳定版中若 **1.3.12** 有问题，可在**仅用于打 sidecar** 的环境里安装 **1.3.11**：

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.11"
```

确认 `bun --version` 为 `1.3.11` 后，在仓库根目录执行：

```bash
npm run build:sidecar
```

构建脚本会在 **macOS** 上对产物执行 **adhoc 签名**（`codesign --force --sign -`），以满足 Gatekeeper / 子进程拉起常见要求。

### B. 今后若发布 Bun 1.3.13+ 且包含修复

安装官方新版本后重新 `npm run build:sidecar`；若 `codesign` 步骤通过且二进制可运行，可不再固定 1.3.11。以 `bun --version` 与构建日志为准。

### C. 临时跳过版本检查（不推荐）

仅当你确认本机 Bun 已带修复或需排查时，可对构建脚本设置：

```bash
SKIP_BUN_MACOS_COMPILE_CHECK=1 npm run build:sidecar
```

若产物仍 **killed** 或 **codesign 失败**，问题未解决，请勿用于发布。

## 与 Tauri 打包的关系

- `tauri.conf.json` 中 `bundle.externalBin` 指向 `sidecar/dist` 下按目标三元组命名的二进制；构建产物需 **可执行且可被 codesign**，否则主程序即使 `spawn` 成功，子进程也可能无法存活。
- 主程序从终端运行可看 `eprintln!`（例如 sidecar spawn 失败）；仅用 `open` 双击可能看不到终端日志。

## 相关仓库内逻辑

- Sidecar 启动：`src-tauri/src/main.rs`（release 下 `shell().sidecar("llm-sidecar")`，`SIDECAR_PORT=8765`）。
- 前端拉列表：`frontend/src/stores/modelStore.ts` 的 `refreshProviders`；`App.tsx` 在收到 **`sidecar-ready`** 后会再次 `refreshProviders`，避免首屏早于 Sidecar 就绪。
