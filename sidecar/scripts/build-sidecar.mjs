import { execSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { arch, platform } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function mapTargetTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) {
    return process.env.TAURI_ENV_TARGET_TRIPLE;
  }

  const archMap = {
    arm64: "aarch64",
    x64: "x86_64",
  };

  const cpu = archMap[arch];
  if (!cpu) {
    throw new Error(`Unsupported CPU architecture: ${arch}`);
  }

  if (platform === "darwin") {
    return `${cpu}-apple-darwin`;
  }
  if (platform === "linux") {
    return `${cpu}-unknown-linux-gnu`;
  }
  if (platform === "win32") {
    return `${cpu}-pc-windows-msvc`;
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

function getBunVersion() {
  try {
    return execSync("bun --version", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Bun 1.3.12 on macOS produced broken compile outputs (SIGKILL, uncodesignable Mach-O). See docs/macos-sidecar-bun.md */
function assertUsableBunForMacosCompile() {
  if (platform !== "darwin") return;
  if (process.env.SKIP_BUN_MACOS_COMPILE_CHECK === "1") return;

  const v = getBunVersion();
  if (v === "1.3.12") {
    console.error(
      `[build-sidecar] Refusing to compile with Bun ${v} on macOS: \`bun build --compile\` ` +
        `produces binaries that are killed on launch and cannot be ad-hoc signed.\n` +
        `  Use Bun 1.3.11 for sidecar builds, for example:\n` +
        `    curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.11"\n` +
        `  Then verify: bun --version   # should be 1.3.11\n` +
        `  Or set SKIP_BUN_MACOS_COMPILE_CHECK=1 to override (not recommended for release).\n` +
        `  Documentation: docs/macos-sidecar-bun.md`,
    );
    process.exit(1);
  }
}

function adhocCodesignIfDarwin(binaryPath) {
  if (platform !== "darwin") return;
  console.log("[build-sidecar] codesign (adhoc):", binaryPath);
  try {
    execSync(`codesign --force --sign - "${binaryPath}"`, { stdio: "inherit" });
  } catch {
    console.error(
      "[build-sidecar] codesign failed. The compile output may be uncodesignable with your Bun version.\n" +
        "  See docs/macos-sidecar-bun.md (use Bun 1.3.11 on macOS, or a fixed newer release).",
    );
    process.exit(1);
  }
}

function runBunCompile(outputPath, sidecarRoot) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "bun",
      ["build", "src/index.ts", "--compile", "--outfile", outputPath],
      {
        cwd: sidecarRoot,
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`bun build exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  assertUsableBunForMacosCompile();

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sidecarRoot = resolve(__dirname, "..");
  const distDir = resolve(sidecarRoot, "dist");
  const triple = mapTargetTriple();
  const exeSuffix = triple.includes("windows") ? ".exe" : "";
  const outputPath = resolve(distDir, `llm-sidecar-${triple}${exeSuffix}`);

  await mkdir(distDir, { recursive: true });

  await runBunCompile(outputPath, sidecarRoot);
  adhocCodesignIfDarwin(outputPath);
  console.log("[build-sidecar] done:", outputPath);
}

main().catch((error) => {
  console.error("[build-sidecar] failed:", error);
  process.exit(1);
});
