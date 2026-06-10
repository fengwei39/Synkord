import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  listPacks, getPack, listVersions, getDiff, parseContent,
  type PackListItem, type ContractContent,
  type VersionInfo, type DiffResult, type EntityDiff, type FieldDiff,
} from '../lib/contracts'
import styles from './ContractsPage.module.css'

type DetailTab = 'content' | 'versions'

interface Props {
  orgId: string
}

export default function ContractsPage({ orgId }: Props) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('content')

  const { data: packs = [], isLoading: packsLoading, error: packsError } = useQuery({
    queryKey: ['packs', orgId],
    queryFn: () => listPacks(orgId),
    enabled: !!orgId,
  })

  const { data: packDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['pack-detail', orgId, selectedPack],
    queryFn: () => getPack(orgId, selectedPack!),
    enabled: !!selectedPack,
  })

  const content = packDetail ? parseContent(packDetail) : null

  function handleSelectPack(name: string) {
    setSelectedPack(name)
    setTab('content')
  }

  return (
    <div className={styles.layout}>
      {/* ── Left sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>契约包</span>
          <span className={styles.packCount}>{packs.length}</span>
        </div>

        {packsLoading && <p className={styles.hint}>加载中…</p>}
        {packsError && <p className={styles.errorHint}>加载失败</p>}

        <ul className={styles.packList}>
          {packs.map((pack) => (
            <PackItem
              key={pack.name}
              pack={pack}
              selected={selectedPack === pack.name}
              onClick={() => handleSelectPack(pack.name)}
            />
          ))}
        </ul>

        {!packsLoading && packs.length === 0 && <p className={styles.hint}>暂无契约包</p>}
      </aside>

      {/* ── Right detail panel ── */}
      <main className={styles.detail}>
        {!selectedPack && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>📄</p>
            <p className={styles.emptyText}>选择左侧契约包查看详情</p>
          </div>
        )}

        {selectedPack && detailLoading && <p className={styles.hint}>加载中…</p>}

        {selectedPack && !detailLoading && (
          <>
            {/* Tab bar */}
            <div className={styles.tabBar}>
              <button
                className={`${styles.tab} ${tab === 'content' ? styles.tabActive : ''}`}
                onClick={() => setTab('content')}
              >
                内容
              </button>
              <button
                className={`${styles.tab} ${tab === 'versions' ? styles.tabActive : ''}`}
                onClick={() => setTab('versions')}
              >
                版本历史
              </button>
            </div>

            {tab === 'content' && content && (
              <PackContent packName={selectedPack} content={content} />
            )}
            {tab === 'versions' && (
              <VersionsTab orgId={orgId} packName={selectedPack} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Pack list item ───────────────────────────────────────────────────────────

function PackItem({ pack, selected, onClick }: { pack: PackListItem; selected: boolean; onClick: () => void }) {
  return (
    <li className={`${styles.packItem} ${selected ? styles.packItemActive : ''}`} onClick={onClick}>
      <span className={styles.packName}>{pack.name}</span>
      <span className={styles.packVersion}>v{pack.version}</span>
    </li>
  )
}

// ─── Content tab ─────────────────────────────────────────────────────────────

function PackContent({ packName, content }: { packName: string; content: ContractContent }) {
  const entityNames = Object.keys(content.entities)
  return (
    <div className={styles.packDetailWrap}>
      <div className={styles.packDetailHeader}>
        <h2 className={styles.packDetailTitle}>{packName}</h2>
        <span className={styles.versionTag}>v{content.version}</span>
      </div>
      <p className={styles.entityCount}>{entityNames.length} 个实体</p>
      <div className={styles.entityList}>
        {entityNames.map((name) => (
          <EntityCard key={name} name={name} entity={content.entities[name]} />
        ))}
      </div>
    </div>
  )
}

// ─── Entity card ─────────────────────────────────────────────────────────────

function EntityCard({
  name,
  entity,
}: {
  name: string
  entity: {
    table: string
    fields: Record<string, { type: string; primary?: boolean; unique?: boolean; values?: string[] }>
    relations?: Record<string, { type: string; target: string }>
  }
}) {
  const [open, setOpen] = useState(true)
  const fieldEntries = Object.entries(entity.fields)
  const relationEntries = Object.entries(entity.relations ?? {})

  return (
    <div className={styles.entityCard}>
      <button className={styles.entityHeader} onClick={() => setOpen((o) => !o)}>
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
        <span className={styles.entityName}>{name}</span>
        <span className={styles.tableTag}>{entity.table}</span>
        <span className={styles.fieldCount}>{fieldEntries.length} 字段</span>
      </button>

      {open && (
        <table className={styles.fieldTable}>
          <thead>
            <tr><th>字段</th><th>类型</th><th>标记</th></tr>
          </thead>
          <tbody>
            {fieldEntries.map(([fname, fdef]) => (
              <tr key={fname}>
                <td className={styles.fieldName}>{fname}</td>
                <td>
                  <span className={`${styles.typeTag} ${styles[`type_${fdef.type}`]}`}>{fdef.type}</span>
                  {fdef.type === 'enum' && fdef.values && (
                    <span className={styles.enumValues}> ({fdef.values.join(' | ')})</span>
                  )}
                </td>
                <td className={styles.badges}>
                  {fdef.primary && <span className={styles.badge}>PK</span>}
                  {fdef.unique && <span className={styles.badge}>UQ</span>}
                </td>
              </tr>
            ))}
            {relationEntries.map(([rname, rdef]) => (
              <tr key={rname} className={styles.relationRow}>
                <td className={styles.fieldName}>{rname}</td>
                <td>
                  <span className={styles.relationTag}>{rdef.type}</span>
                  <span className={styles.relationTarget}> → {rdef.target}</span>
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Versions tab ─────────────────────────────────────────────────────────────

function VersionsTab({ orgId, packName }: { orgId: string; packName: string }) {
  const [fromVer, setFromVer] = useState('')
  const [toVer, setToVer] = useState('')
  const [diffEnabled, setDiffEnabled] = useState(false)

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['versions', orgId, packName],
    queryFn: () => listVersions(orgId, packName),
  })

  const { data: diffResult, isLoading: diffLoading, error: diffError } = useQuery({
    queryKey: ['diff', orgId, packName, fromVer, toVer],
    queryFn: () => getDiff(orgId, packName, fromVer, toVer),
    enabled: diffEnabled && !!fromVer && !!toVer && fromVer !== toVer,
  })

  function handleCompare() {
    if (fromVer && toVer && fromVer !== toVer) setDiffEnabled(true)
  }

  if (isLoading) return <p className={styles.hint}>加载中…</p>

  return (
    <div className={styles.versionsWrap}>
      {/* Version history list */}
      <div className={styles.versionList}>
        {versions.length === 0 && <p className={styles.hint}>暂无版本记录</p>}
        {versions.map((v) => (
          <VersionRow key={v.version} v={v} />
        ))}
      </div>

      {/* Diff selector */}
      {versions.length >= 2 && (
        <div className={styles.diffPanel}>
          <div className={styles.diffPanelHeader}>
            <span className={styles.diffPanelTitle}>版本对比</span>
          </div>
          <div className={styles.diffSelector}>
            <select
              className={styles.verSelect}
              value={fromVer}
              onChange={(e) => { setFromVer(e.target.value); setDiffEnabled(false) }}
            >
              <option value="">基础版本</option>
              {versions.map((v) => (
                <option key={v.version} value={v.version}>{v.version}</option>
              ))}
            </select>
            <span className={styles.diffArrow}>→</span>
            <select
              className={styles.verSelect}
              value={toVer}
              onChange={(e) => { setToVer(e.target.value); setDiffEnabled(false) }}
            >
              <option value="">对比版本</option>
              {versions.map((v) => (
                <option key={v.version} value={v.version}>{v.version}</option>
              ))}
            </select>
            <button
              className={styles.compareBtn}
              onClick={handleCompare}
              disabled={!fromVer || !toVer || fromVer === toVer}
            >
              对比
            </button>
          </div>

          {diffLoading && <p className={styles.hint}>计算中…</p>}
          {diffError && <p className={styles.errorHint}>对比失败</p>}
          {diffResult && <DiffView result={diffResult} />}
        </div>
      )}
    </div>
  )
}

function VersionRow({ v }: { v: VersionInfo }) {
  const date = new Date(v.committedAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  return (
    <div className={styles.versionRow}>
      <span className={styles.verBadge}>v{v.version}</span>
      <span className={styles.verDate}>{date}</span>
      <span className={styles.verAuthor}>{v.authorEmail}</span>
    </div>
  )
}

// ─── Diff view ────────────────────────────────────────────────────────────────

function DiffView({ result }: { result: DiffResult }) {
  const entityEntries = Object.entries(result.entities)

  if (entityEntries.length === 0) {
    return (
      <div className={styles.noDiff}>
        <span>✅ 两版本无差异</span>
      </div>
    )
  }

  return (
    <div className={styles.diffResult}>
      <p className={styles.diffMeta}>
        <span className={styles.verBadge}>v{result.from}</span>
        <span className={styles.diffArrow}> → </span>
        <span className={styles.verBadge}>v{result.to}</span>
      </p>
      {entityEntries.map(([entityName, entityDiff]) => (
        <DiffEntityCard key={entityName} name={entityName} diff={entityDiff} />
      ))}
    </div>
  )
}

function DiffEntityCard({ name, diff }: { name: string; diff: EntityDiff }) {
  const fieldEntries = Object.entries(diff.fields ?? {})
  const relEntries = Object.entries(diff.relations ?? {})

  return (
    <div className={`${styles.diffCard} ${styles[`diffCard_${diff.change}`]}`}>
      <div className={styles.diffCardHeader}>
        <span className={`${styles.changeBadge} ${styles[`change_${diff.change}`]}`}>
          {diff.change === 'added' ? '+ 新增' : diff.change === 'removed' ? '- 删除' : '~ 修改'}
        </span>
        <span className={styles.diffEntityName}>{name}</span>
      </div>

      {(fieldEntries.length > 0 || relEntries.length > 0) && (
        <table className={styles.diffTable}>
          <tbody>
            {fieldEntries.map(([fname, fDiff]) => (
              <DiffFieldRow key={fname} name={fname} diff={fDiff} />
            ))}
            {relEntries.map(([rname, rDiff]) => (
              <DiffFieldRow key={rname} name={rname} diff={rDiff} isRelation />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function DiffFieldRow({
  name,
  diff,
  isRelation = false,
}: {
  name: string
  diff: FieldDiff
  isRelation?: boolean
}) {
  return (
    <tr className={`${styles.diffFieldRow} ${styles[`diffRow_${diff.change}`]}`}>
      <td className={styles.diffFieldPrefix}>
        {diff.change === 'added' ? '+' : diff.change === 'removed' ? '-' : '~'}
      </td>
      <td className={styles.diffFieldName}>
        {isRelation && <span className={styles.relLabel}>rel </span>}
        {name}
      </td>
      <td className={styles.diffFieldDetail}>
        {diff.change === 'added' && diff.type && (
          <span className={`${styles.typeTag} ${styles[`type_${diff.type}`]}`}>{diff.type}</span>
        )}
        {diff.change === 'removed' && diff.type && (
          <span className={`${styles.typeTag} ${styles[`type_${diff.type}`]}`}>{diff.type}</span>
        )}
        {diff.change === 'modified' && (
          <span className={styles.modifiedDetail}>
            <span className={styles.beforeVal}>{JSON.stringify(diff.before)}</span>
            <span className={styles.diffArrow}> → </span>
            <span className={styles.afterVal}>{JSON.stringify(diff.after)}</span>
          </span>
        )}
      </td>
    </tr>
  )
}
