/**
 * ProjectsPage — local project management with multi-file contract pack building.
 * Projects are stored in localStorage (local-only concept).
 */
import { useState, useEffect } from 'react'
import { detectContentType, getPack } from '../lib/contracts'
import {
  syncIDEFiles,
  getConsumedPackNames,
  type SynkordProjectConfig,
} from '../lib/ide-sync'
import styles from './ProjectsPage.module.css'

interface Project {
  id: string
  name: string
  localPath: string
  orgId: string
}

interface ProjectSource {
  projectId: string
  packName: string
  filePath: string
  contentType: string
  lastBoundAt: string
}

const LS_PROJECTS = 'synkord_projects'
const LS_SOURCES = 'synkord_project_sources'

function loadProjects(): Project[] {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS) ?? '[]') as Project[] }
  catch { return [] }
}
function saveProjects(p: Project[]) { localStorage.setItem(LS_PROJECTS, JSON.stringify(p)) }
function loadSources(): ProjectSource[] {
  try { return JSON.parse(localStorage.getItem(LS_SOURCES) ?? '[]') as ProjectSource[] }
  catch { return [] }
}
function saveSources(s: ProjectSource[]) { localStorage.setItem(LS_SOURCES, JSON.stringify(s)) }

interface Props { orgId: string; orgName: string; orgSlug: string }

export default function ProjectsPage({ orgId, orgName, orgSlug }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    setProjects(loadProjects().filter((p) => p.orgId === orgId))
  }, [orgId])

  function handleAdd(name: string, localPath: string) {
    const p: Project = { id: `${Date.now()}`, name, localPath, orgId }
    const next = [...projects, p]
    setProjects(next)
    saveProjects([...loadProjects().filter((x) => x.orgId !== orgId), ...next])
    setShowAdd(false)
    setSelected(p)
  }

  function handleDelete(id: string) {
    const next = projects.filter((p) => p.id !== id)
    setProjects(next)
    saveProjects([...loadProjects().filter((x) => x.orgId !== orgId), ...next])
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>本地项目</span>
          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>＋</button>
        </div>
        {projects.length === 0 && (
          <div className={styles.emptyHint}>
            <p className={styles.hint}>暂无本地项目</p>
            <button className={styles.addBtnLarge} onClick={() => setShowAdd(true)}>＋ 关联本地项目</button>
          </div>
        )}
        <ul className={styles.projectList}>
          {projects.map((p) => (
            <li
              key={p.id}
              className={`${styles.projectItem} ${selected?.id === p.id ? styles.projectItemSelected : ''}`}
              onClick={() => setSelected(p)}
            >
              <span className={styles.projectIcon}>📁</span>
              <span className={styles.projectName}>{p.name}</span>
              <button
                className={styles.deleteBtn}
                onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
              >✕</button>
            </li>
          ))}
        </ul>
      </aside>

      <main className={styles.main}>
        {showAdd && <AddProjectPanel onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

        {!showAdd && !selected && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>🗂️</p>
            <p className={styles.emptyText}>选择左侧项目，或关联一个新项目</p>
            <p className={styles.emptyDesc}>关联本地项目目录后，可以多选文件/目录，将内容发布为「{orgName}」的契约包</p>
            <button className={styles.addBtnLarge} onClick={() => setShowAdd(true)}>＋ 关联本地项目</button>
          </div>
        )}

        {!showAdd && selected && (
          <ProjectDetail project={selected} orgId={orgId} orgSlug={orgSlug} />
        )}
      </main>
    </div>
  )
}

// ─── Add project panel ────────────────────────────────────────────────────────

function AddProjectPanel({ onAdd, onCancel }: {
  onAdd: (name: string, path: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')

  async function handlePickDir() {
    const dir = await window.electronAPI.pickDirectory()
    if (!dir) return
    setPath(dir)
    if (!name) setName(dir.split(/[\\/]/).pop() ?? dir)
  }

  return (
    <div className={styles.addPanel}>
      <h3 className={styles.addTitle}>关联本地项目</h3>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>项目名称</label>
        <input className={styles.fieldInput} placeholder="例：后端服务" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>本地目录</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className={styles.fieldInput} style={{ flex: 1 }} placeholder="选择项目根目录…" value={path} readOnly />
          <button className={styles.pickBtn} onClick={handlePickDir}>📂 选择目录</button>
        </div>
      </div>
      <div className={styles.addActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>取消</button>
        <button className={styles.saveBtn} disabled={!name.trim() || !path.trim()} onClick={() => onAdd(name.trim(), path.trim())}>确认关联</button>
      </div>
    </div>
  )
}

// ─── Project detail: multi-select file tree ───────────────────────────────────

interface DirEntry { name: string; isDir: boolean; path: string }

function ProjectDetail({ project, orgId, orgSlug }: {
  project: Project; orgId: string; orgSlug: string
}) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [currentPath, setCurrentPath] = useState(project.localPath)
  // selected: Set of file/dir paths chosen for inclusion in the pack
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sources, setSources] = useState<ProjectSource[]>([])
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [showPublish, setShowPublish] = useState(false)
  const [buildingContent, setBuildingContent] = useState(false)

  useEffect(() => {
    setCurrentPath(project.localPath)
    setSources(loadSources().filter((s) => s.projectId === project.id))
    setSelected(new Set())
  }, [project.id, project.localPath])

  useEffect(() => { loadDir(currentPath) }, [currentPath])

  async function loadDir(path: string) {
    setError('')
    try {
      const result = await window.electronAPI.readDirTree(path)
      setEntries(result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      }))
    } catch (err) { setError(String(err)) }
  }

  function toggleSelect(entryPath: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(entryPath)) next.delete(entryPath)
      else next.add(entryPath)
      return next
    })
  }

  function clearSelection() { setSelected(new Set()) }

  async function handlePublishSelected() {
    if (selected.size === 0) return
    setBuildingContent(true)
    setShowPublish(true)
    setBuildingContent(false)
  }

  function handleBound(packName: string, contentType: string) {
    const src: ProjectSource = {
      projectId: project.id,
      packName,
      filePath: [...selected].join(','),
      contentType,
      lastBoundAt: new Date().toISOString(),
    }
    const allSrc = loadSources()
    const filtered = allSrc.filter((s) => !(s.projectId === project.id && s.packName === packName))
    const next = [...filtered, src]
    saveSources(next)
    const updated = next.filter((s) => s.projectId === project.id)
    setSources(updated)
    setSelected(new Set())
    setShowPublish(false)
    void triggerSync(updated)
  }

  async function triggerSync(currentSources?: ProjectSource[]) {
    setSyncing(true)
    setSyncMsg('')
    try {
      const srcs = currentSources ?? sources
      const packNames = [...new Set(srcs.map((s) => s.packName))]
      const packDetails = await Promise.all(packNames.map((name) => getPack(orgId, name).catch(() => null)))
      const packs = packDetails.filter(Boolean).map((d) => ({
        name: d!.name, version: d!.version, contentType: d!.contentType, content: d!.content,
      }))
      const config: SynkordProjectConfig = { orgId, orgSlug, project: project.name, consumes: packNames }
      const result = await syncIDEFiles(project.localPath, config, packs)
      setSyncMsg(result.ok ? `✓ 已同步 ${result.files.length} 个文件` : `⚠ ${result.error ?? '失败'}`)
    } catch (err) { setSyncMsg(`⚠ ${String(err)}`) }
    finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  const consumedPacks = [...new Set(sources.map((s) => s.packName))]
  const breadcrumbs = currentPath.replace(project.localPath, project.name).split(/[\\/]/).filter(Boolean)

  return (
    <div className={styles.projectDetail}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <span className={styles.detailName}>{project.name}</span>
          <span className={styles.detailPath}>{project.localPath}</span>
        </div>
        <div className={styles.syncArea}>
          {syncMsg && <span className={styles.syncMsg}>{syncMsg}</span>}
          <button
            className={styles.syncBtn}
            onClick={() => triggerSync()}
            disabled={syncing || consumedPacks.length === 0}
            title={consumedPacks.length === 0 ? '请先绑定契约包' : '同步 IDE 配置文件'}
          >
            {syncing ? '⏳ 同步中…' : '🔄 同步 IDE 文件'}
          </button>
        </div>
      </div>

      {/* Bound packs */}
      {sources.length > 0 && (
        <div className={styles.sourcesBar}>
          <span className={styles.sourcesLabel}>已绑定契约：</span>
          {consumedPacks.map((name) => <span key={name} className={styles.sourceChip}>{name}</span>)}
        </div>
      )}

      {/* Selection toolbar */}
      <div className={styles.selectionBar}>
        <div className={styles.selectionInfo}>
          {selected.size > 0
            ? <><span className={styles.selCount}>{selected.size} 项已选</span><button className={styles.clearSelBtn} onClick={clearSelection}>取消选择</button></>
            : <span className={styles.selHint}>勾选文件或目录，组合为一个契约包</span>
          }
        </div>
        <button
          className={styles.publishSelBtn}
          disabled={selected.size === 0 || buildingContent}
          onClick={handlePublishSelected}
        >
          {buildingContent ? '读取中…' : `📦 发布为契约包（${selected.size}）`}
        </button>
      </div>

      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <button className={styles.breadBtn} onClick={() => setCurrentPath(project.localPath)}>{project.name}</button>
        {currentPath !== project.localPath && (
          <>
            <span className={styles.breadSep}>/</span>
            <button className={styles.breadBtn} onClick={() => {
              const parent = currentPath.replace(/[\\/][^\\/]+$/, '')
              setCurrentPath(parent || project.localPath)
            }}>
              ..
            </button>
          </>
        )}
        {breadcrumbs.slice(1).map((b, i) => (
          <span key={i}><span className={styles.breadSep}>/</span><span className={styles.breadCurrent}>{b}</span></span>
        ))}
      </div>

      {error && <p className={styles.errorHint}>{error}</p>}

      {/* File tree */}
      <div className={styles.fileTree}>
        {entries.map((e) => {
          const isSel = selected.has(e.path)
          return (
            <label key={e.path} className={`${styles.fileEntryRow} ${isSel ? styles.fileEntrySelected : ''}`}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isSel}
                onChange={() => toggleSelect(e.path)}
              />
              <button
                className={styles.fileEntry}
                onClick={() => { if (e.isDir) setCurrentPath(e.path) }}
                tabIndex={-1}
              >
                <span className={styles.fileIcon}>{e.isDir ? '📁' : fileIcon(e.name)}</span>
                <span className={styles.fileName}>{e.name}</span>
                {e.isDir && <span className={styles.dirArrow}>›</span>}
                {!e.isDir && sources.some((s) => s.filePath.includes(e.path)) && (
                  <span className={styles.boundBadge}>✓ 已绑定</span>
                )}
              </button>
            </label>
          )
        })}
        {entries.length === 0 && <p className={styles.hint} style={{ padding: 12 }}>空目录</p>}
      </div>

      {/* Publish modal */}
      {showPublish && (
        <PublishModal
          orgId={orgId}
          projectPath={project.localPath}
          selectedPaths={[...selected]}
          existingSources={sources}
          onPublished={handleBound}
          onClose={() => setShowPublish(false)}
        />
      )}
    </div>
  )
}

// ─── Publish modal: builds content from selected paths ────────────────────────

function PublishModal({ orgId, projectPath, selectedPaths, existingSources, onPublished, onClose }: {
  orgId: string
  projectPath: string
  selectedPaths: string[]
  existingSources: ProjectSource[]
  onPublished: (packName: string, contentType: string) => void
  onClose: () => void
}) {
  const [packName, setPackName] = useState(existingSources[0]?.packName ?? '')
  const [contentType, setContentType] = useState('text')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Build combined content from all selected paths
  useEffect(() => {
    void buildContent()
  }, [])

  async function buildContent() {
    setLoading(true)
    const sections: string[] = []
    const types = new Set<string>()

    for (const selPath of selectedPaths) {
      // Check if it's a directory or file by trying readDirTree
      try {
        // Try as directory first
        const dirEntries = await window.electronAPI.readDirTree(selPath)
        // It's a directory — collect all files recursively
        const allFiles = await window.electronAPI.collectFiles(selPath)
        for (const file of allFiles) {
          const text = await window.electronAPI.readTextFile(file.path).catch(() => '(读取失败)')
          const relPath = file.relPath
          const selRelPath = selPath.replace(projectPath, '').replace(/^[\\/]/, '')
          const displayPath = selRelPath ? `${selRelPath}/${relPath}` : relPath
          sections.push(`# ${displayPath}\n\n${text}`)
          types.add(detectContentType(file.name))
        }
        if (dirEntries.length === 0) {
          sections.push(`# ${selPath.replace(projectPath, '').replace(/^[\\/]/, '') || selPath}\n\n(空目录)`)
        }
      } catch {
        // It's a file
        const text = await window.electronAPI.readTextFile(selPath).catch(() => '(读取失败)')
        const displayPath = selPath.replace(projectPath, '').replace(/^[\\/]/, '') || selPath
        sections.push(`# ${displayPath}\n\n${text}`)
        types.add(detectContentType(selPath.split(/[\\/]/).pop() ?? ''))
      }
    }

    const combined = sections.join('\n\n---\n\n')
    setContent(combined)

    // Auto-detect content type from majority
    if (types.size === 1) {
      const t = [...types][0]
      if (t !== 'text') setContentType(t)
    }

    // Auto-suggest pack name from first selected path's name
    if (!packName) {
      const firstName = selectedPaths[0]?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? ''
      setPackName(firstName.replace(/\s/g, '-'))
    }

    setLoading(false)
  }

  async function handlePublish(mode: 'create' | 'update') {
    if (!packName.trim()) { setError('请输入契约包名称'); return }
    if (!content.trim()) { setError('内容为空'); return }
    setSaving(true)
    setError('')
    try {
      const { createPack, updatePack, listPacks, bumpPatch } = await import('../lib/contracts')
      const existing = (await listPacks(orgId)).find((p) => p.name === packName.trim())
      if (mode === 'create' || !existing) {
        await createPack(orgId, packName.trim(), '0.1.0', content, contentType)
      } else {
        await updatePack(orgId, packName.trim(), bumpPatch(existing.version), content, contentType)
      }
      onPublished(packName.trim(), contentType)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e.response?.data?.error ?? e.message ?? '发布失败')
    } finally { setSaving(false) }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>发布契约包</h3>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Selected items summary */}
          <div className={styles.selectedSummary}>
            <span className={styles.selectedLabel}>已选 {selectedPaths.length} 项：</span>
            <div className={styles.selectedList}>
              {selectedPaths.map((p) => (
                <span key={p} className={styles.selectedChip}>
                  {p.replace(new RegExp(`.*[\\\\/]`), '') || p}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>契约包名称</label>
            <input
              className={styles.fieldInput}
              placeholder="user-api"
              value={packName}
              onChange={(e) => setPackName(e.target.value.replace(/\s/g, '-'))}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>内容类型</label>
            <select className={styles.fieldInput} value={contentType} onChange={(e) => setContentType(e.target.value)}>
              {['text', 'markdown', 'yaml', 'json', 'typescript', 'go', 'sql', 'proto'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Content preview */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              内容预览 {loading ? '（读取中…）' : `（${content.split('\n').length} 行）`}
            </label>
            <div className={styles.previewWrap}>
              {loading
                ? <p className={styles.preview} style={{ color: '#475569' }}>正在读取文件内容…</p>
                : <pre className={styles.preview}>{content.slice(0, 1000)}{content.length > 1000 ? '\n…（更多内容已省略）' : ''}</pre>
              }
            </div>
          </div>

          {error && <p className={styles.modalError}>{error}</p>}
        </div>

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button className={styles.saveBtn} disabled={saving || loading} onClick={() => handlePublish('update')}>
            {saving ? '发布中…' : '发布为新版本'}
          </button>
          <button className={`${styles.saveBtn} ${styles.saveBtnAlt}`} disabled={saving || loading} onClick={() => handlePublish('create')}>
            创建为新契约包
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const icons: Record<string, string> = {
    md: '📝', markdown: '📝', yaml: '⚙️', yml: '⚙️', json: '📋',
    ts: '🔷', tsx: '🔷', go: '🐹', sql: '🗄️', proto: '📡', txt: '📄',
  }
  return icons[ext] ?? '📄'
}
