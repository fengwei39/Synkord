/**
 * ProjectsPage — local project management.
 *
 * Selection state lives at the top level so users can select files from
 * multiple projects and combine them into a single contract pack.
 */
import { useState, useEffect } from 'react'
import { detectContentType, getPack } from '../lib/contracts'
import {
  syncIDEFiles,
  getConsumedPackNames,
  type SynkordProjectConfig,
} from '../lib/ide-sync'
import styles from './ProjectsPage.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface DirEntry { name: string; isDir: boolean; path: string }

// key for cross-project selection: `${projectId}::${absPath}`
type SelectionKey = string
function makeKey(projectId: string, absPath: string): SelectionKey {
  return `${projectId}::${absPath}`
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_PROJECTS = 'synkord_projects'
const LS_SOURCES  = 'synkord_project_sources'

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

// ─── Root component ───────────────────────────────────────────────────────────

interface Props { orgId: string; orgName: string; orgSlug: string }

export default function ProjectsPage({ orgId, orgName, orgSlug }: Props) {
  const [projects, setProjects]   = useState<Project[]>([])
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [showPublish, setShowPublish] = useState(false)

  // Cross-project selection: Map<projectId, Set<absPath>>
  const [selection, setSelection] = useState<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    setProjects(loadProjects().filter((p) => p.orgId === orgId))
    setSelection(new Map())
    setActiveId(null)
  }, [orgId])

  // ── helpers ──

  const totalSelected = [...selection.values()].reduce((n, s) => n + s.size, 0)

  function togglePath(projectId: string, absPath: string) {
    setSelection((prev) => {
      const next = new Map(prev)
      const set  = new Set(next.get(projectId) ?? [])
      if (set.has(absPath)) set.delete(absPath)
      else set.add(absPath)
      if (set.size === 0) next.delete(projectId)
      else next.set(projectId, set)
      return next
    })
  }

  function clearSelection() { setSelection(new Map()) }

  // ── project CRUD ──

  function handleAdd(name: string, localPath: string) {
    const p: Project = { id: `${Date.now()}`, name, localPath, orgId }
    const next = [...projects, p]
    setProjects(next)
    saveProjects([...loadProjects().filter((x) => x.orgId !== orgId), ...next])
    setShowAdd(false)
    setActiveId(p.id)
  }

  function handleDelete(id: string) {
    const next = projects.filter((p) => p.id !== id)
    setProjects(next)
    saveProjects([...loadProjects().filter((x) => x.orgId !== orgId), ...next])
    if (activeId === id) setActiveId(null)
    setSelection((prev) => { const n = new Map(prev); n.delete(id); return n })
  }

  // ── after publish ──

  function handleBound(packName: string, contentType: string) {
    const now = new Date().toISOString()
    const allSrc = loadSources()

    // Build sources for every project that has selections
    const newSrcs: ProjectSource[] = []
    for (const [projectId, paths] of selection) {
      newSrcs.push({
        projectId,
        packName,
        filePath: [...paths].join(','),
        contentType,
        lastBoundAt: now,
      })
    }

    // Replace existing entries for each project + pack
    const projectIds = new Set(newSrcs.map((s) => s.projectId))
    const filtered = allSrc.filter(
      (s) => !(projectIds.has(s.projectId) && s.packName === packName),
    )
    saveSources([...filtered, ...newSrcs])
    clearSelection()
    setShowPublish(false)

    // Sync IDE files for all affected projects
    void triggerSyncAll([...projectIds], packName)
  }

  async function triggerSyncAll(projectIds: string[], packName: string) {
    for (const projectId of projectIds) {
      const proj = projects.find((p) => p.id === projectId)
      if (!proj) continue
      const srcs = loadSources().filter((s) => s.projectId === projectId)
      const packNames = [...new Set(srcs.map((s) => s.packName))]
      const packDetails = await Promise.all(packNames.map((n) => getPack(orgId, n).catch(() => null)))
      const packs = packDetails.filter(Boolean).map((d) => ({
        name: d!.name, version: d!.version, contentType: d!.contentType, content: d!.content,
      }))
      const config: SynkordProjectConfig = { orgId, orgSlug, project: proj.name, consumes: packNames }
      await syncIDEFiles(proj.localPath, config, packs).catch(() => null)
    }
  }

  const activeProject = projects.find((p) => p.id === activeId) ?? null

  return (
    <div className={styles.layout}>
      {/* ── Sidebar: project list ── */}
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
          {projects.map((p) => {
            const selCount = selection.get(p.id)?.size ?? 0
            return (
              <li
                key={p.id}
                className={`${styles.projectItem} ${activeId === p.id ? styles.projectItemSelected : ''}`}
                onClick={() => setActiveId(p.id)}
              >
                <span className={styles.projectIcon}>📁</span>
                <span className={styles.projectName}>{p.name}</span>
                {selCount > 0 && (
                  <span className={styles.projectSelBadge}>{selCount}</span>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                >✕</button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>
        {showAdd && <AddProjectPanel onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

        {!showAdd && !activeProject && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>🗂️</p>
            <p className={styles.emptyText}>选择左侧项目，或关联一个新项目</p>
            <p className={styles.emptyDesc}>
              关联本地项目目录后，可在多个项目中选择文件/目录，组合发布为「{orgName}」的契约包
            </p>
            <button className={styles.addBtnLarge} onClick={() => setShowAdd(true)}>
              ＋ 关联本地项目
            </button>
          </div>
        )}

        {!showAdd && activeProject && (
          <ProjectFileTree
            project={activeProject}
            orgId={orgId}
            orgSlug={orgSlug}
            selected={selection.get(activeProject.id) ?? new Set()}
            onToggle={(absPath) => togglePath(activeProject.id, absPath)}
          />
        )}

        {/* Cross-project selection footer */}
        {totalSelected > 0 && !showPublish && (
          <div className={styles.crossSelBar}>
            <div className={styles.crossSelInfo}>
              <span className={styles.crossSelCount}>📦 已跨 {selection.size} 个项目选择了 {totalSelected} 项</span>
              {[...selection.entries()].map(([pid, paths]) => {
                const proj = projects.find((p) => p.id === pid)
                return proj ? (
                  <span key={pid} className={styles.crossSelChip}>
                    {proj.name}: {paths.size} 项
                  </span>
                ) : null
              })}
            </div>
            <button className={styles.crossSelClear} onClick={clearSelection}>清空选择</button>
            <button className={styles.crossSelPublish} onClick={() => setShowPublish(true)}>
              发布为契约包 →
            </button>
          </div>
        )}
      </main>

      {/* Publish modal (cross-project) */}
      {showPublish && (
        <CrossProjectPublishModal
          orgId={orgId}
          projects={projects}
          selection={selection}
          onPublished={handleBound}
          onClose={() => setShowPublish(false)}
        />
      )}
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
        <button
          className={styles.saveBtn}
          disabled={!name.trim() || !path.trim()}
          onClick={() => onAdd(name.trim(), path.trim())}
        >确认关联</button>
      </div>
    </div>
  )
}

// ─── Project file tree (single project browsing) ──────────────────────────────

function ProjectFileTree({ project, orgId, orgSlug, selected, onToggle }: {
  project: Project
  orgId: string
  orgSlug: string
  selected: Set<string>
  onToggle: (absPath: string) => void
}) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [currentPath, setCurrentPath] = useState(project.localPath)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const sources = loadSources().filter((s) => s.projectId === project.id)
  const consumedPacks = [...new Set(sources.map((s) => s.packName))]

  useEffect(() => {
    setCurrentPath(project.localPath)
  }, [project.id, project.localPath])

  useEffect(() => { void loadDir(currentPath) }, [currentPath])

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

  async function triggerSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const packNames = consumedPacks
      const packDetails = await Promise.all(
        packNames.map((n) => getPack(orgId, n).catch(() => null)),
      )
      const packs = packDetails.filter(Boolean).map((d) => ({
        name: d!.name, version: d!.version, contentType: d!.contentType, content: d!.content,
      }))
      const config: SynkordProjectConfig = { orgId, orgSlug, project: project.name, consumes: packNames }
      const result = await syncIDEFiles(project.localPath, config, packs)
      setSyncMsg(
        result.ok
          ? result.files.length > 0
            ? `✓ 已更新 ${result.files.length} 个文件${result.skipped.length > 0 ? `，跳过 ${result.skipped.length} 个（无变化或未检测到对应 IDE）` : ''}`
            : `✓ 无需更新（内容未变化）`
          : `⚠ ${result.error ?? '失败'}`,
      )
    } catch (err) { setSyncMsg(`⚠ ${String(err)}`) }
    finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

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
            onClick={triggerSync}
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

      {/* Hint */}
      <div className={styles.selectionBar}>
        <span className={styles.selHint}>
          {selected.size > 0
            ? `✓ 本项目已选 ${selected.size} 项（可继续在其他项目中选择后一起发布）`
            : '勾选文件或目录，可跨多个项目组合为一个契约包'}
        </span>
      </div>

      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <button className={styles.breadBtn} onClick={() => setCurrentPath(project.localPath)}>
          {project.name}
        </button>
        {currentPath !== project.localPath && (
          <>
            <span className={styles.breadSep}>/</span>
            <button
              className={styles.breadBtn}
              onClick={() => {
                const parent = currentPath.replace(/[\\/][^\\/]+$/, '')
                setCurrentPath(parent || project.localPath)
              }}
            >..</button>
          </>
        )}
        {breadcrumbs.slice(1).map((b, i) => (
          <span key={i}>
            <span className={styles.breadSep}>/</span>
            <span className={styles.breadCurrent}>{b}</span>
          </span>
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
                onChange={() => onToggle(e.path)}
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
    </div>
  )
}

// ─── Cross-project publish modal ──────────────────────────────────────────────

function CrossProjectPublishModal({ orgId, projects, selection, onPublished, onClose }: {
  orgId: string
  projects: Project[]
  selection: Map<string, Set<string>>
  onPublished: (packName: string, contentType: string) => void
  onClose: () => void
}) {
  const [packName, setPackName]     = useState('')
  const [contentType, setContentType] = useState('text')
  const [content, setContent]       = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  // Flatten selection with project info
  const selectedItems = [...selection.entries()].flatMap(([projectId, paths]) => {
    const proj = projects.find((p) => p.id === projectId)
    if (!proj) return []
    return [...paths].map((absPath) => ({ projectId, projectName: proj.name, localPath: proj.localPath, absPath }))
  })

  useEffect(() => { void buildContent() }, [])

  async function buildContent() {
    setLoading(true)
    const sections: string[] = []
    const types = new Set<string>()

    for (const item of selectedItems) {
      const relPath = item.absPath.replace(item.localPath, '').replace(/^[\\/]+/, '')
      const header  = `${item.projectName}/${relPath}`

      // Try as directory
      let isDir = false
      try {
        const dirEntries = await window.electronAPI.readDirTree(item.absPath)
        isDir = true
        const allFiles = await window.electronAPI.collectFiles(item.absPath)
        for (const f of allFiles) {
          const text = await window.electronAPI.readTextFile(f.path).catch(() => '(读取失败)')
          sections.push(`# ${header}/${f.relPath}\n\n${text}`)
          types.add(detectContentType(f.name))
        }
        if (allFiles.length === 0) {
          sections.push(`# ${header}\n\n(空目录)`)
        }
        void dirEntries // used only to check type
      } catch { /* file */ }

      if (!isDir) {
        const text = await window.electronAPI.readTextFile(item.absPath).catch(() => '(读取失败)')
        sections.push(`# ${header}\n\n${text}`)
        types.add(detectContentType(item.absPath.split(/[\\/]/).pop() ?? ''))
      }
    }

    setContent(sections.join('\n\n---\n\n'))

    if (types.size === 1) {
      const t = [...types][0]
      if (t !== 'text') setContentType(t)
    }

    if (!packName) {
      const firstName = selectedItems[0]?.absPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? ''
      setPackName(firstName.replace(/\s/g, '-'))
    }
    setLoading(false)
  }

  async function handlePublish(mode: 'create' | 'update') {
    if (!packName.trim()) { setError('请输入契约包名称'); return }
    if (!content.trim())  { setError('内容为空'); return }
    setSaving(true); setError('')
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

  const totalCount = selectedItems.length
  const projectCount = selection.size

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>发布契约包</h3>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Cross-project selection summary */}
          <div className={styles.selectedSummary}>
            <span className={styles.selectedLabel}>
              来自 {projectCount} 个项目，共 {totalCount} 项：
            </span>
            <div className={styles.selectedList}>
              {[...selection.entries()].map(([projectId, paths]) => {
                const proj = projects.find((p) => p.id === projectId)
                return proj ? (
                  <div key={projectId} className={styles.selectedProjectGroup}>
                    <span className={styles.selectedProjectLabel}>📁 {proj.name}</span>
                    <div className={styles.selectedChips}>
                      {[...paths].map((absPath) => {
                        const rel = absPath.replace(proj.localPath, '').replace(/^[\\/]+/, '')
                        return <span key={absPath} className={styles.selectedChip}>{rel || absPath}</span>
                      })}
                    </div>
                  </div>
                ) : null
              })}
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

          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              内容预览 {loading ? '（读取中…）' : `（${content.split('\n').length} 行）`}
            </label>
            <div className={styles.previewWrap}>
              {loading
                ? <p className={styles.preview} style={{ color: '#475569' }}>正在读取文件内容…</p>
                : <pre className={styles.preview}>{content.slice(0, 1200)}{content.length > 1200 ? '\n…（更多内容已省略）' : ''}</pre>
              }
            </div>
          </div>

          {error && <p className={styles.modalError}>{error}</p>}
        </div>

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button
            className={styles.saveBtn}
            disabled={saving || loading}
            onClick={() => handlePublish('update')}
          >{saving ? '发布中…' : '发布为新版本'}</button>
          <button
            className={`${styles.saveBtn} ${styles.saveBtnAlt}`}
            disabled={saving || loading}
            onClick={() => handlePublish('create')}
          >创建为新契约包</button>
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
