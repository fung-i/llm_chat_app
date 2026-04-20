import type { Conversation } from '../types'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <h2>会话</h2>
        <button type="button" className="sidebarNew" onClick={onNew}>
          新建
        </button>
      </div>
      <ul className="sidebarList">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              className={conversation.id === activeId ? 'sidebarItem active' : 'sidebarItem'}
              onClick={() => onSelect(conversation.id)}
            >
              <span className="sidebarTitle">{conversation.title || '未命名'}</span>
              <span className="sidebarMeta">{conversation.modelId}</span>
            </button>
            <button
              type="button"
              className="sidebarDelete"
              title="删除会话"
              onClick={(event) => {
                event.stopPropagation()
                onDelete(conversation.id)
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
