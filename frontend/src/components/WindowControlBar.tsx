// Synkord WindowControlBar
// 顶栏上的窗口控制按钮（最小化 / 最大化 / 关闭）
// 风格参照豆包桌面端：等宽矩形、悬停灰底、关闭按钮悬停整块变红
// 用于 frame: false 模式下替代系统顶栏
//   - 整个条带可拖拽（drag）
//   - 按钮区域不可拖拽（no-drag）

import { BorderOutlined, CloseOutlined, MinusOutlined } from '@ant-design/icons'

export type WindowAction = 'minimize' | 'maximize' | 'close'

interface Props {
  /** 显示哪些按钮；默认 [minimize, maximize, close] */
  actions?: WindowAction[]
  /** 整体高度（px） */
  height?: number | string
}

function callWindow(action: WindowAction) {
  if (!window.synkord) return
  switch (action) {
    case 'minimize':
      window.synkord.windowMinimize()
      break
    case 'maximize':
      window.synkord.windowMaximize()
      break
    case 'close':
      window.synkord.windowClose()
      break
  }
}

// React CSS 不识别 -webkit-app-region（Electron 私有属性）
// 用 as 断言注入，运行时 Electron 会识别
const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export default function WindowControlBar({
  actions = ['minimize', 'maximize', 'close'],
  height = '100%',
}: Props) {
  return (
    <div
      className="window-controls"
      style={{
        height,
        ...dragStyle,
      }}
    >
      {actions.includes('minimize') && (
        <button
          type="button"
          className="window-button"
          aria-label="最小化"
          title="最小化"
          style={noDragStyle}
          onClick={() => callWindow('minimize')}
        >
          <MinusOutlined />
        </button>
      )}
      {actions.includes('maximize') && (
        <button
          type="button"
          className="window-button"
          aria-label="最大化"
          title="最大化"
          style={noDragStyle}
          onClick={() => callWindow('maximize')}
        >
          <BorderOutlined />
        </button>
      )}
      {actions.includes('close') && (
        <button
          type="button"
          className="window-button close"
          aria-label="关闭"
          title="关闭"
          style={noDragStyle}
          onClick={() => callWindow('close')}
        >
          <CloseOutlined />
        </button>
      )}
    </div>
  )
}
