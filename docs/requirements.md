# Synkord 产品需求 v1.2

> 本文档是 Synkord 产品需求的唯一权威来源。技术架构、UI 规范、MCP 工具规格、实施路线分别见同目录下其他文档。

---

## 〇、本版本变更（相对 v1.1）

| 删除 | 说明 |
|---|---|
| Team 实体 | 不再有团队；`team_id` 从所有数据模型、API、MCP 工具移除 |
| `/teams/*` 路由 | 整个团队管理页面移除 |
| 独立 `/members` 页面 | 成员管理移到 `/contracts/:id/members` |
| `TeamContext` | 顶级上下文改为 `ContractContext`（管理活跃契约集） |
| `team_id` 参数 | 所有 API、MCP 工具、资源 URI 移除 |
| 「团队」「成员」顶级 tab | 导航只保留 MCP / 契约集 / 设置 |

| 新增 | 说明 |
|---|---|
| ContractContext | 全局管理活跃契约集 |
| `/contracts/:id/members` | 每个契约集独立的成员管理 |
| 三种角色 | owner（创建者）/ editor / viewer |
| 成员管理规范 | 创建者不可被移除或降级 |

---

## 一、产品定位

### 1.1 一句话定义

**Synkord = 让 AI 在 IDE 里真正理解你的 API 与数据模型。**

不是 API 管理工具，不是协作平台，是 **AI 时代的 API 知识层**——存在的唯一理由是让 Cursor / Codex / Claude Desktop 里的 AI 助手能基于团队的真实数据，给出准确的回答。

### 1.2 用户分层

| 层级 | 角色 | 主要动作 | 接触面 |
|---|---|---|---|
| 主力用户 | 一线开发者 | 在 IDE 里写代码，问 AI | **IDE（90%）** |
| 数据维护者 | 架构师 / Tech Lead | 录入/更新 API 定义、数据模型 | Synkord Web（10%） |
| 管理员 | 契约集创建者 | 管理成员、配置权限 | Synkord Web（偶发） |

主力用户 **几乎不进 Synkord UI**——他们的体验由 IDE 决定。**产品成功的关键指标都在 IDE 那头。**

### 1.3 核心成功指标（3 个月目标）

| # | 指标 | 目标 |
|---|---|---|
| 1 | 5 分钟接通率（从装好到 IDE 第一次准确回答） | ≥ 80% |
| 2 | MCP 调用成功率（24h 内所有调用的 2xx 占比） | ≥ 99% |
| 3 | validate_code_against_contract 一次通过率 | ≥ 70% |
| 4 | 单契约集平均消费方数（远期） | ≥ 2 |
| 5 | OpenAPI 文件导入成功率 | ≥ 90% |

---

## 二、核心定义

### 2.1 三个核心实体

| 实体 | 定义 | 存储 | 管理方 |
|---|---|---|---|
| **契约集（Contract Set）** | 一组 API 定义 + 数据模型，作为消费方的「合同源」 | Synkord 后端 | 契约集创建者（owner） |
| **消费方（Consumer）** | 用户本地的代码仓库，通过 AI 调用 MCP 获取契约约束 | 用户本地 | IDE 用户（不在 Synkord 内） |
| **MCP** | 让 IDE 里的 AI 能查询契约集的协议层 | Electron 内置子进程 | Synkord |

### 2.2 核心用户旅程（5 分钟接通）

```
T+0:00   打开 Synkord → /mcp
T+0:30   下拉选择契约集「订单平台」 → 点「启动 MCP」
T+1:00   复制 Cursor STDIO 配置
T+1:30   在 Cursor 打开本地消费方仓库
T+2:00   AI："写一个调用查询订单接口的 React hook"
T+2:30   AI → MCP get_contract_apis() → 看到 GET /api/orders
T+2:35   AI → MCP get_api_detail(api_id) → 拿到参数 + 返回结构
T+2:40   AI → MCP get_contract_entities(keyword="Order") → 拿到 Order 字段
T+3:00   AI 写出代码（参数正确、类型正确、错误处理正确）
T+4:00   AI → MCP validate_code_against_contract(code) → 自检通过
T+5:00   用户 review → 直接可用
```

### 2.3 核心价值：「做约束」

AI 在消费方里写代码时，**不瞎编**，必须依据契约集的真实性：

| 约束类型 | 示例 |
|---|---|
| 类型约束 | Order.id 是 string，不能调 `.toFixed(2)` |
| 必填约束 | GET /api/orders/{id} 必须传 id |
| 枚举约束 | Order.status 枚举是 ['pending','paid','shipped'] |
| 返回字段约束 | Order.price 可能 undefined，需要判空 |
| API 存在性约束 | /api/orderList 不存在，应使用 /api/orders |

---

## 三、数据模型

### 3.1 TypeScript 类型定义

```typescript
type ContractSetRole = 'owner' | 'editor' | 'viewer'

interface User {
  id: string
  username: string
  email?: string
  created_at: string
}

interface ContractSet {
  id: string
  name: string
  project_type: 'backend' | 'web' | 'app'
  description?: string
  creator_id: string                    // owner 的 user_id
  created_at: string
  updated_at: string
  archived: boolean
  member_count: number
  api_count: number
  entity_count: number
  my_role?: ContractSetRole             // 当前用户在该契约集的角色
}

interface ContractSetMember {
  contract_id: string
  user_id: string
  username: string
  role: ContractSetRole
  invited_at: string
  accepted_at?: string
}

interface ApiDefinition {
  id: string
  contract_id: string
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  summary: string
  description?: string
  tags: string[]
  deprecated: boolean
  parameters?: ApiParameter[]
  request_body?: ApiRequestBody
  responses: Record<string, ApiResponse>
  examples?: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface ApiParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required: boolean
  schema: Record<string, unknown>
  description?: string
}

interface ApiRequestBody {
  required: boolean
  schema: Record<string, unknown>
  description?: string
}

interface ApiResponse {
  description: string
  schema?: Record<string, unknown>
}

interface EntityDefinition {
  id: string
  contract_id: string
  name: string
  description?: string
  fields: EntityField[]
  created_at: string
  updated_at: string
}

interface EntityField {
  name: string
  type: string
  required: boolean
  description?: string
  ref_entity_id?: string                // 引用其他 Entity
  is_array?: boolean
  nullable?: boolean
}

type McpState = 'stopped' | 'starting' | 'running' | 'failed' | 'restarting'

interface McpStatus {
  state: McpState
  pid?: number
  port?: number
  started_at?: string
  last_connection?: { client: string; at: string }
  last_error?: { message: string; at: string }
}

interface ActiveContract {
  contract_id: string
  contract_name: string
  set_at: string
}

interface AccessLogEntry {
  id: string
  contract_id?: string
  tool_name: string
  client: string
  args?: Record<string, unknown>
  status: number
  duration_ms: number
  timestamp: string
}

interface ApiError {
  code: string
  message: string
  hint?: string
  details?: Record<string, unknown>
  httpStatus: number
  recoverable: boolean
}
```

### 3.2 角色权限矩阵

| 操作 | owner | editor | viewer |
|---|---|---|---|
| 查看契约集 | ✓ | ✓ | ✓ |
| 编辑契约集信息（名称、描述） | ✓ | ✓ | ✗ |
| 归档契约集 | ✓ | ✗ | ✗ |
| 删除契约集 | ✓ | ✗ | ✗ |
| 增/改/删 API 定义 | ✓ | ✓ | ✗ |
| 增/改/删 数据模型 | ✓ | ✓ | ✗ |
| 导入 OpenAPI | ✓ | ✓ | ✗ |
| 查看成员列表 | ✓ | ✓ | ✓ |
| 添加成员 | ✓ | ✗ | ✗ |
| 修改成员角色 | ✓ | ✗ | ✗ |
| 移除成员 | ✓ | ✗ | ✗ |

**硬约束**：创建者（creator_id）的 owner 角色 **不可被移除或降级**。

---

## 四、后端 API 规格

**基础路径**：`/api`

### 4.1 认证

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | `{ token, refresh_token, expires_in, user }` |
| POST | `/auth/logout` | - | `{ ok: true }` |
| POST | `/auth/refresh` | `{ refresh_token }` | `{ token, refresh_token?, expires_in }` |
| GET | `/auth/me` | - | `User` |

### 4.2 契约集

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/contracts` | query: `keyword?, project_type?, include_archived?, limit?, offset?` | `{ total, items: ContractSet[] }` |
| POST | `/contracts` | `{ name, project_type, description? }` | `ContractSet` |
| GET | `/contracts/:id` | - | `ContractSet` |
| PATCH | `/contracts/:id` | `{ name?, description?, archived? }` | `ContractSet` |
| DELETE | `/contracts/:id` | - | `void` |

**权限规则**：
- `GET /contracts` 只返回当前用户 `my_role` 不为空的契约集
- `POST /contracts` 创建者自动成为 owner
- `PATCH/DELETE` 仅 owner 可操作

### 4.3 契约集成员

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/contracts/:id/members` | - | `ContractSetMember[]` |
| POST | `/contracts/:id/members` | `{ username, role }` | `ContractSetMember` |
| PATCH | `/contracts/:id/members/:userId` | `{ role }` | `ContractSetMember` |
| DELETE | `/contracts/:id/members/:userId` | - | `void` |

**权限规则**：仅 owner 可操作（除 GET 外）。
**硬约束**：不允许对 creator_id 对应的成员做 PATCH role='editor'|'viewer' 或 DELETE。

### 4.4 接口定义

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/contracts/:contractId/apis` | query: `keyword?, method?, tag?, include_deprecated?, limit?, offset?` | `{ total, items: ApiDefinition[] }` |
| GET | `/contracts/:contractId/apis/:apiId` | - | `ApiDefinition` |
| POST | `/contracts/:contractId/apis` | `Omit<ApiDefinition, 'id'\|'contract_id'\|'created_at'\|'updated_at'>` | `ApiDefinition` |
| PATCH | `/contracts/:contractId/apis/:apiId` | `Partial<ApiDefinition>` | `ApiDefinition` |
| DELETE | `/contracts/:contractId/apis/:apiId` | - | `void` |
| GET | `/contracts/:contractId/apis/:apiId/dependencies` | - | `{ uses_entities: EntityRef[], used_by_apis: ApiRef[] }` |

**权限规则**：GET 任何角色；POST/PATCH/DELETE 仅 owner + editor。

### 4.5 数据模型

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/contracts/:contractId/entities` | query: `keyword?, limit?, offset?` | `{ total, items: EntityDefinition[] }` |
| GET | `/contracts/:contractId/entities/:entityId` | - | `EntityDefinition` |
| POST | `/contracts/:contractId/entities` | `Omit<EntityDefinition, 'id'\|'contract_id'\|'created_at'\|'updated_at'>` | `EntityDefinition` |
| PATCH | `/contracts/:contractId/entities/:entityId` | `Partial<EntityDefinition>` | `EntityDefinition` |
| DELETE | `/contracts/:contractId/entities/:entityId` | - | `void` |
| GET | `/contracts/:contractId/entities/:entityId/dependencies` | - | `{ used_in_apis: ApiRef[], references_entities: EntityRef[] }` |

**权限规则**：GET 任何角色；POST/PATCH/DELETE 仅 owner + editor。

### 4.6 导入

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| POST | `/contracts/:contractId/import/parse` | `{ source, content, format }` | `ParsePreview` |
| POST | `/contracts/:contractId/import/commit` | `{ apis, entities }` | `{ imported_apis, imported_entities }` |

**权限规则**：仅 owner + editor。

```typescript
type ImportSource = 'file' | 'url' | 'paste'
type ImportFormat = 'openapi-3.0' | 'swagger-2.0' | 'postman-2.1'

interface ParsePreview {
  apis: Array<Omit<ApiDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'>>
  entities: Array<Omit<EntityDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'>>
  warnings: string[]
}
```

### 4.7 MCP

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/mcp/status` | - | `McpStatus` |
| POST | `/mcp/start` | - | `McpStatus` |
| POST | `/mcp/stop` | - | `McpStatus` |
| POST | `/mcp/restart` | - | `McpStatus` |
| GET | `/mcp/active-contract` | - | `ActiveContract \| null` |
| PUT | `/mcp/active-contract` | `{ contract_id }` | `ActiveContract` |
| GET | `/mcp/ide-config` | - | `{ stdio: { command, args }, http?: { url, token } }` |
| GET | `/mcp/access-log` | query: `limit?, offset?` | `{ items: AccessLogEntry[], total }` |

### 4.8 用户搜索

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/users/search` | query: `q` | `{ items: User[] }` |

**用途**：成员管理页添加成员时搜索用户。

### 4.9 跨契约集搜索

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/contracts/_search/apis` | query: `keyword, contract_id?, method?, limit?` | `Array<{ contract_id, contract_name, api: ApiSummary }>` |
| GET | `/contracts/_search/entities` | query: `keyword, contract_id?, limit?` | `Array<{ contract_id, contract_name, entity: EntitySummary }>` |

**用途**：供 MCP 跨契约集工具调用。

---

## 五、命名规范对照

| 旧 | 新 | 英文 |
|---|---|---|
| 大项目 | **契约集** | Contract Set |
| 子项目 | **消费方** | Consumer |
| 团队 | （删除） | - |
| 团队成员 | （删除） | - |
| 契约集成员 | 成员 | Contract Member |
| 项目切换 | 契约集切换 | Contract Switch |
| 活跃项目 | 活跃契约集 | Active Contract |
| /projects | /contracts | - |
| /teams | （删除） | - |
| /members | /contracts/:id/members | - |
| synkord://projects | synkord://contracts | - |
| get_project_apis | get_contract_apis | - |
| get_project_entities | get_contract_entities | - |
| API 定义 | 接口定义 | API Definition |
| 数据模型 | 数据模型 | Entity |
| validate_code_against_contract | （保留） | - |

---

## 六、文案规范

| 场景 | 文案 |
|---|---|
| MCP 未启动 | "MCP 未启动。启动后 AI 可查询契约集。" |
| MCP 启动中 | "MCP 启动中..." |
| MCP 运行中 | "MCP 运行中 · PID 12345" |
| MCP 停止 confirm 标题 | "停止 Synkord MCP？" |
| MCP 停止 confirm 内容 | "停止后所有 IDE 连接将断开，AI 查询将失败。" |
| 无活跃契约集 | "尚未选择活跃契约集。请先在下方选择。" |
| 切换契约集成功 toast | "已切换到订单平台，AI 下次查询将使用此契约集。" |
| 导入成功 toast | "成功导入 18 个接口和 3 个数据模型" |
| 解析失败 | "第 12 行：paths 字段缺失" |
| 空状态（无契约集） | "还没有契约集。创建一个，开始为消费方提供契约。" |
| 5 分钟接通指引 | "1. 打开 Cursor / Claude Desktop / Codex  2. 找到 MCP 设置  3. 粘贴配置  4. 重启 IDE  5. 问 AI：'基于订单平台写个查询订单的代码'" |
| 代码不符合契约 | "代码不符合契约：3 个错误、2 个警告" |
| 校验失败详情 | "Order.id 类型应为 string，但使用了 number（line 12）" |
| 创建者保护提示 | "创建者不可被移除或降级" |

---

## 七、相关文档

- [architecture.md](./architecture.md) — 技术架构与认证
- [mcp-spec.md](./mcp-spec.md) — MCP 工具、资源、错误码规格
- [ui-spec.md](./ui-spec.md) — UI/UX 规范
- [implementation.md](./implementation.md) — 实施路线与文件改动清单