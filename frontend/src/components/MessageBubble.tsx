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
  MessageSquarePlus,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Message, AgentStep } from '../App'
import { downloadFile } from '../api'

interface Props {
  message: Message
  sessionId: string
  onRunCodeNewMsg: (code: string) => void
  onRunCodeInStep: (msgId: string, iteration: number, code: string) => void
}

export function MessageBubble({ message, sessionId, onRunCodeNewMsg, onRunCodeInStep }: Props) {
  // ---- Agent 加载状态 ----
  if (message.isLoading && message.isAgent) {
    return (
      <div className="message assistant">
        <div className="message-avatar">
          <img src="/icon.png" alt="AI" className="message-avatar-icon" />
        </div>
        <div className="message-body">
          {message.agentSteps && message.agentSteps.length > 0 && (
            <div className="agent-steps">
              {message.agentSteps.map(step => (
                <AgentStepCard
                  key={step.iteration}
                  step={step}
                  msgId={message.id}
                  sessionId={sessionId}
                  onRunCodeNewMsg={onRunCodeNewMsg}
                  onRunCodeInStep={onRunCodeInStep}
                />
              ))}
            </div>
          )}
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
          <span className="loading-text">AI 正在工作...</span>
        </div>
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="message-avatar">
          <img src="/icon.png" alt="AI" className="message-avatar-icon" />
        </div>
      )}

      <div className="message-body">
        <div className={`message-content ${message.success === false ? 'error' : message.success === true ? 'success' : ''}`}>
          <MarkdownText text={message.content} />
        </div>

        {/* Agent 步骤列表 */}
        {message.isAgent && message.agentSteps && message.agentSteps.length > 0 && (
          <div className="agent-steps">
            {message.agentSteps.map(step => (
              <AgentStepCard
                key={step.iteration}
                step={step}
                msgId={message.id}
                sessionId={sessionId}
                onRunCodeNewMsg={onRunCodeNewMsg}
                onRunCodeInStep={onRunCodeInStep}
              />
            ))}
          </div>
        )}

        {/* 手动执行代码的输出（非 Agent 消息） */}
        {!message.isAgent && (message.stdout || message.stderr) && (
          <div className="output-section">
            <div className="output-body">
              {message.stdout && <pre className="stdout">{message.stdout}</pre>}
              {message.stderr && <pre className="stderr">{message.stderr}</pre>}
            </div>
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
  msgId,
  sessionId,
  onRunCodeNewMsg,
  onRunCodeInStep,
}: {
  step: AgentStep
  msgId: string
  sessionId: string
  onRunCodeNewMsg: (code: string) => void
  onRunCodeInStep: (msgId: string, iteration: number, code: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingCode, setEditingCode] = useState(false)
  const [showRunMenu, setShowRunMenu] = useState(false)

  // 统一版本索引：-1 = AI原始，>=0 = execHistory[i]（代码+输出联动）
  const [versionIdx, setVersionIdx] = useState<number>(-1)

  const history = step.execHistory || []
  const totalVersions = 1 + history.length

  // 当前版本对应的代码
  const currentCode =
    versionIdx >= 0 && versionIdx < history.length
      ? history[versionIdx].code
      : (step.code || '')

  // 当前版本对应的输出
  const displayOutput =
    versionIdx >= 0 && versionIdx < history.length
      ? {
          stdout: history[versionIdx].stdout,
          stderr: history[versionIdx].stderr,
          success: history[versionIdx].success,
          outputFiles: history[versionIdx].outputFiles,
        }
      : { stdout: step.stdout, stderr: step.stderr, success: step.success, outputFiles: step.newFiles }

  // 编辑器内容（独立，不影响版本切换）
  const [editValue, setEditValue] = useState(currentCode)
  const runMenuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement | null>(null)

  // 切换版本时同步编辑器内容
  useEffect(() => {
    setEditValue(currentCode)
  }, [currentCode])

  // 新历史记录到来时自动切换到最新版本
  const prevHistoryLen = useRef(0)
  useEffect(() => {
    const len = history.length
    if (len > prevHistoryLen.current) {
      setVersionIdx(len - 1)
    }
    prevHistoryLen.current = len
  }, [history.length])

  // 点击外部关闭运行菜单
  useEffect(() => {
    if (!showRunMenu) return
    const handler = (e: MouseEvent) => {
      if (runMenuRef.current && !runMenuRef.current.contains(e.target as Node)) {
        setShowRunMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRunMenu])

  const hasCode = !!step.code
  const hasOutput = displayOutput.stdout || displayOutput.stderr

  return (
    <div className={`agent-step-card ${step.success === false ? 'step-error' : 'step-success'}`}>
      {/* 步骤头部 */}
      <div className="agent-step-header" onClick={() => setExpanded(v => !v)}>
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
          {history.length > 0 && (
            <span className="agent-step-files-badge" style={{ background: 'var(--color-focus-blue)', color: '#fff' }}>
              {history.length} 次重跑
            </span>
          )}
          {step.newFiles && step.newFiles.length > 0 && (
            <span className="agent-step-files-badge">+{step.newFiles.length} 文件</span>
          )}
          {expanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}
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

          {/* 代码区块 */}
          {hasCode && (
            <div className="agent-step-section">
              {/* 标题栏 */}
              <div className="agent-step-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <Zap size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  代码
                  {versionIdx >= 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                      （第 {versionIdx + 1} 次执行版本）
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button
                    className="code-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(editingCode ? editValue : currentCode)
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
                      if (!editingCode) setEditValue(currentCode)
                      setEditingCode(v => !v)
                    }}
                  >
                    {editingCode
                      ? <><Eye size={10} strokeWidth={1.5} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />预览</>
                      : <><Pencil size={10} strokeWidth={1.5} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />编辑</>
                    }
                  </button>
                  {editingCode && (
                    <div style={{ position: 'relative' }} ref={runMenuRef}>
                      <button
                        className="code-action-btn run"
                        onClick={(e) => { e.stopPropagation(); setShowRunMenu(v => !v) }}
                      >
                        <Play size={10} strokeWidth={2} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                        运行
                        <ChevronDown size={9} strokeWidth={2} style={{ display: 'inline', marginLeft: 2, verticalAlign: 'middle' }} />
                      </button>
                      {showRunMenu && (
                        <div className="run-mode-menu" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="run-mode-item"
                            onClick={() => { setShowRunMenu(false); onRunCodeInStep(msgId, step.iteration, editValue) }}
                          >
                            <RefreshCw size={11} strokeWidth={1.5} style={{ marginRight: 6, flexShrink: 0 }} />
                            <span>
                              <strong>更新此步骤</strong>
                              <br />
                              <small>结果追加到步骤内，可切换版本查看</small>
                            </span>
                          </button>
                          <button
                            className="run-mode-item"
                            onClick={() => { setShowRunMenu(false); onRunCodeNewMsg(editValue) }}
                          >
                            <MessageSquarePlus size={11} strokeWidth={1.5} style={{ marginRight: 6, flexShrink: 0 }} />
                            <span>
                              <strong>新消息</strong>
                              <br />
                              <small>在对话中追加一条新消息</small>
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 版本切换条（代码+输出联动） */}
              {totalVersions > 1 && (
                <div className="exec-version-bar">
                  <span className="exec-version-label">版本：</span>
                  <button
                    className={`exec-version-btn ${versionIdx === -1 ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setVersionIdx(-1) }}
                  >
                    AI 原始
                  </button>
                  {history.map((rec, i) => (
                    <button
                      key={i}
                      className={`exec-version-btn ${versionIdx === i ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setVersionIdx(i) }}
                      title={new Date(rec.timestamp).toLocaleTimeString('zh-CN')}
                    >
                      第 {i + 1} 次
                    </button>
                  ))}
                </div>
              )}

              {/* 代码展示/编辑区 */}
              {editingCode ? (
                <div className="code-editor-wrap code-editor-wrap--editing" onClick={(e) => e.stopPropagation()}>
                  <SyntaxHighlighter
                    language="python"
                    style={oneDark}
                    PreTag={({ children, ...props }) => (
                      <pre
                        {...props}
                        ref={(el) => { highlightRef.current = el }}
                      >
                        {children}
                      </pre>
                    )}
                    customStyle={{
                      margin: 0,
                      padding: '10px 12px',
                      background: '#1a1f2e',
                      fontSize: '12px',
                      lineHeight: '1.55',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      borderRadius: 0,
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                    codeTagProps={{ style: { fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace" } }}
                  >
                    {editValue + '\n'}
                  </SyntaxHighlighter>
                  <textarea
                    ref={textareaRef}
                    className="code-editor-overlay"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onScroll={(e) => {
                      if (highlightRef.current) {
                        highlightRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop
                        highlightRef.current.scrollLeft = (e.target as HTMLTextAreaElement).scrollLeft
                      }
                    }}
                    spellCheck={false}
                    autoFocus
                    style={{ background: 'transparent' }}
                  />
                </div>
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
                    borderRadius: 0,
                  }}
                  codeTagProps={{ style: { fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace" } }}
                >
                  {currentCode}
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
                {versionIdx >= 0 && (
                  <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 400 }}>
                    （第 {versionIdx + 1} 次 · {new Date(history[versionIdx].timestamp).toLocaleTimeString('zh-CN')}）
                  </span>
                )}
              </div>
              <div className="agent-step-output">
                {displayOutput.stdout && <pre className="stdout">{displayOutput.stdout}</pre>}
                {displayOutput.stderr && <pre className="stderr">{displayOutput.stderr}</pre>}
              </div>
            </div>
          )}

          {/* 生成文件 */}
          {displayOutput.outputFiles && displayOutput.outputFiles.length > 0 && (
            <div className="agent-step-section">
              <div className="agent-step-section-label">
                <Download size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                生成文件
              </div>
              <div className="output-files" style={{ marginTop: 4, padding: '6px 12px' }}>
                {displayOutput.outputFiles.map(f => (
                  <button
                    key={f}
                    className="output-file-btn"
                    onClick={(e) => { e.stopPropagation(); downloadFile(sessionId, f) }}
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
              if (part.startsWith('**') && part.endsWith('**')) return <strong key={j}>{part.slice(2, -2)}</strong>
              if (part.startsWith('`') && part.endsWith('`')) return <code key={j} className="inline-code">{part.slice(1, -1)}</code>
              if (part.startsWith('- ')) return <span key={j}>• {part.slice(2)}</span>
              return <span key={j}>{part}</span>
            })}
          </div>
        )
      })}
    </div>
  )
}
