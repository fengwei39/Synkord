/**
 * ProjectsPage — local project management.
 * Projects are stored in localStorage (local-only concept).
 * Each project can have source files bound to contract packs.
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

function saveProjects(projects: Project[]) {
  localStorage.setItem(LS_PROJECTS, JSON.stringify(projects))
}

function loadSources(): ProjectSource[] {
  try { return JSON.parse(localStorage.getItem(LS_SOURCES) ?? '[]') as ProjectSource[] }
  catch { return [] }
}

function saveSources(sources: ProjectSource[]) {
  localStorage.setItem(LS_SOURCES, JSON.stringify(sources))
}

interface Props { orgId: string; orgName: string; orgSlug: string }

export default function ProjectsPage({ orgId, orgName, orgSlug }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [showAddProject, setShowAddProject] = useState(false)

  useEffect(() => {
    const all = loadProjects().filter((p) => p.orgId === orgId)
    setProjects(all)
  }, [orgId])

  function handleAdd(name: string, localPath: string) {
    const p: Project = {
      id: `${Date.now()}`,
      name,
      localPath,
      orgId,
    }
    const next = [...projects, p]
    setProjects(next)
    saveProjects([...loadProjects().filter((x) => x.orgId !== orgId), ...next])
    setShowAddProject(false)
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
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>本地项目</span>
          <button className={styles.addBtn} onClick={() => setShowAddProject(true)}>＋</button>
        </div>

        {projects.length === 0 && (
          <div className={styles.emptyHint}>
            <p className={styles.hint}>暂无本地项目</p>
            <button className={styles.addBtnLarge} onClick={() => setShowAddProject(true)}>
              ＋ 关联本地项目
            </button>
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
                title="移除项目"
              >✕</button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        {showAddProject && (
          <AddProjectPanel
            onAdd={handleAdd}
            onCancel={() => setShowAddProject(false)}
          />
        )}

        {!showAddProject && !selected && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>🗂️</p>
            <p className={styles.emptyText}>选择左侧项目，或关联一个新项目</p>
            <p className={styles.emptyDesc}>
              关联本地项目目录后，可以选择目录中的文件作为契约包内容导入到「{orgName}」
            </p>
            <button className={styles.addBtnLarge} onClick={() => setShowAddProject(true)}>
              ＋ 关联本地项目
            </button>
          </div>
        )}

        {!showAddProject && selected && (
          <ProjectDetail
            project={selected}
            orgId={orgId}
            orgSlug={orgSlug}
          />
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
    if (!name) {
      setName(dir.split(/[\\/]/).pop() ?? dir)
    }
  }

  return (
    <div className={styles.addPanel}>
      <h3 className={styles.addTitle}>关联本地项目</h3>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>项目名称</label>
        <input
          className={styles.fieldInput}
          placeholder="例：后端服务"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>本地目录</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.fieldInput}
            style={{ flex: 1 }}
            placeholder="选择项目根目录…"
            value={path}
            readOnly
          />
          <button className={styles.pickBtn} onClick={handlePickDir}>📂 选择目录</button>
        </div>
      </div>

      <div className={styles.addActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>取消</button>
        <button
          className={styles.saveBtn}
          disabled={!name.trim() || !path.trim()}
          onClick={() => onAdd(name.trim(), path.trim())}
        >
          确认关联
        </button>
      </div>
    </div>
  )
}

// ─── Project detail (file browser) ───────────────────────────────────────────

interface DirEntry { name: string; isDir: boolean; path: string }

function ProjectDetail({ project, orgId, orgSlug }: {
  project: Project
  orgId: string
  orgSlug: string
}) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [currentPath, setCurrentPath] = useState(project.localPath)
  const [sources, setSources] = useState<ProjectSource[]>([])
  const [bindModal, setBindModal] = useState<{ filePath: string; content: string } | null>(null)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    setCurrentPath(project.localPath)
    setSources(loadSources().filter((s) => s.projectId === project.id))
  }, [project.id, project.localPath])

  useEffect(() => {
    loadDir(currentPath)
  }, [currentPath])

  async function loadDir(path: string) {
    setError('')
    try {
      const result = await window.electronAPI.readDirTree(path)
      setEntries(result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      }))
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  async function handleFileClick(entry: DirEntry) {
    if (entry.isDir) {
      setCurrentPath(entry.path)
      return
    }
    try {
      const content = await window.electronAPI.readTextFile(entry.path)
      setBindModal({ filePath: entry.path, content })
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  async function handleBindDir(dirPath: string) {
    setError('')
    try {
      const dirEntries = await window.electronAPI.readDirTree(dirPath)
      const files = dirEntries.filter((e) => !e.isDir)
      if (files.length === 0) {
        setError('该目录下没有文件')
        return
      }

      const sections: string[] = []
      for (const file of files) {
        try {
          const text = await window.electronAPI.readTextFile(file.path)
          sections.push(`# ${file.name}\n\n${text}`)
        } catch {
          sections.push(`# ${file.name}\n\n(读取失败)`)
        }
      }

      const content = sections.join('\n\n---\n\n')
      setBindModal({ filePath: dirPath + '/', content })
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  function handleBound(packName: string, filePath: string, contentType: string) {
    const src: ProjectSource = {
      projectId: project.id,
      packName,
      filePath,
      contentType,
      lastBoundAt: new Date().toISOString(),
    }
    const allSources = loadSources()
    const filtered = allSources.filter(
      (s) => !(s.projectId === project.id && s.packName === packName),
    )
    const next = [...filtered, src]
    saveSources(next)
    const updated = next.filter((s) => s.projectId === project.id)
    setSources(updated)
    setBindModal(null)
    // Auto-sync IDE files after binding
    void triggerSync(updated)
  }

  async function triggerSync(currentSources?: ProjectSource[]) {
    setSyncing(true)
    setSyncMsg('')
    try {
      const srcs = currentSources ?? sources
      const packNames = [...new Set(srcs.map((s) => s.packName))]
      const packDetails = await Promise.all(
        packNames.map((name) => getPack(orgId, name).catch(() => null)),
      )
      const packs = packDetails.filter(Boolean).map((d) => ({
        name: d!.name,
        version: d!.version,
        contentType: d!.contentType,
        content: d!.content,
      }))

      const config: SynkordProjectConfig = {
        orgId,
        orgSlug,
        project: project.name,
        consumes: packNames,
      }

      const result = await syncIDEFiles(project.localPath, config, packs)
      if (result.ok) {
        setSyncMsg(`✓ 已同步 ${result.files.length} 个文件`)
      } else {
        setSyncMsg(`⚠ 部分失败：${result.error ?? ''}`)
      }
    } catch (err: unknown) {
      setSyncMsg(`⚠ 同步失败：${String(err)}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  const consumedPacks = [...new Set(sources.map((s) => s.packName))]

  const breadcrumbs = currentPath
    .replace(project.localPath, project.name)
    .split(/[\\/]/)
    .filter(Boolean)

  return (
    <div className={styles.projectDetail}>
      {/* Header with sync button */}
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

      {/* Bound sources */}
      {sources.length > 0 && (
        <div className={styles.sourcesBar}>
          <span className={styles.sourcesLabel}>已绑定契约：</span>
          {consumedPacks.map((name) => (
            <span key={name} className={styles.sourceChip}>{name}</span>
          ))}
        </div>
      )}

      {/* IDE files hint */}
      {sources.length > 0 && (
        <div className={styles.ideHint}>
          <span className={styles.ideHintText}>
            📂 <code>.cursor/rules/synkord.md</code>、<code>CLAUDE.md</code>、<code>AGENTS.md</code>、
            <code>.cursor/mcp.json</code>、<code>.vscode/mcp.json</code>
            将在同步后自动写入项目目录
          </span>
        </div>
      )}

      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <button
          className={styles.breadBtn}
          onClick={() => setCurrentPath(project.localPath)}
        >
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
            >
              ..
            </button>
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

      {/* Quick bind current dir */}
      <div className={styles.dirActions}>
        <button
          className={styles.bindCurDirBtn}
          onClick={() => handleBindDir(currentPath)}
          title="将当前目录下的文件列表绑定为契约"
        >
          📎 绑定当前目录
        </button>
      </div>

      {/* File tree */}
      <div className={styles.fileTree}>
        {entries.map((e) => (
          <div key={e.path} className={styles.fileEntryRow}>
            <button
              className={styles.fileEntry}
              onClick={() => handleFileClick(e)}
              title={e.isDir ? '点击进入目录' : '点击选择此文件'}
            >
              <span className={styles.fileIcon}>{e.isDir ? '📁' : fileIcon(e.name)}</span>
              <span className={styles.fileName}>{e.name}</span>
              {!e.isDir && sources.some((s) => s.filePath === e.path) && (
                <span className={styles.boundBadge}>✓ 已绑定</span>
              )}
              {e.isDir && <span className={styles.dirArrow}>›</span>}
            </button>
            {e.isDir && (
              <button
                className={styles.bindDirBtn}
                title="选择此目录"
                onClick={() => handleBindDir(e.path)}
              >
                📎 选择此目录
              </button>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <p className={styles.hint} style={{ padding: 12 }}>空目录</p>
        )}
      </div>

      {/* Bind modal */}
      {bindModal && (
        <BindFileModal
          orgId={orgId}
          filePath={bindModal.filePath}
          content={bindModal.content}
          existingSources={sources}
          onBound={handleBound}
          onClose={() => setBindModal(null)}
        />
      )}
    </div>
  )
}

// ─── Bind file modal ──────────────────────────────────────────────────────────

function BindFileModal({ orgId, filePath, content, existingSources, onBound, onClose }: {
  orgId: string
  filePath: string
  content: string
  existingSources: ProjectSource[]
  onBound: (packName: string, filePath: string, contentType: string) => void
  onClose: () => void
}) {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const ct = detectContentType(fileName)
  const [packName, setPackName] = useState(
    existingSources[0]?.packName ?? fileName.replace(/\.[^.]+$/, '')
  )
  const [contentType, setContentType] = useState(ct)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handlePublish(mode: 'create' | 'update') {
    if (!packName.trim()) { setError('请输入契约包名称'); return }
    setSaving(true)
    setError('')
    try {
      const { createPack, updatePack, listPacks, bumpPatch } = await import('../lib/contracts')
      const existing = (await listPacks(orgId)).find((p) => p.name === packName.trim())
      if (mode === 'create' || !existing) {
        await createPack(orgId, packName.trim(), '0.1.0', content, contentType)
      } else {
        const newVer = bumpPatch(existing.version)
        await updatePack(orgId, packName.trim(), newVer, content, contentType)
      }
      onBound(packName.trim(), filePath, contentType)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e.response?.data?.error ?? e.message ?? '操作失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>绑定文件到契约包</h3>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.modalFile}>📄 {fileName}</p>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>目标契约包名称</label>
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
            <select
              className={styles.fieldInput}
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              {['text', 'markdown', 'yaml', 'json', 'typescript', 'go', 'sql', 'proto'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className={styles.previewWrap}>
            <pre className={styles.preview}>{content.slice(0, 800)}{content.length > 800 ? '\n…' : ''}</pre>
          </div>

          {error && <p className={styles.modalError}>{error}</p>}
        </div>

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button
            className={styles.saveBtn}
            disabled={saving}
            onClick={() => handlePublish('update')}
          >
            {saving ? '发布中…' : '发布为新版本'}
          </button>
          <button
            className={`${styles.saveBtn} ${styles.saveBtnAlt}`}
            disabled={saving}
            onClick={() => handlePublish('create')}
          >
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
    md: '📝', markdown: '📝',
    yaml: '⚙️', yml: '⚙️',
    json: '📋',
    ts: '🔷', tsx: '🔷',
    go: '🐹',
    sql: '🗄️',
    proto: '📡',
    txt: '📄',
  }
  return icons[ext] ?? '📄'
}
