import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ChatMessage, MessageRole } from '../types'
import { countTokensRemote } from '../lib/sidecarClient'
import { buildInContextMessagesForApi } from '../lib/mergeSystem'
import type { PaneHandle } from './ConversationPane'

interface ContextPaneProps {
  messages: ChatMessage[]
  systemSummarySlots: string[]
  maxContextWindow: number
  selectedMessageId: string | null
  onSelectMessage: (id: string) => void
  onTopMessageChange: (id: string) => void
  onRemove: (id: string) => void
  onEdit: (id: string, content: string) => void
  onAddCustom: (role: MessageRole, content: string) => void
  onUpdateSummarySlot: (index: number, text: string) => void
  onPersist: () => void
  onBeforeEdit: (label: string) => void
  onSummarizeScope: (scope: 'selected' | 'full', selectedIds: string[]) => Promise<void>
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export const ContextPane = forwardRef<PaneHandle, ContextPaneProps>(function ContextPane(
  {
    messages,
    systemSummarySlots,
    maxContextWindow,
    selectedMessageId,
    onSelectMessage,
    onTopMessageChange,
    onRemove,
    onEdit,
    onAddCustom,
    onUpdateSummarySlot,
    onPersist,
    onBeforeEdit,
    onSummarizeScope,
  },
  ref,
) {
  const firstMessage = messages[0]
  const firstIsSystemInContext = firstMessage?.role === 'system' && firstMessage.inContext
  const baseSystemMessage = firstIsSystemInContext ? firstMessage : undefined
  const restMessages = (firstMessage?.role === 'system' ? messages.slice(1) : messages).filter(
    (m) => m.inContext,
  )

  const [pickForSummary, setPickForSummary] = useState<Record<string, boolean>>({})
  const [remoteTokens, setRemoteTokens] = useState<number | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  const listRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
  const ignoreScrollUntilRef = useRef(0)
  const rafRef = useRef(0)

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

  useEffect(() => {
    setPickForSummary((prev) => {
      const next = { ...prev }
      for (const m of messages) {
        if (next[m.id] === undefined) {
          next[m.id] = m.role !== 'system'
        }
      }
      for (const id of Object.keys(next)) {
        if (!messages.some((m) => m.id === id)) delete next[id]
      }
      return next
    })
  }, [messages])

  const mergedForCount = useMemo(
    () => buildInContextMessagesForApi(messages, systemSummarySlots),
    [messages, systemSummarySlots],
  )

  const localTokenCount = useMemo(
    () => mergedForCount.reduce((sum, message) => sum + estimateTokens(message.contextContent), 0),
    [mergedForCount],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const count = await countTokensRemote(
          mergedForCount.map((message) => ({
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
  }, [mergedForCount])

  const tokenCount = remoteTokens ?? localTokenCount
  const ratio = Math.min(100, Math.round((tokenCount / maxContextWindow) * 100))
  const warn = ratio >= 80
  const danger = ratio >= 95

  const selectedIds = Object.entries(pickForSummary)
    .filter(([, v]) => v)
    .map(([id]) => id)

  const runSummarize = async (scope: 'selected' | 'full') => {
    setSummarizing(true)
    try {
      await onSummarizeScope(scope, selectedIds)
    } finally {
      setSummarizing(false)
    }
  }

  const baseSystemSelected = baseSystemMessage && baseSystemMessage.id === selectedMessageId

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

      <div className="systemStrip">
        <p className="systemStripHint">
          System 区：基础人设与多段摘要分栏编辑；发送时按栏顺序用分隔线拼成一条 system。摘要所选/全文后，对应消息仅从「在上下文」中移除（可点恢复）。
        </p>
        <div className="systemColumns">
          {baseSystemMessage ? (
            <div
              className={`systemColumn ${baseSystemSelected ? 'messageSelected' : ''}`}
              onClick={() => onSelectMessage(baseSystemMessage.id)}
            >
              <div className="systemColumnHead">
                <label className="summaryPick" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={pickForSummary[baseSystemMessage.id] ?? false}
                    onChange={() =>
                      setPickForSummary((p) => ({
                        ...p,
                        [baseSystemMessage.id]: !p[baseSystemMessage.id],
                      }))
                    }
                  />
                  <span>基础 System</span>
                </label>
              </div>
              <textarea
                value={baseSystemMessage.contextContent}
                onFocus={() => {
                  onSelectMessage(baseSystemMessage.id)
                  onBeforeEdit('编辑 System')
                }}
                onChange={(event) => onEdit(baseSystemMessage.id, event.target.value)}
                onBlur={onPersist}
              />
            </div>
          ) : null}
          {systemSummarySlots.map((slot, index) => (
            <div key={index} className="systemColumn">
              <div className="systemColumnHead">
                <span>摘要 {index + 1}</span>
              </div>
              <textarea
                value={slot}
                onFocus={() => onBeforeEdit('编辑摘要')}
                onChange={(event) => onUpdateSummarySlot(index, event.target.value)}
                onBlur={onPersist}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="messageList" ref={listRef} onScroll={handleScroll}>
        {restMessages.map((message) => {
          const isSelected = message.id === selectedMessageId
          return (
            <article
              key={message.id}
              ref={setCardRef(message.id)}
              data-message-id={message.id}
              className={`messageCard contextCard ${isSelected ? 'messageSelected' : ''}`}
              onClick={() => onSelectMessage(message.id)}
            >
              <div className="messageMeta">
                <label className="summaryPick" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={pickForSummary[message.id] ?? false}
                    onChange={() =>
                      setPickForSummary((p) => ({
                        ...p,
                        [message.id]: !p[message.id],
                      }))
                    }
                  />
                  <strong>{message.role}</strong>
                </label>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(message.id)
                  }}
                >
                  移除
                </button>
              </div>
              <textarea
                value={message.contextContent}
                onFocus={() => {
                  onSelectMessage(message.id)
                  onBeforeEdit('编辑消息')
                }}
                onChange={(event) => onEdit(message.id, event.target.value)}
                onBlur={onPersist}
              />
            </article>
          )
        })}
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
          disabled={summarizing || selectedIds.length === 0}
          onClick={() => void runSummarize('selected')}
        >
          {summarizing ? '摘要中…' : '摘要所选'}
        </button>
        <button type="button" disabled={summarizing || messages.length === 0} onClick={() => void runSummarize('full')}>
          {summarizing ? '摘要中…' : '摘要完整对话'}
        </button>
      </div>
    </section>
  )
})
