import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="confirm-icon-wrap">
          <AlertTriangle size={20} strokeWidth={1.5} />
        </div>
        <div className="confirm-body">
          <div className="confirm-title">{title}</div>
          {description && (
            <div className="confirm-desc">{description}</div>
          )}
        </div>
        <div className="confirm-actions">
          <button className="confirm-btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`confirm-btn-ok${danger ? ' danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
