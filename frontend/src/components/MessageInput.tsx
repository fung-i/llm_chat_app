interface MessageInputProps {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export function MessageInput({ value, disabled, onChange, onSubmit }: MessageInputProps) {
  const canSubmit = value.trim().length > 0 && !disabled

  return (
    <div className="messageInputWrap">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入你的问题..."
        rows={3}
      />
      <button type="button" disabled={!canSubmit} onClick={onSubmit}>
        发送
      </button>
    </div>
  )
}
