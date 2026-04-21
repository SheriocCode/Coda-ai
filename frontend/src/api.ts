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

// ---- API 函数 ----

export async function getWorkspace(): Promise<WorkspaceInfo> {
  const res = await api.get('/workspace')
  return res.data
}

export async function uploadFile(file: File): Promise<{ success: boolean; filename: string; path: string; preview: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data
}

export async function deleteFile(path: string): Promise<void> {
  await api.delete(`/workspace/${path}`)
}

export async function previewFile(path: string, maxRows = 20): Promise<PreviewResult> {
  const res = await api.get(`/preview/${path}`, { params: { max_rows: maxRows } })
  return res.data
}

export async function executeInstruction(
  instruction: string,
  history?: Array<{ role: string; content: string }>,
  context?: Record<string, unknown>
): Promise<ExecuteResult> {
  const res = await api.post('/execute', { instruction, history, context })
  return res.data
}

export async function executeCode(code: string, instruction: string): Promise<ExecuteResult> {
  const res = await api.post('/execute', { instruction, code })
  return res.data
}

export async function generateCode(
  instruction: string,
  history?: Array<{ role: string; content: string }>
): Promise<{ code: string }> {
  const res = await api.post('/generate-code', { instruction, history })
  return res.data
}

export async function getConfig(): Promise<Config> {
  const res = await api.get('/config')
  return res.data
}

export async function setConfig(cfg: { api_key?: string; model?: string; base_url?: string }): Promise<void> {
  await api.post('/config', cfg)
}

export async function downloadFile(path: string): Promise<void> {
  const url = `${BASE}/download/${path}`
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
