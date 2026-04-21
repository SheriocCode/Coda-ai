import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { SettingsModal } from './components/SettingsModal'
import { getWorkspace, getConfig } from './api'
import type { WorkspaceFile, Config } from './api'
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

const PREVIEW_MIN_WIDTH = 260
const PREVIEW_MAX_WIDTH = 800
const PREVIEW_DEFAULT_WIDTH = 420

function App() {
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '👋 你好！我是 AI Excel Helper。\n\n你可以：\n- 📂 **上传文件**（xlsx、docx、csv 等）到左侧工作区\n- 💬 **用自然语言描述**你想做的操作，我会自动生成并执行 Python 代码\n- 👁️ **点击文件**预览内容\n- 📥 **下载**生成的结果文件\n\n**示例指令："把附件4登分模板.xlsx中的数据按学号排序后导出"',
      timestamp: Date.now(),
    }
  ])
  const [config, setConfig] = useState<Config | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)

  // 预览面板宽度（可拖拽）
  const [previewWidth, setPreviewWidth] = useState(PREVIEW_DEFAULT_WIDTH)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const refreshWorkspace = useCallback(async () => {
    try {
      const info = await getWorkspace()
      setFiles(info.files)
    } catch (e) {
      console.error('获取工作区失败', e)
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

  useEffect(() => {
    refreshWorkspace()
    refreshConfig()
    const timer = setInterval(refreshWorkspace, 30000)
    return () => clearInterval(timer)
  }, [refreshWorkspace, refreshConfig])

  // 拖拽分隔条逻辑
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
      // 向左拖 → 宽度增大，向右拖 → 宽度减小
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

  return (
    <div className="app-layout">
      {/* 左侧：文件管理 */}
      <Sidebar
        files={files}
        selectedFile={selectedFile}
        onSelectFile={(f) => {
          setSelectedFile(f)
          setPreviewFile(f)
        }}
        onRefresh={refreshWorkspace}
        onOpenSettings={() => setShowSettings(true)}
        config={config}
      />

      {/* 中间：AI 对话 */}
      <ChatPanel
        messages={messages}
        setMessages={setMessages}
        files={files}
        onRefreshWorkspace={refreshWorkspace}
        onPreviewFile={setPreviewFile}
        config={config}
      />

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
