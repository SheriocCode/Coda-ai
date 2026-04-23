import { useState } from 'react'
import { toast } from 'sonner'
import {
  X, KeyRound, Github, CheckCircle, AlertTriangle,
} from 'lucide-react'
import type { Config } from '../api'
import { setConfig } from '../api'

interface Props {
  config: Config | null
  onClose: () => void
  onSaved: () => void
}

type NavItem = {
  id: string
  icon: React.ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'api',
    icon: <KeyRound size={15} strokeWidth={1.5} />,
    label: 'API 配置',
  },
  {
    id: 'about',
    icon: <Github size={15} strokeWidth={1.5} />,
    label: '关于 / 反馈',
  },
]

export function SettingsModal({ config, onClose, onSaved }: Props) {
  const [activeNav, setActiveNav] = useState('api')

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        {/* 左侧导航 */}
        <aside className="settings-nav">
          <div className="settings-nav-header">
            <span>设置</span>
          </div>
          <nav className="settings-nav-list">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`settings-nav-item ${activeNav === item.id ? 'active' : ''}`}
                onClick={() => setActiveNav(item.id)}
              >
                <span className="settings-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* 右侧内容 */}
        <div className="settings-content">
          {/* 顶部标题栏 */}
          <div className="settings-content-header">
            <h2 className="settings-content-title">
              {NAV_ITEMS.find(n => n.id === activeNav)?.label}
            </h2>
            <button className="settings-close-btn" onClick={onClose}>
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* 内容区 */}
          <div className="settings-content-body">
            {activeNav === 'api' && (
              <ApiPanel config={config} onSaved={onSaved} onClose={onClose} />
            )}
            {activeNav === 'about' && (
              <AboutPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── API 配置面板 ── */
function ApiPanel({
  config,
  onSaved,
  onClose,
}: {
  config: Config | null
  onSaved: () => void
  onClose: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(config?.model || 'doubao-seed-2-0-pro-260215')
  const [baseUrl, setBaseUrl] = useState(config?.base_url || 'https://ark.cn-beijing.volces.com/api/v3')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await setConfig({
        api_key: apiKey || undefined,
        model,
        base_url: baseUrl,
      })
      setSaved(true)
      onSaved()
      toast.success('设置已保存')
      setTimeout(() => {
        setSaved(false)
        onClose()
      }, 1000)
    } catch (e) {
      console.error('保存失败', e)
      toast.error('保存失败，请检查配置后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-panel">
      {/* 状态卡片 */}
      <div className={`settings-status-card ${config?.has_api_key ? 'ok' : 'warn'}`}>
        <div className="settings-status-icon">
          {config?.has_api_key
            ? <CheckCircle size={18} strokeWidth={1.5} />
            : <AlertTriangle size={18} strokeWidth={1.5} />
          }
        </div>
        <div className="settings-status-text">
          <div className="settings-status-title">
            {config?.has_api_key ? 'API Key 已配置' : '未配置 API Key'}
          </div>
          <div className="settings-status-desc">
            {config?.has_api_key
              ? `当前模型：${config.model}`
              : '请填写下方 API Key 以启用 AI 功能'
            }
          </div>
        </div>
      </div>

      {/* 表单 */}
      <div className="settings-section">
        <div className="settings-section-title">API Key</div>
        <div className="form-group">
          <input
            type="password"
            className="form-input"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={config?.has_api_key ? '已配置（留空保持不变）' : '请输入 API Key'}
          />
          <div className="form-hint">
            豆包 API Key，从
            <a href="https://console.volcengine.com/ark" target="_blank" rel="noreferrer">
              火山引擎控制台
            </a>
            获取
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">模型</div>
        <div className="form-group">
          <input
            type="text"
            className="form-input"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="deepseek-v3-2-251201"
          />
          <div className="form-hint">推荐使用 deepseek-v3-2-251201</div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">API Base URL</div>
        <div className="form-group">
          <input
            type="text"
            className="form-input"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://ark.cn-beijing.volces.com/api/v3"
          />
        </div>
      </div>

      <div className="settings-panel-footer">
        <button className="btn-secondary" onClick={onClose}>取消</button>
        <button
          className={`btn-primary ${saved ? 'saved' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saved ? '✅ 已保存' : saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

/* ── 关于面板 ── */
function AboutPanel() {
  return (
    <div className="settings-panel">
      {/* 项目信息卡片 */}
      <div className="about-hero">
        <div className="about-logo">
          <img src="/icon.png" alt="Coda" />
        </div>
        <div className="about-info">
          <div className="about-name">Coda</div>
          <div className="about-desc">Coda - AI文档自动化助手</div>
          <div className="about-version">v1.0.0</div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">开源仓库</div>
        <a
          className="about-repo-card"
          href="https://github.com/SheriocCode/Coda-ai"
          target="_blank"
          rel="noreferrer"
        >
          <div className="about-repo-icon">
            <Github size={20} strokeWidth={1.5} />
          </div>
          <div className="about-repo-info">
            <div className="about-repo-name">SheriocCode / Coda-ai</div>
            <div className="about-repo-url">github.com/SheriocCode/Coda-ai</div>
          </div>
          <div className="about-repo-arrow">&gt;</div>
        </a>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">问题反馈</div>
        <p className="about-text">
          如果你遇到 Bug 或有功能建议，欢迎在 GitHub 提交 Issue，或直接提交 Pull Request 参与贡献。
        </p>
        <a
          className="about-link-btn"
          href="https://github.com/SheriocCode/Coda-ai/issues"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={14} strokeWidth={1.5} />
          提交 Issue
        </a>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">技术栈</div>
        <div className="about-tech-list">
          {['React + TypeScript', 'Vite', 'FastAPI', 'Python', 'Lucide Icons'].map(t => (
            <span key={t} className="about-tech-tag">{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
