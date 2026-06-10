import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrg, acceptInvite, getInvite, toSlug } from '../lib/orgs'
import styles from './OnboardingPage.module.css'

type Step = 'choice' | 'create' | 'join'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('choice')

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>🔗</div>
        <h1 className={styles.title}>欢迎使用 Synkord</h1>
        <p className={styles.subtitle}>先设置一下你的组织</p>

        {step === 'choice' && <ChoiceStep onChoose={setStep} />}
        {step === 'create' && (
          <CreateStep onBack={() => setStep('choice')} onDone={() => navigate('/home', { replace: true })} />
        )}
        {step === 'join' && (
          <JoinStep onBack={() => setStep('choice')} onDone={() => navigate('/home', { replace: true })} />
        )}
      </div>
    </div>
  )
}

// ─── Choice step ──────────────────────────────────────────────────────────────

function ChoiceStep({ onChoose }: { onChoose: (s: 'create' | 'join') => void }) {
  return (
    <div className={styles.choiceList}>
      <button className={styles.choiceBtn} onClick={() => onChoose('create')}>
        <span className={styles.choiceIcon}>🏗️</span>
        <span className={styles.choiceLabel}>创建新组织</span>
        <span className={styles.choiceDesc}>我是团队负责人，从零开始</span>
      </button>
      <button className={styles.choiceBtn} onClick={() => onChoose('join')}>
        <span className={styles.choiceIcon}>🔑</span>
        <span className={styles.choiceLabel}>加入已有组织</span>
        <span className={styles.choiceDesc}>我有邀请码，加入团队</span>
      </button>
    </div>
  )
}

// ─── Create step ──────────────────────────────────────────────────────────────

function CreateStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleNameChange(v: string) {
    setName(v)
    if (!slugEdited) setSlug(toSlug(v))
  }

  function handleSlugChange(v: string) {
    setSlugEdited(true)
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await createOrg(name.trim(), slug.trim() || toSlug(name.trim()))
      onDone()
    } catch (err: unknown) {
      setError(extractMsg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="orgName">
          组织名称
        </label>
        <input
          id="orgName"
          className={styles.input}
          placeholder="例：我的团队"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="orgSlug">
          标识符（英文）
        </label>
        <input
          id="orgSlug"
          className={styles.input}
          placeholder="例：my-team"
          value={slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          required
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          返回
        </button>
        <button type="submit" className={styles.submitBtn} disabled={loading || !name.trim() || !slug.trim()}>
          {loading ? '创建中…' : '创建组织'}
        </button>
      </div>
    </form>
  )
}

// ─── Join step ────────────────────────────────────────────────────────────────

function JoinStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [token, setToken] = useState('')
  const [preview, setPreview] = useState<{ orgName: string; inviterEmail: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLookup(e: FormEvent) {
    e.preventDefault()
    setError('')
    setPreview(null)
    setLoading(true)
    try {
      const info = await getInvite(token.trim())
      setPreview({ orgName: info.orgName, inviterEmail: info.inviterEmail })
    } catch {
      setError('邀请码无效或已过期')
    } finally {
      setLoading(false)
    }
  }

  async function handleAccept() {
    setError('')
    setLoading(true)
    try {
      await acceptInvite(token.trim())
      onDone()
    } catch (err: unknown) {
      setError(extractMsg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.form}>
      <form onSubmit={handleLookup}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="inviteToken">
            邀请码
          </label>
          <input
            id="inviteToken"
            className={styles.input}
            placeholder="粘贴邀请链接或邀请码"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}

        {preview ? (
          <div className={styles.preview}>
            <p className={styles.previewText}>
              即将加入 <strong>{preview.orgName}</strong>
              {preview.inviterEmail && <>，邀请人：{preview.inviterEmail}</>}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.backBtn} onClick={onBack}>
                返回
              </button>
              <button type="button" className={styles.submitBtn} disabled={loading} onClick={handleAccept}>
                {loading ? '加入中…' : '确认加入'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={styles.backBtn} onClick={onBack}>
              返回
            </button>
            <button type="submit" className={styles.submitBtn} disabled={loading || !token.trim()}>
              {loading ? '查询中…' : '查询邀请'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

function extractMsg(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    return e.response?.data?.error ?? e.message ?? '操作失败，请稍后重试'
  }
  return '操作失败，请稍后重试'
}
