// Synkord ContractSwitcher
// 顶栏 + MCP 页面共用的契约集切换下拉
// 详见 docs/ui-spec.md §三
//
// 实现要点：
// - 使用原生 div + 手动控制 display，避免 antd Dropdown 在 Electron drag 区域失效
// - 显式设置 -webkit-app-region: no-drag 使下拉在顶栏可点击

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as AntApp, Empty, Input, Tag } from 'antd'
import {
  CheckOutlined,
  CheckCircleFilled,
  CloseOutlined,
  DownOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useContract } from '../contexts/ContractContext'

interface ContractSwitcherProps {
  /** topbar 模式下显示为紧凑 chip；mcp-page 模式下显示为完整按钮 */
  variant: 'topbar' | 'mcp-page'
}

const projectTypeLabels: Record<string, string> = {
  backend: '后端服务',
  web: 'Web 前端',
  app: 'App 移动端',
}

const projectTypeColors: Record<string, string> = {
  backend: 'blue',
  web: 'green',
  app: 'purple',
}

export function ContractSwitcher({ variant }: ContractSwitcherProps) {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { contracts, activeContract, setActiveContract } = useContract()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // 用 mousedown 早于 click 触发，避免被 antd 拦截
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [open])

  // 打开时自动 focus 搜索框
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus?.(), 50)
    } else {
      setKeyword('')
    }
  }, [open])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return contracts
    return contracts.filter((c) => c.name.toLowerCase().includes(kw))
  }, [contracts, keyword])

  const handleSelect = async (contractId: string) => {
    if (contractId === activeContract?.contract_id) {
      setOpen(false)
      navigate(`/contracts/${contractId}`)
      return
    }
    setLoading(true)
    try {
      await setActiveContract(contractId)
      const target = contracts.find((c) => c.id === contractId)
      message.success(`已切换到「${target?.name || ''}」，AI 下次查询将使用此契约集`)
      setOpen(false)
      navigate(`/contracts/${contractId}`)
    } catch (e: any) {
      message.error(e?.message || '切换契约集失败')
    } finally {
      setLoading(false)
    }
  }

  const activeIsCurrent = !!activeContract

  return (
    <div
      ref={rootRef}
      className={`contract-switcher contract-switcher-${variant} ${open ? 'open' : ''}`}
    >
      <button
        type="button"
        className="contract-switcher-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {variant === 'topbar' ? (
          <>
            <span className="trigger-label">契约集</span>
            <span className={`trigger-value ${activeIsCurrent ? '' : 'empty'}`}>
              {activeIsCurrent ? activeContract!.contract_name : '未选择'}
            </span>
            <DownOutlined className={`trigger-arrow ${open ? 'flip' : ''}`} />
          </>
        ) : (
          <>
            <span className="trigger-label">活跃契约集</span>
            <span className={`trigger-value ${activeIsCurrent ? '' : 'empty'}`}>
              {activeIsCurrent ? activeContract!.contract_name : '尚未选择'}
            </span>
            <DownOutlined className={`trigger-arrow ${open ? 'flip' : ''}`} />
          </>
        )}
      </button>

      {open && (
        <div className="contract-switcher-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="switcher-header">
            <span className="switcher-title">切换契约集</span>
            <button
              type="button"
              className="switcher-close"
              onClick={() => setOpen(false)}
              title="关闭"
            >
              <CloseOutlined />
            </button>
          </div>

          <div className="switcher-search">
            <Input
              ref={inputRef}
              prefix={<SearchOutlined className="search-icon" />}
              placeholder="搜索契约集名..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
              autoFocus
            />
          </div>

          <div className="switcher-list">
            {filtered.length === 0 ? (
              <div className="switcher-empty">
                <Empty
                  description={keyword ? '未找到匹配的契约集' : '还没有契约集'}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
                <button
                  type="button"
                  className="switcher-action-btn primary"
                  onClick={() => {
                    setOpen(false)
                    navigate('/contracts/new')
                  }}
                >
                  <PlusOutlined /> {keyword ? '创建契约集' : '创建第一个契约集'}
                </button>
              </div>
            ) : (
              filtered.slice(0, 8).map((c) => {
                const isCurrent = c.id === activeContract?.contract_id
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`switcher-item ${isCurrent ? 'current' : ''}`}
                    onClick={() => handleSelect(c.id)}
                  >
                    <div className="item-row">
                      <div className="item-name">
                        {isCurrent ? (
                          <CheckCircleFilled className="item-check" />
                        ) : (
                          <span className="item-bullet" />
                        )}
                        <span className="item-name-text">{c.name}</span>
                      </div>
                      <div className="item-meta">
                        <Tag color={projectTypeColors[c.project_type] || 'default'}>
                          {projectTypeLabels[c.project_type] || c.project_type}
                        </Tag>
                        {isCurrent && <Tag color="blue">当前</Tag>}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="switcher-footer">
            <button
              type="button"
              className="switcher-footer-link"
              onClick={() => {
                setOpen(false)
                navigate('/contracts')
              }}
            >
              <FolderOpenOutlined /> 管理所有契约集
            </button>
          </div>
        </div>
      )}
    </div>
  )
}