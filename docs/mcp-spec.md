# Synkord MCP 规格说明书 v1.2

> 本文档定义 Synkord MCP 暴露给 IDE 的工具、资源、错误码。详见 [requirements.md](./requirements.md) 的产品定位。

---

## 〇、本版本变更（相对 v1.1）

| 变更 | 说明 |
|---|---|
| 删除所有 `team_id` 参数 | 团队概念删除 |
| 资源 URI 前缀 `synkord://projects/*` → `synkord://contracts/*` | 命名统一 |
| `validate_code_against_contract` 输入参数微调 | `contract_id` 改为可选 |

---

## 一、架构原则

### 1.1 核心约定

- MCP server **有一个活跃契约集**（用户在 Synkord UI 手动设置）
- 业务工具**默认操作活跃契约集**（不传 `contract_id` 时）
- 跨契约集查询必须显式传 `contract_id`
- 切换活跃契约集是**显式手动行为**（不自动检测）

### 1.2 与 Synkord UI 的关系

- **不持有同步状态**：MCP server 不与 UI 共享状态，所有变更走事件推送
- **不假定默认契约集**：每次启动 Connect 时从 `active-contract.json` 读取
- **不缓存用户上下文**：每个工具调用自包含

### 1.3 协议版本

- 当前实现：**MCP 2025-06（Streamable HTTP）**
- 锁定版本，跟随 Cursor / Claude Desktop 升级节奏

---

## 二、工具规范

### 2.1 元工具

#### `get_user_info`

获取当前用户信息。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| （无） | - | - | - |

**输出**：
```typescript
{
  user_id: string
  username: string
  email?: string
}
```

**调用链**：`GET /api/auth/me`

---

#### `list_contracts`

列出所有契约集（用户有权限访问的）。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `keyword` | string | 否 | 名称模糊匹配 |
| `include_archived` | boolean | 否 | 默认 false |
| `limit` | number | 否 | 默认 50 |
| `offset` | number | 否 | 默认 0 |

**输出**：
```typescript
{
  total: number
  items: ContractSet[]
}
```

**调用链**：`GET /api/contracts?...`

---

#### `find_contract`

智能搜索契约集，按匹配度排序（exact > prefix > contains）。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `keyword` | string | 是 | 搜索关键词 |
| `limit` | number | 否 | 默认 20 |

**输出**：
```typescript
Array<{
  contract_id: string
  contract_name: string
  match_type: 'exact' | 'prefix' | 'contains'
}>
```

**实现**：客户端调用 `list_contracts(keyword=...)` 后按 `match_type` 排序。

---

### 2.2 业务工具（默认操作活跃契约集）

#### `get_contract_apis`

获取契约集的 API 列表。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `contract_id` | string | 否 | 不传 = 活跃契约集 |
| `keyword` | string | 否 | 路径/名称/描述模糊搜索 |
| `method` | enum: GET\|POST\|PUT\|DELETE\|PATCH | 否 | 方法过滤 |
| `tag` | string | 否 | tag 过滤 |
| `include_deprecated` | boolean | 否 | 默认 false |

**输出**：
```typescript
{
  total: number
  items: Array<{
    api_id: string
    path: string
    method: string
    summary: string
    description?: string
    tags: string[]
    deprecated: boolean
    parameters?: ApiParameter[]
    request_body?: ApiRequestBody
    responses: Record<string, ApiResponse>
  }>
}
```

**错误**：
- `NO_ACTIVE_CONTRACT` — 未传 `contract_id` 且无活跃契约集
- `CONTRACT_NOT_FOUND` — `contract_id` 不存在或无权访问

---

#### `get_contract_entities`

获取契约集的数据模型列表。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `contract_id` | string | 否 | 不传 = 活跃契约集 |
| `keyword` | string | 否 | 名称/描述模糊搜索 |

**输出**：
```typescript
{
  total: number
  items: EntityDefinition[]
}
```

---

#### `get_api_detail`

获取单个 API 完整定义。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `api_id` | string | 是 | - |
| `contract_id` | string | 否 | 不传 = 活跃契约集 |

**输出**：`ApiDefinition`

---

#### `get_entity_detail`

获取单个数据模型完整定义。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `entity_id` | string | 是 | - |
| `contract_id` | string | 否 | 不传 = 活跃契约集 |

**输出**：`EntityDefinition`

---

#### `get_api_dependencies`

获取 API 的依赖关系（使用哪些实体 / 被哪些 API 引用）。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `api_id` | string | 是 | - |
| `contract_id` | string | 否 | 不传 = 活跃契约集 |

**输出**：
```typescript
{
  uses_entities: Array<{
    entity_id: string
    entity_name: string
    usage: 'request_param' | 'response_body' | 'header'
  }>
  used_by_apis: Array<{
    api_id: string
    path: string
    method: string
  }>
}
```

---

#### `get_entity_dependencies`

获取数据模型的依赖关系（被哪些 API 用 / 引用了哪些实体）。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `entity_id` | string | 是 | - |
| `contract_id` | string | 否 | 不传 = 活跃契约集 |

**输出**：
```typescript
{
  used_in_apis: Array<{
    api_id: string
    path: string
    method: string
    usage: string
  }>
  references_entities: Array<{
    entity_id: string
    entity_name: string
    field_name: string
  }>
}
```

---

#### `validate_code_against_contract` ⭐

**核心约束工具**：校验代码片段是否符合契约。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code_snippet` | string | 是 | 用户写的代码 |
| `language` | enum: typescript\|javascript\|python\|go\|java | 是 | 代码语言 |
| `check_against.api_ids` | string[] | 否 | 校验这些 API 的入参/返回 |
| `check_against.entity_ids` | string[] | 否 | 校验这些实体的类型 |
| `check_against.operation` | enum: request\|response\|both | 否 | 默认 both |
| `contract_id` | string | 否 | 不传 = 活跃契约集 |

**输出**：
```typescript
{
  valid: boolean                          // 整体是否通过（无 error 级别问题）
  issues: Array<{
    severity: 'error' | 'warning'
    line?: number                        // 代码行号
    field?: string                       // 字段名
    message: string                      // 问题描述
    suggestion?: string                  // 修复建议
  }>
}
```

**当 `valid = false` 时抛 `CONTRACT_VIOLATION` 错误**，把 issues 放在 `details.issues`。

---

### 2.3 跨契约集工具

#### `search_apis_across_contracts`

跨契约集搜索 API。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `keyword` | string | 是 | 关键词 |
| `contract_id` | string | 否 | 限定单个契约集 |
| `method` | string | 否 | 方法过滤 |
| `limit` | number | 否 | 默认 30 |

**输出**：
```typescript
Array<{
  contract_id: string
  contract_name: string
  api: {
    api_id: string
    path: string
    method: string
    summary: string
  }
}>
```

---

#### `search_entities_across_contracts`

跨契约集搜索实体。

**输入**：
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `keyword` | string | 是 | 关键词 |
| `contract_id` | string | 否 | 限定单个契约集 |
| `limit` | number | 否 | 默认 30 |

**输出**：
```typescript
Array<{
  contract_id: string
  contract_name: string
  entity: {
    entity_id: string
    name: string
    description?: string
  }
}>
```

---

## 三、Resources

AI 可通过 `resources/read` 被动读取的资源。

| URI | 内容 |
|---|---|
| `synkord://active-contract` | 活跃契约集元信息（contract_id, contract_name） |
| `synkord://active-contract/summary` | 摘要：api_count, entity_count, recently_changed |
| `synkord://active-contract/apis/{api_id}` | 单个 API 完整定义 |
| `synkord://active-contract/entities/{entity_id}` | 单个实体完整定义 |
| `synkord://contracts` | 全部契约集列表（用于跨查询） |

**典型工作流**：
```
1. AI 启动对话 → 读 synkord://active-contract → 知道当前契约集
2. AI 读 synkord://active-contract/summary → 知道有哪些 API/Entity
3. AI 按需 get_api_detail / get_entity_detail 拿具体合同
4. AI 写完代码后调 validate_code_against_contract 自检
5. 如有问题，回到步骤 3 细化查询
```

---

## 四、错误码规范

### 4.1 错误响应格式

```typescript
{
  error: string                          // 错误码
  message: string                        // 人类可读
  hint?: string                          // AI 可执行的下一步
  details?: Record<string, unknown>      // 详细数据
  recoverable: boolean                   // AI 能否自行恢复
}
```

### 4.2 错误码列表

| ErrorCode | message | hint | recoverable | 何时触发 |
|---|---|---|---|---|
| `NO_ACTIVE_CONTRACT` | "No active contract selected" | "请在 Synkord 桌面客户端选择契约集" | true | 用户没选活跃契约集就调业务工具 |
| `CONTRACT_NOT_FOUND` | "Contract 'X' not found or not accessible" | "用 list_contracts() 查找可用契约集" | true | contract_id 不存在或无权访问 |
| `API_NOT_FOUND` | "API 'X' not found" | "用 get_contract_apis() 查找可用 API" | true | api_id 不存在 |
| `ENTITY_NOT_FOUND` | "Entity 'X' not found" | "用 get_contract_entities() 查找可用实体" | true | entity_id 不存在 |
| `MISSING_PARAM` | "X is required" | 提示调哪个工具 | true | 必填参数缺失 |
| `INVALID_PARAM` | "X is invalid" | 提示正确的格式 | true | 参数格式错误 |
| `AUTH_EXPIRED` | "User session expired" | "请在 Synkord 客户端重新登录" | false | JWT 过期 |
| `CONTRACT_VIOLATION` | "代码不符合契约" | "查看 details.issues 修复所有 error 级别问题" | true | validate_code_against_contract 发现违规 |
| `BACKEND_UNAVAILABLE` | "后端不可达" | "检查网络" | true | 后端 5xx |
| `RATE_LIMITED` | "请求过于频繁" | "稍后重试" | true | 429 |
| `INTERNAL_ERROR` | "内部错误" | "联系管理员" | false | 兜底 |

### 4.3 错误响应示例

```json
// 用户没选契约集
{
  "error": "NO_ACTIVE_CONTRACT",
  "message": "No active contract selected",
  "hint": "请在 Synkord 桌面客户端选择契约集后再让 AI 调用 MCP",
  "recoverable": true
}

// 跨契约集查询时给错 ID
{
  "error": "CONTRACT_NOT_FOUND",
  "message": "Contract 'C-xyz' not found or not accessible",
  "hint": "请用 list_contracts() 查找可用的契约集 ID",
  "recoverable": true
}

// 校验失败
{
  "error": "CONTRACT_VIOLATION",
  "message": "代码不符合契约：3 个错误、2 个警告",
  "hint": "查看 details.issues 修复所有 error 级别问题",
  "details": {
    "issues": [
      { "severity": "error", "line": 12, "field": "orderId",
        "message": "Order.id 类型应为 string，但使用了 number",
        "suggestion": "检查参数类型，应该是 string" },
      { "severity": "warning", "line": 18, "field": "createdAt",
        "message": "Order.createdAt 字段不存在",
        "suggestion": "Order 没有 createdAt 字段，可能是 created_at" }
    ]
  },
  "recoverable": true
}

// 认证过期
{
  "error": "AUTH_EXPIRED",
  "message": "User session expired",
  "hint": "请在 Synkord 桌面客户端重新登录",
  "recoverable": false
}
```

---

## 五、`validate_code_against_contract` 详细规格

### 5.1 MVP 校验规则

| 规则 | 严重度 | 示例 |
|---|---|---|
| 调用的 URL/API 不存在于契约 | error | `/api/orderList` 不存在，应是 `/api/orders` |
| 缺少必填参数 | error | `GET /api/orders/{id}` 没传 id |
| 类型不匹配 | error | Order.id 应为 string，写成 number |
| 字段名不存在 | error | 用了 Order.createdAt，应为 created_at |
| 枚举值非法 | error | status: 'completed'，应为 ['pending','paid','shipped'] |
| 字段可能为空未判空 | warning | Order.price 可空但直接 .toFixed() |
| 未使用的导入 | warning | import { Order } 但代码里没用 |

### 5.2 MVP 实现策略

**用正则提取 HTTP 调用**，覆盖 70% 场景：

| 语言 | 提取模式 |
|---|---|
| TypeScript/JavaScript | `fetch('...')`、`axios.get('...')`、`http.get('...')` 等 |
| Python | `requests.get('...')`、`requests.post('...')` 等 |
| Go | `http.Get('...')`、`http.Post('...', ...)` 等 |
| Java | `RestTemplate.getForObject('...', ...)`、`HttpClient` 等 |

类型断言提取：`const x: Type = ...`、Python 的 `: Type` 注解。

### 5.3 后续演进

- v1.1：用 tree-sitter 做完整 AST 解析
- v1.2：支持 ORM 映射校验（如 Prisma schema 对照）
- v1.3：支持错误处理校验（如 status code 4xx/5xx 是否有 catch）
- v2.0：基于 LLM 的语义级校验

---

## 六、AI Prompt 模板

### 6.1 Synkord MCP 使用约定（写入 MCP 服务描述）

```markdown
# Synkord MCP 使用约定

## ⚠️ 重要：所有契约集操作基于「活跃契约集」

本 MCP server 有一个「活跃契约集」（用户在 Synkord 桌面客户端设置）。
- 业务工具不传 contract_id 时，默认操作活跃契约集
- 跨契约集查询时必须显式传 contract_id
- 切换活跃契约集是用户行为，AI 无法切换

## 标准工作流

### Step 1: 了解当前上下文
读取 synkord://active-contract 资源，确认当前契约集。

### Step 2: 获取 API/Entity 概览
读取 synkord://active-contract/summary 或调用 list 工具。

### Step 3: 必要时查询详情
按需调用 get_api_detail / get_entity_detail。

### Step 4: 写代码 + 自检
写完代码后调用 validate_code_against_contract 自检。

## 错误处理
- 缺参数 → 先调 list 工具找 ID
- 不可访问 → 用 list_contracts 重新查询
- 校验失败 → 按 issues 修复
```

### 6.2 用户 IDE System Prompt 模板

```markdown
我在使用 Synkord MCP 管理 API 契约。请遵循：
- 默认使用 MCP 的「活跃契约集」
- 写代码前先通过 MCP 查询相关 API/Entity
- 写完后用 validate_code_against_contract 自检
- 不确定时先调 list_contracts / list_apis / list_entities
- 不要凭空捏造接口和字段

我的工作项目：[填入]
当前活跃契约集：[填入]
```

---

## 七、相关文档

- [requirements.md](./requirements.md) — 产品需求与数据模型
- [architecture.md](./architecture.md) — 技术架构与认证
- [ui-spec.md](./ui-spec.md) — UI/UX 规范
- [implementation.md](./implementation.md) — 实施路线与文件改动清单