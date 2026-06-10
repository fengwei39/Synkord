import { useState, useEffect, useMemo } from 'react'
import { getPack, parseContent, type ContractContent } from '../lib/contracts'
import { getToken } from '../lib/api'
import styles from './OverlayPage.module.css'

interface SynkordConfig {
  project: string
  org: string
  consumes: string[]  // e.g. ["auth-pack@^1.x"]
}

interface PackState {
  name: string
  versionSpec: string
  content: ContractContent | null
  loading: boolean
  error: boolean
}

export default function OverlayPage() {
  const [config, setConfig] = useState<SynkordConfig | null>(null)
  const [packs, setPacks] = useState<PackState[]>([])
  const [search, setSearch] = useState('')
  const [watchDir, setWatchDir] = useState('')
  const [orgId, setOrgId] = useState('')

  // Listen for synkord.json changes from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.onConfigChanged((cfg) => {
      const config = cfg as SynkordConfig | null
      setConfig(config)
    })
    return () => unsubscribe?.()
  }, [])

  // When config changes, load pack contents
  useEffect(() => {
    if (!config || !orgId) return

    const newPacks: PackState[] = config.consumes.map((spec) => {
      const name = spec.split('@')[0]
      const versionSpec = spec.split('@')[1] ?? '*'
      return { name, versionSpec, content: null, loading: true, error: false }
    })
    setPacks(newPacks)

    newPacks.forEach(async (p, idx) => {
      try {
        const detail = await getPack(orgId, p.name)
        const content = parseContent(detail)
        setPacks((prev) => {
          const next = [...prev]
          next[idx] = { ...next[idx], content, loading: false }
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

  // Filtered field results across all packs
  const searchResults = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    const results: { packName: string; entityName: string; fieldName: string; type: string }[] = []

    for (const pack of packs) {
      if (!pack.content) continue
      for (const [entityName, entity] of Object.entries(pack.content.entities)) {
        for (const [fieldName, fieldDef] of Object.entries(entity.fields)) {
          if (fieldName.toLowerCase().includes(q) || entityName.toLowerCase().includes(q)) {
            results.push({ packName: pack.name, entityName, fieldName, type: fieldDef.type })
          }
        }
      }
    }
    return results
  }, [search, packs])

  const isAuthed = !!getToken()

  return (
    <div className={styles.container}>
      {/* Drag handle */}
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
          {/* Search */}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              placeholder="搜索字段名…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {/* Search results */}
          {searchResults ? (
            <div className={styles.searchResults}>
              {searchResults.length === 0 && (
                <p className={styles.hint}>无匹配字段</p>
              )}
              {searchResults.map((r, i) => (
                <div key={i} className={styles.searchResultItem}>
                  <span className={styles.srField}>{r.fieldName}</span>
                  <span className={styles.srEntity}>{r.entityName}</span>
                  <span className={`${styles.srType} ${styles[`type_${r.type}`]}`}>{r.type}</span>
                </div>
              ))}
            </div>
          ) : (
            /* Pack list */
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
  const entityNames = pack.content ? Object.keys(pack.content.entities) : []

  return (
    <div className={styles.packRow}>
      <button className={styles.packHeader} onClick={() => setOpen((o) => !o)}>
        <span className={styles.packDot}>●</span>
        <span className={styles.packName}>{pack.name}</span>
        {pack.content && (
          <span className={styles.packVer}>v{pack.content.version}</span>
        )}
        {pack.loading && <span className={styles.loadingDot}>…</span>}
        {pack.error && <span className={styles.errorDot}>⚠️</span>}
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>

      {open && !pack.loading && pack.content && (
        <div className={styles.entityList}>
          {entityNames.map((name) => (
            <span key={name} className={styles.entityChip}>{name}</span>
          ))}
        </div>
      )}
    </div>
  )
}
