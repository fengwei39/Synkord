import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  listPacks, getPack, listVersions, getDiff,
  createPack, updatePack,
  listSubscribers, addSubscriber, removeSubscriber,
  bumpPatch, detectContentType,
  type PackListItem, type PackDetail,
  type VersionInfo, type DiffResult, type DiffHunk,
  type SubscriberItem,
} from '../lib/contracts'
import {
  syncIDEFiles, getProjectsByOrg, getConsumedPackNames, getProjectsConsumingPack, getProjectSources,
  type SynkordProjectConfig, type LocalProject, type ProjectSource,
} from '../lib/ide-sync'
import styles from './ContractsPage.module.css'

type DetailTab = 'content' | 'versions' | 'subscribers' | 'projects'

interface Props { orgId: string; orgSlug?: string }

export default function ContractsPage({ orgId, orgSlug = '' }: Props) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('content')
  const [showEditor, setShowEditor] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const queryClient = useQueryClient()

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ['packs', orgId],
    queryFn: () => listPacks(orgId),
    enabled: !!orgId,
  })

  const { data: packDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['pack-detail', orgId, selectedPack],
    queryFn: () => getPack(orgId, selectedPack!),
    enabled: !!selectedPack && !showEditor,
  })

  function selectPack(name: string) {
    setSelectedPack(name)
    setTab('content')
    setShowEditor(false)
  }

  function openNew() {
    setEditorMode('create')
    setShowEditor(true)
    setSelectedPack(null)
  }

  function openEdit() {
    setEditorMode('edit')
    setShowEditor(true)
  }

  function handleSaved(name: string) {
    setShowEditor(false)
    queryClient.invalidateQueries({ queryKey: ['packs', orgId] })
    setSelectedPack(name)
    setTab('content')
    queryClient.invalidateQueries({ queryKey: ['pack-detail', orgId, name] })
  }

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>契约包</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className={styles.packCount}>{packs.length}</span>
            <button className={styles.newBtn} onClick={openNew} title="新建契约包">＋</button>
          </div>
        </div>

        {packsLoading && <p className={styles.hint}>加载中…</p>}

        <ul className={styles.packList}>
          {packs.map((p) => (
            <PackItem
              key={p.name}
              pack={p}
              selected={selectedPack === p.name}
              onClick={() => selectPack(p.name)}
            />
          ))}
        </ul>

        {!packsLoading && packs.length === 0 && (
          <div className={styles.emptyHint}>
            <p className={styles.hint}>暂无契约包</p>
            <button className={styles.newBtnLarge} onClick={openNew}>＋ 新建契约包</button>
          </div>
        )}
      </aside>

      {/* ── Main panel ── */}
      <main className={styles.detail}>
        {/* Editor */}
        {showEditor && (
          <PackEditor
            orgId={orgId}
            orgSlug={orgSlug}
            mode={editorMode}
            existing={editorMode === 'edit' ? packDetail : undefined}
            onSaved={handleSaved}
            onCancel={() => setShowEditor(false)}
          />
        )}

        {/* Placeholder */}
        {!showEditor && !selectedPack && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>📄</p>
            <p className={styles.emptyText}>选择左侧契约包，或新建一个</p>
            <button className={styles.newBtnLarge} onClick={openNew}>＋ 新建契约包</button>
          </div>
        )}

        {/* Detail view */}
        {!showEditor && selectedPack && (
          <>
            {detailLoading && <p className={styles.hint}>加载中…</p>}
            {!detailLoading && packDetail && (
              <>
                <div className={styles.tabBar}>
                  <button
                    className={`${styles.tab} ${tab === 'content' ? styles.tabActive : ''}`}
                    onClick={() => setTab('content')}
                  >内容</button>
                  <button
                    className={`${styles.tab} ${tab === 'versions' ? styles.tabActive : ''}`}
                    onClick={() => setTab('versions')}
                  >版本历史</button>
                  <button
                    className={`${styles.tab} ${tab === 'subscribers' ? styles.tabActive : ''}`}
                    onClick={() => setTab('subscribers')}
                  >使用者</button>
                  <button
                    className={`${styles.tab} ${tab === 'projects' ? styles.tabActive : ''}`}
                    onClick={() => setTab('projects')}
                  >关联项目</button>
                  <span style={{ flex: 1 }} />
                  <SyncButton
                    orgId={orgId}
                    orgSlug={orgSlug}
                    pack={packDetail}
                  />
                  <button className={styles.editBtn} onClick={openEdit}>✏️ 编辑</button>
                </div>

                {tab === 'content' && (
                  <ContentViewer detail={packDetail} />
                )}
                {tab === 'versions' && (
                  <VersionsTab orgId={orgId} packName={selectedPack} />
                )}
                {tab === 'subscribers' && (
                  <SubscribersTab orgId={orgId} packName={selectedPack} latestVersion={packDetail.version} />
                )}
                {tab === 'projects' && (
                  <LinkedProjectsTab orgId={orgId} packName={selectedPack} />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Sidebar item ─────────────────────────────────────────────────────────────

function PackItem({ pack, selected, onClick }: {
  pack: PackListItem; selected: boolean; onClick: () => void
}) {
  const typeColors: Record<string, string> = {
    markdown: '#a78bfa', yaml: '#34d399', json: '#60a5fa',
    typescript: '#38bdf8', go: '#4ade80', sql: '#fbbf24',
  }
  const color = typeColors[pack.contentType] ?? '#94a3b8'

  return (
    <li
      className={`${styles.packItem} ${selected ? styles.packItemSelected : ''}`}
      onClick={onClick}
    >
      <span className={styles.packTypeDot} style={{ background: color }} />
      <span className={styles.packItemName}>{pack.name}</span>
      <span className={styles.packItemVer}>v{pack.version}</span>
    </li>
  )
}

// ─── Multi-file content parser ───────────────────────────────────────────────

interface ParsedFile {
  path: string      // relative path, e.g. "src/api/user.ts"
  name: string      // filename, e.g. "user.ts"
  content: string
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  file?: ParsedFile
}

function parseMultiFileContent(raw: string): ParsedFile[] {
  // Split by separator line "---" (may have surrounding newlines)
  const sections = raw.split(/\n---\n/)
  const files: ParsedFile[] = []

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    // First line should be "# path/to/file"
    const firstNewline = trimmed.indexOf('\n')
    const firstLine = firstNewline === -1 ? trimmed : trimmed.slice(0, firstNewline)
    const rest = firstNewline === -1 ? '' : trimmed.slice(firstNewline + 1).trim()

    if (firstLine.startsWith('# ')) {
      const filePath = firstLine.slice(2).trim()
      files.push({
        path: filePath,
        name: filePath.split('/').pop() ?? filePath,
        content: rest,
      })
    } else {
      // Single-file pack (no header) — treat as root file
      files.push({ path: '_content', name: '_content', content: trimmed })
    }
  }

  return files.length > 0 ? files : [{ path: '_content', name: '_content', content: raw }]
}

function buildTree(files: ParsedFile[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let nodes = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      let node = nodes.find((n) => n.name === part)
      if (!node) {
        node = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        }
        nodes.push(node)
      }
      if (!isLast) nodes = node.children
    }
  }

  return root
}

// ─── Content viewer (tree + code panel) ──────────────────────────────────────

function ContentViewer({ detail }: { detail: PackDetail }) {
  const files = parseMultiFileContent(detail.content)
  const isMultiFile = files.length > 1 || (files.length === 1 && files[0].path !== '_content')
  const tree = buildTree(files)
  const [selectedFile, setSelectedFile] = useState<ParsedFile>(files[0])

  // Reset to first file when pack changes
  const firstPath = files[0]?.path
  const [lastFirst, setLastFirst] = useState(firstPath)
  if (firstPath !== lastFirst) {
    setLastFirst(firstPath)
    setSelectedFile(files[0])
  }

  const lines = selectedFile.content.split('\n')
  const ct = selectedFile.name !== '_content'
    ? detectFileType(selectedFile.name)
    : (detail.contentType || 'text')

  return (
    <div className={styles.viewer}>
      <div className={styles.viewerMeta}>
        <span className={styles.metaType}>{detail.contentType || 'text'}</span>
        <span className={styles.metaVer}>v{detail.version}</span>
        {isMultiFile && (
          <span className={styles.metaFiles}>{files.length} 个文件</span>
        )}
      </div>

      <div className={styles.viewerBody}>
        {/* Tree sidebar (only for multi-file packs) */}
        {isMultiFile && (
          <div className={styles.treeSidebar}>
            {tree.map((node) => (
              <TreeNodeView
                key={node.path}
                node={node}
                selectedPath={selectedFile.path}
                onSelect={(f) => setSelectedFile(f)}
                depth={0}
              />
            ))}
          </div>
        )}

        {/* Code panel */}
        <div className={styles.codeWrap}>
          {isMultiFile && (
            <div className={styles.codePath}>
              <span className={styles.codePathType}>{ct}</span>
              <span className={styles.codePathName}>{selectedFile.path}</span>
            </div>
          )}
          <div className={styles.codeScroll}>
            <div className={styles.lineNums}>
              {lines.map((_, i) => (
                <span key={i} className={styles.lineNum}>{i + 1}</span>
              ))}
            </div>
            <pre className={styles.codeContent}>{selectedFile.content}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

function TreeNodeView({ node, selectedPath, onSelect, depth }: {
  node: TreeNode
  selectedPath: string
  onSelect: (f: ParsedFile) => void
  depth: number
}) {
  const [open, setOpen] = useState(true)
  const indent = depth * 14

  if (node.isDir) {
    return (
      <div>
        <button
          className={styles.treeDir}
          style={{ paddingLeft: 8 + indent }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.treeChevron}>{open ? '▾' : '▸'}</span>
          <span className={styles.treeDirIcon}>📁</span>
          <span className={styles.treeName}>{node.name}</span>
        </button>
        {open && node.children.map((child) => (
          <TreeNodeView
            key={child.path}
            node={child}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
      </div>
    )
  }

  const isSelected = node.file?.path === selectedPath
  return (
    <button
      className={`${styles.treeFile} ${isSelected ? styles.treeFileSelected : ''}`}
      style={{ paddingLeft: 8 + indent }}
      onClick={() => node.file && onSelect(node.file)}
    >
      <span className={styles.treeFileIcon}>{fileTypeIcon(node.name)}</span>
      <span className={styles.treeName}>{node.name}</span>
    </button>
  )
}

function detectFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    md: 'markdown', yaml: 'yaml', yml: 'yaml', json: 'json',
    ts: 'typescript', tsx: 'typescript', go: 'go', sql: 'sql',
    proto: 'proto', txt: 'text',
  }
  return map[ext] ?? 'text'
}

function fileTypeIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const icons: Record<string, string> = {
    md: '📝', markdown: '📝', yaml: '⚙️', yml: '⚙️', json: '📋',
    ts: '🔷', tsx: '🔷', go: '🐹', sql: '🗄️', proto: '📡', txt: '📄',
  }
  return icons[ext] ?? '📄'
}

// ─── Versions tab ─────────────────────────────────────────────────────────────

function VersionsTab({ orgId, packName }: { orgId: string; packName: string }) {
  const [fromVer, setFromVer] = useState('')
  const [toVer, setToVer] = useState('')
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const { data: versions = [] } = useQuery({
    queryKey: ['versions', orgId, packName],
    queryFn: () => listVersions(orgId, packName),
  })

  async function handleDiff() {
    if (!fromVer || !toVer) return
    setDiffLoading(true)
    try {
      const r = await getDiff(orgId, packName, fromVer, toVer)
      setDiffResult(r)
    } finally {
      setDiffLoading(false)
    }
  }

  return (
    <div className={styles.versionsTab}>
      {/* Version list */}
      <div className={styles.verList}>
        {versions.map((v) => (
          <div key={v.tagName} className={styles.verItem}>
            <span className={styles.verBadge}>v{v.version}</span>
            <span className={styles.verAuthor}>{v.authorEmail}</span>
            <span className={styles.verDate}>
              {new Date(v.committedAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        ))}
      </div>

      {/* Diff selector */}
      {versions.length >= 2 && (
        <div className={styles.diffSelector}>
          <select value={fromVer} onChange={(e) => setFromVer(e.target.value)} className={styles.verSelect}>
            <option value="">from 版本</option>
            {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
          </select>
          <span className={styles.diffArrow}>→</span>
          <select value={toVer} onChange={(e) => setToVer(e.target.value)} className={styles.verSelect}>
            <option value="">to 版本</option>
            {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
          </select>
          <button
            className={styles.diffBtn}
            onClick={handleDiff}
            disabled={!fromVer || !toVer || diffLoading}
          >
            {diffLoading ? '对比中…' : '查看 diff'}
          </button>
        </div>
      )}

      {diffResult && <LineDiffView result={diffResult} />}
    </div>
  )
}

// ─── Subscribers tab ──────────────────────────────────────────────────────────

function SubscribersTab({ orgId, packName, latestVersion }: {
  orgId: string; packName: string; latestVersion: string
}) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [addError, setAddError] = useState('')

  const { data: subscribers = [], isLoading } = useQuery({
    queryKey: ['subscribers', orgId, packName],
    queryFn: () => listSubscribers(orgId, packName),
  })

  const addMutation = useMutation({
    mutationFn: (e: string) => addSubscriber(orgId, packName, e),
    onSuccess: () => {
      setEmail('')
      setAddError('')
      queryClient.invalidateQueries({ queryKey: ['subscribers', orgId, packName] })
    },
    onError: (err: Error) => setAddError(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeSubscriber(orgId, packName, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers', orgId, packName] })
    },
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setAddError('')
    addMutation.mutate(email.trim())
  }

  const upToDate = subscribers.filter((s) => s.isLatest).length
  const outdated = subscribers.filter((s) => !s.isLatest).length

  return (
    <div className={styles.subscribersTab}>
      {/* Summary bar */}
      <div className={styles.subSummary}>
        <span className={styles.subTotal}>{subscribers.length} 位使用者</span>
        {subscribers.length > 0 && (
          <>
            <span className={styles.subUpToDate}>✓ {upToDate} 最新</span>
            {outdated > 0 && <span className={styles.subOutdated}>⚠ {outdated} 需更新</span>}
          </>
        )}
      </div>

      {/* Add subscriber form */}
      <form className={styles.subAddForm} onSubmit={handleAdd}>
        <input
          className={styles.subEmailInput}
          placeholder="输入成员邮箱（需已加入组织）"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="submit"
          className={styles.subAddBtn}
          disabled={addMutation.isPending || !email.trim()}
        >
          {addMutation.isPending ? '添加中…' : '+ 添加'}
        </button>
      </form>
      {addError && <p className={styles.subError}>{addError}</p>}

      {/* Subscriber list */}
      {isLoading && <p className={styles.hint}>加载中…</p>}
      {!isLoading && subscribers.length === 0 && (
        <p className={styles.hint}>暂无使用者，可在上方添加组织成员</p>
      )}
      {subscribers.map((s) => (
        <SubscriberRow
          key={s.userId}
          item={s}
          latestVersion={latestVersion}
          onRemove={() => removeMutation.mutate(s.userId)}
          removing={removeMutation.isPending}
        />
      ))}
    </div>
  )
}

function platformLabel(platform: string): string {
  if (platform === 'darwin') return '🍎 macOS'
  if (platform === 'win32') return '🪟 Windows'
  if (platform === 'linux') return '🐧 Linux'
  return platform || '—'
}

function SubscriberRow({ item, latestVersion, onRemove, removing }: {
  item: SubscriberItem
  latestVersion: string
  onRemove: () => void
  removing: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const syncTime = item.updatedAt
    ? new Date(item.updatedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
    : null

  const gitEmails = item.git?.emails?.filter(Boolean) ?? []
  const projects = item.projectNames?.filter(Boolean) ?? []
  const hasDetail = item.device?.hostname || gitEmails.length > 0 || projects.length > 0

  return (
    <div className={`${styles.subRow} ${expanded ? styles.subRowExpanded : ''}`}>
      {/* Header row */}
      <div className={styles.subRowHeader}>
        <div className={styles.subAvatar}>{item.email[0].toUpperCase()}</div>
        <div className={styles.subInfo}>
          <span className={styles.subEmail}>{item.email}</span>
          <span className={styles.subVer}>
            固定版本 <code>v{item.pinnedVersion || '—'}</code>
            {syncTime && <> · 同步于 {syncTime}</>}
          </span>
        </div>
        <div className={styles.subStatus}>
          {item.pinnedVersion === latestVersion ? (
            <span className={styles.badgeLatest}>✓ 最新</span>
          ) : (
            <span className={styles.badgeOutdated}>⚠ 需更新 → v{latestVersion}</span>
          )}
        </div>
        {hasDetail && (
          <button
            className={styles.subExpandBtn}
            onClick={() => setExpanded((x) => !x)}
            title={expanded ? '收起' : '展开详情'}
          >{expanded ? '▲' : '▼'}</button>
        )}
        <button
          className={styles.subRemoveBtn}
          onClick={onRemove}
          disabled={removing}
          title="移除使用者"
        >✕</button>
      </div>

      {/* Detail panel */}
      {expanded && (
        <div className={styles.subDetail}>
          {item.device?.hostname && (
            <div className={styles.subDetailRow}>
              <span className={styles.subDetailLabel}>设备</span>
              <span className={styles.subDetailValue}>
                {platformLabel(item.device.platform)}
                {' · '}{item.device.hostname}
                {item.device.username && <> ({item.device.username})</>}
              </span>
            </div>
          )}
          {gitEmails.length > 0 && (
            <div className={styles.subDetailRow}>
              <span className={styles.subDetailLabel}>Git 邮箱</span>
              <span className={styles.subDetailValue}>{gitEmails.join(' · ')}</span>
            </div>
          )}
          {projects.length > 0 && (
            <div className={styles.subDetailRow}>
              <span className={styles.subDetailLabel}>本地项目</span>
              <div className={styles.subDetailTags}>
                {projects.map((p) => (
                  <span key={p} className={styles.subDetailTag}>{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Linked projects tab ──────────────────────────────────────────────────────

function LinkedProjectsTab({ orgId, packName }: { orgId: string; packName: string }) {
  // Local data only — no API call needed
  const linked: LocalProject[] = getProjectsConsumingPack(packName, orgId)
  const allSources: ProjectSource[] = getProjectSources()

  // All projects in this org (so user can also see unlinked ones)
  const allOrgProjects: LocalProject[] = getProjectsByOrg(orgId)
  const linkedIds = new Set(linked.map((p) => p.id))
  const unlinked = allOrgProjects.filter((p) => !linkedIds.has(p.id))

  return (
    <div className={styles.linkedProjectsTab}>
      {linked.length === 0 && (
        <p className={styles.hint}>
          暂无关联项目。在「本地项目」页选择文件后发布为契约包，项目会自动出现在此处。
        </p>
      )}

      {linked.length > 0 && (
        <>
          <p className={styles.linkedSectionTitle}>
            <span className={styles.linkedDot} />
            已关联 ({linked.length})
          </p>
          {linked.map((p) => {
            const source = allSources.find((s) => s.projectId === p.id && s.packName === packName)
            return (
              <LinkedProjectRow key={p.id} project={p} source={source ?? null} linked />
            )
          })}
        </>
      )}

      {unlinked.length > 0 && (
        <>
          <p className={styles.linkedSectionTitle} style={{ marginTop: 20 }}>
            <span className={styles.linkedDot} style={{ background: '#334155' }} />
            同组织其他项目 ({unlinked.length})
          </p>
          {unlinked.map((p) => (
            <LinkedProjectRow key={p.id} project={p} source={null} linked={false} />
          ))}
        </>
      )}

      {allOrgProjects.length === 0 && (
        <p className={styles.hint}>该组织下暂无本地项目，请前往「本地项目」页添加。</p>
      )}
    </div>
  )
}

function LinkedProjectRow({ project, source, linked }: {
  project: LocalProject
  source: ProjectSource | null
  linked: boolean
}) {
  const lastBound = source?.lastBoundAt
    ? new Date(source.lastBoundAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <div className={`${styles.linkedRow} ${linked ? styles.linkedRowActive : styles.linkedRowDim}`}>
      <div className={styles.linkedIcon}>{linked ? '🔗' : '📁'}</div>
      <div className={styles.linkedInfo}>
        <span className={styles.linkedName}>{project.name}</span>
        <span className={styles.linkedPath} title={project.localPath}>{project.localPath}</span>
        {source && (
          <span className={styles.linkedMeta}>
            来源文件：<code>{source.filePath}</code>
            {lastBound && <> · 上次同步：{lastBound}</>}
          </span>
        )}
      </div>
      {linked && <span className={styles.linkedBadge}>已绑定</span>}
    </div>
  )
}

// ─── Line diff view ───────────────────────────────────────────────────────────

function LineDiffView({ result }: { result: DiffResult }) {
  if (result.hunks.length === 0) {
    return <p className={styles.hint} style={{ padding: 16 }}>两版本内容相同</p>
  }

  return (
    <div className={styles.lineDiff}>
      <div className={styles.diffMeta}>
        <span className={`${styles.diffStat} ${styles.diffStatAdded}`}>+{result.stats.added}</span>
        <span className={`${styles.diffStat} ${styles.diffStatRemoved}`}>-{result.stats.removed}</span>
        <span className={styles.diffRange}>{result.from} → {result.to}</span>
      </div>
      {result.hunks.map((hunk, hi) => (
        <DiffHunkBlock key={hi} hunk={hunk} />
      ))}
    </div>
  )
}

function DiffHunkBlock({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className={styles.hunk}>
      <div className={styles.hunkHeader}>
        @@ -{hunk.oldStart} +{hunk.newStart} @@
      </div>
      {hunk.lines.map((line, i) => (
        <div
          key={i}
          className={`${styles.diffLine} ${
            line.type === 'added' ? styles.diffLineAdded :
            line.type === 'removed' ? styles.diffLineRemoved : styles.diffLineCtx
          }`}
        >
          <span className={styles.diffLineNum}>{line.oldNum || ''}</span>
          <span className={styles.diffLineNum}>{line.newNum || ''}</span>
          <span className={styles.diffSign}>
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          <span className={styles.diffContent}>{line.content}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Pack editor ──────────────────────────────────────────────────────────────

function PackEditor({
  orgId, orgSlug, mode, existing, onSaved, onCancel,
}: {
  orgId: string
  orgSlug: string
  mode: 'create' | 'edit'
  existing?: PackDetail
  onSaved: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [version, setVersion] = useState(
    mode === 'edit' && existing ? bumpPatch(existing.version) : '0.1.0'
  )
  const [content, setContent] = useState(existing?.content ?? '')
  const [contentType, setContentType] = useState(existing?.contentType ?? 'text')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleImport() {
    const path = await window.electronAPI.pickFile()
    if (!path) return
    const text = await window.electronAPI.readTextFile(path)
    setContent(text)
    const ct = detectContentType(path)
    setContentType(ct)
  }

  async function handleSave() {
    setError('')
    if (!content.trim()) { setError('内容不能为空'); return }
    setSaving(true)
    try {
      const packName = mode === 'create' ? name.trim() : existing!.name
      if (mode === 'create') {
        await createPack(orgId, packName, version.trim(), content, contentType)
      } else {
        await updatePack(orgId, packName, version.trim(), content, contentType)
      }
      onSaved(packName)
      // Async: sync IDE files for all projects consuming this pack
      void syncLinkedProjects(orgId, orgSlug, packName, version.trim(), content, contentType)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e.response?.data?.error ?? e.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.editor}>
      {/* Header */}
      <div className={styles.editorHeader}>
        <h3 className={styles.editorTitle}>
          {mode === 'create' ? '新建契约包' : `编辑 ${existing?.name}`}
        </h3>
        <button className={styles.editorClose} onClick={onCancel}>✕</button>
      </div>

      {/* Meta row */}
      <div className={styles.editorMeta}>
        {mode === 'create' && (
          <div className={styles.editorField}>
            <label className={styles.editorLabel}>名称</label>
            <input
              className={styles.editorInput}
              placeholder="user-api"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))}
            />
          </div>
        )}
        <div className={styles.editorField}>
          <label className={styles.editorLabel}>版本</label>
          <input
            className={styles.editorInput}
            placeholder="0.1.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </div>
        <div className={styles.editorField}>
          <label className={styles.editorLabel}>类型</label>
          <select
            className={styles.editorInput}
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
          >
            {['text', 'markdown', 'yaml', 'json', 'typescript', 'go', 'sql', 'proto'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button className={styles.importBtn} onClick={handleImport}>📂 从文件导入</button>
      </div>

      {/* Textarea */}
      <textarea
        className={styles.editorTextarea}
        placeholder="在此粘贴或编辑契约内容…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />

      {error && <p className={styles.editorError}>{error}</p>}

      {/* Actions */}
      <div className={styles.editorActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>取消</button>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving || !content.trim() || (mode === 'create' && !name.trim())}
        >
          {saving ? '发布中…' : mode === 'create' ? '创建并发布' : '发布新版本'}
        </button>
      </div>
    </div>
  )
}

// ─── Sync button ─────────────────────────────────────────────────────────────

function SyncButton({ orgId, orgSlug, pack }: {
  orgId: string
  orgSlug: string
  pack: PackDetail
}) {
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSync() {
    setSyncing(true)
    setMsg('')
    try {
      const result = await syncAllProjects(orgId, orgSlug, [pack])
      if (result.projects === 0) {
        setMsg('暂无关联项目')
      } else {
        setMsg(`✓ 已同步 ${result.projects} 个项目`)
      }
    } catch {
      setMsg('同步失败')
    } finally {
      setSyncing(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {msg && <span style={{ color: '#64748b', fontSize: 12 }}>{msg}</span>}
      <button
        className={styles.syncBtn}
        onClick={handleSync}
        disabled={syncing}
        title="将此契约同步到所有已关联的本地项目（写入IDE配置文件）"
      >
        {syncing ? '⏳' : '🔄'} 同步到项目
      </button>
    </div>
  )
}

// ─── IDE sync helpers ─────────────────────────────────────────────────────────

/**
 * Sync all org-linked local projects with the given packs (or fetch all packs if not provided).
 * Returns the number of projects synced.
 */
async function syncAllProjects(
  orgId: string,
  orgSlug: string,
  knownPacks?: PackDetail[],
): Promise<{ projects: number }> {
  const linkedProjects = getProjectsByOrg(orgId)
  if (linkedProjects.length === 0) return { projects: 0 }

  // Build a pack cache to avoid redundant fetches
  const packCache = new Map<string, PackDetail>()
  if (knownPacks) {
    for (const p of knownPacks) packCache.set(p.name, p)
  }

  for (const project of linkedProjects) {
    // Determine which packs this project consumes
    const boundNames = getConsumedPackNames(project.id)
    // If no bindings, include all known packs passed in
    const packNames = boundNames.length > 0 ? boundNames : (knownPacks?.map((p) => p.name) ?? [])
    if (packNames.length === 0) continue

    const packDetails = await Promise.all(
      packNames.map(async (name) => {
        if (packCache.has(name)) return packCache.get(name)!
        try {
          const d = await getPack(orgId, name)
          packCache.set(name, d)
          return d
        } catch { return null }
      }),
    )

    const packs = packDetails.filter(Boolean).map((d) => ({
      name: d!.name,
      version: d!.version,
      contentType: d!.contentType || 'text',
      content: d!.content,
    }))

    const config: SynkordProjectConfig = {
      orgId,
      orgSlug,
      project: project.name,
      consumes: packNames,
    }

    await syncIDEFiles(project.localPath, config, packs)
  }

  return { projects: linkedProjects.length }
}

async function syncLinkedProjects(
  orgId: string,
  orgSlug: string,
  publishedPackName: string,
  publishedVersion: string,
  publishedContent: string,
  publishedContentType: string,
) {
  const publishedPack: PackDetail = {
    name: publishedPackName,
    version: publishedVersion,
    contentType: publishedContentType,
    content: publishedContent,
  }
  await syncAllProjects(orgId, orgSlug, [publishedPack])
}
