import { invoke } from '@tauri-apps/api/core'
import { Stronghold, type Store } from '@tauri-apps/plugin-stronghold'
import { isTauriRuntime } from './tauriEnv'

const CLIENT = 'default'
const VAULT_PASS = import.meta.env.VITE_STRONGHOLD_PASSWORD ?? 'llm-chat-app'

// Persistent promises — never reset to null after first resolution, preventing
// concurrent Stronghold.load / loadClient calls from triggering "already loaded" errors.
let vaultInit: Promise<Stronghold | null> | null = null
let storeInit: Promise<{ store: Store; vault: Stronghold } | null> | null = null

async function getVault(): Promise<Stronghold | null> {
  if (!isTauriRuntime()) return null
  if (!vaultInit) {
    vaultInit = (async () => {
      const path = await invoke<string>('app_data_stronghold_path')
      return Stronghold.load(path, String(VAULT_PASS))
    })().catch((e) => {
      vaultInit = null
      throw e
    })
  }
  return vaultInit
}

async function getStore() {
  const v = await getVault()
  if (!v) return null

  if (!storeInit) {
    storeInit = (async () => {
      let client
      try {
        client = await v.loadClient(CLIENT)
      } catch {
        // createClient 本身就会注册并返回 client；再调用 loadClient 会报
        // "client with id ... has already been loaded before, can not be loaded twice"
        client = await v.createClient(CLIENT)
      }
      return { store: client.getStore(), vault: v }
    })().catch((e) => {
      storeInit = null
      throw e
    })
  }
  return storeInit
}

function keyFor(provider: string): string {
  return `apikey_${provider}`
}

export async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  const pair = await getStore()
  if (!pair) return
  const value = Array.from(new TextEncoder().encode(apiKey))
  await pair.store.insert(keyFor(provider), value)
  await pair.vault.save()
}

export async function readApiKey(provider: string): Promise<string | null> {
  const pair = await getStore()
  if (!pair) return null
  const raw = await pair.store.get(keyFor(provider))
  if (!raw || raw.length === 0) return null
  return new TextDecoder().decode(raw)
}

export async function loadAllApiKeys(): Promise<Record<string, string>> {
  const providers = ['openai', 'anthropic', 'google', 'glm', 'deepseek', 'qwen', 'doubao', 'kimi']
  const out: Record<string, string> = {}
  for (const provider of providers) {
    const value = await readApiKey(provider)
    if (value) out[provider] = value
  }
  return out
}
