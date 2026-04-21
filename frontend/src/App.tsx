import { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster } from 'sonner'
import { SessionSidebar } from './components/SessionSidebar'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { SettingsModal } from './components/SettingsModal'
import { GuideTour, DEFAULT_TOUR_STEPS } from './components/GuideTour'
import { getSessions, getWorkspace, getConfig, createSession } from './api'
import type { WorkspaceFile, Config, SessionMeta } from './api'
import './App.css'

const TOUR_DONE_KEY = 'coda_tour_done'

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
  const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({})
  const [config, setConfig] = useState<Config | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [showTour, setShowTour] = useState(false)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [previewWidth, setPreviewWidth] = useState(PREVIEW_DEFAULT_WIDTH)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // 工作区侧边栏宽度拖拽
  const WORKSPACE_MIN_WIDTH = 160
  const WORKSPACE_MAX_WIDTH = 400
  const WORKSPACE_DEFAULT_WIDTH = 220
  const [workspaceWidth, setWorkspaceWidth] = useState(WORKSPACE_DEFAULT_WIDTH)
  const isWorkspaceDragging = useRef(false)
  const workspaceDragStartX = useRef(0)
  const workspaceDragStartWidth = useRef(0)

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null
  const activeState = activeSessionId ? sessionStates[activeSessionId] : null
  const currentMessages = activeState?.messages ?? []
  const currentFiles = activeState?.files ?? []

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

  const handleSelectSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId)
    setPreviewFile(null)
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
    await refreshWorkspace(sessionId)
  }, [sessions, refreshWorkspace])

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
        try {
          const newSession = await createSession('默认会话')
          setSessions([newSession])
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

      // 首次使用自动触发引导（延迟 800ms 等待 UI 渲染完成）
      if (!localStorage.getItem(TOUR_DONE_KEY)) {
        setTimeout(() => setShowTour(true), 800)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeSessionId) return
    const timer = setInterval(() => refreshWorkspace(activeSessionId), 30000)
    return () => clearInterval(timer)
  }, [activeSessionId, refreshWorkspace])

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = previewWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [previewWidth])

  const handleWorkspaceDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isWorkspaceDragging.current = true
    workspaceDragStartX.current = e.clientX
    workspaceDragStartWidth.current = workspaceWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [workspaceWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        const delta = dragStartX.current - e.clientX
        const newWidth = Math.min(
          PREVIEW_MAX_WIDTH,
          Math.max(PREVIEW_MIN_WIDTH, dragStartWidth.current + delta)
        )
        setPreviewWidth(newWidth)
      }
      if (isWorkspaceDragging.current) {
        const delta = e.clientX - workspaceDragStartX.current
        const newWidth = Math.min(
          WORKSPACE_MAX_WIDTH,
          Math.max(WORKSPACE_MIN_WIDTH, workspaceDragStartWidth.current + delta)
        )
        setWorkspaceWidth(newWidth)
      }
    }
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      if (isWorkspaceDragging.current) {
        isWorkspaceDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleSessionsChange = useCallback(async () => {
    const list = await refreshSessions()
    if (activeSessionId && !list.find(s => s.id === activeSessionId)) {
      if (list.length > 0) {
        await handleSelectSession(list[0].id)
      } else {
        setActiveSessionId(null)
      }
    }
  }, [activeSessionId, refreshSessions, handleSelectSession])

  const handleTourFinish = () => {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    setShowTour(false)
  }

  const handleTourSkip = () => {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    setShowTour(false)
  }

  const handleStartTour = () => {
    setShowTour(true)
  }

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
        onStartTour={handleStartTour}
        config={config}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
      />

      {/* 左侧：工作区文件管理 */}
      {activeSessionId && (
        <>
          <Sidebar
            sessionId={activeSessionId}
            files={currentFiles}
            selectedFile={previewFile}
            onSelectFile={(f) => setPreviewFile(f)}
            onRefresh={() => refreshWorkspace(activeSessionId)}
            width={workspaceWidth}
          />
          {/* 工作区右侧拖拽分隔条 */}
          <div
            className="workspace-divider"
            onMouseDown={handleWorkspaceDividerMouseDown}
            title="拖拽调整工作区宽度"
          />
        </>
      )}

      {/* 中间：AI 对话 */}
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

      {/* 拖拽分隔条 */}
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

      {/* 引导 Tour */}
      {showTour && (
        <GuideTour
          steps={DEFAULT_TOUR_STEPS}
          onFinish={handleTourFinish}
          onSkip={handleTourSkip}
        />
      )}
    </div>
  )
}

export default App
