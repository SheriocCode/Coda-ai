import { useState } from 'react'
import { toast } from 'sonner'
import { Settings, X, CheckCircle, AlertTriangle } from 'lucide-react'
import type { Config } from '../api'
import { setConfig } from '../api'

interface Props {
  config: Config | null
  onClose: () => void
  onSaved: () => void
}

export function SettingsModal({ config, onClose, onSaved }: Props) {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Settings size={15} strokeWidth={1.5} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            设置
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>API Key</label>
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

          <div className="form-group">
            <label>模型</label>
            <input
              type="text"
              className="form-input"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="doubao-seed-2-0-pro-260215"
            />
            <div className="form-hint">推荐使用 doubao-seed-2-0-pro-260215</div>
          </div>

          <div className="form-group">
            <label>API Base URL</label>
            <input
              type="text"
              className="form-input"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://ark.cn-beijing.volces.com/api/v3"
            />
          </div>

          <div className="form-group">
            <label>当前状态</label>
            <div className={`status-badge ${config?.has_api_key ? 'ok' : 'warn'}`}>
              {config?.has_api_key
                ? <><CheckCircle size={12} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />API Key 已配置</>
                : <><AlertTriangle size={12} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />未配置 API Key</>
              }
            </div>
          </div>
        </div>

        <div className="modal-footer">
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
    </div>
  )
}
