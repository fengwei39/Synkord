# Synkord 架构边界约定

本文档约定 Synkord 后端服务、Electron 客户端、本地 MCP 服务与 Codex 等 IDE/Agent 的职责边界。后续产品设计、接口设计和代码实现如有冲突，以本文档为准。

## 1. 总体分层

```text
┌─────────────────────────────────────────────────────────────┐
│ Backend: synkord-core                                       │
│ 登录 / 用户 / 团队 / 权限 / 项目 / 接口 / 数据模型 / 依赖 / 审计 │
│ REST API: /api/*                                            │
└───────────────────────────▲─────────────────────────────────┘
                            │ REST
                            │
┌───────────────────────────┴─────────────────────────────────┐
│ Electron 客户端                                               │
│ 桌面 UI / 后端连接配置 / 当前团队项目上下文 / 本地 MCP 服务管理 │
└───────────────────────────▲─────────────────────────────────┘
                            │ 启动、停止、配置、监控
                            │
┌───────────────────────────┴─────────────────────────────────┐
│ Local MCP Service                                            │
│ Tools / Resources / Prompts / Token 校验 / 后端 API 代理       │
└───────────────────────────▲─────────────────────────────────┘
                            │ MCP
                            │
┌───────────────────────────┴─────────────────────────────────┐
│ Codex / Cursor / VSCode / JetBrains 等 IDE 或 Agent            │
│ MCP Client                                                    │
└─────────────────────────────────────────────────────────────┘
```

## 2. 后端服务边界

后端服务是业务事实来源，负责账号体系、团队资产和权限规则。

后端负责：

- 登录、注册、JWT 鉴权、会话和当前用户信息。
- 用户、团队、团队成员、角色和权限。
- 项目、接口、数据模型、依赖关系和审计数据。
- 项目级 MCP 配置、Token 摘要或哈希、工具范围和审计数据。
- 团队级业务只保留项目管理、团队信息、成员与权限；接口、数据模型、依赖拓扑和 MCP 配置全部归属项目详情。
- 依赖关系只由 Swagger / OpenAPI / Postman 导入自动生成；MVP 阶段不提供手动管理端点。
- 为 Electron 客户端、`synkord-cli`、CI、Git Hook 和本地 MCP 服务提供 REST API。
- 提供 `GET /health` 健康检查端点（含数据库可用性），供部署与监控使用。

后端不负责：

- 直接启动、停止或监控用户机器上的 MCP 服务进程。
- 直接修改 Codex、Cursor、VSCode、JetBrains 等 IDE 的本地配置文件。
- 直接作为桌面端的本地进程管家。
- 维护团队级的"统一返回体/分页模型/公共枚举"等独立模型库——这些模型通过项目内数据模型承载。

## 3. Electron 客户端边界

Electron 客户端是桌面管理端，也是本机 MCP 运行环境的管家。

Electron 负责：

- 首次启动时配置和保存 synkord-core 后端地址；MVP 阶段**不提供运行期切换后端地址**的能力。
- 提供登录、团队下拉切换、项目管理、团队信息、成员与权限，以及项目内接口、数据模型、依赖拓扑（只读）、MCP 管理等 UI。
- 通过 REST API 读取和修改后端业务数据。
- 启动、停止、重启、配置和监控唯一的本地 MCP 服务。
- 将当前打开的团队和项目设置为本地 MCP 服务的激活上下文；切换团队时清空当前激活 MCP 项目。
- 管理本地 MCP 服务运行参数，例如端口、环境变量、日志位置和自动启动策略。
- 根据当前激活团队、当前激活项目和后端返回的 MCP 配置生成 IDE 接入说明和配置模板。

Electron 不负责：

- 承担后端账号、团队、权限、审计等核心业务逻辑。
- 让 IDE/Agent 直接调用 Electron 内部接口。
- 绕过后端权限规则直接向 MCP 服务授予团队数据访问权。
- 维护独立的"工作台"或"我的团队"页面，团队选择统一在顶部下拉选择器。

## 4. 本地 MCP 服务边界

本地 MCP 服务是暴露给 Codex 等 IDE/Agent 的能力层。它由 Electron 管理生命周期，由 IDE/Agent 通过 MCP 协议连接。同一台设备上只运行一个 Synkord 本地 MCP 服务实例；该实例同一时间只服务 Electron 当前激活的一个团队和一个项目。

上下文传递机制（Electron → 本地 MCP 服务）：

- 启动时：Electron 通过命令行参数 `--synkord-home <path>` 把上下文目录传给本地 MCP 服务。
- 运行时：Electron 维护 `${SYNKORD_HOME}/active-context.json`，内容为 `{ team_id, project_id, synkord_core_url, updated_at }`，文件权限 `0600`。本地 MCP 服务每 5 秒轮询一次；或可选地通过 Electron 在 `127.0.0.1:<management_port>` 暴露的 `GET /context` 端点拉取（避免轮询文件 IO）。
- 该上下文是本地 MCP 服务向后端发起请求时注入 `team_id` / `project_id` 的唯一来源；IDE/Agent 不可越过本地 MCP 服务直接设置上下文。

MCP 服务负责：

- 对外提供 MCP tools、resources 和 prompts。
- 接收 Codex、Cursor、VSCode、JetBrains 等 MCP Client 的连接。
- 接收 MCP Token，并调用后端 `/api/mcp/*` 专用端点校验该 Token 是否可用于当前激活团队和项目。
- 调用后端 REST API 获取当前激活团队和项目下的接口、模型和依赖数据。
- 将后端业务数据转换为适合 IDE/Agent 消费的 MCP 结果。
- 记录或上报必要的调用审计。

MCP 服务不负责：

- 管理用户登录、团队成员、订阅、权限模型等核心业务状态。
- 直接持久化业务数据并成为事实来源。
- 替代后端 REST API 作为 Electron 管理端的数据接口。
- 选择或修改当前激活的团队或项目。

## 5. IDE/Agent 边界

Codex、Cursor、VSCode、JetBrains 等 IDE/Agent 是 MCP 消费方。

IDE/Agent 负责：

- 作为 MCP Client 连接本地 MCP 服务。
- 调用 MCP tools 查询规范、模型和依赖信息。
- 在编码、解释、生成、校验等场景中消费 MCP 返回的上下文。

IDE/Agent 不负责：

- 直接管理 Synkord 后端业务数据。
- 直接启动或停止 Synkord 后端服务。
- 直接承担团队权限判定。

## 6. 协议与凭据约定

| 调用方 | 被调用方 | 协议 | 凭据 | 用途 |
| --- | --- | --- | --- | --- |
| Electron | 后端服务 | REST `/api/auth/*`、`/api/teams/*` | JWT | 登录后管理团队、项目和业务数据 |
| Electron | 本地 MCP 服务 | 本地进程 / localhost 管理接口 | 本地授权 | 启停、配置、健康检查、日志、当前团队项目上下文 |
| 本地 MCP 服务 | 后端服务 | REST `/api/mcp/*` | MCP Token + 当前团队项目上下文 | 校验 Token、查询当前项目规范和上报审计 |
| IDE/Agent | 本地 MCP 服务 | MCP | MCP Token 或本地配置 | 消费当前激活团队和项目的 tools/resources/prompts |
| `synkord-cli` | 后端服务 | REST 校验 / 导入端点 | JWT（MVP 阶段）；专用 REST Token 后续 | 推送规范（`push-spec`）、校验依赖（`validate-deps`） |
| 部署 / 监控 | 后端服务 | REST `GET /health` | 无 | 健康检查与数据库可用性 |

MVP 阶段 `synkord-cli` 必交付 `push-spec`（后端 CI 推送 OpenAPI/Postman）与 `validate-deps`（前端 / App Git Hook 校验依赖）两个命令；CLI 走 REST，不调 MCP。

## 7. 设计原则

1. 后端是业务事实来源，Electron 是本地管家，MCP 服务是 IDE/Agent 能力适配层。
2. Electron 管理 MCP 服务生命周期，但不承载 MCP 协议本身。
3. IDE/Agent 只连接 MCP 服务，不直接依赖 Electron 内部实现。
4. MCP 服务可以调用后端 REST API，但不能绕过后端权限、团队隔离和当前激活项目上下文。
5. 团队、项目、权限、Token 和审计等数据统一以后端为准。
6. 本地 MCP 服务故障不应影响后端登录、团队管理、项目管理，以及项目内接口管理、数据模型管理和依赖拓扑。
7. 一个本地 MCP 服务同一时间只绑定一个团队和一个项目；切换团队或项目时，Electron 必须更新本地 MCP 服务的激活上下文。
