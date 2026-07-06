// Synkord IdeHint
// 评审 R-9：删除"~/.cursor/mcp.json 写死"的路径耦合，
// 改为根据 IDE 描述返回配置说明，让 5 分钟接通对所有 IDE 都生效。

import type { IdeType } from '../utils/ideConfig'

interface IdeHint {
  /** 配置写入位置说明 */
  where: string
  /** 写入方式说明（图形界面 / 配置文件） */
  how: string
  /** 重启方式（图形 / 编辑器内 reload） */
  reload: string
}

/**
 * 评审 R-9 / 1.5：每个 IDE 都给"非程序员也能看懂"的步骤化提示
 */
export function getIdeHint(t: IdeType): IdeHint {
  switch (t) {
    case 'cursor':
      return {
        where: 'Cursor → Settings → Cursor Settings → MCP → Add a new global MCP server',
        how: '在图形界面的 JSON 输入框粘贴配置',
        reload: '保存后自动生效，无需重启',
      }
    case 'claude-desktop':
      return {
        where: 'claude_desktop_config.json（路径见上方）',
        how: '编辑后保存 JSON 文件',
        reload: '完全退出并重新打开 Claude Desktop',
      }
    case 'codex':
      return {
        where: '~/.codex/config.toml',
        how: '追加 [mcp_servers.synkord] 段',
        reload: '重启 Codex CLI 或重新载入配置',
      }
    case 'continue':
      return {
        where: '~/.continue/config.json 的 experimental.modelProviders 旁',
        how: '在 mcpServers 节点添加配置',
        reload: '在 VS Code 中按 Cmd/Ctrl+Shift+P → "Continue: Reload Config"',
      }
    case 'cline':
      return {
        where: 'VS Code → Cline 面板 → MCP Servers → Configure MCP Servers',
        how: '编辑 cline_mcp_settings.json',
        reload: '保存后自动生效',
      }
  }
}

interface IdeHintPanelProps {
  ide: IdeType
  selectedConfigPath: string
}

export function IdeHintPanel({ ide, selectedConfigPath }: IdeHintPanelProps) {
  const hint = getIdeHint(ide)
  return (
    <div className="ide-hint-panel">
      <div className="ide-hint-row">
        <span className="ide-hint-label">📍 配置文件路径</span>
        <code className="ide-hint-path">{selectedConfigPath}</code>
      </div>
      <div className="ide-hint-row">
        <span className="ide-hint-label">📝 写入位置</span>
        <span>{hint.where}</span>
      </div>
      <div className="ide-hint-row">
        <span className="ide-hint-label">✏️ 写入方式</span>
        <span>{hint.how}</span>
      </div>
      <div className="ide-hint-row">
        <span className="ide-hint-label">🔄 配置生效</span>
        <span>{hint.reload}</span>
      </div>
    </div>
  )
}
