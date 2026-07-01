/**
 * test-stage2.cjs
 *
 * 阶段 2 集成测试：Auth 凭证链路 + Backend HTTP 客户端闭环
 * 测试覆盖：
 *  1. Auth 模块：JWT 校验、过期、空值、格式
 *  2. BackendClient：4xx/5xx 错误映射、超时、断网
 *  3. 凭证透传：B 自动挂载
 *  4. 日志脱敏：Token 不出现在日志
 *  5. 端到端：loadUserAuth → callBackend 完整链路
 */
'use strict';

const http = require('http');
const { ConfigLoader } = require('./config-loader.cjs');
const {
  isValidAuth,
  isJwtFormat,
  decodeJwtPayload,
  checkJwtExpiry,
  validateAuth,
  assertValidAuth,
  bearerHeader,
} = require('./auth.cjs');
const { callBackend, callTool, writeAudit } = require('./backend-client.cjs');
const { CODES } = require('./errors.cjs');

// ============================================================================
// Mock 后端服务器
// ============================================================================

let mockServer = null;
let mockPort = 0;
let mockHandler = null;

function startMockServer(handler) {
  return new Promise((resolve) => {
    mockHandler = handler;
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let parsed = null;
        try { parsed = body ? JSON.parse(body) : null; } catch {}
        // 调用 mock handler
        Promise.resolve(
          mockHandler(req.method, req.url, parsed, req.headers)
        ).then((result) => {
          const { status = 200, body = {} } = result;
          res.writeHead(status, { 'Content-Type': 'application/json' });
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
// 测试工具
// ============================================================================

let pass = 0, fail = 0;
const results = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    results.push({ ok: true, msg });
  } else {
    fail++;
    results.push({ ok: false, msg });
  }
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

function makeToken(payload, expOffsetSec = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = {
    sub: payload.user_id || 'u1',
    exp: Math.floor(Date.now() / 1000) + expOffsetSec,
    ...payload,
  };
  const p = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = Buffer.from('mock-signature').toString('base64url');
  return `${header}.${p}.${sig}`;
}

function makeAuth(opts = {}) {
  return {
    token: opts.token || makeToken({ user_id: opts.user_id || 'u1' }),
    user_id: opts.user_id || 'u1',
    user_name: opts.user_name || 'alice',
    updated_at: new Date().toISOString(),
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

// ============================================================================
// 测试 1: Auth 模块
// ============================================================================

async function test1_authModule() {
  console.log('\n=== Test 1: Auth Module ===');

  // 1.1 JWT 格式
  assert(!isJwtFormat(''), '空字符串不是 JWT');
  assert(!isJwtFormat('abc'), '单段不是 JWT');
  assert(!isJwtFormat('a.b'), '两段不是 JWT');
  assert(!isJwtFormat('a.b.c.d'), '四段不是 JWT');
  assert(!isJwtFormat('a.b.!@#'), '非 base64url 不是 JWT');
  assert(isJwtFormat('aaa.bbb.ccc'), '三段 base64url 是 JWT');
  assertEq(isJwtFormat('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'), true, '真实 JWT 格式');

  // 1.2 解析 payload
  const tok = makeToken({ user_id: 'u42' });
  const payload = decodeJwtPayload(tok);
  assertEq(payload.sub, 'u42', '解析 sub 字段');
  assert(typeof payload.exp === 'number', 'exp 是数字');

  // 1.3 过期校验
  const future = makeToken({}, 3600);
  assertEq(checkJwtExpiry(future).valid, true, '未来 1h 有效');
  const past = makeToken({}, -3600);
  const expResult = checkJwtExpiry(past);
  assertEq(expResult.valid, false, '过去 1h 无效');
  assertEq(expResult.reason, 'token_expired', '原因: token_expired');

  // 1.4 结构校验
  assert(!isValidAuth(null), 'null 无效');
  assert(!isValidAuth({}), '空对象无效');
  assert(!isValidAuth({ token: '' }), '空 token 无效');
  assert(!isValidAuth({ token: 'x' }), '缺 user_id 无效');
  assert(isValidAuth({ token: 'x', user_id: '1' }), '完整结构有效');

  // 1.5 完整校验
  const v = validateAuth(makeAuth());
  assertEq(v.ok, true, '完整凭证通过');
  const expired = validateAuth(makeAuth({ token: makeToken({}, -10) }));
  assertEq(expired.ok, false, '过期 token 拒绝');
  assertEq(expired.error.code, 'UNAUTHORIZED', '过期返回 UNAUTHORIZED');
  const badFmt = validateAuth({ token: 'not-jwt', user_id: '1' });
  assertEq(badFmt.ok, false, '格式错误拒绝');

  // 1.6 assertValidAuth 抛错
  let thrown = null;
  try { assertValidAuth(null); } catch (e) { thrown = e; }
  assertEq(thrown?.code, 'UNAUTHORIZED', 'null 凭证抛 UNAUTHORIZED');

  // 1.7 Bearer 头
  assertEq(bearerHeader(null), null, 'null bearer 返回 null');
  assertEq(bearerHeader({ token: 't', user_id: '1' }), 'Bearer t', 'Bearer 头构造');
}

// ============================================================================
// 测试 2: 无 Token 场景
// ============================================================================

async function test2_noToken() {
  console.log('\n=== Test 2: No Token ===');
  await startMockServer(() => ({ status: 200, body: { ok: true } }));

  const loader = makeLoader(null);

  let err = null;
  try {
    await callBackend({ method: 'GET', path: '/test', loader });
  } catch (e) { err = e; }
  assert(err !== null, '无 token 时拒绝');
  assertEq(err?.code, 'UNAUTHORIZED', '错误码 = UNAUTHORIZED');
  assertEq(err?.message, 'user not logged in', '错误消息 = user not logged in');
}

// ============================================================================
// 测试 3: 正常 Token 透传
// ============================================================================

async function test3_validToken() {
  console.log('\n=== Test 3: Valid Token ===');
  let receivedAuth = null;
  await startMockServer((method, url, body, headers) => {
    receivedAuth = headers['authorization'];
    return { status: 200, body: { success: true, method, url } };
  });

  const auth = makeAuth({ user_id: 'u99', user_name: 'bob' });
  const loader = makeLoader(auth);

  const result = await callBackend({ method: 'GET', path: '/hello', loader });
  assertEq(result.success, true, '后端正常返回');
  // mock handler 收到的是去除 base 后的 path，normalizeUrl 拼接后端会得到 /api/hello
  assertEq(result.url, '/api/hello', '路径正确（base + path）');
  assertEq(receivedAuth, 'Bearer ' + auth.token, 'Authorization 头自动注入');
}

// ============================================================================
// 测试 4: 错误状态码映射
// ============================================================================

async function test4_statusMapping() {
  console.log('\n=== Test 4: Status Code Mapping ===');

  const cases = [
    { status: 400, detail: '参数错误', expect: 'INVALID_ARGS' },
    { status: 401, detail: 'token invalid', expect: 'UNAUTHORIZED' },
    { status: 403, detail: 'forbidden', expect: 'UNAUTHORIZED' },
    { status: 404, detail: 'not found', expect: 'NOT_FOUND' },
    { status: 500, detail: 'internal', expect: 'INTERNAL' },
    { status: 502, detail: 'bad gateway', expect: 'UPSTREAM_FAILURE' },
    { status: 503, detail: 'unavailable', expect: 'UPSTREAM_FAILURE' },
  ];

  for (const c of cases) {
    // 每次重建 mock server
    if (mockServer) {
      await stopMockServer();
    }
    await startMockServer(() => ({ status: c.status, body: { detail: c.detail } }));
    const loader = makeLoader(makeAuth());
    let err = null;
    try {
      await callBackend({ method: 'GET', path: '/x', loader });
    } catch (e) { err = e; }
    assertEq(err?.code, c.expect, `HTTP ${c.status} → ${c.expect}`);
  }
}

// ============================================================================
// 测试 5: 超时
// ============================================================================

async function test5_timeout() {
  console.log('\n=== Test 5: Timeout ===');
  await startMockServer(() => new Promise((resolve) => {
    setTimeout(() => resolve({ status: 200, body: {} }), 5000);
  }));

  const loader = makeLoader(makeAuth());
  const start = Date.now();
  let err = null;
  try {
    await callBackend({ method: 'GET', path: '/slow', loader, timeoutMs: 500 });
  } catch (e) { err = e; }
  const dur = Date.now() - start;

  assert(err !== null, '超时抛错');
  assertEq(err?.code, 'TIMEOUT', '错误码 = TIMEOUT');
  assert(dur < 1000, `耗时 ${dur}ms < 1000ms`);
}

// ============================================================================
// 测试 6: 断网
// ============================================================================

async function test6_networkError() {
  console.log('\n=== Test 6: Network Error ===');
  // 用一个不会监听的端口
  const loader = new ConfigLoader();
  loader.setMemoryAuth(makeAuth());
  loader.setMemoryContext({
    team_id: 'team',
    project_id: 'proj',
    synkord_core_url: 'http://127.0.0.1:1/api', // 端口 1 不会有人监听
  });

  let err = null;
  try {
    await callBackend({ method: 'GET', path: '/x', loader, timeoutMs: 1000 });
  } catch (e) { err = e; }
  assert(err !== null, '断网抛错');
  assertEq(err?.code, 'UPSTREAM_FAILURE', '错误码 = UPSTREAM_FAILURE');
}

// ============================================================================
// 测试 7: 日志脱敏
// ============================================================================

async function test7_logRedaction() {
  console.log('\n=== Test 7: Log Redaction ===');
  // 捕获 stderr
  const originalWrite = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = (data) => {
    captured.push(String(data));
    return true;
  };

  try {
    await startMockServer(() => ({ status: 200, body: { ok: true } }));
    const auth = makeAuth();
    const loader = makeLoader(auth);
    await callBackend({ method: 'GET', path: '/log-test', loader });
  } finally {
    process.stderr.write = originalWrite;
  }

  const allLogs = captured.join('');
  assert(!allLogs.includes(auth.token), 'Token 未出现在日志');
  assert(allLogs.includes('***REDACTED***'), '日志中出现 REDACTED 标记');
  assert(allLogs.includes('GET /log-test'), '日志包含请求方法');
}

// ============================================================================
// 测试 8: callTool 路径
// ============================================================================

async function test8_callTool() {
  console.log('\n=== Test 8: callTool Path ===');
  let receivedBody = null;
  await startMockServer((method, url, body) => {
    receivedBody = body;
    return { status: 200, body: { result: { items: [{ id: 1 }], total: 1 } } };
  });

  const loader = makeLoader(makeAuth());
  const r = await callTool({ loader, tool: 'get_project_entities', args: {} });

  assertEq(receivedBody.tool, 'get_project_entities', '工具名透传');
  assertEq(receivedBody.team_id, 'team-1', 'team_id 注入');
  assertEq(receivedBody.project_id, 'proj-1', 'project_id 注入');
  assertEq(r.result.total, 1, '结果透传');
}

// ============================================================================
// 测试 9: callTool 无上下文
// ============================================================================

async function test9_callToolNoContext() {
  console.log('\n=== Test 9: callTool No Context ===');
  await startMockServer(() => ({ status: 200, body: {} }));

  const loader = new ConfigLoader();
  loader.setMemoryAuth(makeAuth());
  // 故意不设 context

  let err = null;
  try {
    await callTool({ loader, tool: 'foo', args: {} });
  } catch (e) { err = e; }
  assertEq(err?.code, 'NOT_FOUND', '无上下文返回 NOT_FOUND');
}

// ============================================================================
// 测试 10: writeAudit 失败不抛
// ============================================================================

async function test10_writeAuditFailure() {
  console.log('\n=== Test 10: writeAudit Failure Resilience ===');
  // 故意指向不通的地址
  const loader = new ConfigLoader();
  loader.setMemoryAuth(makeAuth());
  loader.setMemoryContext({
    team_id: 'team',
    project_id: 'proj',
    synkord_core_url: 'http://127.0.0.1:1/api',
  });

  let err = null;
  let result = null;
  try {
    result = await writeAudit({
      loader,
      toolName: 'test',
      caller: 'test',
      paramsSummary: '{}',
      resultStatus: 'success',
    });
  } catch (e) { err = e; }
  assert(err === null, 'writeAudit 失败不抛错');
  assert(result === null, 'writeAudit 失败返回 null');
}

// ============================================================================
// 主流程
// ============================================================================

async function main() {
  console.log('======================================');
  console.log('Stage 2 Integration Tests');
  console.log('======================================');

  try {
    await test1_authModule();
    await test2_noToken();
    await test3_validToken();
    await test4_statusMapping();
    await test5_timeout();
    await test6_networkError();
    await test7_logRedaction();
    await test8_callTool();
    await test9_callToolNoContext();
    await test10_writeAuditFailure();
  } catch (e) {
    console.error('Test runner error:', e);
  } finally {
    await stopMockServer();
  }

  // 汇总
  console.log('\n======================================');
  console.log('Results');
  console.log('======================================');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.msg}`);
  }
  console.log(`\nTotal: ${pass} pass, ${fail} fail`);

  if (fail > 0) {
    process.exit(1);
  }
}

main();
