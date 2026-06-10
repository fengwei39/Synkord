import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listNotifications, markRead, type Notification } from '../lib/notifications-api'
import { useWebSocket, type WsMessage } from '../lib/ws'
import styles from './NotificationsPage.module.css'

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const queryClient = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => listNotifications(unreadOnly),
  })

  const { mutate: doMarkRead } = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Real-time WebSocket: refresh list on new notification
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === 'contract_updated') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        window.electronAPI.notifyTray?.(1)
      }
    },
    [queryClient],
  )
  useWebSocket(handleWsMessage, true)

  const unreadCount = notifications.filter((n) => !n.readAt).length

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          通知
          {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
        </h2>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          仅显示未读
        </label>
      </div>

      {isLoading && <p className={styles.hint}>加载中…</p>}

      {!isLoading && notifications.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}>🔔</p>
          <p className={styles.emptyText}>{unreadOnly ? '没有未读通知' : '暂无通知'}</p>
        </div>
      )}

      <div className={styles.list}>
        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onMarkRead={() => doMarkRead(n.id)}
          />
        ))}
      </div>
    </div>
  )
}

function NotificationItem({
  notification: n,
  onMarkRead,
}: {
  notification: Notification
  onMarkRead: () => void
}) {
  const [diffOpen, setDiffOpen] = useState(false)
  const isUnread = !n.readAt
  const date = new Date(n.createdAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className={`${styles.item} ${isUnread ? styles.itemUnread : ''}`}>
      <div className={styles.itemHeader}>
        <div className={styles.itemMeta}>
          {isUnread && <span className={styles.unreadDot} />}
          <span className={styles.packName}>{n.packName}</span>
          <span className={styles.versionChange}>
            {n.oldVersion ? `v${n.oldVersion} → ` : ''}
            <strong>v{n.newVersion}</strong>
          </span>
        </div>
        <div className={styles.itemActions}>
          <span className={styles.date}>{date}</span>
          {n.diffSummary != null && (
            <button className={styles.diffToggle} onClick={() => setDiffOpen((o) => !o)}>
              {diffOpen ? '收起' : '查看变更'}
            </button>
          )}
          {isUnread && (
            <button className={styles.readBtn} onClick={onMarkRead}>
              已读
            </button>
          )}
        </div>
      </div>

      {diffOpen && n.diffSummary != null && (
        <DiffSummary summary={n.diffSummary} />
      )}
    </div>
  )
}

interface SummaryEntityDiff {
  change: string
  fields?: Record<string, { change: string; type?: string }>
}

function DiffSummary({ summary }: { summary: unknown }) {
  const entities = summary as Record<string, SummaryEntityDiff>

  return (
    <div className={styles.diffBox}>
      {Object.entries(entities).map(([entityName, entityDiff]) => (
        <div key={entityName} className={styles.diffEntity}>
          <span className={`${styles.changeLabel} ${styles[`change_${entityDiff.change}`]}`}>
            {entityDiff.change === 'added' ? '+' : entityDiff.change === 'removed' ? '-' : '~'}
          </span>
          <span className={styles.diffEntityName}>{entityName}</span>
          {entityDiff.fields && (
            <div className={styles.diffFields}>
              {Object.entries(entityDiff.fields).map(([fname, fDiff]) => (
                <span
                  key={fname}
                  className={`${styles.diffField} ${styles[`change_${fDiff.change}`]}`}
                >
                  {fDiff.change === 'added' ? '+' : fDiff.change === 'removed' ? '-' : '~'}
                  {fname}
                  {fDiff.type != null && <span className={styles.fieldType}> {fDiff.type}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
