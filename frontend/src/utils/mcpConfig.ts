/**
 * mcpConfig.ts — MCP IDE 接入配置生成工具
 *
 * 单一职责：把 Synkord 内部状态（服务路径 / 监听地址）转成 IDE 可消费的字符串。
 * - STDIO：返回完整 JSON 配置块（mcpServers.synkord = { command, args, env }）
 * - HTTP：返回纯 URL 字符串（不同 IDE 的 HTTP 配置结构差异大，
 *         不在 Synkord 端臆造完整 JSON，避免输出占位字段误导用户）
 *
 * 使用方：
 * - pages/MCP.tsx：STDIO 接入 Tab 的一键复制（传完整 stdioArgs）
 * - components/AppLayout.tsx：顶栏悬浮窗的复制配置（从 mcpServicePath + 'stdio' 组装）
 */

export const STDIO_DEFAULTS = {
  command: 'node',
  env: [
    { key: 'SYNKORD_API_BASE', value: 'http://127.0.0.1:8000/api' },
    { key: 'SYNKORD_HOME', value: '~/.synkord' }
  ]
} as const;

export type IdeTransport = 'stdio' | 'http';

export interface BuildIdeConfigInput {
  transport: IdeTransport;
  /** STDIO 用：完整的 args 数组（典型为 [servicePath, 'stdio']） */
  stdioArgs?: string[];
  /** HTTP 用：MCP Server 完整 URL（含 path，如 http://127.0.0.1:7331/mcp） */
  url?: string;
}

export interface BuildIdeConfigResult {
  /** 可直接写入剪贴板的字符串 */
  text: string;
  /** 按钮文案 */
  label: string;
}

/**
 * 根据 transport 返回对应的 IDE 接入字符串。
 * 故意不在这里输出 IDE 端专有字段（如 envPassThrough、cwd、headers）：
 * Synkord 不消费这些，且容易输出占位值误导用户。
 */
export function buildIdeConfig(input: BuildIdeConfigInput): BuildIdeConfigResult {
  if (input.transport === 'stdio') {
    const args = (input.stdioArgs ?? []).map((a) => a.trim()).filter(Boolean);
    const server: Record<string, unknown> = {
      command: STDIO_DEFAULTS.command,
      args
    };
    const env = Object.fromEntries(STDIO_DEFAULTS.env.map((e) => [e.key, e.value]));
    if (Object.keys(env).length > 0) server.env = env;
    return {
      text: JSON.stringify({ mcpServers: { synkord: server } }, null, 2),
      label: '复制 STDIO 配置（Codex / Claude CLI）'
    };
  }
  return {
    text: input.url || '',
    label: '复制 HTTP 地址（Cursor / VS Code / JetBrains）'
  };
}