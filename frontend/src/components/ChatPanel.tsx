import { useState, useRef, useEffect, useCallback } from 'react'
import type { Message } from '../App'
import type { WorkspaceFile, Config } from '../api'
import { executeInstruction, executeCode } from '../api'
import { MessageBubble } from './MessageBubble'

interface Props {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  files: WorkspaceFile[]
  onRefreshWorkspace: () => void
  onPreviewFile: (f: WorkspaceFile) => void
  config: Config | null
}

export function ChatPanel({ messages, setMessages, files, onRefreshWorkspace, config }: Props) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 自动调整 textarea 高度
  const adjustHeight = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const newMsg: Message = {
      ...msg,
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, newMsg])
    return newMsg.id
  }, [setMessages])

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
  }, [setMessages])

  // 构建对话历史（用于 AI 上下文）
  const buildHistory = useCallback(() => {
    return messages
      .filter(m => m.role !== 'system' && !m.isLoading && m.id !== 'welcome')
      .slice(-10) // 最近10条
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.code
          ? `${m.content}\n\n生成的代码:\n\`\`\`python\n${m.code}\n\`\`\`\n执行结果:\n${m.stdout || ''}\n${m.stderr || ''}`
          : m.content
      }))
  }, [messages])

  const handleSend = async () => {
    const instruction = input.trim()
    if (!instruction || isLoading) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // 添加用户消息
    addMessage({ role: 'user', content: instruction })

    // 添加 loading 消息
    const loadingId = addMessage({
      role: 'assistant',
      content: '',
      isLoading: true,
    })

    setIsLoading(true)

    try {
      const history = buildHistory()
      const result = await executeInstruction(instruction, history)

      updateMessage(loadingId, {
        isLoading: false,
        content: result.success
          ? `✅ 执行成功${result.output_files.length > 0 ? `，生成了 ${result.output_files.length} 个文件` : ''}`
          : `❌ 执行出错，请查看详情`,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.success,
        outputFiles: result.output_files,
      })

      // 刷新工作区
      if (result.output_files.length > 0) {
        onRefreshWorkspace()
      }

      // 如果失败，自动重试一次
      if (!result.success && result.stderr) {
        await handleAutoRetry(instruction, result.code, result.stderr, history)
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      // 检查是否是 axios 错误
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      const detail = axiosErr?.response?.data?.detail || errMsg
      updateMessage(loadingId, {
        isLoading: false,
        content: `❌ 请求失败: ${detail}`,
        success: false,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAutoRetry = async (
    instruction: string,
    failedCode: string,
    errorMsg: string,
    history: Array<{ role: string; content: string }>
  ) => {
    const retryInstruction = `上面的代码执行失败了，错误信息如下：\n\`\`\`\n${errorMsg}\n\`\`\`\n请修复代码并重新生成。原始需求：${instruction}`

    const retryLoadingId = addMessage({
      role: 'assistant',
      content: '',
      isLoading: true,
    })

    try {
      const retryHistory = [
        ...history,
        { role: 'assistant', content: `生成的代码:\n\`\`\`python\n${failedCode}\n\`\`\`` },
      ]
      const result = await executeInstruction(retryInstruction, retryHistory)

      updateMessage(retryLoadingId, {
        isLoading: false,
        content: result.success
          ? `🔄 自动修复成功${result.output_files.length > 0 ? `，生成了 ${result.output_files.length} 个文件` : ''}`
          : `❌ 自动修复失败，请手动检查代码`,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.success,
        outputFiles: result.output_files,
      })

      if (result.output_files.length > 0) {
        onRefreshWorkspace()
      }
    } catch {
      updateMessage(retryLoadingId, {
        isLoading: false,
        content: '❌ 自动修复请求失败',
        success: false,
      })
    }
  }

  const handleRetryWithCode = async (code: string, instruction: string) => {
    const loadingId = addMessage({
      role: 'assistant',
      content: '',
      isLoading: true,
    })
    setIsLoading(true)

    try {
      const result = await executeCode(code, instruction)
      updateMessage(loadingId, {
        isLoading: false,
        content: result.success ? '✅ 执行成功' : '❌ 执行出错',
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.success,
        outputFiles: result.output_files,
      })
      if (result.output_files.length > 0) {
        onRefreshWorkspace()
      }
    } catch {
      updateMessage(loadingId, {
        isLoading: false,
        content: '❌ 执行失败',
        success: false,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 快捷指令
  const quickCommands = [
    '读取工作区的 xlsx 文件，显示前5行数据',
    '统计 Excel 中各列的基本信息（行数、空值数等）',
    '批量生成 Word 文档，使用模板替换占位符',
    '将多个 Excel 文件合并为一个',
  ]

  return (
    <main className="chat-panel">
      {/* 顶部栏 */}
      <div className="chat-header">
        <div className="chat-header-info">
          <span className="chat-title">AI 代码解释器</span>
          <span className="chat-subtitle">
            {files.length > 0
              ? `工作区 ${files.length} 个文件`
              : '请先上传文件'}
          </span>
        </div>
        <button
          className="clear-btn"
          onClick={() => setMessages(prev => [prev[0]])}
          title="清空对话"
        >
          🗑️ 清空
        </button>
      </div>

      {/* 消息列表 */}
      <div className="messages-container">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onRetry={handleRetryWithCode}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 快捷指令（仅在消息少时显示） */}
      {messages.length <= 2 && files.length > 0 && (
        <div className="quick-commands">
          <div className="quick-label">💡 快捷指令</div>
          <div className="quick-list">
            {quickCommands.map((cmd, i) => (
              <button
                key={i}
                className="quick-btn"
                onClick={() => {
                  setInput(cmd)
                  textareaRef.current?.focus()
                }}
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="input-area">
        {!config?.has_api_key && (
          <div className="no-key-hint">⚠️ 请先在设置中配置 API Key</div>
        )}
        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustHeight() }}
            onKeyDown={handleKeyDown}
            placeholder={
              config?.has_api_key
                ? '描述你想做的操作... (Enter 发送，Shift+Enter 换行)'
                : '请先配置 API Key'
            }
            disabled={isLoading || !config?.has_api_key}
            rows={1}
          />
          <button
            className={`send-btn ${isLoading ? 'loading' : ''}`}
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !config?.has_api_key}
          >
            {isLoading ? (
              <span className="spinner">⏳</span>
            ) : (
              '▶'
            )}
          </button>
        </div>
        <div className="input-hint">
          工作区文件：{files.filter(f => !f.path.startsWith('output/')).map(f => f.name).join(', ') || '无'}
        </div>
      </div>
    </main>
  )
}
