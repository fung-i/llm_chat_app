# macOS：Sidecar 无法监听 / 模型列表只有兜底几项

打包后的 App **看起来正常**（窗口能开），但前端拿不到模型列表、底栏 `Load failed`，根因都是 **`Contents/MacOS/llm-sidecar` 没在 8765 端口起来**。本机有两类完全不同的故障会落到同一个症状，按出现概率从高到低写在下面，**先按"快速分诊"判断属于哪种**，再读对应的小节修复。

## 快速分诊

```bash
APP="/Applications/LLM Chat App.app"
codesign -dv --verbose=2 "$APP/Contents/MacOS/llm-sidecar" 2>&1 | head -10
"$APP/Contents/MacOS/llm-sidecar"
```

- 第二条命令立刻输出 **`zsh: killed`** → 是 [A. Bun 1.3.12 编出的不可签名二进制](#a-bun-1312-编出的不可签名二进制)。
- 第二条命令打印一行 **`error: Missing xxx_bg.wasm`** / `error: Cannot find module 'xxx.node'` 之类后退出 → 是 [B. 依赖带 wasm/native 副产物，bun compile 没打进单文件](#b-依赖带-wasmnative-副产物bun-compile-没打进单文件)。
- 第二条命令 **正常打印 `SIDECAR_READY:8765`** 并卡住 → 二进制本身没问题，去看 [`docs/desktop-build.md` 的"Sidecar 起不来"小节](./desktop-build.md#sidecar-起不来--模型列表只有兜底几项)（多半是隔离属性、端口被占、或装错架构的包）。

> 别忘了：从 GitHub Release 下载的未签名 `.app` 在第一次运行前必须 `xattr -cr "$APP"` 清掉 `com.apple.quarantine`，否则连主程序自身都会被报"已损坏"。

---

## A. Bun 1.3.12 编出的不可签名二进制

### 现象

- 打包后的 `.app` 里，`curl http://127.0.0.1:8765/providers` **连接被拒绝**；`lsof -iTCP:8765` **无监听**。
- 终端直接运行 `Contents/MacOS/llm-sidecar` 时出现 **`zsh: killed`**（进程被系统立即终止）。
- 对 `llm-sidecar` 执行 `codesign --force --sign - ./llm-sidecar` 时出现 **`invalid or unsupported format for signature`** 或 **`main executable failed strict validation`**。

### 原因

Sidecar 由 `bun build --compile` 生成单文件可执行体。在 **Bun 1.3.12**（曾存在的稳定版问题版本）下，**arm64** 产物的 Mach-O / 内嵌代码签名布局有误，会导致：

- 运行时 **SIGKILL**（表现为 `killed`）；
- **`codesign` 无法写入合法签名**。

上游讨论与修复方向见：[oven-sh/bun#29270](https://github.com/oven-sh/bun/issues/29270)、[oven-sh/bun#29272](https://github.com/oven-sh/bun/pull/29272) 等。

### 修复

#### A1. 在 macOS 上编译 Sidecar 时使用 Bun 1.3.11（推荐）

稳定版中若 **1.3.12** 有问题，可在**仅用于打 sidecar** 的环境里安装 **1.3.11**：

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.11"
```

确认 `bun --version` 为 `1.3.11` 后，在仓库根目录执行：

```bash
npm run build:sidecar
```

构建脚本会在 **macOS** 上对产物执行 **adhoc 签名**（`codesign --force --sign -`），以满足 Gatekeeper / 子进程拉起常见要求。

#### A2. 今后若发布 Bun 1.3.13+ 且包含修复

安装官方新版本后重新 `npm run build:sidecar`；若 `codesign` 步骤通过且二进制可运行，可不再固定 1.3.11。以 `bun --version` 与构建日志为准。

#### A3. 临时跳过版本检查（不推荐）

仅当你确认本机 Bun 已带修复或需排查时，可对构建脚本设置：

```bash
SKIP_BUN_MACOS_COMPILE_CHECK=1 npm run build:sidecar
```

若产物仍 **killed** 或 **codesign 失败**，问题未解决，请勿用于发布。

---

## B. 依赖带 wasm/native 副产物，bun compile 没打进单文件

### 现象

- `codesign -dv` 显示二进制 **adhoc 签名正常**（`Signature=adhoc`），不是 1.3.12 的不可签名状态。
- 在终端直接跑 `Contents/MacOS/llm-sidecar`，**不会**出现 `zsh: killed`，而是打印一行类似下面的错误**然后退出**：

  ```
  error: Missing tiktoken_bg.wasm
    at /$bunfs/root/llm-sidecar-aarch64-apple-darwin:12046:9
  ```

  路径里的 `/$bunfs/root/` 是 Bun 单文件可执行体的虚拟文件系统根。

### 原因

`bun build --compile` 把所有 **JS 模块**捆进单文件，但**不会自动**把依赖的 **`.wasm`** / **`.node`** 等运行时辅助文件一起塞进 `/$bunfs/root/`。某些第三方包（典型的就是 `@dqbd/tiktoken`）在加载阶段直接用 `fs.readFileSync('xxx_bg.wasm')` 找硬盘上的副产物——在源码 / `bun run dev` / `bun build` 普通打包下都能找到，**只有 `--compile` 单文件场景下找不到**，于是模块加载就抛异常，sidecar 一启动就崩。

要命的是这种崩溃发生在**模块顶层 import 阶段**，业务代码里的 try/catch（比如 `tokenCounter.ts` 包 `getEncoder()` 的那个）**不会**兜住它。

### 修复

#### B1. 优先：换成纯 JS 实现的等价依赖（推荐）

凡是有"纯 JS 版本"的，直接换。仓库内已经做过的一例：

| 旧依赖（带 wasm，会炸） | 新依赖（纯 JS，OK） |
|------|------|
| `@dqbd/tiktoken` | [`js-tiktoken`](https://www.npmjs.com/package/js-tiktoken)（API 几乎一致） |

```bash
npm --prefix sidecar uninstall @dqbd/tiktoken
npm --prefix sidecar install js-tiktoken
```

代码里 `import { get_encoding }` 改成 `import { getEncoding }`，其他用法一致。

#### B2. 实在没有纯 JS 替代品时

只能让 wasm/native 副产物**进入** `/$bunfs/root/`。常见做法：

- 用 `import` 语法显式引入资源（Bun compile 对 `import wasm from './x.wasm'` 这种**显式 import** 会一并打包），并在你这边的封装里用 `WebAssembly.instantiate` 自己初始化，绕开依赖包内部那段 `fs.readFileSync`。
- 或在 sidecar 启动时把内嵌的 base64 wasm 写到临时目录，`process.env.<PKG>_WASM_PATH` 指过去（要看依赖是否暴露这个 hook）。

总之只要那段 `fs.readFileSync('xxx_bg.wasm')` 还在执行，就得保证它能命中。

#### B3. 排查新引入的依赖是否是这种"地雷"

加新 npm 包后，**别只跑 `bun run dev`**（开发模式下 wasm 在 `node_modules` 里能找到，永远不会复现），一定要：

```bash
npm run build:sidecar
./sidecar/dist/llm-sidecar-<triple>     # 直接跑单文件可执行体
```

只要这一步能打印 `SIDECAR_READY:8765` 并卡住不退，说明这个依赖在 `bun --compile` 下 OK；否则按上面方案处理。

---

## 与 Tauri 打包的关系

- `tauri.conf.json` 中 `bundle.externalBin` 指向 `sidecar/dist` 下按目标三元组命名的二进制；构建产物需 **可执行、可被 codesign、且能在 `/$bunfs/root/` 下自洽运行**，否则主程序即使 `spawn` 成功，子进程也可能无法存活。
- 主程序从终端运行可看 `eprintln!`（例如 sidecar spawn 失败）；仅用 `open` 双击可能看不到终端日志。**调试时务必从终端跑** `Contents/MacOS/llm-chat-app` 与 `Contents/MacOS/llm-sidecar`，能直接看到上面 A / B 两类的差异。

## 相关仓库内逻辑

- Sidecar 启动：`src-tauri/src/main.rs`（release 下 `shell().sidecar("llm-sidecar")`，`SIDECAR_PORT=8765`）。
- 前端拉列表：`frontend/src/stores/modelStore.ts` 的 `refreshProviders`；`App.tsx` 在收到 **`sidecar-ready`** 后会再次 `refreshProviders`，避免首屏早于 Sidecar 就绪。
