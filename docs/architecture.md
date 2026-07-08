# Synkord 技术架构 v1.2

> 本文档约定 Synkord 后端服务、Electron 客户端、本地 MCP 服务与 IDE 之间的职责边界。详见 [requirements.md](./requirements.md) 的产品定位。

---

## 〇、本版本变更（相对 v1.1）

| 变更 | 说明 |
|---|---|
| 删除 `/teams/*` 相关路由、TeamContext、`team_id` 参数 | 团队概念删除 |
| 删除 `/members` 独立路由 | 移到 `/contracts/:id/members` |
| 新增 ContractContext | 全局管理活跃契约集 |
| 删除 ProjectContext | 替换为 ContractContext |
| 删除 TeamContext | 不再有 |

---

## 一、总体分层

```
┌─────────────────────────────────────────────────────────────┐
│ 后端服务（Go）                                              │
│  用户 / 契约集 / 成员 / 接口 / 数据模型 / 依赖 / 导入 / MCP   │
│  REST API: /api/*                                          │
└───────────────────────────▲─────────────────────────────────┘
                            │ HTTPS（带 JWT）
                            │
┌───────────────────────────┴─────────────────────────────────┐
│ Electron 桌面应用                                          │
│  ├─ React UI（数据管理 / 契约集浏览 / MCP 控制）            │
│  ├─ Auth Manager（持有 JWT、自动 refresh）                  │
│  ├─ Auth Gateway（本地 HTTP 127.0.0.1、注入 JWT）          │
│  └─ Connect 子进程（MCP 协议层、无状态）                    │
└───────────────────────────▲─────────────────────────────────┘
                            │ MCP 协议（STDIO / HTTP）
                            │
┌───────────────────────────┴─────────────────────────────────┐
│ AI 工具生态（不可控，外部）                                 │
│  Cursor / Claude Desktop / Codex / Continue / Cline ...     │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、路由定义

### 2.1 完整路由表

| 路径 | 页面组件 | 说明 |
|---|---|---|
| `/login` | `Login` | 登录页 |
| `/mcp` | `McpConsole` | **顶级**，MCP 主控台，登录后默认落地 |
| `/contracts` | `ContractList` | 契约集列表 |
| `/contracts/:id` | `ContractDetail` | 契约集详情 |
| `/contracts/:id/apis` | `ContractApis` | 接口列表 |
| `/contracts/:id/apis/:apiId` | `ContractApiDetail` | 接口详情 |
| `/contracts/:id/models` | `ContractEntities` | 数据模型列表 |
| `/contracts/:id/models/:modelId` | `ContractEntityDetail` | 数据模型详情 |
| `/contracts/:id/members` | `ContractMembers` | **新增**：成员管理 |
| `/contracts/:id/import` | `ContractImport` | 导入 OpenAPI/Swagger |
| `/settings` | `Settings` | 个人设置 |
| `*` | `<Navigate to="/mcp" replace />` | 兜底 |

### 2.2 旧路由重定向

| 旧路径 | 新路径 |
|---|---|
| `/projects/*` | `/contracts/*`（保留子路径） |
| `/teams/*` | `/mcp` |
| `/members` | `/mcp` |
| `/contracts/:id/mcp` | `/mcp` |

实现方式：路由层用 `<Navigate>` 组件或 react-router 的 redirect。

### 2.3 顶级导航

```
[Logo]  [MCP★]  [契约集]  [设置]  |  [契约集切换▾]  [👤]
```

| 元素 | 位置 | 行为 |
|---|---|---|
| Logo | 最左 | 点击回 `/mcp` |
| MCP★ | 第 1 位 | 核心功能；旁有健康状态点 |
| 契约集 | 第 2 位 | 跳 `/contracts` |
| 设置 | 第 3 位 | 跳 `/settings` |
| 切换契约集▾ | 右上 | 下拉切换活跃契约集 |
| 👤 | 最右 | 用户菜单（个人信息、登出） |

---

## 三、认证架构

### 3.1 三层凭证

| 层 | 凭证 | 持有方 | 用途 |
|---|---|---|---|
| Layer 1: User ↔ Synkord Web | JWT（当前 Web MVP 存 localStorage；生产建议升级 HttpOnly Cookie） | 浏览器 | 在 Web UI 里管理数据 |
| Layer 2: Electron ↔ Backend | JWT (短期 15min) + Refresh Token (长期 30d) | **Auth Manager** | 所有插件调用后端 |
| Layer 3: IDE ↔ Connect | STDIO 无凭证；HTTP 用本地 Bearer | Connect 自己签发 | IDE 认证到 Connect |

### 3.2 关键不变量

1. **插件永不见真实 JWT**——只调 Auth Gateway
2. **Auth Gateway 是 JWT 的唯一出口**——所有插件调用都经过这里注入 JWT
3. **Token 刷新统一在 Auth Manager**——对插件透明（无感）
4. **本地 Bearer 泄漏无法直接访问后端**——格式与 JWT 不同
5. **用户登出** = Auth Manager 清凭证 + Gateway 拒绝转发 + 通知 Connect 退出
6. **Auth Gateway 只监听 127.0.0.1**——端口随机，不暴露给网络

### 3.3 数据流：AI 查询契约集

```
Cursor (STDIO)
  ↓ { method: "tools/call", name: "get_contract_apis" }
Connect (MCP 子进程)
  ↓ 解析参数，默认用活跃契约集
Auth Gateway (本地 HTTP 127.0.0.1:随机端口)
  ↓ 注入 Authorization: Bearer <jwt>
  ↓ 添加 X-Mcp-Instance: <id>
  ↓ 写 audit log
Synkord Backend
  ↓ 验证 JWT → 返回数据
... 反向回到 AI
```

### 3.4 凭证本地存储

```
~/.synkord/
├── credentials.json         (0600)   JWT + Refresh Token + 用户信息
├── active-contract.json     (0600)   活跃契约集 ID + 设置时间
├── connect-token.json       (0600)   HTTP 模式本地 Bearer
└── audit.log                         Auth Gateway 审计日志
```

**Refresh Token 加密**（推荐）：用用户登录密码派生的密钥加密（PBKDF2 + WebCrypto），启动时让用户输入一次密码解锁。

---

## 四、Electron 架构

### 4.1 主进程模块

```
electron/
├── main.cjs                       入口（窗口、IPC 注册）
├── preload.cjs                    contextBridge 暴露 API
├── auth-manager.cjs               JWT 持有、自动 refresh
├── auth-gateway.cjs               本地 HTTP、注入 JWT
├── connect.cjs                    MCP Connect 子进程
└── ipc-handlers.cjs               所有 IPC handler 注册
```

### 4.2 Auth Manager 职责

| 职责 | 说明 |
|---|---|
| 持有 JWT | 内存 + 加密文件（0600） |
| 自动 refresh | Token 过期前 1 分钟触发 |
| 单飞 refresh | 多个调用方同时触发时只 refresh 一次 |
| 提供 `getAccessToken()` | 给 Gateway 用 |
| 登录 | 调用后端 `/api/auth/login` |
| 登出 | 清本地凭证 + 通知所有插件 |

**状态机**：`idle → logging_in → active → refreshing → active | logging_out → idle`

### 4.3 Auth Gateway 职责

| 职责 | 说明 |
|---|---|
| 启动时随机选端口 | 仅监听 127.0.0.1 |
| 注册/管理插件实例 | Connect 启动时调用 `/gw/register` 提交 instance_id |
| 注入 JWT | 转发请求到后端时自动加 Authorization 头 |
| 注入审计头 | `X-Gateway-Instance`、`X-Gateway-At` |
| 转发请求 | `/gw/api/*` → 后端 `/api/*` |
| 401 处理 | token 过期时通知主进程 |

**端点设计**：
- `POST /gw/register` — 插件注册
- `GET /gw/health` — 健康检查
- `* /gw/api/*` — 转发到后端 `/api/*`

### 4.4 Connect 职责

| 职责 | 说明 |
|---|---|
| 启动时注册到 Gateway | 提交 instance_id |
| 提供 MCP 协议 | STDIO 或 HTTP |
| 调用 Gateway 访问后端 | 走 `/gw/api/*`（不直接调后端） |
| 维护活跃契约集缓存 | 启动时从文件读，运行中监听主进程推送 |
| 不持有 JWT | 永不接触 |

### 4.5 活跃契约集同步机制

**禁止轮询**。使用事件推送：

```
用户切换契约集
  ↓
渲染进程调用 IPC: 'mcp:setActiveContract'
  ↓
后端更新 active_contract 表；桌面端主进程同步 active-contract.json (原子写)
  ↓
主进程通过 IPC/WebSocket 通知 Connect
  ↓
Connect 更新内存中的活跃契约集
  ↓
下次 MCP 工具调用立即生效
```

**契约集切换器**：
- 顶栏 chip 点击 → 下拉
- 选中 → 渲染进程调 `PUT /api/mcp/active-contract`
- 后端写 `active_contract` 表
- 桌面端主进程同步写 `active-contract.json`
- 后端通过 IPC 推送给 Connect
- Connect 更新内存

---

## 五、上下文管理

### 5.1 ContractContext（替代 TeamContext + ProjectContext）

```typescript
interface ContractContextValue {
  activeContract: ActiveContract | null
  contracts: ContractSet[]
  loading: boolean
  error: ApiError | null
  
  refreshContracts: () => Promise<void>
  setActiveContract: (contractId: string) => Promise<void>
  clearActiveContract: () => Promise<void>
  
  // 当前用户对活跃契约集的角色
  activeContractRole: ContractSetRole | null
}
```

**职责**：
- 全局管理活跃契约集（用户手动切换）
- 维护契约集列表缓存
- 暴露当前用户的角色（用于 UI 权限控制）

**Provider 位置**：放在 `AppLayout` 之上，所有受保护路由都能用。

### 5.2 切换活跃契约集的场景

| 场景 | 触发方式 | 是否需要 confirm |
|---|---|---|
| 顶栏切换器选契约集 | UI 点击 → `setActiveContract` | 否（纯导航 + 状态切换） |
| MCP 页面切换器 | UI 点击 → 同上 | 否 |
| 契约集详情页「设为活跃」 | UI 点击 → 同上 → 跳回 `/mcp` | 否 |
| 用户登出 | 清 active + 清 credentials | 否 |

### 5.3 切换契约集的传播路径

```
[UI: 切换器选中]
    ↓
ContractContext.setActiveContract(id)
    ↓
PUT /api/mcp/active-contract
    ↓
[后端] 写 active_contract 表
[桌面端主进程] 同步 active-contract.json 并 IPC 推送给 Connect（运行中的）
    ↓
[Connect] 更新内存中的 activeContractId
    ↓
下次 MCP 工具调用立即使用新契约集
```

---

## 六、错误处理规范

### 6.1 ApiError 模型

```typescript
interface ApiError {
  code: string
  message: string
  hint?: string
  details?: Record<string, unknown>
  httpStatus: number
  recoverable: boolean
}
```

### 6.2 Axios 拦截器行为

| 情况 | 行为 |
|---|---|
| 网络错误（无 response） | 抛 `NETWORK_ERROR`，httpStatus=0 |
| 401 + 未重试过 | 自动 refresh，成功后用新 token 重试原请求 |
| 401 + refresh 失败 | 清凭证 + 跳登录页 + 抛 `AUTH_EXPIRED` |
| 4xx 业务错误 | 抛 ApiError，code/message/hint 从后端取 |
| 5xx | 抛 `SERVER_ERROR`，提示重试 |

### 6.3 UI 错误展示

| 错误类型 | 展示方式 |
|---|---|
| 网络错误 | 全局 toast + 当前页面 `<Alert>` |
| 401 | 跳登录页 |
| 4xx 业务错误 | 当前页面 `<Alert>` 带 hint |
| 5xx | 当前页面 `<Alert>` + "重试"按钮 |
| 表单字段错误 | 字段下方红字 |
| 无活跃契约集 | `<Empty>` + "切换契约集" 按钮 |

### 6.4 MCP 错误码

详见 [mcp-spec.md §四](./mcp-spec.md#四错误码规范)。

---

## 七、风险登记

| # | 风险 | 影响 | 概率 | 缓解 |
|---|---|---|---|---|
| R1 | `/projects` → `/contracts` 改动影响书签 | 低 | 中 | 301 重定向 |
| R2 | MCP 协议升级 | 高 | 中 | 锁定版本，跟随 Cursor 升级 |
| R3 | Node.js 版本差异导致 Connect 启动失败 | 中 | 高 | Connect 内嵌 Node 运行时（打包） |
| R4 | Token 刷新竞态 | 中 | 低 | Auth Manager 单飞 refresh |
| R5 | AI 误解活跃契约集含义 | 中 | 中 | 文档明确 + prompt 模板 |
| R6 | validate_code_against_contract 准确率低 | 高 | 中 | MVP 用正则，覆盖 70% 场景，逐步迭代 |
| R7 | Auth Gateway 端口冲突 | 低 | 低 | 启动时探测可用端口 |
| R8 | 成员管理误操作（误删创建者） | 高 | 低 | 创建者不可被移除或降级（后端硬约束 + 前端 UI 隐藏） |
| R9 | 用户切换契约集后 Connect 还没同步 | 中 | 低 | 事件推送机制 < 50ms，无需轮询 |

---

## 八、相关文档

- [requirements.md](./requirements.md) — 产品需求与数据模型
- [mcp-spec.md](./mcp-spec.md) — MCP 工具、资源、错误码规格
- [ui-spec.md](./ui-spec.md) — UI/UX 规范
- [implementation.md](./implementation.md) — 实施路线与文件改动清单
