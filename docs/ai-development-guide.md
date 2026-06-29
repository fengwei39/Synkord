# Synkord AI 开发实施指南

本文档面向后续 AI 辅助开发和人工协作开发，说明如何把需求文档与原型结构落到当前 Go 后端和 Electron 前端代码中。

优先级规则：

1. 产品规则以 `docs/requirements.md` 为准。
2. 页面、菜单、入口、交互以 `docs/prototype-structure.md` 为准。
3. 本文档负责说明开发拆分、命名、接口、权限和验收方式。
4. 当前代码中与文档冲突的旧实现，以文档为准逐步替换。

## 1. 开发目标

把当前项目重构为开源、自托管的团队级 MCP 规范协同平台。

核心闭环：

```text
启动 Electron
↓
配置 synkord-core 地址
↓
登录
↓
创建或切换团队
↓
维护项目、接口、数据模型
↓
导入 Swagger / OpenAPI / Postman
↓
生成接口、模型、引用关系
↓
查看依赖拓扑
↓
执行变更检测
↓
生成变更记录和站内通知
↓
Webhook 通知外部群
↓
MCP 向 IDE / Git Hook / CI 暴露规范和变更结果
```

## 2. 禁止继续沿用的旧概念

后续开发遇到以下旧概念，应替换为新产品逻辑：

| 旧概念 | 新概念 |
| --- | --- |
| 组织 | 我的团队 |
| 全局实体 / 全局模型 | 团队数据模型 |
| 服务私有实体 | 项目私有模型 |
| 系统设置 | 全局 MCP 服务器管理 |
| 后端连接状态 | 客户端本地后端连接配置 |
| 通知中心 | 顶部通知入口 / 通知抽屉 |
| `get_global_entities` | `get_team_entities` |
| `get_service_entities` | `get_project_entities` |

全局配置只能管理 MCP 服务器，不能承载团队数据、Webhook、数据库、后端连接地址或其他系统配置。

## 3. 目标前端路由

使用 React Router。团队业务页必须在 `currentTeamId` 存在时才能访问。

| 路由 | 页面 | 权限 / 上下文 |
| --- | --- | --- |
| `/connection` | 后端连接配置 | 未配置后端地址或连接失败 |
| `/login` | 登录 | 未登录 |
| `/` | 工作台首页 | 已登录 |
| `/teams/new` | 创建团队引导 | 已登录且无团队，或主动创建团队 |
| `/team` | 团队首页 | 当前团队 |
| `/projects` | 项目列表 | 当前团队 |
| `/projects/:projectId` | 项目详情 | 当前团队 |
| `/apis` | 接口列表 | 当前团队 |
| `/apis/:apiId` | 接口详情 | 当前团队 |
| `/apis/import` | Swagger / Postman 导入 | 当前团队，团队管理员或编辑者 |
| `/apis/import/result` | 导入结果 | 当前团队 |
| `/models` | 数据模型列表 | 当前团队 |
| `/models/:modelId` | 数据模型详情 | 当前团队 |
| `/mcp` | 团队 MCP 管理 | 当前团队 |
| `/dependencies` | 依赖拓扑 | 当前团队 |
| `/diff` | 变更检测 | 当前团队，团队管理员或编辑者 |
| `/changesets` | 变更记录 | 当前团队 |
| `/members` | 团队成员与权限 | 当前团队，团队管理员 |
| `/admin/mcp-server` | 全局 MCP 服务器管理 | 平台管理员 |

当前代码中的 `/entities` 应逐步替换为 `/models`。当前 `Settings` 页面不再作为通用设置页，后续只保留或重构为全局 MCP 服务器管理。

## 4. 前端模块拆分建议

推荐目录：

```text
frontend/src
├─ api
│  ├─ client.ts
│  ├─ auth.ts
│  ├─ teams.ts
│  ├─ projects.ts
│  ├─ apis.ts
│  ├─ models.ts
│  ├─ dependencies.ts
│  ├─ changesets.ts
│  ├─ mcp.ts
│  └─ members.ts
├─ components
│  ├─ AppLayout.tsx
│  ├─ ProtectedRoute.tsx
│  ├─ TeamRequiredRoute.tsx
│  ├─ PermissionGuard.tsx
│  └─ PageHeader.tsx
├─ contexts
│  ├─ AuthContext.tsx
│  └─ TeamContext.tsx
├─ pages
│  ├─ Connection.tsx
│  ├─ Login.tsx
│  ├─ WorkspaceHome.tsx
│  ├─ CreateTeam.tsx
│  ├─ TeamHome.tsx
│  ├─ Projects.tsx
│  ├─ ProjectDetail.tsx
│  ├─ APIs.tsx
│  ├─ APIDetail.tsx
│  ├─ APIImport.tsx
│  ├─ APIImportResult.tsx
│  ├─ DataModels.tsx
│  ├─ DataModelDetail.tsx
│  ├─ MCPManagement.tsx
│  ├─ DependencyGraph.tsx
│  ├─ DiffChecker.tsx
│  ├─ ChangeSets.tsx
│  ├─ Members.tsx
│  └─ GlobalMCPServer.tsx
├─ types
│  ├─ auth.ts
│  ├─ team.ts
│  ├─ project.ts
│  ├─ api.ts
│  ├─ model.ts
│  ├─ mcp.ts
│  └─ changeset.ts
└─ utils
   ├─ permissions.ts
   └─ storage.ts
```

前端规则：

- 不新增 UI 框架，沿用 React、TypeScript、Vite、Ant Design。
- 所有团队业务请求必须携带 `teamId`，优先使用路径参数。
- 页面不要直接拼业务权限，统一使用 `PermissionGuard` 或 `permissions.ts`。
- Mock 数据可以短期保留，但必须集中标记并按阶段替换。
- 顶部导航只显示 MCP 服务状态，不显示后端连接状态。
- 后端连接地址只在启动、登录前或连接失败时处理。

## 5. 后端 API 设计约定

REST API 统一使用 `/api` 前缀。团队级业务 API 推荐使用：

```text
/api/teams/:teamId/...
```

基础接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/teams` | 我的团队列表 |
| POST | `/api/teams` | 创建团队 |
| GET | `/api/teams/:teamId` | 团队详情 |
| PATCH | `/api/teams/:teamId` | 编辑团队 |
| POST | `/api/teams/:teamId/switch` | 记录最近访问团队，可选 |

团队成员：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/members` | 成员列表 |
| POST | `/api/teams/:teamId/members` | 邀请或创建本地用户并加入团队 |
| PATCH | `/api/teams/:teamId/members/:memberId` | 编辑成员角色、状态、备注 |
| DELETE | `/api/teams/:teamId/members/:memberId` | 移除成员 |
| POST | `/api/teams/:teamId/members/batch-delete` | 批量移除成员 |

项目、接口、数据模型：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/projects` | 项目列表 |
| POST | `/api/teams/:teamId/projects` | 创建项目 |
| GET | `/api/teams/:teamId/projects/:projectId` | 项目详情 |
| PATCH | `/api/teams/:teamId/projects/:projectId` | 编辑项目 |
| DELETE | `/api/teams/:teamId/projects/:projectId` | 删除或归档项目 |
| GET | `/api/teams/:teamId/apis` | 接口列表 |
| POST | `/api/teams/:teamId/apis/import` | 导入 Swagger / OpenAPI / Postman |
| GET | `/api/teams/:teamId/apis/:apiId` | 接口详情 |
| GET | `/api/teams/:teamId/models` | 数据模型列表 |
| POST | `/api/teams/:teamId/models` | 创建数据模型 |
| GET | `/api/teams/:teamId/models/:modelId` | 数据模型详情 |
| PATCH | `/api/teams/:teamId/models/:modelId` | 编辑数据模型并生成版本 |

依赖、变更、通知：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/dependencies/graph` | 团队依赖拓扑 |
| GET | `/api/teams/:teamId/dependencies/project/:projectId` | 项目影响范围 |
| POST | `/api/teams/:teamId/diff/check` | 执行变更检测 |
| GET | `/api/teams/:teamId/changesets` | 变更记录列表 |
| GET | `/api/teams/:teamId/changesets/:changeSetId` | 变更详情 |
| GET | `/api/teams/:teamId/notifications` | 顶部通知抽屉数据 |
| POST | `/api/teams/:teamId/notifications/:id/read` | 标记已读 |
| POST | `/api/teams/:teamId/notifications/:id/retry` | 重试 Webhook |

MCP：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/mcp` | 团队 MCP 概览 |
| PATCH | `/api/teams/:teamId/mcp` | 开启 / 关闭团队 MCP |
| GET | `/api/teams/:teamId/mcp/tokens` | Token 列表 |
| POST | `/api/teams/:teamId/mcp/tokens` | 创建 Token |
| PATCH | `/api/teams/:teamId/mcp/tokens/:tokenId` | 停用、启用、更新范围 |
| POST | `/api/teams/:teamId/mcp/tokens/:tokenId/rotate` | 重新生成 Token |
| GET | `/api/teams/:teamId/mcp/audit` | 调用审计 |
| GET | `/api/admin/mcp-server` | 全局 MCP 服务器配置 |
| PATCH | `/api/admin/mcp-server` | 修改全局 MCP 开关、端点、工具、限流 |

## 6. 后端模型命名建议

Go 模型建议按以下业务对象补齐或重构：

```text
User
Team
TeamMember
Project
APIEndpoint
DataModel
DataModelVersion
Dependency
PostmanCollection
SwaggerSpec
ChangeSet
Notification
WebhookConfig
MCPConfig
MCPAuditLog
GlobalMCPServerConfig
```

字段命名规则：

- 数据库字段使用 snake_case。
- JSON 字段使用 snake_case，和当前接口保持一致。
- 团队级表必须包含 `team_id`。
- 项目私有数据必须同时包含 `team_id` 和 `project_id`。
- Token 明文只在创建或轮换时返回一次，数据库只保存哈希或摘要。

## 7. 权限实现规则

权限分两层：

```text
平台角色：platform_admin
团队角色：team_admin / editor / viewer
```

平台管理员只管理全局 MCP 服务器，不自动拥有团队数据权限。  
用户要访问团队业务，必须是该团队成员。

权限规则：

| 能力 | team_admin | editor | viewer |
| --- | --- | --- | --- |
| 查看项目、接口、模型 | 是 | 是 | 是 |
| 创建 / 编辑项目 | 是 | 是 | 否 |
| 删除项目 | 是 | 否 | 否 |
| 导入 Swagger / Postman | 是 | 是 | 否 |
| 创建 / 编辑数据模型 | 是 | 是 | 否 |
| 删除数据模型 | 是 | 否 | 否 |
| 执行变更检测 | 是 | 是 | 否 |
| 查看变更记录 | 是 | 是 | 是 |
| 管理团队 MCP Token | 是 | 否 | 否 |
| 查看 MCP 接入说明 | 是 | 是 | 公开部分 |
| 管理团队成员 | 是 | 否 | 否 |
| 配置 Webhook | 是 | 否 | 否 |

前端权限用于隐藏、置灰和提示。后端权限必须再次校验，不能只依赖前端。

## 8. MCP 工具目标

MCP Server 的目标工具：

| 工具 | 说明 |
| --- | --- |
| `get_team_entities` | 获取当前团队公共数据模型 |
| `get_project_entities` | 获取指定项目私有模型及引用的团队模型 |
| `get_project_apis` | 获取指定项目 API |
| `get_entity_dependencies` | 查询模型被哪些项目或接口引用 |
| `get_api_dependencies` | 查询 API 被哪些项目引用 |
| `detect_breaking_changes` | 对比新旧规范并返回变更结果 |
| `validate_entity_usage` | 校验代码片段中的模型使用 |

当前代码中的 `get_global_entities`、`get_service_entities` 属于旧实现，应在 MCP 重构阶段替换。

## 9. Mock 数据替换顺序

建议按风险从低到高替换：

1. 工作台和团队首页统计数据。
2. 项目管理列表、创建、编辑、删除。
3. 接口管理列表和导入。
4. 数据模型列表和详情。
5. 团队成员与权限。
6. 团队 MCP 管理。
7. 依赖拓扑。
8. 变更检测和变更记录。
9. 顶部通知和 Webhook 重试。
10. 全局 MCP 服务器管理。

每替换一个页面，应同时完成：

- API 封装。
- loading / empty / error 状态。
- 权限控制。
- 基础手工验收。
- 必要后端单元测试。

## 10. 重构阶段

### 阶段 1：团队上下文

目标：

- 新增 Team、TeamMember 数据模型。
- 登录后加载我的团队。
- 无团队时进入创建团队引导。
- 有团队时设置 `currentTeamId`。
- AppLayout 根据当前团队刷新菜单。

验收：

- 首次登录无团队时不能进入团队业务页面。
- 创建团队后自动进入团队首页。
- 切换团队后项目、接口、模型、MCP、变更记录全部刷新。

### 阶段 2：页面路由与布局

目标：

- 按树结构建立目标路由。
- 重命名旧 `Entities` 为数据模型页面。
- 将旧 `Settings` 重构为全局 MCP 服务器管理。
- 去除通用系统设置入口。

验收：

- 侧边菜单只展示当前团队业务模块。
- 平台管理入口只对平台管理员可见。
- 顶部只展示 MCP 状态，不展示后端连接状态。

### 阶段 3：团队资产 API

目标：

- 项目、接口、数据模型全部归属团队。
- Swagger / Postman 导入时生成接口、模型、依赖关系。
- 旧全局模型逻辑迁移到团队模型逻辑。

验收：

- 团队 A 和团队 B 数据互不混入。
- 导入后能在接口、模型、依赖拓扑中看到一致数据。

### 阶段 4：变更闭环

目标：

- 变更检测生成 ChangeSet。
- warning / breaking 生成站内通知。
- 未配置 Webhook 时状态为 `not_configured`。
- Webhook 失败可重试。

验收：

- breaking 变更进入变更记录和顶部通知。
- 配置 Webhook 后能发送外部通知。
- 失败通知可以重试。

### 阶段 5：MCP 闭环

目标：

- 团队 MCP 开关、Token、工具范围、项目范围生效。
- 全局 MCP 服务器开关控制所有团队 Token。
- MCP 工具使用新命名和团队上下文。

验收：

- 关闭全局 MCP 后所有 Token 不可用。
- 关闭团队 MCP 后当前团队 Token 不可用。
- Token 只能访问授权团队和项目范围。

## 11. 测试与验收命令

后端：

```powershell
cd D:\code\synkord\backend
go test ./...
go run .
```

前端：

```powershell
cd D:\code\synkord\frontend
pnpm install
pnpm build
pnpm dev
pnpm electron
```

如果只做文档或原型调整，不要求跑构建。  
如果修改 Go 模型、服务或 API，至少运行 `go test ./...`。  
如果修改前端路由、页面或 TypeScript 类型，至少运行 `pnpm build`。

## 12. 同步架构与契约语言

本文档确定整个产品的同步边界与协议分工。所有后续开发必须遵循本节定义。

### 12.1 三层协议分工

| 层 | 进程/工具 | 协议 | 用途 |
| --- | --- | --- | --- |
| Authority | synkord-core (Go) | 内部 | 数据 + REST API + MCP Server 同进程 |
| Management | Electron 桌面端 | REST | 团队资产 CRUD + MCP 服务控制 + Token 管理 + 审计查看 |
| Consumption | IDE / AI / Git Hook / CI | REST + MCP | 读取规范、推送规范、本地校验 |

**核心约束**：

- REST API 路径前缀 `/api`，所有团队业务请求走 `/api/teams/:teamId/...`
- MCP 端点 `/mcp/sse`、`/mcp/message`，**仅供 IDE/AI 编码助手使用**
- Electron 不调 MCP 工具，只通过 REST 控制 MCP 服务进程
- 后端 CI 推送 spec、前端 Git Hook 校验、CI 校验都走 REST
- CLI 工具 `synkord` 是 REST 客户端封装，**不是 MCP 客户端**

### 12.2 同步渠道矩阵

| 行为 | 通道 | 调用方 |
| --- | --- | --- |
| 后端 CI 推送 OpenAPI/Postman | REST | `synkord push-spec` |
| 前端 commit 校验依赖 | REST | `synkord validate-deps` |
| CI 通用：检查 spec 兼容性 | REST | `synkord check-spec` |
| IDE/AI 读取最新 API 列表 | MCP | `get_project_apis` |
| IDE/AI 读取团队模型 | MCP | `get_team_entities` |
| IDE/AI 校验代码片段 | MCP | `validate_entity_usage` |
| Electron 增删改查 | REST | REST 客户端 |
| Electron 启停 MCP 服务 | REST | `PATCH /api/admin/mcp-server` |
| Electron 管理 Token | REST | `/api/teams/:teamId/mcp/tokens` |
| Electron 查看审计 | REST | `/api/teams/:teamId/mcp/audit` |

### 12.3 契约语言：OpenAPI 3.x

后端不限制技术栈。Synkord 约束对象是 **OpenAPI 3.x** 规范本身：

| 后端栈 | 规范生成方式 | 产物 |
| --- | --- | --- |
| Spring Boot | springdoc-openapi | openapi.json |
| NestJS | @nestjs/swagger | openapi.json |
| FastAPI | 内置 | openapi.json |
| Go (Gin 等) | swag/swaggo | openapi.json |
| Python (Flask) | flasgger / apispec | openapi.json |
| 其他 | 自行实现或手写 | openapi.json |

导入时校验（不通过则拒绝）：

- `info.title`、`info.version` 必填
- 每个 operation 必填 `summary` 或 `description`
- `$ref` 必须指向 `components/schemas` 内已定义 entity
- HTTP 响应需带 description

### 12.4 CLI 工具 synkord

`synkord` 是独立命令行工具，封装 REST 调用，跨语言通用：

```bash
# 后端 CI 用：推送新 spec
synkord push-spec \
  --server https://synkord.xxx.com \
  --token $SYNKORD_TOKEN \
  --team t_xxx --project p_xxx \
  --spec ./api/openapi.json \
  --note "新增重置密码"

# 前端 Git Hook 用：校验依赖（前置阻塞）
synkord validate-deps \
  --server https://synkord.xxx.com \
  --token $SYNKORD_TOKEN \
  --team t_xxx --project p_yyy \
  --pinned-version 1.0.0 \
  --changed-files "$(git diff --cached --name-only)"

# CI 通用：检查 spec 兼容性
synkord check-spec \
  --server https://synkord.xxx.com \
  --token $SYNKORD_TOKEN \
  --team t_xxx --project p_xxx \
  --spec ./api/openapi.json
```

CLI 不调 MCP。如需 MCP 能力，配置 IDE 的 `.mcp.json`。

### 12.5 IDE 接入（MCP 消费方）

在 Cursor/VSCode/PyCharm 中配置 MCP 客户端连接 synkord-core：

`.cursor/mcp.json` 模板：

```json
{
  "mcpServers": {
    "synkord": {
      "url": "${SYNKORD_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${SYNKORD_TOKEN}"
      }
    }
  }
}
```

**鉴权**：MCP 客户端使用 `MCPConfig.Token`（不是 JWT）。Token 由 Electron 在「MCP 管理」页创建，明文仅展示一次，之后只保存哈希或摘要。

### 12.5.1 鉴权凭据矩阵

不同客户端对应不同凭据，混用会失败：

| 客户端 | 凭据类型 | 获取方式 | 用在哪些端点 |
| --- | --- | --- | --- |
| Electron 管理端 | **JWT**（用户密码登录） | `POST /api/auth/login` → `access_token` | 所有 `/api/teams/:teamId/...` |
| synkord CLI | **JWT**（用户密码登录） | `synkord login` → 缓存到 `~/.synkord/token` | 所有 `/api/teams/:teamId/...` |
| IDE/AI 编码助手 | **`MCPConfig.Token`** | Electron「MCP 管理」创建 | `/mcp/sse`、`/mcp/message` |
| Git Hook / CI | JWT（沿用 synkord CLI） | CI env `SYNKORD_TOKEN` | REST 校验/导入端点 |

**为什么 CLI 用 JWT 而不是 MCPConfig.Token？**

- CLI 调用的是 REST（push-spec、validate-deps），REST 鉴权只验 JWT
- MCPConfig.Token 只能用于 `/mcp/*`，scope 更窄
- 团队成员本来就有 JWT，CLI 复用账号体系比另发服务 token 简单

**反例**：

- ❌ 把 JWT 放到 `.cursor/mcp.json` 头里 → MCP 端点会拒
- ❌ 把 MCPConfig.Token 当作 CLI 的 `--token` → REST 端点会拒
- ❌ CLI 调 MCP → 协议不匹配，绕一层反而不稳

### 12.6 Git Hook 前置校验

前端/App 项目 pre-commit 阻塞式校验：

```bash
#!/bin/sh
# .git/hooks/pre-commit
synkord validate-deps \
  --server "$SYNKORD_SERVER" \
  --token "$SYNKORD_TOKEN" \
  --team "$SYNKORD_TEAM" \
  --project "$SYNKORD_PROJECT" \
  --pinned-version "$(synkord current-version)"

if [ $? -ne 0 ]; then
  echo "❌ Synkord 校验失败：你的代码引用了已变更/已删除的契约"
  echo "请运行 'synkord upgrade-suggest' 查看迁移建议"
  exit 1
fi
```

校验失败时**阻止提交**，不通过警告绕过。

### 12.7 端到端闭环

```text
[后端仓库] 写代码 → CI 生成 openapi.json → synkord push-spec (REST)
                                                              │
                                                              ▼
                                                     synkord-core
                                                     ├─ SwaggerSpec v1.0.2
                                                     ├─ 解析 APIEndpoint
                                                     ├─ diff v1.0.1 → v1.0.2
                                                     └─ ChangeSet + Notification
                                                              │
                                                              ▼
                                            ┌─────────────────┴────────────────┐
                                            │                                  │
                                       MCP (SSE)                          REST
                                            │                                  │
                            [Cursor AI / VSCode AI]              [Git Pre-Commit]
                            get_project_apis                      synkord validate-deps
                            get_team_entities                     → 阻止提交 (if breaking)
                            validate_entity_usage
```

### 12.8 Electron 管理职责

按 [prototype-structure.md 4.6](docs/prototype-structure.md) 规范，Electron 在「MCP 管理」页提供：

- 全局 MCP 服务开关（启停 synkord-core 上的 MCP 进程）
- 当前 SSE / Message 端点（只读展示）
- 工具列表（按全局开关过滤）
- Token CRUD（含项目范围、工具范围、过期时间）
- IDE 接入说明（一键复制 .cursor/mcp.json 等模板）
- 调用审计（按时间、Token、工具筛选）

平台管理员可在用户菜单进入「全局配置 - MCP 服务器管理」修改服务地址、限流策略。

## 13. AI 开发工作规则

AI 执行开发任务时必须遵守：

1. 开始前先阅读 `docs/requirements.md`、`docs/prototype-structure.md` 和本文档相关章节。
2. 遇到当前代码与文档冲突时，以文档为准，并在回复中说明替换了哪些旧逻辑。
3. 不再新增组织、全局实体、通用系统设置等旧模块。
4. 每次只重构一个闭环或一个页面组，避免跨太多模块。
5. 修改共享数据模型、权限或路由时，同步检查相关页面和 API。
6. 删除旧代码前确认没有仍被路由、菜单、API 或测试引用。
7. 每次完成后说明已跑的测试；没跑测试必须说明原因。
8. 如果发现需求链路不闭环，先补文档再写代码。

## 14. Definition of Done

一个开发任务完成必须满足：

- 页面入口符合树结构。
- 当前团队上下文正确。
- 权限控制前后端一致。
- 数据归属团队，不混入其他团队。
- 成功、失败、空状态都有明确展示。
- 关键操作有确认或表单校验。
- 相关 API 有清晰错误返回。
- 必要测试通过。
- README 或 docs 中需要同步的内容已同步。
