import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import {
  FolderOpen,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  FileJson,
  FileCode2,
  FileType2,
  File,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import type { WorkspaceFile } from '../api'
import { uploadFile, deleteFile, downloadFile, formatSize } from '../api'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  sessionId: string
  files: WorkspaceFile[]
  selectedFile: WorkspaceFile | null
  onSelectFile: (f: WorkspaceFile) => void
  onRefresh: () => void
  width?: number
}

// ---- 目录树数据结构 ----
interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  file?: WorkspaceFile
}

/** 将扁平文件列表构建为目录树 */
function buildTree(files: WorkspaceFile[]): TreeNode[] {
const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let nodes = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const currentPath = parts.slice(0, i + 1).join('/')

      if (isLast) {
        nodes.push({ name: part, path: currentPath, isDir: false, children: [], file })
      } else {
        let dir = nodes.find(n => n.isDir && n.name === part)
        if (!dir) {
          dir = { name: part, path: currentPath, isDir: true, children: [] }
          nodes.push(dir)
        }
        nodes = dir.children
      }
    }
  }

  const sortNodes = (ns: TreeNode[]) => {
    ns.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    ns.forEach(n => { if (n.isDir) sortNodes(n.children) })
  }
  sortNodes(root)
  return root
}

/** 收集树中所有目录路径 */
function collectAllDirPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = []
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.isDir) { paths.push(n.path); walk(n.children) }
    }
  }
  walk(nodes)
  return paths
}

/** 从 DataTransfer 中递归读取所有文件（含子文件夹） */
async function readAllEntries(
  items: DataTransferItemList
): Promise<{ file: File; relativePath: string }[]> {
  const results: { file: File; relativePath: string }[] = []

  const readEntry = (entry: FileSystemEntry, prefix: string): Promise<void> =>
    new Promise(resolve => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file(f => {
          results.push({ file: f, relativePath: prefix + f.name })
          resolve()
        })
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        const readBatch = () => {
          reader.readEntries(async entries => {
            if (entries.length === 0) { resolve(); return }
            await Promise.all(entries.map(e => readEntry(e, prefix + entry.name + '/')))
            readBatch()
          })
        }
        readBatch()
      } else {
        resolve()
      }
    })

  const promises: Promise<void>[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry) promises.push(readEntry(entry, ''))
  }
  await Promise.all(promises)
  return results
}

export function Sidebar({ sessionId, files, selectedFile, onSelectFile, onRefresh, width }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [confirmFile, setConfirmFile] = useState<WorkspaceFile | null>(null)
  // 展开的目录路径集合
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  // 在 render 阶段同步更新 ref，确保 effect 中读取到最新值（不用 useEffect 避免异步延迟）
  const expandedDirsRef = useRef<Set<string>>(expandedDirs)
  expandedDirsRef.current = expandedDirs

  // 记录用户主动折叠的目录（按 sessionId 隔离），刷新时不自动展开这些目录
  const collapsedByUserRef = useRef<Map<string, Set<string>>>(new Map())

  const tree = useMemo(() => buildTree(files), [files])

  // 按 sessionId 缓存各会话的展开状态，切换回来时恢复
  const expandedCacheRef = useRef<Map<string, Set<string>>>(new Map())
  const prevSessionIdRef = useRef<string>(sessionId)

  useEffect(() => {
    const allDirs = collectAllDirPaths(tree)
    const sessionChanged = prevSessionIdRef.current !== sessionId

    if (sessionChanged) {
      // 保存离开会话的最新展开状态
      expandedCacheRef.current.set(prevSessionIdRef.current, new Set(expandedDirsRef.current))
      prevSessionIdRef.current = sessionId

      // 恢复新会话的展开状态；若从未访问过则默认全展开
      const cached = expandedCacheRef.current.get(sessionId)
      const userCollapsed = collapsedByUserRef.current.get(sessionId) ?? new Set<string>()

      if (cached) {
        // 有缓存：恢复，并把新增目录（既不在缓存中、也不是用户主动折叠的）默认展开
        const newDirs = allDirs.filter(p => !cached.has(p) && !userCollapsed.has(p))
        if (newDirs.length > 0) {
          const next = new Set(cached)
          newDirs.forEach(p => next.add(p))
          setExpandedDirs(next)
        } else {
          setExpandedDirs(new Set(cached))
        }
      } else {
        // 首次访问：全展开（用户主动折叠的除外）
        setExpandedDirs(new Set(allDirs.filter(p => !userCollapsed.has(p))))
      }
    } else {
      // 同一会话内刷新：只把真正新增的目录（用户从未折叠过的）加入展开集合
      if (allDirs.length === 0) return
      const userCollapsed = collapsedByUserRef.current.get(sessionId) ?? new Set<string>()
      setExpandedDirs(prev => {
        // 新增目录 = 不在 prev 中 且 不是用户主动折叠的
        const newDirs = allDirs.filter(p => !prev.has(p) && !userCollapsed.has(p))
        if (newDirs.length === 0) return prev
        const next = new Set(prev)
        newDirs.forEach(p => next.add(p))
        return next
      })
    }
  }, [sessionId, tree])

  // ---- 上传逻辑 ----
  const handleUploadItems = useCallback(async (
    items: { file: File; relativePath: string }[]
  ) => {
    if (items.length === 0) return
    setUploading(true)
    const toastId = toast.loading(
      items.length === 1 ? `正在上传 ${items[0].file.name}...` : `正在上传 ${items.length} 个文件...`
    )
    try {
      for (const { file, relativePath } of items) {
        await uploadFile(sessionId, file, relativePath || undefined)
      }
      onRefresh()
      toast.success(
        items.length === 1 ? `${items[0].file.name} 上传成功` : `${items.length} 个文件上传成功`,
        { id: toastId }
      )
    } catch (e) {
      console.error('上传失败', e)
      toast.error('上传失败，请重试', { id: toastId })
    } finally {
      setUploading(false)
    }
  }, [sessionId, onRefresh])

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    await handleUploadItems(Array.from(fileList).map(f => ({ file: f, relativePath: f.name })))
    e.target.value = ''
  }

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const items = Array.from(fileList).map(f => {
      // webkitRelativePath 是标准属性，形如 "folderName/sub/file.txt"
      const rel = f.webkitRelativePath
      console.log('[folder upload]', f.name, '->', rel)
      return { file: f, relativePath: rel || f.name }
    })
    await handleUploadItems(items)
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.items?.length > 0) {
      const items = await readAllEntries(e.dataTransfer.items)
      if (items.length > 0) { await handleUploadItems(items); return }
    }
    const fileList = e.dataTransfer.files
    if (fileList?.length > 0) {
      await handleUploadItems(Array.from(fileList).map(f => ({ file: f, relativePath: f.name })))
    }
  }

  const handleDelete = (e: React.MouseEvent, file: WorkspaceFile) => {
    e.stopPropagation()
    setConfirmFile(file)
  }

  const handleConfirmDelete = async () => {
    if (!confirmFile) return
    const file = confirmFile
    setConfirmFile(null)
    try {
      await deleteFile(sessionId, file.path)
      onRefresh()
      toast.success(`已删除 ${file.name}`)
    } catch (e) {
      toast.error(`删除失败：${file.name}`)
    }
  }

  const handleDownload = (e: React.MouseEvent, file: WorkspaceFile) => {
    e.stopPropagation()
    downloadFile(sessionId, file.path)
    toast.success(`${file.name} 下载成功`)
  }

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        // 用户主动折叠：记录到 collapsedByUser
        next.delete(path)
        const collapsed = collapsedByUserRef.current.get(sessionId) ?? new Set<string>()
        collapsed.add(path)
        collapsedByUserRef.current.set(sessionId, collapsed)
      } else {
        // 用户主动展开：从 collapsedByUser 中移除
        next.add(path)
        const collapsed = collapsedByUserRef.current.get(sessionId)
        if (collapsed) collapsed.delete(path)
      }
      return next
    })
  }, [sessionId])

  return (
    <>
      {/* input 放在 Fragment 根级，完全脱离任何可点击容器 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv,.docx,.doc,.txt,.json,.pdf,.py"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory 非标准属性
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderInputChange}
      />

      <ConfirmDialog
        open={!!confirmFile}
        title="确认删除文件"
        description={confirmFile ? `「${confirmFile.name}」删除后无法恢复。` : ''}
        confirmText="删除"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmFile(null)}
      />

      <aside className="sidebar" style={width ? { width, minWidth: width, maxWidth: width } : undefined}>
        {/* 合并上传区域：拖拽区 + 分割按钮 */}
        <div className="upload-area-wrap">
          {/* 拖拽 / 点击上传文件区域 */}
          <div
            className={`upload-zone-compact ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>上传中...</span>
            ) : (
              <>
                {/* 主按钮：上传文件 */}
                <button
                  className="upload-main-btn"
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  disabled={uploading}
                  title="点击上传文件，或拖拽文件/文件夹到此处"
                >
                  <Upload size={13} strokeWidth={2} />
                  <span>上传文件</span>
                </button>
                {/* 分隔线 */}
                <span className="upload-btn-divider" />
                {/* 次按钮：上传文件夹 */}
                <button
                  className="upload-folder-btn-sm"
                  onClick={() => !uploading && folderInputRef.current?.click()}
                  disabled={uploading}
                  title="选择文件夹上传（保留目录结构）"
                >
                  <FolderPlus size={13} strokeWidth={1.8} />
                  <span>文件夹</span>
                </button>
              </>
            )}
          </div>
          {/* 拖拽提示 */}
          {dragOver && (
            <div className="upload-drag-hint">松开鼠标上传</div>
          )}
        </div>

        {/* 目录树 */}
        <div className="file-list">
          {files.length === 0 ? (
            <div className="empty-hint">
              <span>暂无文件</span>
              <span>请上传文件开始使用</span>
            </div>
          ) : (
            <div className="tree-root">
              {tree.map(node => (
                <TreeNodeView
                  key={node.path}
                  node={node}
                  depth={0}
                  isLast={node === tree[tree.length - 1]}
                  expandedDirs={expandedDirs}
                  selectedFile={selectedFile}
                  onToggleDir={toggleDir}
                  onSelectFile={onSelectFile}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                  parentLines={[]}
                />
              ))}
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
    </>
  )
}

// ============================================================
// 单个树节点（递归）
// ============================================================
interface TreeNodeViewProps {
  node: TreeNode
  depth: number
  isLast: boolean
  expandedDirs: Set<string>
  selectedFile: WorkspaceFile | null
  onToggleDir: (path: string) => void
  onSelectFile: (f: WorkspaceFile) => void
  onDelete: (e: React.MouseEvent, file: WorkspaceFile) => void
  onDownload: (e: React.MouseEvent, file: WorkspaceFile) => void
  /** 父级各层是否还有后续兄弟节点（用于绘制竖线） */
  parentLines: boolean[]
}

function TreeNodeView({
  node,
  depth,
  isLast,
  expandedDirs,
  selectedFile,
  onToggleDir,
  onSelectFile,
  onDelete,
  onDownload,
  parentLines,
}: TreeNodeViewProps) {
  const expanded = expandedDirs.has(node.path)
  const isOutput = node.isDir && node.name === 'output' && depth === 0

  if (node.isDir) {
    return (
      <div className="tree-node-wrap">
        {/* 目录行 */}
        <div
          className="tree-row tree-dir-row"
          onClick={() => onToggleDir(node.path)}
        >
          {/* 缩进 + 连接线 */}
          <TreeIndent depth={depth} isLast={isLast} parentLines={parentLines} />

          {/* 折叠箭头 */}
          <span className="tree-arrow">
            {expanded
              ? <ChevronDown size={11} strokeWidth={2.5} />
              : <ChevronRight size={11} strokeWidth={2.5} />}
          </span>

          {/* 文件夹图标 */}
          {expanded
            ? <FolderOpen size={14} strokeWidth={1.5} className={`tree-folder-icon${isOutput ? ' output-folder' : ''}`} />
            : <Folder size={14} strokeWidth={1.5} className={`tree-folder-icon${isOutput ? ' output-folder' : ''}`} />
          }

          <span className="tree-label" title={node.name}>{node.name}</span>
          <span className="tree-badge">{countFiles(node)}</span>
        </div>

        {/* 子节点 */}
        {expanded && node.children.length > 0 && (
          <div className="tree-children">
            {node.children.map((child, idx) => (
              <TreeNodeView
                key={child.path}
                node={child}
                depth={depth + 1}
                isLast={idx === node.children.length - 1}
                expandedDirs={expandedDirs}
                selectedFile={selectedFile}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                onDelete={onDelete}
                onDownload={onDownload}
                parentLines={[...parentLines, !isLast]}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // 文件行
  const file = node.file!
  const selected = selectedFile?.path === file.path
  return (
    <div
      className={`tree-row tree-file-row${selected ? ' selected' : ''}`}
      onClick={() => onSelectFile(file)}
    >
      <TreeIndent depth={depth} isLast={isLast} parentLines={parentLines} />

      {/* 文件图标 */}
      <span className="tree-file-icon">{getFileTypeIcon(file.ext)}</span>

      <div className="tree-file-info">
        <span className="tree-label" title={file.name}>{file.name}</span>
        <span className="tree-file-size">{formatSize(file.size)}</span>
      </div>

      <div className="tree-file-actions">
        <button
          className="file-action-btn"
          onClick={(e) => { e.stopPropagation(); onDownload(e, file) }}
          title="下载"
        >
          <Download size={12} strokeWidth={1.5} />
        </button>
        <button
          className="file-action-btn"
          onClick={(e) => { e.stopPropagation(); onDelete(e, file) }}
          title="删除"
        >
          <Trash2 size={12} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

// ---- 缩进 + 连接线 ----
function TreeIndent({ depth, isLast, parentLines }: {
  depth: number
  isLast: boolean
  parentLines: boolean[]
}) {
  if (depth === 0) return null
  return (
    <span className="tree-indent" aria-hidden>
      {/* 父级各层的竖线 */}
      {parentLines.map((hasLine, i) => (
        <span key={i} className="tree-indent-unit">
          {hasLine ? <span className="tree-vline" /> : null}
        </span>
      ))}
      {/* 当前层的 L 形或 T 形连接线 */}
      <span className="tree-indent-unit tree-connector">
        <span className={isLast ? 'tree-corner' : 'tree-tee'} />
      </span>
    </span>
  )
}

function countFiles(node: TreeNode): number {
  if (!node.isDir) return 1
  return node.children.reduce((sum, c) => sum + countFiles(c), 0)
}

function getFileTypeIcon(ext: string) {
  const s: React.CSSProperties = { flexShrink: 0 }
  const p = { size: 13, strokeWidth: 1.5, style: s }
  switch (ext) {
    case '.xlsx': case '.xls':
      return <FileSpreadsheet {...p} style={{ ...s, color: '#217346' }} />
    case '.csv':
      return <FileSpreadsheet {...p} style={{ ...s, color: '#0e7c42' }} />
    case '.docx': case '.doc':
      return <FileText {...p} style={{ ...s, color: '#2b579a' }} />
    case '.pdf':
      return <FileType2 {...p} style={{ ...s, color: '#e74c3c' }} />
    case '.txt':
      return <FileText {...p} style={{ ...s, color: '#888' }} />
    case '.json':
      return <FileJson {...p} style={{ ...s, color: '#f0a500' }} />
    case '.py':
      return <FileCode2 {...p} style={{ ...s, color: '#3572A5' }} />
    default:
      return <File {...p} style={{ ...s, color: '#aaa' }} />
  }
}
