import { useState, useEffect, useMemo } from 'react'
import { getPack, type PackDetail } from '../lib/contracts'
import { getToken } from '../lib/api'
import styles from './OverlayPage.module.css'

interface SynkordConfig {
  project: string
  org: string
  consumes: string[]
}

interface PackState {
  name: string
  versionSpec: string
  detail: PackDetail | null
  loading: boolean
  error: boolean
}

export default function OverlayPage() {
  const [config, setConfig] = useState<SynkordConfig | null>(null)
  const [packs, setPacks] = useState<PackState[]>([])
  const [search, setSearch] = useState('')
  const [watchDir, setWatchDir] = useState('')
  const [orgId, setOrgId] = useState('')

  useEffect(() => {
    const unsubscribe = window.electronAPI.onConfigChanged((cfg) => {
      setConfig(cfg as SynkordConfig | null)
    })
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    if (!config || !orgId) return

    const newPacks: PackState[] = config.consumes.map((spec) => {
      const name = spec.split('@')[0]
      const versionSpec = spec.split('@')[1] ?? '*'
      return { name, versionSpec, detail: null, loading: true, error: false }
    })
    setPacks(newPacks)

    newPacks.forEach(async (p, idx) => {
      try {
        const detail = await getPack(orgId, p.name)
        setPacks((prev) => {
          const next = [...prev]
          next[idx] = { ...next[idx], detail, loading: false }
          return next
        })
      } catch {
        setPacks((prev) => {
          const next = [...prev]
          next[idx] = { ...next[idx], loading: false, error: true }
          return next
        })
      }
    })
  }, [config, orgId])

  async function handlePickDir() {
    const dir = await window.electronAPI.pickDirectory()
    if (dir) {
      setWatchDir(dir)
      window.electronAPI.watchDirectory(dir)
    }
  }

  // Search across all pack content lines
  const searchResults = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    const results: { packName: string; lineNum: number; line: string }[] = []

    for (const pack of packs) {
      if (!pack.detail) continue
      pack.detail.content.split('\n').forEach((line, i) => {
        if (line.toLowerCase().includes(q)) {
          results.push({ packName: pack.name, lineNum: i + 1, line: line.trim() })
        }
      })
    }
    return results.slice(0, 50)
  }, [search, packs])

  const isAuthed = !!getToken()

  return (
    <div className={styles.container}>
      <div className={styles.titleBar}>
        <span className={styles.dot} />
        <span className={styles.title}>
          Synkord{config ? ` · ${config.project}` : ''}
        </span>
      </div>

      {!isAuthed ? (
        <div className={styles.placeholder}>
          <p>请先在主窗口登录</p>
        </div>
      ) : !config ? (
        <div className={styles.placeholder}>
          <p className={styles.placeholderText}>未检测到 synkord.json</p>
          <button className={styles.pickBtn} onClick={handlePickDir}>
            📂 设置监听目录
          </button>
          {watchDir && <p className={styles.watchingPath}>{watchDir}</p>}
        </div>
      ) : (
        <>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              placeholder="搜索内容…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {searchResults ? (
            <div className={styles.searchResults}>
              {searchResults.length === 0 && (
                <p className={styles.hint}>无匹配内容</p>
              )}
              {searchResults.map((r, i) => (
                <div key={i} className={styles.searchResultItem}>
                  <span className={styles.srPack}>{r.packName}</span>
                  <span className={styles.srLineNum}>:{r.lineNum}</span>
                  <span className={styles.srLine}>{r.line.slice(0, 60)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.packList}>
              {packs.map((p) => (
                <PackRow key={p.name} pack={p} />
              ))}
            </div>
          )}

          <div className={styles.footer}>
            <button className={styles.footerBtn} onClick={handlePickDir}>📂</button>
          </div>
        </>
      )}
    </div>
  )
}

function PackRow({ pack }: { pack: PackState }) {
  const [open, setOpen] = useState(false)
  const lines = pack.detail?.content.split('\n').slice(0, 8) ?? []

  return (
    <div className={styles.packRow}>
      <button className={styles.packHeader} onClick={() => setOpen((o) => !o)}>
        <span className={styles.packDot}>●</span>
        <span className={styles.packName}>{pack.name}</span>
        {pack.detail && (
          <span className={styles.packVer}>v{pack.detail.version}</span>
        )}
        {pack.loading && <span className={styles.loadingDot}>…</span>}
        {pack.error && <span className={styles.errorDot}>⚠️</span>}
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>

      {open && pack.detail && (
        <div className={styles.packPreview}>
          <pre className={styles.packPreviewCode}>
            {lines.join('\n')}{pack.detail.content.split('\n').length > 8 ? '\n…' : ''}
          </pre>
        </div>
      )}
    </div>
  )
}
