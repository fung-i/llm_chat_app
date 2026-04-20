import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationPane, type PaneHandle } from './components/ConversationPane'
import { ContextPane } from './components/ContextPane'
import { CustomModelManager } from './components/CustomModelManager'
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
  const [customModelsOpen, setCustomModelsOpen] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const convPaneRef = useRef<PaneHandle>(null)
  const ctxPaneRef = useRef<PaneHandle>(null)
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
  const deleteMessage = useChatStore((state) => state.deleteMessage)
  const editContextContent = useChatStore((state) => state.editContextContent)
  const addCustomContextMessage = useChatStore((state) => state.addCustomContextMessage)
  const persistThread = useChatStore((state) => state.persistThread)
  const updateSystemSummarySlot = useChatStore((state) => state.updateSystemSummarySlot)
  const summarizeWithScope = useChatStore((state) => state.summarizeWithScope)
  const sendToModel = useChatStore((state) => state.sendToModel)
  const hydrateConversation = useChatStore((state) => state.hydrateConversation)
  const startNewConversation = useChatStore((state) => state.startNewConversation)
  const pushHistorySnapshot = useChatStore((state) => state.pushHistorySnapshot)
  const undo = useChatStore((state) => state.undo)
  const historyDepth = useChatStore((state) => state.history.length)

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
    setSelectedMessageId(null)
    await hydrateConversation(id)
  }

  const handleConvTopChange = useCallback((id: string) => {
    ctxPaneRef.current?.scrollToMessage(id)
  }, [])

  const handleCtxTopChange = useCallback((id: string) => {
    convPaneRef.current?.scrollToMessage(id)
  }, [])

  const handleSelectFromConv = useCallback((id: string) => {
    setSelectedMessageId(id)
    ctxPaneRef.current?.scrollToMessage(id, { smooth: true })
  }, [])

  const handleSelectFromCtx = useCallback((id: string) => {
    setSelectedMessageId(id)
    convPaneRef.current?.scrollToMessage(id, { smooth: true })
  }, [])

  const handleDeleteMessage = useCallback(
    (id: string) => {
      if (selectedMessageId === id) setSelectedMessageId(null)
      deleteMessage(id)
    },
    [deleteMessage, selectedMessageId],
  )

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
            <button
              type="button"
              className="ghostButton"
              disabled={historyDepth === 0 || isStreaming}
              onClick={() => undo()}
              title="撤回上一次移除/摘要/修改/添加/删除"
            >
              撤回 {historyDepth > 0 ? `(${historyDepth})` : ''}
            </button>
            <button type="button" className="ghostButton" onClick={() => setCustomModelsOpen(true)}>
              自定义模型
            </button>
            <button type="button" className="ghostButton" onClick={() => setSettingsOpen(true)}>
              密钥与参数
            </button>
          </div>
        </header>

        <section className="twoPane">
          <ConversationPane
            ref={convPaneRef}
            messages={messages}
            selectedMessageId={selectedMessageId}
            onSelectMessage={handleSelectFromConv}
            onTopMessageChange={handleConvTopChange}
            onRestore={restoreToContext}
            onDelete={handleDeleteMessage}
          />
          <ContextPane
            ref={ctxPaneRef}
            messages={messages}
            systemSummarySlots={conversation.systemSummarySlots}
            maxContextWindow={maxContextWindow}
            selectedMessageId={selectedMessageId}
            onSelectMessage={handleSelectFromCtx}
            onTopMessageChange={handleCtxTopChange}
            onRemove={removeFromContext}
            onEdit={editContextContent}
            onAddCustom={addCustomContextMessage}
            onUpdateSummarySlot={updateSystemSummarySlot}
            onPersist={() => void persistThread()}
            onBeforeEdit={pushHistorySnapshot}
            onSummarizeScope={(scope, selectedIds) => summarizeWithScope(scope, selectedIds)}
          />
        </section>

        {error ? <p className="error">{error}</p> : null}

        <MessageInput value={inputText} disabled={isStreaming} onChange={setInputText} onSubmit={submit} />
      </div>

      <ModelSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {customModelsOpen && (
        <CustomModelManager onClose={() => setCustomModelsOpen(false)} />
      )}
    </main>
  )
}

export default App
