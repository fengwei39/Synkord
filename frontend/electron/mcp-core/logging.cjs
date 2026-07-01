/**
 * mcp-core/logging.cjs
 *
 * 日志底座：调试日志（stderr）+ 访问日志（JSON Lines 文件）
 * 对应设计文档：
 *  - §13.1 访问日志（JSON Lines 格式、字段定义）
 *  - §13.2 调试日志（文本/JSON、强制 stderr 避免污染 stdout）
 *  - §10 安全（敏感字段脱敏）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { redactSensitive, accessLogPath } = require('./utils.cjs');

// ============================================================================
// 调试日志（stderr，文档 §13.2）
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

// 当前日志级别（默认 INFO，可通过 MCP_LOG_LEVEL 环境变量调整）
const CURRENT_LEVEL = (() => {
  const v = (process.env.MCP_LOG_LEVEL || 'INFO').toUpperCase();
  return LOG_LEVELS[v] !== undefined ? LOG_LEVELS[v] : LOG_LEVELS.INFO;
})();

// 是否 JSON 格式（默认文本，可通过 MCP_LOG_FORMAT=json 切换）
const JSON_FORMAT = process.env.MCP_LOG_FORMAT === 'json';

// 日志前缀
const PREFIX = process.env.MCP_LOG_PREFIX || 'mcp';

/**
 * 写调试日志到 stderr
 *
 * @param {string} level - DEBUG/INFO/WARN/ERROR
 * @param {string} msg - 日志消息
 * @param {object} [fields] - 结构化字段（自动脱敏）
 */
function log(level, msg, fields) {
  const levelNum = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  if (levelNum < CURRENT_LEVEL) return;

  // 自动脱敏
  const safeFields = fields ? redactSensitive(fields) : {};
  const ts = new Date().toISOString();

  if (JSON_FORMAT) {
    const entry = { ts, level, prefix: PREFIX, msg, ...safeFields };
    process.stderr.write(JSON.stringify(entry) + '\n');
  } else {
    const fieldsStr = Object.entries(safeFields)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    const line = fieldsStr
      ? `${ts} ${level} [${PREFIX}] ${msg} ${fieldsStr}`
      : `${ts} ${level} [${PREFIX}] ${msg}`;
    process.stderr.write(line + '\n');
  }
}

const debug = (msg, fields) => log('DEBUG', msg, fields);
const info = (msg, fields) => log('INFO', msg, fields);
const warn = (msg, fields) => log('WARN', msg, fields);
const error = (msg, fields) => log('ERROR', msg, fields);

// ============================================================================
// 访问日志（JSON Lines，文档 §13.1）
// ============================================================================

let accessLogStream = null;
let accessLogBytes = 0;
const ACCESS_LOG_MAX_BYTES = 100 * 1024 * 1024; // 100MB
const ACCESS_LOG_KEEP = 5; // 保留最近 5 个轮转文件

/**
 * 初始化访问日志
 * - 启动时由 main.cjs 调用
 * - 默认 0600 权限
 */
function initAccessLog() {
  if (accessLogStream) return;
  const filePath = accessLogPath();
  try {
    // 确保目录存在
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    accessLogStream = fs.createWriteStream(filePath, { flags: 'a', mode: 0o600 });
    try {
      accessLogBytes = fs.statSync(filePath).size;
    } catch {
      accessLogBytes = 0;
    }
  } catch (e) {
    process.stderr.write(`[mcp-logging] failed to open access log: ${e.message}\n`);
  }
}

/**
 * 关闭访问日志
 * - 退出时由 main.cjs 调用
 */
function closeAccessLog() {
  if (accessLogStream) {
    accessLogStream.end();
    accessLogStream = null;
  }
}

/**
 * 写一条访问日志（JSON Lines 格式）
 * 对应文档 §13.1 字段定义
 *
 * @param {object} entry
 *   @prop {number} conn        连接 ID
 *   @prop {string} method      HTTP 方法
 *   @prop {string} path        请求路径
 *   @prop {number} status      HTTP 状态码
 *   @prop {number} durMs       耗时（毫秒）
 *   @prop {string} remote      客户端 IP
 *   @prop {string} ua          User-Agent
 *   @prop {string} [rpc]       RPC 方法名（如果有）
 */
function logAccess(entry) {
  if (!accessLogStream) initAccessLog();
  if (!accessLogStream) return;

  // 脱敏 entry（防止 UA/路径意外携带 token）
  const safe = redactSensitive({
    ts: new Date().toISOString(),
    conn: entry.conn,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    dur_ms: entry.durMs,
    remote: entry.remote,
    ua: entry.ua,
    rpc: entry.rpc,
  });

  const line = JSON.stringify(safe) + '\n';
  accessLogStream.write(line);
  accessLogBytes += Buffer.byteLength(line);

  // 检查是否需要轮转
  if (accessLogBytes > ACCESS_LOG_MAX_BYTES) {
    rotateAccessLog();
  }
}

/**
 * 轮转访问日志（文档 §13.1：100MB/文件，保留 5 个）
 */
function rotateAccessLog() {
  const filePath = accessLogPath();
  closeAccessLog();

  // 重命名为带时间戳的备份
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.${ts}.bak`;
  try {
    fs.renameSync(filePath, backupPath);
  } catch (e) {
    process.stderr.write(`[mcp-logging] rotate failed: ${e.message}\n`);
  }

  // 清理超出数量的旧备份
  try {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath);
    const backups = fs
      .readdirSync(dir)
      .filter(f => f.startsWith(baseName + '.') && f.endsWith('.bak'))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        mtime: fs.statSync(path.join(dir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    while (backups.length > ACCESS_LOG_KEEP) {
      const old = backups.pop();
      try {
        fs.unlinkSync(old.path);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // 重新打开
  accessLogBytes = 0;
  initAccessLog();
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  // 调试日志
  debug,
  info,
  warn,
  error,
  log,
  LOG_LEVELS,
  // 访问日志
  initAccessLog,
  closeAccessLog,
  logAccess,
};
