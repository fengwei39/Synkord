// Synkord Auth
// 认证管理 + User Context
// 详见 docs/architecture.md §三

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import apiClient, { setUnauthorizedHandler } from './client'
import { assertValidApiBase, getConfiguredApiBase } from './baseUrl'

interface User {
  id: string
  username: string
  role?: string
  email?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  bootstrapping: boolean
  login: (username: string, password: string, apiBase?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  bootstrapping: false,
  login: async () => {},
  logout: () => {},
})

async function resolveRequestApiBase(apiBase?: string): Promise<string> {
  const base = assertValidApiBase(apiBase || getConfiguredApiBase())
  if (base.startsWith('/') && window.synkord?.getAPIBase) {
    return assertValidApiBase(await window.synkord.getAPIBase())
  }
  return base
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('synkord_user')
    if (!stored) return null
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  })

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('synkord_token'),
  )

  const [bootstrapping, setBootstrapping] = useState<boolean>(!!localStorage.getItem('synkord_token'))

  const logout = useCallback(() => {
    localStorage.removeItem('synkord_token')
    localStorage.removeItem('synkord_user')
    // 清理活跃契约集与历史遗留 keys
    localStorage.removeItem('synkord_active_contract_id')
    localStorage.removeItem('synkord_current_team_id')
    localStorage.removeItem('synkord_current_project_id')
    setToken(null)
    setUser(null)
    // 通知主进程：MCP 重新启动时会自动重新读取凭证
    // 活跃契约集由后端 API 管理（setActiveContract），无需 IPC 通知
    setBootstrapping(false)
  }, [])

  // 注册 401 回调（client.ts 在 401 时会调用）
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout()
    })
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const login = useCallback(async (username: string, password: string, apiBase?: string) => {
    const loginBaseURL = await resolveRequestApiBase(apiBase)
    apiClient.defaults.baseURL = loginBaseURL
    let data: any
    try {
      if (window.synkord?.backendLogin) {
        data = await window.synkord.backendLogin(loginBaseURL, username, password)
      } else {
        const resp = await apiClient.post('/auth/login', { username, password }, { baseURL: loginBaseURL })
        data = resp.data
      }
    } catch (error: any) {
      error.message = `${error?.message || '登录失败'}（请求地址：${loginBaseURL}/auth/login）`
      throw error
    }
    const { access_token, ...userData } = data
    localStorage.setItem('synkord_token', access_token)
    localStorage.setItem('synkord_user', JSON.stringify(userData))
    setToken(access_token)
    setUser(userData)
  }, [])

  // 应用启动时校验 token（如果存在）
  useEffect(() => {
    let cancelled = false
    if (!token) {
      setBootstrapping(false)
      return
    }
    resolveRequestApiBase()
      .then((meBaseURL) => {
        apiClient.defaults.baseURL = meBaseURL
        return window.synkord?.backendMe
          ? window.synkord.backendMe(meBaseURL, token)
          : apiClient.get('/auth/me', { baseURL: meBaseURL }).then((resp) => resp.data)
      })
      .then((data) => {
        if (cancelled) return
        const userData = data as User | undefined
        if (userData?.id) {
          setUser(userData)
          localStorage.setItem('synkord_user', JSON.stringify(userData))
        }
        setBootstrapping(false)
      })
      .catch(() => {
        if (cancelled) return
        logout()
      })
    return () => {
      cancelled = true
    }
  }, [token, logout])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, bootstrapping }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
