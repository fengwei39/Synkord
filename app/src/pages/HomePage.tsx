import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, logout, type AuthUser } from '../lib/auth'
import styles from './HomePage.module.css'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {
        logout()
        navigate('/login', { replace: true })
      })
      .finally(() => setLoading(false))
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
        <button className={styles.logoutBtn} onClick={logout}>
          退出
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.welcome}>欢迎，{user?.email}</p>
        <p className={styles.hint}>组织和契约功能即将上线</p>
      </div>
    </div>
  )
}
