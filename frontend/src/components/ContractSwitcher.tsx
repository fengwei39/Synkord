// Synkord ContractSwitcher
// 顶栏 + MCP 页面共用的契约集切换下拉
// 详见 docs/ui-spec.md §三

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Button,
  Dropdown,
  Empty,
  Input,
  type InputRef,
  Tag,
} from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  DownOutlined,
  FolderOpenOutlined,
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

export function ContractSwitcher({ variant }: ContractSwitcherProps) {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { contracts, activeContract, setActiveContract } = useContract()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<InputRef>(null)

  // 打开时自动 focus 搜索框
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
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
      message.success(`已切换到${contracts.find((c) => c.id === contractId)?.name}，AI 下次查询将使用此契约集`)
      setOpen(false)
      navigate(`/contracts/${contractId}`)
    } catch (e: any) {
      message.error(e?.message || '切换契约集失败')
    } finally {
      setLoading(false)
    }
  }

  const dropdownContent = (
    <div className="contract-switcher-dropdown">
      <div className="switcher-header">
        <span>切换契约集</span>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={() => setOpen(false)}
        />
      </div>
      <div className="switcher-search">
        <Input
          ref={inputRef}
          prefix={<SearchOutlined />}
          placeholder="搜索契约集名..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
      </div>
      <div className="switcher-list">
        {filtered.length === 0 ? (
          <Empty
            description={keyword ? '未找到契约集' : '还没有契约集'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => navigate('/contracts/new')}>
              {keyword ? '创建契约集' : '创建第一个契约集'}
            </Button>
          </Empty>
        ) : (
          filtered.slice(0, 8).map((c) => (
            <div
              key={c.id}
              className={`switcher-item ${
                c.id === activeContract?.contract_id ? 'current' : ''
              }`}
              onClick={() => handleSelect(c.id)}
            >
              <div className="item-name">
                {c.id === activeContract?.contract_id && (
                  <CheckOutlined className="item-check" />
                )}
                {c.name}
              </div>
              <div className="item-meta">
                <Tag color="default">{projectTypeLabels[c.project_type] || c.project_type}</Tag>
                {c.id === activeContract?.contract_id && (
                  <Tag color="blue">当前</Tag>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="switcher-footer">
        <Button
          type="link"
          icon={<FolderOpenOutlined />}
          onClick={() => {
            setOpen(false)
            navigate('/contracts')
          }}
        >
          管理所有契约集
        </Button>
      </div>
    </div>
  )

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      trigger={['click']}
      placement="bottomRight"
      dropdownRender={() => dropdownContent}
    >
      <Button
        type={variant === 'topbar' ? 'text' : 'default'}
        loading={loading}
        className={variant === 'topbar' ? 'contract-switcher-topbar' : 'contract-switcher-page'}
      >
        {activeContract ? activeContract.contract_name : '选择契约集'}
        <DownOutlined />
      </Button>
    </Dropdown>
  )
}