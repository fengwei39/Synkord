// Synkord WindowControlBar
// 顶栏上的窗口控制按钮（最小化 / 最大化 / 关闭）
// 用于 frame: false 模式下替代系统顶栏
//   - 整个条带可拖拽（drag）
//   - 按钮区域不可拖拽（no-drag）
import { Button, Tooltip } from 'antd'
import type { SizeType } from 'antd/es/config-provider/SizeContext'
import { BorderOutlined, CloseOutlined, MinusOutlined } from '@ant-design/icons'

export type WindowAction = 'minimize' | 'maximize' | 'close'

interface Props {
  /** 显示哪些按钮；默认 [minimize, maximize, close] */
  actions?: WindowAction[]
  /** 整体高度（px） */
  height?: number
  /** 紧凑模式：缩小按钮尺寸 */
  size?: SizeType
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
  height = 36,
  size = 'middle',
}: Props) {
  const isSmall = size === 'small'
  const btnStyle: React.CSSProperties = {
    width: isSmall ? 28 : 38,
    height: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'inherit',
    ...noDragStyle,
  }

  return (
    <div
      className="window-control-bar"
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 8px',
        gap: 4,
        ...dragStyle,
      }}
    >
      {actions.includes('minimize') && (
        <Tooltip title="最小化">
          <Button
            type="text"
            size={size}
            onClick={() => callWindow('minimize')}
            style={btnStyle}
            icon={<MinusOutlined />}
          />
        </Tooltip>
      )}
      {actions.includes('maximize') && (
        <Tooltip title="最大化 / 还原">
          <Button
            type="text"
            size={size}
            onClick={() => callWindow('maximize')}
            style={btnStyle}
            icon={<BorderOutlined />}
          />
        </Tooltip>
      )}
      {actions.includes('close') && (
        <Tooltip title="退出客户端">
          <Button
            type="text"
            size={size}
            onClick={() => callWindow('close')}
            style={{ ...btnStyle, color: '#ff4d4f' }}
            icon={<CloseOutlined />}
          />
        </Tooltip>
      )}
    </div>
  )
}