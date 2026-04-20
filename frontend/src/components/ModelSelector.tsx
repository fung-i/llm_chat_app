import { useModelStore } from '../stores/modelStore'

interface ModelSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const providers = useModelStore((state) => state.providers)
  const options =
    providers.length > 0
      ? providers
      : [
          { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', contextWindow: 128000 },
          { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', contextWindow: 200000 },
        ]

  return (
    <label className="modelSelector" title="当前对话使用的模型">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.isCustom ? '★ ' : ''}
            {option.name} ({option.provider})
          </option>
        ))}
      </select>
    </label>
  )
}
