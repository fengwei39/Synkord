#!/usr/bin/env node
/**
 * Synkord electron 一键编排脚本
 *
 * 流程：
 *   1. 后台 spawn vite（监听 127.0.0.1:3000）
 *   2. 轮询 http://127.0.0.1:3000 可用后，注入 SYNKORD_DEV_URL 后 spawn electron .
 *   3. Electron 退出时一并 kill vite，避免孤儿进程
 *
 * 零外部依赖；兼容 macOS / Linux / Windows。
 *
 * 关于 .cmd 的 Windows 坑：
 *  - vite：直接 `node vite/bin/vite.js` 起 ESM 进程
 *  - electron：通过 `require('electron')` 拿到二进制路径，再 spawn electron.exe，
 *    跳过 cli.js 那一层（保留与 npm script `electron .` 行为完全一致）
 */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const FRONTEND_DIR = path.resolve(__dirname, '..');
const VITE_PORT = 3000;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;
const WAIT_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 500;

function resolveViteEntry() {
  return path.join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
}

function resolveElectronBin() {
  // require('electron') 在 node 进程里返回的就是 electron.exe 绝对路径
  return require(path.join(FRONTEND_DIR, 'node_modules', 'electron'));
}

const VITE_ENTRY = resolveViteEntry();
const ELECTRON_BIN = resolveElectronBin();

if (!fs.existsSync(VITE_ENTRY)) {
  console.error('[dev-electron] vite not installed. run `pnpm install` first.');
  process.exit(1);
}
if (!fs.existsSync(ELECTRON_BIN)) {
  console.error('[dev-electron] electron binary missing. run `pnpm install` first.');
  process.exit(1);
}

// 颜色（ANSI）
const c = {
  reset: '\x1b[0m',
  vite: '\x1b[36m',   // cyan
  elec: '\x1b[35m',   // magenta
  ok: '\x1b[32m',
  err: '\x1b[31m',
};
const tag = (color, name) => `${color}[${name}]${c.reset}`;

function prefixSpawn(color, name) {
  return (data) => {
    const text = data.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (line === '') continue;
      process.stdout.write(`${tag(color, name)} ${line}\n`);
    }
  };
}

function checkPort(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) resolve(res.statusCode);
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy(new Error('connect timeout'));
      reject(new Error('connect timeout'));
    });
  });
}

async function waitForVite(url, totalMs) {
  const deadline = Date.now() + totalMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const code = await checkPort(url);
      console.log(`${tag(c.ok, 'vite')} ready (HTTP ${code}) at ${url}`);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  throw new Error(`vite not reachable at ${url} within ${totalMs}ms (last: ${lastErr?.message || 'unknown'})`);
}

let shuttingDown = false;

async function main() {
  // 1) 启动 vite（通过 node 调起其 JS 入口，绕开 Windows .cmd spawn 限制）
  console.log(`${tag(c.vite, 'vite')} starting at ${VITE_URL} ...`);
  const vite = spawn(process.execPath, [VITE_ENTRY, '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: FRONTEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  vite.stdout.on('data', prefixSpawn(c.vite, 'vite'));
  vite.stderr.on('data', prefixSpawn(c.vite, 'vite'));
  vite.on('exit', (code) => {
    if (code !== null && code !== 0 && !shuttingDown) {
      console.error(`${tag(c.err, 'vite')} exited with code ${code}`);
    }
  });

  // 2) 等端口可用
  try {
    await waitForVite(VITE_URL, WAIT_TIMEOUT_MS);
  } catch (err) {
    console.error(`${tag(c.err, 'vite')} ${err.message}`);
    vite.kill();
    process.exit(1);
  }

  // 3) 直接 spawn Electron 二进制（与 `pnpm electron .` 等价）
  console.log(`${tag(c.elec, 'electron')} launching (${ELECTRON_BIN}) ...`);
  const electronChild = spawn(ELECTRON_BIN, ['.'], {
    cwd: FRONTEND_DIR,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      SYNKORD_DEV_URL: VITE_URL,
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
  });

  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (electronChild && !electronChild.killed) {
      try { electronChild.kill(); } catch {}
    }
    if (vite && !vite.killed) {
      try { vite.kill(); } catch {}
    }
  };

  electronChild.on('exit', (code, signal) => {
    console.log(`${tag(c.elec, 'electron')} exited (code=${code} signal=${signal})`);
    cleanup();
    process.exit(code ?? 0);
  });
  vite.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`${tag(c.err, 'vite')} exited unexpectedly (code=${code}), aborting electron`);
    cleanup();
    process.exit(code ?? 1);
  });

  process.on('SIGINT', () => {
    console.log('\nshutting down (SIGINT) ...');
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('\nshutting down (SIGTERM) ...');
    cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
