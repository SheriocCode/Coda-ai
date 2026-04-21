import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FolderOpen,
  Download,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import type { WorkspaceFile } from '../api'
import { uploadFile, deleteFile, downloadFile, getFileIcon, formatSize } from '../api'

interface Props {
  sessionId: string
  files: WorkspaceFile[]
  selectedFile: WorkspaceFile | null
  onSelectFile: (f: WorkspaceFile) => void
  onRefresh: () => void
}

export function Sidebar({ sessionId, files, selectedFile, onSelectFile, onRefresh }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    const names = Array.from(fileList).map(f => f.name)
    const toastId = toast.loading(
      names.length === 1 ? `正在上传 ${names[0]}...` : `正在上传 ${names.length} 个文件...`
    )
    try {
      for (const file of Array.from(fileList)) {
        await uploadFile(sessionId, file)
      }
      onRefresh()
      toast.success(
        names.length === 1 ? `${names[0]} 上传成功` : `${names.length} 个文件上传成功`,
        { id: toastId }
      )
    } catch (e) {
      console.error('上传失败', e)
      toast.error('上传失败，请重试', { id: toastId })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, file: WorkspaceFile) => {
    e.stopPropagation()
    if (!confirm(`确认删除 ${file.name}？`)) return
    try {
      await deleteFile(sessionId, file.path)
      onRefresh()
      toast.success(`已删除 ${file.name}`)
    } catch (e) {
      console.error('删除失败', e)
      toast.error(`删除失败：${file.name}`)
    }
  }

  const handleDownload = async (e: React.MouseEvent, file: WorkspaceFile) => {
    e.stopPropagation()
    try {
      downloadFile(sessionId, file.path)
      toast.success(`${file.name} 下载成功`)
    } catch (e) {
      console.error('下载失败', e)
      toast.error(`下载失败：${file.name}`)
    }
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
          <span>上传中...</span>
        ) : (
          <>
            <FolderOpen size={20} strokeWidth={1.5} className="upload-icon" />
            <span>点击或拖拽上传</span>
            <span className="upload-hint">xlsx, docx, csv 等</span>
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
            <div className="file-group-label">输出文件</div>
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
          <RefreshCw size={13} strokeWidth={1.5} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          刷新工作区
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
        <button className="file-action-btn" onClick={onDownload} title="下载">
          <Download size={13} strokeWidth={1.5} />
        </button>
        <button className="file-action-btn" onClick={onDelete} title="删除">
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
