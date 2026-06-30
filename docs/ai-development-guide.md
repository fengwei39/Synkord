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
首次启动配置 synkord-core 地址（运行期不切换）
↓
登录
↓
有团队：进入当前团队项目列表
无团队：进入创建团队引导页
↓
项目列表
↓
项目详情
↓
维护当前项目的接口、数据模型、依赖拓扑
↓
导入 Swagger / OpenAPI / Postman（自动生成依赖关系，MVP 阶段依赖只读）
↓
Electron 管理本机唯一本地 MCP 服务
↓
打开项目详情 MCP Tab，把该项目设为当前 MCP 激活项目
↓
本地 MCP 服务向 IDE / Agent 暴露当前激活项目的规范和依赖上下文
```

团队切换统一通过顶部团队下拉选择器完成，不存在"工作台首页"或"最近访问团队"概念。

## 2. 禁止继续沿用的旧概念

后续开发遇到以下旧概念，应替换为新产品逻辑：

| 旧概念 | 新概念 |
| --- | --- |
| 组织 | 我的团队 |
| 全局实体 / 全局模型 | 项目详情内数据模型 |
| 服务私有实体 | 项目私有模型 |
| 团队实体模型库 / 团队级数据模型 | 删除；统一归属项目详情内数据模型 |
| 团队级接口管理 | 项目详情内接口管理 |
| 团队级依赖拓扑 | 项目详情内依赖拓扑（依赖由 OpenAPI 导入自动生成，MVP 不提供手动管理） |
| 全局 MCP / 团队 MCP | 项目详情 MCP Tab |
| 后端 MCP Server | Electron 管理的本地 MCP 服务 |
| 通用系统设置页 | 删除；后端地址属于登录前本地连接配置，运行期不切换 |
| 工作台首页 / 我的团队卡片 | 删除；团队选择统一在顶部下拉选择器 |
| 最近访问团队 / 团队切换接口 | 删除；多团队时按列表顺序默认进入第一个，切换通过顶部下拉 |
| 通知中心 / Webhook 通知 | 当前阶段不实现 |
| 变更检测 / 变更记录 | 当前阶段不实现 |
| `get_global_entities` | 删除；使用当前项目的 `get_project_entities` |
| `get_service_entities` | `get_project_entities` |

团队层只保留项目管理和团队管理（含团队信息、成员与权限）。接口管理、数据模型、依赖拓扑和 MCP 配置必须进入具体项目后使用。

## 3. 目标前端路由

使用 React Router。已登录但无团队时只允许访问创建团队引导；当前团队存在时才能访问团队业务页；项目内页面必须同时存在 `currentTeamId` 和 `projectId`。

| 路由 | 页面 | 权限 / 上下文 |
| --- | --- | --- |
| `/connection` | 后端连接配置 | 未配置后端地址或连接失败 |
| `/login` | 登录 | 未登录 |
| `/teams/new` | 创建团队引导 | 已登录且无团队 |
| `/projects` | 项目列表 | 已登录且当前团队存在 |
| `/teams/:teamId` | 团队信息 | 当前团队，团队管理员 |
| `/members` | 团队成员与权限 | 当前团队，团队管理员 |
| `/projects/:projectId` | 项目详情，默认展示"项目信息" Tab | 当前团队 + 当前项目 |
| `/projects/:projectId/apis` | 当前项目接口列表 | 当前团队 + 当前项目 |
| `/projects/:projectId/apis/:apiId` | 当前项目接口详情 | 当前团队 + 当前项目 |
| `/projects/:projectId/apis/import` | 当前项目 Swagger / OpenAPI / Postman 导入 | 当前团队 + 当前项目，团队管理员或编辑者 |
| `/projects/:projectId/apis/import/result` | 当前项目导入结果 | 当前团队 + 当前项目 |
| `/projects/:projectId/models` | 当前项目数据模型列表 | 当前团队 + 当前项目 |
| `/projects/:projectId/models/:modelId` | 当前项目数据模型详情 | 当前团队 + 当前项目 |
| `/projects/:projectId/dependencies` | 当前项目依赖拓扑（只读） | 当前团队 + 当前项目 |
| `/projects/:projectId/mcp` | 当前项目 MCP 管理 | 当前团队 + 当前项目 |

**无 `/` 工作台首页**：登录后根据是否有团队分别落到 `/projects` 或 `/teams/new`；切换团队通过顶部下拉选择器完成。

当前代码中的 `/`、`/mcp`、`/admin/mcp-server`、`/teams/:teamId/mcp`、团队级 `/apis`、团队级 `/models`、团队级 `/dependencies` 都属于旧入口，应删除或重定向到项目详情。

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
│  ├─ CreateTeam.tsx
│  ├─ TeamInfo.tsx
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
- 团队菜单只展示项目管理和团队管理（含团队信息、成员与权限）。
- 团队选择统一通过顶部下拉选择器；不在侧边菜单再列一次团队列表。
- 所有团队业务请求必须携带 `teamId`，项目内业务请求必须同时携带 `teamId` 和 `projectId`，优先使用路径参数。
- 页面不要直接拼业务权限，统一使用 `PermissionGuard` 或 `permissions.ts`。
- 顶部导航显示本地 MCP 服务状态、当前团队（团队下拉切换器）、当前激活项目和当前用户；后端连接地址只显示状态，不提供切换入口。
- 后端连接地址只在启动、登录前或连接失败时处理；运行期不切换。
- 团队切换时清空 `currentProjectId` 和 Electron 当前激活 MCP 项目；若切换前处于项目内页面，统一跳回 `/projects`。

`currentProjectId` 管理：

- 显式时机：进入 `/projects/:projectId/...` 任一子路由时，由路由守卫或页面 `useEffect` 调用 `setCurrentProjectId(id)`；离开项目详情（包括切换 Tab、跳到团队级页面、切换团队）时调用 `clearCurrentProjectId()`。
- URL `:projectId` 与 context `currentProjectId` 必须保持一致；不一致时以 URL 为准并回写 context。
- 跨项目跳转必须二次确认：当来源项目的 `currentProjectId !== URL :projectId` 时（例如从项目 A 的接口详情跳到项目 B 的项目详情），弹确认框，确认后才更新 `currentProjectId` 并跳转；取消则保留来源项目上下文。
- "新建项目"成功后跳转 `/projects/:newId`，由创建操作同步设置 `currentProjectId`。
- 项目详情子页"返回"按钮回到对应的列表子页（接口详情 → `/projects/:projectId/apis`、模型详情 → `/projects/:projectId/models`），不回到项目详情默认 Tab；MCP 子页内使用锚点 / Modal / Drawer，不产生新路由返回。

会话与生命周期：

- **JWT 401 拦截**：所有管理类 `/api/*` 请求收到 HTTP 401 时，Axios / fetch 拦截器清空本地登录态（清除 AuthContext、TeamContext、currentProjectId），跳转到 `/login`，并保留当前路径到 `?redirect=` 以便登录后回跳。
- **退出登录**：点击用户菜单"退出登录"后按相同顺序清空登录态、`currentTeamId`、`currentProjectId`、Electron 当前激活 MCP 项目，跳转到 `/login`。
- **团队管理子页"返回"**：`/teams/:teamId`、`/members` 的"返回"按钮统一跳到 `/projects`（项目列表），不留在团队管理内循环。
- **JWT 刷新**：MVP 阶段不做静默 refresh token；401 即视为过期。
- **后端地址存储**：Electron 使用系统级安全存储（macOS Keychain / Windows Credential Manager / Linux libsecret）保存 synkord-core 地址与登录 JWT，避免明文落盘到 `localStorage` 或 `config.json`。运行期不切换。

## 5. 后端 API 设计约定

REST API 统一使用 `/api` 前缀。

基础与健康检查：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回后端与数据库可用状态 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/teams` | 我的团队列表 |
| POST | `/api/teams` | 创建团队 |
| GET | `/api/teams/:teamId` | 团队详情 |
| PATCH | `/api/teams/:teamId` | 编辑团队 |

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
| PATCH | `/api/teams/:teamId/projects/:projectId` | 编辑项目（含仓库地址） |
| DELETE | `/api/teams/:teamId/projects/:projectId` | 删除或归档项目 |

项目内接口与数据模型：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/projects/:projectId/apis` | 当前项目接口列表 |
| POST | `/api/teams/:teamId/projects/:projectId/apis/import` | 当前项目导入 Swagger / OpenAPI / Postman，导入时同步生成当前项目数据模型和依赖关系 |
| GET | `/api/teams/:teamId/projects/:projectId/apis/:apiId` | 当前项目接口详情 |
| GET | `/api/teams/:teamId/projects/:projectId/apis/:apiId/export` | 导出当前项目 OpenAPI 规范 |
| GET | `/api/teams/:teamId/projects/:projectId/models` | 当前项目数据模型列表 |
| POST | `/api/teams/:teamId/projects/:projectId/models` | 当前项目创建数据模型 |
| GET | `/api/teams/:teamId/projects/:projectId/models/:modelId` | 当前项目数据模型详情 |
| PATCH | `/api/teams/:teamId/projects/:projectId/models/:modelId` | 当前项目编辑数据模型并生成版本 |

项目内依赖（**MVP 只读**）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/projects/:projectId/dependencies/graph` | 当前项目依赖拓扑 |
| GET | `/api/teams/:teamId/projects/:projectId/dependencies` | 当前项目依赖列表 |

依赖关系只由 Swagger / OpenAPI / Postman 导入自动解析 `$ref` 生成；MVP 阶段不提供手动新增、编辑、删除依赖的 API。

项目 MCP 管理：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams/:teamId/projects/:projectId/mcp` | 当前项目 MCP 概览 |
| GET | `/api/teams/:teamId/projects/:projectId/mcp/tokens` | Token 列表 |
| POST | `/api/teams/:teamId/projects/:projectId/mcp/tokens` | 创建 Token |
| PATCH | `/api/teams/:teamId/projects/:projectId/mcp/tokens/:tokenId` | 停用、启用、更新工具范围 |
| POST | `/api/teams/:teamId/projects/:projectId/mcp/tokens/:tokenId/rotate` | 重新生成 Token（旧 Token 立即失效） |
| GET | `/api/teams/:teamId/projects/:projectId/mcp/audit` | 调用审计 |
| GET | `/api/teams/:teamId/projects/:projectId/mcp/onboarding` | IDE 接入说明与配置模板（不含 Token 明文与审计） |

本地 MCP 服务代理接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/mcp/introspect` | 校验 MCPConfig.Token、当前团队和当前项目，返回是否可用和工具范围 |
| POST | `/api/mcp/query` | 本地 MCP 服务按当前激活团队和项目查询规范、模型或依赖数据；请求体携带 `tool` 与 `args` |
| POST | `/api/mcp/audit` | 本地 MCP 服务上报 MCP 调用审计；请求体携带 `tool`、`result_status`、`error`（如有） |

`/api/mcp/query` 请求与响应 schema：

```ts
// 请求
interface MCPQueryRequest {
  tool: MCPTOOL;                    // 见 Section 8 工具名
  args: Record<string, unknown>;     // 由 tool 决定字段
  call_id?: string;                  // 本地 MCP 服务生成的请求 ID，用于审计关联
}

// 响应
interface MCPQueryResponse {
  call_id?: string;
  result: unknown;                   // 由 tool 决定结构
  result_status: 'ok' | 'error';
  error?: { code: string; message: string };
}
```

`/api/mcp/audit` 请求 schema：

```ts
interface MCPAuditRequest {
  call_id?: string;
  tool: MCPTOOL;
  args_summary: string;              // 参数脱敏摘要
  result_status: 'ok' | 'error';
  error?: { code: string; message: string };
  called_at: string;                 // ISO8601，由本地 MCP 服务生成
}
```

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

| 能力 | platform_admin | team_admin | editor | viewer |
| --- | --- | --- | --- | --- |
| 登录管理端 | 是 | 是 | 是 | 是 |
| 创建团队 | 是（普通用户能力） | 是 | 是 | 是 |
| 查看团队成员 | 按团队角色 | 是 | 是 | 是 |
| 管理团队成员 | 按团队角色 | 是 | 否 | 否 |
| 编辑团队信息 | 按团队角色 | 是 | 否 | 否 |
| 查看项目 | 按团队角色 | 是 | 是 | 是 |
| 创建 / 编辑项目 | 按团队角色 | 是 | 是 | 否 |
| 删除项目 | 按团队角色 | 是 | 否 | 否 |
| 查看当前项目接口、模型、依赖 | 按团队角色 | 是 | 是 | 是 |
| 导入 Swagger / OpenAPI / Postman | 按团队角色 | 是 | 是 | 否 |
| 导出当前项目 OpenAPI | 按团队角色 | 是 | 是 | 否 |
| 创建 / 编辑数据模型 | 按团队角色 | 是 | 是 | 否 |
| 删除数据模型 | 按团队角色 | 是 | 否 | 否 |
| 管理依赖关系（MVP 只读，仅由导入自动生成） | 按团队角色 | 是 | 是 | 否 |
| 管理当前项目 MCP Token | 按团队角色 | 是 | 否 | 否 |
| 查看 MCP 接入说明 | 按团队角色 | 是 | 是 | 仅 IDE 配置模板 |
| 查看 MCP 调用审计 | 按团队角色 | 是 | 是 | 否 |

说明：

- 平台管理员对团队业务数据的能力始终"按团队角色"，即不持有团队角色时无任何团队数据访问权。
- "查看 MCP 接入说明"对 viewer 公开的内容是 IDE 配置模板与接入步骤，**不包含** Token 明文、Token 列表、工具范围、审计日志。
- MVP 阶段依赖关系不提供手动管理端点，但权限表保留"管理依赖关系"以便后续阶段启用。
- 导出 OpenAPI 与导入对称要求：viewer 无权导入，也无权导出，避免只读用户被绕过规范。

前端权限用于隐藏、置灰和提示。后端权限必须再次校验，不能只依赖前端。

## 8. MCP 工具目标

本地 MCP 服务的目标工具（每个 tool 都对应一次 `/api/mcp/query` 调用，后端按 `tool` 字段分发到具体 handler）：

| 工具 | args | result | 说明 |
| --- | --- | --- | --- |
| `get_project_entities` | `{ keyword?: string, type?: string, page?: number, page_size?: number }` | `{ items: DataModel[], total: number }` | 获取当前激活项目的数据模型 |
| `get_project_apis` | `{ keyword?: string, method?: string, tag?: string, page?: number, page_size?: number }` | `{ items: APIEndpoint[], total: number }` | 获取当前激活项目 API |
| `get_entity_dependencies` | `{ model_name: string }` | `{ referenced_by: Array<{ project_id: string, project_name: string, api_path?: string, api_method?: string }> }` | 查询模型被哪些项目或接口引用 |
| `get_api_dependencies` | `{ api_path: string, api_method: string }` | `{ referenced_by: Array<{ project_id: string, project_name: string }> }` | 查询 API 被哪些项目引用 |
| `validate_entity_usage` | `{ model_name: string, code_snippet: string, language?: string }` | `{ valid: boolean, issues: Array<{ line?: number, column?: number, message: string, severity: 'error'\|'warning' }> }` | 校验代码片段中的模型使用 |

`type MCPTOOL = 'get_project_entities' | 'get_project_apis' | 'get_entity_dependencies' | 'get_api_dependencies' | 'validate_entity_usage'`。

调用语义：

- `args` 内不出现 `team_id` / `project_id`：这两个值由本地 MCP 服务在转发时从 Electron 当前激活上下文注入，调用方（IDE/Agent）不感知。
- `result` 内只返回当前激活项目和当前激活 Token 授权范围内的数据；调用方不可越权。
- 每次 `tools/call` 成功后本地 MCP 服务必须上报一次 `POST /api/mcp/audit`，参数摘要需脱敏（去除 `code_snippet` 全文，只保留长度与首尾若干字符）。

当前代码中的 `get_global_entities`、`get_service_entities` 属于旧实现，应在 MCP 重构阶段替换。

## 9. CLI / Git Hook / CI 边界

CLI（`synkord-cli`）是 REST 客户端封装，**MVP 必交付** `push-spec` 与 `validate-deps` 两个命令；不调 MCP，也不引入新协议。

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

`--token` 凭据类型在 MVP 阶段以用户 JWT 为主，专用 REST Token 留待后续阶段。CLI 不调 MCP。如需 MCP 能力，配置 IDE 的 `.mcp.json`。

## 10. Electron 与本地 MCP 服务边界

Electron 负责：

- 保存 synkord-core 后端地址。
- 保存登录态。
- 管理当前团队和当前激活项目。
- 启动、停止、重启本机唯一 MCP 服务。
- 提供本地 MCP 服务状态、端点、日志和 IDE 配置模板。
- 打开项目详情 MCP Tab 时，把该项目设为当前 MCP 激活项目。
- **维护本机激活上下文文件** `${SYNKORD_HOME}/active-context.json`，内容为 `{ team_id, project_id, synkord_core_url, updated_at }`，文件权限 `0600`；本地 MCP 服务在每次启动和定期轮询（默认 5 秒）时读取。
- 本地 MCP 服务在 Electron 内以子进程方式启动时，Electron 通过命令行参数 `--synkord-home <path>` 注入上下文目录位置；本地 MCP 服务也可以监听 Electron 在 `127.0.0.1:<management_port>` 上暴露的 `GET /context` 端点以获取最新上下文（无需轮询文件）。

本地 MCP 服务负责：

- 对 IDE/Agent 暴露 MCP tools/resources/prompts。
- 启动时与定期从 `${SYNKORD_HOME}/active-context.json` 或 `127.0.0.1:<management_port>/context` 读取当前激活团队、项目和后端地址。
- 携带 IDE/Agent 提供的 MCP Token 调用后端 `/api/mcp/introspect`，把 `team_id` 和 `project_id` 注入到后端请求头。
- 按后端返回的工具范围执行 `/api/mcp/query`，每个 tool 调用的请求体中 `team_id` / `project_id` 由本地 MCP 服务从上下文注入，IDE/Agent 不感知。
- 通过 `/api/mcp/audit` 上报调用审计；上报失败时本地 MCP 服务记录本地日志，下次启动时重试。

本地 MCP 服务不选择团队或项目。团队和项目只由 Electron 当前激活上下文决定。

## 11. Mock 数据替换顺序

建议按风险从低到高替换：

1. 登录、团队列表、团队信息编辑、创建团队引导。
2. 团队成员与权限。
3. 项目管理列表、创建、编辑、删除（含仓库地址）。
4. 项目详情页面框架（项目信息、Tab 容器）。
5. 当前项目接口管理和 Swagger / OpenAPI / Postman 导入。
6. 当前项目数据模型列表、详情、版本快照。
7. 当前项目依赖拓扑（只读，依赖导入结果）。
8. 当前项目 MCP 管理（概览、Token、工具列表、IDE 接入说明、审计）。
9. Electron 本地 MCP 服务管理。
10. `synkord-cli` 的 `push-spec` 与 `validate-deps` 命令。

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
- 有团队时设置 `currentTeamId`，并把第一个团队作为默认当前团队。
- AppLayout 顶部集成团队下拉选择器，并按当前团队刷新侧边菜单。

验收：

- 首次登录无团队时不能进入团队业务页面，只能进入 `/teams/new`。
- 创建团队后自动进入 `/projects`（当前团队项目列表）。
- 通过顶部下拉切换团队后清空 `currentProjectId` 和 Electron 当前激活 MCP 项目，项目内页面跳回 `/projects`。
- 顶部下拉以外不再出现团队列表入口。

### 阶段 2：页面路由与布局

目标：

- 按树结构建立目标路由，含 `/projects/:projectId/mcp`。
- 团队菜单只保留项目管理和团队管理。
- 删除旧通用系统设置入口。
- MCP 管理入口只保留在项目详情中，作为当前项目的 MCP Tab 或子页（`/projects/:projectId/mcp`）。

验收：

- 侧边菜单只展示当前团队的项目管理和团队管理。
- 顶部只展示本地 MCP 服务状态、当前团队和当前激活项目。
- 未进入项目时，不出现接口管理、数据模型、依赖拓扑或 MCP 管理入口。
- `/projects/:projectId` 默认展示"项目信息" Tab。
- 项目详情子页"返回"按钮回到对应列表子页。
- 跨项目跳转弹确认；新建项目成功跳到 `/projects/:newId`。

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
3. 不再新增组织、全局实体、团队级数据模型、团队级接口、团队级依赖拓扑、团队级 MCP、通用系统设置、工作台首页、最近访问团队、切换后端地址、变更检测、变更记录或通知中心模块。
4. 团队层只保留项目管理和团队管理（含团队信息、成员与权限）；团队选择统一在顶部下拉选择器完成。
5. 依赖关系 MVP 阶段只读，只由 Swagger / OpenAPI / Postman 导入自动生成，不实现手动新增 / 编辑 / 删除端点。
6. CLI 走 REST 不走 MCP；MVP 必交付 `push-spec` 与 `validate-deps` 两个命令。
7. `currentProjectId` 由路由同步显式管理，跨项目跳转必须二次确认。
8. 项目详情子页"返回"回到对应列表子页，不回到项目详情默认 Tab。
9. 每次只重构一个闭环或一个页面组，避免跨太多模块。
10. 修改共享数据模型、权限或路由时，同步检查相关页面和 API。
11. 删除旧代码前确认没有仍被路由、菜单、API 或测试引用。
12. 每次完成后说明已跑的测试；没跑测试必须说明原因。
13. 如果发现需求链路不闭环，先补文档再写代码。

## 15. Definition of Done

一个开发任务完成必须满足：

- 页面入口符合树结构；登录后无工作台，按是否拥有团队分别落到 `/projects` 或 `/teams/new`。
- 团队层只展示项目管理和团队管理（含团队信息、成员与权限）。
- 项目内接口、模型、依赖、MCP 都绑定当前项目。
- 当前团队通过顶部下拉选择器切换，切换时清空 `currentProjectId` 与 Electron 当前激活 MCP 项目。
- 权限控制前后端一致（含 platform_admin、team_admin、editor、viewer 四列能力）。
- 数据归属团队和项目，不混入其他团队或项目。
- 依赖关系 MVP 阶段只读且全部由导入自动生成。
- 成功、失败、空状态都有明确展示。
- 关键操作有确认或表单校验。
- 相关 API 有清晰错误返回。
- 必要测试通过。
- README 或 docs 中需要同步的内容已同步。
