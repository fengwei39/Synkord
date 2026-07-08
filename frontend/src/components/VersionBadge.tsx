import { useEffect, useState } from 'react'
import { Button, Popover, Space, Typography } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'

const { Text } = Typography

type CheckState = 'idle' | 'checking' | 'available' | 'none' | 'unavailable' | 'error' | 'installing'

export default function VersionBadge() {
  const [version, setVersion] = useState('dev')
  const [packaged, setPackaged] = useState(false)
  const [state, setState] = useState<CheckState>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.synkord?.getAppVersion?.()
      .then((info) => {
        if (cancelled) return
        setVersion(info.version || 'dev')
        setPackaged(!!info.packaged)
      })
      .catch(() => {
        if (!cancelled) {
          setVersion('dev')
          setPackaged(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const checkUpdate = async () => {
    setState('checking')
    setMessage(null)
    try {
      const result = await window.synkord?.checkForUpdates?.()
      if (!result) {
        setState('unavailable')
        setMessage('当前环境不支持在线更新')
        return
      }
      setLatestVersion(result.latestVersion || null)
      setMessage(result.message || null)
      setState(result.status)
    } catch (error: any) {
      setState('error')
      setMessage(error?.message || '检查更新失败')
    }
  }

  const installUpdate = async () => {
    setState('installing')
    setMessage('正在下载更新，完成后将重启安装')
    try {
      const result = await window.synkord?.installUpdate?.()
      if (!result || result.status === 'error' || result.status === 'unavailable') {
        setState(result?.status || 'error')
        setMessage(result?.message || '无法安装更新')
      }
    } catch (error: any) {
      setState('error')
      setMessage(error?.message || '安装更新失败')
    }
  }

  const statusText = (() => {
    if (!packaged) return '开发模式不支持在线更新'
    if (state === 'checking') return '正在检查更新...'
    if (state === 'available') return `发现新版本 v${latestVersion}`
    if (state === 'none') return '当前已是最新版本'
    if (state === 'installing') return '正在准备更新...'
    if (state === 'error') return message || '检查更新失败'
    if (state === 'unavailable') return message || '在线更新不可用'
    return '点击检查是否有新版本'
  })()

  const content = (
    <Space direction="vertical" size={10} style={{ width: 220 }}>
      <Space direction="vertical" size={2}>
        <Text strong>Synkord v{version}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{statusText}</Text>
      </Space>
      <Space>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={state === 'checking'}
          onClick={checkUpdate}
        >
          检查更新
        </Button>
        {state === 'available' && (
          <Button
            size="small"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={installUpdate}
          >
            更新
          </Button>
        )}
      </Space>
    </Space>
  )

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      content={content}
      placement="bottomLeft"
    >
      <button
        type="button"
        className="synkord-version-badge"
        title="检查更新"
        onClick={(event) => event.stopPropagation()}
      >
        v{version}
      </button>
    </Popover>
  )
}
