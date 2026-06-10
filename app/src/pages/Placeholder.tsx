interface Props {
  title: string
}

export default function Placeholder({ title }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: '#0f172a',
        color: '#e2e8f0',
        gap: '16px',
      }}
    >
      <div style={{ fontSize: 40 }}>🔗</div>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Synkord</h1>
      <p style={{ margin: 0, color: '#94a3b8' }}>{title}</p>
    </div>
  )
}
