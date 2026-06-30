Synkord 开源 MCP 规范协同平台需求文档

1. 项目概述

   1.1 背景

   当前团队存在多项目、多角色、多 IDE、多 AI 工具协同开发场景：

- 项目架构：包含多个后端 Server 微服务、Web 前端、App 移动端项目，服务间存在大量数据实体、API 接口和跨项目依赖关系。
- 人员分工：开发人员 B 负责后端 Server 与 Web 项目，主要使用 PyCharm、VSCode、Codex、Copilot；开发人员 A 负责 App 项目，主要使用 Cursor AI。
- 核心痛点：原有 YApi 长期停更，不支持 OpenAPI 3.x、MCP、跨服务实体依赖校验和项目内规范协同，导致实体定义分散、AI 生成代码不统一、接口理解不一致、协同同步成本高。
- 产品要求：作为开源、自托管产品发布，支持团队在本地、内网或私有云环境部署，核心能力不依赖商业 SaaS。

   1.2 建设目标

   Synkord 是一个开源、自托管的 MCP 规范协同平台，用于在项目上下文内统一管理 API、实体和依赖关系，并向 IDE、AI 工具、Git Hook、CI 和桌面管理端提供一致的规范来源。

1. 统一托管团队内各项目的 API 接口、数据模型、枚举、分页模型和统一返回体。
2. 通过本地 MCP 服务为 IDE 和 AI 编码助手提供统一规范消费接口。
3. 通过 REST API 分别提供 Electron 管理端所需的登录与管理能力、CLI/Git Hook/CI 所需的规范导入与校验能力，以及本地 MCP 服务所需的 Token 校验与规范查询能力。
4. 通过依赖关系定位接口、模型和项目之间的引用关系，辅助相关前端/App 开发人员理解当前项目规范。
5. 构建“AI 前置提示 + MCP 规范查询 + Git Hook/CI 兜底校验”的规范闭环。
6. 以开源项目方式提供清晰的安装、配置、扩展和二次开发路径。

   1.3 边界说明

- 本地 MCP 服务是 IDE 和 AI 工具的统一规范消费接口。
- 后端 REST API 分为管理类、校验/导入类和本地 MCP 服务代理类；AI/IDE 不直接接入管理类 REST，而是通过本地 MCP 服务消费规范。
- MCP 不能天然强制 AI 输出正确代码，强约束依赖 Git Hook、CI 和规则校验共同完成。
- MVP 阶段优先支持 OpenAPI 3.x 与 JSON Schema，不覆盖 Swagger 2.0、GraphQL、gRPC 和私有 RPC 协议。
- 产品默认面向开源自托管场景，内网私有化部署是支持的部署形态之一，不作为唯一产品定位。

   1.4 适用范围

- 项目：后端微服务、Web 前端、App 移动端项目。
- 人员：后端、Web、App、测试、架构或技术负责人。
- 约束对象：项目 API 接口规范、项目数据模型、跨项目依赖关系和实体版本锁定。

2. MVP 范围

   2.1 第一阶段必须交付

1. Go 后端服务 synkord-core。
2. Electron 管理端。
3. 账号登录、JWT 鉴权、RBAC 权限控制。
4. 项目管理：后端服务、Web 项目、App 项目。
5. 团队空间：团队层只保留项目管理、团队信息、成员与权限。
6. 项目管理：维护后端服务、Web 项目、App 项目及仓库地址、负责人、描述等元数据。
7. 项目详情：进入项目后管理该项目的接口、数据模型、依赖拓扑（只读）和 MCP 接入。
8. 接口管理：在项目内维护 HTTP API，支持 Swagger/OpenAPI 与 Postman Collection 导入、解析、展示、导出。
9. 数据模型：在项目内维护当前项目的数据模型。
10. MCP 管理：通过后端 REST 管理当前项目的 MCP 接入配置、Token、可用工具、调用审计和 IDE 接入说明。
11. 本地 MCP 服务：由 Electron 管理生命周期，向 IDE/AI 编码助手提供规范查询、依赖查询、代码片段校验能力。
12. Docker Compose 部署后端，Electron 客户端连接自托管后端实例。
13. `synkord-cli`：MVP 必交付 `push-spec`（CI 推送 OpenAPI）与 `validate-deps`（Git Hook 校验依赖）两个命令，CLI 走 REST 不调 MCP。

   2.2 第一阶段暂不交付

1. 自动生成 SDK。
2. 代码仓库全量扫描。
3. GraphQL、gRPC、Swagger 2.0 兼容。
4. 在线 Mock 服务。
5. 多租户 SaaS。
6. 自动更新 Electron 客户端。
7. 复杂审批流。

3. 技术栈与部署需求

1. 后端：Go 1.25+、Gin、GORM、SQLite、PostgreSQL 可选扩展。
2. 前端：Electron、React 18、Ant Design 5、Vite、TypeScript。
3. 本地 MCP 服务：由 Electron 管理生命周期，可按实现阶段选用 Go + mark3labs/mcp-go 或 Node.js MCP SDK。
4. 部署方式：后端通过 Docker Compose 部署在本地、内网服务器或私有云主机；Electron 管理端在桌面机器安装运行。
5. 基础环境：
   - 后端：Linux 服务器或本地开发环境，最低 2 核 4G。
   - 管理端：Windows、macOS、Linux 桌面环境。
6. 数据存储：
   - MVP 默认 SQLite 单文件存储。
   - 团队规模扩大后可切换 PostgreSQL。
7. 网络要求：
   - 支持本地、自托管、内网和私有云访问。
   - 后端暴露 REST API；本地 MCP 服务由 Electron 在桌面端管理，并连接后端 REST API。
   - Electron 客户端支持配置 synkord-core 服务地址。

4. 技术架构

   synkord-core 是业务事实来源，提供 REST API、账号团队权限、项目接口模型、依赖和审计能力。Electron 管理端通过 REST API 管理平台数据，并管理本机 MCP 服务生命周期；Codex、Cursor、VSCode、JetBrains 等 IDE/Agent 通过本地 MCP 服务消费规范上下文。

   ```text
   ┌─────────────────────────────────────────────────────────────┐
   │ synkord-core (Go)                                           │
   │ REST API / 账号 / 团队 / 权限 / 项目 / 接口 / 模型 / 审计      │
   └──────────────────────────▲──────────────────────────────────┘
                              │ REST
   ┌──────────────────────────┴──────────────────────────────────┐
   │ Electron 管理端                                               │
   │ 桌面 UI / 后端连接配置 / 当前团队项目上下文 / MCP 服务管理      │
   └──────────────────────────▲──────────────────────────────────┘
                              │ 本地进程管理 / localhost 管理
   ┌──────────────────────────┴──────────────────────────────────┐
   │ 本地 MCP 服务                                                 │
   │ MCP tools/resources/prompts / 当前项目规范代理 / Token 校验     │
   └──────────────────────────▲──────────────────────────────────┘
                              │ MCP
   ┌──────────────────────────┴──────────────────────────────────┐
   │ Codex / Cursor / VSCode / JetBrains 等 IDE/Agent             │
   │ MCP Client                                                   │
   └─────────────────────────────────────────────────────────────┘
   ```

   4.1 四层架构与协议分工

   Synkord 运行时分为四层，协议严格分离：

   ```text
   ┌─────────────────────────────────────────────────────────────┐
   │  Authority: synkord-core (Go)                              │
   │  ├─ 数据存储 (SQLite/PG)                                    │
   │  ├─ REST API (/api/*)                                      │
   │  └─ 登录 / 团队 / 权限 / 业务资产 / 审计                     │
   └─────────────────────────────────────────────────────────────┘
                 ▲
                 │ REST
   ┌─────────────┴────────────┐
   │  Management: Electron    │
   │  ├─ 团队资产 CRUD          │
   │  ├─ MCP 服务启停/配置/监控  │
   │  ├─ 当前团队项目上下文       │
   │  ├─ Token 管理入口与配置模板 │
   │  └─ 审计查看              │
   └─────────────▲────────────┘
                 │ 本地进程管理 / localhost 管理
   ┌─────────────┴────────────┐
   │  Local MCP Service       │
   │  ├─ tools/resources      │
   │  ├─ Token 转发校验        │
   │  └─ 后端 REST API 代理    │
   └─────────────▲────────────┘
                 │ MCP
   ┌─────────────┴────────────┐
   │  Consumption: IDE/Agent  │
   │  ├─ Codex / Cursor       │
   │  ├─ VSCode / JetBrains   │
   │  └─ 其他 MCP Client       │
   └──────────────────────────┘
   ```

   - **Authority（synkord-core）**：数据存储、REST API、登录、团队、权限、业务资产和审计。REST API 路径前缀 `/api`。后端不直接管理用户机器上的 MCP 服务进程。
   - **Management（Electron 管理端）**：通过 REST API 完成团队项目、团队成员，以及项目内接口、模型、依赖、MCP 配置的 CRUD；负责本机唯一 MCP 服务的启动、停止、重启、配置、状态监控、日志查看、当前团队项目上下文设置和 IDE 配置生成。**不直接作为 MCP Client 调用 MCP 工具**。
   - **Local MCP Service（本地 MCP 服务）**：由 Electron 管理生命周期，对 IDE/Agent 暴露 MCP tools/resources/prompts，同一时间只服务 Electron 当前激活的一个团队和一个项目；接收 MCP Token 并调用后端校验后，再按当前团队项目上下文调用后端 REST API 获取规范数据。
   - **Consumption（消费方）**：IDE/AI 编码助手（Codex、Cursor、VSCode、PyCharm、Copilot 等）通过 MCP 协议连接本地 MCP 服务；CLI、Git Hook 和 CI 通过 REST 调用后端，不依赖 MCP 协议。

   4.2 同步渠道矩阵

   | 行为 | 通道 | 调用方 |
   | --- | --- | --- |
   | 后端 CI 推送 OpenAPI/Postman | REST | 后端项目 + `synkord-cli push-spec` |
   | 前端 commit 校验依赖 | REST | 前端项目 + `synkord-cli validate-deps` |
   | CI 通用校验 spec 兼容性 | REST | 任意项目 + `synkord-cli` |
   | IDE/AI 读取最新 API/模型 | MCP | IDE/AI |
   | IDE/AI 校验代码片段 | MCP | IDE/AI |
   | 团队资产 CRUD | REST | Electron |
   | 启停 MCP 服务 | 本地进程管理 | Electron |
   | Token 管理 | REST | Electron |
   | 审计查看 | REST | Electron |
   | 健康检查 | REST `/health` | 部署 / 监控 |

   4.3 后端技术栈

   后端不限制技术栈，Synkord 不集成特定框架的 OpenAPI 生成器。约束对象是 **OpenAPI 3.x** 规范本身：

   - Spring Boot 项目使用 springdoc-openapi 生成 openapi.json
   - NestJS 项目使用 @nestjs/swagger 生成 openapi.json
   - FastAPI 项目自动生成 openapi.json
   - Go 项目使用 swag/swaggo 生成 openapi.json
   - Python (Flask) 使用 flasgger / apispec 生成 openapi.json
   - 其他栈自行保证产物符合 OpenAPI 3.x

   导入时校验（不通过则拒绝）：

   - `info.title`、`info.version` 必填
   - 每个 operation 必填 `summary` 或 `description`
   - `$ref` 必须指向 `components/schemas` 内已定义 entity
   - HTTP 响应需带 description

   只要后端项目能在 CI 中产出 openapi.json 并通过 CLI 推送，即满足约束。

5. 核心数据对象

   5.1 Team

   表示用户的协作边界和资产隔离边界。产品最高业务容器为团队，用户登录后直接进入“我的团队”。

- 字段：名称、描述、所有者、团队成员、团队角色、创建时间、更新时间。
- 用户首次登录后如果没有团队，必须先创建团队。
- 用户可以创建多个团队，也可以被邀请加入多个团队。
- 每个团队只提供项目管理、团队信息、成员与权限三个业务入口。
- 接口管理、数据模型、依赖拓扑和 MCP 管理必须进入具体项目后使用。
- 团队之间默认数据隔离，跨团队共享需要后续显式授权或导出导入。
- 多团队时登录后默认进入列表中第一个团队；切换团队通过 Electron 顶部下拉选择器完成，不保留"最近访问团队"概念。

   5.2 Project

   表示一个团队项目。

- 项目类型：backend、web、app。
- 字段：团队、名称、描述、项目类型、负责人、仓库地址、OpenAPI 版本、创建时间、更新时间。
- 后端服务项目可维护 API 与私有实体。
- Web/App 项目可声明对后端服务 API 与实体的依赖。

   5.3 APIEndpoint

   API 是替代 YApi 的核心资产，不能只作为 OpenAPI 文本附件存在；数据模型命名为 `APIEndpoint`。

- 字段：团队、项目、路径、方法、标签、摘要、描述、请求参数、请求体、响应体、状态码、鉴权要求、废弃状态、版本。
- 来源：OpenAPI 3.x / Swagger 导入、Postman Collection 导入、手动创建、后续版本更新。
- 能力：列表检索、详情查看、按项目/标签过滤、导出 OpenAPI。

   5.4 DataModel

   表示 JSON Schema/OpenAPI Schema Object；与 ai-development-guide Go 模型命名一致。

- 类型：project。
- 字段：项目、名称、描述、JSON Schema、当前版本、类型、创建人、创建时间、更新时间。
- 项目内模型用于服务私有 DTO、VO、请求体、响应体，以及团队级共享的返回体、分页模型、基础字段、公共枚举；上述共享模型同样归属项目，便于随当前项目上下文交付。
- 不再提供"团队实体模型库"独立入口；团队共享模型通过项目内数据模型承载。

   5.4.1 DataModelVersion

   表示数据模型的不可变版本快照。

- 字段：数据模型 ID、版本号、JSON Schema、创建人、创建时间、说明。
- 修改数据模型后由后端自动生成新版本，旧版本只读保留。
- 当前版本字段存于 `DataModel`；具体快照存于 `DataModelVersion`。

   5.5 Dependency

   表示项目、API、实体之间的依赖关系。

- 自动来源：解析 Swagger / OpenAPI 文档的 `$ref`，由项目内导入流程生成。
- MVP 阶段依赖关系只读，不提供管理端手动新增、编辑、删除依赖的入口。
- 字段：项目、依赖方项目（跨项目时）、被依赖项目（跨项目时）、实体 / API 名称、锁定版本、来源、创建时间。
- 每个项目的依赖关系数据独立，默认不混入其他项目数据。

   5.6 PostmanCollection

   表示项目内导入或维护的 Postman Collection。

- 字段：团队、项目、名称、Collection JSON、环境变量、版本、导入人、导入时间。
- 用于从 Postman Collection 生成当前项目 API 资产，并刷新项目内模型和依赖关系。

   5.7 SwaggerSpec

   表示项目内维护的 Swagger/OpenAPI 文档。

- 字段：团队、项目、名称、版本、规范内容、导入来源、导入人、导入时间。
- MVP 以 OpenAPI 3.x 为主，Swagger 2.0 可作为兼容导入增强项。

   5.8 TeamMember

   表示用户在某个团队内的成员身份和权限。

- 字段：团队、用户、角色、状态、邀请状态、加入时间、最近活跃时间。
- 角色：team_admin、editor、viewer。
- 状态：active、disabled。
- 邀请状态：pending、accepted、expired、cancelled。

   5.9 MCPConfig

   表示当前项目内一个 MCP 接入配置。

- 字段：团队、项目、名称、用途、Token 摘要、工具范围、启用状态、过期时间、创建人。
- Token 明文仅创建或重新生成时展示一次，后续只保存哈希或摘要。
- 不再承载调用审计记录；调用审计由独立的 `MCPAuditLog` 对象承载。

   5.10 MCPAuditLog

   表示本地 MCP 服务上报的一次调用审计记录。

- 字段：团队、项目、Token 摘要、工具名、调用方、参数摘要、结果状态、错误信息（如有）、调用时间。
- 由本地 MCP 服务在每次 `tools/call` 后通过 `POST /api/mcp/audit` 上报，**不**由调用方主动写入。
- 管理端通过 `GET /api/.../mcp/audit` 按当前团队和项目查询；viewer 无权查询。
- 与 `MCPConfig.last_used_at` 配合：MCPConfig 只记录 Token 最近被使用的粗粒度时间，MCPAuditLog 记录每一次具体调用。

6. 功能需求

   6.1 团队空间与资产隔离

1. 产品只保留“我的团队”，团队是最高业务容器。
2. 用户首次登录后如果没有团队，必须先创建团队才能进入业务功能。
3. 用户可以创建多个团队，也可以被邀请加入其他团队。
4. 每个团队拥有独立资产空间，但团队层只展示项目管理、团队信息、成员与权限；接口、数据模型、依赖拓扑和 MCP 管理归属到具体项目详情。
5. 团队成员权限独立配置，管理员可管理团队成员和团队资产。
6. 团队之间默认数据隔离，切换团队后所有业务数据按当前团队重新加载。
7. 创建团队成功后，创建者自动成为该团队管理员。
8. 用户有多个团队时，默认进入列表中第一个团队；不保留"最近访问团队"概念，团队切换通过 Electron 顶部下拉选择器完成。
9. 用户退出或删除当前团队后，如果还有其他团队则自动切换；如果没有团队则回到创建团队引导页。
10. 团队管理员可以邀请已有用户加入团队，也可以创建本地用户并加入当前团队。
11. 没有"工作台首页"或"我的团队卡片"独立页面，团队选择统一在顶部下拉选择器。

   6.2 项目管理

1. 支持团队内创建后端服务、Web 项目、App 项目。
2. 支持维护项目名称、描述、类型、负责人、仓库地址、OpenAPI 版本等元数据；元数据编辑入口在项目详情"项目信息" Tab。
3. 支持按项目类型和关键字检索。
4. 支持删除、编辑、归档项目。
5. 创建项目成功后自动跳转到新建项目的详情页（`/projects/:newId`），并把 `currentProjectId` 同步设置为新建项目。
6. 项目详情 5 个 Tab（项目信息、接口管理、数据模型、依赖拓扑、MCP）各自有独立路由，Tab 切换通过路由而非 query 状态实现；MCP Tab 路由为 `/projects/:projectId/mcp`。
7. 项目详情子页"返回"按钮回到对应列表子页（接口详情 → `/projects/:projectId/apis`、模型详情 → `/projects/:projectId/models`），不回到项目详情默认 Tab。
8. 跨项目跳转必须二次确认：例如从项目 A 的接口详情跳到项目 B 的项目详情时，弹确认框，确认后才更新 `currentProjectId` 并跳转；取消则保留来源项目上下文。

   6.3 项目内接口管理

1. 支持在项目内维护 HTTP API 资产。
2. 支持在项目内导入 Swagger/OpenAPI JSON/YAML。
3. 支持在项目内导入 Postman Collection，并解析为 API 资产。
4. 导入后自动解析 API 路径、HTTP 方法、请求参数、请求体、响应体、Schema、`$ref` 依赖。
5. 支持按当前项目内的标签、路径、方法搜索 API。
6. 支持查看 API 详情，包括请求参数、响应结构、引用数据模型。
7. 支持导出项目当前 OpenAPI 规范。
8. 规范解析失败时需要返回明确错误位置和原因。

   6.4 项目内数据模型

1. 支持项目内数据模型管理。
2. 支持 DTO、VO、枚举、分页模型、统一返回体、请求体、响应体等模型类型。
3. 支持 JSON Schema/OpenAPI Schema Object 存储。
4. 支持模型版本快照，修改模型后自动生成新版本。
5. 支持消费方锁定模型主版本，避免意外升级。
6. 支持查看模型被哪些 API 和项目引用。

   6.5 MCP 管理

1. 支持在项目详情中通过后端 REST 为当前项目创建 MCP 接入配置和 Token；接入地址由当前设备上的本地 MCP 服务提供。MCP 管理页路由为 `/projects/:projectId/mcp`。
2. 支持查看当前项目可用 MCP 工具列表。
3. 支持生成 Cursor、VSCode、PyCharm 等 IDE 的 `.mcp.json` 配置示例；IDE 配置中的本地 MCP 地址保持稳定，项目切换由 Electron 的当前激活项目上下文决定。
4. 支持通过后端 REST 创建、禁用、轮换 MCP Token。
5. 支持记录 MCP 调用审计，包括调用工具、调用方、时间、参数摘要和结果状态。
6. 支持按当前激活团队和项目隔离 MCP 返回内容，团队 A 的 Token 不得访问团队 B 的资产；项目 A 的上下文不得返回项目 B 的私有规范。
7. 从项目详情进入 MCP 页时，Electron 将该项目设为当前 MCP 激活项目；用户从项目 A 切换到项目 B 后，IDE/Agent 后续请求使用项目 B 的规范上下文。
8. MCP 页面内的子模块（新建 Token、轮换 Token、查看调用审计、复制 IDE 配置）以 Modal / Drawer / 锚点呈现，不产生新路由。

   6.6 MCP 服务能力

   Electron 启动并管理本地 MCP 服务后，本地 MCP 服务对 IDE/AI 编码助手暴露以下 MVP 工具：

- `get_project_entities`：获取当前激活项目的数据模型。
- `get_project_apis`：获取当前激活项目的 API 列表与详情。
- `get_entity_dependencies`：查询实体被哪些项目引用。
- `get_api_dependencies`：查询 API 被哪些项目引用。
- `validate_entity_usage`：校验代码片段中的实体使用是否符合平台规范。

   MCP 工具需要 MCPConfig.Token 鉴权。本地 MCP 服务携带该 Token、当前激活团队和当前激活项目调用后端的 Token 校验和规范查询专用 REST 端点；Git Hook 和 CI 走 REST 校验通道，使用 JWT 或独立 REST 凭据，便于审计和权限控制。

   6.7 Git Hook 与 CI 兜底校验

1. Git Pre-Commit 可调用后端 REST 校验本地代码对项目规范和依赖的使用。
2. CI 可调用后端 REST 做全量校验。
3. 后端或网络不可用时，Git Hook 使用本地缓存降级校验，并记录审计日志。
4. Git Hook 默认超时 3 秒，超时策略可配置为 warn 或 block。
5. CI 默认不允许降级，后端 REST 校验不可用时失败。

   6.8 Electron 管理端

1. 首次启动支持配置 synkord-core 地址。
2. 支持账号密码登录，保存登录态。
3. synkord-core 后端地址与登录 JWT 必须存储在系统级安全存储（macOS Keychain / Windows Credential Manager / Linux libsecret）中，**禁止**明文落盘到 `localStorage` 或本地配置文件。
4. 登录后检查当前用户是否已有团队；无团队时进入创建团队引导页。
5. 支持我的团队列表、团队创建、团队下拉切换、项目管理、团队信息、成员与权限，以及项目内接口管理、数据模型、依赖拓扑（只读）、项目 MCP 管理、本地 MCP 服务管理。
6. 后端连接地址属于客户端本地连接配置；**MVP 阶段不支持运行期切换**后端地址，只在启动、登录前或连接失败时处理。
7. MCP 是否可用由本地 MCP 服务状态、当前激活项目、Token 状态和工具范围共同决定。
8. 支持显示本地 MCP 服务状态、当前激活团队、当前激活项目、当前登录用户和权限；后端连接地址仅作为客户端本地连接配置，不作为登录后的状态入口。
9. MVP 不要求自动更新，安装包可通过 GitHub Release、内部分发或离线包方式发布。
10. 用户菜单"退出登录"清空登录态、`currentTeamId`、`currentProjectId`、Electron 当前激活 MCP 项目并跳到 `/login`。
11. 后端任意 `/api/*` 返回 401 时由前端拦截器统一清空所有上文上下文，跳到 `/login` 并保留 `?redirect=` 用于登录后回跳。MVP 阶段不做静默 refresh。

7. 权限模型

权限分为平台级和团队级：

- 平台管理员：拥有平台级账号和基础管理能力，不参与 MCP 配置管理。
- 团队管理员：管理当前团队成员、团队项目、团队信息，以及项目内接口、数据模型、依赖关系和当前项目 MCP Token。
- 编辑者：编辑当前团队项目，以及项目内接口、数据模型和依赖关系。
- 只读者：只查看当前团队项目和项目内规范资产。
- 平台管理员身份不自动获得任何团队业务数据权限；如果平台管理员也需要访问某个团队，必须同时拥有该团队内角色。

| 能力 | 平台管理员 | 团队管理员 | 编辑者 | 只读者 |
| --- | --- | --- | --- | --- |
| 登录管理端 | 是 | 是 | 是 | 是 |
| 创建团队 | 是（普通用户能力） | 是 | 是 | 是 |
| 管理团队成员 | 按团队角色 | 是 | 否 | 否 |
| 编辑团队信息 | 按团队角色 | 是 | 否 | 否 |
| 查看项目/接口/数据模型 | 按团队角色 | 是 | 是 | 是 |
| 创建/编辑项目 | 按团队角色 | 是 | 是 | 否 |
| 删除项目 | 按团队角色 | 是 | 否 | 否 |
| 导入 Swagger/OpenAPI/Postman | 按团队角色 | 是 | 是 | 否 |
| 导出当前项目 OpenAPI | 按团队角色 | 是 | 是 | 否 |
| 创建/编辑数据模型 | 按团队角色 | 是 | 是 | 否 |
| 删除数据模型 | 按团队角色 | 是 | 否 | 否 |
| 管理依赖关系（MVP 只读，仅由导入自动生成） | 按团队角色 | 是 | 是 | 否 |
| 管理当前项目 MCP Token | 按团队角色 | 是 | 否 | 否 |
| 查看 MCP 接入说明 | 按团队角色 | 是 | 是 | 仅 IDE 配置模板 |
| 查看 MCP 调用审计 | 按团队角色 | 是 | 是 | 否 |

8. 非功能需求

   8.1 性能

   MVP 性能目标以以下规模为基准：

- 20 个项目。
- 1000 个实体。
- 5000 条依赖关系。
- 单个 OpenAPI 文档不超过 5 MB。

   性能指标：

- MCP 单次普通查询 P95 ≤ 500ms。
- OpenAPI 导入 5 MB 文档耗时 ≤ 10 秒。
- 依赖图加载 5000 条边耗时 ≤ 3 秒。
- Electron 管理端常规页面交互无明显卡顿。

   8.2 安全

1. 支持完全自托管部署，数据由部署方自行控制。
2. 禁止匿名访问管理端 API。
3. Electron 管理端访问管理类 REST API 使用 JWT 鉴权。
4. 本地 MCP 服务使用 MCPConfig.Token 鉴权，并仅可调用后端 MCP Token 校验和规范查询专用 REST 端点。
5. CLI、Git Hook 和 CI 访问 REST 校验/导入端点时使用 JWT 或专用 REST Token。
6. 管理端 Token 不应明文存储。
7. 所有修改操作记录操作人、时间和操作摘要。

   8.3 兼容性

1. MVP 兼容 OpenAPI 3.x。
2. JSON Schema 兼容 OpenAPI Schema Object 常用字段。
3. IDE 集成目标：Cursor、PyCharm、VSCode、WebStorm。
4. AI 工具集成目标：Cursor AI、GitHub Codex、GitHub Copilot、JetBrains AI。

9. 部署步骤

1. 服务器安装 Docker 与 Docker Compose。
2. 拉取 synkord 仓库，在后端部署目录执行 `docker compose up -d` 启动 synkord-core。
3. 初始化管理员账号、JWT Secret 和数据库路径。
4. 安装 Electron 管理端。
5. 首次启动管理端，配置 synkord-core 服务地址。
6. 登录管理端；如果当前用户没有团队，先创建团队。
7. 进入团队后创建项目；进入项目详情后导入 Swagger/OpenAPI 或 Postman Collection、维护数据模型、查看依赖拓扑，并在 MCP Tab 中创建当前项目 MCP Token。
8. 各 IDE 或项目仓库配置 `.mcp.json`、Git Hook、CI 调用参数。

10. 验收标准

   10.1 后端与部署

1. Go 后端可通过 Docker Compose 在本地、内网服务器或私有云主机启动。
2. `/health` 返回正常状态（含数据库可用性）。
3. 管理类 REST API 需要登录后访问，未登录请求返回 401。
4. 本地 MCP 服务能通过 Token 鉴权调用工具。

   10.2 管理端

1. Electron 管理端可配置后端地址并登录。
2. 首次登录且无团队时，管理端进入创建团队引导页。
3. 管理端可创建团队，并在“我的团队”之间切换。
4. 每个团队只展示项目管理和团队管理；接口管理、数据模型、依赖拓扑和 MCP 管理必须在进入项目后展示。
5. 管理端可创建后端、Web、App 三类项目。
6. 管理端可导入 Swagger/OpenAPI 文档和 Postman Collection 并展示接口列表。
7. 管理端可在项目详情中创建项目数据模型并查看版本历史。
8. 管理端可查看接口与数据模型形成的依赖关系。
9. 管理端可通过后端 REST 创建当前项目 MCP 接入配置和 Token，并生成 IDE 配置模板。

   10.3 OpenAPI 与依赖

1. 导入包含 `$ref` 的 OpenAPI 后，系统能自动识别实体引用关系。
2. Web/App 项目可手动声明依赖某个后端服务的 API 或实体。
3. 查询某个实体时，系统能返回引用它的项目列表。

   10.4 MCP 集成

1. Cursor、VSCode、PyCharm 至少一种 IDE 能通过 `.mcp.json` 调用 MCP 工具。
2. `get_project_entities` 能返回当前项目的数据模型。
3. `get_project_apis` 能返回当前项目 API。
4. `validate_entity_usage` 能返回校验结果和错误说明。

11. 后续增强方向

1. SDK 生成。
2. 代码仓库扫描与实体引用识别。
3. Mock 服务。
4. 接口评审和审批流。
5. 自动生成迁移建议。
6. Electron 自动更新。
7. PostgreSQL 高并发部署模式。
