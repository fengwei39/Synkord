// Synkord DangerConfirm
// 评审 R-1：为停止、重启这类危险操作加二次确认 Modal，
// 明确告知将中断的 IDE 数量与影响面。
//
// 修复依据：
// - 原 Stop / Restart 按钮与 Start 同级同色，缺少二次确认，存在误操作风险（报告 4.1）
// - 这里把"影响面"显式呈现给用户

import { Alert, Checkbox, Modal } from 'antd'
import { useEffect, useState } from 'react'

interface DangerConfirmProps {
  /** 是否打开 */
  open: boolean
  /** 操作标题 */
  title: string
  /** 操作描述 */
  description: React.ReactNode
  /** 确认按钮文字，默认"确认停止" */
  okText?: string
  /** 取消按钮文字 */
  cancelText?: string
  /** 需要勾选才能确认的提示，强制用户看清影响 */
  acknowledge?: string
  /** 受影响的连接数（来自 status.last_connection 等） */
  impactCount?: number
  /** 关闭回调 */
  onCancel: () => void
  /** 确认回调（异步） */
  onOk: () => Promise<void> | void
}

export function DangerConfirm({
  open,
  title,
  description,
  okText = '我已知晓风险，确认继续',
  cancelText = '取消',
  acknowledge,
  impactCount,
  onCancel,
  onOk,
}: DangerConfirmProps) {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)

  // 每次重新打开都重置勾选状态
  useEffect(() => {
    if (open) setChecked(false)
  }, [open])

  const handleOk = async () => {
    setLoading(true)
    try {
      await onOk()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{
        danger: true,
        disabled: acknowledge ? !checked : false,
        loading,
      }}
      onOk={handleOk}
      onCancel={onCancel}
      width={460}
      destroyOnHidden
    >
      {typeof impactCount === 'number' && impactCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`当前有 ${impactCount} 个 IDE 处于连接状态，操作将立即中断它们`}
        />
      )}
      <div style={{ marginBottom: 12 }}>{description}</div>
      {acknowledge && (
        <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)}>
          {acknowledge}
        </Checkbox>
      )}
    </Modal>
  )
}
