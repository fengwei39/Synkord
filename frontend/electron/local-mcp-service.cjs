const http = require('http');

const port = Number(process.env.SYNKORD_LOCAL_MCP_PORT || 37991);
const mcpPath = '/mcp';
const apiBase = process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000/api';

const defaultTools = [
  'get_project_entities',
  'get_project_apis',
  'get_entity_dependencies',
  'get_api_dependencies',
  'validate_entity_usage',
];

let activeProject = null;

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
    const data = await backendPOST('/mcp/query', {
      token,
      team_id: activeProject.teamId,
      project_id: activeProject.projectId,
      tool: name,
      arguments: args,
    });
    return jsonRPCResult(id, {
      content: [{ type: 'text', text: JSON.stringify(data.result, null, 2) }],
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
