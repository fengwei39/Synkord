// Synkord useUnsavedGuard
// 脏检查守卫 hook
// 详见 docs/ui-spec.md §十.2

import { useCallback, useEffect } from 'react'
import { Modal } from 'antd'
import { useNavigate } from 'react-router-dom'

interface UseUnsavedGuardReturn {
  guardedNavigate: (path: string) => void
}

/**
 * 监听 isDirty 状态：
 * - 浏览器关闭/刷新：弹出原生确认
 * - SPA 内部跳转：弹出 antd Modal 确认
 */
export function useUnsavedGuard(isDirty: boolean): UseUnsavedGuardReturn {
  const navigate = useNavigate()
  const [modal, contextHolder] = Modal.useModal()

  // 浏览器关闭/刷新
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const guardedNavigate = useCallback(
    (path: string) => {
      if (!isDirty) {
        navigate(path)
        return
      }
      modal.confirm({
        title: '有未保存的修改',
        content: '离开后修改将丢失，确定继续？',
        okText: '离开',
        cancelText: '留在本页',
        onOk: () => navigate(path),
      })
    },
    [isDirty, modal, navigate],
  )

  // 注意：contextHolder 必须由调用方渲染（这里不返回 JSX，调用方拿到 navigate 即可）
  // 为简化，调用方使用 navigate 时直接调 guardedNavigate
  return { guardedNavigate }
}

/**
 * 直接拿到 contextHolder（在不能使用 hook 的地方）
 */
export function useUnsavedGuardContextHolder() {
  const [, contextHolder] = Modal.useModal()
  return contextHolder
}