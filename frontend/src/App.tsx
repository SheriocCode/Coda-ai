import { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster } from 'sonner'
import { SessionSidebar } from './components/SessionSidebar'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { SettingsModal } from './components/SettingsModal'
import { getSessions, getWorkspace, getConfig, createSession } from './api'
import type { WorkspaceFile, Config, SessionMeta } from './api'
import './App.css'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  code?: string
  stdout?: string
  stderr?: string
  success?: boolean
  outputFiles?: string[]
  timestamp: number
  isLoading?: boolean
}

// 每个会话的运行时状态（消息历史 + 文件列表）
interface SessionState {
  messages: Message[]
  files: WorkspaceFile[]
}

const WELCOME_MESSAGE = (name: string): Message => ({
  id: 'welcome',
  role: 'assistant',
  content: `你好！我是 **Coda**，你的 AI 文档自动化助手。\n\n当前会话：**${name}**\n\n你可以：\n- **上传文件**（xlsx、docx、csv 等）到左侧工作区\n- **用自然语言描述**你想做的操作，我会自动生成并执行 Python 代码\n- **点击文件**预览内容\n- **下载**生成的结果文件\n\n**示例指令**："把附件4登分模板.xlsx中的数据按学号排序后导出"`,
  timestamp: Date.now(),
})

const PREVIEW_MIN_WIDTH = 260
const PREVIEW_MAX_WIDTH = 800
const PREVIEW_DEFAULT_WIDTH = 420

function App() {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  // 每个会话的状态：{ [sessionId]: SessionState }
  const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({})
  const [config, setConfig] = useState<Config | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)

  // 预览面板宽度（可拖拽）
  const [previewWidth, setPreviewWidth] = useState(PREVIEW_DEFAULT_WIDTH)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // ---- 获取当前会话的状态 ----
  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null
  const activeState = activeSessionId ? sessionStates[activeSessionId] : null
  const currentMessages = activeState?.messages ?? []
  const currentFiles = activeState?.files ?? []

  // ---- 初始化：加载会话列表 ----
  const refreshSessions = useCallback(async () => {
    try {
      const { sessions: list } = await getSessions()
      setSessions(list)
      return list
    } catch (e) {
      console.error('获取会话列表失败', e)
      return []
    }
  }, [])

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await getConfig()
      setConfig(cfg)
      if (!cfg.has_api_key) {
        setShowSettings(true)
      }
    } catch (e) {
      console.error('获取配置失败', e)
    }
  }, [])

  // ---- 刷新指定会话的工作区文件 ----
  const refreshWorkspace = useCallback(async (sessionId: string) => {
    try {
      const info = await getWorkspace(sessionId)
      setSessionStates(prev => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          files: info.files,
        }
      }))
    } catch (e) {
      console.error('获取工作区失败', e)
    }
  }, [])

  // ---- 切换会话 ----
  const handleSelectSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId)
    setPreviewFile(null)

    // 如果该会话还没有状态，初始化
    setSessionStates(prev => {
      if (prev[sessionId]) return prev
      const session = sessions.find(s => s.id === sessionId)
      return {
        ...prev,
        [sessionId]: {
          messages: [WELCOME_MESSAGE(session?.name ?? '新会话')],
          files: [],
        }
      }
    })

    // 加载该会话的工作区文件
    await refreshWorkspace(sessionId)
  }, [sessions, refreshWorkspace])

  // ---- 更新当前会话的消息 ----
  const setCurrentMessages = useCallback((
    updater: React.SetStateAction<Message[]>
  ) => {
    if (!activeSessionId) return
    setSessionStates(prev => {
      const current = prev[activeSessionId]?.messages ?? []
      const next = typeof updater === 'function' ? updater(current) : updater
      return {
        ...prev,
        [activeSessionId]: {
          ...prev[activeSessionId],
          messages: next,
        }
      }
    })
  }, [activeSessionId])

  // ---- 初始化 ----
  useEffect(() => {
    const init = async () => {
      await refreshConfig()
      const list = await refreshSessions()

      if (list.length === 0) {
        // 没有会话，自动创建第一个
        try {
          const newSession = await createSession('默认会话')
          const newList = [newSession]
          setSessions(newList)
          const sid = newSession.id
          setActiveSessionId(sid)
          setSessionStates({
            [sid]: {
              messages: [WELCOME_MESSAGE(newSession.name)],
              files: [],
            }
          })
          await refreshWorkspace(sid)
        } catch (e) {
          console.error('创建默认会话失败', e)
        }
      } else {
        // 选中第一个会话
        const first = list[0]
        setActiveSessionId(first.id)
        setSessionStates({
          [first.id]: {
            messages: [WELCOME_MESSAGE(first.name)],
            files: [],
          }
        })
        await refreshWorkspace(first.id)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 定时刷新当前会话工作区 ----
  useEffect(() => {
    if (!activeSessionId) return
    const timer = setInterval(() => refreshWorkspace(activeSessionId), 30000)
    return () => clearInterval(timer)
  }, [activeSessionId, refreshWorkspace])

  // ---- 拖拽分隔条逻辑 ----
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = previewWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [previewWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = dragStartX.current - e.clientX
      const newWidth = Math.min(
        PREVIEW_MAX_WIDTH,
        Math.max(PREVIEW_MIN_WIDTH, dragStartWidth.current + delta)
      )
      setPreviewWidth(newWidth)
    }
    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // ---- 会话列表刷新后，同步 sessions 到 handleSelectSession 的闭包 ----
  const handleSessionsChange = useCallback(async () => {
    const list = await refreshSessions()
    // 如果当前会话被删除，切换到第一个
    if (activeSessionId && !list.find(s => s.id === activeSessionId)) {
      if (list.length > 0) {
        await handleSelectSession(list[0].id)
      } else {
        setActiveSessionId(null)
      }
    }
  }, [activeSessionId, refreshSessions, handleSelectSession])

  // 无会话时的空状态
  if (sessions.length === 0 && activeSessionId === null) {
    return (
      <div className="app-layout">
        <Toaster position="bottom-right" />
        <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: 14 }}>
          正在初始化...
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      {/* Sonner Toast 通知 */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            fontFamily: "'Geist', Arial, sans-serif",
            fontSize: '13px',
            borderRadius: '8px',
            boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 8px',
          },
        }}
      />

      {/* 最左侧：会话列表 */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onSessionsChange={handleSessionsChange}
        onOpenSettings={() => setShowSettings(true)}
        config={config}
      />

      {/* 左侧：工作区文件管理（当前会话） */}
      {activeSessionId && (
        <Sidebar
          sessionId={activeSessionId}
          files={currentFiles}
          selectedFile={previewFile}
          onSelectFile={(f) => {
            setPreviewFile(f)
          }}
          onRefresh={() => refreshWorkspace(activeSessionId)}
        />
      )}

      {/* 中间：AI 对话（当前会话） */}
      {activeSessionId && activeSession ? (
        <ChatPanel
          sessionId={activeSessionId}
          sessionName={activeSession.name}
          messages={currentMessages}
          setMessages={setCurrentMessages}
          files={currentFiles}
          onRefreshWorkspace={() => refreshWorkspace(activeSessionId)}
          onPreviewFile={setPreviewFile}
          config={config}
        />
      ) : (
        <main className="chat-panel" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>请选择或新建一个会话</div>
        </main>
      )}

      {/* 拖拽分隔条（仅在预览面板显示时出现） */}
      {previewFile && (
        <div
          className="preview-divider"
          onMouseDown={handleDividerMouseDown}
          title="拖拽调整宽度"
        />
      )}

      {/* 右侧：文件预览 */}
      <PreviewPanel
        file={previewFile}
        sessionId={activeSessionId ?? ''}
        onClose={() => setPreviewFile(null)}
        width={previewFile ? previewWidth : 0}
      />

      {/* 设置弹窗 */}
      {showSettings && (
        <SettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onSaved={refreshConfig}
        />
      )}
    </div>
  )
}

export default App
