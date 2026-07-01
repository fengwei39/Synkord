/**
 * mcp-core/tool-registry.cjs
 *
 * 工具注册表 + 路由分发
 * 对应设计文档：
 *  - §6 工具集
 *  - §7 错误返回格式
 *  - §5.3 审计日志
 *  - §9.1 不在 UI 暴露 Token 明文
 */
'use strict';

const { codeError, CODES, serializeError } = require('./errors.cjs');
const { callTool, writeAudit } = require('./backend-client.cjs');
const { validateAuth } = require('./auth.cjs');
const { summarizeArgs } = require('./utils.cjs');

// ============================================================================
// ToolRegistry 类
// ============================================================================

class ToolRegistry {
  constructor() {
    /**
     * 工具表：Map<name, {definition, handler, options}>
     *   - definition: MCP 工具定义（name/description/inputSchema）
     *   - handler:    async (args, context) => result
     *   - options:    { requiresContext, requiresAuth, caller }
     */
    this._tools = new Map();
  }

  /**
   * 注册工具
   *
   * @param {object} def       工具定义（含 name, description, inputSchema）
   * @param {function} handler async (args, context) => {content, isError?}
   * @param {object} [options]
   *   @prop {string[]} [requiredScopes]  权限标签（默认 ['project_member']）
   *   @prop {string}   [caller]         审计 caller 字段（默认 'local-mcp'）
   */
  register(def, handler, options = {}) {
    if (!def || !def.name) {
      throw new Error('tool definition must have a name');
    }
    if (typeof handler !== 'function') {
      throw new Error(`tool ${def.name}: handler must be a function`);
    }
    if (this._tools.has(def.name)) {
      throw new Error(`tool ${def.name} already registered`);
    }
    this._tools.set(def.name, {
      definition: def,
      handler,
      options: {
        requiredScopes: options.requiredScopes || ['project_member'],
        caller: options.caller || 'local-mcp',
      },
    });
  }

  /**
   * 列出所有工具（MCP tools/list 响应）
   */
  list() {
    return Array.from(this._tools.values()).map(t => t.definition);
  }

  /**
   * 获取工具定义
   */
  get(name) {
    return this._tools.get(name);
  }

  /**
   * 工具数量
   */
  size() {
    return this._tools.size;
  }

  // ==========================================================================
  // 核心：dispatch
  // ==========================================================================

  /**
   * 统一调用入口
   *
   * 严格链路（文档 §6）：
   *   1. 凭证校验（validateAuth）
   *   2. 上下文校验（active project）
   *   3. 工具存在性校验
   *   4. 参数 schema 校验
   *   5. handler 执行
   *   6. 写审计日志
   *   7. 返回 MCP 标准 result
   *
   * @param {object} options
   *   @prop {string} tool
   *   @prop {object} args
   *   @prop {object} loader    ConfigLoader
   * @returns {Promise<{content: Array, isError?: boolean}>}
   */
  async dispatch({ tool, args, loader }) {
    // 1. 工具查找
    const entry = this._tools.get(tool);
    if (!entry) {
      return this._errorResult(codeError(CODES.TOOL_NOT_ALLOWED, `tool ${tool} not registered`));
    }

    // 2. 凭证校验
    const auth = loader.resolveAuth();
    const authCheck = validateAuth(auth);
    if (!authCheck.ok) {
      // 写审计：未授权
      await this._writeAuditSafe(loader, tool, args, entry, 'error', authCheck.error.message);
      return this._errorResult(authCheck.error);
    }

    // 3. 上下文校验
    const ctx = loader.resolveContext();
    if (!ctx || !ctx.team_id || !ctx.project_id) {
      const err = codeError(CODES.NOT_FOUND, 'no active project context');
      await this._writeAuditSafe(loader, tool, args, entry, 'error', err.message);
      return this._errorResult(err);
    }

    // 4. 权限校验（标签级别）
    // 当前所有工具统一要求 project_member，由后端在 /mcp/query 路由强校验
    // 这里只做标签记录，不做硬拦截（避免重复）
    // 实际权限拦截在后端

    // 5. 参数 schema 校验
    const paramError = this._validateArgs(tool, entry, args || {});
    if (paramError) {
      await this._writeAuditSafe(loader, tool, args, entry, 'error', paramError.message);
      return this._errorResult(paramError);
    }

    // 6. 执行 handler
    const startTs = Date.now();
    let result;
    let resultStatus = 'success';
    let errorMessage = '';

    try {
      result = await entry.handler(args || {}, {
        loader,
        auth,
        context: ctx,
        callBackend: (opts) => this._callBackendWithAuth(loader, auth, opts),
      });
    } catch (e) {
      // handler 抛错：转 codeError
      resultStatus = 'error';
      if (e && e.code && Object.values(CODES).includes(e.code)) {
        errorMessage = e.message;
        result = { error: e };
      } else {
        const ce = codeError(CODES.INTERNAL, e.message || String(e));
        errorMessage = ce.message;
        result = { error: ce };
      }
    }

    // 7. 写审计（成功或失败都写）
    await this._writeAuditSafe(loader, tool, args, entry, resultStatus, errorMessage);

    // 8. 返回 MCP 标准 result
    if (result && result.isError) {
      return { content: result.content || [], isError: true };
    }
    if (result && result.error) {
      return this._errorResult(result.error);
    }
    if (result && result.content) {
      return { content: result.content };
    }
    // 兜底：序列化整个结果
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  // ==========================================================================
  // 内部辅助
  // ==========================================================================

  /**
   * 参数 schema 校验
   * 简化实现：检查必填字段 + 类型
   * 复杂校验由 handler 自己负责
   */
  _validateArgs(tool, entry, args) {
    const schema = entry.definition.inputSchema || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties = schema.properties || {};

    // 必填字段
    for (const key of required) {
      if (args[key] === undefined || args[key] === null || args[key] === '') {
        return codeError(CODES.INVALID_ARGS, `missing required argument: ${key}`);
      }
    }

    // 类型校验（基础）
    for (const [key, value] of Object.entries(args)) {
      const prop = properties[key];
      if (!prop) continue;
      const expected = prop.type;
      if (!expected) continue;

      const actual = typeOf(value);
      if (!typeMatches(actual, expected)) {
        return codeError(
          CODES.INVALID_ARGS,
          `argument ${key} expected ${expected}, got ${actual}`
        );
      }
    }

    return null;
  }

  /**
   * 安全写审计（失败不抛）
   */
  async _writeAuditSafe(loader, tool, args, entry, resultStatus, errorMessage) {
    try {
      await writeAudit({
        loader,
        toolName: tool,
        caller: entry.options.caller,
        paramsSummary: summarizeArgs(args || {}),
        resultStatus,
        errorMessage,
      });
    } catch {
      // ignore
    }
  }

  /**
   * 带认证的 backend 调用
   */
  async _callBackendWithAuth(loader, auth, opts) {
    return callTool({
      loader,
      auth,
      tool: opts.tool,
      args: opts.args,
    });
  }

  /**
   * 错误结果封装
   */
  _errorResult(errorObj) {
    const safe = errorObj && errorObj.code
      ? errorObj
      : codeError(CODES.INTERNAL, String(errorObj));
    return {
      content: [{ type: 'text', text: serializeError(safe) }],
      isError: true,
    };
  }
}

// ============================================================================
// 工具函数
// ============================================================================

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function typeMatches(actual, expected) {
  // JSON Schema 类型支持
  const t = String(expected).toLowerCase();
  if (t === 'number' && (actual === 'integer' || actual === 'number')) return true;
  return actual === t;
}

/**
 * 全局单例（可选使用）
 */
const globalRegistry = new ToolRegistry();

/**
 * 便捷方法：注册到全局
 */
function registerTool(def, handler, options) {
  return globalRegistry.register(def, handler, options);
}

module.exports = {
  ToolRegistry,
  globalRegistry,
  registerTool,
};
