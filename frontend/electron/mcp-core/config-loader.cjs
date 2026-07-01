/**
 * mcp-core/config-loader.cjs
 *
 * 三级配置加载器：内存 > 文件 > 环境变量
 * 对应设计文档 §11 配置优先级
 *
 * 设计原则：
 *  - 内存（IPC 推送）最高优先级
 *  - 文件作为持久化层（active-context.json / user-auth.json）
 *  - 环境变量仅作降级方案
 *  - JWT 不支持环境变量覆盖（避免环境注入攻击）
 */
'use strict';

const {
  readJsonFile,
  activeContextPath,
  userAuthPath,
  DEFAULT_API_BASE,
} = require('./utils.cjs');

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
   * 设置内存激活项目（由 IPC 推送）
   * @param {object|null} ctx
   */
  setMemoryContext(ctx) {
    this._memoryContext = ctx;
  }

  /**
   * 设置内存用户凭证（由 IPC 推送）
   * @param {object|null} auth
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
   * 解析最终激活项目
   * 优先级：内存 > 文件 > 环境变量
   * @returns {object|null} { team_id, project_id, project_name, synkord_core_url, updated_at }
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
   * @returns {object|null} { token, user_id, user_name, updated_at }
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
    const teamId = process.env.SYNKORD_TEAM_ID;
    const projectId = process.env.SYNKORD_PROJECT_ID;
    if (!teamId || !projectId) return null;
    return {
      team_id: teamId,
      project_id: projectId,
      project_name: process.env.SYNKORD_PROJECT_NAME || '',
      synkord_core_url: process.env.SYNKORD_API_BASE || DEFAULT_API_BASE,
      updated_at: '1970-01-01T00:00:00Z', // 占位：环境变量无时间戳
      source: 'env',
    };
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
