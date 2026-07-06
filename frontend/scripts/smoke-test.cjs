#!/usr/bin/env node
/**
 * Synkord Electron 端到端冒烟测试
 *
 * 验证流程：
 *  1. 后端 API 健康检查
 *  2. AuthManager 登录 + 获取 token
 *  3. 验证 AuthGateway 启动 + 接收请求
 *  4. 验证活跃契约集管理
 *  5. 验证 MCP 工具调用（通过 Gateway 代理到后端）
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const BACKEND_URL = process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000';
const SYNKORD_HOME = path.join(os.tmpdir(), 'synkord-smoketest-' + Date.now());
process.env.SYNKORD_HOME = SYNKORD_HOME;
fs.mkdirSync(SYNKORD_HOME, { recursive: true });

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

let passed = 0;
let failed = 0;

function ok(msg) {
  console.log(`  ${colors.green}✓${colors.reset} ${msg}`);
  passed++;
}

function fail(msg, err) {
  console.log(`  ${colors.red}✗${colors.reset} ${msg}`);
  if (err) console.log(`    ${err.message || err}`);
  failed++;
}

function section(title) {
  console.log(`\n${colors.bold}▸ ${title}${colors.reset}`);
}

async function fetchJson(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, data, text });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log(`${colors.bold}Synkord Electron Smoke Test${colors.reset}`);
  console.log(`Backend:  ${BACKEND_URL}`);
  console.log(`SYNKORD_HOME: ${SYNKORD_HOME}`);

  // 1. 后端健康检查
  section('1. 后端健康检查');
  try {
    const r = await fetchJson('GET', `${BACKEND_URL}/health`);
    if (r.status === 200 && r.data?.status === 'ok') {
      ok(`/health → 200 (db: ${r.data.components?.database})`);
    } else {
      fail(`/health → ${r.status}`, new Error(r.text));
      return;  // 后端不健康就退出
    }
  } catch (err) {
    fail(`后端不可达: ${err.message}`);
    return;
  }

  // 2. AuthManager 测试
  section('2. AuthManager (登录 + 凭证管理)');
  let { AuthManager, ActiveContractStore } = require('../electron/auth-manager.cjs');
  const authManager = new AuthManager({
    backendUrl: BACKEND_URL,
    onUnauthorized: () => console.log('    [401] onUnauthorized 触发'),
  });
  await authManager.init();
  ok('init() 完成（无凭证）');
  if (!authManager.isAuthenticated()) ok('isAuthenticated() → false');

  try {
    const user = await authManager.login('admin', 'admin123');
    ok(`login() → 用户 ${user.username}`);
    if (authManager.isAuthenticated()) ok('isAuthenticated() → true');
  } catch (err) {
    fail(`login() 失败: ${err.message}`);
    return;
  }

  // 3. AuthGateway 测试
  section('3. AuthGateway (本地代理 + JWT 注入)');
  const { AuthGateway } = require('../electron/auth-gateway.cjs');
  const { randomUUID } = require('crypto');
  const instanceId = randomUUID();
  const gateway = new AuthGateway({
    authManager,
    backendUrl: BACKEND_URL,
    instanceId,
  });
  const port = await gateway.start();
  ok(`start() → 127.0.0.1:${port}`);

  // 注册实例
  gateway.registerInstance(instanceId);
  ok(`registerInstance(${instanceId.slice(0, 8)}...)`);

  // 3.1 健康检查
  const healthResp = await fetchJson('GET', `http://127.0.0.1:${port}/gw/health`);
  if (healthResp.status === 200) {
    ok('GET /gw/health → 200');
  } else {
    fail('GET /gw/health 失败', healthResp.text);
  }

  // 3.2 未注册实例调用（应被拒）
  const blocked = await new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/gw/api/contracts',
      method: 'GET',
      headers: { 'X-Mcp-Instance': 'unregistered' },
    }, (res) => resolve({ status: res.statusCode }));
    req.on('error', () => resolve({ status: 0 }));
    req.end();
  });
  if (blocked.status === 401) {
    ok(`未注册实例 → 401 (拒绝)`);
  } else {
    fail(`未注册实例应 401，实际 ${blocked.status}`);
  }

  // 3.3 已注册实例 + 自动注入 JWT 调用
  const proxiedResp = await new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/gw/api/contracts?limit=5',
      method: 'GET',
      headers: { 'X-Mcp-Instance': instanceId },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', () => resolve({ status: 0 }));
    req.end();
  });
  if (proxiedResp.status === 200) {
    const data = JSON.parse(proxiedResp.body);
    ok(`GET /gw/api/contracts → 200（自动注入 JWT, ${data.total} 个契约集）`);
  } else {
    fail(`GET /gw/api/contracts 失败: ${proxiedResp.status}`);
  }

  // 4. ActiveContractStore 测试
  section('4. ActiveContractStore (活跃契约集)');
  const acStore = new ActiveContractStore();
  ok('init() 完成（无活跃契约集）');
  acStore.set('test-contract-id', '测试契约集');
  ok('set(test-contract-id, 测试契约集)');
  const active = acStore.get();
  if (active.contract_id === 'test-contract-id' && active.contract_name === '测试契约集') {
    ok(`get() → ${active.contract_id} / ${active.contract_name}`);
  } else {
    fail(`get() 返回值错误: ${JSON.stringify(active)}`);
  }
  acStore.clear();
  ok('clear()');

  // 5. MCP 工具调用（通过 Gateway 模拟 Connect 的请求）
  section('5. MCP 工具调用 (端到端)');
  // 创建一个测试契约集
  const createResp = await new Promise((resolve) => {
    const body = JSON.stringify({ name: 'smoketest-' + Date.now() });
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/gw/api/contracts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Mcp-Instance': instanceId,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', () => resolve({ status: 0 }));
    req.write(body);
    req.end();
  });
  if (createResp.status === 201) {
    const c = JSON.parse(createResp.body);
    ok(`创建契约集 → 201 (id: ${c.id.slice(0, 8)}...)`);

    // 设置为活跃
    const setActiveResp = await new Promise((resolve) => {
      const body = JSON.stringify({ contract_id: c.id });
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/gw/api/mcp/active-contract',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Mcp-Instance': instanceId,
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString(),
        }));
      });
      req.on('error', () => resolve({ status: 0 }));
      req.write(body);
      req.end();
    });
    if (setActiveResp.status === 200) {
      ok(`设置活跃契约集 → 200`);

      // 调用 MCP 工具
      const toolResp = await new Promise((resolve) => {
        const body = JSON.stringify({
          tool: 'get_contract_apis',
          contract_id: c.id,
          args: {},
        });
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/gw/api/mcp/query',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-Mcp-Instance': instanceId,
          },
        }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          }));
        });
        req.on('error', () => resolve({ status: 0 }));
        req.write(body);
        req.end();
      });
      if (toolResp.status === 200) {
        const data = JSON.parse(toolResp.body);
        ok(`MCP 工具调用 → 200 (result.items: ${data.result?.items?.length || 0})`);
      } else {
        fail(`MCP 工具调用失败: ${toolResp.status}`);
      }
    } else {
      fail(`设置活跃契约集失败: ${setActiveResp.status}`);
    }
  } else {
    fail(`创建契约集失败: ${createResp.status} ${createResp.body}`);
  }

  // 清理
  await gateway.stop();
  await authManager.logout({ silent: true });

  // 总结
  console.log(`\n${colors.bold}=== 总结 ===${colors.reset}`);
  console.log(`  ${colors.green}通过: ${passed}${colors.reset}`);
  if (failed > 0) {
    console.log(`  ${colors.red}失败: ${failed}${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`  ${colors.green}全部通过！${colors.reset}`);
  }
}

main().catch((err) => {
  console.error('冒烟测试失败:', err);
  process.exit(1);
});