import axios from 'axios'

// 生产模式（Electron 打包后加载 file:// 页面）时直接请求后端地址
// 开发模式时使用 Vite 代理的 /api 路径
const isElectronProd = typeof window !== 'undefined' &&
  window.location.protocol === 'file:'

const BASE = isElectronProd ? 'http://127.0.0.1:8000/api' : '/api'

export const api = axios.create({
  baseURL: BASE,
  timeout: 180000, // 3分钟，AI生成+执行可能较慢
})

// ---- 类型定义 ----
export interface WorkspaceFile {
  name: string
  path: string
  size: number
  ext: string
}

export interface WorkspaceInfo {
  files: WorkspaceFile[]
  workspace_dir: string
  session_id: string
}

export interface ExecuteResult {
  code: string
  stdout: string
  stderr: string
  success: boolean
  output_files: string[]
}

export interface SheetData {
  columns: string[]
  rows: string[][]
  total_hint: string
}

export interface PreviewResult {
  type: 'excel' | 'csv' | 'docx' | 'error' | 'unsupported'
  sheets?: Record<string, SheetData>
  text?: string
  message?: string
}

export interface Config {
  has_api_key: boolean
  model: string
  base_url: string
}

export interface SessionMeta {
  id: string
  name: string
  created_at: string
  updated_at: string
}

// ---- Agent 事件类型定义 ----
export type AgentEventType =
  | 'start'
  | 'thinking'
  | 'thought'
  | 'action'
  | 'observation'
  | 'finish'
  | 'error'

export interface AgentStartEvent {
  type: 'start'
  message: string
  iteration: number
  max_iterations: number
}

export interface AgentThinkingEvent {
  type: 'thinking'
  message: string
  iteration: number
}

export interface AgentThoughtEvent {
  type: 'thought'
  content: string
  iteration: number
}

export interface AgentActionEvent {
  type: 'action'
  description: string
  code: string
  iteration: number
}

export interface AgentObservationEvent {
  type: 'observation'
  stdout: string
  stderr: string
  success: boolean
  new_files: string[]
  iteration: number
}

export interface AgentFinishEvent {
  type: 'finish'
  summary: string
  output_files: string[]
  iteration: number
  max_reached?: boolean
}

export interface AgentErrorEvent {
  type: 'error'
  message: string
  raw?: string
  traceback?: string
  iteration?: number
}

export type AgentEvent =
  | AgentStartEvent
  | AgentThinkingEvent
  | AgentThoughtEvent
  | AgentActionEvent
  | AgentObservationEvent
  | AgentFinishEvent
  | AgentErrorEvent

// ---- 会话管理 API ----

export async function getSessions(): Promise<{ sessions: SessionMeta[] }> {
  const res = await api.get('/sessions')
  return res.data
}

export async function createSession(name?: string): Promise<SessionMeta> {
  const res = await api.post('/sessions', { name })
  return res.data
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  await api.patch(`/sessions/${sessionId}`, { name })
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/sessions/${sessionId}`)
}

// ---- 工作区 API（按会话隔离）----

export async function getWorkspace(sessionId: string): Promise<WorkspaceInfo> {
  const res = await api.get(`/workspace/${sessionId}`)
  return res.data
}

export async function uploadFile(
  sessionId: string,
  file: File,
  relativePath?: string
): Promise<{ success: boolean; filename: string; path: string; preview: string }> {
  const form = new FormData()
  form.append('file', file)
  if (relativePath) {
    form.append('relative_path', relativePath)
  }
  const res = await api.post(`/upload/${sessionId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data
}

export async function deleteFile(sessionId: string, path: string): Promise<void> {
  await api.delete(`/workspace/${sessionId}/${path}`)
}

export async function previewFile(
  sessionId: string,
  path: string,
  maxRows = 20
): Promise<PreviewResult> {
  const res = await api.get(`/preview/${sessionId}/${path}`, { params: { max_rows: maxRows } })
  return res.data
}

export async function executeInstruction(
  sessionId: string,
  instruction: string,
  history?: Array<{ role: string; content: string }>,
  context?: Record<string, unknown>
): Promise<ExecuteResult> {
  const res = await api.post('/execute', { session_id: sessionId, instruction, history, context })
  return res.data
}

export async function executeCode(
  sessionId: string,
  code: string,
  instruction: string
): Promise<ExecuteResult> {
  const res = await api.post('/execute', { session_id: sessionId, instruction, code })
  return res.data
}

export async function generateCode(
  sessionId: string,
  instruction: string,
  history?: Array<{ role: string; content: string }>
): Promise<{ code: string }> {
  const res = await api.post('/generate-code', { session_id: sessionId, instruction, history })
  return res.data
}

/**
 * 启动 Agent 循环，通过 SSE 流式接收事件
 * @param sessionId 会话ID
 * @param instruction 用户指令
 * @param history 对话历史
 * @param onEvent 每收到一个事件时的回调
 * @param signal AbortSignal，用于取消请求
 */
export async function runAgent(
  sessionId: string,
  instruction: string,
  history: Array<{ role: string; content: string }>,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = `${BASE}/agent/run`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      instruction,
      history,
    }),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    let detail = errText
    try {
      const errJson = JSON.parse(errText)
      detail = errJson.detail || errText
    } catch { /* ignore */ }
    throw new Error(`Agent 请求失败 (${response.status}): ${detail}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')

  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 按 SSE 格式解析：每个事件以 \n\n 分隔
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      if (!part.trim()) continue

      let eventType = ''
      let dataStr = ''

      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice(6).trim()
        }
      }

      if (eventType && dataStr) {
        try {
          const parsed = JSON.parse(dataStr)
          onEvent({ type: eventType as AgentEventType, ...parsed } as AgentEvent)
        } catch (e) {
          console.warn('[SSE] JSON 解析失败:', dataStr, e)
        }
      }
    }
  }
}

export async function getConfig(): Promise<Config> {
  const res = await api.get('/config')
  return res.data
}

export async function setConfig(cfg: { api_key?: string; model?: string; base_url?: string }): Promise<void> {
  await api.post('/config', cfg)
}

export function downloadFile(sessionId: string, path: string): void {
  const url = `${BASE}/download/${sessionId}/${path}`
  const a = document.createElement('a')
  a.href = url
  a.download = path.split('/').pop() || path
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    '.xlsx': '📊',
    '.xls': '📊',
    '.csv': '📋',
    '.docx': '📝',
    '.doc': '📝',
    '.pdf': '📄',
    '.txt': '📃',
    '.json': '🔧',
    '.py': '🐍',
  }
  return icons[ext] || '📁'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
