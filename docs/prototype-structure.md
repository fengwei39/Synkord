# Synkord 原型结构与页面关系文档

本文档用于后续重构当前项目，约定 Synkord 的页面层级、菜单关系、入口逻辑、核心页面模块和交互边界。后续以前端代码、需求文档和本文档作为主要依据推进。

## 1. 产品信息架构

Synkord 是开源、自托管的 MCP 规范协同平台。当前阶段的产品层级如下：

```text
Synkord
├─ 启动链路
│  ├─ 后端连接配置
│  └─ 登录
└─ 当前团队（顶部下拉选择器切换）
   ├─ 项目管理
   │  ├─ 项目列表
   │  └─ 项目详情
   │     ├─ 项目信息（含仓库地址）
   │     ├─ 接口管理
   │     ├─ 数据模型
   │     ├─ 依赖拓扑（只读）
   │     └─ MCP
   └─ 团队管理
      ├─ 团队信息
      └─ 成员与权限
```

核心原则：

- 产品只保留”我的团队”，团队是最高业务容器和数据隔离边界。
- 团队层只提供”项目管理”和”团队管理”两个业务入口。
- 接口管理、数据模型、依赖拓扑和 MCP 管理必须进入具体项目后使用。
- 当前阶段不设计变更检测、变更记录、变更通知或 Webhook 通知模块。
- 用户首次登录后如果没有团队，必须先创建团队。
- 后端连接配置属于客户端本地配置（运行期不切换），不是登录后的全局业务设置。
- MCP 配置只存在于当前项目上下文内；Electron 同一时间只激活一个团队和一个项目。
- **没有”工作台”或”我的团队卡片”页面**：团队选择统一在顶部下拉选择器；多团队时按列表顺序默认进入第一个。
- **不保留”最近访问团队”功能**：不存在团队切换接口。

## 2. 全局入口逻辑

### 2.1 首次启动

```text
启动 Electron
↓
检查是否配置 synkord-core 后端地址
↓
未配置：进入后端连接配置页
已配置：检查登录态
↓
未登录：进入登录页
已登录：检查是否已有团队
↓
无团队：进入创建团队引导页（/teams/new）
有团队：进入列表中第一个团队的项目列表（/projects）
```

### 2.2 新用户首次进入

```text
配置后端地址
↓
登录
↓
无团队
↓
创建团队
↓
进入当前团队的项目列表
```

### 2.3 老用户正常进入

```text
启动客户端
↓
检查后端地址
↓
检查登录态
↓
进入列表中第一个团队的项目列表
```

### 2.4 团队切换（顶部下拉选择器）

```text
点击顶部团队下拉选择其他团队
↓
切换 currentTeamId
↓
清空 currentProjectId
↓
清空 Electron 当前激活 MCP 项目
↓
如果当前在项目内页面（/projects/:projectId/...）则跳转到 /projects
否则刷新团队成员、团队信息等团队级数据
```

切换团队后只刷新：

- 项目列表。
- 团队信息。
- 团队成员与权限。
- Electron 当前激活 MCP 上下文，已激活项目清空。

### 2.5 团队入口规则

- 登录后如果用户没有任何团队，只显示创建团队引导页。
- 创建团队成功后，创建者自动成为该团队管理员，并进入项目列表。
- 多团队时默认进入列表中第一个团队；切换通过顶部下拉选择器完成。
- 团队菜单只显示项目管理和团队管理。
- 未进入项目时，不显示接口管理、数据模型、依赖拓扑和 MCP 页面。
- 顶部下拉以外不再有团队列表入口；不存在"工作台"或"我的团队"独立页面。

## 3. 全局布局

### 3.1 顶部导航

用途：承载产品入口、团队下拉选择器、当前激活项目、本地 MCP 服务状态和用户入口。

组件：

- Synkord Logo / 产品名。
- 团队下拉选择器（**唯一的团队切换入口**）。
- 当前激活项目提示。
- 本地 MCP 服务状态。
- 当前用户头像 / 用户菜单。
- Electron 窗口控制按钮。

字段：

- 当前团队名称。
- 当前激活项目名称；未进入项目时显示未激活。
- 本地 MCP 服务状态：运行中 / 已停止 / 未配置 / 异常。
- 当前登录用户。

交互：

- 点击 Logo 回到当前团队的项目列表（`/projects`）。
- 通过团队下拉选择器切换团队；切换后清空 `currentProjectId` 并清空 Electron 当前激活 MCP 项目。
- 点击本地 MCP 服务状态查看本机服务状态、端点、日志和启动操作。
- 点击用户头像展开个人信息、退出登录。点击"退出登录"后清空登录态、`currentTeamId`、`currentProjectId`、Electron 当前激活 MCP 项目，跳转到 `/login`。
- 后端 401 响应统一拦截：清空登录态与上文所有上下文，跳到 `/login` 并保留 `?redirect=` 用于登录后回跳。

### 3.2 侧边菜单

菜单结构：

```text
左侧菜单（当前团队）
├─ 项目管理
└─ 团队管理
   ├─ 团队信息
   └─ 成员与权限
```

菜单关系：

| 菜单 | 跳转页面 | 依赖上下文 |
| --- | --- | --- |
| 项目管理 | 项目列表 | 当前团队 |
| 团队信息 | 团队信息编辑 | 当前团队，团队管理员 |
| 成员与权限 | 成员与权限 | 当前团队，团队管理员 |

交互：

- 团队选择**不在**侧边菜单展示，统一在顶部下拉选择器。
- 点击项目管理进入项目列表。
- 点击团队信息进入团队信息编辑。
- 点击成员与权限进入团队成员管理。
- 当前菜单高亮。
- 无权限菜单隐藏或置灰。

## 4. 页面清单

推荐页面清单：

```text
01 启动链路
   01-01 后端连接配置
   01-02 登录
02 当前团队
   02-01 项目列表
   02-02 项目详情
   02-03 团队信息
   02-04 创建团队引导
   02-05 成员与权限
03 项目详情
   03-01 项目信息（含仓库地址）
   03-02 接口管理
   03-03 接口详情
   03-04 Swagger / OpenAPI / Postman 导入
   03-05 导入结果
   03-06 数据模型
   03-07 数据模型详情
   03-08 依赖拓扑（只读）
   03-09 MCP
```

### 4.1 创建团队引导

出现条件：

- 用户首次登录后没有任何团队。
- 用户退出或删除最后一个可访问团队后。

页面模块：

```text
创建团队引导
├─ 标题与说明
├─ 创建团队表单
│  ├─ 团队名称
│  └─ 团队描述
└─ 创建按钮
```

交互：

- 点击创建按钮触发表单校验。
- 创建成功后，创建者自动成为团队管理员。
- 创建成功后设置为当前团队并进入项目列表。
- 创建失败时保留表单内容并展示错误信息。

### 4.2 项目管理

页面结构：

```text
项目管理
├─ 项目列表（/projects）
│  ├─ 搜索筛选
│  ├─ 项目表格 / 卡片
│  ├─ 新建项目（弹窗）
│  └─ 分页
└─ 项目详情（/projects/:projectId）
   ├─ 项目信息（含仓库地址编辑，默认 Tab）
   ├─ 接口管理（/projects/:projectId/apis）
   ├─ 数据模型（/projects/:projectId/models）
   ├─ 依赖拓扑（/projects/:projectId/dependencies，只读）
   └─ MCP（/projects/:projectId/mcp）
```

项目类型：

- 后端服务。
- Web 项目。
- App 项目。

入口关系：

| 来源 | 操作 | 去向 |
| --- | --- | --- |
| 侧边菜单 | 点击项目管理 | 项目列表 `/projects` |
| 项目列表 | 点击项目名称 / 点击行 | 项目详情 `/projects/:projectId`（默认展示项目信息 Tab） |
| 项目列表 | 新建项目 | 新建项目弹窗，**创建成功后跳转到 `/projects/:newId`** |
| 项目详情 | 打开接口管理 | `/projects/:projectId/apis` |
| 项目详情 | 打开数据模型 | `/projects/:projectId/models` |
| 项目详情 | 打开依赖拓扑 | `/projects/:projectId/dependencies` |
| 项目详情 | 打开 MCP | `/projects/:projectId/mcp` |

页面状态：

- **loading**：骨架屏占位（卡片 / 表格骨架）。
- **empty**：当前团队尚无项目时，居中提示"还没有项目，点击下方按钮创建第一个项目"，主 CTA 为"新建项目"按钮。
- **error**：网络或权限错误时显示错误信息和"重试"按钮。
- **search empty**：搜索无结果时显示"未找到匹配项目"和"清空筛选"按钮。

`currentProjectId` 规则：

- 进入项目详情任一子路由时显式设置 `currentProjectId`；离开项目详情（包括切换 Tab、跳到团队级页面、切换团队）时清空。
- URL `:projectId` 与 context `currentProjectId` 必须一致；不一致时以 URL 为准并回写。
- **跨项目跳转必须二次确认**：从项目 A 的子页跳到项目 B 的项目详情（如接口详情点击"被项目 B 引用"），弹确认框，确认后才更新 `currentProjectId` 并跳转；取消则保留来源项目上下文。

### 4.3 项目内接口管理

页面结构：

```text
项目详情（/projects/:projectId）
└─ 接口管理（/projects/:projectId/apis）
   ├─ 搜索筛选
   ├─ 方法筛选
   ├─ 标签筛选
   ├─ 导入 Swagger / OpenAPI
   ├─ 导入 Postman
   ├─ 接口表格
   ├─ 接口详情（/projects/:projectId/apis/:apiId）
   └─ 导入结果（/projects/:projectId/apis/import/result）
```

入口关系：

| 来源 | 操作 | 去向 |
| --- | --- | --- |
| 项目详情 | 打开接口管理 | `/projects/:projectId/apis` |
| 接口列表 | 点击接口 | `/projects/:projectId/apis/:apiId` |
| 接口详情 | 点击引用模型 | `/projects/:projectId/models/:modelId`（同项目，不弹确认） |
| 接口详情 | 点击依赖项目（同项目） | 跳转到该 API 所在项目详情（**跨项目则弹确认**） |
| 导入结果 | 查看依赖关系 | `/projects/:projectId/dependencies` |
| 接口详情 | 返回 | 回到 `/projects/:projectId/apis`（接口列表，不回到项目详情默认 Tab） |

接口管理只能展示当前项目数据，不提供团队级接口列表。

### 4.4 项目内数据模型

页面结构：

```text
项目详情（/projects/:projectId）
└─ 数据模型（/projects/:projectId/models）
   ├─ 搜索筛选
   ├─ 类型筛选
   ├─ 新建模型
   ├─ 模型表格
   └─ 模型详情（/projects/:projectId/models/:modelId）
      ├─ 字段定义
      ├─ 版本快照
      ├─ 被哪些接口引用
      └─ 被哪些项目依赖
```

模型类型：

- DTO。
- VO。
- Enum。
- Page。
- Result。
- Request。
- Response。

入口关系：

| 来源 | 操作 | 去向 |
| --- | --- | --- |
| 项目详情 | 打开数据模型 | `/projects/:projectId/models` |
| 模型列表 | 点击模型名称 | `/projects/:projectId/models/:modelId` |
| 接口详情 | 点击引用模型 | `/projects/:projectId/models/:modelId` |
| 模型详情 | 查看引用接口 | `/projects/:projectId/apis/:apiId`（同项目，不弹确认） |
| 模型详情 | 查看依赖项目 | 跳转到对应项目详情（**跨项目则弹确认**） |
| 模型详情 | 查看拓扑 | `/projects/:projectId/dependencies` |
| 模型详情 | 返回 | 回到 `/projects/:projectId/models`（模型列表，不回到项目详情默认 Tab） |

### 4.5 项目 MCP 管理

用途：作为项目详情中的 MCP 能力页，管理当前项目如何通过本机唯一 MCP 服务暴露给 IDE/Agent。用户打开哪个项目，IDE 连接 Synkord MCP 时就读取哪个项目的规范。

独立路由：`/projects/:projectId/mcp`。

页面结构：

```text
项目详情（/projects/:projectId）
└─ MCP（/projects/:projectId/mcp）
   ├─ MCP 概览
   ├─ 本地服务状态
   ├─ 当前项目接入配置
   ├─ Token 管理
   ├─ 工具列表
   ├─ IDE 接入说明
   └─ 调用审计
```

MCP 页面内的子模块（新建 Token、轮换 Token、查看调用审计、复制 IDE 配置）以 Modal / Drawer / 锚点呈现，不产生新的路由。访问 `?tokenId=...` 等 query 不持久化为独立路由。

入口关系：

| 来源 | 操作 | 去向 |
| --- | --- | --- |
| 项目详情 | 打开 MCP Tab | `/projects/:projectId/mcp` |
| 项目 MCP 管理 | 设为当前 MCP 项目 | 更新本地 MCP 激活上下文（无需切换项目，跳转由 Electron 内部 IPC 处理） |
| 项目 MCP 管理 | 启动本地 MCP 服务 | 本地服务状态变为运行中 |
| 项目 MCP 管理 | 新建 Token | Token 弹窗（不产生新路由） |
| 项目 MCP 管理 | 轮换 Token | 旧 Token 立即失效 |
| 项目 MCP 管理 | 查看调用审计 | 审计记录（同页内展示） |
| 项目 MCP 管理 | 复制 IDE 配置 | IDE 接入说明（同页内展示） |

MCP 可用性设计：

- 当前设备只运行一个 Synkord 本地 MCP 服务入口。
- 本地 MCP 服务同一时间只绑定 Electron 当前打开的一个团队和一个项目。
- 打开项目详情的 MCP Tab 时，Electron 自动把该项目设为当前 MCP 激活项目。
- IDE 配置中的本地 MCP 地址保持稳定；项目切换不要求用户修改 `.mcp.json`。
- 每个项目可以创建多个 MCP Token，用于区分 Codex、Cursor、VSCode、PyCharm、JetBrains 等不同 IDE/Agent。
- Token 只能访问创建它的项目，不能跨团队或跨项目使用。

MCP 配置字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| name | 文本 | 配置名称，例如 Cursor 开发环境 |
| purpose | 文本 | 用途说明 |
| token_preview | 字符串 | Token 摘要或前缀，**仅**创建或轮换时一次性返回明文 |
| team_id | 关联字段 | 所属团队 |
| project_id | 关联字段 | 所属项目 |
| tool_scope | 多选 | 允许调用的 MCP 工具 |
| enabled | 状态 | 启用 / 停用 |
| expires_at | 时间 | 过期时间，可为空 |
| last_used_at | 时间 | 最近调用时间 |
| created_by | 用户 | 创建人 |
| created_at | 时间 | 创建时间 |
| updated_at | 时间 | 更新时间 |

MCP 访问状态规则：

| 本地 MCP 服务 | 当前项目上下文 | Token 状态 | 访问结果 |
| --- | --- | --- | --- |
| 已停止 | 任意 | 任意 | 拒绝访问 |
| 运行中 | 未激活项目 | 任意 | 拒绝访问 |
| 运行中 | 已激活项目 | 停用或过期 | 拒绝访问 |
| 运行中 | 已激活项目 | 启用且未过期 | 允许访问授权工具 |

viewer 角色"查看 MCP 接入说明"公开范围：仅 IDE 配置模板与接入步骤，不包含 Token 明文、Token 列表、工具范围、审计日志。

IDE 配置示例：

```json
{
  "mcpServers": {
    "synkord": {
      "url": "${SYNKORD_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${SYNKORD_MCP_TOKEN}"
      }
    }
  }
}
```

该配置只连接本地 MCP 服务，不表达团队或项目。团队和项目由 Electron 当前激活上下文决定。

### 4.6 项目内依赖拓扑（只读）

独立路由：`/projects/:projectId/dependencies`。

页面结构：

```text
项目详情（/projects/:projectId）
└─ 依赖拓扑（/projects/:projectId/dependencies）
   ├─ 拓扑图
   ├─ 筛选区
   │  ├─ 接口
   │  ├─ 模型
   │  └─ 依赖类型
   ├─ 节点详情
   └─ 引用关系列表
```

入口关系：

| 来源 | 操作 | 去向 |
| --- | --- | --- |
| 项目详情 | 查看依赖拓扑 | `/projects/:projectId/dependencies` |
| 接口详情 | 查看引用关系 | `/projects/:projectId/dependencies` |
| 模型详情 | 查看引用关系 | `/projects/:projectId/dependencies` |
| 依赖拓扑 | 跳转到引用项目 | 跳转到对应项目详情（**跨项目则弹确认**） |

依赖拓扑只呈现当前项目内接口、模型和跨项目引用关系，由 Swagger / OpenAPI / Postman 导入自动生成；MVP 阶段不提供手动管理入口，也不承担变更检测能力。

### 4.7 团队管理

页面结构：

```text
团队管理
├─ 团队信息
│  ├─ 团队名称
│  └─ 团队描述
└─ 成员与权限
   ├─ 搜索筛选区
   ├─ 用户表格
   ├─ 邀请 / 新增成员弹窗
   ├─ 编辑成员弹窗
   └─ 禁用 / 启用 / 删除确认框
```

入口关系：

| 来源 | 操作 | 去向 |
| --- | --- | --- |
| 侧边菜单 | 团队信息 | `/teams/:teamId`（团队信息编辑） |
| 侧边菜单 | 成员与权限 | `/members`（成员列表） |
| 团队信息页 | 返回 | `/projects`（项目列表） |
| 成员与权限页 | 返回 | `/projects`（项目列表） |
| 用户列表 | 邀请 / 新增成员 | 新增弹窗 |
| 用户列表 | 编辑成员 | 编辑弹窗 |
| 用户列表 | 禁用 / 启用 | 确认弹窗 |
| 用户列表 | 删除 | 删除确认框 |

## 5. 核心业务流

### 5.1 项目到接口 / 模型 / 依赖 / MCP

```text
项目列表（/projects）
↓
项目详情
├─ 接口管理：查看、创建、导入、导出当前项目 API
├─ 数据模型：查看、创建、编辑当前项目模型
├─ 依赖拓扑（只读）：查看当前项目接口、模型和跨项目引用关系
└─ MCP：设置当前项目为本地 MCP 激活项目并管理 Token
```

### 5.2 接口到模型

```text
接口详情
├─ 请求模型 → 模型详情
├─ 响应模型 → 模型详情
├─ 被哪些项目使用 → 项目详情
└─ 查看引用关系 → 依赖拓扑
```

### 5.3 模型到引用关系

```text
模型详情
├─ 查看引用接口 → 接口详情
├─ 查看依赖项目 → 项目详情
└─ 查看拓扑 → 依赖拓扑
```

### 5.4 导入 Swagger / OpenAPI / Postman

```text
项目详情
↓
接口管理
↓
点击导入 Swagger / OpenAPI / Postman
↓
上传文件或填写 URL
↓
解析
↓
导入预览
↓
确认导入
↓
自动生成当前项目接口、模型、依赖关系
↓
进入导入结果页
↓
可查看接口列表、模型列表或依赖拓扑
```

### 5.5 MCP 消费闭环

```text
项目详情 MCP Tab
↓
Electron 将该项目设为当前 MCP 激活项目
↓
启动或复用本机唯一 MCP 服务
↓
创建当前项目 MCP Token
↓
IDE 连接本地 MCP 服务
↓
本地 MCP 服务携带 Token + 当前团队项目上下文调用后端 /api/mcp/*
↓
IDE 获取当前项目接口、模型和依赖上下文
```

### 5.6 团队切换（顶部下拉选择器）

```text
点击顶部团队下拉
↓
选择其他团队
↓
清空 currentProjectId 与 Electron 当前激活 MCP 项目
↓
若当前在项目内页面跳转到 /projects
↓
团队级数据（项目列表、团队信息、成员）按新团队重新加载
```

## 6. 闭环核查清单

| 环节 | 输入 | 输出 | 是否闭环 |
| --- | --- | --- | --- |
| 启动与登录 | synkord-core 地址、账号密码 | 登录态、当前用户 | 是 |
| 团队上下文（顶部下拉） | 当前用户 | 当前团队、团队角色、团队菜单 | 是 |
| 团队项目管理 | 项目元数据（含仓库地址） | 团队内项目列表和项目详情 | 是 |
| 团队管理 | 团队信息、成员、角色 | 团队信息编辑与成员权限生效 | 是 |
| 项目接口管理 | Swagger / OpenAPI / Postman 或手动录入 | 当前项目接口资产 | 是 |
| 项目数据模型 | JSON Schema / OpenAPI Schema 或手动录入 | 当前项目模型资产 | 是 |
| 项目依赖拓扑 | OpenAPI `$ref` 解析 | 当前项目依赖关系（只读） | 是 |
| MCP 消费 | 当前项目 Token、工具范围 | IDE/Agent 可查询当前项目规范 | 是 |
| 权限兜底 | 平台角色、团队角色 | 菜单、按钮、接口权限控制 | 是 |

## 7. 接口数据结构建议

### 7.1 团队成员对象

```ts
{
  id: string;
  user_id: string;
  username: string;
  email: string;
  avatar?: string;
  role: 'team_admin' | 'editor' | 'viewer';
  status: 'active' | 'disabled';
  invite_status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  joined_at: string;
  last_active_at?: string;
  remark?: string;
}
```

### 7.2 项目对象

```ts
{
  id: string;
  team_id: string;
  name: string;
  description?: string;
  type: 'backend' | 'web' | 'app';
  owner_id?: string;
  repository_url?: string;
  openapi_version?: string;
  created_at: string;
  updated_at: string;
}
```

### 7.3 MCP Token 对象

```ts
{
  id: string;
  team_id: string;
  project_id: string;
  name: string;
  purpose?: string;
  token_preview: string;
  tool_scope: string[];
  enabled: boolean;
  expires_at?: string;
  last_used_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}
```

## 8. 后续重构优先级

建议按以下顺序重构：

1. 统一全局布局：顶部导航（含团队下拉选择器）、侧边菜单。
2. 补齐团队与成员模型、创建团队引导和顶部下拉切换逻辑。
3. 收敛团队菜单，只保留项目管理、团队信息、成员与权限。
4. 重构项目列表和项目详情（含仓库地址并入项目信息）。
5. 将接口管理迁入项目详情，并补齐 OpenAPI 导出。
6. 将数据模型迁入项目详情。
7. 将依赖拓扑迁入项目详情（只读）。
8. 将 MCP 管理迁入项目详情，并接入 Electron 本地 MCP 服务状态。
9. 补齐团队成员与权限。
10. 按权限模型统一控制菜单、按钮和接口访问。
11. 交付 `synkord-cli` 的 `push-spec` 与 `validate-deps` 命令。
