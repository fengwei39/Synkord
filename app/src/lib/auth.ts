import { api, setToken, clearToken } from './api'

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  createdAt: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/register', payload)
  setToken(res.data.token)
  return res.data
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/login', payload)
  setToken(res.data.token)
  return res.data
}

export async function getMe(): Promise<AuthUser> {
  const res = await api.get<AuthUser>('/api/auth/me')
  return res.data
}

export function logout() {
  clearToken()
  window.location.hash = '#/login'
}
