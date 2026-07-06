/**
 * mcp-core/utils.cjs
 *
 * 公共工具函数：路径、文件读取、脱敏、参数摘要
 * 对应设计文档：
 *  - §11 配置优先级（路径解析、默认值）
 *  - §10 安全考虑（文件权限校验、敏感字段脱敏）
 *  - §5.3 审计日志（参数摘要 summarization）
 */
'use strict';

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// 路径常量（文档 §8 目录结构，§11.3 API base 兜底）
// ============================================================================

const DEFAULT_SYNKORD_HOME = path.join(os.homedir(), '.synkord');
const DEFAULT_API_BASE = 'http://127.0.0.1:8000/api';
const DEFAULT_HTTP_PORT = 37991;
const DEFAULT_HTTP_PATH = '/mcp';
const HOST = '127.0.0.1'; // §10 安全：仅本机回环，禁止 0.0.0.0

// 文件名常量（文档 §14.1，v1.2 重命名）
const FILE_ACTIVE_CONTRACT = 'active-contract.json';
const FILE_USER_AUTH = 'user-auth.json';
const FILE_ACCESS_LOG = 'mcp-access.log';

// ============================================================================
// 路径解析（文档 §11 三级配置）
// ============================================================================

/**
 * 获取 Synkord home 目录
 * 优先级：SYNKORD_HOME 环境变量 > ~/.synkord
 */
function synkordHome() {
  return process.env.SYNKORD_HOME || DEFAULT_SYNKORD_HOME;
}

/**
 * 获取 active-contract.json 绝对路径
 * 兼容旧文件名 active-context.json（v1.2 之前的）
 */
function activeContextPath() {
  return path.join(synkordHome(), FILE_ACTIVE_CONTRACT)
}

/** @deprecated 别名，保留向后兼容 */
function activeContractPath() {
  return activeContextPath()
}

/**
 * 获取 user-auth.json 绝对路径
 */
function userAuthPath() {
  return path.join(synkordHome(), FILE_USER_AUTH);
}

/**
 * 获取访问日志绝对路径
 */
function accessLogPath() {
  return path.join(synkordHome(), FILE_ACCESS_LOG);
}

// ============================================================================
// 文件操作（文档 §14.2 原子写入 + 只读）
// ============================================================================

/**
 * 安全读取 JSON 文件
 * - 文件不存在：返回 null（不报错）
 * - JSON 解析失败：返回 null 并记录日志
 * - 读权限错误：返回 null
 *
 * @param {string} filePath
 * @returns {Promise<object|null>}
 */
async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    // 不抛出，避免影响整个服务
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[mcp-utils] failed to read ${filePath}: ${e.message}\n`);
    }
    return null;
  }
}

/**
 * 原子写入 JSON 文件（文档 §14.2）
 * 先写 .tmp，再 rename，避免并发读时读到半截数据
 *
 * @param {string} filePath
 * @param {object} data
 */
async function writeJsonFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = filePath + '.tmp.' + process.pid;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, content, { mode: 0o600 });
  await fs.rename(tmp, filePath);
}

// ============================================================================
// 安全：敏感字段脱敏（文档 §10、§5.3）
// ============================================================================

/**
 * 递归脱敏敏感字段
 * 命中规则：key 名（不区分大小写）在敏感列表中
 * 脱敏后的值：'***REDACTED***'
 *
 * @param {object} obj
 * @returns {object} 新对象（不修改原对象）
 */
function redactSensitive(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  const SENSITIVE_KEYS = new Set([
    'token',
    'authorization',
    'password',
    'secret',
    'access_token',
    'refreshtoken',
    'refreshtoken',
    'cookie',
    'set-cookie',
  ]);

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitive(item));
  }

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '***REDACTED***';
    } else if (v !== null && typeof v === 'object') {
      out[k] = redactSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ============================================================================
// 工具参数摘要（文档 §5.3）
// ============================================================================

/**
 * 压缩工具参数用于审计日志
 * 规则：
 *  - code_snippet：保留长度 + 32 字符预览
 *  - 整体长度限制 480 字符
 *
 * @param {object} args
 * @returns {string}
 */
function summarizeArgs(args) {
  if (!args || typeof args !== 'object') return '{}';

  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'code_snippet' && typeof v === 'string') {
      const preview = v.slice(0, 32).replace(/\n/g, ' ');
      out[k] = `<string len=${v.length} preview="${preview}...">`;
    } else if (v !== null && typeof v === 'object') {
      // 嵌套对象只保留 key 列表
      out[k] = `{${Object.keys(v).slice(0, 5).join(',')}}`;
    } else {
      out[k] = v;
    }
  }
  const json = JSON.stringify(out);
  return json.length > 480 ? json.slice(0, 477) + '...' : json;
}

// ============================================================================
// 文件权限检查（文档 §10 安全）
// ============================================================================

/**
 * 检查文件权限是否符合预期
 * 不符合时返回 false（不强制修改，只警告）
 *
 * @param {string} filePath
 * @param {number} expectedMode 如 0o600
 * @returns {boolean}
 */
function checkFileMode(filePath, expectedMode) {
  try {
    const stats = fsSync.statSync(filePath);
    const actual = stats.mode & 0o777;
    if (actual !== expectedMode) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// 网络：获取客户端 IP（文档 §13.1 访问日志）
// ============================================================================

/**
 * 解析客户端真实 IP（考虑反向代理）
 * 优先级：X-Forwarded-For > X-Real-IP > socket.remoteAddress
 *
 * @param {object} req http.IncomingMessage
 * @returns {string}
 */
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  const xri = req.headers['x-real-ip'];
  if (typeof xri === 'string' && xri.length > 0) {
    return xri.trim();
  }
  if (req.socket) {
    return req.socket.remoteAddress || 'unknown';
  }
  return 'unknown';
}

module.exports = {
  // 常量
  DEFAULT_API_BASE,
  DEFAULT_HTTP_PORT,
  DEFAULT_HTTP_PATH,
  HOST,
  // 路径
  synkordHome,
  activeContextPath,
  activeContractPath,
  userAuthPath,
  accessLogPath,
  // 文件
  readJsonFile,
  writeJsonFileAtomic,
  // 安全
  redactSensitive,
  checkFileMode,
  // 工具
  summarizeArgs,
  getClientIp,
};
