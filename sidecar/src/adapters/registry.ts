import providers from '../../providers.json' with { type: 'json' }
import type { ProviderRow } from '../types'

const rows = providers as ProviderRow[]

export function listProviders(): ProviderRow[] {
  return rows
}

export function getProvider(modelId: string): ProviderRow | undefined {
  return rows.find((row) => row.id === modelId)
}

export function resolveApiKey(provider: string, apiKeys: Record<string, string> | undefined): string | null {
  if (!apiKeys) return null
  if (apiKeys[provider]) return apiKeys[provider]
  if (provider === 'qwen' || provider === 'doubao' || provider === 'kimi') {
    return apiKeys[provider] ?? apiKeys.openai ?? null
  }
  return null
}
