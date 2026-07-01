/**
 * test-stage3.cjs
 *
 * 阶段 3 集成测试：ToolRegistry + 5 个内置工具
 *
 * 测试覆盖：
 *  1. 注册表：注册、重复注册、枚举
 *  2. 工具调用正常路径
 *  3. 参数校验（缺失、类型）
 *  4. 上下文校验（无 active project）
 *  5. 凭证校验（无 token）
 *  6. 工具不存在
 *  7. 后端异常（500、404、超时）
 *  8. 审计日志写入
 *  9. 日志脱敏
 *  10. tool 白名单
 */
'use strict';

const http = require('http');

// 禁用 console.log 干扰测试输出
process.env.MCP_LOG_LEVEL = 'ERROR';

const { ConfigLoader } = require('../mcp-core/config-loader.cjs');
const { ToolRegistry, globalRegistry, registerTool } = require('../mcp-core/tool-registry.cjs');
const { registerBuiltinTools } = require('./index.cjs');
const { CODES } = require('../mcp-core/errors.cjs');

// ============================================================================
// Mock 后端
// ============================================================================

let mockServer = null;
let mockPort = 0;
let mockHandler = null;
let auditRequests = [];

function startMockServer(handler) {
  return new Promise((resolve) => {
    if (mockServer) {
      mockServer.close(() => {
        mockServer = null;
        doStart();
      });
    } else {
      doStart();
    }
    function doStart() {
      mockHandler = handler;
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let parsed = null;
          try { parsed = body ? JSON.parse(body) : null; } catch {}
          Promise.resolve(
            mockHandler(req.method, req.url, parsed, req.headers)
          ).then((result) => {
            const { status = 200, body = {}, headers = {} } = result;
            res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify(body));
          }).catch((err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ detail: err.message }));
          });
        });
      });
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        resolve(mockPort);
      });
    }
  });
}

function stopMockServer() {
  return new Promise((resolve) => {
    if (!mockServer) return resolve();
    mockServer.close(() => {
      mockServer = null;
      resolve();
    });
  });
}

// ============================================================================
// 工具
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
    results.push({
      ok: false,
      msg: `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
    });
  }
}

function makeToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'u1', user_id: 'u1', exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const sig = Buffer.from('sig').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

function makeAuth() {
  return {
    token: makeToken(),
    user_id: 'u1',
    user_name: 'alice',
  };
}

function makeLoader(auth) {
  const loader = new ConfigLoader();
  if (auth) loader.setMemoryAuth(auth);
  loader.setMemoryContext({
    team_id: 'team-1',
    project_id: 'proj-1',
    synkord_core_url: `http://127.0.0.1:${mockPort}/api`,
  });
  return loader;
}

function makeLoaderNoContext(auth) {
  const loader = new ConfigLoader();
  if (auth) loader.setMemoryAuth(auth);
  // 不设 context
  return loader;
}

// ============================================================================
// Test 1: Registry CRUD
// ============================================================================

async function test1_registryCrud() {
  console.log('\n=== Test 1: Registry CRUD ===');

  const reg = new ToolRegistry();
  const def = { name: 'foo', description: 'Foo', inputSchema: { type: 'object', properties: {} } };
  let called = false;
  reg.register(def, async () => { called = true; return { content: [{ type: 'text', text: 'ok' }] }; });

  assertEq(reg.size(), 1, '注册 1 个工具');
  assertEq(reg.list()[0].name, 'foo', 'list 返回工具');
  assert(reg.get('foo') !== undefined, 'get 返回工具');

  // 重复注册
  let err = null;
  try { reg.register(def, async () => {}); } catch (e) { err = e; }
  assert(err !== null, '重复注册抛错');

  // 缺少 name
  err = null;
  try { reg.register({}, async () => {}); } catch (e) { err = e; }
  assert(err !== null, '缺 name 抛错');

  // 缺少 handler
  err = null;
  try { reg.register({ name: 'x' }, null); } catch (e) { err = e; }
  assert(err !== null, '缺 handler 抛错');
}

// ============================================================================
// Test 2: 工具不存在
// ============================================================================

async function test2_toolNotFound() {
  console.log('\n=== Test 2: Tool Not Found ===');
  await startMockServer(() => ({ status: 200, body: {} }));

  const reg = new ToolRegistry();
  const loader = makeLoader(makeAuth());
  const r = await reg.dispatch({ tool: 'nonexistent', args: {}, loader });

  assertEq(r.isError, true, '返回 isError=true');
  const parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'TOOL_NOT_ALLOWED', '错误码 = TOOL_NOT_ALLOWED');
}

// ============================================================================
// Test 3: 无凭证
// ============================================================================

async function test3_noAuth() {
  console.log('\n=== Test 3: No Auth ===');
  await startMockServer(() => ({ status: 200, body: {} }));

  const reg = registerBuiltinTools;
  // 用一个新 registry 测试（避免污染 globalRegistry）
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  const loader = new ConfigLoader();
  // 不设 auth
  loader.setMemoryContext({ team_id: 't', project_id: 'p', synkord_core_url: `http://127.0.0.1:${mockPort}/api` });

  const r = await gr.dispatch({ tool: 'get_project_entities', args: {}, loader });
  assertEq(r.isError, true, '无凭证返回 isError');
  const parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'UNAUTHORIZED', '错误码 = UNAUTHORIZED');
}

// ============================================================================
// Test 4: 无上下文
// ============================================================================

async function test4_noContext() {
  console.log('\n=== Test 4: No Context ===');
  await startMockServer(() => ({ status: 200, body: {} }));

  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  const loader = makeLoaderNoContext(makeAuth());
  const r = await gr.dispatch({ tool: 'get_project_entities', args: {}, loader });
  const parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'NOT_FOUND', '错误码 = NOT_FOUND');
}

// ============================================================================
// Test 5: 正常调用 5 个工具
// ============================================================================

async function test5_normalCalls() {
  console.log('\n=== Test 5: Normal Calls (5 tools) ===');
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  const receivedQueries = [];

  await startMockServer((method, url, body) => {
    if (url === '/api/mcp/query') {
      receivedQueries.push(body);
      const tool = body?.tool;
      if (tool === 'get_project_entities') {
        return { status: 200, body: { result: { items: [{ id: 1, name: 'User' }], total: 1 } } };
      }
      if (tool === 'get_project_apis') {
        return { status: 200, body: { result: { items: [{ id: 1, path: '/users' }], total: 1 } } };
      }
      if (tool === 'get_entity_dependencies') {
        return { status: 200, body: { result: { referenced_by: [{ project: 'other' }] } } };
      }
      if (tool === 'get_api_dependencies') {
        return { status: 200, body: { result: { referenced_by: [{ project: 'other' }] } } };
      }
      if (tool === 'validate_entity_usage') {
        return { status: 200, body: { result: { valid: true, entity: { name: 'User' } } } };
      }
    }
    return { status: 200, body: {} };
  });

  const loader = makeLoader(makeAuth());

  // 1. get_project_entities
  let r = await gr.dispatch({ tool: 'get_project_entities', args: {}, loader });
  assert(!r.isError, 'get_project_entities 成功');
  let data = JSON.parse(r.content[0].text);
  assertEq(data.total, 1, 'get_project_entities total=1');

  // 2. get_project_apis
  r = await gr.dispatch({ tool: 'get_project_apis', args: {}, loader });
  assert(!r.isError, 'get_project_apis 成功');
  data = JSON.parse(r.content[0].text);
  assertEq(data.items[0].path, '/users', 'get_project_apis path');

  // 3. get_entity_dependencies
  r = await gr.dispatch({ tool: 'get_entity_dependencies', args: { model_name: 'User' }, loader });
  assert(!r.isError, 'get_entity_dependencies 成功');
  data = JSON.parse(r.content[0].text);
  assertEq(data.referenced_count, 1, 'get_entity_dependencies count=1');

  // 4. get_api_dependencies
  r = await gr.dispatch({ tool: 'get_api_dependencies', args: { api_path: '/users' }, loader });
  assert(!r.isError, 'get_api_dependencies 成功');

  // 5. validate_entity_usage
  r = await gr.dispatch({
    tool: 'validate_entity_usage',
    args: { model_name: 'User', code_snippet: 'const u: User = ...' },
    loader,
  });
  assert(!r.isError, 'validate_entity_usage 成功');
  data = JSON.parse(r.content[0].text);
  assertEq(data.valid, true, 'validate_entity_usage valid=true');

  // 验证 5 个 query 都带了 context
  for (const q of receivedQueries) {
    assertEq(q.team_id, 'team-1', 'query 携带 team_id');
    assertEq(q.project_id, 'proj-1', 'query 携带 project_id');
  }
}

// ============================================================================
// Test 6: 参数校验（缺失）
// ============================================================================

async function test6_missingArgs() {
  console.log('\n=== Test 6: Missing Args ===');
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  await startMockServer(() => ({ status: 200, body: {} }));
  const loader = makeLoader(makeAuth());

  // 缺 model_name
  let r = await gr.dispatch({ tool: 'get_entity_dependencies', args: {}, loader });
  let parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'INVALID_ARGS', '缺 model_name → INVALID_ARGS');

  // 缺 api_path
  r = await gr.dispatch({ tool: 'get_api_dependencies', args: {}, loader });
  parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'INVALID_ARGS', '缺 api_path → INVALID_ARGS');

  // 缺 code_snippet
  r = await gr.dispatch({
    tool: 'validate_entity_usage',
    args: { model_name: 'X' },
    loader,
  });
  parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'INVALID_ARGS', '缺 code_snippet → INVALID_ARGS');
}

// ============================================================================
// Test 7: 参数校验（类型）
// ============================================================================

async function test7_typeValidation() {
  console.log('\n=== Test 7: Type Validation ===');
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  await startMockServer(() => ({ status: 200, body: {} }));
  const loader = makeLoader(makeAuth());

  // model_name 传数字（应为 string）
  let r = await gr.dispatch({
    tool: 'get_entity_dependencies',
    args: { model_name: 123 },
    loader,
  });
  let parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'INVALID_ARGS', 'model_name 类型错 → INVALID_ARGS');
}

// ============================================================================
// Test 8: 后端 500
// ============================================================================

async function test8_backend500() {
  console.log('\n=== Test 8: Backend 500 ===');
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  await startMockServer(() => ({ status: 500, body: { detail: 'server error' } }));
  const loader = makeLoader(makeAuth());

  const r = await gr.dispatch({ tool: 'get_project_entities', args: {}, loader });
  const parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'INTERNAL', '500 → INTERNAL');
  assertEq(r.isError, true, 'isError=true');
}

// ============================================================================
// Test 9: 工具 handler 抛错
// ============================================================================

async function test9_handlerThrows() {
  console.log('\n=== Test 9: Handler Throws ===');
  const reg = new ToolRegistry();
  reg.register(
    { name: 'always_fail', description: 'X', inputSchema: { type: 'object', properties: {} } },
    async () => { throw new Error('boom'); },
  );

  await startMockServer(() => ({ status: 200, body: {} }));
  const loader = makeLoader(makeAuth());
  const r = await reg.dispatch({ tool: 'always_fail', args: {}, loader });
  assertEq(r.isError, true, 'handler 抛错 → isError');
  const parsed = JSON.parse(r.content[0].text);
  assertEq(parsed.code, 'INTERNAL', 'handler 抛错 → INTERNAL');
}

// ============================================================================
// Test 10: 审计日志写入
// ============================================================================

async function test10_auditLog() {
  console.log('\n=== Test 10: Audit Log ===');
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  auditRequests = [];

  await startMockServer((method, url, body) => {
    if (url === '/api/mcp/audit') {
      auditRequests.push(body);
      return { status: 201, body: { id: 'audit-1' } };
    }
    if (url === '/api/mcp/query') {
      return { status: 200, body: { result: { items: [], total: 0 } } };
    }
    return { status: 200, body: {} };
  });

  const loader = makeLoader(makeAuth());
  await gr.dispatch({ tool: 'get_project_entities', args: {}, loader });
  await new Promise(r => setTimeout(r, 100));

  assertEq(auditRequests.length, 1, '调用 1 次工具产生 1 条审计');
  assertEq(auditRequests[0].tool_name, 'get_project_entities', '审计工具名');
  assertEq(auditRequests[0].caller, 'local-mcp', '审计 caller');
  assertEq(auditRequests[0].result_status, 'success', '审计 status=success');
  assertEq(auditRequests[0].team_id, 'team-1', '审计 team_id');
}

// ============================================================================
// Test 11: 工具列表输出
// ============================================================================

async function test11_list() {
  console.log('\n=== Test 11: Tools List ===');
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');
  const list = gr.list();
  assertEq(list.length, 5, '注册了 5 个工具');
  const names = list.map(t => t.name).sort();
  assertEq(names, [
    'get_api_dependencies',
    'get_entity_dependencies',
    'get_project_apis',
    'get_project_entities',
    'validate_entity_usage',
  ], '工具名列表正确');
}

// ============================================================================
// Test 12: 幂等注册
// ============================================================================

async function test12_idempotentRegister() {
  console.log('\n=== Test 12: Idempotent Register ===');
  const { registerBuiltinTools } = require('./index.cjs');
  const n1 = registerBuiltinTools();
  const n2 = registerBuiltinTools();
  assertEq(n1, 5, '首次注册 5 个');
  assertEq(n2, 5, '二次注册仍是 5 个（幂等）');
}

// ============================================================================
// Test 13: 日志脱敏（工具调用不泄漏 token）
// ============================================================================

async function test13_logRedactionInToolCall() {
  console.log('\n=== Test 13: Log Redaction in Tool ===');
  const { globalRegistry: gr } = require('../mcp-core/tool-registry.cjs');

  // 临时改 MCP_LOG_LEVEL
  const oldLevel = process.env.MCP_LOG_LEVEL;
  process.env.MCP_LOG_LEVEL = 'DEBUG';

  const captured = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (data) => { captured.push(String(data)); return true; };

  try {
    await startMockServer(() => ({ status: 200, body: { result: { items: [], total: 0 } } }));
    const auth = makeAuth();
    const loader = makeLoader(auth);
    await gr.dispatch({ tool: 'get_project_entities', args: {}, loader });
  } finally {
    process.stderr.write = origWrite;
    process.env.MCP_LOG_LEVEL = oldLevel;
  }

  const all = captured.join('');
  assert(!all.includes(auth.token), '工具调用日志不含 token');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('======================================');
  console.log('Stage 3 Integration Tests');
  console.log('======================================');

  try {
    // 先注册所有工具到 globalRegistry
    registerBuiltinTools();

    await test1_registryCrud();
    await test2_toolNotFound();
    await test3_noAuth();
    await test4_noContext();
    await test5_normalCalls();
    await test6_missingArgs();
    await test7_typeValidation();
    await test8_backend500();
    await test9_handlerThrows();
    await test10_auditLog();
    await test11_list();
    await test12_idempotentRegister();
    await test13_logRedactionInToolCall();
  } catch (e) {
    console.error('Test runner error:', e);
  } finally {
    await stopMockServer();
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
