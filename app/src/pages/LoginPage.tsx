import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../lib/auth'
import styles from './LoginPage.module.css'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await login({ email, password })
      } else {
        await register({ email, password })
      }
      navigate('/home', { replace: true })
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function toggleMode() {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError('')
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>🔗</div>
        <h1 className={styles.title}>Synkord</h1>
        <p className={styles.subtitle}>契约管理，一致协作</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              className={styles.input}
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              密码
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              placeholder={mode === 'register' ? '至少 8 位' : '输入密码'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <button className={styles.toggleBtn} onClick={toggleMode} type="button">
          {mode === 'login' ? '没有账号？立即注册' : '已有账号？去登录'}
        </button>
      </div>
    </div>
  )
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } }
      message?: string
    }
    const data = axiosErr.response?.data
    if (data?.error) return data.error
    if (data?.message) return data.message
    if (axiosErr.message) return axiosErr.message
  }
  return '操作失败，请稍后重试'
}
