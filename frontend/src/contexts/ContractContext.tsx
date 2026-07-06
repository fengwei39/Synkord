// Synkord ContractContext
// 全局管理活跃契约集（替代 TeamContext + ProjectContext）
// 详见 docs/architecture.md §五

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  listContracts,
  getActiveContract,
  setActiveContract as setActiveContractApi,
  createContract,
} from '../api/contracts'
import { useAuth } from '../api/auth'
import type { ContractSet, ActiveContract, ContractSetRole } from '../types/contract'

interface ContractContextType {
  /** 用户有权限访问的契约集列表 */
  contracts: ContractSet[]
  /** 当前活跃契约集 */
  activeContract: ActiveContract | null
  /** 当前活跃契约集的完整信息（从 contracts 列表里找） */
  activeContractSet: ContractSet | null
  /** 当前用户对活跃契约集的角色 */
  activeContractRole: ContractSetRole | null
  loading: boolean
  error: string | null

  /** 刷新契约集列表 */
  refreshContracts: () => Promise<void>
  /** 设置活跃契约集（用户手动切换） */
  setActiveContract: (contractId: string) => Promise<void>
  /** 创建契约集（创建后自动设为活跃） */
  createNewContract: (input: {
    name: string
    project_type: 'backend' | 'web' | 'app'
    description?: string
  }) => Promise<ContractSet>
  /** 清空活跃契约集 */
  clearActiveContract: () => Promise<void>
}

const ContractContext = createContext<ContractContextType>({
  contracts: [],
  activeContract: null,
  activeContractSet: null,
  activeContractRole: null,
  loading: false,
  error: null,
  refreshContracts: async () => {},
  setActiveContract: async () => {},
  createNewContract: async () => {
    throw new Error('ContractProvider not mounted')
  },
  clearActiveContract: async () => {},
})

export function ContractProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<ContractSet[]>([])
  const [activeContract, setActiveContractState] = useState<ActiveContract | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshContracts = useCallback(async () => {
    if (!user) {
      setContracts([])
      setActiveContractState(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [listResult, active] = await Promise.all([
        listContracts({ limit: 200 }),
        getActiveContract(),
      ])
      setContracts(listResult.items)

      // 校验活跃契约集是否还在用户有权限的列表里
      if (active && listResult.items.some((c) => c.id === active.contract_id)) {
        setActiveContractState(active)
      } else {
        // 活跃契约集已失效，清空
        setActiveContractState(null)
      }
    } catch (e: any) {
      setError(e?.message || '加载契约集失败')
    } finally {
      setLoading(false)
    }
  }, [user])

  // 用户登录状态变化时刷新
  useEffect(() => {
    refreshContracts()
  }, [refreshContracts])

  const setActiveContract = useCallback(async (contractId: string) => {
    const active = await setActiveContractApi(contractId)
    setActiveContractState(active)
  }, [])

  const clearActiveContract = useCallback(async () => {
    await setActiveContractApi('') // 后端会处理空值
    setActiveContractState(null)
  }, [])

  const createNewContract = useCallback(
    async (input: {
      name: string
      project_type: 'backend' | 'web' | 'app'
      description?: string
    }) => {
      const contract = await createContract(input)
      // 刷新列表
      await refreshContracts()
      // 自动设为活跃
      await setActiveContract(contract.id)
      return contract
    },
    [refreshContracts, setActiveContract],
  )

  const activeContractSet = useMemo(() => {
    if (!activeContract) return null
    return contracts.find((c) => c.id === activeContract.contract_id) || null
  }, [activeContract, contracts])

  const activeContractRole = activeContractSet?.my_role || null

  const value = useMemo(
    () => ({
      contracts,
      activeContract,
      activeContractSet,
      activeContractRole,
      loading,
      error,
      refreshContracts,
      setActiveContract,
      createNewContract,
      clearActiveContract,
    }),
    [
      contracts,
      activeContract,
      activeContractSet,
      activeContractRole,
      loading,
      error,
      refreshContracts,
      setActiveContract,
      createNewContract,
      clearActiveContract,
    ],
  )

  return <ContractContext.Provider value={value}>{children}</ContractContext.Provider>
}

export function useContract() {
  return useContext(ContractContext)
}