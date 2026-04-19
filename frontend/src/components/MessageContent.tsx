import { memo, useCallback, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

interface MessageContentProps {
  text: string
  /** 流式输出时若末尾围栏未闭合，自动补一个 ``` 让 markdown 不把后面全当代码块 */
  streamSafe?: boolean
}

function closeUnfinishedFence(text: string): string {
  const fenceCount = text.match(/```/g)?.length ?? 0
  if (fenceCount % 2 === 0) return text
  return text.endsWith('\n') ? `${text}\`\`\`` : `${text}\n\`\`\``
}

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props
    return extractText(props?.children)
  }
  return ''
}

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const langMatch = /language-([\w-]+)/.exec(className ?? '')
  const lang = langMatch?.[1] ?? ''

  const handleCopy = useCallback(() => {
    const raw = extractText(children).replace(/\n$/, '')
    void navigator.clipboard.writeText(raw).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      },
      () => {
        /* ignore */
      },
    )
  }, [children])

  return (
    <div className="codeBlockWrap">
      <div className="codeBlockBar">
        <span className="codeBlockLang">{lang || 'text'}</span>
        <button
          type="button"
          className="codeCopyBtn"
          onClick={(e) => {
            e.stopPropagation()
            handleCopy()
          }}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="codeBlock">
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

const components: Components = {
  code({ className, children, ...props }) {
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>
    }
    return (
      <code className="inlineCode" {...props}>
        {children}
      </code>
    )
  },
  pre({ children }) {
    // CodeBlock 已经自带 <pre>，这里直接透传以避免双重 <pre>
    return <>{children}</>
  },
  a({ children, href, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    )
  },
  table({ children }) {
    return (
      <div className="tableWrap">
        <table>{children}</table>
      </div>
    )
  },
}

function MessageContentBase({ text, streamSafe = true }: MessageContentProps) {
  const safe = streamSafe ? closeUnfinishedFence(text) : text
  return (
    <div className="markdownBody">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {safe || ' '}
      </ReactMarkdown>
    </div>
  )
}

export const MessageContent = memo(MessageContentBase)
