// Synkord App routes
// 详见 docs/ui-spec.md §一、docs/architecture.md §二

import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import AppLayout from './components/AppLayout'
import McpConsole from './pages/McpConsole'
import ContractList from './pages/ContractList'
import ContractCreate from './pages/ContractCreate'
import ContractDetail from './pages/ContractDetail'
import ContractApis from './pages/ContractApis'
import ContractApiDetail from './pages/ContractApiDetail'
import ContractEntities from './pages/ContractEntities'
import ContractEntityDetail from './pages/ContractEntityDetail'
import ContractMembers from './pages/ContractMembers'
import ContractImport from './pages/ContractImport'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { AuthProvider, useAuth } from './api/auth'
import { ContractProvider } from './contexts/ContractContext'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, bootstrapping } = useAuth()
  if (bootstrapping) {
    return (
      <div className="route-loading">
        <Spin />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <ContractProvider>
                <AppLayout />
              </ContractProvider>
            </ProtectedRoute>
          }
        >
          {/* MCP 顶级路由（默认落地） */}
          <Route index element={<Navigate to="/mcp" replace />} />
          <Route path="mcp" element={<McpConsole />} />

          {/* 契约集管理 */}
          <Route path="contracts" element={<ContractList />} />
          <Route path="contracts/new" element={<ContractCreate />} />
          <Route path="contracts/:id" element={<ContractDetail />} />
          <Route path="contracts/:id/apis" element={<ContractApis />} />
          <Route path="contracts/:id/apis/:apiId" element={<ContractApiDetail />} />
          <Route path="contracts/:id/models" element={<ContractEntities />} />
          <Route path="contracts/:id/models/:modelId" element={<ContractEntityDetail />} />
          <Route path="contracts/:id/members" element={<ContractMembers />} />
          <Route path="contracts/:id/import" element={<ContractImport />} />

          {/* 设置 */}
          <Route path="settings" element={<Settings />} />

          {/* 兜底 */}
          <Route path="*" element={<Navigate to="/mcp" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}