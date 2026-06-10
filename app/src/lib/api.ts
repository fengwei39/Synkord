import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('synkord_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, clear token and redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('synkord_token')
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  },
)

// ─── typed request helpers ────────────────────────────────────────────────────

export function setToken(token: string) {
  localStorage.setItem('synkord_token', token)
}

export function clearToken() {
  localStorage.removeItem('synkord_token')
}

export function getToken(): string | null {
  return localStorage.getItem('synkord_token')
}
