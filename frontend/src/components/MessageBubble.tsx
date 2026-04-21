import { useState, useEffect } from 'react'
import type { Message } from '../App'
import { downloadFile } from '../api'

interface Props {
  message: Message
  onRetry: (code: string, instruction: string) => void
}

export function MessageBubble({ message, onRetry }: Props) {
  const [showCode, setShowCode] = useState(false)
  const [showOutput, setShowOutput] = useState(true)
  const [editingCode, setEditingCode] = useState(false)
  // 编辑用的临时 state，只在编辑模式下使用
  const [codeValue, setCodeValue] = useState(message.code || '')

  // 当 message.code 更新时（loading -> 有代码），同步更新 codeValue
  useEffect(() => {
    if (message.code) {
      setCodeValue(message.code)
    }
  }, [message.code])

  if (message.isLoading) {
    return (
      <div className="message assistant">
        <div className="message-avatar">🤖</div>
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
  // 展示用的代码：编辑模式用 codeValue，预览模式直接用 message.code
  const displayCode = editingCode ? codeValue : (message.code || '')

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <div className="message-avatar">🤖</div>}

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
                {showCode ? '▼' : '▶'} Python 代码
              </button>
              <div className="code-actions">
                {showCode && (
                  <>
                    <button
                      className="code-action-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(displayCode)
                      }}
                    >
                      📋 复制
                    </button>
                    <button
                      className="code-action-btn"
                      onClick={() => setEditingCode(!editingCode)}
                    >
                      {editingCode ? '👁️ 预览' : '✏️ 编辑'}
                    </button>
                    {editingCode && (
                      <button
                        className="code-action-btn run"
                        onClick={() => onRetry(codeValue, '重新执行修改后的代码')}
                      >
                        ▶ 运行
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
                />
              ) : (
                <pre className="code-block">
                  <code>{message.code}</code>
                </pre>
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
                {showOutput ? '▼' : '▶'} 执行输出
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
            <div className="output-files-label">📥 生成的文件：</div>
            {message.outputFiles.map(f => (
              <button
                key={f}
                className="output-file-btn"
                onClick={() => downloadFile(f)}
              >
                ⬇️ {f.split('/').pop()}
              </button>
            ))}
          </div>
        )}

        {/* 时间戳 */}
        <div className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN')}
        </div>
      </div>

      {isUser && <div className="message-avatar user-avatar">👤</div>}
    </div>
  )
}

// 简单的 Markdown 渲染（粗体、代码、换行）
function MarkdownText({ text }: { text: string }) {
  if (!text) return null

  // 处理换行和基本格式
  const lines = text.split('\n')
  return (
    <div className="markdown-text">
      {lines.map((line, i) => {
        // 处理粗体 **text**
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
              // 处理列表项
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
