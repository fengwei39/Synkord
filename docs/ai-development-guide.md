# Synkord AI 开发实施指南

本文档面向后续 AI 辅助开发和人工协作开发，说明如何把需求文档与原型结构落到当前 Go 后端、Electron 前端和本地 MCP 服务中。

优先级规则：

1. 产品规则以 [requirements.md](requirements.md) 为准。
2. 页面、菜单、入口、交互以 [prototype-structure.md](prototype-structure.md) 为准。
3. 架构边界以 [architecture-boundaries.md](architecture-boundaries.md) 为准。
4. 当前代码中与文档冲突的旧实现，以文档为第一性原理逐步替换。

## 1. 开发目标

把当前项目重构为开源、自托管的团队协同规范平台，并通过 Electron 当前激活项目向 IDE/Agent 提供 MCP 能力。

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
进入团队项目列表
↓
进入项目详情
↓
维护当前项目的接口、数据模型和依赖拓扑
↓
导入 Swagger / OpenAPI / Postman
↓
生成当前项目接口、模型、引用关系
↓
Electron 管理本地 MCP 服务
↓
本地 MCP 服务向 IDE / Agent 暴露当前激活项目的规范和依赖上下文
```

## 2. 禁止继续沿用的旧概念

后续开发遇到以下旧概念，应替换为新产品逻辑：

| 旧概念 | 新概念 |
| --- | --- |
| 组织 | 我的团队 |
| 全局实体 / 全局模型 | 项目详情内数据模型 |
| 服务私有实体 | 项目私有模型 |
| 团队级接口管理 | 项目详情内接口管理 |
| 团队级数据模型 | 项目详情内数据模型 |
| 团队级依赖拓扑 | 项目详情内依赖拓扑 |
| 全局 MCP / 团队 MCP | 项目详情 MCP Tab |
| 后端 MCP Server | Electron 管理的本地 MCP 服务 |
| 通用系统设置页 | 删除；后端地址属于登录前本地连接配置 |
| 通知中心 / Webhook 通知 | 当前阶段不实现 |
| 变更检测 / 变更记录 | 当前阶段不实现 |
| `get_global_entities` | 删除；使用当前项目的 `get_project_entities` |
| `get_service_entities` | `get_project_entities` |

团队层只保留项目管理和团队管理。接口管理、数据模型、依赖拓扑和 MCP 配置必须进入具体项目后使用。

## 3. 目标前端路由

使用 React Router。团队业务页必须在 `currentTeamId` 存在时才能访问；项目内页面必须同时存在 `currentTeamId` 和 `projectId`。

| 路由 | 页面 | 权限 / 上下文 |
| --- | --- | --- |
| `/connection` | 后端连接配置 | 未配置后端地址或连接失败 |
| `/login` | 登录 | 未登录 |
| `/` | 工作台首页 | 已登录 |
| `/teams/new` | 创建团队引导 | 已登录且无团队，或主动创建团队 |
| `/projects` | 项目列表 | 当前团队 |
| `/projects/:projectId` | 项目详情，包含项目信息、接口、数据模型、依赖拓扑、MCP Tab | 当前团队 + 当前项目 |
| `/projects/:projectId/apis` | 当前项目接口列表，可作为项目详情 Tab 的深链 | 当前团队 + 当前项目 |
| `/projects/:projectId/apis/:apiId` | 当前项目接口详情 | 当前团队 + 当前项目 |
| `/projects/:projectId/apis/import` | 当前项目 Swagger / OpenAPI / Postman 导入 | 当前团队 + 当前项目，团队管理员或编辑者 |
| `/projects/:projectId/apis/import/result` | 当前项目导入结果 | 当前团队 + 当前项目 |
| `/projects/:projectId/models` | 当前项目数据模型列表 | 当前团队 + 当前项目 |
| `/projects/:projectId/models/:modelId` | 当前项目数据模型详情 | 当前团队 + 当前项目 |
| `/projects/:projectId/dependencies` | 当前项目依赖拓扑 | 当前团队 + 当前项目 |
| `/members` | 团队管理：成员与权限 | 当前团队，团队管理员 |

当前代码中的 `/mcp`、`/admin/mcp-server`、`/teams/:teamId/mcp`、团队级 `/apis`、团队级 `/models`、团队级 `/dependencies` 都属于旧入口，应删除或重定向到项目详情。

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
│  ├─ mcp.ts
│  └─ members.ts
├─ components
│  ├─ AppLayout.tsx
│  ├─ ProtectedRoute.tsx
│  ├─ TeamRequiredRoute.tsx
│  ├─ ProjectRequiredRoute.tsx
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
│  ├─ Projects.tsx
│  ├─ ProjectDetail.tsx
│  ├─ APIs.tsx
│  ├─ APIDetail.tsx
│  ├─ APIImport.tsx
│  ├─ APIImportResult.tsx
│  ├─ DataModels.tsx
│  ├─ DataModelDetail.tsx
│  ├─ DependencyGraph.tsx
│  └─ Members.tsx
├─ types
│  ├─ auth.ts
│  ├─ team.ts
│  ├─ project.ts
│  ├─ api.ts
│  ├─ model.ts
│  └─ mcp.ts
└─ utils
   ├─ permissions.ts
   └─ storage.ts
```

前端规则：

- 不新增 UI 框架，沿用 React、TypeScript、Vite、Ant Design。
- 团队菜单只展示项目管理和团队管理。
- 所有团队业务请求必须携带 `teamId`，项目内业务请求必须同时携带 `teamId` 和 `projectId`，优先使用路径参数。
- 页面不要直接拼业务权限，统一使用 `PermissionGuard` 或 `permissions.ts`。
- 顶部导航只显示本地 MCP 服务状态、当前团队和当前激活项目。
- 后端连接地址只在启动、登录前或连接失败时处理。

## 5. 后端 API 设计约定

REST API 统一使用 `/api` 前缀。

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

项目：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/projects` | 项目列表 |
| POST | `/api/teams/:teamId/projects` | 创建项目 |
| GET | `/api/teams/:teamId/projects/:projectId` | 项目详情 |
| PATCH | `/api/teams/:teamId/projects/:projectId` | 编辑项目 |
| DELETE | `/api/teams/:teamId/projects/:projectId` | 删除或归档项目 |

项目内接口、数据模型、依赖：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/projects/:projectId/apis` | 当前项目接口列表 |
| POST | `/api/teams/:teamId/projects/:projectId/apis/import` | 当前项目导入 Swagger / OpenAPI / Postman |
| GET | `/api/teams/:teamId/projects/:projectId/apis/:apiId` | 当前项目接口详情 |
| GET | `/api/teams/:teamId/projects/:projectId/models` | 当前项目数据模型列表 |
| POST | `/api/teams/:teamId/projects/:projectId/models` | 当前项目创建数据模型 |
| GET | `/api/teams/:teamId/projects/:projectId/models/:modelId` | 当前项目数据模型详情 |
| PATCH | `/api/teams/:teamId/projects/:projectId/models/:modelId` | 当前项目编辑数据模型并生成版本 |
| GET | `/api/teams/:teamId/projects/:projectId/dependencies/graph` | 当前项目依赖拓扑 |
| GET | `/api/teams/:teamId/projects/:projectId/dependencies` | 当前项目依赖列表 |

项目 MCP 管理：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/projects/:projectId/mcp` | 当前项目 MCP 概览 |
| GET | `/api/teams/:teamId/projects/:projectId/mcp/tokens` | Token 列表 |
| POST | `/api/teams/:teamId/projects/:projectId/mcp/tokens` | 创建 Token |
| PATCH | `/api/teams/:teamId/projects/:projectId/mcp/tokens/:tokenId` | 停用、启用、更新工具范围 |
| POST | `/api/teams/:teamId/projects/:projectId/mcp/tokens/:tokenId/rotate` | 重新生成 Token |
| GET | `/api/teams/:teamId/projects/:projectId/mcp/audit` | 调用审计 |

本地 MCP 服务代理接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/mcp/introspect` | 校验 MCPConfig.Token、当前团队和当前项目，返回是否可用和工具范围 |
| POST | `/api/mcp/query` | 本地 MCP 服务按当前激活团队和项目查询规范、模型或依赖数据 |
| POST | `/api/mcp/audit` | 本地 MCP 服务上报 MCP 调用审计 |

`/api/mcp/*` 只服务本地 MCP 服务，不作为 Electron 管理端、CLI、Git Hook 或 CI 的通用入口。

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
MCPConfig
MCPAuditLog
```

字段命名规则：

- 数据库字段使用 snake_case。
- JSON 字段使用 snake_case，和当前接口保持一致。
- 团队级表必须包含 `team_id`。
- 项目私有数据必须同时包含 `team_id` 和 `project_id`。
- MCP Token 明文只在创建或轮换时返回一次，数据库只保存哈希和摘要。

## 7. 权限实现规则

权限分两层：

```text
平台角色：platform_admin
团队角色：team_admin / editor / viewer
```

平台管理员不自动拥有团队数据权限。用户要访问团队业务，必须是该团队成员。

权限规则：

| 能力 | team_admin | editor | viewer |
| --- | --- | --- | --- |
| 查看项目 | 是 | 是 | 是 |
| 创建 / 编辑项目 | 是 | 是 | 否 |
| 删除项目 | 是 | 否 | 否 |
| 查看当前项目接口、模型、依赖 | 是 | 是 | 是 |
| 导入 Swagger / Postman | 是 | 是 | 否 |
| 创建 / 编辑数据模型 | 是 | 是 | 否 |
| 删除数据模型 | 是 | 否 | 否 |
| 管理当前项目 MCP Token | 是 | 否 | 否 |
| 查看 MCP 接入说明 | 是 | 是 | 公开部分 |
| 管理团队成员 | 是 | 否 | 否 |

前端权限用于隐藏、置灰和提示。后端权限必须再次校验，不能只依赖前端。

## 8. MCP 工具目标

本地 MCP 服务的目标工具：

| 工具 | 说明 |
| --- | --- |
| `get_project_entities` | 获取当前激活项目的数据模型 |
| `get_project_apis` | 获取当前激活项目 API |
| `get_entity_dependencies` | 查询模型被哪些项目或接口引用 |
| `get_api_dependencies` | 查询 API 被哪些项目引用 |
| `validate_entity_usage` | 校验代码片段中的模型使用 |

当前代码中的 `get_global_entities`、`get_service_entities` 属于旧实现，应在 MCP 重构阶段替换。

## 9. CLI / Git Hook / CI 边界

CLI 是 REST 客户端封装，不是 MCP 客户端。MVP 可以先保留轻量接口或延后实现。

推荐命令边界：

```bash
# 后端 CI 用：推送当前项目 spec
synkord push-spec \
  --server https://synkord.xxx.com \
  --token $SYNKORD_TOKEN \
  --team t_xxx --project p_xxx \
  --spec ./api/openapi.json

# 前端 / App Git Hook 用：校验项目依赖引用
synkord validate-deps \
  --server https://synkord.xxx.com \
  --token $SYNKORD_TOKEN \
  --team t_xxx --project p_yyy \
  --changed-files "$(git diff --cached --name-only)"
```

CLI 不调 MCP。如需 MCP 能力，配置 IDE 的 `.mcp.json`。

## 10. Electron 与本地 MCP 服务边界

Electron 负责：

- 保存 synkord-core 后端地址。
- 保存登录态。
- 管理当前团队和当前激活项目。
- 启动、停止、重启本机唯一 MCP 服务。
- 提供本地 MCP 服务状态、端点、日志和 IDE 配置模板。
- 打开项目详情 MCP Tab 时，把该项目设为当前 MCP 激活项目。

本地 MCP 服务负责：

- 对 IDE/Agent 暴露 MCP tools/resources/prompts。
- 读取 Electron 提供的当前激活团队和项目上下文。
- 携带 IDE/Agent 提供的 MCP Token 调用后端 `/api/mcp/introspect`。
- 按后端返回的工具范围执行 `/api/mcp/query`。
- 通过 `/api/mcp/audit` 上报调用审计。

本地 MCP 服务不选择团队或项目。团队和项目只由 Electron 当前激活上下文决定。

## 11. Mock 数据替换顺序

建议按风险从低到高替换：

1. 工作台和团队列表。
2. 项目管理列表、创建、编辑、删除。
3. 项目详情页面框架。
4. 当前项目接口管理和导入。
5. 当前项目数据模型列表和详情。
6. 当前项目依赖拓扑。
7. 团队成员与权限。
8. 当前项目 MCP 管理。
9. Electron 本地 MCP 服务管理。

每替换一个页面，应同时完成：

- API 封装。
- loading / empty / error 状态。
- 权限控制。
- 基础手工验收。
- 必要后端单元测试。

## 12. 重构阶段

### 阶段 1：团队上下文

目标：

- 新增或校正 Team、TeamMember 数据模型。
- 登录后加载我的团队。
- 无团队时进入创建团队引导。
- 有团队时设置 `currentTeamId`。
- AppLayout 根据当前团队刷新菜单。

验收：

- 首次登录无团队时不能进入团队业务页面。
- 创建团队后自动进入团队项目列表。
- 切换团队后项目列表和团队管理数据刷新；项目内页面必须重新选择项目上下文。

### 阶段 2：页面路由与布局

目标：

- 按树结构建立目标路由。
- 团队菜单只保留项目管理和团队管理。
- 删除旧通用系统设置入口。
- MCP 管理入口只保留在项目详情中，作为当前项目的 MCP Tab 或子页。

验收：

- 侧边菜单只展示当前团队的项目管理和团队管理。
- 顶部只展示本地 MCP 服务状态、当前团队和当前激活项目。
- 未进入项目时，不出现接口管理、数据模型、依赖拓扑或 MCP 管理入口。

### 阶段 3：项目内资产 API

目标：

- 团队层只管理项目和成员。
- 接口、数据模型和依赖全部归属具体项目。
- Swagger / Postman 导入时生成当前项目接口、模型、依赖关系。
- 旧全局模型逻辑迁移到项目详情内的数据模型。

验收：

- 团队 A 和团队 B 数据互不混入。
- 项目 A 和项目 B 的接口、模型、依赖互不混入。
- 进入项目后，导入结果能在当前项目接口、模型和依赖拓扑中看到一致数据。

### 阶段 4：MCP 闭环

目标：

- 当前激活项目、Token 和工具范围生效。
- 当前激活项目、Token 状态和当前设备的本地 MCP 服务状态共同决定本次 MCP 调用是否可用。
- MCP 工具使用新命名和团队项目上下文。
- 打开项目详情的 MCP Tab 后，该项目成为当前 MCP 激活项目。
- 从一个项目切换到另一个项目时，Electron 更新本地 MCP 激活上下文，并提示 IDE 后续请求将使用新项目规范。

验收：

- 停用 Token 后该 IDE/Agent 不能继续调用 MCP。
- MCP 调用只能访问 Electron 当前激活团队和项目范围。
- IDE 配置中的本地 MCP 地址稳定，切换项目不需要修改 `.mcp.json`。

## 13. 测试与验收命令

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

## 14. AI 开发工作规则

AI 执行开发任务时必须遵守：

1. 开始前先阅读 `docs/requirements.md`、`docs/prototype-structure.md`、`docs/architecture-boundaries.md` 和本文档相关章节。
2. 遇到当前代码与文档冲突时，以文档为准，并在回复中说明替换了哪些旧逻辑。
3. 不再新增组织、全局实体、通用系统设置、团队级 MCP、后端 MCP Server、变更检测、变更记录或通知中心模块。
4. 每次只重构一个闭环或一个页面组，避免跨太多模块。
5. 修改共享数据模型、权限或路由时，同步检查相关页面和 API。
6. 删除旧代码前确认没有仍被路由、菜单、API 或测试引用。
7. 每次完成后说明已跑的测试；没跑测试必须说明原因。
8. 如果发现需求链路不闭环，先补文档再写代码。

## 15. Definition of Done

一个开发任务完成必须满足：

- 页面入口符合树结构。
- 团队层只展示项目管理和团队管理。
- 项目内接口、模型、依赖、MCP 都绑定当前项目。
- 当前团队和当前项目上下文正确。
- 权限控制前后端一致。
- 数据归属团队和项目，不混入其他团队或项目。
- 成功、失败、空状态都有明确展示。
- 关键操作有确认或表单校验。
- 相关 API 有清晰错误返回。
- 必要测试通过。
- README 或 docs 中需要同步的内容已同步。
