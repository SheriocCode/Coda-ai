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
  Brain,
  Zap,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Message, AgentStep } from '../App'
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
  const codeBlockRef = useRef<HTMLDivElement>(null)
  const [codeBlockHeight, setCodeBlockHeight] = useState<number | null>(null)

  useEffect(() => {
    if (message.code) {
      setCodeValue(message.code)
    }
  }, [message.code])

  const handleToggleEdit = () => {
    if (!editingCode && codeBlockRef.current) {
      setCodeBlockHeight(codeBlockRef.current.offsetHeight)
    }
    setEditingCode(v => !v)
  }

  // ---- Agent 加载状态 ----
  if (message.isLoading && message.isAgent) {
    return (
      <div className="message assistant">
        <div className="message-avatar">
          <img src="/icon.png" alt="AI" className="message-avatar-icon" />
        </div>
        <div className="message-body">
          {/* 已完成的步骤 */}
          {message.agentSteps && message.agentSteps.length > 0 && (
            <div className="agent-steps">
              {message.agentSteps.map(step => (
                <AgentStepCard key={step.iteration} step={step} sessionId={sessionId} onRetry={onRetry} />
              ))}
            </div>
          )}
          {/* 当前状态提示 */}
          <div className="agent-thinking-bar">
            <Loader2 size={13} className="spin" strokeWidth={2} style={{ flexShrink: 0 }} />
            <span className="agent-thinking-text">
              {message.agentThinking || 'Agent 正在工作...'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ---- 普通加载状态 ----
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

        {/* Agent 步骤列表 */}
        {message.isAgent && message.agentSteps && message.agentSteps.length > 0 && (
          <div className="agent-steps">
            {message.agentSteps.map(step => (
              <AgentStepCard key={step.iteration} step={step} sessionId={sessionId} onRetry={onRetry} />
            ))}
          </div>
        )}

        {/* 旧版：代码块（非 Agent 消息） */}
        {!message.isAgent && message.code && (
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

        {/* 旧版：执行输出（非 Agent 消息） */}
        {!message.isAgent && (message.stdout || message.stderr) && (
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

// ---- Agent 步骤卡片 ----
function AgentStepCard({
  step,
  sessionId,
  onRetry,
}: {
  step: AgentStep
  sessionId: string
  onRetry: (code: string, instruction: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingCode, setEditingCode] = useState(false)
  const [codeValue, setCodeValue] = useState(step.code || '')

  useEffect(() => {
    setCodeValue(step.code || '')
  }, [step.code])

  const hasOutput = step.stdout || step.stderr
  const hasCode = !!step.code

  return (
    <div className={`agent-step-card ${step.success === false ? 'step-error' : 'step-success'}`}>
      {/* 步骤头部 */}
      <div
        className="agent-step-header"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="agent-step-header-left">
          {step.success === false
            ? <XCircle size={13} strokeWidth={2} className="step-icon error" />
            : <CheckCircle2 size={13} strokeWidth={2} className="step-icon success" />
          }
          <span className="agent-step-num">步骤 {step.iteration}</span>
          {step.description && (
            <span className="agent-step-desc">{step.description}</span>
          )}
        </div>
        <div className="agent-step-header-right">
          {step.newFiles && step.newFiles.length > 0 && (
            <span className="agent-step-files-badge">
              +{step.newFiles.length} 文件
            </span>
          )}
          {expanded
            ? <ChevronDown size={12} strokeWidth={2} />
            : <ChevronRight size={12} strokeWidth={2} />
          }
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="agent-step-body">
          {/* 思考过程 */}
          {step.thought && (
            <div className="agent-step-section">
              <div className="agent-step-section-label">
                <Brain size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                思考
              </div>
              <div className="agent-step-thought">{step.thought}</div>
            </div>
          )}

          {/* 代码 */}
          {hasCode && (
            <div className="agent-step-section">
              <div className="agent-step-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <Zap size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  代码
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="code-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(codeValue)
                      toast.success('代码已复制')
                    }}
                  >
                    <Copy size={10} strokeWidth={1.5} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                    复制
                  </button>
                  <button
                    className="code-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingCode(v => !v)
                    }}
                  >
                    {editingCode
                      ? <><Eye size={10} strokeWidth={1.5} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />预览</>
                      : <><Pencil size={10} strokeWidth={1.5} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />编辑</>
                    }
                  </button>
                  {editingCode && (
                    <button
                      className="code-action-btn run"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRetry(codeValue, '重新执行修改后的代码')
                      }}
                    >
                      <Play size={10} strokeWidth={2} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                      运行
                    </button>
                  )}
                </div>
              </div>
              {editingCode ? (
                <textarea
                  className="code-editor"
                  value={codeValue}
                  onChange={(e) => setCodeValue(e.target.value)}
                  spellCheck={false}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <SyntaxHighlighter
                  language="python"
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    padding: '10px 12px',
                    background: 'var(--color-vercel-black)',
                    fontSize: '12px',
                    lineHeight: '1.55',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    borderRadius: '0 0 6px 6px',
                  }}
                  codeTagProps={{ style: { fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace" } }}
                >
                  {step.code || ''}
                </SyntaxHighlighter>
              )}
            </div>
          )}

          {/* 执行输出 */}
          {hasOutput && (
            <div className="agent-step-section">
              <div className="agent-step-section-label">
                <Terminal size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                输出
              </div>
              <div className="agent-step-output">
                {step.stdout && <pre className="stdout">{step.stdout}</pre>}
                {step.stderr && <pre className="stderr">{step.stderr}</pre>}
              </div>
            </div>
          )}

          {/* 新生成的文件 */}
          {step.newFiles && step.newFiles.length > 0 && (
            <div className="agent-step-section">
              <div className="agent-step-section-label">
                <Download size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                生成文件
              </div>
              <div className="output-files" style={{ marginTop: 4 }}>
                {step.newFiles.map(f => (
                  <button
                    key={f}
                    className="output-file-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadFile(sessionId, f)
                    }}
                  >
                    <Download size={10} strokeWidth={1.5} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                    {f.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>
          )}
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
