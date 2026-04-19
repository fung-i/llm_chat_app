import { useState } from 'react'
import { useModelStore } from '../stores/modelStore'

interface ModelSettingsProps {
  open: boolean
  onClose: () => void
}

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI / 兼容（含 Qwen、Kimi、Doubao 可填 openai 或各厂商 key）' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'glm', label: '智谱 GLM' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'qwen', label: '通义千问（可选，默认可用 openai 位）' },
  { id: 'doubao', label: '豆包（可选）' },
  { id: 'kimi', label: 'Kimi（可选）' },
] as const

export function ModelSettings({ open, onClose }: ModelSettingsProps) {
  const { apiKeys, temperature, maxTokens, setApiKey, setTemperature, setMaxTokens } = useModelStore()
  const [draft, setDraft] = useState<Record<string, string>>({})

  if (!open) return null

  const saveKey = async (provider: string) => {
    const draftVal = draft[provider]
    const value = draftVal !== undefined ? draftVal : (apiKeys[provider] ?? '')
    await setApiKey(provider, value)
    setDraft((state) => {
      const next = { ...state }
      delete next[provider]
      return next
    })
  }

  return (
    <div
      className="modalBackdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modalPanel">
        <header className="modalHeader">
          <h2>模型与密钥</h2>
          <button type="button" className="modalClose" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="modalBody">
          <p className="modalHint">
            密钥保存在 Stronghold（Argon2 派生密钥）。默认口令 <code>llm-chat-app</code>；自定义时请在构建前端前设置{' '}
            <code>VITE_STRONGHOLD_PASSWORD</code>。若曾出现 vault 损坏报错，可退出应用后删除应用支持目录下的{' '}
            <code>llm-chat.stronghold</code> 与 <code>stronghold_salt.txt</code> 后重试（已存密钥会丢失）。
          </p>

          {PROVIDERS.map((provider) => (
            <label key={provider.id} className="keyRow">
              <span>{provider.label}</span>
              <div className="keyRowInputs">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={apiKeys[provider.id] ? '已保存（可编辑后保存）' : 'API Key'}
                  value={
                    draft[provider.id] !== undefined
                      ? draft[provider.id]
                      : (apiKeys[provider.id] ?? '')
                  }
                  onChange={(event) =>
                    setDraft((state) => ({
                      ...state,
                      [provider.id]: event.target.value,
                    }))
                  }
                />
                <button type="button" onClick={() => saveKey(provider.id)}>
                  保存
                </button>
              </div>
            </label>
          ))}

          <div className="paramRow">
            <label>
              Temperature
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
              />
            </label>
            <label>
              Max tokens
              <input
                type="number"
                min={256}
                max={128000}
                step={256}
                value={maxTokens}
                onChange={(event) => setMaxTokens(Number(event.target.value))}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
