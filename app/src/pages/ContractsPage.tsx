import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listPacks, getPack, listVersions, getDiff,
  createPack, updatePack,
  bumpPatch, detectContentType,
  type PackListItem, type PackDetail,
  type VersionInfo, type DiffResult, type DiffHunk,
} from '../lib/contracts'
import styles from './ContractsPage.module.css'

type DetailTab = 'content' | 'versions'

interface Props { orgId: string }

export default function ContractsPage({ orgId }: Props) {
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
                  <span style={{ flex: 1 }} />
                  <button className={styles.editBtn} onClick={openEdit}>✏️ 编辑</button>
                </div>

                {tab === 'content' && (
                  <ContentViewer detail={packDetail} />
                )}
                {tab === 'versions' && (
                  <VersionsTab orgId={orgId} packName={selectedPack} />
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

// ─── Content viewer (syntax-highlighted text) ────────────────────────────────

function ContentViewer({ detail }: { detail: PackDetail }) {
  const lines = detail.content.split('\n')

  return (
    <div className={styles.viewer}>
      <div className={styles.viewerMeta}>
        <span className={styles.metaType}>{detail.contentType || 'text'}</span>
        <span className={styles.metaVer}>v{detail.version}</span>
      </div>
      <div className={styles.codeWrap}>
        <div className={styles.lineNums}>
          {lines.map((_, i) => (
            <span key={i} className={styles.lineNum}>{i + 1}</span>
          ))}
        </div>
        <pre className={`${styles.codeContent} ${styles[`lang_${detail.contentType}`] ?? ''}`}>
          {detail.content}
        </pre>
      </div>
    </div>
  )
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
  orgId, mode, existing, onSaved, onCancel,
}: {
  orgId: string
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
      if (mode === 'create') {
        await createPack(orgId, name.trim(), version.trim(), content, contentType)
        onSaved(name.trim())
      } else {
        await updatePack(orgId, existing!.name, version.trim(), content, contentType)
        onSaved(existing!.name)
      }
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
