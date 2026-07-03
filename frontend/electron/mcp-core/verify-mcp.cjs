#!/usr/bin/env node
/**
 * verify-mcp.cjs
 *
 * 标准化 MCP server 验证脚本
 *
 * 用法：
 *   1. 启动 server：node local-mcp-service.cjs http --port 39199
 *   2. 运行本脚本：node verify-mcp.cjs http://127.0.0.1:39199/mcp
 *   3. 也支持 bearer token：MCP_BEARER_TOKEN=xxx node verify-mcp.cjs http://...
 *
 * 覆盖范围（每项独立判定，全部通过才视为 server 正常）：
 *   - 端口连通性（TCP 握手）
 *   - GET /mcp 浏览器友好（应 200 + JSON，5s 内返回）
 *   - GET /mcp SSE（应 200 + text/event-stream）
 *   - initialize 完整握手（应返回完整 capabilities）
 *   - notifications/initialized（应 202）
 *   - tools/list（应返回 ≥1 个工具）
 *   - resources/list（应返回 3 个静态资源）
 *   - resources/templates/list（应返回 2 个模板）
 *   - resources/read synkord://status（应真实返回内容）
 *   - 未知方法（应 METHOD_NOT_FOUND）
 *   - 错误协议版本（应降级到 DEFAULT_PROTOCOL_VERSION）
 */
'use strict';

const http = require('http');
const { URL } = require('url');

// ============================================================================
// 配置
// ============================================================================

const ENDPOINT = process.argv[2] || 'http://127.0.0.1:37991/mcp';
const BEARER = process.env.MCP_BEARER_TOKEN || '';
const TIMEOUT_MS = 5000;

const parsed = new URL(ENDPOINT);

// ============================================================================
// HTTP 客户端
// ============================================================================

function request({ method = 'POST', path = parsed.pathname, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path,
      method,
      headers: {
        'User-Agent': 'verify-mcp/1.0',
        ...headers,
      },
      timeout: TIMEOUT_MS,
    };
    if (BEARER) opts.headers['Authorization'] = `Bearer ${BEARER}`;
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`timeout after ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function rpc(id, method, params) {
  return request({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }),
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================================
// 测试用例
// ============================================================================

const tests = [];
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  console.log(`\n========== MCP Server 验证 ==========`);
  console.log(`Endpoint:  ${ENDPOINT}`);
  console.log(`Bearer:    ${BEARER ? '***配置***' : '未配置（跳过鉴权）'}`);
  console.log(`Timeout:   ${TIMEOUT_MS}ms\n`);

  for (const t of tests) {
    process.stdout.write(`  ${t.name} ... `);
    const start = Date.now();
    try {
      await t.fn();
      passCount++;
      console.log(`✓ PASS (${Date.now() - start}ms)`);
    } catch (e) {
      failCount++;
      console.log(`✗ FAIL: ${e.message}`);
    }
  }

  console.log(`\n========== 验证结果 ==========`);
  console.log(`通过: ${passCount}    失败: ${failCount}    总计: ${tests.length}\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ----------------------------------------------------------------------------
// 测试定义
// ----------------------------------------------------------------------------

// T1: TCP 端口连通
test('T1  TCP 端口连通', async () => {
  const res = await request({ method: 'GET' });
  // 任何响应（包括 200/400/405）都说明端口通
  assert(res.status > 0, `端口无响应`);
});

// T2: 浏览器 GET（应快速返回 JSON 状态页，5s 内）
test('T2  浏览器 GET 不超时（JSON 状态页）', async () => {
  const start = Date.now();
  const res = await request({ method: 'GET', headers: { Accept: 'text/html' } });
  const dur = Date.now() - start;
  assert(dur < TIMEOUT_MS, `耗时 ${dur}ms 超时`);
  assert(res.status === 200, `HTTP ${res.status}`);
  assert((res.headers['content-type'] || '').includes('json'), `非 JSON 响应`);
  assert(res.json && res.json.name === 'synkord-mcp', `响应缺 name 字段`);
  assert(res.json.capabilities && res.json.capabilities.tools, `响应缺 capabilities.tools`);
});

// T3: SSE GET（应返回 text/event-stream）
// 注意：SSE 是长连接，无响应结束事件。验证"首字节超时"——拿到响应头即视为通过。
test('T3  SSE GET 返回 event-stream', async () => {
  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'GET',
      headers: { Accept: 'text/event-stream', 'User-Agent': 'verify-mcp/1.0' },
      timeout: TIMEOUT_MS,
    }, (r) => { resolve({ status: r.statusCode, headers: r.headers }); r.resume(); });
    req.on('timeout', () => { req.destroy(new Error(`timeout after ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
    req.end();
  });
  assert(res.status === 200, `HTTP ${res.status}`);
  assert((res.headers['content-type'] || '').includes('event-stream'), `非 SSE: ${res.headers['content-type']}`);
});

// T4: initialize 完整握手
test('T4  initialize 返回完整 capabilities', async () => {
  const res = await rpc(1, 'initialize', { protocolVersion: '2025-03-26' });
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(res.json && res.json.result, `无 result: ${res.text}`);
  const r = res.json.result;
  assert(r.protocolVersion === '2025-03-26', `协议版本错误: ${r.protocolVersion}`);
  assert(r.serverInfo && r.serverInfo.name === 'synkord-mcp', `serverInfo.name 错误`);
  assert(r.capabilities, `缺 capabilities`);
  assert(r.capabilities.tools, `缺 capabilities.tools`);
  assert(r.capabilities.resources, `缺 capabilities.resources`);
  assert(r.capabilities.prompts, `缺 capabilities.prompts`);
  assert(r.capabilities.logging, `缺 capabilities.logging`);
});

// T5: notifications/initialized（应 202）
test('T5  notifications/initialized 返回 202', async () => {
  const res = await request({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert(res.status === 202, `HTTP ${res.status}, expected 202`);
});

// T6: tools/list
test('T6  tools/list 返回 ≥1 个工具', async () => {
  const res = await rpc(2, 'tools/list');
  assert(res.status === 200, `HTTP ${res.status}`);
  const tools = res.json && res.json.result && res.json.result.tools;
  assert(Array.isArray(tools), `tools 不是数组`);
  assert(tools.length >= 1, `工具数 = 0`);
  // 每个工具有 name / description / inputSchema
  for (const t of tools) {
    assert(t.name, `工具有缺 name`);
    assert(t.description, `工具 ${t.name} 缺 description`);
    assert(t.inputSchema, `工具 ${t.name} 缺 inputSchema`);
  }
});

// T7: resources/list
test('T7  resources/list 返回 3 个静态资源', async () => {
  const res = await rpc(3, 'resources/list');
  assert(res.status === 200, `HTTP ${res.status}`);
  const rs = res.json && res.json.result && res.json.result.resources;
  assert(Array.isArray(rs), `resources 不是数组`);
  assert(rs.length === 3, `资源数 = ${rs.length}, expected 3`);
  const uris = rs.map((r) => r.uri).sort();
  assert(uris.includes('synkord://status'), `缺 synkord://status`);
  assert(uris.includes('synkord://active-project'), `缺 synkord://active-project`);
  assert(uris.includes('synkord://tools-manifest'), `缺 synkord://tools-manifest`);
});

// T8: resources/templates/list
test('T8  resources/templates/list 返回 2 个模板', async () => {
  const res = await rpc(4, 'resources/templates/list');
  assert(res.status === 200, `HTTP ${res.status}`);
  const ts = res.json && res.json.result && res.json.result.resourceTemplates;
  assert(Array.isArray(ts), `resourceTemplates 不是数组`);
  assert(ts.length === 2, `模板数 = ${ts.length}, expected 2`);
  const tpls = ts.map((t) => t.uriTemplate).sort();
  assert(tpls.includes('synkord://entity/{name}'), `缺 entity 模板`);
  assert(tpls.includes('synkord://api/{method}/{path}'), `缺 api 模板`);
});

// T9: resources/read 静态资源
test('T9  resources/read synkord://status 返回真实内容', async () => {
  const res = await rpc(5, 'resources/read', { uri: 'synkord://status' });
  assert(res.status === 200, `HTTP ${res.status}`);
  const contents = res.json && res.json.result && res.json.result.contents;
  assert(Array.isArray(contents) && contents.length === 1, `contents 格式错误`);
  assert(contents[0].mimeType === 'application/json', `mimeType 错误`);
  const data = JSON.parse(contents[0].text);
  assert(data.server && data.server.name === 'synkord-mcp', `server.name 错误`);
  assert(typeof data.tools_count === 'number', `缺 tools_count`);
});

// T10: 未知方法返回 METHOD_NOT_FOUND
// HTTP 状态码：实现选择 400（method not allowed）；JSON-RPC 错误码 -32601
test('T10 未知方法返回 METHOD_NOT_FOUND', async () => {
  const res = await rpc(6, 'foo/bar');
  // 接受 200 或 400（实现可选）；只要 JSON-RPC 错误码是 -32601 即视为通过
  assert([200, 400].includes(res.status), `HTTP ${res.status}, expected 200 or 400`);
  const err = res.json && res.json.error;
  assert(err, `无 error 字段`);
  assert(err.code === -32601, `错误码 = ${err.code}, expected -32601 (METHOD_NOT_FOUND)`);
});

// T11: 错误协议版本降级
test('T11 错误协议版本降级到 default', async () => {
  const res = await rpc(7, 'initialize', { protocolVersion: '2099-99-99' });
  assert(res.status === 200, `HTTP ${res.status}`);
  const v = res.json && res.json.result && res.json.result.protocolVersion;
  assert(v === '2025-03-26', `应降级到 2025-03-26, 实际 ${v}`);
});

// T12: Bearer 鉴权（仅在配置了 token 时启用）
if (BEARER) {
  test('T12 Bearer 鉴权：错误 token 应 401', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong_token',
          'User-Agent': 'verify-mcp/1.0',
        },
        timeout: TIMEOUT_MS,
      }, (r) => { resolve({ status: r.statusCode }); r.resume(); });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
      req.end();
    });
    assert(res.status === 401, `错误 token 应 401, 实际 ${res.status}`);
  });
} else {
  test('T12 Bearer 鉴权：未配置（跳过）', async () => {
    // 跳过：环境变量 MCP_BEARER_TOKEN 为空时不做鉴权
  });
}

// ============================================================================
// 启动
// ============================================================================

runAll().catch((e) => {
  console.error(`\n✗ 致命错误: ${e.message}\n`);
  process.exit(2);
});
