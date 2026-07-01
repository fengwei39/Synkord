/**
 * mcp-core/errors.cjs
 *
 * 统一错误码与错误结构
 * 对应设计文档 §7 错误返回格式
 *
 * 错误分层：
 *  - 协议层（JSON-RPC 2.0）：-32xxx 标准码
 *  - 业务层（MCP 工具）：INVALID_ARGS / NOT_FOUND 等字符串码
 */
'use strict';

// ============================================================================
// 业务错误码（文档 §7.2）
// ============================================================================

const CODES = Object.freeze({
  INVALID_ARGS: 'INVALID_ARGS',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOOL_NOT_ALLOWED: 'TOOL_NOT_ALLOWED',
  UPSTREAM_FAILURE: 'UPSTREAM_FAILURE',
  TIMEOUT: 'TIMEOUT',
});

// 错误码元信息（带 user-readable message + action）
const ERROR_DEFS = Object.freeze({
  [CODES.INVALID_ARGS]: {
    message: '参数错误',
    action: '检查参数格式',
  },
  [CODES.NOT_FOUND]: {
    message: '资源不存在',
    action: '确认项目 ID 正确',
  },
  [CODES.INTERNAL]: {
    message: '内部错误',
    action: '查看 mcp-server 日志',
  },
  [CODES.UNAUTHORIZED]: {
    message: '未授权',
    action: '在 Synkord 主窗口登录',
  },
  [CODES.TOOL_NOT_ALLOWED]: {
    message: '工具不允许',
    action: '联系管理员',
  },
  [CODES.UPSTREAM_FAILURE]: {
    message: '上游失败',
    action: '稍后重试',
  },
  [CODES.TIMEOUT]: {
    message: '超时',
    action: '稍后重试',
  },
});

// ============================================================================
// JSON-RPC 2.0 协议错误码（文档 §7.1）
// ============================================================================

const RPC_ERRORS = Object.freeze({
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
});

// ============================================================================
// 错误构造函数
// ============================================================================

/**
 * 构造业务错误对象
 * @param {string} code - 业务错误码（CODES.*）
 * @param {string} [customMessage] - 自定义消息
 * @param {object} [details] - 上下文
 * @returns {object} 错误对象
 */
function codeError(code, customMessage, details) {
  const def = ERROR_DEFS[code];
  return {
    code,
    message: customMessage || (def ? def.message : 'unknown error'),
    action: def ? def.action : undefined,
    details,
  };
}

/**
 * 将任意错误转换为业务错误
 * - 如果已是 codeError 格式：直接返回
 * - 如果是 Error：转为 INTERNAL
 * - 其他：转为 INTERNAL with message
 *
 * @param {unknown} err
 * @returns {object} 业务错误
 */
function toToolError(err) {
  if (!err) {
    return codeError(CODES.INTERNAL, 'unknown error');
  }
  // 已是 codeError 格式
  if (typeof err === 'object' && err.code && ERROR_DEFS[err.code]) {
    return err;
  }
  // 标准 Error
  if (err instanceof Error) {
    return codeError(CODES.INTERNAL, err.message);
  }
  // 字符串
  if (typeof err === 'string') {
    return codeError(CODES.INTERNAL, err);
  }
  return codeError(CODES.INTERNAL, JSON.stringify(err));
}

/**
 * 将业务错误序列化为 JSON 字符串
 * 供工具返回的 content 字段使用
 *
 * @param {object} err codeError 返回值
 * @returns {string}
 */
function serializeError(err) {
  const safe = toToolError(err);
  return JSON.stringify(safe);
}

/**
 * 构造 JSON-RPC 错误响应
 * @param {string} type - RPC_ERRORS 的 key
 * @param {string} [customMessage]
 * @returns {{code: number, message: string}}
 */
function rpcError(type, customMessage) {
  const def = RPC_ERRORS[type] || RPC_ERRORS.INTERNAL_ERROR;
  return {
    code: def.code,
    message: customMessage || def.message,
  };
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  CODES,
  ERROR_DEFS,
  RPC_ERRORS,
  codeError,
  toToolError,
  serializeError,
  rpcError,
};
