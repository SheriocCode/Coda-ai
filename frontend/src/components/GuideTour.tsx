import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'

export interface TourStep {
  target: string        // CSS 选择器，指向要高亮的元素
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

interface Props {
  steps: TourStep[]
  onFinish: () => void
  onSkip: () => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 8  // 高亮框与元素的间距

export function GuideTour({ steps, onFinish, onSkip }: Props) {
  const [current, setCurrent] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [bubbleStyle, setBubbleStyle] = useState<React.CSSProperties>({})
  const bubbleRef = useRef<HTMLDivElement>(null)

  const step = steps[current]
  const isLast = current === steps.length - 1
  const isFirst = current === 0

  // 计算目标元素位置
  const updatePosition = useCallback(() => {
    if (!step) return

    if (step.placement === 'center' || !step.target) {
      setTargetRect(null)
      setBubbleStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 420,
        width: '90vw',
      })
      return
    }

    const el = document.querySelector(step.target)
    if (!el) {
      setTargetRect(null)
      setBubbleStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 420,
        width: '90vw',
      })
      return
    }

    const rect = el.getBoundingClientRect()
    setTargetRect({
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    })

    // 计算气泡位置
    const placement = step.placement || 'bottom'
    const bubbleW = 320
    // 估算气泡实际高度（内容较多时会更高，保守估算 220px）
    const bubbleH = 220
    const MARGIN = 16  // 距视口边缘最小间距
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = 0
    let left = 0

    switch (placement) {
      case 'right': {
        top = rect.top + rect.height / 2 - bubbleH / 2
        left = rect.right + PADDING + 12
        // 如果右侧放不下，改为左侧
        if (left + bubbleW + MARGIN > vw) {
          left = rect.left - bubbleW - PADDING - 12
        }
        break
      }
      case 'left': {
        top = rect.top + rect.height / 2 - bubbleH / 2
        left = rect.left - bubbleW - PADDING - 12
        // 如果左侧放不下，改为右侧
        if (left < MARGIN) {
          left = rect.right + PADDING + 12
        }
        break
      }
      case 'top': {
        top = rect.top - PADDING - 12 - bubbleH
        left = rect.left + rect.width / 2 - bubbleW / 2
        // 如果上方放不下，改为下方
        if (top < MARGIN) {
          top = rect.bottom + PADDING + 12
        }
        break
      }
      case 'bottom':
      default: {
        top = rect.bottom + PADDING + 12
        left = rect.left + rect.width / 2 - bubbleW / 2
        // 如果下方放不下，改为上方
        if (top + bubbleH + MARGIN > vh) {
          top = rect.top - PADDING - 12 - bubbleH
        }
        break
      }
    }

    // 最终视口边界夹紧（确保气泡始终完整显示在屏幕内）
    top = Math.max(MARGIN, Math.min(vh - bubbleH - MARGIN, top))
    left = Math.max(MARGIN, Math.min(vw - bubbleW - MARGIN, left))

    setBubbleStyle({ position: 'fixed', width: bubbleW, top, left })
  }, [step])

  useEffect(() => {
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [updatePosition])

  const handleNext = () => {
    if (isLast) {
      onFinish()
    } else {
      setCurrent(c => c + 1)
    }
  }

  const handlePrev = () => {
    if (!isFirst) setCurrent(c => c - 1)
  }

  // 点击遮罩层（非高亮区域）不关闭，防止误操作
  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <div className="tour-overlay" onClick={handleOverlayClick}>
      {/* SVG 遮罩：挖空高亮区域 */}
      <svg
        className="tour-mask"
        width="100%"
        height="100%"
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
      >
        <defs>
          <mask id="tour-hole">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-hole)"
        />
      </svg>

      {/* 高亮边框 */}
      {targetRect && (
        <div
          className="tour-highlight"
          style={{
            position: 'fixed',
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 气泡卡片 */}
      <div
        ref={bubbleRef}
        className="tour-bubble"
        style={bubbleStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* 步骤指示器 */}
        <div className="tour-bubble-header">
          <div className="tour-step-dots">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`tour-dot ${i === current ? 'active' : i < current ? 'done' : ''}`}
              />
            ))}
          </div>
          <button className="tour-skip-btn" onClick={onSkip} title="跳过引导">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* 内容 */}
        <div className="tour-bubble-body">
          <div className="tour-step-icon">
            <Sparkles size={16} strokeWidth={1.5} />
          </div>
          <div className="tour-step-num">步骤 {current + 1} / {steps.length}</div>
          <h3 className="tour-title">{step.title}</h3>
          <p className="tour-content">{step.content}</p>
        </div>

        {/* 导航按钮 */}
        <div className="tour-bubble-footer">
          <button
            className="tour-btn-secondary"
            onClick={handlePrev}
            disabled={isFirst}
          >
            <ChevronLeft size={14} strokeWidth={2} />
            上一步
          </button>
          <button
            className="tour-btn-primary"
            onClick={handleNext}
          >
            {isLast ? '完成ヾ(≧▽≦*)o！' : '下一步'}
            {!isLast && <ChevronRight size={14} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// 默认引导步骤
export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    target: '.session-sidebar',
    title: '会话管理',
    content: '这里是你的会话列表。每个会话拥有独立的工作区和对话历史，互不干扰。点击「新建会话」开始一个新任务。',
    placement: 'right',
  },
  {
    target: '.session-new-btn',
    title: '新建会话',
    content: '点击此按钮创建新会话。创建后点击铅笔图标重命名会话，方便区分不同任务。',
    placement: 'right',
  },
  {
    target: '.sidebar',
    title: '工作区文件',
    content: '这里是当前会话的工作区。你可以点击或拖拽上传 Excel、Word、CSV 等文件，AI 将在此工作区中读取和处理文件。',
    placement: 'right',
  },
  {
    target: '.chat-panel',
    title: 'AI 对话区',
    content: '在这里用自然语言描述你想做的操作，例如「把 Excel 按学号排序后导出」。AI 会自动生成 Python 代码并执行，结果文件会出现在工作区。',
    placement: 'left',
  },
  {
    target: '.input-area',
    title: '指令输入框',
    content: '在此输入你的需求，按 Enter 发送。支持 Shift+Enter 换行。AI 执行失败时会自动重试修复。',
    placement: 'top',
  },
  {
    target: '.sidebar-user-center',
    title: '用户中心',
    content: '在这里可以配置 API Key、查看帮助文档，以及重新触发本引导。配置好 API Key 后即可开始使用 AI 功能。',
    placement: 'top',
  },
]
