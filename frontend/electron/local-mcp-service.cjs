#!/usr/bin/env node
/**
 * local-mcp-service.cjs
 *
 * Synkord MCP Server 主进程
 * 阶段 5：双模式（HTTP + STDIO）
 *
 * 严格遵循冻结版 mcp-server-design.md：
 *  - §4.2 STDIO 模式
 *  - §4.3 Streamable HTTP 模式
 *  - §10 仅 127.0.0.1 监听（HTTP）
 *  - §13.1 访问日志 JSON Lines（HTTP）
 *  - §9.3 生命周期
 *
 * 用法：
 *   node local-mcp-service.cjs --mode stdio
 *   node local-mcp-service.cjs --mode http --port 37991
 *   node local-mcp-service.cjs stdio
 *   node local-mcp-service.cjs http --port 37991
 */
'use strict';

const http = require('http');
const path = require('path');
const os = require('os');
const net = require('net');
const fs = require('fs');
const readline = require('readline');

// ============================================================================
// 配置常量（HTTP 模式）
// ============================================================================

const HOST = '127.0.0.1';
const DEFAULT_PORT = 37991;
const DEFAULT_PATH = '/mcp';
const MAX_BODY_SIZE = 4 * 1024 * 1024;
const SSE_KEEPALIVE_MS = 15000;
const SSE_MAX_EVENTS = 100;
const SSE_EVENT_TTL_MS = 5 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 5000;

const SYNKORD_HOME = process.env.SYNKORD_HOME || path.join(os.homedir(), '.synkord');
process.env.SYNKORD_HOME = SYNKORD_HOME;

// ============================================================================
// 参数解析（支持两种模式）
// ============================================================================

function parseArgs(argv) {
  // 兼容两种调用：
  // 1. node local-mcp-service.cjs --mode http --port 37991
  // 2. node local-mcp-service.cjs stdio
  // 3. node local-mcp-service.cjs http --port 37991
  const out = { mode: 'http', port: DEFAULT_PORT };
  let i = 0;

  // 第一种：第一参数就是模式名（无 -- 前缀）
  if (argv[0] === 'stdio' || argv[0] === 'http') {
    out.mode = argv[0];
    i = 1;
  }

  for (; i < argv.length; i++) {
    if (argv[i] === '--mode' && argv[i + 1]) {
      out.mode = argv[++i];
    } else if (argv[i] === '--port' && argv[i + 1]) {
      out.port = parseInt(argv[++i], 10) || DEFAULT_PORT;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// ============================================================================
// 公共依赖
// ============================================================================

const { ConfigLoader } = require('./mcp-core/config-loader.cjs');
const { globalRegistry } = require('./mcp-core/tool-registry.cjs');
const { registerBuiltinTools } = require('./mcp-tools/index.cjs');
const { codeError, CODES, rpcError, serializeError, RPC_ERRORS } = require('./mcp-core/errors.cjs');
const { initAccessLog, logAccess, closeAccessLog, info, warn, error, debug } = require('./mcp-core/logging.cjs');
const { redactSensitive, getClientIp, readJsonFile } = require('./mcp-core/utils.cjs');

// 注册 5 个内置工具（仅一次）
registerBuiltinTools();

// ============================================================================
// 公共：ConfigLoader + 轮询
// ============================================================================

const loader = new ConfigLoader();

async function loadFromDisk() {
  const authPath = path.join(SYNKORD_HOME, 'user-auth.json');
  const ctxPath = path.join(SYNKORD_HOME, 'active-context.json');
  const auth = await readJsonFile(authPath);
  const ctx = await readJsonFile(ctxPath);
  // 文件不存在时也调用，setMemory* 会清空旧值
  loader.setMemoryContext(ctx);
  loader.setMemoryAuth(auth);
  return { ctx, auth };
}

// 启动时加载
loadFromDisk().catch((e) => error('initial load failed', { error: e.message }));

// 1s 轮询
setInterval(() => {
  loadFromDisk().catch(() => {});
}, 1000).unref();

// ============================================================================
// 公共：JSON-RPC 工具
// ============================================================================

/**
 * 标准化 JSON-RPC 响应
 */
function buildRpcResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function buildRpcError(id, errorObj) {
  return { jsonrpc: '2.0', id, error: errorObj };
}

// ============================================================================
// 公共：进程信号处理
// ============================================================================

let isShuttingDown = false;
function gracefulShutdown(signal, cleanup) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  info('shutting down', { signal, mode: args.mode });
  const exitFn = () => {
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch { /* ignore */ }
    }
    process.exit(0);
  };
  // 超时强退
  setTimeout(() => {
    warn('shutdown timeout, force exit');
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  exitFn();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// IPC 关闭信号
process.on('message', (msg) => {
  if (msg?.type === 'shutdown') {
    gracefulShutdown('ipc-shutdown');
  }
});

process.on('uncaughtException', (err) => {
  error('uncaughtException', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  error('unhandledRejection', { reason: String(reason) });
});

// ============================================================================
// 模式选择
// ============================================================================

if (args.mode === 'stdio') {
  runStdioMode();
} else {
  runHttpMode();
}

// ============================================================================
// STDIO 模式（阶段 5）
// ============================================================================

function runStdioMode() {
  info('STDIO mode starting', { pid: process.pid, synkord_home: SYNKORD_HOME });

  // 通知父进程 ready
  if (process.send) {
    process.send({ type: 'ready', mode: 'stdio' });
  }

  // 配置 readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout, // 注意：实际不写，由我们控制
    terminal: false,
    crlfDelay: Infinity,
  });

  // 强制：所有日志走 stderr，stdout 仅输出 JSON-RPC
  // 禁用 console.log（防止误用）
  console.log = (...args) => {
    process.stderr.write(`[console.log intercepted] ${args.join(' ')}\n`);
  };
  console.info = (...args) => {
    process.stderr.write(`[console.info intercepted] ${args.join(' ')}\n`);
  };
  // console.error / console.warn 保留（已经走 stderr）

  // 逐行处理
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch (e) {
      sendRpcErrorToStdout(null, rpcError('PARSE_ERROR', 'parse error: ' + e.message));
      return;
    }

    if (typeof req !== 'object' || req === null) {
      sendRpcErrorToStdout(req?.id, rpcError('INVALID_REQUEST', 'invalid request'));
      return;
    }

    // 通知消息（无 id）不响应
    const isNotification = req.id === undefined || req.id === null;

    try {
      // 已知非工具方法：直接处理（不走 dispatch）
      if (req.method === 'initialize' ||
          req.method === 'notifications/initialized' ||
          req.method === 'tools/list' ||
          req.method === 'tools/call' ||
          req.method === 'ping') {
        const result = await handleRpcMethod(req);
        if (!isNotification) {
          sendRpcResponseToStdout(req.id, result);
        }
      } else {
        // 未知方法：直接返回 JSON-RPC 错误
        sendRpcErrorToStdout(req.id, rpcError('METHOD_NOT_FOUND', `method not found: ${req.method}`));
      }
    } catch (e) {
      error('RPC handler error', { method: req.method, error: e.message });
      if (!isNotification) {
        const rpcErr = codeError(CODES.INTERNAL, e.message || 'internal error');
        sendRpcErrorToStdout(req.id, rpcErr);
      }
    }
  });

  rl.on('close', () => {
    info('stdin closed, exiting');
    process.exit(0);
  });

  // 输出提示到 stderr（不污染 stdout）
  process.stderr.write(`[synkord-mcp] stdio mode ready (pid=${process.pid})\n`);
}

/**
 * 通过 stdout 输出 JSON-RPC 响应
 * 严格单行 JSON + \n
 */
function sendRpcResponseToStdout(id, result) {
  const response = buildRpcResponse(id, result);
  try {
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (e) {
    // 序列化失败（极少见），回退到错误
    const err = buildRpcError(id, rpcError('INTERNAL_ERROR', 'response serialize failed: ' + e.message));
    process.stdout.write(JSON.stringify(err) + '\n');
  }
}

function sendRpcErrorToStdout(id, errorObj) {
  const response = buildRpcError(id, errorObj);
  try {
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (e) {
    // 兜底
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'fatal' } }) + '\n');
  }
}

/**
 * 路由 RPC 方法
 */
async function handleRpcMethod(req) {
  const method = req.method;
  const params = req.params || {};

  if (method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'synkord-mcp', version: '0.1.0' },
      capabilities: { tools: {} },
    };
  }

  if (method === 'notifications/initialized') {
    // 通知消息，无需返回
    return null;
  }

  if (method === 'tools/list') {
    return { tools: globalRegistry.list() };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    const r = await globalRegistry.dispatch({ tool: name, args: args || {}, loader });
    return r;
  }

  if (method === 'ping') {
    return { status: 'pong' };
  }

  // 未知方法：抛 JSON-RPC 标准错误
  throw rpcError('METHOD_NOT_FOUND', `method not found: ${method}`);
}

// ============================================================================
// HTTP 模式（阶段 4，保留）
// ============================================================================

function runHttpMode() {
  // ... 复用阶段 4 逻辑
  startHttpServer();
}

async function startHttpServer() {
  // 端口预检
  const port = await findAvailablePort(args.port);
  if (!port) {
    error('no available port', { preferred: args.port });
    if (process.send) process.send({ type: 'error', error: 'no available port' });
    process.exit(1);
  }
  const serverPort = port;

  // 初始化访问日志
  initAccessLog();

  const server = http.createServer(httpRequestHandler);

  server.on('error', (err) => {
    error('server error', { error: err.message });
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    info('HTTP MCP server listening', { host: HOST, port, path: DEFAULT_PATH, pid: process.pid, synkord_home: SYNKORD_HOME });
    if (process.send) process.send({ type: 'ready', port });
  });
}

function findAvailablePort(preferred) {
  return new Promise((resolve) => {
    let p = preferred;
    function tryOne() {
      const tester = net.createServer()
        .once('error', () => {
          p++;
          if (p < preferred + 10) tryOne();
          else resolve(null);
        })
        .once('listening', () => tester.close(() => resolve(p)))
        .listen(p, HOST);
    }
    tryOne();
  });
}

// HTTP handler（简化版，沿用阶段 4）
function httpRequestHandler(req, res) {
  applyCORS(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname !== DEFAULT_PATH) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  if (url.method === undefined) { /* ignore */ }
  if (req.method === 'GET') {
    handleMcpGET(req, res);
  } else if (req.method === 'POST') {
    handleMcpPOST(req, res);
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET, POST, OPTIONS' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
  }
}

function applyCORS(req, res) {
  const origin = req.headers.origin;
  if (isLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Last-Event-ID');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

let httpConnectionCounter = 0;
async function handleMcpPOST(req, res) {
  const start = Date.now();
  const connId = ++httpConnectionCounter;

  let body;
  try {
    body = await readBody(req);
  } catch {
    const err = codeError(CODES.INVALID_ARGS, 'body too large');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: err }));
    logAccess({ conn: connId, method: 'POST', path: '/mcp', status: 400, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: 'body_error' });
    return;
  }

  let rpcReq;
  try {
    rpcReq = JSON.parse(body);
  } catch {
    const err = rpcError('PARSE_ERROR');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: err }));
    logAccess({ conn: connId, method: 'POST', path: '/mcp', status: 400, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: 'parse_error' });
    return;
  }

  const rpcMethod = rpcReq?.method || '';
  let result, errOut, httpStatus = 200;

  try {
    if (rpcMethod === 'initialize') {
      result = { protocolVersion: '2024-11-05', serverInfo: { name: 'synkord-mcp', version: '0.1.0' }, capabilities: { tools: {} } };
    } else if (rpcMethod === 'notifications/initialized') {
      res.writeHead(202);
      res.end();
      logAccess({ conn: connId, method: 'POST', path: '/mcp', status: 202, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: rpcMethod });
      return;
    } else if (rpcMethod === 'tools/list') {
      result = { tools: globalRegistry.list() };
    } else if (rpcMethod === 'tools/call') {
      const { name, arguments: args } = rpcReq.params || {};
      result = await globalRegistry.dispatch({ tool: name, args: args || {}, loader });
    } else if (rpcMethod === 'ping') {
      result = { status: 'pong' };
    } else {
      errOut = rpcError('METHOD_NOT_FOUND', `method not found: ${rpcMethod}`);
      httpStatus = 400;
    }
  } catch (e) {
    errOut = codeError(CODES.INTERNAL, e.message);
    httpStatus = 500;
  }

  const response = { jsonrpc: '2.0', id: rpcReq.id };
  if (errOut) response.error = errOut;
  else response.result = result;

  res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
  logAccess({ conn: connId, method: 'POST', path: '/mcp', status: httpStatus, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: rpcMethod });
}

function handleMcpGET(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.writeHead(200);
  const ka = setInterval(() => {
    if (res.writableEnded) { clearInterval(ka); return; }
    res.write(': keepalive\n\n');
  }, SSE_KEEPALIVE_MS);
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => clearInterval(ka));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
