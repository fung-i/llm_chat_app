# 桌面应用打包指南

本文说明如何从源码打出 **Tauri 桌面包**（macOS `.app` / `.dmg` 等）。Sidecar 与前端由仓库脚本构建；最终由 **`cargo tauri build`** 完成 Rust 编译与 `bundle`。

## 前置条件

| 依赖 | 说明 |
|------|------|
| **Node.js** | 建议 20+；首次需安装前端依赖：`npm --prefix frontend install` |
| **Rust** | 已安装 `rustup`，并装好 Tauri 2 所需目标平台工具链 |
| **Bun** | 用于编译 Sidecar 单文件（`bun build --compile`） |
| **macOS** | Xcode / CLT（命令行工具），用于链接与 `codesign` |

**macOS 上打 Sidecar：** 不要使用 **Bun 1.3.12** 编译 Sidecar（产物会被系统杀死且无法 adhoc 签名）。请使用 **1.3.11** 或文档中说明的其它可用版本，并保证 `PATH` 里 **`~/.bun/bin` 优先于 Homebrew 的 `bun`**。详见 [macos-sidecar-bun.md](./macos-sidecar-bun.md)。

## 在仓库根目录执行（推荐流程）

以下路径均相对于 **`llm_chat_app/`** 根目录。

### 1. 编译 Sidecar（必须最先做）

`tauri.conf.json` 的 `bundle.externalBin` 指向 `sidecar/dist/llm-sidecar-<target-triple>`。打桌面包前必须存在与当前构建目标一致的二进制。

```bash
# macOS：确保用的是可编译 Sidecar 的 Bun（例如 1.3.11）
# export PATH="$HOME/.bun/bin:$PATH"   # 若 Homebrew 的 bun 覆盖了版本
npm run build:sidecar
```

成功时会在 `sidecar/dist/` 下生成例如：

- Apple Silicon：`llm-sidecar-aarch64-apple-darwin`
- Intel Mac：`llm-sidecar-x86_64-apple-darwin`

构建脚本在 **macOS** 上会对该文件执行 **adhoc `codesign`**。

### 2. 打 Tauri 包（会顺带构建前端）

`beforeBuildCommand` 会在打包前执行 **`npm --prefix ./frontend run build`**，因此**不必**在步骤 1 之后再单独跑 `npm run build:web`（除非你只想先验证前端产物）。

```bash
cd src-tauri
cargo tauri build
```

首次或依赖变更后，若 CLI 未就绪，可先安装：

```bash
cargo install tauri-cli --version "^2.0"   # 或与项目 Tauri 2 匹配的版本
# 然后仍使用：cd src-tauri && cargo tauri build
```

### 3. 产物位置

Release 构建默认输出在：

- **macOS**：`src-tauri/target/release/bundle/macos/`  
  - 例如：`LLM Chat App.app`、以及 `targets` 为 `all` 时可能还有 `.dmg` 等。

具体以本机 `cargo tauri build` 结束时的日志为准。

## 一条命令准备「除 Tauri 外」的资源

根目录脚本（**不包含** `cargo tauri build`）：

```bash
npm run build:desktop
```

等价于依次执行 **`build:sidecar`** 与 **`build:web`**。之后再进入 `src-tauri` 执行 **`cargo tauri build`** 即可；此时前端会在 Tauri 的 `beforeBuildCommand` 里再构建一次（重复但无害）。

更省时的做法是：**只** `npm run build:sidecar`，然后 `cargo tauri build`（前端仅由 Tauri 构建一次）。

## Windows 包：通过 GitHub Actions 构建（推荐）

本仓库自带 `.github/workflows/release.yml`，使用 `macos-latest` + `windows-latest` 两个 runner **并行**打出 macOS 与 Windows 安装包：

- **触发方式**
  - 手动：Actions 标签页选 `build-desktop` → `Run workflow`，产物会作为 workflow artifact 上传。
  - 打 tag（如 `git tag v0.1.0 && git push --tags`）：会创建 / 更新一个 **draft GitHub Release**，把两个平台的 `.dmg` / `.app.tar.gz` / `.msi` / `.exe` 等都挂上去。

- **每个 runner 做的事情**（脚本无需改动）：
  1. `npm ci`（含 workspaces）
  2. `npm run build:sidecar`：脚本按本机 triple 自动生成 `llm-sidecar-<triple>[.exe]`，与 `tauri.conf.json` 的 `externalBin` 对得上。
  3. `tauri-apps/tauri-action`：内部跑 `vite build` → `cargo tauri build`，并上传产物。

- **macOS 上仍然不能使用 Bun 1.3.12**（详见 [macos-sidecar-bun.md](./macos-sidecar-bun.md)），workflow 已经把 Bun 版本 pin 在 `1.3.11`。

- **Intel Mac 用户**：当前只在 `macos-latest`（Apple Silicon）上构建。需要 Intel `.dmg` 时，在 matrix 里再加一个 `macos-13` job 即可，无需改其它脚本。

- **代码签名**（可选）：默认产物**未签名**——Windows 首次安装会触发 SmartScreen，macOS 会提示"未识别的开发者"。正式分发请按 Apple Developer / Windows OV/EV 证书流程在 workflow 里加签名步骤。

## 交叉编译与多架构（简要）

为本机构建时，`npm run build:sidecar` 默认按 **当前机器的 `arch` + 系统** 生成三元组。

若 Tauri 在打包时为另一目标设置 **`TAURI_ENV_TARGET_TRIPLE`**（例如统一二进制），需要在该环境下**重新**执行 Sidecar 构建，使 `sidecar/dist/` 中出现对应名字的 `llm-sidecar-<triple>`，否则 `externalBin` 会找不到文件。细节以 [Tauri 2 文档：Sidecar](https://v2.tauri.app/develop/sidecar/) 与当前 CLI 行为为准。

## 分发与签名（简要）

- 本机调试：adhoc 签名后的 Sidecar + 默认 Tauri 构建通常可本地运行。
- 对外分发：通常需要 **Apple Developer** 证书对 **`.app` 签名**并视情况 **公证（notarization）**。此为发布流程，超出本仓库默认脚本范围；请按 Apple 与 Tauri 官方分发文档操作。

## 故障排查

### Sidecar 起不来 / 模型列表只有兜底几项

安装后 **模型列表很少**、底栏 **`Load failed`**、**8765 无监听**——根因都是 sidecar 子进程没活下来。**先在终端直接跑** `"$APP/Contents/MacOS/llm-sidecar"`，按它的输出分诊：

| 终端表现 | 大概率原因 | 处理 |
|------|------|------|
| `zsh: killed`（瞬间退出，无日志） | macOS 上用了 **Bun 1.3.12** 编 sidecar，产物 Mach-O / 签名布局有误被 SIGKILL | [macos-sidecar-bun.md → A](./macos-sidecar-bun.md#a-bun-1312-编出的不可签名二进制) |
| `error: Missing xxx_bg.wasm` / `Cannot find module 'xxx.node'` 后退出 | 依赖带 **wasm/native 副产物**，`bun build --compile` 没把这些资源塞进单文件 `/$bunfs/root/` | [macos-sidecar-bun.md → B](./macos-sidecar-bun.md#b-依赖带-wasmnative-副产物bun-compile-没打进单文件) |
| `Permission denied` / `Bad CPU type in executable` | 隔离属性没清干净，或装错了架构（Intel 装 arm64 包 / 反之） | `xattr -cr "$APP"`；架构对不上就重打或换 release |
| 正常打印 `SIDECAR_READY:8765` 并卡住 | 二进制本身 OK，但 App 里仍取不到 → 多半是端口被占 | 见下方"重编 Sidecar 后 HTTP 仍是旧模型列表"清旧进程 |

> **不要只用 `open` 双击调试**：spawn 失败的 `eprintln!` 进不到终端。从命令行起 `Contents/MacOS/llm-chat-app` 和 `Contents/MacOS/llm-sidecar`，分诊一眼到位。

### 改了 `providers.json` 但界面没有新模型

1. **列表数据来自运行中的 Sidecar，不是磁盘上的 JSON**  
   `providers.json` 在 **`npm run build:sidecar`** 时被编进单文件可执行体。只改仓库里的 JSON、不重编 Sidecar，或只跑 **`cargo tauri build`**（`beforeBuildCommand` **不会**自动编 Sidecar），包内/本机行为都不会更新。

2. **推荐顺序**（在仓库根目录）  
   ```bash
   npm run build:sidecar
   cd src-tauri && cargo tauri build
   ```  
   Debug 包：`cargo tauri build --debug`，产物在 `src-tauri/target/debug/bundle/macos/`。

3. **确认 `.app` 里的 Sidecar 是否带新模型**（路径与名称以本机为准；`find` 找真实路径，勿使用占位符）  
   ```bash
   find "src-tauri/target/debug/bundle/macos" -name "llm-sidecar*" 2>/dev/null
   # 示例：.../LLM Chat App.app/Contents/MacOS/llm-sidecar
   strings ".../LLM Chat App.app/Contents/MacOS/llm-sidecar" | grep -i <新模型关键字>
   ```  
   打进包里的名字可能是 **`llm-sidecar`**，而 `sidecar/dist/` 下可能是 **`llm-sidecar-aarch64-apple-darwin`**，二者对应同一次构建的不同拷贝。

### 重编 Sidecar 后 HTTP 仍是旧模型列表：先杀掉旧进程

在 macOS / Unix 上，**已运行的 `llm-sidecar` 进程不会因为你覆盖了磁盘上的可执行文件而自动升级**；旧进程会继续执行启动时加载进内存的旧代码。表现为：`strings` 看**新文件**已有新模型，但 **`curl http://127.0.0.1:8765/providers` 仍无新项**。

1. 看谁占用 **8765**（Sidecar 默认端口，见 `sidecar/src/index.ts` 与 `main.rs` 里 `SIDECAR_PORT`）  
   ```bash
   lsof -nP -iTCP:8765 -sTCP:LISTEN
   ```

2. 结束该进程（将 `<PID>` 换为上一行输出）  
   ```bash
   kill <PID>
   # 仍不退：kill -9 <PID>
   ```  
   或按命令行匹配：  
   ```bash
   pkill -f llm-sidecar
   ```

3. 确认端口已释放后再启动 **仅一份** Sidecar（例如只开桌面 App，或只在本机手动起 dist 里的二进制），再测：  
   ```bash
   curl -s "http://127.0.0.1:8765/providers" | grep -i <新模型关键字>
   ```

**注意**：开发时若在终端单独跑 **`bun run dev`**（sidecar）或旧 dist 二进制并占用 **8765**，桌面 App 可能连到这份旧实例；更新 Sidecar 后应 **先杀旧进程** 再起 App。

### Stronghold（API 密钥库）与 `illegal non-contiguous size`

- 插件须用 **Argon2 派生 32 字节密钥**（见 [Tauri Stronghold](https://v2.tauri.app/plugin/stronghold/)）。本仓库已使用 **`Builder::with_argon2`**，盐文件为应用本地数据目录下的 **`stronghold_salt.txt`**。
- **旧版**若用「直接把口令当字节」初始化，快照可能无法在 Argon2 下打开。升级后若仍报错，请 **退出应用**，删除（需重做密钥）：  
  - `~/Library/Application Support/com.leey.llmchat/llm-chat.stronghold`（路径以 `identifier` 为准）  
  - 同目录或 **本地数据目录** 下的 **`stronghold_salt.txt`**（与 `app_local_data_dir` 一致）  
  然后重新打开 App 并重新保存各厂商 API Key。
- 快照口令来自前端 **`Stronghold.load(path, password)`** 的第二个参数，默认 **`llm-chat-app`**；自定义时在 **构建前端前** 设置 **`VITE_STRONGHOLD_PASSWORD`**（会打进前端产物）。

### 发送消息报 "Missing API key" / 保存密钥报 "already loaded"

这两个错误往往连锁出现，根本原因是 `frontend/src/lib/keychain.ts` 中 Stronghold 的并发初始化问题：

**"client already loaded before, can not be loaded twice"**：原实现在每次 Stronghold Store promise 完成后将 `storeInit` 重置为 `null`，若此后有并发调用（如快速连续点击"保存"），会再次触发 `loadClient`，而 Stronghold 不允许同一 client 被加载两次。修复方式：将 `vaultInit` 与 `storeInit` 改为**持久化 promise**——一旦 resolve 就复用，不再重置；只有在 `.catch` 时（真正初始化失败）才清空以允许重试。

**"Missing API key for provider X"**：原实现在 `modelStore.ts` 的 `setApiKey` 中先 `await saveApiKey()`，再调用 Zustand `set()` 更新内存状态。若 `saveApiKey` 因上述 Stronghold 报错抛出异常，`set()` 不会执行，当前会话中 `apiKeys` 始终为空，发消息时 sidecar 因找不到密钥而报错。修复方式：**先同步更新内存状态**，再异步持久化；持久化失败只打 `console.error`，不影响当前会话使用。

若你遇到这两个错误，升级到包含以上修复的版本后重新构建即可；已保存在 Stronghold 里的密钥不受影响。

### 其它

- **Sidecar 已更新但 App 里仍是旧行为**：确认已 **`npm run build:sidecar`** → **`cargo tauri build`**（或 `build --debug`），且安装/打开的是**新打出来的** `.app`。

## 相关文件

- `src-tauri/tauri.conf.json` — `productName`、`bundle`、`externalBin`、`beforeBuildCommand`
- `sidecar/scripts/build-sidecar.mjs` — Sidecar 编译与 macOS `codesign`
- 根目录 `package.json` — `build:sidecar`、`build:web`、`build:desktop`
