import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listPacks, getPack, parseContent, type PackListItem, type ContractContent } from '../lib/contracts'
import styles from './ContractsPage.module.css'

interface Props {
  orgId: string
}

export default function ContractsPage({ orgId }: Props) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null)

  const {
    data: packs = [],
    isLoading: packsLoading,
    error: packsError,
  } = useQuery({
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

  return (
    <div className={styles.layout}>
      {/* Left panel: pack list */}
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
              onClick={() => setSelectedPack(pack.name)}
            />
          ))}
        </ul>

        {!packsLoading && packs.length === 0 && (
          <p className={styles.hint}>暂无契约包</p>
        )}
      </aside>

      {/* Right panel: pack detail */}
      <main className={styles.detail}>
        {!selectedPack && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>📄</p>
            <p className={styles.emptyText}>选择左侧契约包查看详情</p>
          </div>
        )}

        {selectedPack && detailLoading && (
          <p className={styles.hint}>加载中…</p>
        )}

        {content && (
          <PackDetail packName={selectedPack!} content={content} />
        )}
      </main>
    </div>
  )
}

// ─── Pack list item ───────────────────────────────────────────────────────────

function PackItem({
  pack,
  selected,
  onClick,
}: {
  pack: PackListItem
  selected: boolean
  onClick: () => void
}) {
  return (
    <li
      className={`${styles.packItem} ${selected ? styles.packItemActive : ''}`}
      onClick={onClick}
    >
      <span className={styles.packName}>{pack.name}</span>
      <span className={styles.packVersion}>v{pack.version}</span>
    </li>
  )
}

// ─── Pack detail (entities + fields) ─────────────────────────────────────────

function PackDetail({ packName, content }: { packName: string; content: ContractContent }) {
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

// ─── Entity card (collapsible) ────────────────────────────────────────────────

function EntityCard({
  name,
  entity,
}: {
  name: string
  entity: { table: string; fields: Record<string, { type: string; primary?: boolean; unique?: boolean; values?: string[] }>; relations?: Record<string, { type: string; target: string }> }
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
            <tr>
              <th>字段</th>
              <th>类型</th>
              <th>标记</th>
            </tr>
          </thead>
          <tbody>
            {fieldEntries.map(([fname, fdef]) => (
              <tr key={fname}>
                <td className={styles.fieldName}>{fname}</td>
                <td>
                  <span className={`${styles.typeTag} ${styles[`type_${fdef.type}`]}`}>
                    {fdef.type}
                  </span>
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
