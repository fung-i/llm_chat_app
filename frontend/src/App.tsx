import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import { ConversationPane } from './components/ConversationPane'
import { ContextPane } from './components/ContextPane'
import { MessageInput } from './components/MessageInput'
import { ModelSelector } from './components/ModelSelector'
import { ModelSettings } from './components/ModelSettings'
import { Sidebar } from './components/Sidebar'
import { useChatStore } from './stores/chatStore'
import { useConversationListStore } from './stores/conversationListStore'
import { useModelStore } from './stores/modelStore'
import './App.css'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const conversation = useChatStore((state) => state.conversation)
  const selectedModelId = useChatStore((state) => state.selectedModelId)
  const messages = useChatStore((state) => state.messages)
  const inputText = useChatStore((state) => state.inputText)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const error = useChatStore((state) => state.error)
  const setInputText = useChatStore((state) => state.setInputText)
  const setSelectedModel = useChatStore((state) => state.setSelectedModel)
  const setContextStrategy = useChatStore((state) => state.setContextStrategy)
  const addUserMessage = useChatStore((state) => state.addUserMessage)
  const removeFromContext = useChatStore((state) => state.removeFromContext)
  const restoreToContext = useChatStore((state) => state.restoreToContext)
  const editContextContent = useChatStore((state) => state.editContextContent)
  const addCustomContextMessage = useChatStore((state) => state.addCustomContextMessage)
  const persistThread = useChatStore((state) => state.persistThread)
  const summarizeToContext = useChatStore((state) => state.summarizeToContext)
  const sendToModel = useChatStore((state) => state.sendToModel)
  const hydrateConversation = useChatStore((state) => state.hydrateConversation)
  const startNewConversation = useChatStore((state) => state.startNewConversation)

  const conversations = useConversationListStore((state) => state.items)
  const loadConversations = useConversationListStore((state) => state.load)
  const removeConversation = useConversationListStore((state) => state.remove)

  const providers = useModelStore((state) => state.providers)
  const refreshProviders = useModelStore((state) => state.refreshProviders)
  const loadKeys = useModelStore((state) => state.loadFromDisk)

  const modelMeta = providers.find((item) => item.id === selectedModelId)
  const maxContextWindow = modelMeta?.contextWindow ?? 128000

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void (async () => {
      try {
        unlisten = await listen<{ port: number }>('sidecar-ready', async (event) => {
          window.localStorage.setItem('sidecar_url', `http://127.0.0.1:${event.payload.port}`)
          await useModelStore.getState().refreshProviders()
        })
      } catch {
        /* Web dev without Tauri */
      }
    })()
    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await refreshProviders()
      await loadKeys()
      await loadConversations()
      const list = useConversationListStore.getState().items
      if (list.length === 0) {
        await useChatStore.getState().startNewConversation()
      } else {
        await useChatStore.getState().hydrateConversation(list[0].id)
      }
    })()
  }, [loadConversations, loadKeys, refreshProviders])

  const submit = async () => {
    const content = inputText.trim()
    if (!content) return
    addUserMessage(content)
    await sendToModel()
  }

  const handleSelectConversation = async (id: string) => {
    await hydrateConversation(id)
  }

  const handleDeleteConversation = async (id: string) => {
    const activeId = useChatStore.getState().conversation.id
    await removeConversation(id)
    const next = useConversationListStore.getState().items
    if (id !== activeId) return
    if (next[0]) {
      await hydrateConversation(next[0].id)
    } else {
      await startNewConversation()
    }
  }

  return (
    <main className="appShell">
      <Sidebar
        conversations={conversations}
        activeId={conversation.id}
        onSelect={handleSelectConversation}
        onNew={() => void startNewConversation()}
        onDelete={(id) => void handleDeleteConversation(id)}
      />

      <div className="appMain">
        <header className="topBar">
          <div>
            <h1>{conversation.title}</h1>
            <p>双栏上下文 · 手动 / 自动裁剪 / 摘要</p>
          </div>
          <div className="topBarActions">
            <label className="strategySelect">
              上下文策略
              <select
                value={conversation.contextStrategy}
                onChange={(event) =>
                  setContextStrategy(event.target.value as typeof conversation.contextStrategy)
                }
              >
                <option value="manual">manual</option>
                <option value="auto_trim">auto_trim</option>
                <option value="summarize">summarize</option>
              </select>
            </label>
            <ModelSelector value={selectedModelId} onChange={setSelectedModel} />
            <button type="button" className="ghostButton" onClick={() => setSettingsOpen(true)}>
              密钥与参数
            </button>
          </div>
        </header>

        <section className="twoPane">
          <ConversationPane messages={messages} />
          <ContextPane
            messages={messages}
            maxContextWindow={maxContextWindow}
            onRemove={removeFromContext}
            onRestore={restoreToContext}
            onEdit={editContextContent}
            onAddCustom={addCustomContextMessage}
            onPersist={() => void persistThread()}
            onSummarize={() => summarizeToContext()}
          />
        </section>

        {error ? <p className="error">{error}</p> : null}

        <MessageInput value={inputText} disabled={isStreaming} onChange={setInputText} onSubmit={submit} />
      </div>

      <ModelSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  )
}

export default App
