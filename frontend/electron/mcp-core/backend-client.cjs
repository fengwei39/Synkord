/**
 * mcp-core/backend-client.cjs
 *
 * 后端 HTTP 客户端（阶段 2 加固版）
 * 对应设计文档：
 *  - §5.2 MCP Server → 后端 API（携带用户 JWT）
 *  - §5.3 审计日志
 *  - §10 安全：日志脱敏、4xx/5xx 错误映射
 *  - §12 性能：30s 超时、4MB body 限制
 */
'use strict';

const { bearerHeader, validateAuth } = require('./auth.cjs');
const { codeError, CODES, serializeError } = require('./errors.cjs');
const { redactSensitive } = require('./utils.cjs');

// ============================================================================
// 常量
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30000;       // 文档 §12
const DEFAULT_BODY_LIMIT = 4 * 1024 * 1024; // 4MB
const USER_AGENT = 'synkord-mcp/0.1.0';

// HTTP 状态码 → 业务错误码映射
const STATUS_TO_CODE = {
  400: CODES.INVALID_ARGS,
  401: CODES.UNAUTHORIZED,
  403: CODES.UNAUTHORIZED,
  404: CODES.NOT_FOUND,
  408: CODES.TIMEOUT,
  413: CODES.INVALID_ARGS, // body 过大
  429: CODES.UPSTREAM_FAILURE, // 限流
  500: CODES.INTERNAL,
  502: CODES.UPSTREAM_FAILURE,
  503: CODES.UPSTREAM_FAILURE,
  504: CODES.TIMEOUT,
};

// ============================================================================
// 核心：callBackend
// ============================================================================

/**
 * 调用后端 API
 *
 * 链路：
 *   1. 解析 loader（获取 auth + apiBase + context）
 *   2. 严格校验凭证 → 失败抛 UNAUTHORIZED
 *   3. 构造请求（自动注入 Authorization）
 *   4. fetch with AbortController（30s 超时）
 *   5. 解析响应 + 状态码映射
 *   6. 失败抛对应 codeError
 *
 * @param {object} options
 *   @prop {string} method
 *   @prop {string} path
 *   @prop {object|null} [body]
 *   @prop {object} loader            ConfigLoader 实例（必需）
 *   @prop {object|null} [auth]       覆盖 loader 的 auth（可选）
 *   @prop {number} [timeoutMs]
 *   @prop {boolean} [silent]        禁用请求日志
 *
 * @returns {Promise<object>} 响应体（已 JSON.parse）
 * @throws {object} codeError
 */
async function callBackend({ method, path, body, loader, auth, timeoutMs, silent }) {
  // 1. 参数校验
  if (!loader) {
    throw codeError(CODES.INTERNAL, 'config loader required');
  }
  if (!method || !path) {
    throw codeError(CODES.INVALID_ARGS, 'method and path required');
  }

  // 2. 凭证校验（严格模式）
  const resolvedAuth = auth || loader.resolveAuth();
  const authCheck = validateAuth(resolvedAuth);
  if (!authCheck.ok) {
    throw authCheck.error;
  }

  // 3. 解析 API base
  const apiBase = loader.resolveApiBase();
  if (!apiBase) {
    throw codeError(CODES.INTERNAL, 'api base not configured');
  }

  // 4. 构造请求
  const url = normalizeUrl(apiBase, path);
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': USER_AGENT,
    'Authorization': bearerHeader(resolvedAuth), // 已 validateAuth 必非空
  };

  // 5. body 大小检查
  let bodyStr = null;
  if (body !== undefined && body !== null) {
    bodyStr = JSON.stringify(body);
    if (bodyStr.length > DEFAULT_BODY_LIMIT) {
      throw codeError(CODES.INVALID_ARGS, `body too large: ${bodyStr.length} > ${DEFAULT_BODY_LIMIT}`);
    }
  }

  // 6. 超时控制
  const timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  // 7. 请求日志（脱敏）
  if (!silent) {
    logRequest(method, url, headers, body);
  }

  try {
    const resp = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: bodyStr || undefined,
      signal: controller.signal,
    });

    // 8. 解析响应
    const text = await resp.text();
    const data = parseJsonSafe(text);

    // 9. 响应日志（脱敏）
    if (!silent) {
      logResponse(method, url, resp.status, data);
    }

    // 10. 状态码映射
    if (!resp.ok) {
      throw mapStatusToError(resp.status, data, text);
    }

    return data;
  } catch (e) {
    // 超时（AbortError）
    if (e.name === 'AbortError' || timedOut) {
      throw codeError(CODES.TIMEOUT, `request timeout after ${timeout}ms`);
    }
    // 网络错误
    if (e instanceof TypeError && /fetch|network|ECONN|ENOTFOUND|ECONNREFUSED/i.test(e.message)) {
      throw codeError(CODES.UPSTREAM_FAILURE, e.message);
    }
    // 已是 codeError
    if (e && e.code && Object.values(CODES).includes(e.code)) {
      throw e;
    }
    // 其他
    throw codeError(CODES.INTERNAL, e.message || String(e));
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 工具方法
// ============================================================================

/**
 * 调用后端 /mcp/query（执行 MCP 工具）
 *
 * @param {object} options
 *   @prop {object} loader
 *   @prop {string} tool
 *   @prop {object} [args]
 *   @prop {object} [auth]  覆盖 auth
 *
 * @returns {Promise<{result: object}>}
 */
async function callTool({ loader, tool, args, auth }) {
  if (!tool) throw codeError(CODES.INVALID_ARGS, 'tool name required');

  const ctx = loader.resolveContext();
  if (!ctx || !ctx.team_id || !ctx.project_id) {
    throw codeError(CODES.NOT_FOUND, 'no active project context');
  }

  return callBackend({
    method: 'POST',
    path: '/mcp/query',
    loader,
    auth,
    body: {
      team_id: ctx.team_id,
      project_id: ctx.project_id,
      tool,
      args: args || {},
    },
  });
}

/**
 * 写审计日志到后端
 * 失败不抛错（不影响主流程）
 *
 * @param {object} options
 *   @prop {object} loader
 *   @prop {string} toolName
 *   @prop {string} caller
 *   @prop {string} paramsSummary
 *   @prop {string} resultStatus
 *   @prop {string} [errorMessage]
 *   @prop {object} [auth]
 *
 * @returns {Promise<object|null>}
 */
async function writeAudit({ loader, toolName, caller, paramsSummary, resultStatus, errorMessage, auth }) {
  const ctx = loader.resolveContext();
  if (!ctx || !ctx.team_id || !ctx.project_id) {
    return null; // 无上下文不写
  }
  try {
    return await callBackend({
      method: 'POST',
      path: '/mcp/audit',
      loader,
      auth,
      body: {
        team_id: ctx.team_id,
        project_id: ctx.project_id,
        tool_name: toolName,
        caller: caller || 'local-mcp',
        params_summary: paramsSummary || '{}',
        result_status: resultStatus || 'success',
        error_message: errorMessage || '',
      },
      silent: true, // 审计不写请求日志
      timeoutMs: 5000, // 5s 足够
    });
  } catch (e) {
    return null;
  }
}

// ============================================================================
// 内部辅助
// ============================================================================

function normalizeUrl(apiBase, path) {
  const base = apiBase.replace(/\/+$/, '');
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const p = path.startsWith('/') ? path : '/' + path;
  return base + p;
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mapStatusToError(status, data, text) {
  const code = STATUS_TO_CODE[status] || CODES.UPSTREAM_FAILURE;
  const detail = (data && data.detail) || `HTTP ${status}`;
  return codeError(code, typeof detail === 'string' ? detail : JSON.stringify(detail));
}

function logRequest(method, url, headers, body) {
  if (typeof process === 'undefined' || !process.stderr) return;
  const safeHeaders = redactSensitive(headers);
  const safeBody = body ? redactSensitive(body) : undefined;
  process.stderr.write(
    `[backend-client] → ${method} ${url} headers=${JSON.stringify(safeHeaders)}` +
    (safeBody ? ` body=${JSON.stringify(safeBody)}` : '') + '\n'
  );
}

function logResponse(method, url, status, data) {
  if (typeof process === 'undefined' || !process.stderr) return;
  const safeData = data ? redactSensitive(data) : null;
  process.stderr.write(
    `[backend-client] ← ${method} ${url} status=${status} data=${JSON.stringify(safeData)}\n`
  );
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  callBackend,
  callTool,
  writeAudit,
  // 常量
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BODY_LIMIT,
  STATUS_TO_CODE,
  USER_AGENT,
};
