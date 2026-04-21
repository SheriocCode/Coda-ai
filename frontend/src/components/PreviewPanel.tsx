import { useState, useEffect, useRef } from 'react'
import { Download, X, AlertCircle } from 'lucide-react'
import type { WorkspaceFile, PreviewResult, SheetData } from '../api'
import { previewFile, downloadFile, api } from '../api'
import { renderAsync } from 'docx-preview'

interface Props {
  file: WorkspaceFile | null
  sessionId: string
  onClose: () => void
  width?: number
}

export function PreviewPanel({ file, sessionId, onClose, width }: Props) {
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeSheet, setActiveSheet] = useState<string>('')

  useEffect(() => {
    if (!file || !sessionId) {
      setPreview(null)
      return
    }
    setLoading(true)
    setPreview(null)
    setActiveSheet('')

    if (file.ext === '.docx' || file.ext === '.doc') {
      // docx 直接标记类型，由 DocxPreview 组件自己去拉取并渲染
      setPreview({ type: 'docx' })
      setLoading(false)
    } else {
      previewFile(sessionId, file.path, 50)
        .then(res => {
          setPreview(res)
          if (res.sheets) {
            setActiveSheet(Object.keys(res.sheets)[0] || '')
          }
        })
        .catch(e => {
          setPreview({ type: 'error', message: String(e) })
        })
        .finally(() => setLoading(false))
    }
  }, [file, sessionId])

  if (!file) {
    return null
  }

  return (
    <aside className="preview-panel" style={{ width: width ?? 420 }}>
      {/* 头部 */}
      <div className="preview-header">
        <div className="preview-title">
          <span className="preview-filename" title={file.name}>{file.name}</span>
        </div>
        <div className="preview-actions">
          <button
            className="preview-action-btn"
            onClick={() => downloadFile(sessionId, file.path)}
            title="下载"
          >
            <Download size={14} strokeWidth={1.5} />
          </button>
          <button
            className="preview-action-btn"
            onClick={onClose}
            title="关闭"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="preview-body">
        {loading && (
          <div className="preview-loading">
            <div className="loading-dots">
              <span></span><span></span><span></span>
            </div>
            <span>加载中...</span>
          </div>
        )}

        {!loading && preview && (
          <>
            {preview.type === 'excel' || preview.type === 'csv' ? (
              <ExcelPreview
                sheets={preview.sheets!}
                activeSheet={activeSheet}
                onSheetChange={setActiveSheet}
              />
            ) : preview.type === 'docx' ? (
              <DocxPreview sessionId={sessionId} filePath={file.path} />
            ) : preview.type === 'error' ? (
              <div className="preview-error">
                <AlertCircle size={14} strokeWidth={1.5} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                {preview.message}
              </div>
            ) : (
              <div className="preview-unsupported">
                不支持预览此文件类型
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

// ── Word 文档预览组件（使用 docx-preview 渲染富文本）────────────
function DocxPreview({ sessionId, filePath }: { sessionId: string; filePath: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return
    setLoading(true)
    setError(null)

    // 通过下载接口获取 docx 二进制数据
    api.get(`/download/${sessionId}/${filePath}`, { responseType: 'arraybuffer' })
      .then(async (res) => {
        const blob = new Blob([res.data], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
        if (containerRef.current) {
          await renderAsync(blob, containerRef.current, undefined, {
            className: 'docx-render',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            useBase64URL: true,
            renderChanges: false,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
          })
        }
      })
      .catch(e => {
        setError(`预览失败: ${e.message || e}`)
      })
      .finally(() => setLoading(false))
  }, [sessionId, filePath])

  if (error) {
    return (
      <div className="preview-error">
        <AlertCircle size={14} strokeWidth={1.5} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
        {error}
      </div>
    )
  }

  return (
    <div className="docx-preview-wrapper">
      {loading && (
        <div className="preview-loading">
          <div className="loading-dots">
            <span></span><span></span><span></span>
          </div>
          <span>渲染文档中...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="docx-render-container"
        style={{ display: loading ? 'none' : 'block' }}
      />
    </div>
  )
}

// ── Excel / CSV 预览组件 ──────────────────────────────────────
function ExcelPreview({
  sheets,
  activeSheet,
  onSheetChange,
}: {
  sheets: Record<string, SheetData>
  activeSheet: string
  onSheetChange: (s: string) => void
}) {
  const sheetNames = Object.keys(sheets)
  const data = sheets[activeSheet]

  if (!data) return null

  return (
    <div className="excel-preview">
      {/* Sheet 标签 */}
      {sheetNames.length > 1 && (
        <div className="sheet-tabs">
          {sheetNames.map(name => (
            <button
              key={name}
              className={`sheet-tab ${activeSheet === name ? 'active' : ''}`}
              onClick={() => onSheetChange(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* 表格 */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-num">#</th>
              {data.columns.map((col, i) => (
                <th key={i} title={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri}>
                <td className="row-num">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} title={String(cell)}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-hint">{data.total_hint}</div>
    </div>
  )
}
