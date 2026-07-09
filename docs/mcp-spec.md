# Synkord MCP 规格说明书 v1.2

> 本文档定义 Synkord MCP 暴露给 IDE 的工具、资源、错误码。详见 [requirements.md](./requirements.md) 的产品定位。

---

## 〇、本版本变更（相对 v1.1）

| 变更 | 说明 |
|---|---|
| 删除所有 `team_id` 参数 | 团队概念删除 |
| 资源 URI 前缀 `synkord://projects/*` → `synkord://active-contract` / `synkord://api/*` / `synkord://entity/*` | 命名统一 |
| `validate_code_against_contract` 输入参数微调 | `language` 可选，校验结果始终以 `{ valid, issues }` 返回 |

---

## 一、架构原则

### 1.1 核心约定

- MCP server **有一个活跃契约集**（用户在 Synkord UI 手动设置）
- 业务工具**默认操作活跃契约集**（不传 `contract_id` 时）
- 跨契约集查询必须显式传 `contract_id`
- 切换活跃契约集是**显式手动行为**（不自动检测）

### 1.2 与 Synkord UI 的关系

- **本地状态文件同步**：MCP server 通过 `active-contract.json` 获取活跃契约集，运行中按 1s 轮询刷新
- **不假定默认契约集**：每次启动 Connect 时从 `active-contract.json` 读取
- **用户上下文来自本地凭据**：工具调用使用本地登录凭据访问后端

### 1.3 协议版本

- 当前实现：**MCP STDIO**；HTTP 模式为桌面端内部调试/兼容入口
- 锁定当前 Cursor / Claude Desktop 可用协议，后续跟随生态升级

---

## 二、工具规范

### 2.1 元工具

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
| `method` | enum: GET\|POST\|PUT\|DELETE\|PATCH\|HEAD\|OPTIONS\|TRACE | 否 | 方法过滤 |
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
- `NOT_FOUND` — 未设置活跃契约集，或指定资源不存在/不可访问
- `UNAUTHORIZED` — 登录态缺失或过期

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
| `language` | enum: typescript\|javascript\|python\|go\|java\|plain | 否 | 代码语言；默认 plain |

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

当 `valid = false` 时仍返回正常工具结果，AI 应读取 `issues` 并按 `severity='error'` 的项修复代码。

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

> **字段对齐（v1.2 修复冲突 #2）**：`api` 严格只含上述 4 字段，**不**返回 `parameters / request_body / responses / schema_content` 等大字段。AI 若需详情，请改用 `get_api_detail(api_id)`。

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

> **字段对齐（v1.2 修复冲突 #6）**：`entity` 严格只含上述 3 字段，**不**返回 `schema_content` 全文。AI 若需详情，请改用 `get_entity_detail(entity_id)`。

---

## 三、Resources

AI 可通过 `resources/read` 被动读取的资源。

### 3.1 静态资源（无参数）

| URI | 内容 |
|---|---|
| `synkord://active-contract` | 活跃契约集元信息（contract_id, contract_name） |
| `synkord://status` | MCP server 运行状态（版本、协议、启动时间） |
| `synkord://tools-manifest` | 当前可用工具及 inputSchema |

### 3.2 资源模板（URI Template RFC 6570）

| URI Template | 内容 |
|---|---|
| `synkord://entity/{name}` | 按实体名称读取实体定义（name 为实体名，如 `UserDTO`） |
| `synkord://api/{method}/{path}` | 按 HTTP 方法 + 路径读取 API 定义（method 不区分大小写） |

> **资源类型**（v1.2 修复）：表中带 `{xxx}` 的为资源模板，AI 客户端通过 `resources/templates/list` 取得模板，再用实际值替换占位符调用 `resources/read`。`synkord://active-contract` / `synkord://status` / `synkord://tools-manifest` 是静态资源，AI 直接 `resources/read` 即可。
> 旧版文档曾混入"激活项目"措辞（[§〇 v1.2 变更](mcp-spec.md#) 已删除 Team 实体），当前唯一活跃资源统一以 `active-contract` 命名。

**典型工作流**：
```
1. AI 启动对话 → 读 synkord://active-contract → 知道当前契约集
2. AI 调用 get_contract_apis / get_contract_entities 获取概览
3. AI 按需 get_api_detail / get_entity_detail 或读取模板资源拿具体合同
4. AI 写完代码后调 validate_code_against_contract 自检
5. 如有问题，回到步骤 3 细化查询
```

---

## 四、错误码规范

### 4.1 错误响应格式

```typescript
{
  code: string                           // 错误码
  message: string                        // 人类可读
  details?: Record<string, unknown>      // 详细数据（可选）
}
```

### 4.2 错误码列表

| ErrorCode | message | hint | recoverable | 何时触发 |
|---|---|---|---|---|
| `INVALID_ARGS` | 参数缺失、格式错误、请求体过大 | 必填参数缺失、输入非法、body 超限 |
| `NOT_FOUND` | 资源不存在或没有活跃契约集 | 无活跃契约集、contract/api/entity 不存在 |
| `UNAUTHORIZED` | 登录态缺失或过期 | 本地凭据不存在、token 无效或后端返回 401/403 |
| `TOOL_NOT_ALLOWED` | 工具未注册或不允许调用 | 调用了工具清单之外的名称 |
| `UPSTREAM_FAILURE` | 后端不可用或限流 | 网络错误、429、502/503 |
| `TIMEOUT` | 调用超时 | 后端请求超过 30s |
| `INTERNAL` | 内部错误 | 未分类异常 |

### 4.3 错误响应示例

```json
// 用户没选契约集
{
  "code": "NOT_FOUND",
  "message": "No active contract selected",
  "message": "no active contract context"
}

// 跨契约集查询时给错 ID
{
  "code": "NOT_FOUND",
  "message": "Contract 'C-xyz' not found or not accessible",
  "message": "Contract 'C-xyz' not found or not accessible"
}

// 校验失败
{
  "valid": false,
  "issues": [
    { "severity": "error", "line": 12, "field": "orderId",
      "message": "Order.id 类型应为 string，但使用了 number",
      "suggestion": "检查参数类型，应该是 string" }
  ]
}

// 认证过期
{
  "code": "UNAUTHORIZED",
  "message": "auth token is required"
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
调用 get_contract_apis / get_contract_entities 获取概览。

### Step 3: 必要时查询详情
按需调用 get_api_detail / get_entity_detail。

### Step 4: 写代码 + 自检
写完代码后调用 validate_code_against_contract 自检。

## 错误处理
- 缺参数 → 先调 list 工具找 ID
- 不可访问或 NOT_FOUND → 用 list_contracts 重新查询
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
