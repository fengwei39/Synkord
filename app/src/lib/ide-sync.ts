/**
 * ide-sync.ts
 *
 * Generates IDE-specific configuration files for a linked project.
 * Strategy: only write a file when (a) its target IDE/tool is detected in the
 * project, and (b) the content has actually changed since the last sync.
 *
 * Always written (Synkord's own config):
 *   .synkord/config.json
 *
 * Written only when the IDE directory / marker file already exists:
 *   .cursor/rules/synkord.md   ← requires .cursor/ directory
 *   .cursor/mcp.json           ← requires .cursor/ directory
 *   .vscode/mcp.json           ← requires .vscode/ directory
 *   CLAUDE.md                  ← requires CLAUDE.md already present
 *   AGENTS.md                  ← requires AGENTS.md already present
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
  files: string[]       // files actually written
  skipped: string[]     // files skipped (unchanged or IDE not detected)
  error?: string
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Writes/updates IDE config files for a linked project.
 * - Skips files whose IDE is not detected in the project directory.
 * - Skips files whose content has not changed.
 */
export async function syncIDEFiles(
  projectPath: string,
  config: SynkordProjectConfig,
  packs: SyncPack[],
): Promise<SyncResult> {
  const written: string[] = []
  const skipped: string[] = []

  const read = async (rel: string): Promise<string | null> => {
    try { return await window.electronAPI.readTextFile(joinPath(projectPath, rel)) }
    catch { return null }
  }

  // Write only if content changed; create parent dirs automatically.
  const writeIfChanged = async (rel: string, newContent: string) => {
    const existing = await read(rel)
    if (existing === newContent) {
      skipped.push(rel)
      return
    }
    await window.electronAPI.writeFile(joinPath(projectPath, rel), newContent)
    written.push(rel)
  }

  // Check if a directory exists by trying to read one level.
  const dirExists = async (rel: string): Promise<boolean> => {
    try {
      await window.electronAPI.readDirTree(joinPath(projectPath, rel))
      return true
    } catch { return false }
  }

  // Check if a file exists.
  const fileExists = async (rel: string): Promise<boolean> => {
    return (await read(rel)) !== null
  }

  try {
    const cfg: SynkordProjectConfig = { ...config, lastSyncedAt: new Date().toISOString() }

    // 1. .synkord/config.json  — always write (our own config)
    await writeIfChanged('.synkord/config.json', JSON.stringify(cfg, null, 2) + '\n')

    // 2–3. Cursor  — only if .cursor/ exists
    if (await dirExists('.cursor')) {
      await writeIfChanged('.cursor/rules/synkord.md', buildCursorRules(cfg, packs))
      const cursorMcp = (await read('.cursor/mcp.json')) ?? ''
      await writeIfChanged('.cursor/mcp.json', mergeMCPConfig(cursorMcp))
    }

    // 4. VS Code  — only if .vscode/ exists
    if (await dirExists('.vscode')) {
      const vscodeMcp = (await read('.vscode/mcp.json')) ?? ''
      await writeIfChanged('.vscode/mcp.json', mergeMCPConfig(vscodeMcp))
    }

    // 5. CLAUDE.md  — only if the file already exists
    if (await fileExists('CLAUDE.md')) {
      const claudeMd = (await read('CLAUDE.md')) ?? ''
      await writeIfChanged('CLAUDE.md', updateMarkdownSection(claudeMd, cfg, packs))
    }

    // 6. AGENTS.md  — only if the file already exists
    if (await fileExists('AGENTS.md')) {
      const agentsMd = (await read('AGENTS.md')) ?? ''
      await writeIfChanged('AGENTS.md', updateMarkdownSection(agentsMd, cfg, packs))
    }

    return { ok: true, files: written, skipped }
  } catch (err: unknown) {
    return { ok: false, files: written, skipped, error: String(err) }
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

function joinPath(base: string, ...rel: string[]): string {
  // Normalize the base to use forward slashes, then append relative parts
  const normalBase = base.replace(/\\/g, '/')
  const joined = [normalBase, ...rel].join('/')
  return joined.replace(/\/+/g, '/')
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
 * Get all local projects linked to a given org (regardless of pack bindings).
 */
export function getProjectsByOrg(orgId: string): LocalProject[] {
  return getLocalProjects().filter((p) => p.orgId === orgId)
}

/**
 * Get pack names consumed by a project.
 */
export function getConsumedPackNames(projectId: string): string[] {
  const sources = getProjectSources()
  return [...new Set(sources.filter((s) => s.projectId === projectId).map((s) => s.packName))]
}
