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
const path = require('path');

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

// ============================================================================
// API 暴露（仅白名单通道可用）
// 事件订阅仅一个 mcp:event 通道，已通过 ipcRenderer.on('mcp:event') 天然白名单化，
// 不再维护 ALLOWED_EVENTS（之前 event?.type 取的是 IpcRendererEvent 对象，
// 与业务 payload.type 不同，判断永远为 false，属冗余代码）。
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

  // ---- 应用常量：MCP 服务脚本绝对路径 ----
  // Electron 安装目录下的固定文件，重装/挪动位置才会变。
  // 同步暴露，渲染进程 mount 时直接读取，无需 IPC。
  mcpServicePath: path.join(__dirname, 'local-mcp-service.cjs'),

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
    ipcRenderer.on('mcp:event', handler);
    // 返回取消订阅函数
    return () => ipcRenderer.removeListener('mcp:event', handler);
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
