/**
 * electron/preload.cjs
 *
 * Electron preload 脚本（v1.2 重构版）
 * 通过 contextBridge 暴露受限 API 给渲染进程
 *
 * 设计原则：
 *  - §8 仅暴露必要 IPC 通道
 *  - §10 白名单 + invoke 拦截
 *  - v1.2 移除 mcpSetActiveProject（活跃契约集走后端 API）
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// ============================================================================
// 白名单 IPC 通道
// ============================================================================

const ALLOWED_INVOKES = new Set([
  'mcp:get-api-base',
  'mcp:get-status',
  'mcp:start',
  'mcp:stop',
  'mcp:restart',
  'mcp:get-active-contract',
  'mcp:get-ide-config',
  'mcp:get-access-log',
  'window:minimize',
  'window:maximize',
  'window:close',
  'cli:status',
  'cli:install',
  'cli:uninstall',
]);

const ALLOWED_EVENTS = new Set([
  'mcp:event',     // MCP 状态变更推送
  'auth:expired',  // 401 通知
]);

// ============================================================================
// API 暴露
// ============================================================================

contextBridge.exposeInMainWorld('synkord', {
  // ---- 基础 API ----
  getAPIBase: () => ipcRenderer.invoke('mcp:get-api-base'),

  // ---- MCP Server 生命周期 ----
  mcpGetStatus: () => ipcRenderer.invoke('mcp:get-status'),
  mcpStart: () => ipcRenderer.invoke('mcp:start'),
  mcpStop: () => ipcRenderer.invoke('mcp:stop'),
  mcpRestart: () => ipcRenderer.invoke('mcp:restart'),

  // ---- 活跃契约集（v1.2：从主进程读取缓存，避免 IPC 推送） ----
  mcpGetActiveContract: () => ipcRenderer.invoke('mcp:get-active-contract'),

  // ---- IDE 配置 ----
  mcpGetIDEConfig: () => ipcRenderer.invoke('mcp:get-ide-config'),

  // ---- 访问日志 ----
  mcpGetAccessLog: (limit) => ipcRenderer.invoke('mcp:get-access-log', limit),

  // ---- 窗口控制 ----
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // ---- CLI 安装器 ----
  cliStatus: () => ipcRenderer.invoke('cli:status'),
  cliInstall: () => ipcRenderer.invoke('cli:install'),
  cliUninstall: () => ipcRenderer.invoke('cli:uninstall'),

  // ---- 事件订阅（状态变更 / 401 通知）----
  onMcpEvent: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => {
      try {
        callback(payload)
      } catch {
        // 防止渲染进程回调抛错影响 IPC
      }
    }
    ipcRenderer.on('mcp:event', handler)
    return () => ipcRenderer.removeListener('mcp:event', handler)
  },
  onAuthExpired: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => {
      try {
        callback(payload)
      } catch {}
    }
    ipcRenderer.on('auth:expired', handler)
    return () => ipcRenderer.removeListener('auth:expired', handler)
  },
})

// ============================================================================
// 防御性：未授权的 IPC 通道被拦截
// ============================================================================

const originalInvoke = ipcRenderer.invoke.bind(ipcRenderer)
ipcRenderer.invoke = (channel, ...args) => {
  if (!ALLOWED_INVOKES.has(channel)) {
    // eslint-disable-next-line no-console
    console.warn('[preload] blocked unauthorized invoke:', channel)
    return Promise.reject(new Error('unauthorized IPC channel'))
  }
  return originalInvoke(channel, ...args)
}

const originalOn = ipcRenderer.on.bind(ipcRenderer)
ipcRenderer.on = (channel, listener) => {
  if (!ALLOWED_EVENTS.has(channel)) {
    // eslint-disable-next-line no-console
    console.warn('[preload] blocked unauthorized event subscription:', channel)
    return ipcRenderer
  }
  return originalOn(channel, listener)
}