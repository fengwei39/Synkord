/**
 * Synkord Local MCP Service
 *
 * 支持两种模式：
 * - stdio: 通过标准输入/输出进行 JSON-RPC 通信（默认，用于 Codex/CLI）
 * - http: 启动 HTTP 服务器监听请求（用于 IDE 代理）
 *
 * 无需 Token：MCP 服务内部调用后端时使用当前登录用户身份
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

// ============================================================================
// 命令行参数解析
// ============================================================================

function parseArgs(argv) {
  const out = { mode: 'stdio' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode' && argv[i + 1]) {
      out.mode = argv[++i];
    } else if (arg === '--synkord-home' && argv[i + 1]) {
      out.synkordHome = argv[++i];
    } else if (arg === '--port' && argv[i + 1]) {
      out.port = parseInt(argv[++i], 10);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// ============================================================================
// 配置
// ============================================================================

const synkordHome = args.synkordHome || process.env.SYNKORD_HOME || path.join(os.homedir(), '.synkord');
const activeContextPath = path.join(synkordHome, 'active-context.json');
const userAuthPath = path.join(synkordHome, 'user-auth.json');
const POLL_INTERVAL_MS = 5000;

const httpPort = args.port || Number(process.env.SYNKORD_LOCAL_MCP_PORT || 37991);
const httpPath = '/mcp';

let apiBase = process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000/api';

const defaultTools = [
  'get_project_entities',
  'get_project_apis',
  'get_entity_dependencies',
  'get_api_dependencies',
  'validate_entity_usage',
];

// ============================================================================
// 激活上下文 + 用户认证管理
// ============================================================================

let activeProject = null; // { teamId, projectId, projectName, synkord_core_url, updated_at }
let userAuth = null;       // { token, user_id, user_name, updated_at }
let lastUpdatedAt = null;

function readActiveContext() {
  try {
    if (!fs.existsSync(activeContextPath)) {
      return false;
    }
    const raw = fs.readFileSync(activeContextPath, 'utf8');
    const data = JSON.parse(raw);
    if (data?.updated_at && data.updated_at === lastUpdatedAt) {
      return false;
    }
    lastUpdatedAt = data.updated_at || null;
    if (data.synkord_core_url) {
      apiBase = data.synkord_core_url;
    }
    if (data.team_id && data.project_id) {
      activeProject = {
        teamId: data.team_id,
        projectId: data.project_id,
        projectName: data.project_name || '',
      };
    } else {
      activeProject = null;
    }
    return true;
  } catch (e) {
    console.error('[local-mcp] failed to read active-context', e);
    return false;
  }
}

// 读取当前登录用户的认证信息
function readUserAuth() {
  try {
    if (!fs.existsSync(userAuthPath)) {
      userAuth = null;
      return false;
    }
    const raw = fs.readFileSync(userAuthPath, 'utf8');
    userAuth = JSON.parse(raw);
    return true;
  } catch (e) {
    console.error('[local-mcp] failed to read user-auth', e);
    userAuth = null;
    return false;
  }
}

// 启动时读取一次
readActiveContext();
readUserAuth();

// ============================================================================
// MCP 核心业务逻辑
// ============================================================================

/**
 * 获取工具列表
 */
async function getTools() {
  return defaultTools;
}

/**
 * 调用后端 API（携带当前用户 JWT）
 */
async function backendPOST(pathname, payload) {
  if (!userAuth?.token) {
    throw new Error('用户未登录：请先在 Synkord 主程序中登录');
  }
  const resp = await fetch(`${apiBase}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userAuth.token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.detail || `backend request failed: ${resp.status}`);
  }
  return data;
}

/**
 * 报告审计日志
 */
async function reportAudit(tool, args, resultStatus, errorMessage) {
  const payload = {
    team_id: activeProject?.teamId,
    project_id: activeProject?.projectId,
    tool_name: tool,
    caller: 'local-mcp',
    params_summary: summarizeArgs(args),
    result_status: resultStatus,
    error_message: errorMessage || '',
  };
  try {
    await backendPOST('/mcp/audit', payload);
  } catch (e) {
    console.error('[local-mcp] audit report failed:', e.message);
  }
}

/**
 * 参数脱敏摘要
 */
function summarizeArgs(args) {
  if (!args || typeof args !== 'object') return '{}';
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'code_snippet' && typeof v === 'string') {
      out[k] = `<string len=${v.length} preview="${v.slice(0, 32).replace(/\n/g, ' ')}...">`;
    } else {
      out[k] = v;
    }
  }
  return JSON.stringify(out).slice(0, 480);
}

/**
 * 工具描述符
 */
function toolDescriptor(name) {
  return {
    name,
    description: `Synkord 当前激活项目工具：${name}`,
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {},
    },
  };
}

// ============================================================================
// STDIO 模式 (MCP Protocol)
// ============================================================================

async function handleStdioMessage(id, method, params) {
  switch (method) {
    case 'initialize': {
      return {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'synkord-local-mcp', version: '0.3.0' },
        capabilities: { tools: {} },
      };
    }

    case 'notifications/initialized': {
      return null;
    }

    case 'tools/list': {
      const tools = await getTools();
      return { tools: tools.map(toolDescriptor) };
    }

    case 'tools/call': {
      const name = params?.name;
      const toolArgs = params?.arguments || {};

      if (!activeProject?.teamId || !activeProject?.projectId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Synkord MCP active project is not configured' }) }],
          isError: true,
        };
      }

      if (!userAuth?.token) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: '用户未登录：请先在 Synkord 主程序中登录' }) }],
          isError: true,
        };
      }

      let result, errorMessage = null;
      try {
        const data = await backendPOST('/mcp/query', {
          team_id: activeProject.teamId,
          project_id: activeProject.projectId,
          tool: name,
          args: toolArgs,
        });
        result = data.result;
      } catch (e) {
        errorMessage = e.message;
        reportAudit(name, toolArgs, 'error', errorMessage).catch(() => undefined);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
          isError: true,
        };
      }

      reportAudit(name, toolArgs, 'ok').catch(() => undefined);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}

function startStdioMode() {
  console.error('[local-mcp] Started in stdio mode');

  let rawBuffer = '';

  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
  }
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (chunk) => {
    rawBuffer += chunk;
    const lines = rawBuffer.split('\n');
    rawBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const request = JSON.parse(trimmed);
        await processStdioRequest(request);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        console.error('[local-mcp] stdio error:', e.message);
        sendStdioResponse(null, null, { code: -32603, message: e.message });
      }
    }
  });

  process.stdin.on('end', () => {
    console.error('[local-mcp] stdin closed, exiting');
    process.exit(0);
  });

  process.stdin.on('error', (e) => {
    console.error('[local-mcp] stdin error:', e.message);
    process.exit(1);
  });
}

async function processStdioRequest(request) {
  const id = request.id;
  const method = request.method;
  const params = request.params;
  try {
    const result = await handleStdioMessage(id, method, params);
    sendStdioResponse(id, result, null);
  } catch (e) {
    sendStdioResponse(id, null, { code: getErrorCode(e), message: e.message });
  }
}

function sendStdioResponse(id, result, error) {
  const response = { jsonrpc: '2.0', id };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  const output = JSON.stringify(response) + '\n';
  process.stdout.write(output);
}

function getErrorCode(e) {
  if (e.message.includes('Unsupported method')) return -32601;
  if (e.message.includes('not configured')) return -32001;
  if (e.message.includes('required')) return -32002;
  return -32603;
}

// ============================================================================
// HTTP 模式
// ============================================================================

function startHttpMode() {
  console.error(`[local-mcp] Started in http mode, listening on http://127.0.0.1:${httpPort}`);

  // 定期轮询 active-context.json 和 user-auth.json
  setInterval(() => {
    if (readActiveContext()) {
      console.log('[local-mcp] active context updated:', activeProject ? `${activeProject.teamId}/${activeProject.projectId}` : 'none');
    }
    readUserAuth();
  }, POLL_INTERVAL_MS).unref();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        writeJSON(res, 200, {
          status: 'ok',
          activeProject,
          user: userAuth ? { user_id: userAuth.user_id, user_name: userAuth.user_name } : null,
        });
        return;
      }

      if (req.method === 'POST' && req.url === httpPath) {
        await handleHttpRequest(req, res);
        return;
      }

      if (req.method === 'GET' && req.url === httpPath) {
        handleHttpStream(req, res);
        return;
      }

      writeJSON(res, 404, { error: 'not found' });
    } catch (error) {
      console.error('[local-mcp] http error:', error);
      writeJSON(res, 500, jsonRPCError(null, -32603, error.message || 'internal error'));
    }
  });

  server.listen(httpPort, '127.0.0.1', () => {
    console.error(`[local-mcp] http server ready on port ${httpPort}`);
    if (process.send) {
      process.send({ type: 'ready', port: httpPort });
    }
  });

  server.on('error', (error) => {
    console.error('[local-mcp] http server error:', error.message);
    if (process.send) {
      process.send({ type: 'error', error: error.message });
    }
  });

  process.on('message', (message) => {
    if (message?.type === 'shutdown') {
      console.error('[local-mcp] received shutdown signal');
      server.close(() => process.exit(0));
    }
    if (message?.type === 'set-active-project') {
      activeProject = message.project || null;
      lastUpdatedAt = null;
      readActiveContext();
    }
    if (message?.type === 'set-user-auth') {
      userAuth = message.auth || null;
    }
  });
}

async function handleHttpRequest(req, res) {
  const body = await readJSON(req);
  const id = body?.id ?? null;
  const method = body?.method;
  const params = body?.params || {};

  if (!activeProject?.teamId || !activeProject?.projectId) {
    writeJSON(res, 200, jsonRPCError(id, -32001, 'Synkord MCP active project is not configured'));
    return;
  }
  if (!userAuth?.token) {
    writeJSON(res, 200, jsonRPCError(id, -32002, '用户未登录'));
    return;
  }

  try {
    let result;

    if (method === 'initialize') {
      result = {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'synkord-local-mcp', version: '0.3.0' },
        capabilities: { tools: {} },
      };
    } else if (method === 'notifications/initialized') {
      result = {};
    } else if (method === 'tools/list') {
      const tools = await getTools();
      result = { tools: tools.map(toolDescriptor) };
    } else if (method === 'tools/call') {
      const name = params?.name;
      const toolArgs = params?.arguments || {};

      let data, errorMessage = null;
      try {
        data = await backendPOST('/mcp/query', {
          team_id: activeProject.teamId,
          project_id: activeProject.projectId,
          tool: name,
          args: toolArgs,
        });
      } catch (e) {
        errorMessage = e.message;
        reportAudit(name, toolArgs, 'error', errorMessage).catch(() => undefined);
        writeJSON(res, 200, {
          jsonrpc: '2.0', id,
          error: { code: -32003, message: errorMessage },
        });
        return;
      }

      reportAudit(name, toolArgs, 'ok').catch(() => undefined);
      result = { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } else {
      writeJSON(res, 200, jsonRPCError(id, -32601, `Unsupported method: ${method}`));
      return;
    }

    writeJSON(res, 200, { jsonrpc: '2.0', id, result });
  } catch (e) {
    writeJSON(res, 200, jsonRPCError(id, -32603, e.message));
  }
}

function handleHttpStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('event: message\ndata: {}\n\n');
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 30000);
  req.on('close', () => clearInterval(keepAlive));
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function writeJSON(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

function jsonRPCError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ============================================================================
// 主入口
// ============================================================================

function main() {
  const mode = args.mode || 'stdio';

  if (mode === 'stdio' || mode === 'both') {
    if (mode === 'both') {
      setInterval(() => {
        if (readActiveContext()) {
          console.error('[local-mcp] active context updated:', activeProject ? `${activeProject.teamId}/${activeProject.projectId}` : 'none');
        }
        readUserAuth();
      }, POLL_INTERVAL_MS).unref();
    }

    process.on('message', (message) => {
      if (message?.type === 'set-active-project') {
        activeProject = message.project || null;
        lastUpdatedAt = null;
        readActiveContext();
      }
      if (message?.type === 'set-user-auth') {
        userAuth = message.auth || null;
      }
      if (message?.type === 'shutdown') {
        console.error('[local-mcp] received shutdown signal');
        process.exit(0);
      }
    });

    startStdioMode();
  }

  if (mode === 'http' || mode === 'both') {
    startHttpMode();
  }

  if (process.send && mode !== 'stdio') {
    process.send({ type: 'ready', mode, port: httpPort });
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, readActiveContext, readUserAuth, main };
