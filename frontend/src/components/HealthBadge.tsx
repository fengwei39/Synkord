// Synkord HealthBadge
// 评审 R-7 / 1.1 / 3.1：替换原"活跃中 / MCP 已停止"双重颜色混淆，
// 用统一的健康度徽标（healthy / degraded / failed / unknown）。
//
// 修复依据：
// - 之前绿色既表示"活跃"又隐含健康，缺乏语义层级（报告 3.1）
// - 现在同时显示"健康度"与"运行态"，颜色分工：健康用冷色（蓝/绿/橙/红），运行态用 Tag

import { Tag, Tooltip } from 'antd'
import { ThunderboltOutlined, WarningOutlined } from '@ant-design/icons'
import type { McpHealthSummary } from '../types/contract'

export type HealthLevel = 'healthy' | 'degraded' | 'failed' | 'unknown'

const LEVEL_META: Record<
  HealthLevel,
  { color: string; text: string; description: string }
> = {
  healthy: {
    color: 'green',
    text: '健康',
    description: '近 5 分钟调用全部成功，错误率为 0',
  },
  degraded: {
    color: 'orange',
    text: '降级',
    description: '存在错误但仍可调用，请关注',
  },
  failed: {
    color: 'red',
    text: '异常',
    description: '连续失败，请检查下游契约或网络',
  },
  unknown: {
    color: 'default',
    text: '未知',
    description: '暂无调用数据，等待 IDE 连接后自动更新',
  },
}

/**
 * 依据健康摘要推导健康等级。
 * 评审 R-7：避免颜色同质化，用错误率 + 连续失败数两维度综合判定。
 */
export function deriveHealthLevel(h: McpHealthSummary | null | undefined): HealthLevel {
  if (!h) return 'unknown'
  if (h.consecutive_failures >= 3) return 'failed'
  if (h.error_rate_24h >= 0.3 || h.consecutive_failures >= 1) return 'degraded'
  if (h.calls_24h > 0) return 'healthy'
  return 'unknown'
}

interface HealthBadgeProps {
  health: McpHealthSummary | null | undefined
  compact?: boolean
}

export function HealthBadge({ health, compact = false }: HealthBadgeProps) {
  const level = deriveHealthLevel(health)
  const meta = LEVEL_META[level]
  const summary = health
    ? `24h 调用 ${health.calls_24h} 次 · 错误率 ${(health.error_rate_24h * 100).toFixed(1)}% · 连续失败 ${health.consecutive_failures}`
    : '尚未采集到健康数据'

  return (
    <Tooltip title={`${meta.description}。${summary}`}>
      <Tag
        color={meta.color}
        icon={
          level === 'failed' || level === 'degraded' ? (
            <WarningOutlined />
          ) : (
            <ThunderboltOutlined />
          )
        }
        style={{ borderRadius: 12, padding: '0 10px', margin: 0 }}
      >
        {compact ? meta.text : `健康度 · ${meta.text}`}
      </Tag>
    </Tooltip>
  )
}
