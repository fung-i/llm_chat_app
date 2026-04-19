import { useEffect, useMemo, useState } from 'react'
import type { ChatMessage, MessageRole } from '../types'
import { countTokensRemote } from '../lib/sidecarClient'

interface ContextPaneProps {
  messages: ChatMessage[]
  maxContextWindow: number
  onRemove: (id: string) => void
  onRestore: (id: string) => void
  onEdit: (id: string, content: string) => void
  onAddCustom: (role: MessageRole, content: string) => void
  onPersist: () => void
  onSummarize: () => Promise<void>
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function ContextPane({
  messages,
  maxContextWindow,
  onRemove,
  onRestore,
  onEdit,
  onAddCustom,
  onPersist,
  onSummarize,
}: ContextPaneProps) {
  const inContextMessages = messages.filter((message) => message.inContext)
  const localTokenCount = useMemo(
    () => inContextMessages.reduce((sum, message) => sum + estimateTokens(message.contextContent), 0),
    [inContextMessages],
  )
  const [remoteTokens, setRemoteTokens] = useState<number | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const count = await countTokensRemote(
          messages.map((message) => ({
            role: message.role,
            contextContent: message.contextContent,
          })),
        )
        if (!cancelled) setRemoteTokens(count)
      } catch {
        if (!cancelled) setRemoteTokens(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [messages])

  const tokenCount = remoteTokens ?? localTokenCount
  const ratio = Math.min(100, Math.round((tokenCount / maxContextWindow) * 100))
  const warn = ratio >= 80
  const danger = ratio >= 95

  return (
    <section className="pane">
      <header className="paneHeader">
        <h2>实际发送上下文</h2>
        <span className={danger ? 'tokenDanger' : warn ? 'tokenWarn' : ''}>
          Token {tokenCount} / {maxContextWindow}
          {remoteTokens != null ? '（服务端）' : '（估算）'}
        </span>
      </header>

      <div className={`tokenBar ${warn ? 'tokenBarWarn' : ''} ${danger ? 'tokenBarDanger' : ''}`}>
        <span style={{ width: `${ratio}%` }} />
      </div>

      <div className="messageList">
        {messages.map((message) => (
          <article key={message.id} className="messageCard contextCard">
            <div className="messageMeta">
              <strong>{message.role}</strong>
              <button type="button" onClick={() => (message.inContext ? onRemove(message.id) : onRestore(message.id))}>
                {message.inContext ? '移除' : '恢复'}
              </button>
            </div>
            <textarea
              value={message.contextContent}
              disabled={!message.inContext}
              onChange={(event) => onEdit(message.id, event.target.value)}
              onBlur={onPersist}
            />
          </article>
        ))}
      </div>

      <div className="customActions">
        <button type="button" onClick={() => onAddCustom('system', '请优先给出结论，再给步骤。')}>
          + 添加 System
        </button>
        <button type="button" onClick={() => onAddCustom('user', '补充背景：这是一个桌面端项目。')}>
          + 添加 User
        </button>
        <button
          type="button"
          disabled={summarizing}
          onClick={async () => {
            setSummarizing(true)
            try {
              await onSummarize()
            } finally {
              setSummarizing(false)
            }
          }}
        >
          {summarizing ? '摘要中…' : '摘要进上下文'}
        </button>
      </div>
    </section>
  )
}
