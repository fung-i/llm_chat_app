import { useEffect, useRef, type KeyboardEvent } from 'react'

interface MessageInputProps {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export function MessageInput({ value, disabled, onChange, onSubmit }: MessageInputProps) {
  const canSubmit = value.trim().length > 0 && !disabled
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [value])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (canSubmit) onSubmit()
    }
  }

  const chars = value.length

  return (
    <div className="messageInputWrap">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入你的问题，⌘/Ctrl + ↵ 发送..."
        rows={1}
      />
      <div className="messageInputMeta">
        <span className="messageInputHint">
          <span className="kbd">⌘</span>
          <span>/</span>
          <span className="kbd">Ctrl</span>
          <span>+</span>
          <span className="kbd">↵</span>
          <span>发送 · ↵ 换行</span>
        </span>
        <span className="messageInputCount">{chars > 0 ? `${chars.toLocaleString()} 字符` : ''}</span>
      </div>
      <button
        type="button"
        className="messageInputSend"
        disabled={!canSubmit}
        onClick={onSubmit}
        title={canSubmit ? '发送（⌘/Ctrl + ↵）' : '请输入内容'}
        aria-label="发送"
      >
        ↑
      </button>
    </div>
  )
}
