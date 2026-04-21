import { useRef, useState } from 'react'
import type { WorkspaceFile, Config } from '../api'
import { uploadFile, deleteFile, downloadFile, getFileIcon, formatSize } from '../api'

interface Props {
  files: WorkspaceFile[]
  selectedFile: WorkspaceFile | null
  onSelectFile: (f: WorkspaceFile) => void
  onRefresh: () => void
  onOpenSettings: () => void
  config: Config | null
}

export function Sidebar({ files, selectedFile, onSelectFile, onRefresh, onOpenSettings, config }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(fileList)) {
        await uploadFile(file)
      }
      onRefresh()
    } catch (e) {
      console.error('上传失败', e)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, file: WorkspaceFile) => {
    e.stopPropagation()
    if (!confirm(`确认删除 ${file.name}？`)) return
    try {
      await deleteFile(file.path)
      onRefresh()
    } catch (e) {
      console.error('删除失败', e)
    }
  }

  const handleDownload = async (e: React.MouseEvent, file: WorkspaceFile) => {
    e.stopPropagation()
    await downloadFile(file.path)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  // 分组：输出文件 vs 工作区文件
  const outputFiles = files.filter(f => f.path.startsWith('output/'))
  const workspaceFiles = files.filter(f => !f.path.startsWith('output/'))

  return (
    <aside className="sidebar">
      {/* 顶部标题 */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span className="sidebar-logo">⚡</span>
          <span>AI Excel Helper</span>
        </div>
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          title="设置"
        >
          ⚙️
        </button>
      </div>

      {/* API Key 状态 */}
      {config && (
        <div className={`api-status ${config.has_api_key ? 'ok' : 'warn'}`}>
          {config.has_api_key ? '✅ AI 已连接' : '⚠️ 未配置 API Key'}
        </div>
      )}

      {/* 上传区域 */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.docx,.doc,.txt,.json"
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploading ? (
          <span>⏳ 上传中...</span>
        ) : (
          <>
            <span className="upload-icon">📂</span>
            <span>点击或拖拽上传文件</span>
            <span className="upload-hint">支持 xlsx, docx, csv 等</span>
          </>
        )}
      </div>

      {/* 文件列表 */}
      <div className="file-list">
        {workspaceFiles.length > 0 && (
          <>
            <div className="file-group-label">工作区文件</div>
            {workspaceFiles.map(file => (
              <FileItem
                key={file.path}
                file={file}
                selected={selectedFile?.path === file.path}
                onClick={() => onSelectFile(file)}
                onDelete={(e) => handleDelete(e, file)}
                onDownload={(e) => handleDownload(e, file)}
              />
            ))}
          </>
        )}

        {outputFiles.length > 0 && (
          <>
            <div className="file-group-label">📥 输出文件</div>
            {outputFiles.map(file => (
              <FileItem
                key={file.path}
                file={file}
                selected={selectedFile?.path === file.path}
                onClick={() => onSelectFile(file)}
                onDelete={(e) => handleDelete(e, file)}
                onDownload={(e) => handleDownload(e, file)}
              />
            ))}
          </>
        )}

        {files.length === 0 && (
          <div className="empty-hint">
            <span>暂无文件</span>
            <span>请上传文件开始使用</span>
          </div>
        )}
      </div>

      {/* 底部刷新 */}
      <div className="sidebar-footer">
        <button className="refresh-btn" onClick={onRefresh}>
          🔄 刷新工作区
        </button>
      </div>
    </aside>
  )
}

function FileItem({
  file,
  selected,
  onClick,
  onDelete,
  onDownload,
}: {
  file: WorkspaceFile
  selected: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onDownload: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className={`file-item ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <span className="file-icon">{getFileIcon(file.ext)}</span>
      <div className="file-info">
        <span className="file-name" title={file.name}>{file.name}</span>
        <span className="file-size">{formatSize(file.size)}</span>
      </div>
      <div className="file-actions">
        <button className="file-action-btn" onClick={onDownload} title="下载">⬇️</button>
        <button className="file-action-btn" onClick={onDelete} title="删除">🗑️</button>
      </div>
    </div>
  )
}
