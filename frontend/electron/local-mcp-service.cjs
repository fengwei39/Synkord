const fs = require('fs');
const http = require('http');
const path = require('path');

// 解析 --synkord-home <path> 命令行参数；回退到 ~/.synkord
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--synkord-home' && argv[i + 1]) {
      out.synkordHome = argv[i + 1];
      i++;
    }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const synkordHome = args.synkordHome || process.env.SYNKORD_HOME || path.join(require('os').homedir(), '.synkord');
const activeContextPath = path.join(synkordHome, 'active-context.json');
const POLL_INTERVAL_MS = 5000;

const port = Number(process.env.SYNKORD_LOCAL_MCP_PORT || 37991);
const mcpPath = '/mcp';
// apiBase 来自 active-context.json 的 synkord_core_url；启动时可能还没有，先用 env 兜底
let apiBase = process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000/api';

const defaultTools = [
  'get_project_entities',
  'get_project_apis',
  'get_entity_dependencies',
  'get_api_dependencies',
  'validate_entity_usage',
];

let activeProject = null; // { teamId, projectId, projectName, synkord_core_url, updated_at }
let lastUpdatedAt = null;

// 从 active-context.json 读取最新上下文；若文件不存在或解析失败则保持现状
function readActiveContext() {
  try {
    if (!fs.existsSync(activeContextPath)) {
      return false;
    }
    const raw = fs.readFileSync(activeContextPath, 'utf8');
    const data = JSON.parse(raw);
    if (data?.updated_at && data.updated_at === lastUpdatedAt) {
      return false; // 未变化，跳过
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

// 启动时立刻读一次，之后每 5 秒轮询
readActiveContext();
setInterval(() => {
  if (readActiveContext()) {
    console.log('[local-mcp] active context updated:', activeProject ? `${activeProject.teamId}/${activeProject.projectId}` : 'none');
  }
}, POLL_INTERVAL_MS).unref();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      writeJSON(res, 200, { status: 'ok', activeProject });
      return;
    }
    if (req.method !== 'POST' || req.url !== mcpPath) {
      writeJSON(res, 404, { error: 'not found' });
      return;
    }

    const body = await readJSON(req);
    const result = await handleMCPJSONRPC(req, body);
    writeJSON(res, 200, result);
  } catch (error) {
    writeJSON(res, 500, jsonRPCError(null, -32603, error.message || 'internal error'));
  }
});

server.listen(port, '127.0.0.1', () => {
  process.send?.({ type: 'ready', port });
});

server.on('error', (error) => {
  process.send?.({ type: 'error', error: error.message });
});

process.on('message', (message) => {
  if (message?.type === 'set-active-project') {
    activeProject = message.project || null;
  }
  if (message?.type === 'shutdown') {
    server.close(() => process.exit(0));
  }
});

async function handleMCPJSONRPC(req, body) {
  const id = body?.id ?? null;
  if (!activeProject?.teamId || !activeProject?.projectId) {
    return jsonRPCError(id, -32001, 'Synkord MCP active project is not configured');
  }

  if (body?.method === 'initialize') {
    return jsonRPCResult(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'synkord-local-mcp', version: '0.1.0' },
      capabilities: { tools: {} },
    });
  }
  if (body?.method === 'notifications/initialized') {
    return jsonRPCResult(id, {});
  }
  if (body?.method === 'tools/list') {
    const token = bearerToken(req);
    let tools = defaultTools;
    if (token) {
      const intro = await backendPOST('/mcp/introspect', {
        token,
        team_id: activeProject.teamId,
        project_id: activeProject.projectId,
      });
      tools = intro.tool_scope || defaultTools;
    }
    return jsonRPCResult(id, { tools: tools.map(toolDescriptor) });
  }
  if (body?.method === 'tools/call') {
    const token = bearerToken(req);
    if (!token) {
      return jsonRPCError(id, -32002, 'SYNKORD_MCP_TOKEN is required');
    }
    const name = body?.params?.name;
    const args = body?.params?.arguments || {};
    let result, errorMessage = null;
    try {
      const data = await backendPOST('/mcp/query', {
        token,
        team_id: activeProject.teamId,
        project_id: activeProject.projectId,
        tool: name,
        args,
      });
      result = data.result;
    } catch (e) {
      errorMessage = e.message;
      // 上报审计：调用失败
      reportAudit(token, name, args, 'error', errorMessage).catch(() => undefined);
      return jsonRPCError(id, -32003, errorMessage);
    }
    // 上报审计：调用成功
    reportAudit(token, name, args, 'ok').catch(() => undefined);
    return jsonRPCResult(id, {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    });
  }
  return jsonRPCError(id, -32601, `Unsupported MCP method: ${body?.method || ''}`);
}

async function backendPOST(pathname, payload) {
  const resp = await fetch(`${apiBase}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.detail || `backend request failed: ${resp.status}`);
  }
  return data;
}

// 报告 MCP 调用审计；不阻塞主流程
async function reportAudit(token, tool, args, resultStatus, errorMessage) {
  const payload = {
    token,
    team_id: activeProject?.teamId,
    project_id: activeProject?.projectId,
    tool,
    args_summary: summarizeArgs(args),
    result_status: resultStatus,
    called_at: new Date().toISOString(),
  };
  if (errorMessage) {
    payload.error = { code: 'tool_call_failed', message: String(errorMessage).slice(0, 480) };
  }
  try {
    await backendPOST('/mcp/audit', payload);
  } catch (e) {
    console.error('[local-mcp] audit report failed:', e.message);
  }
}

// 参数脱敏摘要：去掉 code_snippet 全文，只保留长度与首尾字符
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
  });
  res.end(JSON.stringify(body));
}

function bearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function jsonRPCResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRPCError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

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
