# Synkord

Synkord 是一个开源、自托管的 MCP 规范协同平台，用于统一管理团队内的项目、接口规范、数据模型、依赖关系和变更检测结果，并向 Electron 管理端、IDE、AI 编码助手、Git Hook 和 CI 提供一致的规范来源。

当前项目包含：

- `backend`：Go 后端服务 `synkord-core`，提供 REST API、MCP Server、鉴权、项目管理、接口管理、实体模型、依赖查询和变更检测能力。
- `frontend`：Electron + React 管理端，用于团队空间、项目、接口、数据模型、MCP、依赖拓扑、变更检测和成员权限管理。
- `docs`：需求文档、原型结构和后续重构依据。

## 文档

- [需求文档](docs/requirements.md)
- [原型结构与页面关系](docs/prototype-structure.md)
- [AI 开发实施指南](docs/ai-development-guide.md)

## 技术栈

后端：

- Go
- Gin
- GORM
- SQLite，使用纯 Go 驱动，Windows 本地运行不需要 CGO/gcc
- mark3labs/mcp-go

前端：

- Electron
- React
- TypeScript
- Vite
- Ant Design

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
MCP SSE:  http://127.0.0.1:8000/mcp/sse?token=change-me-mcp-token
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

## MCP 使用说明

Synkord 后端提供一个 MCP Server 入口，后续会支持：

- 全局 MCP 服务开关
- 团队 MCP 开关
- 多个团队级 MCP Token
- 按项目范围和工具范围授权
- Token 启用、停用、过期和重新生成

推荐模式是一个 MCP Server 入口承载多个团队和多个 Token，而不是为每个 IDE 或项目启动多个独立 MCP Server 进程。

## 当前重构方向

后续开发以 `docs/prototype-structure.md` 为页面结构依据，优先顺序：

1. 统一全局布局和团队上下文。
2. 补齐我的团队、团队切换、团队成员权限。
3. 重构项目管理、接口管理、数据模型。
4. 完善 MCP 管理、依赖拓扑和变更检测闭环。
5. 将页面模拟数据逐步替换为后端接口。

## 许可证

当前仓库尚未添加 LICENSE 文件。正式开源发布前需要补充许可证声明。
