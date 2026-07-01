/**
 * electron/preload.cjs
 *
 * Electron preload 脚本：通过 contextBridge 暴露受限 API 给渲染进程
 * 对应设计文档：
 *  - §8 目录结构：preload.cjs 暴露 IPC 给 UI
 *  - §10 安全：contextBridge 隔离，不暴露 Node.js API
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// 白名单 IPC 通道（仅暴露这些通道，文档 §10 安全）
// ============================================================================

const ALLOWED_INVOKES = new Set([
  'mcp:get-api-base',
  'mcp:get-status',
  'mcp:start',
  'mcp:stop',
  'mcp:restart',
  'mcp:set-active-project',
  'mcp:get-ide-config',
  'mcp:get-access-log',
]);

const ALLOWED_EVENTS = new Set([
  'mcp:event', // 主进程推送的状态变更
]);

// ============================================================================
// API 暴露（仅白名单通道可用）
// ============================================================================

contextBridge.exposeInMainWorld('synkord', {
  // ---- 基础 API ----
  getAPIBase: () => ipcRenderer.invoke('mcp:get-api-base'),

  // ---- MCP Server 生命周期 ----
  mcpGetStatus: () => ipcRenderer.invoke('mcp:get-status'),
  mcpStart: () => ipcRenderer.invoke('mcp:start'),
  mcpStop: () => ipcRenderer.invoke('mcp:stop'),
  mcpRestart: () => ipcRenderer.invoke('mcp:restart'),

  // ---- 上下文管理 ----
  mcpSetActiveProject: (project) =>
    ipcRenderer.invoke('mcp:set-active-project', project),

  // ---- IDE 配置 ----
  mcpGetIDEConfig: () => ipcRenderer.invoke('mcp:get-ide-config'),

  // ---- 访问日志 ----
  mcpGetAccessLog: (limit) => ipcRenderer.invoke('mcp:get-access-log', limit),

  // ---- 事件订阅（状态变更通知）----
  onMcpEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => {
      try {
        callback(payload);
      } catch {
        // 防止渲染进程回调抛错影响 IPC
      }
    };
    const listener = (event, payload) => {
      // 二次校验：仅放行白名单事件
      if (!ALLOWED_EVENTS.has(event?.type)) return;
      handler(event, payload);
    };
    ipcRenderer.on('mcp:event', listener);
    // 返回取消订阅函数
    return () => ipcRenderer.removeListener('mcp:event', listener);
  },
});

// ============================================================================
// 防御性设计（即使攻击者拿到 ipcRenderer 也无法滥用）
// ============================================================================

// 拦截未授权的 invoke（不阻止，仅记录）
const originalInvoke = ipcRenderer.invoke.bind(ipcRenderer);
ipcRenderer.invoke = (channel, ...args) => {
  if (!ALLOWED_INVOKES.has(channel)) {
    // eslint-disable-next-line no-console
    console.warn('[preload] blocked unauthorized invoke:', channel);
    return Promise.reject(new Error('unauthorized IPC channel'));
  }
  return originalInvoke(channel, ...args);
};
