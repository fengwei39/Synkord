import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, logout, type AuthUser } from '../lib/auth'
import { getMyOrgs, type Org } from '../lib/orgs'
import styles from './HomePage.module.css'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const [me, myOrgs] = await Promise.all([getMe(), getMyOrgs()])
        setUser(me)
        setOrgs(myOrgs)
        if (myOrgs.length === 0) {
          navigate('/onboarding', { replace: true })
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.logo}>🔗 Synkord</span>
        <div className={styles.headerRight}>
          {orgs[0] && <span className={styles.orgBadge}>{orgs[0].name}</span>}
          <button className={styles.logoutBtn} onClick={logout}>
            退出
          </button>
        </div>
      </div>
      <div className={styles.body}>
        <p className={styles.welcome}>欢迎，{user?.email}</p>
        <p className={styles.hint}>契约浏览器即将上线</p>
      </div>
    </div>
  )
}
