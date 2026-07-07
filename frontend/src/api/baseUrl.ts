import apiClient from './client'

export const API_BASE_STORAGE_KEY = 'synkord_api_base'
export const API_BASE_RAW_STORAGE_KEY = 'synkord_api_base_raw'

export type ServerProtocol = 'http' | 'https'

export function splitServerAddress(raw: string): { protocol: ServerProtocol; address: string } {
  const value = (raw || '').trim()
  const match = value.match(/^(https?):\/\/(.*)$/i)
  if (!match) {
    return { protocol: 'https', address: value }
  }
  return {
    protocol: match[1].toLowerCase() === 'http' ? 'http' : 'https',
    address: match[2].replace(/\/+$/, ''),
  }
}

export function composeServerAddress(protocol: ServerProtocol, address: string): string {
  const cleanAddress = (address || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!cleanAddress) return ''
  return `${protocol}://${cleanAddress}`
}

export function ensureApiSuffix(url: string): string {
  const trimmed = (url || '').trim().replace(/\/+$/, '')
  if (!trimmed) return '/api'
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

export function normalizeApiBase(raw: string): string {
  const value = (raw || '').trim()
  if (!value) return '/api'
  if (value.startsWith('/')) return ensureApiSuffix(value)
  return ensureApiSuffix(value)
}

export function assertValidApiBase(raw: string): string {
  return normalizeApiBase(raw)
}

export function getConfiguredApiBase(): string {
  const raw = getConfiguredApiBaseRaw()
  if (!raw) return '/api'
  return localStorage.getItem(API_BASE_STORAGE_KEY) || normalizeApiBase(raw)
}

export function getConfiguredApiBaseRaw(): string {
  return localStorage.getItem(API_BASE_RAW_STORAGE_KEY) || ''
}

export async function configureApiBase(raw: string): Promise<string> {
  const normalized = assertValidApiBase(raw)
  const result = await window.synkord?.setAPIBase?.(normalized)
  if (window.synkord && (!result?.ok || result.apiBase !== normalized)) {
    throw new Error('服务器地址保存到桌面端失败，请重试')
  }
  localStorage.setItem(API_BASE_STORAGE_KEY, normalized)
  localStorage.setItem(API_BASE_RAW_STORAGE_KEY, raw.trim())
  apiClient.defaults.baseURL = normalized
  window.dispatchEvent(new CustomEvent('synkord:api-base-changed', { detail: normalized }))
  return normalized
}

export async function resetApiBase(): Promise<string> {
  const result = await window.synkord?.clearAPIBase?.()
  if (window.synkord && !result?.ok) {
    throw new Error('恢复默认连接失败，请重试')
  }
  localStorage.removeItem(API_BASE_STORAGE_KEY)
  localStorage.removeItem(API_BASE_RAW_STORAGE_KEY)
  apiClient.defaults.baseURL = '/api'
  window.dispatchEvent(new CustomEvent('synkord:api-base-changed', { detail: '/api' }))
  return '/api'
}
