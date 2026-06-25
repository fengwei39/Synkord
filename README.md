Synkord 内网 MCP 规范协同平台需求文档

1. 项目概述

   1.1 背景

   当前团队存在多项目、多角色、多 IDE、多 AI 工具协同开发场景：

- 项目架构：包含多个后端 Server 微服务、Web 前端、App 移动端项目，服务间存在大量数据实体、API 接口和跨项目依赖关系。
- 人员分工：开发人员 B 负责后端 Server 与 Web 项目，主要使用 PyCharm、VSCode、Codex、Copilot；开发人员 A 负责 App 项目，主要使用 Cursor AI。
- 核心痛点：原有 YApi 长期停更，不支持 OpenAPI 3.x、MCP、跨服务实体依赖校验和主动变更通知，导致实体定义分散、AI 生成代码不统一、接口兼容风险高、协同同步成本高。
- 环境要求：全程内网私有化部署，数据不出内网，优先采用零付费开源技术栈。

   1.2 建设目标

   Synkord 是一个轻量级内网 MCP 规范协同平台，用于统一管理 API、实体、依赖和变更规则，并向 IDE、AI 工具、Git Hook、CI 和桌面管理端提供一致的规范来源。

1. 统一托管所有微服务 API 接口、全局数据实体、服务私有实体、枚举、分页模型和统一返回体。
2. 通过 MCP Server 为 IDE、AI 编码助手、Git Hook、CI 提供统一规范消费接口。
3. 通过 REST API 为 Electron 管理端提供登录、管理、检索、变更检测和配置能力。
4. 后端修改 API 或数据实体后，自动识别破坏性变更，定位影响范围，并主动通知相关前端/App 开发人员。
5. 构建“AI 前置提示 + MCP 规范查询 + Git Hook/CI 兜底拦截 + 变更主动通知”的规范闭环。

   1.3 边界说明

- MCP Server 是 IDE、AI 工具、Git Hook、CI 的统一规范消费接口。
- REST API 是 Electron 管理端的管理接口，不作为 AI/IDE 集成入口。
- MCP 不能天然强制 AI 输出正确代码，强约束依赖 Git Hook、CI 和规则校验共同完成。
- MVP 阶段优先支持 OpenAPI 3.x 与 JSON Schema，不覆盖 Swagger 2.0、GraphQL、gRPC 和私有 RPC 协议。

   1.4 适用范围

- 项目：后端微服务、Web 前端、App 移动端项目。
- 人员：后端、Web、App、测试、架构或技术负责人。
- 约束对象：API 接口规范、全局实体、服务实体、跨项目依赖关系、接口兼容性、实体版本锁定。

2. MVP 范围

   2.1 第一阶段必须交付

1. Go 后端服务 synkord-core。
2. Electron 管理端。
3. 账号登录、JWT 鉴权、RBAC 权限控制。
4. 项目管理：后端服务、Web 项目、App 项目。
5. API 管理：OpenAPI 3.x 导入、解析、展示、导出。
6. 实体管理：全局实体、服务私有实体、JSON Schema 存储、版本快照。
7. 依赖管理：基于 OpenAPI `$ref` 自动识别依赖，支持手动维护依赖。
8. 变更检测：对比新旧 OpenAPI/JSON Schema，识别 info、warning、breaking 三类变更。
9. MCP Server：提供规范查询、依赖查询、变更检测、代码片段校验能力。
10. Webhook 通知：支持钉钉/飞书机器人通知破坏性变更。
11. Docker Compose 部署后端，Electron 客户端连接内网后端。

   2.2 第一阶段暂不交付

1. 自动生成 SDK。
2. 代码仓库全量扫描。
3. GraphQL、gRPC、Swagger 2.0 兼容。
4. 在线 Mock 服务。
5. 多租户 SaaS。
6. 自动更新 Electron 客户端。
7. 复杂审批流。

3. 技术栈与部署需求

1. 后端：Go 1.25+、Gin、GORM、SQLite、PostgreSQL 可选扩展、mark3labs mcp-go。
2. 前端：Electron、React 18、Ant Design 5、Vite、TypeScript。
3. 部署方式：后端通过 Docker Compose 部署在内网服务器；Electron 管理端在内网桌面机器安装运行。
4. 基础环境：
   - 后端：内网 Linux 服务器，最低 2 核 4G。
   - 管理端：Windows、macOS、Linux 桌面环境。
5. 数据存储：
   - MVP 默认 SQLite 单文件存储。
   - 团队规模扩大后可切换 PostgreSQL。
6. 网络要求：
   - 全程内网访问。
   - 后端暴露 REST API 与 MCP Server。
   - Electron 客户端支持配置 synkord-core 内网地址。

4. 技术架构

   synkord-core 采用 Go 单体分层架构，同时提供 REST API 与 MCP Server。Electron 管理端通过 REST API 管理平台数据；IDE、AI 工具、Git Hook、CI 通过 MCP Server 消费规范约束。

   ```
                       ┌──────────────────────────────────────┐
                       │           synkord-core (Go)          │
                       │                                      │
     Cursor ──────────▶│  ┌────────────────────────────────┐ │
     VSCode+Codex ────▶│  │        MCP Server (核心)        │ │
     PyCharm+Copilot ─▶│  │                                │ │
                       │  │  get_global_entities            │ │
     CI Pipeline ─────▶│  │  get_service_entities           │ │
     Git Hook ────────▶│  │  get_entity_dependencies        │ │
                       │  │  detect_breaking_changes        │ │
                       │  │  validate_entity_usage          │ │
                       │  └───────────────┬────────────────┘ │
                       │                  │                  │
     Electron 管理端 ─▶│  ┌───────────────┴────────────────┐ │
                       │  │          REST API (Gin)         │ │
                       │  └───────────────┬────────────────┘ │
                       │                  │                  │
                       │  ┌───────────────┴────────────────┐ │
                       │  │          核心引擎               │ │
                       │  │                                │ │
                       │  │  OpenAPI Store                  │ │
                       │  │  Entity Store (JSON Schema)     │ │
                       │  │  Dependency Graph               │ │
                       │  │  Diff Engine                    │ │
                       │  │  Validation Engine              │ │
                       │  │  Notify Service (Webhook)       │ │
                       │  └────────────────────────────────┘ │
                       │                                      │
                       │  存储: SQLite (MVP) / PG (扩展)      │
                       └──────────────────────────────────────┘
   ```

5. 核心数据对象

   5.1 Project

   表示一个团队项目。

- 项目类型：backend、web、app。
- 字段：名称、描述、项目类型、负责人、仓库地址、OpenAPI 版本、创建时间、更新时间。
- 后端服务项目可维护 API 与私有实体。
- Web/App 项目可声明对后端服务 API 与实体的依赖。

   5.2 API

   API 是替代 YApi 的核心资产，不能只作为 OpenAPI 文本附件存在。

- 字段：项目、路径、方法、标签、摘要、描述、请求参数、请求体、响应体、状态码、鉴权要求、废弃状态、版本。
- 来源：OpenAPI 3.x 导入、手动创建、后续版本更新。
- 能力：列表检索、详情查看、按项目/标签过滤、导出 OpenAPI。

   5.3 Entity

   表示 JSON Schema/OpenAPI Schema Object。

- 类型：global、service。
- 字段：名称、描述、JSON Schema、当前版本、所属项目、创建人、更新时间。
- 全局实体用于统一返回体、分页模型、基础字段、公共枚举。
- 服务实体用于服务私有 DTO、VO、请求体、响应体。

   5.4 Dependency

   表示项目、API、实体之间的依赖关系。

- 自动来源：解析 OpenAPI `$ref`。
- 手动来源：管理端手动创建依赖。
- 字段：依赖方项目、被依赖项目、实体/API 名称、锁定版本、来源、创建时间。

   5.5 ChangeSet

   表示一次 API 或实体变更检测结果。

- 字段：服务、旧版本、新版本、变更人、变更时间、变更清单、影响项目、严重级别、通知状态。
- 严重级别：info、warning、breaking。

6. 功能需求

   6.1 项目与实体分层管理

1. 支持创建后端服务、Web 项目、App 项目。
2. 支持全局公共模型库，统一维护返回体、分页 DTO、公共枚举、基础字段。
3. 支持每个后端服务维护私有 API 与私有实体。
4. 支持 Web/App 项目声明引用的后端 API 和实体。
5. 支持实体版本快照，修改实体后自动生成新版本。
6. 支持消费方锁定实体主版本，避免意外升级。

   6.2 OpenAPI 管理

1. 支持导入 OpenAPI 3.x JSON/YAML。
2. 导入后自动解析 API 路径、HTTP 方法、请求参数、请求体、响应体、Schema、`$ref` 依赖。
3. 支持按项目、标签、路径、方法搜索 API。
4. 支持查看 API 详情，包括请求参数、响应结构、引用实体。
5. 支持导出项目当前 OpenAPI 规范。
6. OpenAPI 解析失败时需要返回明确错误位置和原因。

   6.3 MCP 服务能力

   后端部署完成后默认启用内网 MCP 服务，对外暴露以下 MVP 工具：

- `get_global_entities`：获取全局公共实体定义。
- `get_service_entities`：获取指定服务的私有实体及引用的公共实体。
- `get_project_apis`：获取指定项目的 API 列表与详情。
- `get_entity_dependencies`：查询实体被哪些项目引用。
- `get_api_dependencies`：查询 API 被哪些项目引用。
- `detect_breaking_changes`：对比新旧 OpenAPI/JSON Schema，输出字段级变更清单和影响范围。
- `validate_entity_usage`：校验代码片段中的实体使用是否符合平台规范。

   MCP 工具需要 Token 鉴权。Git Hook 和 CI 使用独立 Token，便于审计和权限控制。

   6.4 破坏性变更检测

   变更结果分为三类：

- info：兼容变更，仅记录，不通知。
- warning：可能影响消费者，记录并可选通知。
- breaking：破坏性变更，必须通知并可被 Git Hook/CI 拦截。

   MVP 判定规则：

1. 删除请求字段：breaking。
2. 新增请求必填字段：breaking。
3. 修改请求字段类型：breaking。
4. 删除响应字段：breaking。
5. 修改响应字段类型：breaking。
6. 新增响应字段：info。
7. 可选字段变必填：breaking。
8. 必填字段变可选：info。
9. 删除枚举值：breaking。
10. 新增枚举值：warning，若字段声明为严格枚举消费模式则 breaking。
11. 重命名字段：breaking。
12. 接口路径或 HTTP 方法变更：breaking。
13. 新增接口：info。
14. 删除接口：breaking。
15. 标记 deprecated：warning。

   6.5 自动变更通知

1. 支持配置钉钉/飞书 Webhook。
2. breaking 变更必须通知。
3. warning 变更支持按项目配置是否通知。
4. info 变更默认只记录。
5. 通知内容包括：变更人、服务、版本、变更类型、变更路径、影响项目、建议处理动作。
6. 通知失败需要记录失败原因，支持手动重试。

   6.6 Git Hook 与 CI 兜底校验

1. Git Pre-Commit 可调用 MCP 服务校验本地变更。
2. CI 可调用 MCP 服务做全量校验。
3. MCP 不可用时，Git Hook 使用本地缓存降级校验，并记录审计日志。
4. Git Hook 默认超时 3 秒，超时策略可配置为 warn 或 block。
5. CI 默认不允许降级，MCP 不可用时失败。

   6.7 Electron 管理端

1. 首次启动支持配置 synkord-core 地址。
2. 支持账号密码登录，保存登录态。
3. Token 需要存储在系统安全存储能力中，避免明文落盘。
4. 支持项目管理、API 管理、实体管理、依赖拓扑、变更检测、系统设置。
5. 支持切换后端地址，用于连接不同内网环境。
6. 支持显示后端健康状态、MCP 服务状态、当前登录用户和权限。
7. MVP 不要求自动更新，安装包通过内网手动分发。

7. 权限模型

| 能力 | 管理员 | 编辑者 | 只读者 |
| --- | --- | --- | --- |
| 登录管理端 | 是 | 是 | 是 |
| 查看项目/API/实体 | 是 | 是 | 是 |
| 创建/编辑项目 | 是 | 是 | 否 |
| 删除项目 | 是 | 否 | 否 |
| 导入/导出 OpenAPI | 是 | 是 | 导出 |
| 创建/编辑实体 | 是 | 是 | 否 |
| 删除实体 | 是 | 否 | 否 |
| 管理依赖关系 | 是 | 是 | 否 |
| 执行变更检测 | 是 | 是 | 是 |
| 配置 Webhook | 是 | 否 | 否 |
| 管理用户与角色 | 是 | 否 | 否 |
| 管理 MCP Token | 是 | 否 | 否 |

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

1. 全内网部署，数据不对外暴露。
2. 禁止匿名访问管理端 API。
3. REST API 使用 JWT 鉴权。
4. MCP Server 使用 Token 鉴权。
5. 管理端 Token 不应明文存储。
6. 所有修改操作记录操作人、时间和变更摘要。

   8.3 兼容性

1. MVP 兼容 OpenAPI 3.x。
2. JSON Schema 兼容 OpenAPI Schema Object 常用字段。
3. IDE 集成目标：Cursor、PyCharm、VSCode、WebStorm。
4. AI 工具集成目标：Cursor AI、GitHub Codex、GitHub Copilot、JetBrains AI。

9. 部署步骤

1. 服务器安装 Docker 与 Docker Compose。
2. 拉取 synkord 仓库，在后端部署目录执行 `docker compose up -d` 启动 synkord-core。
3. 初始化管理员账号、JWT Secret、MCP Token、数据库路径。
4. 在内网机器安装 Electron 管理端。
5. 首次启动管理端，配置 synkord-core 内网地址。
6. 登录管理端，创建项目、导入 OpenAPI、维护全局实体。
7. 配置钉钉/飞书 Webhook。
8. 各 IDE 或项目仓库配置 `.mcp.json`、Git Hook、CI 调用参数。

10. 验收标准

   10.1 后端与部署

1. Go 后端可通过 Docker Compose 在内网服务器启动。
2. `/health` 返回正常状态。
3. REST API 需要登录后访问，未登录请求返回 401。
4. MCP Server 能通过 Token 鉴权调用工具。

   10.2 管理端

1. Electron 管理端可配置后端地址并登录。
2. 管理端可创建后端、Web、App 三类项目。
3. 管理端可导入 OpenAPI 3.x 文档并展示 API 列表。
4. 管理端可创建全局实体和服务实体。
5. 管理端可查看实体版本历史。
6. 管理端可查看依赖拓扑。

   10.3 OpenAPI 与依赖

1. 导入包含 `$ref` 的 OpenAPI 后，系统能自动识别实体引用关系。
2. Web/App 项目可手动声明依赖某个后端服务的 API 或实体。
3. 查询某个实体时，系统能返回引用它的项目列表。

   10.4 变更检测

1. 删除响应字段时，检测结果为 breaking。
2. 新增响应字段时，检测结果为 info。
3. 新增请求必填字段时，检测结果为 breaking。
4. 删除枚举值时，检测结果为 breaking。
5. 标记接口 deprecated 时，检测结果为 warning。
6. breaking 结果包含影响项目列表。

   10.5 通知与拦截

1. breaking 变更触发钉钉/飞书通知。
2. 通知内容包含变更人、服务、版本、变更清单、影响项目。
3. Git Hook 在检测到 breaking 变更时可阻断提交。
4. CI 在检测到 breaking 变更时可阻断合并。

   10.6 MCP 集成

1. Cursor、VSCode、PyCharm 至少一种 IDE 能通过 `.mcp.json` 调用 MCP 工具。
2. `get_global_entities` 能返回全局实体。
3. `get_project_apis` 能返回项目 API。
4. `detect_breaking_changes` 能返回字段级变更清单。
5. `validate_entity_usage` 能返回校验结果和错误说明。

11. 后续增强方向

1. SDK 生成。
2. 代码仓库扫描与实体引用识别。
3. Mock 服务。
4. 接口评审和审批流。
5. 自动生成迁移建议。
6. Electron 自动更新。
7. PostgreSQL 高并发部署模式。
