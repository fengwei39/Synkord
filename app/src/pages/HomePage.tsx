import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, logout, type AuthUser } from '../lib/auth'
import { getMyOrgs, type Org } from '../lib/orgs'
import ContractsPage from './ContractsPage'
import styles from './HomePage.module.css'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const [me, myOrgs] = await Promise.all([getMe(), getMyOrgs()])
        setUser(me)
        setOrgs(myOrgs)
        if (myOrgs.length === 0) {
          navigate('/onboarding', { replace: true })
          return
        }
        setActiveOrgId(myOrgs[0].id)
      } catch {
        logout()
        navigate('/login', { replace: true })
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [navigate])

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.hint}>加载中…</p>
      </div>
    )
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId)

  return (
    <div className={styles.container}>
      {/* Top bar */}
      <div className={styles.header}>
        <span className={styles.logo}>🔗 Synkord</span>

        <div className={styles.orgSwitcher}>
          {orgs.map((org) => (
            <button
              key={org.id}
              className={`${styles.orgTab} ${activeOrgId === org.id ? styles.orgTabActive : ''}`}
              onClick={() => setActiveOrgId(org.id)}
            >
              {org.name}
            </button>
          ))}
        </div>

        <div className={styles.headerRight}>
          {activeOrg && <span className={styles.orgBadge}>{activeOrg.name}</span>}
          <span className={styles.userEmail}>{user?.email}</span>
          <button className={styles.logoutBtn} onClick={logout}>
            退出
          </button>
        </div>
      </div>

      {/* Body: contracts browser */}
      <div className={styles.body}>
        {activeOrgId && <ContractsPage orgId={activeOrgId} />}
      </div>
    </div>
  )
}
