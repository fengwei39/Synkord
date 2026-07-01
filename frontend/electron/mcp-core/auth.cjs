/**
 * mcp-core/auth.cjs
 *
 * JWT 凭证模块（阶段 2 加固版）
 * 对应设计文档：
 *  - §5.2 MCP Server → 后端使用当前用户 JWT
 *  - §5.3 审计日志字段
 *  - §9.1 不存储任何 Token
 *  - §10 安全：日志脱敏、文件权限
 *  - §11.2 用户认证优先级：内存 > 文件（不支持 env 覆盖）
 */
'use strict';

const fs = require('fs');
const { readJsonFile, userAuthPath, checkFileMode } = require('./utils.cjs');
const { codeError, CODES } = require('./errors.cjs');

// ============================================================================
// JWT 格式校验
// ============================================================================

/**
 * 校验 JWT 字符串格式
 * 必须是 base64url 编码的 header.payload.signature 三段式
 *
 * @param {string} token
 * @returns {boolean}
 */
function isJwtFormat(token) {
  if (typeof token !== 'string' || token.length === 0) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  // 每段必须是 base64url（字母数字 + -_）
  const B64URL = /^[A-Za-z0-9_-]+$/;
  for (const p of parts) {
    if (p.length === 0 || !B64URL.test(p)) return false;
  }
  return true;
}

/**
 * 解码 JWT payload（不校验签名，仅读取声明）
 * - 不抛错：解析失败返回 null
 * - 不校验签名：由后端负责
 *
 * @param {string} token
 * @returns {object|null} payload
 */
function decodeJwtPayload(token) {
  if (!isJwtFormat(token)) return null;
  try {
    const payload = token.split('.')[1];
    // base64url -> base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ============================================================================
// 过期校验
// ============================================================================

/**
 * 检查 JWT 是否过期
 * - 优先使用 `exp` 声明（标准 JWT）
 * - 兼容 `expires_at` / `expired_at` 自定义字段
 * - 允许 5s 时钟偏移容忍
 *
 * @param {string} token
 * @param {number} [clockSkewSec=5]
 * @returns {{valid: boolean, reason?: string, exp?: number, expired?: boolean}}
 */
function checkJwtExpiry(token, clockSkewSec = 5) {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { valid: false, reason: 'invalid_token_format' };
  }

  // 提取 exp
  let exp = null;
  if (typeof payload.exp === 'number') {
    exp = payload.exp;
  } else if (typeof payload.expires_at === 'number') {
    exp = payload.expires_at;
  } else if (typeof payload.expired_at === 'number') {
    exp = payload.expired_at;
  }

  // 无 exp 声明：视为长期 token（不强制过期）
  if (exp === null) {
    return { valid: true, reason: 'no_exp_claim' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (exp + clockSkewSec < nowSec) {
    return { valid: false, reason: 'token_expired', exp, expired: true };
  }

  return { valid: true, exp };
}

// ============================================================================
// 凭证合法性校验
// ============================================================================

/**
 * 严格校验凭证结构
 * - token 必须是非空字符串
 * - user_id 必须是非空字符串
 *
 * @param {object|null} auth
 * @returns {boolean}
 */
function isValidAuth(auth) {
  if (!auth || typeof auth !== 'object') return false;
  if (typeof auth.token !== 'string' || auth.token.length === 0) return false;
  if (typeof auth.user_id !== 'string' || auth.user_id.length === 0) return false;
  return true;
}

/**
 * 完整校验（结构 + 格式 + 过期）
 * 返回 codeError 风格结果，不抛错
 *
 * @param {object|null} auth
 * @returns {{ok: boolean, error?: object, payload?: object|null}}
 */
function validateAuth(auth) {
  // 1. 空值拦截
  if (!auth) {
    return { ok: false, error: codeError(CODES.UNAUTHORIZED, 'user not logged in') };
  }
  // 2. 结构校验
  if (!isValidAuth(auth)) {
    return { ok: false, error: codeError(CODES.UNAUTHORIZED, 'invalid auth structure') };
  }
  // 3. JWT 格式校验
  if (!isJwtFormat(auth.token)) {
    return { ok: false, error: codeError(CODES.UNAUTHORIZED, 'invalid token format') };
  }
  // 4. 过期校验
  const expiry = checkJwtExpiry(auth.token);
  if (!expiry.valid) {
    return {
      ok: false,
      error: codeError(
        CODES.UNAUTHORIZED,
        expiry.reason === 'token_expired' ? 'token expired' : 'token invalid',
      ),
    };
  }
  // 5. 解析 payload 供后续使用
  const payload = decodeJwtPayload(auth.token);
  return { ok: true, payload };
}

/**
 * 校验后抛出版本（用于主流程直接抛错）
 *
 * @param {object|null} auth
 * @throws {object} codeError
 */
function assertValidAuth(auth) {
  const result = validateAuth(auth);
  if (!result.ok) {
    throw result.error;
  }
}

// ============================================================================
// 凭证读取
// ============================================================================

/**
 * 从磁盘读取用户凭证
 * - 文件不存在：返回 null（不报错）
 * - JSON 解析失败：返回 null
 *
 * @returns {Promise<object|null>} { token, user_id, user_name, updated_at }
 */
async function loadUserAuth() {
  return await readJsonFile(userAuthPath());
}

// ============================================================================
// Bearer Token 头构造
// ============================================================================

/**
 * 构造 Bearer Token 头
 * 严格校验后才返回，确保不会传出空 token
 *
 * @param {object} auth
 * @returns {string|null} "Bearer xxx" 或 null
 */
function bearerHeader(auth) {
  if (!isValidAuth(auth)) return null;
  return `Bearer ${auth.token}`;
}

// ============================================================================
// 文件权限检查
// ============================================================================

/**
 * 检查凭证文件权限（文档 §10）
 * - user-auth.json 应为 0600
 * - 不强制修改，只返回状态供调用方决定
 *
 * @returns {{ok: boolean, mode: number|null, expected: number, exists: boolean}}
 */
function checkAuthFilePermissions() {
  const filePath = userAuthPath();
  const expected = 0o600;
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, mode: null, expected, exists: false };
    }
    const stats = fs.statSync(filePath);
    const actual = stats.mode & 0o777;
    return {
      ok: actual === expected,
      mode: actual,
      expected,
      exists: true,
    };
  } catch {
    return { ok: false, mode: null, expected, exists: false };
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  // 读取
  loadUserAuth,
  // 校验
  isValidAuth,
  isJwtFormat,
  decodeJwtPayload,
  checkJwtExpiry,
  validateAuth,
  assertValidAuth,
  // 构造
  bearerHeader,
  // 文件
  checkAuthFilePermissions,
};
