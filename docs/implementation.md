# Synkord 实施路线 v1.2

> 本文档约定实施阶段、文件改动清单和验收标准。详见 [requirements.md](./requirements.md) 的产品定位。

---

## 〇、本版本变更（相对 v1.1）

| 变更 | 说明 |
|---|---|
| 删除 TeamContext、TeamInfo、Members、Teams 等页面相关文件 | 团队概念删除 |
| 删除 `api/teams.ts` | 移除 |
| 新增 `/contracts/:id/members` 页面 | 成员管理 |
| 新增 ContractContext | 替代 TeamContext + ProjectContext |
| 新增 owner/editor/viewer 权限控制 | 在所有 API 调用和 UI 操作中 |

---

## 一、实施路线（8 周）

### Phase 1：路由与导航重构（W1）

**目标**：URL 全部从 `/projects` 改为 `/contracts`，MCP 升级为顶级 tab，活跃项目 chip 改为契约集切换下拉，删除团队相关路由。

**任务清单**：
- [ ] 全局替换 `/projects` → `/contracts`（包括所有页面、组件、API 调用、路由）
- [ ] 全局替换 `/teams/*` → `/mcp`（重定向）
- [ ] 全局替换独立 `/members` → `/mcp`（重定向）
- [ ] `/mcp` 升级为顶级路由；删除 `/contracts/:id/mcp` 入口
- [ ] AppLayout 顶部导航：MCP 移到第 1 位，加健康状态点
- [ ] 新增 `<ContractSwitcher>` 组件（搜索 + 列表 + 当前项）
- [ ] 删除原"切项目 confirm Modal"
- [ ] 登录后默认重定向 `/mcp`
- [ ] 添加 `ContractContext` 替代 `TeamContext` + `ProjectContext`

**验收**：
- [ ] 新用户登录直达 `/mcp`
- [ ] 切换器可搜索切换契约集，无 confirm
- [ ] 所有 `/projects` URL 永久 301 到 `/contracts`
- [ ] `/teams/*` 和 `/members` 重定向到 `/mcp`

---

### Phase 2：MCP 页面重做（W1）

**目标**：按新设计重写 `/mcp` 页面，接入真实状态数据。

**任务清单**：
- [ ] MCP 页面布局（状态卡 + 活跃契约集卡 + IDE 配置 + 快速开始 + 高级操作）
- [ ] `<McpStatusDot>` 组件（4 色 + Tooltip）
- [ ] `<useMcpStatus>` Hook（3 秒轮询）
- [ ] IDE 配置两种模式 Tab 切换（STDIO / HTTP）
- [ ] 一键复制 IDE 配置（含本地 Bearer）
- [ ] 启停按钮 + `<ConfirmModal>` confirm
- [ ] 重启按钮（无 confirm）
- [ ] 查看访问日志入口

**验收**：
- [ ] IDE 配置可一键复制到 Cursor 跑通
- [ ] 状态条准确反映 PID/端口/最近错误
- [ ] 停止 MCP 后 IDE 立即收到断开

---

### Phase 3：MCP 活跃契约集实现（W2）

**目标**：实现"用户切换活跃契约集 → MCP server 立即生效"。

**任务清单**：
- [ ] 契约集工具 `get_contract_apis` 等默认操作活跃契约集
- [ ] `synkord://active-contract` resource
- [ ] 事件推送替代轮询（切换 < 50ms 生效）
- [ ] 删除 Gateway → MCP 子进程的 active context 文件
- [ ] MCP 子进程启动时拉取活跃契约集
- [ ] 标准化错误响应（4 类 actionable 错误）
- [ ] MCP README + AI prompt 模板

**验收**：
- [ ] 任何业务工具缺活跃契约集返回 NO_ACTIVE_CONTRACT 错误
- [ ] 切换契约集后 < 50ms 生效
- [ ] MCP server 重启后能恢复活跃契约集

---

### Phase 4：Auth Gateway 抽取（W3-W4）

**目标**：把 MCP 改造成通过 Auth Gateway 访问后端，永不接触 JWT。

**任务清单**：
- [ ] `auth-manager.cjs`：持有 JWT + 自动 refresh（单飞）
- [ ] `auth-gateway.cjs`：本地 HTTP（127.0.0.1:随机端口），注入 JWT
- [ ] Connect 子进程改造为通过 Gateway 调后端
- [ ] MCP 日志脱敏（不再含 JWT）
- [ ] 审计日志（所有插件调用）
- [ ] 本地凭证文件权限 0600
- [ ] 凭证加密（可选，用用户密码派生密钥）

**验收**：
- [ ] MCP 日志全文搜索 "Bearer " 无结果
- [ ] Token 过期对 MCP 透明（自动 refresh）
- [ ] 用户登出后 MCP 子进程立即退出

---

### Phase 5：导入流程（W5-W6）

**目标**：实现 OpenAPI / Swagger 一键导入，让用户 30 秒内录入一个契约集。

**任务清单**：
- [ ] `/contracts/:id/import` 页面
- [ ] OpenAPI 3.0 / Swagger 2.0 / JSON / YAML 解析
- [ ] Swagger URL 拉取（含超时、CORS 兼容）
- [ ] Postman Collection v2.1 解析（v1.1 优先）
- [ ] 解析预览页（接口列表 + 数据模型 + 勾选）
- [ ] 智能默认排除（internal/debug/test/_）
- [ ] 错误友好（指出具体行号）

**验收**：
- [ ] 一个标准 OpenAPI 文件（30 个接口）30 秒内完成导入
- [ ] 解析失败显示具体哪行有问题
- [ ] 用户可勾选/反选要导入的接口

---

### Phase 6：成员管理 + UX 清理（W7）

**目标**：成员管理 + 通用组件 + 错误处理统一 + 死链清理。

**任务清单**：
- [ ] `/contracts/:id/members` 页面（owner 视角）
- [ ] 邀请成员 Modal（搜索用户 + 选角色）
- [ ] 修改成员角色
- [ ] 移除成员（confirm）
- [ ] 创建者保护（不可被移除/降级，UI + 后端双重保护）
- [ ] `<LoadState>` 通用组件
- [ ] 所有页面用 LoadState 替换散装 loading/error/empty
- [ ] 所有 Modal 加 `confirmLoading`
- [ ] 所有危险操作用 `<Popconfirm>` 或 `<ConfirmModal>` 替换 `window.confirm`
- [ ] 删除所有死链
- [ ] `useUnsavedGuard` Hook + 关键页面接入

**验收**：
- [ ] 全应用无 `window.confirm`
- [ ] 所有 Modal 不可双击提交
- [ ] 所有页面有 loading/error/empty 三态
- [ ] 创建者不可被移除或降级

---

### Phase 7：可访问性与文档（W8，可与 P6 并行）

**目标**：基础可访问性 + 完整文档。

**任务清单**：
- [ ] CSS 设计令牌（颜色/间距/字号）
- [ ] `:focus-visible` 全局规则
- [ ] 对比度达标（≥ 4.5:1）
- [ ] favicon
- [ ] 动态 document.title
- [ ] MCP 用户文档（5 分钟接通指南）
- [ ] MCP AI prompt 模板（给 Cursor/Codex 用户）

**验收**：
- [ ] Lighthouse Accessibility ≥ 90
- [ ] 用户从 0 到 IDE 第一次成功查询 ≤ 5 分钟

---

## 二、文件改动清单

### 2.1 新增文件

```
electron/
├── auth-manager.cjs                   Auth Manager（JWT 持有、自动 refresh）
├── auth-gateway.cjs                   Auth Gateway（本地 HTTP、注入 JWT）
└── connect.cjs                        Connect（MCP 子进程）

src/
├── pages/
│   ├── McpConsole.tsx                 MCP 主控台（重写）
│   ├── ContractList.tsx               契约集列表
│   ├── ContractDetail.tsx             契约集详情
│   ├── ContractApis.tsx               接口列表
│   ├── ContractApiDetail.tsx          接口详情
│   ├── ContractEntities.tsx           数据模型列表
│   ├── ContractEntityDetail.tsx       数据模型详情
│   ├── ContractMembers.tsx            成员管理（新增）
│   ├── ContractImport.tsx             导入页面
├── components/
│   ├── LoadState.tsx                  加载/错误/空状态
│   ├── ContractSwitcher.tsx           契约集切换下拉
│   ├── ConfirmModal.tsx               通用确认 Modal
│   ├── McpStatusDot.tsx               MCP 状态点
│   ├── EmptyState.tsx                 标准空状态
│   ├── ApiCard.tsx                    API 列表项
│   └── EntityCard.tsx                 Entity 列表项
├── hooks/
│   ├── useUnsavedGuard.ts
│   ├── useActiveContract.ts
│   ├── useMcpStatus.ts
│   └── useDebounce.ts
├── contexts/
│   └── ContractContext.tsx            替换 TeamContext + ProjectContext
├── utils/
│   ├── api-error.ts
│   ├── openapi-parser.ts
│   ├── postman-parser.ts
│   └── mcp-prompts.ts
└── types/
    ├── contract.ts
    ├── api-error.d.ts
    └── mcp.d.ts
```

### 2.2 修改文件

```
src/
├── App.tsx                            路由全面重构（含旧路由重定向）
├── components/AppLayout.tsx           顶部导航 + 切换器接入
├── api/
│   ├── client.ts                      axios 拦截器（ApiError 统一）
│   ├── auth.tsx                       用 AuthManager 替换 localStorage 操作
│   ├── mcp.ts                         重写（活跃契约集 + Gateway 集成）
│   ├── dependencies.ts                调整
│   ├── apis.ts                        路径调整
│   └── models.ts → entities.ts        文件改名 + 内容调整
└── index.css                          设计令牌化

electron/
├── main.cjs                           引入 AuthManager/Gateway；移除旧的 MCP 硬编码
├── preload.cjs                        暴露新的 IPC
└── ipc-handlers.cjs                   所有 IPC handler 注册

package.json                           electron-builder 配置
```

### 2.3 删除文件

```
src/
├── pages/Projects.tsx                 → ContractList
├── pages/ProjectDetail.tsx            → ContractDetail
├── pages/ProjectCreate.tsx            (删除，迁移为 ContractCreateModal 全局弹窗)
├── pages/Teams.tsx                    (删除)
├── pages/TeamInfo.tsx                 (删除)
├── pages/TeamCreate.tsx               (删除)
├── pages/CreateTeam.tsx               (删除)
├── pages/Members.tsx                  → 移到契约集
├── pages/MCP.tsx                      → McpConsole
├── pages/DependencyGraph.tsx          (合并到 ContractDetail)
├── utils/mcpConfig.ts                 拆分到 MCP 页面
├── api/teams.ts                       (删除)
├── api/projects.ts                    → contracts.ts
└── contexts/
    ├── TeamContext.tsx                (删除)
    └── ProjectContext.tsx             (删除)

electron/
├── local-mcp-service.cjs              → connect.cjs
├── mcp-core/                          (整体删除，迁入 connect.cjs)
└── mcp-tools/                         (整体删除，迁入 connect.cjs)
```

---

## 三、API 调用清单（按角色）

### 3.1 owner 可调用

所有 owner + editor 的权限，加上：
- `PATCH /contracts/:id`（归档、修改名称）
- `DELETE /contracts/:id`
- `POST /contracts/:id/members`（邀请成员）
- `PATCH /contracts/:id/members/:userId`（修改角色，含提升为 owner）
- `DELETE /contracts/:id/members/:userId`（移除成员）

### 3.2 editor 可调用

所有 viewer 的权限，加上：
- `POST /contracts/:id/apis`（新增接口）
- `PATCH /contracts/:id/apis/:apiId`（编辑接口）
- `DELETE /contracts/:id/apis/:apiId`（删除接口）
- `POST /contracts/:id/entities`（新增实体）
- `PATCH /contracts/:id/entities/:entityId`（编辑实体）
- `DELETE /contracts/:id/entities/:entityId`（删除实体）
- `POST /contracts/:id/import/parse`
- `POST /contracts/:id/import/commit`
- `PATCH /contracts/:id`（仅修改名称和描述）

### 3.3 viewer 可调用

只读权限：
- `GET /contracts`
- `GET /contracts/:id`
- `GET /contracts/:id/members`
- `GET /contracts/:id/apis`
- `GET /contracts/:id/apis/:apiId`
- `GET /contracts/:id/entities`
- `GET /contracts/:id/entities/:entityId`
- `GET /contracts/:id/apis/:apiId/dependencies`
- `GET /contracts/:id/entities/:entityId/dependencies`

---

## 四、执行检查清单

### 第一周（必完成）

- [ ] 全局 `/projects` → `/contracts` 替换（含 301 重定向）
- [ ] `/teams/*` 和 `/members` 重定向到 `/mcp`
- [ ] MCP tab 移到第 1 位 + 健康状态点
- [ ] `<ContractSwitcher>` 组件
- [ ] 删除原切项目 confirm Modal
- [ ] 登录后默认 `/mcp`
- [ ] 删除 `/contracts/:id/mcp` 入口
- [ ] `ContractContext` 替换 `TeamContext` + `ProjectContext`

### 第二周

- [ ] MCP 页面按规格重写
- [ ] IDE 配置两种模式 + 一键复制
- [ ] 启停/重启 + confirm
- [ ] MCP 状态点 3 秒轮询
- [ ] 业务工具默认活跃契约集
- [ ] MCP resources + 标准化错误响应
- [ ] 活跃契约集事件推送同步

### 第三、四周

- [ ] AuthManager 实现（含 refresh 单飞）
- [ ] AuthGateway 实现（仅 127.0.0.1）
- [ ] Connect 改造（通过 Gateway 调后端）
- [ ] MCP 日志脱敏
- [ ] 审计日志
- [ ] 凭证文件 0600

### 第五、六周

- [ ] `/contracts/:id/import` 页面
- [ ] OpenAPI/Swagger 解析器
- [ ] 解析预览 + 勾选
- [ ] 智能默认排除
- [ ] Postman Collection v2.1 解析

### 第七周

- [ ] `/contracts/:id/members` 页面
- [ ] 邀请成员 Modal
- [ ] 修改/移除成员
- [ ] 创建者保护
- [ ] `<LoadState>` 通用组件
- [ ] 所有 Modal 加 confirmLoading
- [ ] Popconfirm 替换 window.confirm
- [ ] 删除死链
- [ ] useUnsavedGuard

### 第八周

- [ ] CSS 设计令牌
- [ ] `:focus-visible`
- [ ] 对比度 ≥ 4.5:1
- [ ] favicon + 动态 title
- [ ] MCP 用户文档
- [ ] AI prompt 模板

---

## 五、并行工作

实施期间，以下工作可与主线并行推进：

| 工作 | 负责 | 产出 |
|---|---|---|
| MCP 使用文档 | 产品 + 技术 | 用户使用手册、AI prompt 模板 |
| 端到端测试 | 测试 | 模拟 AI 调用 MCP 的关键路径 |
| 契约集导入样例 | 数据 | 3-5 个标准 OpenAPI 样例文件（用于演示和测试） |
| 截图与录屏 | 设计 | 5 分钟接通旅程的录屏（用于文档） |

---

## 六、相关文档

- [requirements.md](./requirements.md) — 产品需求与数据模型
- [architecture.md](./architecture.md) — 技术架构与认证
- [mcp-spec.md](./mcp-spec.md) — MCP 工具、资源、错误码规格
- [ui-spec.md](./ui-spec.md) — UI/UX 规范