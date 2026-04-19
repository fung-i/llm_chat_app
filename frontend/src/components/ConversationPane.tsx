import type { ChatMessage } from '../types'

interface ConversationPaneProps {
  messages: ChatMessage[]
}

function roleLabel(role: ChatMessage['role']): string {
  if (role === 'assistant') return 'Assistant'
  if (role === 'system') return 'System'
  return 'User'
}

export function ConversationPane({ messages }: ConversationPaneProps) {
  return (
    <section className="pane">
      <header className="paneHeader">
        <h2>真实对话</h2>
        <span>{messages.length} 条消息</span>
      </header>

      <div className="messageList">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`messageCard role-${message.role} ${message.inContext ? '' : 'messageRemoved'}`}
          >
            <div className="messageMeta">
              <strong>{roleLabel(message.role)}</strong>
              {!message.inContext && <em>已从上下文移除</em>}
              {message.isContextModified && message.inContext && <em>上下文已改写</em>}
            </div>
            <p>{message.displayContent || '...'}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
