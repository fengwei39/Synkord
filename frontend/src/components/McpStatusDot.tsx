// Synkord McpStatusDot
// 4 色状态指示点 + Tooltip
// 详见 docs/ui-spec.md §二.3

import { useMemo } from 'react'
import { Tooltip } from 'antd'
import type { McpStatus, McpState } from '../types/contract'

interface McpStatusDotProps {
  status: McpStatus | null
  size?: 'small' | 'default'
  showLabel?: boolean
}

type DotState = 'active' | 'idle' | 'error' | 'starting' | 'unknown'

const STATE_CONFIG: Record<DotState, { color: string; label: string }> = {
  active: { color: '#52c41a', label: '运行中' },
  idle: { color: '#faad14', label: '空闲' },
  error: { color: '#ff4d4f', label: '异常' },
  starting: { color: '#d9d9d9', label: '启动中' },
  unknown: { color: '#d9d9d9', label: '未启动' },
}

export function deriveDotState(status: McpStatus | null): DotState {
  if (!status) return 'unknown'
  const s: McpState = status.state
  if (s === 'starting' || s === 'restarting') return 'starting'
  if (s === 'failed') return 'error'
  if (s === 'stopped' || s === 'idle') return 'unknown'
  // running
  if (status.last_connection) {
    const minutesSinceConnection =
      (Date.now() - new Date(status.last_connection.at).getTime()) / 60000
    if (minutesSinceConnection < 1) return 'active'
    if (minutesSinceConnection < 5) return 'idle'
  }
  return 'idle'
}

export function McpStatusDot({
  status,
  size = 'small',
  showLabel = false,
}: McpStatusDotProps) {
  const dotState = useMemo(() => deriveDotState(status), [status])
  const config = STATE_CONFIG[dotState]
  const pixelSize = size === 'small' ? 8 : 12

  return (
    <Tooltip title={config.label}>
      <span
        className={`mcp-status-dot mcp-status-${dotState}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: pixelSize,
            height: pixelSize,
            borderRadius: '50%',
            backgroundColor: config.color,
          }}
        />
        {showLabel && <span style={{ fontSize: 12, color: config.color }}>{config.label}</span>}
      </span>
    </Tooltip>
  )
}

// 状态文字映射（用于 MCP 页面 / 状态卡）
export const MCP_STATE_LABEL: Record<McpState, string> = {
  stopped: 'MCP 已停止',
  starting: 'MCP 启动中',
  running: 'MCP 运行中',
  failed: 'MCP 启动失败',
  restarting: 'MCP 重启中',
  idle: 'MCP 未启动',
}