// Synkord Axios Client
// 标准化错误处理：所有错误统一抛 ApiError
// 详见 docs/architecture.md §六、docs/mcp-spec.md §四

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from '../types/contract'

const apiClient = axios.create({
  baseURL: localStorage.getItem('synkord_api_base') || '/api',
  timeout: 30000,
})

// Dynamic base URL from Electron (if available)
// v1.2 修复：Electron 返回的 baseURL 必须以 '/api' 结尾，否则请求会缺前缀导致 404
//   - 校验：若 IPC 返回的 baseURL 不带 '/api' 后缀，自动补上
//   - 优先级：localStorage 中已有的值仍优先（用户手动改过），但若不带 /api 也纠正
function ensureApiSuffix(url: string): string {
  return url.replace(/\/+$/, '') + (url.endsWith('/api') ? '' : '/api')
}
if (window.synkord?.getAPIBase) {
  window.synkord.getAPIBase().then((baseURL) => {
    if (!baseURL) return
    const normalized = ensureApiSuffix(baseURL)
    const stored = localStorage.getItem('synkord_api_base')
    if (!stored || stored !== normalized) {
      apiClient.defaults.baseURL = normalized
      // 同步回写，便于下次启动 / 浏览器 DevTools 调试
      localStorage.setItem('synkord_api_base', normalized)
    }
  })
}

// Token injection
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('synkord_token')
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

let _onUnauthorized: (() => void) | null = null

/**
 * 注册 401 回调（由 AuthProvider 调用）
 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  _onUnauthorized = handler
}

/**
 * 把任意 axios 错误转换为标准 ApiError
 */
function toApiError(error: AxiosError): ApiError {
  // 网络错误（无 response）
  if (!error.response) {
    return {
      code: 'NETWORK_ERROR',
      message: '无法连接到 Synkord 后端',
      hint: '请检查网络连接或后端服务是否启动',
      httpStatus: 0,
      recoverable: true,
    }
  }

  const status = error.response.status
  const data = error.response.data as Record<string, unknown> | undefined
  const backendCode = (data?.code as string) ?? 'UNKNOWN_ERROR'
  const backendMessage = (data?.message as string) ?? '请求失败'
  const backendHint = data?.hint as string | undefined
  const backendDetails = data?.details as Record<string, unknown> | undefined

  // 401 - 授权过期
  if (status === 401) {
    return {
      code: 'AUTH_EXPIRED',
      message: '登录已过期',
      hint: '请重新登录',
      httpStatus: 401,
      recoverable: false,
    }
  }

  // 403 - 权限不足
  if (status === 403) {
    return {
      code: 'PERMISSION_DENIED',
      message: backendMessage || '没有访问权限',
      hint: backendHint || '检查你是否在此资源所属的契约集中',
      httpStatus: 403,
      recoverable: false,
    }
  }

  // 404 - 资源不存在
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      message: backendMessage || '资源不存在',
      hint: backendHint || '检查 URL 是否正确',
      httpStatus: 404,
      recoverable: true,
    }
  }

  // 409 - 冲突
  if (status === 409) {
    return {
      code: 'CONFLICT',
      message: backendMessage || '操作冲突',
      hint: backendHint,
      details: backendDetails,
      httpStatus: 409,
      recoverable: true,
    }
  }

  // 429 - 限流
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      message: backendMessage || '请求过于频繁',
      hint: backendHint || '请稍后重试',
      httpStatus: 429,
      recoverable: true,
    }
  }

  // 5xx - 服务器错误
  if (status >= 500) {
    return {
      code: 'SERVER_ERROR',
      message: backendMessage || '服务器错误',
      hint: backendHint || '请稍后重试或联系管理员',
      httpStatus: status,
      recoverable: true,
    }
  }

  // 其他 4xx
  return {
    code: backendCode,
    message: backendMessage,
    hint: backendHint,
    details: backendDetails,
    httpStatus: status,
    recoverable: true,
  }
}

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const apiError = toApiError(error)

    // 401 特殊处理：清凭证 + 通知
    if (apiError.code === 'AUTH_EXPIRED') {
      const currentPath = window.location.pathname + window.location.search
      localStorage.removeItem('synkord_token')
      localStorage.removeItem('synkord_user')
      localStorage.removeItem('synkord_active_contract_id')
      // 清理历史遗留 keys
      localStorage.removeItem('synkord_current_team_id')
      localStorage.removeItem('synkord_current_project_id')

      // 通知 AuthProvider
      _onUnauthorized?.()

      // 跳登录页（活跃契约集由后端 API 管理，无需 IPC 通知）
      if (window.location.pathname !== '/login') {
        const redirect =
          currentPath && currentPath !== '/login' && currentPath !== '/'
            ? `?redirect=${encodeURIComponent(currentPath)}`
            : ''
        window.location.href = `/login${redirect}`
      }
    }

    // 抛出标准化的 ApiError
    return Promise.reject(apiError)
  },
)

export default apiClient
export type { ApiError }