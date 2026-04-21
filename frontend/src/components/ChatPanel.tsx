import { useState, useRef, useEffect, useCallback } from 'react'
import { Trash2, Send, StopCircle } from 'lucide-react'
import type { Message, AgentStep } from '../App'
import type { WorkspaceFile, Config, AgentEvent } from '../api'
import { runAgent, executeCode } from '../api'
import { MessageBubble } from './MessageBubble'

interface Props {
  sessionId: string
  sessionName: string
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  files: WorkspaceFile[]
  onRefreshWorkspace: () => void
  onPreviewFile: (f: WorkspaceFile) => void
  config: Config | null
}

export function ChatPanel({
  sessionId,
  sessionName,
  messages,
  setMessages,
  files,
  onRefreshWorkspace,
  config,
}: Props) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // 用于取消 Agent 请求
  const abortControllerRef = useRef<AbortController | null>(null)

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
      .slice(-10)
      .map(m => {
        if (m.isAgent && m.agentSteps && m.agentSteps.length > 0) {
          // Agent 消息：把步骤摘要作为 assistant 内容
          const stepsSummary = m.agentSteps.map((s, i) => {
            const parts = [`步骤${i + 1}:`]
            if (s.thought) parts.push(`思考: ${s.thought}`)
            if (s.code) parts.push(`代码:\n\`\`\`python\n${s.code}\n\`\`\``)
            if (s.stdout) parts.push(`输出: ${s.stdout.slice(0, 200)}`)
            return parts.join('\n')
          }).join('\n\n')
          return {
            role: m.role as 'user' | 'assistant',
            content: `${m.content}\n\n执行步骤:\n${stepsSummary}`
          }
        }
        return {
          role: m.role as 'user' | 'assistant',
          content: m.code
            ? `${m.content}\n\n生成的代码:\n\`\`\`python\n${m.code}\n\`\`\`\n执行结果:\n${m.stdout || ''}\n${m.stderr || ''}`
            : m.content
        }
      })
  }, [messages])

  const handleSend = async () => {
    const instruction = input.trim()
    if (!instruction || isLoading) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    addMessage({ role: 'user', content: instruction })

    // 创建 Agent 消息占位
    const agentMsgId = addMessage({
      role: 'assistant',
      content: '',
      isLoading: true,
      isAgent: true,
      agentSteps: [],
      agentStatus: 'running',
    })

    setIsLoading(true)

    // 创建 AbortController 用于取消
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // 当前步骤的临时状态（用于在 observation 到来前聚合 thought + action）
    let currentStep: Partial<AgentStep> & { iteration: number } | null = null

    try {
      const history = buildHistory()

      await runAgent(
        sessionId,
        instruction,
        history,
        (event: AgentEvent) => {
          switch (event.type) {
            case 'start':
              updateMessage(agentMsgId, {
                agentThinking: '🚀 Agent 开始工作...',
              })
              break

            case 'thinking':
              updateMessage(agentMsgId, {
                agentThinking: `⏳ 第 ${event.iteration} 轮思考中...`,
              })
              // 初始化新步骤
              currentStep = { iteration: event.iteration }
              break

            case 'thought':
              // 更新当前步骤的思考内容
              if (currentStep && currentStep.iteration === event.iteration) {
                currentStep.thought = event.content
              }
              updateMessage(agentMsgId, {
                agentThinking: `💭 ${event.content.slice(0, 80)}${event.content.length > 80 ? '...' : ''}`,
              })
              break

            case 'action':
              // 更新当前步骤的行动内容
              if (currentStep && currentStep.iteration === event.iteration) {
                currentStep.description = event.description
                currentStep.code = event.code
              }
              updateMessage(agentMsgId, {
                agentThinking: `⚡ ${event.description}`,
              })
              break

            case 'observation': {
              // 步骤完成，将完整步骤加入列表
              const completedStep: AgentStep = {
                iteration: event.iteration,
                thought: currentStep?.thought,
                description: currentStep?.description,
                code: currentStep?.code,
                stdout: event.stdout,
                stderr: event.stderr,
                success: event.success,
                newFiles: event.new_files,
              }
              currentStep = null

              setMessages(prev => prev.map(m => {
                if (m.id !== agentMsgId) return m
                const existingSteps = m.agentSteps || []
                // 避免重复添加同一轮次
                const filtered = existingSteps.filter(s => s.iteration !== event.iteration)
                return {
                  ...m,
                  agentSteps: [...filtered, completedStep],
                  agentThinking: event.success
                    ? `✅ 第 ${event.iteration} 步执行完成`
                    : `❌ 第 ${event.iteration} 步执行出错`,
                }
              }))

              // 如果有新文件，刷新工作区
              if (event.new_files && event.new_files.length > 0) {
                onRefreshWorkspace()
              }
              break
            }

            case 'finish':
              updateMessage(agentMsgId, {
                isLoading: false,
                content: event.max_reached
                  ? `⚠️ 已达到最大迭代次数，任务可能未完全完成。\n\n${event.summary}`
                  : `✅ ${event.summary}`,
                agentStatus: 'done',
                agentThinking: undefined,
                outputFiles: event.output_files,
                success: !event.max_reached,
              })
              if (event.output_files && event.output_files.length > 0) {
                onRefreshWorkspace()
              }
              break

            case 'error':
              updateMessage(agentMsgId, {
                isLoading: false,
                content: `❌ Agent 出错: ${event.message}`,
                agentStatus: 'error',
                agentThinking: undefined,
                success: false,
              })
              break
          }
        },
        abortController.signal
      )
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        updateMessage(agentMsgId, {
          isLoading: false,
          content: '⏹️ 已停止',
          agentStatus: 'done',
          agentThinking: undefined,
        })
      } else {
        const errMsg = err instanceof Error ? err.message : String(err)
        updateMessage(agentMsgId, {
          isLoading: false,
          content: `❌ 请求失败: ${errMsg}`,
          agentStatus: 'error',
          agentThinking: undefined,
          success: false,
        })
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
  }

  const handleRetryWithCode = async (code: string, instruction: string) => {
    const loadingId = addMessage({
      role: 'assistant',
      content: '',
      isLoading: true,
    })
    setIsLoading(true)

    try {
      const result = await executeCode(sessionId, code, instruction)
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
          <span className="chat-title">{sessionName}</span>
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
          <Trash2 size={13} strokeWidth={1.5} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          清空
        </button>
      </div>

      {/* 消息列表 */}
      <div className="messages-container">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            sessionId={sessionId}
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
          {isLoading ? (
            <button
              className="send-btn stop"
              onClick={handleStop}
              title="停止 Agent"
            >
              <StopCircle size={16} strokeWidth={1.5} />
            </button>
          ) : (
            <button
              className={`send-btn`}
              onClick={handleSend}
              disabled={!input.trim() || !config?.has_api_key}
            >
              <Send size={15} strokeWidth={1.5} />
            </button>
          )}
        </div>
        <div className="input-hint">
          工作区文件：{files.filter(f => !f.path.startsWith('output/')).map(f => f.name).join(', ') || '无'}
        </div>
      </div>
    </main>
  )
}
