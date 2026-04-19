import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ChatMessage } from '../types'

const COLLAPSE_LINE_THRESHOLD = 12
const COLLAPSE_CHAR_THRESHOLD = 600
const PREVIEW_LINES = 3
const PREVIEW_CHARS = 220

export interface PaneHandle {
  scrollToMessage: (id: string, opts?: { smooth?: boolean }) => boolean
}

interface ConversationPaneProps {
  messages: ChatMessage[]
  selectedMessageId: string | null
  onSelectMessage: (id: string) => void
  onTopMessageChange: (id: string) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}

function roleLabel(role: ChatMessage['role']): string {
  if (role === 'assistant') return 'Assistant'
  if (role === 'system') return 'System'
  return 'User'
}

function shouldCollapse(content: string): boolean {
  if (!content) return false
  if (content.length > COLLAPSE_CHAR_THRESHOLD) return true
  let lineCount = 1
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      lineCount++
      if (lineCount > COLLAPSE_LINE_THRESHOLD) return true
    }
  }
  return false
}

function previewContent(content: string): string {
  const lines = content.split('\n').slice(0, PREVIEW_LINES).join('\n')
  return lines.length > PREVIEW_CHARS ? `${lines.slice(0, PREVIEW_CHARS)}…` : lines
}

export const ConversationPane = forwardRef<PaneHandle, ConversationPaneProps>(function ConversationPane(
  { messages, selectedMessageId, onSelectMessage, onTopMessageChange, onRestore, onDelete },
  ref,
) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
  const ignoreScrollUntilRef = useRef(0)
  const rafRef = useRef(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id ?? null, [messages])

  const setCardRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) cardRefs.current.set(id, el)
      else cardRefs.current.delete(id)
    },
    [],
  )

  useImperativeHandle(
    ref,
    () => ({
      scrollToMessage: (id, opts) => {
        const container = listRef.current
        if (!container) return false
        const el = cardRefs.current.get(id)
        if (el) {
          const containerRect = container.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const fullyVisible =
            elRect.top >= containerRect.top - 1 && elRect.bottom <= containerRect.bottom + 1
          if (fullyVisible) return true
          ignoreScrollUntilRef.current = Date.now() + 350
          const target = container.scrollTop + (elRect.top - containerRect.top)
          container.scrollTo({ top: target, behavior: opts?.smooth ? 'smooth' : 'auto' })
          return true
        }
        ignoreScrollUntilRef.current = Date.now() + 350
        container.scrollTo({ top: 0, behavior: opts?.smooth ? 'smooth' : 'auto' })
        return false
      },
    }),
    [],
  )

  const handleScroll = useCallback(() => {
    if (Date.now() < ignoreScrollUntilRef.current) return
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const container = listRef.current
      if (!container) return
      const containerTop = container.getBoundingClientRect().top
      let bestId: string | null = null
      let bestDist = Infinity
      for (const [id, el] of cardRefs.current.entries()) {
        const rect = el.getBoundingClientRect()
        if (rect.bottom < containerTop - 4) continue
        const dist = Math.abs(rect.top - containerTop)
        if (dist < bestDist) {
          bestDist = dist
          bestId = id
        }
      }
      if (bestId) onTopMessageChange(bestId)
    })
  }, [onTopMessageChange])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <section className="pane">
      <header className="paneHeader">
        <h2>真实对话</h2>
        <span>{messages.length} 条消息</span>
      </header>

      <div className="messageList" ref={listRef} onScroll={handleScroll}>
        {messages.map((message) => {
          const isLast = message.id === lastMessageId
          const collapsible = !isLast && shouldCollapse(message.displayContent)
          const isExpanded = expanded[message.id] ?? !collapsible
          const isSelected = message.id === selectedMessageId
          const showText = isExpanded || !collapsible
            ? message.displayContent || '...'
            : previewContent(message.displayContent)

          return (
            <article
              key={message.id}
              ref={setCardRef(message.id)}
              data-message-id={message.id}
              className={[
                'messageCard',
                `role-${message.role}`,
                message.inContext ? '' : 'messageRemoved',
                isSelected ? 'messageSelected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectMessage(message.id)}
            >
              <div className="messageMeta">
                <strong>{roleLabel(message.role)}</strong>
                {!message.inContext && <em>已从上下文移除</em>}
                {message.isContextModified && message.inContext && <em>上下文已改写</em>}
                <div className="messageMetaActions">
                  {collapsible && (
                    <button
                      type="button"
                      className="collapseToggle"
                      onClick={(event) => {
                        event.stopPropagation()
                        setExpanded((prev) => ({ ...prev, [message.id]: !isExpanded }))
                      }}
                    >
                      {isExpanded ? '收起' : '展开全部'}
                    </button>
                  )}
                  {!message.inContext && (
                    <button
                      type="button"
                      className="messageActionBtn restoreBtn"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRestore(message.id)
                      }}
                    >
                      加回上下文
                    </button>
                  )}
                  <button
                    type="button"
                    className="messageActionBtn deleteBtn"
                    title="从两栏同时删除此消息（可在顶部「撤回」恢复）"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete(message.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
              <p className={isExpanded || !collapsible ? '' : 'messagePreview'}>{showText}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
})
