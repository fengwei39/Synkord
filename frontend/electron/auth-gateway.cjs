/**
 * electron/auth-gateway.cjs
 *
 * 认证网关：本地 HTTP 代理（仅监听 127.0.0.1）
 * 对应设计文档：
 *  - docs/architecture.md §四（Auth Gateway）
 *  - §1 Auth Gateway 是 JWT 的唯一出口
 *  - §2 插件 / MCP 子进程永不见真实 JWT
 *  - §3 仅 127.0.0.1 监听，端口随机
 *  - §4 注入 X-Mcp-Instance 用于审计
 *  - §5 拒绝任何外部网络请求
 */
'use strict';

const http = require('http');

class AuthGateway {
  /**
   * @param {Object} opts
   * @param {Object} opts.authManager   AuthManager 实例
   * @param {string} opts.backendUrl    后端地址
   * @param {string} opts.instanceId    MCP 实例 ID
   */
  constructor({ authManager, backendUrl, instanceId }) {
    this.authManager = authManager
    this.backendUrl = backendUrl
    this.instanceId = instanceId
    this.backend = new URL(backendUrl)
    this.server = null
    this.port = null
    this.allowedInstances = new Set() // 注册的 MCP 实例
  }

  /**
   * 启动 Gateway
   * 监听 127.0.0.1:0（OS 分配随机端口）
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handle(req, res))
      this.server.on('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port
        console.log(`[auth-gateway] listening on 127.0.0.1:${this.port}`)
        resolve(this.port)
      })
    })
  }

  /**
   * 停止 Gateway
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => {
        this.server = null
        this.port = null
        resolve()
      })
    })
  }

  /**
   * 注册 MCP 实例（由 Connect 子进程启动时调用）
   */
  registerInstance(instanceId) {
    this.allowedInstances.add(instanceId)
  }

  /**
   * 注销 MCP 实例
   */
  unregisterInstance(instanceId) {
    this.allowedInstances.delete(instanceId)
  }

  // --------------------------------------------------------------------------
  // 请求处理
  // --------------------------------------------------------------------------

  async _handle(req, res) {
    const url = req.url || ''

    // CORS：仅允许本机
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Mcp-Instance, Authorization')
    res.setHeader('Access-Control-Allow-Credentials', 'true')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // 健康检查
    if (url === '/health' || url === '/gw/health') {
      this._json(res, 200, { ok: true, port: this.port })
      return
    }

    // 实例注册（由 Connect 进程启动时调用）
    if (url === '/gw/register' && req.method === 'POST') {
      const body = await this._readBody(req)
      try {
        const data = JSON.parse(body || '{}')
        if (data.instance_id) {
          this.registerInstance(data.instance_id)
          this._json(res, 200, { ok: true, gateway_port: this.port })
        } else {
          this._json(res, 400, { error: 'instance_id required' })
        }
      } catch (err) {
        this._json(res, 400, { error: 'invalid json' })
      }
      return
    }

    // 转发到后端（/gw/api/* → /api/*）
    if (url.startsWith('/gw/api/') || url.startsWith('/api/')) {
      return this._proxyToBackend(req, res, url)
    }

    this._json(res, 404, { error: 'not found' })
  }

  async _proxyToBackend(req, res, url) {
    // 权限校验：仅允许已注册的实例
    const instanceId = req.headers['x-mcp-instance']
    if (instanceId && !this.allowedInstances.has(instanceId)) {
      this._json(res, 401, { error: 'UNKNOWN_INSTANCE' })
      return
    }

    // 取有效 token
    let token
    try {
      token = await this.authManager.getValidToken()
    } catch (err) {
      this._json(res, 401, { error: 'AUTH_EXPIRED' })
      return
    }

    // 转发路径：去掉 /gw 前缀
    const path = url.replace(/^\/gw/, '')

    // 准备代理请求
    const headers = { ...req.headers }
    headers['authorization'] = `Bearer ${token}`
    headers['x-mcp-instance'] = this.instanceId
    headers['x-forwarded-for'] = '127.0.0.1'
    delete headers['host']
    delete headers['connection']

    const options = {
      hostname: this.backend.hostname,
      port: this.backend.port || (this.backend.protocol === 'https:' ? 443 : 80),
      path,
      method: req.method,
      headers,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      console.error('[auth-gateway] proxy error:', err.message)
      if (!res.headersSent) {
        this._json(res, 502, { error: 'BACKEND_UNAVAILABLE', message: err.message })
      }
    })

    req.pipe(proxyReq)
  }

  // --------------------------------------------------------------------------
  // 工具方法
  // --------------------------------------------------------------------------

  _json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  _readBody(req) {
    return new Promise((resolve) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString()))
      req.on('error', () => resolve(''))
    })
  }
}

module.exports = { AuthGateway }