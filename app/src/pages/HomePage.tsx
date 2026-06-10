import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getMe, logout, type AuthUser } from '../lib/auth'
import { getMyOrgs, type Org } from '../lib/orgs'
import { getToken } from '../lib/api'
import { registerDevice } from '../lib/contracts'
import { getProjectsByOrg } from '../lib/ide-sync'
import ContractsPage from './ContractsPage'
import ProjectsPage from './ProjectsPage'
import styles from './HomePage.module.css'

type MainTab = 'contracts' | 'projects'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string>('')
  const [mainTab, setMainTab] = useState<MainTab>('contracts')
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
        const firstOrgId = myOrgs[0].id
        setActiveOrgId(firstOrgId)
        const token = getToken()
        if (token) window.electronAPI.setMCPToken(token)

        // Auto-register device for all orgs (fire-and-forget)
        const device = await window.electronAPI.getDeviceInfo()
        for (const org of myOrgs) {
          const projectNames = getProjectsByOrg(org.id).map((p) => p.name)
          registerDevice(org.id, device, projectNames).catch(() => { /* ignore */ })
        }
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
          <Link to="/notifications" className={styles.bellBtn} title="通知">
            🔔
          </Link>
          <button className={styles.logoutBtn} onClick={logout}>
            退出
          </button>
        </div>
      </div>

      {/* Sub nav */}
      <div className={styles.subNav}>
        <button
          className={`${styles.subNavTab} ${mainTab === 'contracts' ? styles.subNavActive : ''}`}
          onClick={() => setMainTab('contracts')}
        >
          📋 契约包
        </button>
        <button
          className={`${styles.subNavTab} ${mainTab === 'projects' ? styles.subNavActive : ''}`}
          onClick={() => setMainTab('projects')}
        >
          🗂️ 本地项目
        </button>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {activeOrgId && mainTab === 'contracts' && (
          <ContractsPage orgId={activeOrgId} orgSlug={activeOrg?.slug ?? ''} />
        )}
        {activeOrgId && mainTab === 'projects' && activeOrg && (
          <ProjectsPage orgId={activeOrgId} orgName={activeOrg.name} orgSlug={activeOrg.slug} />
        )}
      </div>
    </div>
  )
}
