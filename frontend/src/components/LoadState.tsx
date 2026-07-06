// Synkord LoadState
// 通用加载/错误/空状态组件
// 详见 docs/ui-spec.md §十.1

import type { ReactNode } from 'react'
import { Alert, Button, Empty, Skeleton } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ApiError } from '../types/contract'

interface LoadStateProps<T> {
  loading: boolean
  error?: ApiError | null
  data?: T | null
  /** 自定义空状态判定 */
  isEmpty?: (data: T) => boolean
  /** 自定义错误展示 */
  errorComponent?: (err: ApiError, retry: () => void) => ReactNode
  /** 自定义空状态展示 */
  emptyComponent?: ReactNode
  /** 数据渲染函数 */
  children: (data: T) => ReactNode
}

export function LoadState<T>({
  loading,
  error,
  data,
  isEmpty,
  errorComponent,
  emptyComponent,
  children,
}: LoadStateProps<T>) {
  // Loading 状态（首次加载，无缓存数据）
  if (loading && !data) {
    return <Skeleton active />
  }

  // Error 状态
  if (error) {
    if (errorComponent) {
      return <>{errorComponent(error, () => window.location.reload())}</>
    }
    return (
      <Alert
        type="error"
        showIcon
        message={error.message}
        description={error.hint}
        action={
          error.recoverable && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => window.location.reload()}
            >
              重试
            </Button>
          )
        }
      />
    )
  }

  // Empty 状态
  if (!data || (isEmpty && isEmpty(data))) {
    return <>{emptyComponent ?? <Empty />}</>
  }

  // 正常渲染
  return <>{children(data)}</>
}