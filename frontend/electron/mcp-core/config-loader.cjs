/**
 * mcp-core/config-loader.cjs
 *
 * 三级配置加载器：内存 > 文件 > 环境变量
 * 对应设计文档 §11 配置优先级（v1.2 重构：移除 Team，使用 ContractSet）
 *
 * 设计原则：
 *  - 内存（IPC 推送）最高优先级
 *  - 文件作为持久化层（active-contract.json / credentials.json）
 *  - 环境变量仅作降级方案
 *  - JWT 不支持环境变量覆盖（避免环境注入攻击）
 */
'use strict';

const {
  readJsonFile,
  activeContextPath,
  userAuthPath,
  serverConfigPath,
  DEFAULT_API_BASE,
} = require('./utils.cjs');
const fs = require('fs');

// ============================================================================
// ConfigLoader 类
// ============================================================================

class ConfigLoader {
  constructor() {
    // Level 1: 内存（IPC 推送）
    this._memoryContext = null;
    this._memoryAuth = null;

    // Level 2: 文件（最近一次从磁盘读取）
    this._fileContext = null;
    this._fileAuth = null;
  }

  // ==========================================================================
  // 写入接口（供 IPC 调用）
  // ==========================================================================

  /**
   * 设置内存激活契约集（由 IPC 推送）
   * @param {object|null} ctx { contract_id, contract_name, set_at, ... }
   */
  setMemoryContext(ctx) {
    this._memoryContext = ctx;
  }

  /**
   * 设置内存用户凭证（由 IPC 推送）
   * @param {object|null} auth { access_token, refresh_token, expires_at, user }
   */
  setMemoryAuth(auth) {
    this._memoryAuth = auth;
  }

  // ==========================================================================
  // 文件轮询（由 MCP Server 定时调用）
  // ==========================================================================

  /**
   * 从磁盘重新加载上下文和凭证
   * 不抛错：文件不存在/解析失败都返回 null
   *
   * @returns {Promise<{contextChanged: boolean, authChanged: boolean}>}
   */
  async reloadFromDisk() {
    const newContext = await readJsonFile(activeContextPath());
    const newAuth = await readJsonFile(userAuthPath());

    const contextChanged = !shallowEqual(this._fileContext, newContext);
    const authChanged = !shallowEqual(this._fileAuth, newAuth);

    this._fileContext = newContext;
    this._fileAuth = newAuth;

    return { contextChanged, authChanged };
  }

  // ==========================================================================
  // 解析最终值（按优先级）
  // ==========================================================================

  /**
   * 解析最终激活契约集
   * 优先级：内存 > 文件 > 环境变量
   * @returns {object|null} { contract_id, contract_name, synkord_core_url, updated_at, set_by }
   */
  resolveContext() {
    return (
      this._memoryContext ||
      this._fileContext ||
      this._envContext()
    );
  }

  /**
   * 解析最终用户凭证
   * 优先级：内存 > 文件（**不支持** 环境变量覆盖）
   * @returns {object|null} { access_token, refresh_token, expires_at, user }
   */
  resolveAuth() {
    return this._memoryAuth || this._fileAuth;
  }

  /**
   * 解析最终 API base URL
   * 优先级：内存 context.synkord_core_url > 文件 context > 环境变量 > 默认
   * @returns {string}
   */
  resolveApiBase() {
    const serverConfig = this._serverConfig();
    if (serverConfig?.apiBase) {
      return serverConfig.apiBase;
    }
    const ctx = this.resolveContext();
    if (ctx && ctx.synkord_core_url) {
      return ctx.synkord_core_url;
    }
    return process.env.SYNKORD_API_BASE || DEFAULT_API_BASE;
  }

  // ==========================================================================
  // 能力检查
  // ==========================================================================

  hasContext() {
    return !!this.resolveContext();
  }

  hasAuth() {
    return !!this.resolveAuth();
  }

  // ==========================================================================
  // 内部：环境变量降级
  // ==========================================================================

  _envContext() {
    const contractId = process.env.SYNKORD_CONTRACT_ID;
    if (!contractId) return null;
    return {
      contract_id: contractId,
      contract_name: process.env.SYNKORD_CONTRACT_NAME || '',
      synkord_core_url: process.env.SYNKORD_API_BASE || DEFAULT_API_BASE,
      updated_at: '1970-01-01T00:00:00Z', // 占位：环境变量无时间戳
      source: 'env',
    };
  }

  _serverConfig() {
    try {
      if (!fs.existsSync(serverConfigPath())) return null;
      return JSON.parse(fs.readFileSync(serverConfigPath(), 'utf-8'));
    } catch {
      return null;
    }
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 浅比较两个对象
 * 用于检测文件是否变更
 */
function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

module.exports = { ConfigLoader };
