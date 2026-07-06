// Synkord IDE Config Generator
// 生成 STDIO / HTTP 两种传输模式下的 IDE 配置片段
// 详见 docs/ui-spec.md §四

import type { IdeConfig } from '../api/mcp'

export type IdeType = 'cursor' | 'claude-desktop' | 'codex' | 'continue' | 'cline'

export const IDE_TYPES: Array<{ value: IdeType; label: string; configPath: string }> = [
  { value: 'cursor', label: 'Cursor', configPath: '~/.cursor/mcp.json' },
  { value: 'claude-desktop', label: 'Claude Desktop', configPath: '~/Library/Application Support/Claude/claude_desktop_config.json' },
  { value: 'codex', label: 'Codex CLI', configPath: '~/.codex/config.toml' },
  { value: 'continue', label: 'Continue', configPath: '~/.continue/config.json' },
  { value: 'cline', label: 'Cline', configPath: '通过 VS Code 设置面板配置' },
]

/**
 * 生成 STDIO 模式的 JSON 配置（适用于 Cursor / Claude Desktop / Continue）
 */
export function generateStdioConfig(ideConfig: IdeConfig, ideType: IdeType = 'cursor'): string {
  const { command, args } = ideConfig.stdio

  // Codex 使用 TOML 格式，不支持 JSON
  if (ideType === 'codex') {
    return generateCodexStdioConfig(command, args)
  }

  // Cline 通过 UI 配置，生成提示性说明
  if (ideType === 'cline') {
    return `# 在 VS Code 的 Cline 扩展面板中：
# 1. 点击左上角 MCP Servers 图标
# 2. 点 "Installed" → "Configure MCP Servers"
# 3. 编辑 cline_mcp_settings.json：
#
# {
#   "mcpServers": {
#     "synkord": {
#       "command": "${command}",
#       "args": ${JSON.stringify(args)}
#     }
#   }
# }`
  }

  const config = {
    mcpServers: {
      synkord: {
        command,
        args,
      },
    },
  }
  return JSON.stringify(config, null, 2)
}

/**
 * Codex CLI 使用 TOML 格式
 */
function generateCodexStdioConfig(command: string, args: string[]): string {
  const argsStr = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(', ')
  return `[mcp_servers.synkord]
command = "${command}"
args = [${argsStr}]`
}

/**
 * 生成 HTTP 模式的配置
 */
export function generateHttpConfig(ideConfig: IdeConfig, ideType: IdeType = 'cursor'): string {
  if (!ideConfig.http) {
    return '// HTTP 模式暂未配置。请先启动 MCP 服务。'
  }

  const { url, token } = ideConfig.http

  if (ideType === 'codex') {
    return `[mcp_servers.synkord]
url = "${url}"
bearer_token = "${token}"`
  }

  if (ideType === 'cline') {
    return `# 在 Cline MCP 设置中：
# 1. Server Name: synkord
# 2. Server URL: ${url}
# 3. Transport: HTTP
# 4. Headers: Authorization: Bearer ${token}`
  }

  // Cursor / Claude Desktop / Continue — JSON 格式
  const config = {
    mcpServers: {
      synkord: {
        url,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  }
  return JSON.stringify(config, null, 2)
}

/**
 * 仅生成 URL（用于 Cursor 等只支持 URL 的场景）
 */
export function generateHttpUrlOnly(ideConfig: IdeConfig): string {
  return ideConfig.http?.url || ''
}

/**
 * 仅生成 Bearer Token（单独复制用）
 */
export function generateHttpTokenOnly(ideConfig: IdeConfig): string {
  return ideConfig.http?.token || ''
}