import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Plus, Trash2, CheckCircle, AlertTriangle,
  MessageSquare, Pencil, Check, X,
  Settings, HelpCircle, Bot,
} from 'lucide-react'
import type { SessionMeta, Config } from '../api'
import { createSession, deleteSession, renameSession } from '../api'

interface Props {
  sessions: SessionMeta[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onSessionsChange: () => void
  onOpenSettings: () => void
  onStartTour: () => void
  config: Config | null
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onSessionsChange,
  onOpenSettings,
  onStartTour,
  config,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      const session = await createSession('新会话')
      onSessionsChange()
      onSelectSession(session.id)
      setEditingId(session.id)
      setEditingName(session.name)
    } catch {
      toast.error('创建会话失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    if (!confirm(`确认删除会话「${session.name}」及其所有文件？`)) return
    try {
      await deleteSession(session.id)
      toast.success(`已删除会话「${session.name}」`)
      onSessionsChange()
      if (activeSessionId === session.id) {
        const remaining = sessions.filter(s => s.id !== session.id)
        if (remaining.length > 0) {
          onSelectSession(remaining[0].id)
        }
      }
    } catch {
      toast.error('删除会话失败')
    }
  }

  const handleStartRename = (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    setEditingId(session.id)
    setEditingName(session.name)
  }

  const handleConfirmRename = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) {
      setEditingId(null)
      return
    }
    try {
      await renameSession(editingId, name)
      onSessionsChange()
    } catch {
      toast.error('重命名失败')
    } finally {
      setEditingId(null)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirmRename()
    if (e.key === 'Escape') setEditingId(null)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <aside className="session-sidebar">
      {/* 顶部标题 */}
      <div className="session-sidebar-header">
        <div className="session-sidebar-title">
          <img src="/icon.png" alt="Coda" className="sidebar-logo" />
          <span>Coda</span>
        </div>
      </div>

      {/* 新建会话按钮 */}
      <div className="session-new-btn-wrap">
        <button
          className="session-new-btn"
          onClick={handleCreate}
          disabled={creating}
        >
          <Plus size={14} strokeWidth={2} />
          <span>{creating ? '创建中...' : '新建会话'}</span>
        </button>
      </div>

      {/* 会话列表 */}
      <div className="session-list">
        {sessions.length === 0 && (
          <div className="session-empty">
            <MessageSquare size={28} strokeWidth={1} style={{ opacity: 0.3 }} />
            <span>暂无会话</span>
            <span style={{ fontSize: 11 }}>点击上方按钮新建</span>
          </div>
        )}

        {sessions.map(session => (
          <div
            key={session.id}
            className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="session-item-icon">
              <MessageSquare size={14} strokeWidth={1.5} />
            </div>

            <div className="session-item-body">
              {editingId === session.id ? (
                <div className="session-rename-row" onClick={e => e.stopPropagation()}>
                  <input
                    ref={editInputRef}
                    className="session-rename-input"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={handleConfirmRename}
                    maxLength={40}
                  />
                  <button className="session-rename-confirm" onMouseDown={handleConfirmRename}>
                    <Check size={12} strokeWidth={2} />
                  </button>
                  <button className="session-rename-cancel" onMouseDown={() => setEditingId(null)}>
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="session-name" title={session.name}>{session.name}</span>
                  <span className="session-time">{formatTime(session.updated_at)}</span>
                </>
              )}
            </div>

            {editingId !== session.id && (
              <div className="session-item-actions">
                <button
                  className="session-action-btn"
                  onClick={e => handleStartRename(e, session)}
                  title="重命名"
                >
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
                <button
                  className="session-action-btn danger"
                  onClick={e => handleDelete(e, session)}
                  title="删除会话"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部用户中心 */}
      <div className="sidebar-user-center">
        {/* API Key 状态指示 */}
        <div className={`user-center-status ${config?.has_api_key ? 'ok' : 'warn'}`}>
          <Bot size={14} strokeWidth={1.5} />
          <span>{config?.has_api_key ? 'AI 已连接' : '未配置 API Key'}</span>
          {config?.has_api_key
            ? <CheckCircle size={12} strokeWidth={2} className="status-icon ok" />
            : <AlertTriangle size={12} strokeWidth={2} className="status-icon warn" />
          }
        </div>

        {/* 操作按钮行 */}
        <div className="user-center-actions">
          <button
            className="user-center-btn"
            onClick={onStartTour}
            title="使用引导"
          >
            <HelpCircle size={15} strokeWidth={1.5} />
            <span>使用引导</span>
          </button>
          <button
            className="user-center-btn"
            onClick={onOpenSettings}
            title="设置"
          >
            <Settings size={15} strokeWidth={1.5} />
            <span>设置</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
