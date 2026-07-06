// Synkord CopyButton
// 复制按钮：点击复制 + 短暂显示「已复制 ✓」反馈

import { useState, useRef, useCallback } from 'react'
import { Button, Tooltip, type ButtonProps } from 'antd'
import { CheckOutlined, CopyOutlined } from '@ant-design/icons'

interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'icon'> {
  /** 要复制的文本 */
  text: string
  /** 自定义提示文字 */
  successText?: string
  /** 自定义按钮文字 */
  label?: string
  /** 是否显示为图标按钮 */
  iconOnly?: boolean
  /** 评审 🟡：复制成功后的回调，便于上层显示 toast */
  onCopied?: () => void
}

export function CopyButton({
  text,
  successText = '已复制',
  label = '复制',
  iconOnly = false,
  onCopied,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      // 评审 🟡：让外层拿到成功事件，便于统一 toast
      onCopied?.()
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // 静默失败（权限缺失等）
    }
  }, [text, onCopied])

  const buttonText = copied ? successText : label
  const icon = copied ? <CheckOutlined /> : <CopyOutlined />

  return (
    <Tooltip title={copied ? successText : label}>
      <Button
        icon={icon}
        onClick={handleCopy}
        disabled={!text}
        {...rest}
      >
        {!iconOnly && buttonText}
      </Button>
    </Tooltip>
  )
}