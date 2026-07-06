// Synkord useDocumentTitle
// 路由切换时更新浏览器 tab 标题

import { useEffect } from 'react'

const BASE = 'Synkord'

export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : BASE
    return () => {
      document.title = BASE
    }
  }, [title])
}