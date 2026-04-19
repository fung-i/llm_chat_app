import { useMemo, useState } from 'react'
import { useModelStore } from '../stores/modelStore'
import { testProviderConnection } from '../lib/sidecarClient'
import type { CustomAdapter, CustomProvider } from '../types'

interface CustomModelManagerProps {
  onClose: () => void
}

interface DraftState {
  id: string | null
  name: string
  apiModel: string
  adapter: CustomAdapter
  baseUrl: string
  contextWindow: number
  apiKey: string
  /** true when editing an existing entry whose key was already persisted */
  apiKeyTouched: boolean
}

const ADAPTER_OPTIONS: { value: CustomAdapter; label: string; needsBaseUrl: boolean; hint: string }[] = [
  {
    value: 'openai',
    label: 'OpenAI 兼容（推荐）',
    needsBaseUrl: true,
    hint: '任何 /v1/chat/completions 兼容的端点：OpenAI、vLLM、Ollama、LM Studio、OpenRouter、SiliconFlow…',
  },
  {
    value: 'anthropic',
    label: 'Anthropic（官方 SDK）',
    needsBaseUrl: false,
    hint: '使用官方 Anthropic SDK；baseUrl 固定为 api.anthropic.com。',
  },
  {
    value: 'gemini',
    label: 'Google Gemini（官方 SDK）',
    needsBaseUrl: false,
    hint: '使用 @google/generative-ai SDK；baseUrl 由 SDK 管理。',
  },
  {
    value: 'glm',
    label: '智谱 GLM（OpenAI 兼容分支）',
    needsBaseUrl: true,
    hint: '智谱 open.bigmodel.cn 的 OpenAI 兼容端点。',
  },
]

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Math.random().toString(36).slice(2, 10)}-${Date.now()}`
}

function emptyDraft(): DraftState {
  return {
    id: null,
    name: '',
    apiModel: '',
    adapter: 'openai',
    baseUrl: '',
    contextWindow: 32000,
    apiKey: '',
    apiKeyTouched: true,
  }
}

function draftFromEntry(entry: CustomProvider, hasSavedKey: boolean): DraftState {
  return {
    id: entry.id,
    name: entry.name,
    apiModel: entry.apiModel,
    adapter: entry.adapter,
    baseUrl: entry.baseUrl ?? '',
    contextWindow: entry.contextWindow,
    apiKey: '',
    apiKeyTouched: !hasSavedKey,
  }
}

export function CustomModelManager({ onClose }: CustomModelManagerProps) {
  const customProviders = useModelStore((state) => state.customProviders)
  const apiKeys = useModelStore((state) => state.apiKeys)
  const addCustomProvider = useModelStore((state) => state.addCustomProvider)
  const updateCustomProvider = useModelStore((state) => state.updateCustomProvider)
  const removeCustomProvider = useModelStore((state) => state.removeCustomProvider)

  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testState, setTestState] = useState<
    { status: 'idle' | 'running' | 'ok' | 'fail'; message?: string }
  >({ status: 'idle' })

  const currentAdapterInfo = useMemo(
    () => ADAPTER_OPTIONS.find((o) => o.value === draft.adapter) ?? ADAPTER_OPTIONS[0],
    [draft.adapter],
  )

  const startAdd = () => {
    setDraft(emptyDraft())
    setMode('edit')
    setSaveError(null)
    setTestState({ status: 'idle' })
  }

  const startEdit = (entry: CustomProvider) => {
    setDraft(draftFromEntry(entry, Boolean(apiKeys[entry.provider])))
    setMode('edit')
    setSaveError(null)
    setTestState({ status: 'idle' })
  }

  const validateDraft = (): string | null => {
    if (!draft.name.trim()) return '请填写模型显示名称。'
    if (!draft.apiModel.trim()) return '请填写模型 ID（发给 API 的 model 字段）。'
    if (currentAdapterInfo.needsBaseUrl && !draft.baseUrl.trim()) {
      return '该 adapter 需要填写 Base URL。'
    }
    if (!(draft.contextWindow > 0)) return 'Context window 必须大于 0。'
    if (draft.id === null && !draft.apiKey.trim()) return '新增模型需要至少填一次 API Key。'
    return null
  }

  const buildEntry = (id: string): CustomProvider => ({
    id,
    name: draft.name.trim(),
    provider: id,
    adapter: draft.adapter,
    apiModel: draft.apiModel.trim(),
    baseUrl: currentAdapterInfo.needsBaseUrl ? draft.baseUrl.trim() : undefined,
    contextWindow: Math.floor(draft.contextWindow),
  })

  const handleSave = async () => {
    const err = validateDraft()
    if (err) {
      setSaveError(err)
      return
    }
    setSaveError(null)
    const id = draft.id ?? `custom:${newUuid()}`
    const entry = buildEntry(id)
    const nextKey = draft.apiKeyTouched ? draft.apiKey.trim() : null
    try {
      if (draft.id === null) {
        await addCustomProvider(entry, draft.apiKey.trim())
      } else {
        await updateCustomProvider(draft.id, entry, nextKey)
      }
      setMode('list')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败。')
    }
  }

  const handleTest = async () => {
    const err = validateDraft()
    if (err) {
      setSaveError(err)
      return
    }
    const key = draft.apiKeyTouched
      ? draft.apiKey.trim()
      : apiKeys[draft.id ? draft.id : ''] ?? ''
    if (!key) {
      setSaveError('缺少 API Key，无法测试。')
      return
    }
    setSaveError(null)
    setTestState({ status: 'running' })
    try {
      const id = draft.id ?? 'custom:preview'
      const entry = buildEntry(id)
      const sample = await testProviderConnection({ providerOverride: entry, apiKey: key })
      setTestState({ status: 'ok', message: sample ? `ok: ${sample.slice(0, 64)}` : 'ok' })
    } catch (e) {
      setTestState({
        status: 'fail',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除该自定义模型？（对应 API Key 也会从本地 keychain 移除）')) return
    await removeCustomProvider(id)
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
          <h2>自定义模型</h2>
          <button type="button" className="modalClose" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="modalBody">
          {mode === 'list' && (
            <>
              <p className="modalHint">
                在这里添加任何你能访问的模型端点——OpenAI 兼容协议覆盖面最广（vLLM / Ollama / OpenRouter / 硅基流动 / Groq 等）。
                API Key 保存在 Stronghold，配置本身保存在本地 localStorage。
              </p>

              {customProviders.length === 0 ? (
                <p className="modalHint" style={{ fontStyle: 'italic' }}>
                  暂未添加自定义模型。
                </p>
              ) : (
                <div className="customModelList">
                  {customProviders.map((entry) => (
                    <div key={entry.id} className="customModelRow">
                      <div className="customModelInfo">
                        <div className="customModelName">
                          {entry.name}
                          <span className="customModelBadge">{entry.adapter}</span>
                        </div>
                        <div className="customModelMeta">
                          model: <code>{entry.apiModel}</code>
                          {entry.baseUrl ? (
                            <>
                              {' · '}baseUrl: <code>{entry.baseUrl}</code>
                            </>
                          ) : null}
                          {' · '}ctx: {entry.contextWindow.toLocaleString()}
                          {' · '}key:{' '}
                          <span
                            className={
                              apiKeys[entry.provider] ? 'statusOk' : 'statusWarn'
                            }
                          >
                            {apiKeys[entry.provider] ? '已保存' : '未填'}
                          </span>
                        </div>
                      </div>
                      <div className="customModelActions">
                        <button type="button" onClick={() => startEdit(entry)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          className="deleteBtn"
                          onClick={() => void handleDelete(entry.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <button type="button" onClick={startAdd}>
                  + 添加自定义模型
                </button>
              </div>
            </>
          )}

          {mode === 'edit' && (
            <>
              <p className="modalHint">{currentAdapterInfo.hint}</p>

              <label className="keyRow">
                <span>显示名称</span>
                <input
                  type="text"
                  value={draft.name}
                  placeholder="例：My Local Qwen 72B"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>

              <label className="keyRow">
                <span>Adapter</span>
                <select
                  value={draft.adapter}
                  onChange={(e) =>
                    setDraft({ ...draft, adapter: e.target.value as CustomAdapter })
                  }
                >
                  {ADAPTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="keyRow">
                <span>模型 ID（发给 API 的 model 字段）</span>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.apiModel}
                  placeholder="例：qwen2.5-72b-instruct / gpt-4o / llama3.1:70b"
                  onChange={(e) => setDraft({ ...draft, apiModel: e.target.value })}
                />
              </label>

              {currentAdapterInfo.needsBaseUrl && (
                <label className="keyRow">
                  <span>Base URL</span>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.baseUrl}
                    placeholder="例：http://127.0.0.1:11434/v1 或 https://openrouter.ai/api/v1"
                    onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  />
                </label>
              )}

              <label className="keyRow">
                <span>Context window（tokens）</span>
                <input
                  type="number"
                  min={1024}
                  max={2000000}
                  step={1024}
                  value={draft.contextWindow}
                  onChange={(e) =>
                    setDraft({ ...draft, contextWindow: Number(e.target.value) || 0 })
                  }
                />
              </label>

              <label className="keyRow">
                <span>
                  API Key
                  {draft.id !== null && !draft.apiKeyTouched && (
                    <em className="modalHint" style={{ marginLeft: 8 }}>
                      （已保存；留空将保持不变）
                    </em>
                  )}
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.apiKey}
                  placeholder={
                    draft.id !== null && !draft.apiKeyTouched ? '保持原值' : 'sk-... 或本地直连可填任意值'
                  }
                  onChange={(e) =>
                    setDraft({ ...draft, apiKey: e.target.value, apiKeyTouched: true })
                  }
                />
              </label>

              {saveError && <p className="error">{saveError}</p>}
              {testState.status === 'running' && <p className="modalHint">测试中…</p>}
              {testState.status === 'ok' && (
                <p className="modalHint statusOk">测试成功 · {testState.message}</p>
              )}
              {testState.status === 'fail' && (
                <p className="error">测试失败：{testState.message}</p>
              )}

              <div className="customModelFormActions">
                <button type="button" onClick={() => setMode('list')}>
                  取消
                </button>
                <button type="button" onClick={() => void handleTest()}>
                  测试连接
                </button>
                <button type="button" className="primaryBtn" onClick={() => void handleSave()}>
                  保存
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
