# Synkord

Synkord 是一个开源、自托管的 MCP 规范协同平台，用于统一管理团队内的项目、接口规范、数据模型、依赖关系和变更检测结果，并向 Electron 管理端、IDE、AI 编码助手、Git Hook 和 CI 提供一致的规范来源。

当前项目包含：

- `backend`：Go 后端服务 `synkord-core`，提供 REST API、鉴权、项目管理、接口管理、实体模型、依赖查询、变更检测和审计能力。
- `frontend`：Electron + React 管理端，用于团队空间、项目、接口、数据模型、MCP、依赖拓扑、变更检测和成员权限管理。
- `docs`：需求文档、原型结构和后续重构依据。

## 文档

- [需求文档](docs/requirements.md)
- [原型结构与页面关系](docs/prototype-structure.md)
- [AI 开发实施指南](docs/ai-development-guide.md)
- [架构边界约定](docs/architecture-boundaries.md)

## 技术栈

后端：

- Go
- Gin
- GORM
- SQLite，使用纯 Go 驱动，Windows 本地运行不需要 CGO/gcc

前端：

- Electron
- React
- TypeScript
- Vite
- Ant Design

本地 MCP 服务：

- 由 Electron 管理生命周期
- 可按实现阶段选用 Go + mark3labs/mcp-go 或 Node.js MCP SDK

## 本地运行

### 1. 启动后端

进入后端目录：

```powershell
cd D:\code\synkord\backend
go run .
```

后端默认使用 SQLite 本地数据库，当前驱动不依赖 CGO。Windows 下无需额外安装 gcc 或 MinGW。

默认后端地址：

```text
http://127.0.0.1:8000
```

健康检查：

```text
http://127.0.0.1:8000/health
```

首次启动会创建默认管理员：

```text
用户名：admin
密码：admin123
```

### 2. 启动前端开发服务

进入前端目录：

```powershell
cd D:\code\synkord\frontend
pnpm install
pnpm dev
```

Vite 默认地址：

```text
http://127.0.0.1:3000
```

如果本机没有全局 `pnpm`，可以先启用 Corepack：

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

### 3. 启动 Electron 客户端

保持前端开发服务运行，然后在 `frontend` 目录执行：

```powershell
pnpm electron
```

Electron 开发模式默认连接：

```text
http://127.0.0.1:3000
```

如果需要指定前端地址：

```powershell
$env:SYNKORD_DEV_URL="http://127.0.0.1:3000"
pnpm electron
```

### 4. 使用 Docker Compose 启动后端

也可以在项目根目录通过 Docker Compose 启动后端：

```powershell
cd D:\code\synkord
docker compose up --build
```

Docker 服务暴露：

```text
REST API: http://127.0.0.1:8000
```

如果 Docker 无法拉取镜像，优先确认 Docker Desktop 已启动，并检查网络或镜像源配置。

## 常用命令

后端：

```powershell
cd D:\code\synkord\backend
go test ./...
go run .
```

前端：

```powershell
cd D:\code\synkord\frontend
pnpm dev
pnpm build
pnpm electron
```

如果 `pnpm dev` 遇到端口权限问题，可以显式指定端口：

```powershell
pnpm vite --host 127.0.0.1 --port 3000
```

## 架构边界

Synkord 按职责分为四层：

- 后端服务：管理登录、用户、团队、权限、项目、接口、数据模型、变更和审计等业务能力，通过 REST API 对外提供服务。
- Electron 客户端：作为桌面管理端和本地运行环境管家，负责配置后端地址、展示管理 UI，并管理本机 MCP 服务的启动、停止、配置和状态。
- 本地 MCP 服务：对 Codex、Cursor、VSCode、JetBrains 等 IDE/Agent 暴露 MCP tools/resources/prompts，并按权限调用后端 REST API 获取规范数据。
- IDE/Agent：作为 MCP Client 连接本地 MCP 服务，不直接承担 Synkord 后端业务管理职责。

详细边界以 [架构边界约定](docs/architecture-boundaries.md) 为准。

## MCP 使用说明

Synkord 通过 Electron 管理本地 MCP 服务，并由本地 MCP 服务向 IDE/Agent 提供 MCP 入口。后续会支持：

- 本地 MCP 服务开关
- 当前激活团队和当前激活项目的 MCP 接入
- 当前 MCP 配置的工具范围授权
- Token 启用、停用、过期和重新生成

推荐模式是 Electron 在当前设备上只管理一个本地 MCP 服务入口。该入口同一时间只绑定 Electron 当前打开的一个团队和一个项目；IDE/Agent 连接这个入口时，消费的是当前激活团队和当前激活项目的规范上下文。

MCP 入口放在项目详情中：用户打开哪个项目的 MCP Tab，Electron 就将哪个项目设为当前 MCP 激活项目；IDE 配置中的本地 MCP 地址保持稳定，切换项目不需要修改 `.mcp.json`。

## 当前重构方向

后续开发以 `docs/prototype-structure.md` 为页面结构依据，优先顺序：

1. 统一全局布局和团队上下文。
2. 补齐我的团队、团队切换、团队成员权限。
3. 重构项目管理、接口管理、数据模型。
4. 完善 MCP 管理、依赖拓扑和变更检测闭环。
5. 将页面模拟数据逐步替换为后端接口。

## 许可证

当前仓库尚未添加 LICENSE 文件。正式开源发布前需要补充许可证声明。
