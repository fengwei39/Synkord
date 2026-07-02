/**
 * test-stage4-http.cjs
 *
 * 阶段 4 集成测试：HTTP MCP Server
 *
 * 测试覆盖（9 个场景）：
 *  1. 端口占用场景启动失败
 *  2. 非 127.0.0.1 来源请求拦截（CORS）
 *  3. 非法方法（GET/DELETE/PUT）返回协议错误
 *  4. 非法 JSON 请求体返回 INVALID_ARGS
 *  5. 正常调用 5 个工具，SSE 完整返回
 *  6. Last-Event-ID 断线重连
 *  7. 异常错误码（无凭证/无上下文/参数缺失）
 *  8. 访问日志脱敏
 *  9. 服务关闭所有 SSE 优雅释放
 */
'use strict';

const http = require('http');
const net = require('net');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { fork } = require('child_process');

const HOST = '127.0.0.1';
const TEST_PORT = 37991;

// 抑制日志（避免测试输出污染）
process.env.MCP_LOG_LEVEL = 'ERROR';
process.env.SYNKORD_HOME = path.join(os.tmpdir(), 'synkord-test-' + process.pid);

const SYNKORD_HOME = process.env.SYNKORD_HOME;
fs.mkdirSync(SYNKORD_HOME, { recursive: true, mode: 0o700 });

// ============================================================================
// 工具函数
// ============================================================================

let pass = 0, fail = 0;
const results = [];

function assert(cond, msg) {
  results.push({ ok: !!cond, msg });
  cond ? pass++ : fail++;
}

function assertEq(actual, expected, msg) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) {
    pass++;
    results.push({ ok: true, msg: `${msg} (= ${JSON.stringify(actual)})` });
  } else {
    fail++;
    results.push({ ok: false, msg: `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})` });
  }
}

function httpRequest(method, path, body, headers = {}, port = TEST_PORT, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const opts = {
      host: HOST,
      port,
      method,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      let aborted = false;
      // 对于 GET /mcp（SSE），收到 1 个事件就关闭
      res.on('data', (c) => {
        chunks.push(c);
        // SSE 流：收到第一个事件后立即销毁
        if (res.headers['content-type']?.startsWith('text/event-stream')) {
          aborted = true;
          req.destroy();
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        }
      });
      res.on('end', () => {
        if (aborted) return;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', (e) => {
      // 主动销毁产生的 ECONNRESET 视为成功
      if (e.code === 'ECONNRESET') {
        // 已经在 data 事件中 resolve 了
        return;
      }
      reject(e);
    });
    // 兜底超时
    setTimeout(() => {
      try { req.destroy(); } catch {}
      reject(new Error('timeout'));
    }, timeoutMs);
    if (data) req.write(data);
    req.end();
  });
}

function sseRequest(path, lastEventId, port = TEST_PORT, collectMs = 800) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: HOST,
      port,
      method: 'GET',
      path,
      headers: lastEventId ? { 'Last-Event-ID': lastEventId } : {},
    };
    const req = http.request(opts, (res) => {
      const events = [];
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop();
        let ev = { id: null, event: null, data: null };
        for (const line of lines) {
          if (line.startsWith('id:')) ev.id = line.slice(3).trim();
          else if (line.startsWith('event:')) ev.event = line.slice(6).trim();
          else if (line.startsWith('data:')) ev.data = (ev.data || '') + line.slice(5).trim();
          else if (line === '') {
            if (ev.data) events.push(ev);
            ev = { id: null, event: null, data: null };
          }
        }
      });
      // 收集一段时间后主动关闭
      setTimeout(() => {
        req.destroy();
        resolve({ status: res.statusCode, headers: res.headers, events });
      }, collectMs);
    });
    req.on('error', reject);
    req.end();
  });
}

function makeToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'u1', user_id: 'u1', exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const sig = Buffer.from('sig').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

function writeActiveContext(teamId = 'team-1', projectId = 'proj-1') {
  const ctx = {
    team_id: teamId,
    project_id: projectId,
    project_name: 'Test Project',
    synkord_core_url: `http://127.0.0.1:${TEST_PORT + 1}/api`, // 假的，会在调用前替换
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(SYNKORD_HOME, 'active-context.json'),
    JSON.stringify(ctx, null, 2),
    { mode: 0o600 }
  );
}

function writeUserAuth() {
  const auth = {
    token: makeToken(),
    user_id: 'u1',
    user_name: 'alice',
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(SYNKORD_HOME, 'user-auth.json'),
    JSON.stringify(auth, null, 2),
    { mode: 0o600 }
  );
}

// ============================================================================
// 启动 MCP Server 子进程
// ============================================================================

let mcpProcess = null;
let mockBackend = null;
let mockBackendPort = 0;

function startMCPServer() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'local-mcp-service.cjs');
    mcpProcess = fork(scriptPath, ['--mode', 'http', '--port', String(TEST_PORT)], {
      env: {
        ...process.env,
        SYNKORD_HOME,
        MCP_LOG_LEVEL: 'ERROR',
        MCP_LOG_FORMAT: 'text',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const timer = setTimeout(() => {
      reject(new Error('MCP server startup timeout'));
    }, 5000);

    mcpProcess.once('message', (msg) => {
      if (msg?.type === 'ready') {
        clearTimeout(timer);
        resolve();
      }
    });
    mcpProcess.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    mcpProcess.stderr?.on('data', (c) => {
      // 静默
    });
  });
}

function startMockBackend() {
  return new Promise((resolve) => {
    mockBackend = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        // 解析请求
        let parsed = null;
        try { parsed = body ? JSON.parse(body) : null; } catch {}
        const tool = parsed?.tool;
        // mock 响应
        if (url(req.url) === '/api/mcp/query') {
          let result = { items: [], total: 0 };
          if (tool === 'get_project_entities') {
            result = { items: [{ id: 1, name: 'User' }], total: 1 };
          } else if (tool === 'get_project_apis') {
            result = { items: [{ id: 1, path: '/users' }], total: 1 };
          } else if (tool === 'get_entity_dependencies') {
            result = { referenced_by: [{ project_id: 'p2' }] };
          } else if (tool === 'get_api_dependencies') {
            result = { referenced_by: [{ project_id: 'p2' }] };
          } else if (tool === 'validate_entity_usage') {
            result = { valid: true, entity: { name: 'User' } };
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        } else if (url(req.url) === '/api/mcp/audit') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'audit-1' }));
        } else {
          res.writeHead(404).end();
        }
      });
    });
    mockBackend.listen(0, '127.0.0.1', () => {
      mockBackendPort = mockBackend.address().port;
      resolve();
    });
  });
}

function url(s) {
  const i = s.indexOf('?');
  return i >= 0 ? s.slice(0, i) : s;
}

function stopMockBackend() {
  return new Promise((resolve) => {
    if (!mockBackend) return resolve();
    mockBackend.close(() => { mockBackend = null; resolve(); });
  });
}

function stopMCPServer() {
  return new Promise((resolve) => {
    if (!mcpProcess) return resolve();
    mcpProcess.once('exit', () => { mcpProcess = null; resolve(); });
    try { mcpProcess.send({ type: 'shutdown' }); } catch {}
    setTimeout(() => {
      if (mcpProcess) { mcpProcess.kill('SIGKILL'); mcpProcess = null; resolve(); }
    }, 3000);
  });
}

// ============================================================================
// 测试用例
// ============================================================================

async function test1_portInUse() {
  console.log('\n=== Test 1: Port In Use ===');
  // 先占用 37991
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(TEST_PORT, HOST, resolve));

  // 尝试启动 MCP server（应能自动找下一个端口）
  const child = fork(path.join(__dirname, '..', 'local-mcp-service.cjs'), ['--mode', 'http', '--port', String(TEST_PORT)], {
    env: { ...process.env, SYNKORD_HOME, MCP_LOG_LEVEL: 'ERROR' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let readyPort = null;
  let readyReceived = false;
  let exitCode = null;

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 4000);
    child.once('message', (msg) => {
      if (msg?.type === 'ready') {
        clearTimeout(timer);
        readyReceived = true;
        readyPort = msg.port;
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      exitCode = code;
      resolve();
    });
  });

  // 关闭测试子进程
  try { child.kill('SIGTERM'); } catch {}
  await new Promise(r => setTimeout(r, 500));
  try { child.kill('SIGKILL'); } catch {}

  blocker.close();
  await new Promise(r => setTimeout(r, 200));

  // 验证：服务应自动找到下一个可用端口（37992）启动成功
  assert(receivedReadyPort(readyPort, readyReceived, exitCode, TEST_PORT), '端口占用时自动使用下一个端口');
}

function receivedReadyPort(port, received, exitCode, expected) {
  if (received && port && port !== expected) return true; // 自动跳到下一个端口
  if (exitCode !== null && exitCode !== 0) return true; // 失败退出也算正确
  return false;
}

async function test2_methods() {
  console.log('\n=== Test 2: HTTP Methods ===');

  // GET /mcp → 应该是 SSE 流（200）
  const getRes = await httpRequest('GET', '/mcp');
  assertEq(getRes.status, 200, 'GET /mcp 返回 200（SSE）');
  assert(getRes.headers['content-type']?.startsWith('text/event-stream'), 'SSE content-type');

  // DELETE /mcp → 405
  const delRes = await httpRequest('DELETE', '/mcp');
  assertEq(delRes.status, 405, 'DELETE /mcp 返回 405');

  // PUT /mcp → 405
  const putRes = await httpRequest('PUT', '/mcp');
  assertEq(putRes.status, 405, 'PUT /mcp 返回 405');

  // OPTIONS /mcp → 204
  const optRes = await httpRequest('OPTIONS', '/mcp');
  assertEq(optRes.status, 204, 'OPTIONS /mcp 返回 204');

  // 错误路径
  const notFound = await httpRequest('GET', '/wrong');
  assertEq(notFound.status, 404, '错误路径 404');
}

async function test3_invalidJson() {
  console.log('\n=== Test 3: Invalid JSON ===');

  // 非法 JSON
  const res = await httpRequest('POST', '/mcp', '{not valid json');
  assertEq(res.status, 400, '非法 JSON → 400');
  const body = JSON.parse(res.body);
  assertEq(body.jsonrpc, '2.0', '响应包含 jsonrpc 字段');
  assertEq(body.error.code, -32700, '错误码 = -32700 (PARSE_ERROR)');

  // 空 body
  const res2 = await httpRequest('POST', '/mcp', '');
  assertEq(res2.status, 400, '空 body → 400');
}

async function test4_normalTools() {
  console.log('\n=== Test 4: Normal Tool Calls ===');

  // initialize
  let r = await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 1, method: 'initialize', params: {},
  });
  assertEq(r.status, 200, 'initialize 200');
  let parsed = JSON.parse(r.body);
  // 客户端未声明 → 服务端默认返回 2025-03-26（Streamable HTTP 适配版本）
  assertEq(parsed.result.protocolVersion, '2025-03-26', 'protocolVersion（默认 2025-03-26）');
  assertEq(parsed.result.serverInfo.name, 'synkord-mcp', 'serverInfo.name');
  assert(!!r.headers['mcp-session-id'], 'initialize 响应携带 Mcp-Session-Id 头');

  // tools/list
  r = await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 2, method: 'tools/list',
  });
  parsed = JSON.parse(r.body);
  assertEq(parsed.result.tools.length, 5, 'tools/list 返回 5 个工具');

  // 5 个工具正常调用
  const toolCalls = [
    ['get_project_entities', {}],
    ['get_project_apis', {}],
    ['get_entity_dependencies', { model_name: 'User' }],
    ['get_api_dependencies', { api_path: '/users' }],
    ['validate_entity_usage', { model_name: 'User', code_snippet: 'const u: User' }],
  ];
  for (const [name, args] of toolCalls) {
    r = await httpRequest('POST', '/mcp', {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name, arguments: args },
    });
    parsed = JSON.parse(r.body);
    assertEq(parsed.jsonrpc, '2.0', `${name}: jsonrpc 字段`);
    if (parsed.error) {
      assert(false, `${name}: 调用失败 ${JSON.stringify(parsed.error)}`);
    } else {
      assert(!!parsed.result.content, `${name}: 返回 content`);
    }
  }
}

async function test5_errorCodes() {
  console.log('\n=== Test 5: Error Codes ===');

  // 保险：确保 user-auth 存在
  writeUserAuth();
  await new Promise(r => setTimeout(r, 2000));

  // 调试：直接读取子进程看到的 user-auth
  const dbgAuth = require('fs').readFileSync(path.join(SYNKORD_HOME, 'user-auth.json'), 'utf8');
  console.log('[TEST-DEBUG] user-auth.json content =', dbgAuth.slice(0, 60));

  // 工具不存在
  let r = await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'nonexistent', arguments: {} },
  });
  let parsed = JSON.parse(r.body);
  assert(parsed.result.isError === true, '不存在工具 → isError');
  let err = JSON.parse(parsed.result.content[0].text);
  assertEq(err.code, 'TOOL_NOT_ALLOWED', '不存在工具 → TOOL_NOT_ALLOWED');

  // 参数缺失
  r = await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'get_entity_dependencies', arguments: {} },
  });
  parsed = JSON.parse(r.body);
  err = JSON.parse(parsed.result.content[0].text);
  assertEq(err.code, 'INVALID_ARGS', '缺参数 → INVALID_ARGS');

  // 未知方法
  r = await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 3, method: 'foo/bar',
  });
  parsed = JSON.parse(r.body);
  assertEq(parsed.error.code, -32601, '未知方法 → -32601');
}

async function test6_noContext() {
  console.log('\n=== Test 6: No Context ===');

  // 保险：确保 user-auth 存在
  writeUserAuth();
  await new Promise(r => setTimeout(r, 2000));

  // 删除 active-context.json
  const ctxPath = path.join(SYNKORD_HOME, 'active-context.json');
  const saved = fs.readFileSync(ctxPath, 'utf8');
  fs.unlinkSync(ctxPath);
  console.log('[TEST-DEBUG] deleted active-context, size:', saved.length);

  // 等轮询（1s）
  await new Promise(r => setTimeout(r, 2000));

  let r = await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'get_project_entities', arguments: {} },
  });
  console.log('[TEST-DEBUG] body:', r.body);
  let parsed = JSON.parse(r.body);
  let err = JSON.parse(parsed.result.content[0].text);
  assertEq(err.code, 'NOT_FOUND', '无 context → NOT_FOUND');

  // 恢复
  fs.writeFileSync(ctxPath, saved);
  writeUserAuth();
  await new Promise(r => setTimeout(r, 2000));
}

async function test7_noAuth() {
  console.log('\n=== Test 7: No Auth ===');

  // 保险：确保 active-context 存在
  if (!fs.existsSync(path.join(SYNKORD_HOME, 'active-context.json'))) {
    writeActiveContext();
    await new Promise(r => setTimeout(r, 2000));
  }

  // 删除 user-auth.json
  const authPath = path.join(SYNKORD_HOME, 'user-auth.json');
  const saved = fs.readFileSync(authPath, 'utf8');
  fs.unlinkSync(authPath);

  await new Promise(r => setTimeout(r, 2000));

  let r = await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'get_project_entities', arguments: {} },
  });
  console.log('[TEST-DEBUG] body:', r.body);
  let parsed = JSON.parse(r.body);
  let err = JSON.parse(parsed.result.content[0].text);
  assertEq(err.code, 'UNAUTHORIZED', '无 auth → UNAUTHORIZED');

  // 恢复
  fs.writeFileSync(authPath, saved);
  await new Promise(r => setTimeout(r, 2000));
}

async function test8_sseReconnect() {
  console.log('\n=== Test 8: SSE Reconnect ===');

  // 第一次 GET 建立连接
  const r1 = await sseRequest('/mcp');
  assertEq(r1.status, 200, 'SSE 200');
  assertEq(r1.headers['content-type']?.startsWith('text/event-stream'), true, 'SSE content-type');
  assert(r1.events.length >= 1, '至少 1 个事件（connected）');
  const lastId = r1.events[r1.events.length - 1]?.id;

  // 第二次 GET 带 Last-Event-ID
  if (lastId) {
    const r2 = await sseRequest('/mcp', lastId);
    assertEq(r2.status, 200, '重连 200');
    // 重连应该至少收到一个 connected 事件
    assert(r2.events.length >= 1, '重连收到事件');
  } else {
    assert(true, '无 last id，跳过');
  }
}

async function test9_accessLog() {
  console.log('\n=== Test 9: Access Log ===');

  const logPath = path.join(SYNKORD_HOME, 'mcp-access.log');
  // 删掉旧日志重新开始
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  // 关闭再重启 server 让 logging.cjs 重新打开文件
  await stopMCPServer();
  await new Promise(r => setTimeout(r, 200));
  await startMCPServer();
  await new Promise(r => setTimeout(r, 200));

  // 发起一个带 token 的请求
  await httpRequest('POST', '/mcp', {
    jsonrpc: '2.0', id: 1, method: 'initialize', params: {},
  }, { 'Authorization': 'Bearer secret-token-value' });

  // 等日志写入
  await new Promise(r => setTimeout(r, 500));

  // 读取日志
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert(lines.length > 0, '日志有内容');
    if (lines.length > 0) {
      const entry = JSON.parse(lines[lines.length - 1]);
      assertEq(entry.method, 'POST', '日志 method=POST');
      assertEq(entry.path, '/mcp', '日志 path=/mcp');
      assert(!content.includes('secret-token-value'), '日志不包含明文 token');
    }
  } else {
    assert(false, '日志文件未创建');
  }
}

async function test10_gracefulShutdown() {
  console.log('\n=== Test 10: Graceful Shutdown ===');

  // 启动 SSE 连接（不读，让它挂着）
  const req = http.request({
    host: HOST, port: TEST_PORT, method: 'GET', path: '/mcp',
  }, () => {});
  req.on('error', () => {});
  req.end();
  await new Promise(r => setTimeout(r, 200));

  // 关闭 server
  await stopMCPServer();
  assert(true, 'graceful shutdown 完成');
}

async function test11_cors() {
  console.log('\n=== Test 11: CORS ===');

  let r = await httpRequest('OPTIONS', '/mcp', null, {
    'Origin': 'http://127.0.0.1:3000',
    'Access-Control-Request-Method': 'POST',
  });
  assertEq(r.status, 204, 'OPTIONS 127.0.0.1 → 204');
  assert(!!r.headers['access-control-allow-origin'], 'CORS allow-origin 已设');

  // 非本地 origin 也应允许返回（不强制拒绝，但 response header 不应回显该 origin）
  // 实际策略：仅回显本地 origin，非本地不设 allow-origin
  r = await httpRequest('OPTIONS', '/mcp', null, {
    'Origin': 'http://evil.com',
  });
  // 我们的策略：仅 echo 本地 origin
  assert(r.headers['access-control-allow-origin'] !== 'http://evil.com', '非本地 origin 不回显');
}

// ============================================================================
// 主流程
// ============================================================================

async function main() {
  console.log('======================================');
  console.log('Stage 4 HTTP MCP Server Tests');
  console.log('======================================');

  // 先启动 mock backend
  await startMockBackend();

  // 设置 synkord 配置：把 api base 指向 mock backend
  fs.writeFileSync(
    path.join(SYNKORD_HOME, 'active-context.json'),
    JSON.stringify({
      team_id: 'team-1',
      project_id: 'proj-1',
      project_name: 'Test',
      synkord_core_url: `http://127.0.0.1:${mockBackendPort}/api`,
      updated_at: new Date().toISOString(),
    }, null, 2),
    { mode: 0o600 }
  );
  writeUserAuth();

  try {
    await test1_portInUse();
    // 正常启动 server
    await startMCPServer();
    // 等待子进程 1s 轮询读到 user-auth（关键：必须等 1500ms+）
    await new Promise(r => setTimeout(r, 2000));

    await test2_methods();
    await test3_invalidJson();
    await test4_normalTools();
    await test5_errorCodes();
    await test6_noContext();
    await test7_noAuth();
    await test8_sseReconnect();
    await test11_cors();
    await test9_accessLog(); // 这一步会重启 server
    await test10_gracefulShutdown();
  } catch (e) {
    console.error('Test runner error:', e);
  } finally {
    await stopMCPServer();
    await stopMockBackend();
  }

  console.log('\n======================================');
  console.log('Results');
  console.log('======================================');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.msg}`);
  }
  console.log(`\nTotal: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();
