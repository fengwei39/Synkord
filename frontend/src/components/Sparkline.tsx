// Synkord Sparkline
// 评审 R-3：将"最近调用"扩展为 24h 时序 sparkline + 错误率徽标 +
// TopN 工具榜。让"调用频率"可在首屏一眼可辨。
//
// 实现要点：
// - 纯 SVG 自绘，避免引入 chart 库
// - 错误率用第二层叠加线（红线）表示，对应评审"调用图扩展"

import { Tooltip } from 'antd'

interface SparklineProps {
  /** 24 个小时的调用次数（按小时桶） */
  data: number[]
  /** 宽度像素，默认 100% */
  width?: number | number
  /** 高度像素 */
  height?: number
  /** 错误率 0~1，可选叠加红线 */
  errorRate?: number
}

export function Sparkline({ data, width: widthProp, height = 36, errorRate }: SparklineProps) {
  const series = data && data.length > 0 ? data : Array(24).fill(0)
  const max = Math.max(1, ...series)
  const svgW = 200 // SVG 视口宽度，内部靠 viewBox 自适应
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1 || 1)) * svgW
      const y = height - (v / max) * (height - 6) - 3
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  const area = `0,${height} ${points} ${svgW},${height}`
  const hasError = typeof errorRate === 'number' && errorRate > 0
  const errorY = hasError ? height - errorRate * (height - 6) - 3 : 0
  const sum = series.reduce((s, v) => s + v, 0)
  const peak = max

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12 }}>
          <div>24h 调用：{sum} 次</div>
          <div>峰值：{peak} 次/小时</div>
          {hasError && <div>错误率：{(errorRate! * 100).toFixed(1)}%</div>}
        </div>
      }
    >
      <svg
        viewBox={`0 0 ${svgW} ${height}`}
        preserveAspectRatio="none"
        style={{
          width: typeof widthProp === 'number' ? `${widthProp}px` : '100%',
          height: `${height}px`,
          display: 'block',
        }}
      >
        {/* 浅色面积 */}
        <polyline points={area} fill="rgba(22, 119, 255, 0.12)" stroke="none" />
        {/* 主线 */}
        <polyline points={points} fill="none" stroke="#1677ff" strokeWidth={1.6} />
        {/* 错误率叠加红线 */}
        {hasError && (
          <>
            <line
              x1={0}
              x2={svgW}
              y1={errorY}
              y2={errorY}
              stroke="#ff4d4f"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <text x={svgW - 2} y={errorY - 2} textAnchor="end" fontSize={9} fill="#ff4d4f">
              {(errorRate! * 100).toFixed(0)}%
            </text>
          </>
        )}
      </svg>
    </Tooltip>
  )
}
