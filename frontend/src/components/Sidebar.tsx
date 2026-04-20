import { useMemo, useState } from 'react'
import type { Conversation } from '../types'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

function formatRelativeTime(ts: number): string {
  if (!ts) return ''
  const now = new Date()
  const d = new Date(ts)
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  if (isYesterday) return '昨天'
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) return `${diffDays} 天前`
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete }: SidebarProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const title = (c.title || '').toLowerCase()
      const model = (c.modelId || '').toLowerCase()
      return title.includes(q) || model.includes(q)
    })
  }, [conversations, query])

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="sidebarBrand">
          <span className="sidebarBrandDot" aria-hidden />
          <h2>会话</h2>
        </div>
        <button type="button" className="sidebarNew" onClick={onNew} title="新建对话">
          <span aria-hidden>+</span>
          <span>新建</span>
        </button>
      </div>

      <div className="sidebarSearch">
        <span className="sidebarSearchIcon" aria-hidden>
          ⌕
        </span>
        <input
          type="text"
          placeholder="搜索会话…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <ul className="sidebarList">
        {filtered.length === 0 ? (
          <li className="sidebarEmpty">
            {query ? '没有匹配的会话' : '还没有会话，点右上角「新建」开始。'}
          </li>
        ) : (
          filtered.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={conversation.id === activeId ? 'sidebarItem active' : 'sidebarItem'}
                onClick={() => onSelect(conversation.id)}
              >
                <span className="sidebarTitle">{conversation.title || '未命名'}</span>
                <span className="sidebarMeta">
                  <span className="sidebarMetaModel">{conversation.modelId}</span>
                  <span className="sidebarMetaTime">{formatRelativeTime(conversation.updatedAt)}</span>
                </span>
              </button>
              <button
                type="button"
                className="sidebarDelete"
                title="删除会话"
                aria-label="删除会话"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(conversation.id)
                }}
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  )
}
