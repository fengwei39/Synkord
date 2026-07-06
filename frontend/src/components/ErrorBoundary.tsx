// Synkord React Error Boundary
// 拦截子组件 render 错误，给出可读错误信息而不是白屏
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[Synkord] React render error:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleCopyError = () => {
    const { error } = this.state
    if (!error) return
    const text = `${error.name}: ${error.message}\n${error.stack || ''}`
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#fff',
        color: '#1f1f1f',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Synkord 渲染错误</h1>
        <p style={{ color: '#666', marginBottom: 16 }}>
          应用遇到了一个意外问题。请尝试刷新页面；如仍异常，请复制下方错误并反馈。
        </p>
        <pre style={{
          maxWidth: 800,
          maxHeight: '40vh',
          overflow: 'auto',
          padding: 16,
          background: '#fafafa',
          border: '1px solid #eee',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {`${error.name}: ${error.message}\n\n${error.stack || ''}`}
        </pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={this.handleReload} style={btnPrimary}>刷新页面</button>
          <button onClick={this.handleCopyError} style={btn}>复制错误</button>
        </div>
      </div>
    )
  }
}

const btn: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #d9d9d9',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  ...btn,
  background: '#1677ff',
  color: '#fff',
  border: '1px solid #1677ff',
}