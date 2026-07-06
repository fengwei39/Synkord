/**
 * electron/auth-manager.cjs
 *
 * JWT 凭证管理（v1.2 重构版）
 * 对应设计文档：
 *  - docs/architecture.md §三、§四
 *  - §3 自动 refresh：Token 过期前 1 分钟主动刷新
 *  - §4 Gateway 是 JWT 唯一出口：插件永不见真实 JWT
 *  - §5 本地凭证存储：0600 权限
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SYNKORD_HOME = process.env.SYNKORD_HOME || path.join(os.homedir(), '.synkord');
const CREDENTIALS_FILE = path.join(SYNKORD_HOME, 'credentials.json');
const ACTIVE_CONTRACT_FILE = path.join(SYNKORD_HOME, 'active-contract.json');

const REFRESH_LEAD_MS = 60_000; // 过期前 1 分钟刷新

class AuthManager {
  constructor({ backendUrl, onUnauthorized } = {}) {
    this.backendUrl = backendUrl || 'http://127.0.0.1:8000'
    this.onUnauthorized = onUnauthorized || (() => {})
    this.accessToken = null
    this.refreshToken = null
    this.expiresAt = 0
    this.user = null
    this.refreshTimer = null
    this._refreshing = null
  }

  /**
   * 初始化：加载本地凭证（如有）
   */
  async init() {
    try {
      if (!fs.existsSync(CREDENTIALS_FILE)) return
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'))
      this.accessToken = data.access_token || null
      this.refreshToken = data.refresh_token || null
      this.expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
      this.user = data.user || null
      this._scheduleRefresh()
    } catch (err) {
      // 凭证损坏，清空
      await this.logout({ silent: true })
    }
  }

  /**
   * 登录
   */
  async login(username, password) {
    const resp = await this._request('POST', '/api/auth/login', { username, password }, false)
    this._applyAuth(resp)
    return this.user
  }

  /**
   * 刷新 access token
   */
  async refresh() {
    if (this._refreshing) return this._refreshing
    if (!this.refreshToken) throw new Error('no refresh token')

    this._refreshing = (async () => {
      try {
        const resp = await this._request(
          'POST',
          '/api/auth/refresh',
          { refresh_token: this.refreshToken },
          false,
        )
        this._applyAuth(resp)
        this._save()
        this._scheduleRefresh()
      } finally {
        this._refreshing = null
      }
    })()
    return this._refreshing
  }

  /**
   * 登出
   */
  async logout({ silent = false } = {}) {
    this._clearRefreshTimer()
    this.accessToken = null
    this.refreshToken = null
    this.expiresAt = 0
    this.user = null
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) fs.unlinkSync(CREDENTIALS_FILE)
    } catch {}
    if (!silent) this.onUnauthorized()
  }

  /**
   * 拿到当前有效的 access token（必要时自动 refresh）
   */
  async getValidToken() {
    if (!this.accessToken) throw new Error('not authenticated')
    if (this.expiresAt - Date.now() < REFRESH_LEAD_MS) {
      // 即将过期，主动 refresh
      if (this.refreshToken) {
        try {
          await this.refresh()
        } catch (err) {
          // refresh 失败，token 已过期
          this.onUnauthorized()
          throw err
        }
      }
    }
    return this.accessToken
  }

  isAuthenticated() {
    return !!this.accessToken
  }

  getUser() {
    return this.user
  }

  // --------------------------------------------------------------------------
  // 私有方法
  // --------------------------------------------------------------------------

  _applyAuth(resp) {
    this.accessToken = resp.access_token || resp.token
    this.refreshToken = resp.refresh_token || this.refreshToken
    const expiresIn = resp.expires_in || 8 * 3600
    this.expiresAt = Date.now() + expiresIn * 1000
    // user 字段兼容后端两种返回格式
    if (resp.user) {
      this.user = resp.user
    } else if (resp.id) {
      // 登录响应可能直接返回 user 字段
      this.user = { id: resp.id, username: resp.username, role: resp.role }
    }
    this._save()
    this._scheduleRefresh()
  }

  _save() {
    try {
      fs.mkdirSync(SYNKORD_HOME, { recursive: true })
      const data = {
        access_token: this.accessToken,
        refresh_token: this.refreshToken,
        expires_at: new Date(this.expiresAt).toISOString(),
        user: this.user,
      }
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
    } catch (err) {
      console.error('[auth-manager] save failed:', err.message)
    }
  }

  _scheduleRefresh() {
    this._clearRefreshTimer()
    if (!this.refreshToken) return
    const delay = Math.max(this.expiresAt - Date.now() - REFRESH_LEAD_MS, 5000)
    this.refreshTimer = setTimeout(() => {
      this.refresh().catch((err) => {
        console.warn('[auth-manager] scheduled refresh failed:', err.message)
      })
    }, delay)
  }

  _clearRefreshTimer() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  async _request(method, path, body, withAuth = true) {
    const url = `${this.backendUrl}${path}`
    const headers = { 'Content-Type': 'application/json' }
    if (withAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }
    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      let data = null
      try { data = JSON.parse(text) } catch {}
      const err = new Error(data?.detail || text || `HTTP ${resp.status}`)
      err.status = resp.status
      err.data = data
      throw err
    }
    return resp.json()
  }
}

// ============================================================================
// 活跃契约集管理
// ============================================================================

class ActiveContractStore {
  constructor() {
    this.contractId = null
    this.contractName = null
    this._load()
  }

  _load() {
    try {
      if (!fs.existsSync(ACTIVE_CONTRACT_FILE)) return
      const data = JSON.parse(fs.readFileSync(ACTIVE_CONTRACT_FILE, 'utf-8'))
      this.contractId = data.contract_id || null
      this.contractName = data.contract_name || null
    } catch (err) {
      console.warn('[active-contract] load failed:', err.message)
    }
  }

  _save() {
    try {
      fs.mkdirSync(SYNKORD_HOME, { recursive: true })
      const data = {
        contract_id: this.contractId,
        contract_name: this.contractName,
        set_at: new Date().toISOString(),
      }
      fs.writeFileSync(ACTIVE_CONTRACT_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
    } catch (err) {
      console.error('[active-contract] save failed:', err.message)
    }
  }

  set(contractId, contractName) {
    this.contractId = contractId
    this.contractName = contractName
    this._save()
  }

  clear() {
    this.contractId = null
    this.contractName = null
    try {
      if (fs.existsSync(ACTIVE_CONTRACT_FILE)) fs.unlinkSync(ACTIVE_CONTRACT_FILE)
    } catch {}
  }

  get() {
    return { contract_id: this.contractId, contract_name: this.contractName }
  }
}

module.exports = { AuthManager, ActiveContractStore, SYNKORD_HOME }