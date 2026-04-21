import { useState, useEffect, useRef } from 'react'
import {
  User,
  Copy,
  Pencil,
  Eye,
  Play,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Message } from '../App'
import { downloadFile } from '../api'

interface Props {
  message: Message
  sessionId: string
  onRetry: (code: string, instruction: string) => void
}

export function MessageBubble({ message, sessionId, onRetry }: Props) {
  const [showCode, setShowCode] = useState(false)
  const [showOutput, setShowOutput] = useState(true)
  const [editingCode, setEditingCode] = useState(false)
  const [codeValue, setCodeValue] = useState(message.code || '')
  // 记录预览模式下代码块的实际高度，切换编辑时保持一致
  const codeBlockRef = useRef<HTMLDivElement>(null)
  const [codeBlockHeight, setCodeBlockHeight] = useState<number | null>(null)

  useEffect(() => {
    if (message.code) {
      setCodeValue(message.code)
    }
  }, [message.code])

  // 切换到编辑模式时，记录当前代码块高度
  const handleToggleEdit = () => {
    if (!editingCode && codeBlockRef.current) {
      setCodeBlockHeight(codeBlockRef.current.offsetHeight)
    }
    setEditingCode(v => !v)
  }

  if (message.isLoading) {
    return (
      <div className="message assistant">
        <div className="message-avatar">
          <img src="/icon.png" alt="AI" className="message-avatar-icon" />
        </div>
        <div className="message-body">
          <div className="loading-dots">
            <span></span><span></span><span></span>
          </div>
          <span className="loading-text">AI 正在生成并执行代码...</span>
        </div>
      </div>
    )
  }

  const isUser = message.role === 'user'
  const displayCode = editingCode ? codeValue : (message.code || '')

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="message-avatar">
          <img src="/icon.png" alt="AI" className="message-avatar-icon" />
        </div>
      )}

      <div className="message-body">
        {/* 主要内容 */}
        <div className={`message-content ${message.success === false ? 'error' : message.success === true ? 'success' : ''}`}>
          <MarkdownText text={message.content} />
        </div>

        {/* 代码块 */}
        {message.code && (
          <div className="code-section">
            <div className="code-header">
              <button
                className="toggle-btn"
                onClick={() => setShowCode(!showCode)}
              >
                {showCode
                  ? <ChevronDown size={12} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  : <ChevronRight size={12} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                }
                Python 代码
              </button>
              <div className="code-actions">
                {showCode && (
                  <>
                    <button
                      className="code-action-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(displayCode)
                        toast.success('代码已复制')
                      }}
                    >
                      <Copy size={11} strokeWidth={1.5} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                      复制
                    </button>
                    <button
                      className="code-action-btn"
                      onClick={handleToggleEdit}
                    >
                      {editingCode
                        ? <><Eye size={11} strokeWidth={1.5} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />预览</>
                        : <><Pencil size={11} strokeWidth={1.5} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />编辑</>
                      }
                    </button>
                    {editingCode && (
                      <button
                        className="code-action-btn run"
                        onClick={() => onRetry(codeValue, '重新执行修改后的代码')}
                      >
                        <Play size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                        运行
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {showCode && (
              editingCode ? (
                <textarea
                  className="code-editor"
                  value={codeValue}
                  onChange={(e) => setCodeValue(e.target.value)}
                  spellCheck={false}
                  style={codeBlockHeight ? { height: codeBlockHeight, minHeight: codeBlockHeight, maxHeight: 'none' } : {}}
                />
              ) : (
                <div ref={codeBlockRef} className="code-block-wrapper">
                  <SyntaxHighlighter
                    language="python"
                    style={oneDark}
                    customStyle={{
                      margin: 0,
                      padding: '12px 14px',
                      background: 'var(--color-vercel-black)',
                      fontSize: '12.5px',
                      lineHeight: '1.6',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      borderRadius: 0,
                    }}
                    codeTagProps={{ style: { fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace" } }}
                  >
                    {message.code}
                  </SyntaxHighlighter>
                </div>
              )
            )}
          </div>
        )}

        {/* 执行输出 */}
        {(message.stdout || message.stderr) && (
          <div className="output-section">
            <div className="output-header">
              <button
                className="toggle-btn"
                onClick={() => setShowOutput(!showOutput)}
              >
                {showOutput
                  ? <ChevronDown size={12} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  : <ChevronRight size={12} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                }
                执行输出
              </button>
            </div>
            {showOutput && (
              <div className="output-body">
                {message.stdout && (
                  <pre className="stdout">{message.stdout}</pre>
                )}
                {message.stderr && (
                  <pre className="stderr">{message.stderr}</pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* 输出文件 */}
        {message.outputFiles && message.outputFiles.length > 0 && (
          <div className="output-files">
            <div className="output-files-label">生成的文件：</div>
            {message.outputFiles.map(f => (
              <button
                key={f}
                className="output-file-btn"
                onClick={() => downloadFile(sessionId, f)}
              >
                <Download size={11} strokeWidth={1.5} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {f.split('/').pop()}
              </button>
            ))}
          </div>
        )}

        {/* 时间戳 */}
        <div className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN')}
        </div>
      </div>

      {isUser && (
        <div className="message-avatar user-avatar">
          <User size={18} strokeWidth={1.5} />
        </div>
      )}
    </div>
  )
}

// 简单的 Markdown 渲染（粗体、代码、换行）
function MarkdownText({ text }: { text: string }) {
  if (!text) return null

  const lines = text.split('\n')
  return (
    <div className="markdown-text">
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
        return (
          <div key={i} className={line === '' ? 'empty-line' : ''}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>
              }
              if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={j} className="inline-code">{part.slice(1, -1)}</code>
              }
              if (part.startsWith('- ')) {
                return <span key={j}>• {part.slice(2)}</span>
              }
              return <span key={j}>{part}</span>
            })}
          </div>
        )
      })}
    </div>
  )
}
