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

// ============================================================================
// MCP 协议版本协商（Streamable HTTP / STDIO 通用）
// 适配 Codex 等强校验客户端：
//  - 客户端可声明 protocolVersion，服务端按以下规则协商：
//    1. 客户端未声明 → 返回 DEFAULT_PROTOCOL_VERSION
//    2. 客户端声明的版本在 SUPPORTED_PROTOCOL_VERSIONS 中 → 原样回显
//    3. 其它情况 → 返回 DEFAULT_PROTOCOL_VERSION（向下兼容客户端）
//  - STDIO 模式：无状态，跳过 Mcp-Session-Id 强制校验
//  - HTTP 模式：有状态，initialize 响应中输出 Mcp-Session-Id，
//               后续请求必须携带相同 header
// ============================================================================
const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
]);
const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

function negotiateProtocolVersion(clientVersion) {
  if (!clientVersion) return DEFAULT_PROTOCOL_VERSION;
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)) return clientVersion;
  return DEFAULT_PROTOCOL_VERSION;
}

function generateSessionId() {
  // 16 字节随机 → base64url
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('base64url');
}

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
const { callTool } = require('./mcp-core/backend-client.cjs');

// 注册内置工具（仅一次）
registerBuiltinTools();

// ============================================================================
// 公共：ConfigLoader + 轮询
// ============================================================================

const loader = new ConfigLoader();

async function loadFromDisk() {
  const authPath = path.join(SYNKORD_HOME, 'credentials.json');
  const legacyAuthPath = path.join(SYNKORD_HOME, 'user-auth.json');
  const ctxPath = path.join(SYNKORD_HOME, 'active-contract.json');
  const legacyCtxPath = path.join(SYNKORD_HOME, 'active-context.json');
  const auth = (await readJsonFile(authPath)) || (await readJsonFile(legacyAuthPath));
  const ctx = (await readJsonFile(ctxPath)) || (await readJsonFile(legacyCtxPath));
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
      // 统一走 handleRpcMethod（含 resources/list 等桩方法）
      // handleRpcMethod 内部对未知方法抛 METHOD_NOT_FOUND
      const result = await handleRpcMethod(req);
      if (!isNotification) {
        sendRpcResponseToStdout(req.id, result);
      }
    } catch (e) {
      // handleRpcMethod 抛的 RPC 错误（METHOD_NOT_FOUND 等）保留原始结构
      if (e?.code !== undefined && e?.message !== undefined && typeof e.code === 'number') {
        sendRpcErrorToStdout(req.id, e);
      } else {
        error('RPC handler error', { method: req.method, error: e.message });
        if (!isNotification) {
          const rpcErr = codeError(CODES.INTERNAL, e.message || 'internal error');
          sendRpcErrorToStdout(req.id, rpcErr);
        }
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
    const clientVersion = params.protocolVersion;
    const negotiated = negotiateProtocolVersion(clientVersion);
    return {
      protocolVersion: negotiated,
      serverInfo: { name: 'synkord-mcp', version: '0.1.0' },
      // 【同步】完整 capabilities 声明，与 HTTP 模式保持一致
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        logging: {}
      },
      instructions: 'Synkord MCP server: query project entities, APIs, dependencies. Use tools/list for available tools.'
    };
  }

  if (method === 'notifications/initialized') {
    // 通知消息，无需返回
    // STDIO 模式下视为握手完成的标记；保持空响应行为，不抛错
    return null;
  }

  if (method === 'tools/list') {
    const tools = globalRegistry.list();
    // 【新增】详细日志：记录 tools/list 请求与返回的工具数量
    info('mcp tools/list', {
      tool_count: tools.length,
      tool_names: tools.map(t => t.name),
    });
    return { tools };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    const r = await globalRegistry.dispatch({ tool: name, args: args || {}, loader });
    return r;
  }

  if (method === 'ping') {
    return { status: 'pong' };
  }

  // ============================================================================
  // 【补全】resources 能力完整定义
  //
  // 【问题原因】原实现仅返回空数组，Codex 等客户端拿到空 resources 会进一步
  // 怀疑 server 完整度，甚至影响 tools 命名空间的暴露。
  //
  // 【修复逻辑】按 MCP 2025-03-26 协议提供真实可用的 resources 与 templates：
  //   - 3 个静态资源：server 状态、当前激活项目、工具清单
  //   - 2 个参数化模板：按名称查实体、按 method+path 查 API
  //   - resources/read 真正读取资源内容
  // 资源内容由内存中的 loader（ConfigLoader）实时提供，与 tools/call 共享
  // 同一份上下文数据源。
  // ============================================================================
  if (method === 'resources/list') {
    const resources = buildStaticResources();
    info('mcp resources/list', { resource_count: resources.length, resources: resources.map(r => r.uri) });
    return { resources };
  }
  if (method === 'resources/templates/list') {
    const templates = buildResourceTemplates();
    info('mcp resources/templates/list', { template_count: templates.length });
    return { resourceTemplates: templates };
  }
  if (method === 'resources/read') {
    const uri = params.uri;
    if (!uri || typeof uri !== 'string') {
      throw rpcError('INVALID_PARAMS', 'resources/read requires uri parameter');
    }
    const content = await readResource(uri, loader);
    info('mcp resources/read', { uri });
    return content;
  }

  if (method === 'prompts/list') {
    return { prompts: [] };
  }

  // 未知方法：抛 JSON-RPC 标准错误
  throw rpcError('METHOD_NOT_FOUND', `method not found: ${method}`);
}

// ============================================================================
// Resources 实现
// ============================================================================

/**
 * 静态资源列表（无参数）
 * - synkord://status：server 运行状态（版本、协议、启动时间）
 * - synkord://active-project：当前激活项目（来自 ConfigLoader 内存）
 * - synkord://tools-manifest：工具清单（含每个工具的 inputSchema）
 */
function buildStaticResources() {
  return [
    {
      uri: 'synkord://status',
      name: 'Server Status',
      description: '当前 MCP server 的运行状态：版本、协议版本、启动时间、工具数。',
      mimeType: 'application/json',
    },
    {
      uri: 'synkord://active-contract',
      name: 'Active Contract',
      description: '当前激活契约集信息（contract_id / contract_name / set_at / set_by）。',
      mimeType: 'application/json',
    },
    {
      uri: 'synkord://tools-manifest',
      name: 'Tools Manifest',
      description: '所有可用工具的完整定义（name / description / inputSchema）。',
      mimeType: 'application/json',
    },
  ];
}

/**
 * 参数化资源模板（URI Template RFC 6570）
 * - synkord://entity/{name}：按实体名称查询单个实体定义
 * - synkord://api/{method}/{path}：按 HTTP method + path 查询单个 API 端点
 */
function buildResourceTemplates() {
  return [
    {
      uriTemplate: 'synkord://entity/{name}',
      name: 'Entity by Name',
      description: '按名称查询指定实体的完整定义（字段、版本、引用关系）。name 为实体名，如 UserDTO。',
      mimeType: 'application/json',
    },
    {
      uriTemplate: 'synkord://api/{method}/{path}',
      name: 'API Endpoint',
      description: '按 HTTP method + path 查询指定 API 端点的定义（请求/响应 schema）。method 不区分大小写（GET/POST/PUT/DELETE/PATCH）。',
      mimeType: 'application/json',
    },
  ];
}

/**
 * 读取资源内容
 * 支持静态资源（synkord://status 等）和模板资源（synkord://entity/{name}）
 *
 * @param {string} uri
 * @param {ConfigLoader} loader
 * @returns {Promise<{contents: Array<{uri, mimeType, text}>}>}
 */
async function readResource(uri, loader) {
  const ctx = loader.resolveContext();
  const auth = loader.resolveAuth();

  // 静态资源
  if (uri === 'synkord://status') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          server: { name: 'synkord-mcp', version: '0.1.0' },
          protocol: { supported: SUPPORTED_PROTOCOL_VERSIONS, default: DEFAULT_PROTOCOL_VERSION },
          uptime_started_at: new Date(Date.now() - (process.uptime() * 1000)).toISOString(),
          tools_count: globalRegistry.size(),
          has_active_contract: Boolean(ctx && ctx.contract_id),
          has_auth: Boolean(auth && (auth.user_id || auth.access_token)),
          pid: process.pid,
        }, null, 2),
      }],
    };
  }

  if (uri === 'synkord://active-contract') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          context: ctx || null,
          has_context: Boolean(ctx && ctx.contract_id),
        }, null, 2),
      }],
    };
  }

  if (uri === 'synkord://tools-manifest') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          tools: globalRegistry.list(),
        }, null, 2),
      }],
    };
  }

  // 模板资源：synkord://entity/{name}
  const entityMatch = uri.match(/^synkord:\/\/entity\/(.+)$/);
  if (entityMatch) {
    const name = decodeURIComponent(entityMatch[1]);
    // 复用 tool handler 的逻辑获取单个实体
    const resp = await callTool({
      loader,
      auth,
      tool: 'get_entity_dependencies',
      args: { model_name: name },
    });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          entity_name: name,
          data: resp?.result || resp || null,
        }, null, 2),
      }],
    };
  }

  // 模板资源：synkord://api/{method}/{path}
  const apiMatch = uri.match(/^synkord:\/\/api\/([^/]+)\/(.+)$/);
  if (apiMatch) {
    const method = decodeURIComponent(apiMatch[1]).toUpperCase();
    const apiPath = '/' + decodeURIComponent(apiMatch[2]);
    const resp = await callTool({
      loader,
      auth,
      tool: 'get_api_dependencies',
      args: { api_path: apiPath, api_method: method },
    });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          api_method: method,
          api_path: apiPath,
          data: resp?.result || resp || null,
        }, null, 2),
      }],
    };
  }

  throw rpcError('RESOURCE_NOT_FOUND', `resource not found: ${uri}`);
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
// 会话表：sessionId → { createdAt, lastSeenAt, ua }
// 用于 Mcp-Session-Id 头校验与回收
const sessionRegistry = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

// 定期回收过期 session（避免无限增长）
setInterval(() => {
  const now = Date.now();
  for (const [sid, info] of sessionRegistry.entries()) {
    if (now - info.lastSeenAt > SESSION_TTL_MS) {
      sessionRegistry.delete(sid);
    }
  }
}, 60 * 1000).unref();

async function handleMcpPOST(req, res) {
  const start = Date.now();
  const connId = ++httpConnectionCounter;

  // 【新增】可选 Bearer Token 鉴权（环境变量 MCP_BEARER_TOKEN 控制）
  // - 空（默认）→ 跳过鉴权，开发与本地集成友好
  // - 非空 → 必须携带 `Authorization: Bearer <token>`，否则 401
  // 这样避免"未配置 token 但服务端强制鉴权"导致的握手静默失败
  const REQUIRED_BEARER = process.env.MCP_BEARER_TOKEN || '';
  if (REQUIRED_BEARER) {
    const authHeader = String(req.headers.authorization || '');
    if (authHeader !== `Bearer ${REQUIRED_BEARER}`) {
      warn('bearer auth rejected', {
        remote: getClientIp(req),
        ua: req.headers['user-agent'] || '',
        reason: REQUIRED_BEARER ? 'token_mismatch' : 'token_required',
      });
      const err = rpcError('UNAUTHORIZED', 'invalid or missing bearer token');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: err }));
      logAccess({ conn: connId, method: 'POST', path: '/mcp', status: 401, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: 'auth_failed' });
      return;
    }
  }

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
  const isNotification = rpcReq.id === undefined || rpcReq.id === null;
  let result, errOut, httpStatus = 200;
  let newSessionId = null; // 仅 initialize 时分配

  // 会话头校验（仅 initialize 之外的方法强制；initialize 自身允许无 header）
  if (rpcMethod !== 'initialize') {
    const headerSid = req.headers['mcp-session-id'];
    if (headerSid) {
      // 客户端携带了 session 头：必须存在于会话表中
      const info = sessionRegistry.get(headerSid);
      if (!info) {
        const err = rpcError('INVALID_REQUEST', 'unknown or expired Mcp-Session-Id');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpcReq.id, error: err }));
        logAccess({ conn: connId, method: 'POST', path: '/mcp', status: 400, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: rpcMethod });
        return;
      }
      info.lastSeenAt = Date.now();
    }
    // 无 session 头：视为无状态调用，跳过强制校验（与 STDIO 行为一致）
  }

  try {
    // initialize 是 HTTP 模式唯一需要特判的方法（要分配 session id）
    // 其它方法（含 notifications/initialized、tools/*、ping、resources/*、prompts/* 桩）
    // 统一走 handleRpcMethod
    if (rpcMethod === 'initialize') {
      const clientVersion = (rpcReq.params || {}).protocolVersion;
      const negotiated = negotiateProtocolVersion(clientVersion);
      newSessionId = generateSessionId();
      sessionRegistry.set(newSessionId, {
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        ua: req.headers['user-agent'] || '',
        negotiatedVersion: negotiated,
      });
      // 【修复】补全 capabilities 声明。
      // 原代码只声明 { tools: {} }，MCP 2025-03-26 协议允许声明多种能力。
      // Codex 等客户端会按 capabilities 决定如何暴露 MCP 工具到自己的命名空间
      // （mcp__<server>__<tool>），声明越完整，客户端越有信心暴露工具。
      // resources / prompts 暂时返回空数组（真实定义见 handleRpcMethod 中
      // resources/list 桩方法；后续可补全）。logging 能力声明让客户端支持
      // setLevel 协议方法（虽然本服务暂不实现）。
      result = {
        protocolVersion: negotiated,
        serverInfo: { name: 'synkord-mcp', version: '0.1.0' },
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
          logging: {}
        },
        // 指示客户端应使用的协议说明（MCP 2025-03-26 §Implementation Notes）
        instructions: 'Synkord MCP server: query project entities, APIs, dependencies. Use tools/list for available tools.'
      };
      // 【新增】详细握手日志：记录客户端 UA、协议版本、能力声明，便于排查
      info('mcp initialize handshake', {
        remote: getClientIp(req),
        ua: req.headers['user-agent'] || '',
        client_protocol_version: clientVersion || null,
        negotiated_protocol_version: negotiated,
        client_capabilities: (rpcReq.params || {}).capabilities || null,
        session_id: newSessionId,
      });
    } else if (rpcMethod === 'notifications/initialized' && isNotification) {
      // 通知消息：HTTP 返回 202 Accepted（无 body），不抛错，不断开
      // 这是 Codex 等客户端标准握手第三步
      res.writeHead(202, {
        'Content-Type': 'application/json',
      });
      res.end();
      logAccess({ conn: connId, method: 'POST', path: '/mcp', status: 202, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: rpcMethod });
      return;
    } else {
      // 统一路由：tools/* / ping / resources/* / prompts/* 桩 / 未知方法
      // handleRpcMethod 对未知方法抛 RPC 错误（METHOD_NOT_FOUND）
      try {
        result = await handleRpcMethod(rpcReq);
      } catch (e) {
        // 区分 JSON-RPC 错误（保留原始 code/message）和内部异常
        if (typeof e?.code === 'number' && typeof e?.message === 'string') {
          errOut = e;
          httpStatus = 400;
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    errOut = codeError(CODES.INTERNAL, e.message);
    httpStatus = 500;
  }

  // 通知消息无 id 时不响应 body
  if (isNotification && rpcMethod !== 'notifications/initialized') {
    res.writeHead(204);
    res.end();
    logAccess({ conn: connId, method: 'POST', path: '/mcp', status: 204, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: rpcMethod });
    return;
  }

  const response = { jsonrpc: '2.0', id: rpcReq.id };
  if (errOut) response.error = errOut;
  else response.result = result;

  const headers = { 'Content-Type': 'application/json' };
  // 仅 initialize 响应携带 Mcp-Session-Id（Streamable HTTP 规范）
  if (newSessionId) {
    headers['Mcp-Session-Id'] = newSessionId;
  }

  res.writeHead(httpStatus, headers);
  res.end(JSON.stringify(response));
  logAccess({ conn: connId, method: 'POST', path: '/mcp', status: httpStatus, durMs: Date.now() - start, remote: getClientIp(req), ua: req.headers['user-agent'] || '', rpc: rpcMethod });
}

// ============================================================================
// GET /mcp 入口
//
// 【问题原因】原实现无论客户端 Accept 头是什么，都直接返回 SSE 长连接。
// 浏览器默认 GET（如在地址栏访问 http://127.0.0.1:37991/mcp）会一直挂起，
// 表现为"超时"。但 Streamable HTTP 规范的 GET 用于服务端推送（server→client
// notifications / requests），仅在客户端明确声明 Accept: text/event-stream
// 时才有意义。
//
// 【修复逻辑】按 Accept 头分流：
//   - 客户端 Accept 包含 text/event-stream → 走 SSE 长连接（规范用法）
//   - 其他（浏览器默认 / curl 无 Accept）→ 返回 JSON 状态页，即时关闭
//
// 这样浏览器 / 健康探测 / 监控脚本访问 /mcp 不再超时，SSE 通道仍对 MCP
// 客户端可用。
// ============================================================================
function handleMcpGET(req, res) {
  const accept = String(req.headers.accept || '').toLowerCase();
  const wantsSse = accept.includes('text/event-stream');

  if (!wantsSse) {
    // 浏览器 / 探测请求：返回 JSON 状态页，避免挂起
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      name: 'synkord-mcp',
      version: '0.1.0',
      transport: 'streamable-http',
      instructions: {
        initialize: 'POST /mcp with method=initialize',
        rpc: 'POST /mcp with method=<rpc_method>',
        sse: 'GET /mcp with Accept: text/event-stream (for server-initiated messages)',
      },
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        logging: {}
      }
    }, null, 2));
    return;
  }

  // 客户端明确要 SSE：走 Streamable HTTP 长连接通道
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
