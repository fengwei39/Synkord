/**
 * ide-sync.ts
 *
 * Generates all IDE-specific configuration files for a linked project:
 *
 *  .synkord/config.json           ← unified Synkord project config
 *  .cursor/rules/synkord.md       ← Cursor rules (always-apply context)
 *  .cursor/mcp.json               ← Cursor MCP server config
 *  .vscode/mcp.json               ← VS Code Copilot MCP config
 *  CLAUDE.md                      ← Claude Code context section
 *  AGENTS.md                      ← Codex/OpenAI agents context section
 */

const MCP_URL = 'http://localhost:3742/mcp'
const BEGIN_MARKER = '<!-- synkord:begin -->'
const END_MARKER = '<!-- synkord:end -->'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SynkordProjectConfig {
  orgId: string
  orgSlug: string
  project: string
  consumes: string[]
  lastSyncedAt?: string
}

export interface SyncPack {
  name: string
  version: string
  contentType: string
  content: string
}

export interface SyncResult {
  ok: boolean
  files: string[]
  error?: string
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Writes/updates all IDE config files for a linked project.
 * Returns the list of files written.
 */
export async function syncIDEFiles(
  projectPath: string,
  config: SynkordProjectConfig,
  packs: SyncPack[],
): Promise<SyncResult> {
  const written: string[] = []

  const write = async (rel: string, content: string) => {
    const abs = joinPath(projectPath, rel)
    await window.electronAPI.writeFile(abs, content)
    written.push(rel)
  }

  const readOrEmpty = async (rel: string): Promise<string> => {
    try {
      return await window.electronAPI.readTextFile(joinPath(projectPath, rel))
    } catch {
      return ''
    }
  }

  try {
    // 1. .synkord/config.json
    const cfg: SynkordProjectConfig = { ...config, lastSyncedAt: new Date().toISOString() }
    await write('.synkord/config.json', JSON.stringify(cfg, null, 2) + '\n')

    // 2. .cursor/rules/synkord.md  (always-apply Cursor rule)
    await write('.cursor/rules/synkord.md', buildCursorRules(cfg, packs))

    // 3. .cursor/mcp.json
    const cursorMcp = await readOrEmpty('.cursor/mcp.json')
    await write('.cursor/mcp.json', mergeMCPConfig(cursorMcp))

    // 4. .vscode/mcp.json
    const vscodeMcp = await readOrEmpty('.vscode/mcp.json')
    await write('.vscode/mcp.json', mergeMCPConfig(vscodeMcp))

    // 5. CLAUDE.md
    const claudeMd = await readOrEmpty('CLAUDE.md')
    await write('CLAUDE.md', updateMarkdownSection(claudeMd, cfg, packs))

    // 6. AGENTS.md
    const agentsMd = await readOrEmpty('AGENTS.md')
    await write('AGENTS.md', updateMarkdownSection(agentsMd, cfg, packs))

    return { ok: true, files: written }
  } catch (err: unknown) {
    return { ok: false, files: written, error: String(err) }
  }
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildCursorRules(cfg: SynkordProjectConfig, packs: SyncPack[]): string {
  const date = new Date().toLocaleDateString('zh-CN')
  return [
    '---',
    'description: Synkord 契约（自动生成，请勿手动修改）',
    'alwaysApply: true',
    '---',
    '',
    BEGIN_MARKER,
    `> 以下契约由 Synkord 自动同步（组织：${cfg.orgSlug}，更新于 ${date}）`,
    '> 编写代码时请严格遵守以下契约定义。',
    '',
    ...packs.flatMap((p) => buildPackSection(p)),
    END_MARKER,
    '',
  ].join('\n')
}

function buildPackSection(pack: SyncPack): string[] {
  const fence = langFence(pack.contentType)
  return [
    `## ${pack.name}  \`v${pack.version}\`  (${pack.contentType})`,
    '',
    '```' + fence,
    pack.content,
    '```',
    '',
    '---',
    '',
  ]
}

function buildSynkordSection(cfg: SynkordProjectConfig, packs: SyncPack[]): string {
  const date = new Date().toLocaleDateString('zh-CN')
  const lines: string[] = [
    BEGIN_MARKER,
    '',
    `## Synkord 契约（自动生成，更新于 ${date}）`,
    '',
    `**组织**：${cfg.orgSlug}  **项目**：${cfg.project}`,
    '',
  ]

  for (const pack of packs) {
    const fence = langFence(pack.contentType)
    lines.push(`### ${pack.name}  v${pack.version}  (${pack.contentType})`)
    lines.push('')
    lines.push('```' + fence)
    lines.push(pack.content)
    lines.push('```')
    lines.push('')
  }

  lines.push(END_MARKER)
  return lines.join('\n')
}

function mergeMCPConfig(existing: string): string {
  let obj: Record<string, unknown> = {}
  if (existing.trim()) {
    try { obj = JSON.parse(existing) as Record<string, unknown> } catch { /* ignore */ }
  }
  const servers = (obj.mcpServers ?? {}) as Record<string, unknown>
  servers.synkord = { url: MCP_URL }
  obj.mcpServers = servers
  return JSON.stringify(obj, null, 2) + '\n'
}

function updateMarkdownSection(
  existing: string,
  cfg: SynkordProjectConfig,
  packs: SyncPack[],
): string {
  const section = buildSynkordSection(cfg, packs)

  if (existing.includes(BEGIN_MARKER)) {
    const start = existing.indexOf(BEGIN_MARKER)
    const endIdx = existing.indexOf(END_MARKER)
    if (endIdx === -1) {
      return existing.slice(0, start) + section
    }
    return existing.slice(0, start) + section + existing.slice(endIdx + END_MARKER.length)
  }

  const trimmed = existing.trimEnd()
  return trimmed ? `${trimmed}\n\n${section}\n` : `${section}\n`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function langFence(contentType: string): string {
  const map: Record<string, string> = {
    markdown: 'markdown', yaml: 'yaml', json: 'json',
    typescript: 'typescript', go: 'go', sql: 'sql', proto: 'protobuf', text: '',
  }
  return map[contentType] ?? contentType
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/').replace(/\\/g, '/')
}

// ─── localStorage helpers (for finding linked projects) ───────────────────────

const LS_PROJECTS = 'synkord_projects'
const LS_SOURCES = 'synkord_project_sources'

export interface LocalProject {
  id: string
  name: string
  localPath: string
  orgId: string
}

export interface ProjectSource {
  projectId: string
  packName: string
  filePath: string
  contentType: string
  lastBoundAt: string
}

export function getLocalProjects(): LocalProject[] {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS) ?? '[]') as LocalProject[] }
  catch { return [] }
}

export function getProjectSources(): ProjectSource[] {
  try { return JSON.parse(localStorage.getItem(LS_SOURCES) ?? '[]') as ProjectSource[] }
  catch { return [] }
}

/**
 * Find all local projects that consume a given pack,
 * and return their paths + consumed packs list.
 */
export function getProjectsConsumingPack(packName: string, orgId: string): LocalProject[] {
  const sources = getProjectSources()
  const projects = getLocalProjects()

  const projectIds = new Set(
    sources
      .filter((s) => s.packName === packName)
      .map((s) => s.projectId),
  )

  return projects.filter((p) => p.orgId === orgId && projectIds.has(p.id))
}

/**
 * Get pack names consumed by a project.
 */
export function getConsumedPackNames(projectId: string): string[] {
  const sources = getProjectSources()
  return [...new Set(sources.filter((s) => s.projectId === projectId).map((s) => s.packName))]
}
