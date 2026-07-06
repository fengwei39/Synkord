# Synkord

> **让 AI 在 IDE 里真正理解你的 API**
> MCP 时代的 API 知识层

---

## 项目结构

```
synkord/
├── docs/                       # 产品规格（v1.2 锁定）
│   ├── requirements.md           # 产品需求、数据模型、API 规格
│   ├── architecture.md           # 技术架构、认证、Electron 模块
│   ├── mcp-spec.md               # MCP 工具、资源、错误码
│   ├── ui-spec.md                # UI/UX 规范
│   ├── implementation.md        # 8 周实施路线
│   ├── mcp-user-guide.md        # 用户使用指南
│   ├── mcp-prompt-template.md    # AI prompt 模板
│   └── mcp-member-guide.md       # 成员管理指南
│
├── backend/                    # Go 后端（synkord-core）
│   ├── main.go                    # 入口
│   ├── config/                    # 配置加载
│   ├── database/                  # DB 初始化 + AutoMigrate
│   ├── middleware/                # 鉴权中间件
│   ├── models/                    # 9 张表的数据模型
│   ├── services/                  # 业务逻辑
│   ├── api/                       # HTTP handlers
│   └── scripts/smoketest.sh      # 端到端冒烟测试
│
└── frontend/                   # React + Electron 桌面应用
    ├── src/                       # React 应用源码
    │   ├── api/                    # Axios + 业务 API
    │   ├── components/             # 通用组件
    │   ├── contexts/               # React Context
    │   ├── hooks/                  # 自定义 Hooks
    │   ├── pages/                  # 页面组件
    │   ├── types/                  # TypeScript 类型
    │   ├── utils/                  # 工具函数
    │   └── main.tsx                 # 入口
    ├── electron/                  # Electron 主进程
    │   ├── main.cjs                # 主进程入口
    │   ├── preload.cjs             # contextBridge
    │   ├── auth-manager.cjs        # JWT 管理
    │   ├── auth-gateway.cjs        # 本地 HTTP 代理
    │   ├── local-mcp-service.cjs   # MCP 子进程
    │   ├── mcp-core/               # MCP 核心模块
    │   └── mcp-tools/              # MCP 工具集
    ├── build/                     # 打包资源（图标等）
    ├── scripts/smoke-test.cjs    # Electron 端到端测试
    └── package.json
```

---

## 快速启动

### 1. 启动后端

```bash
cd backend
go run main.go
# 监听 http://127.0.0.1:8000
# 默认管理员：admin / admin123
```

### 2. 启动前端（开发模式）

```bash
cd frontend
npm install
npm run dev:electron   # 同时启动 Vite dev server + Electron
# 浏览器访问 http://127.0.0.1:3000
```

### 3. 构建生产包

```bash
cd frontend
npm run dist          # 当前平台
npm run dist:win      # Windows (NSIS + portable)
npm run dist:mac      # macOS (DMG)
npm run dist:linux    # Linux (AppImage + deb)
# 产物输出到 frontend/release/
```

### 4. 端到端冒烟测试

```bash
# 后端冒烟
cd backend
bash scripts/smoketest.sh   # 17 个端到端测试

# Electron 冒烟
cd frontend
node scripts/smoke-test.cjs  # 验证 AuthManager + AuthGateway + MCP 工具调用
```

---

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AI IDE（Cursor / Claude Desktop）         │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP 协议 (stdio / http)
┌────────────────────────▼────────────────────────────────────┐
│  Electron Desktop App                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ AuthManager │  │ AuthGateway │  │ Connect (MCP)    │    │
│  │ - JWT 持有  │  │ - 127.0.0.1 │  │ - STDIO/HTTP     │    │
│  │ - 自动 refresh│ │ - 注入 JWT │  │ - 工具注册表     │    │
│  │ - 单飞       │  │ - 实例注册 │  │ - 后端代理        │    │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘    │
│         └────────────────┼─────────────────┘              │
│                          │                                  │
│                   HTTPS + JWT (injected)                    │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Synkord Backend (Go)                      │
│  - REST API (/api/contracts, /api/contracts/:id/apis, ...) │
│  - JWT 认证                                                  │
│  - MCP 工具执行 (/api/mcp/query)                            │
│  - 审计日志                                                  │
│  - 成员权限                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 关键设计

### 1. 无团队概念
- 每个**契约集**是独立工作空间
- 契约集由**创建者**（owner）管理成员
- 三种角色：`owner` / `editor` / `viewer`
- 创建者不可被移除或降级

### 2. 单一活跃契约集
- 用户在同一会话中聚焦一个契约集
- 手动切换（不是自动检测）
- AI 通过 MCP 工具调用默认操作活跃契约集
- 显式传 `contract_id` 可跨契约集查询

### 3. MCP 无状态工具
- 所有业务工具都有 `contract_id` 参数
- 默认操作活跃契约集
- 7 个内置工具：list/get/validate

### 4. 凭证安全
- JWT 仅由 AuthManager 持有
- MCP 工具通过 AuthGateway 间接访问后端
- Connect 子进程永不见真实 JWT
- 本地凭证 0600 权限
- 仅 127.0.0.1 监听

---

## API 端点

| 类别 | 路径 |
|---|---|
| 认证 | `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me` |
| 契约集 | `GET/POST /api/contracts`, `GET/PATCH/DELETE /api/contracts/:id` |
| 成员 | `GET/POST /api/contracts/:id/members`, `PATCH/DELETE /api/contracts/:id/members/:userId` |
| 接口 | `GET/POST /api/contracts/:id/apis`, `GET/PATCH/DELETE /api/contracts/:id/apis/:apiId` |
| 数据模型 | `GET/POST /api/contracts/:id/entities`, ... |
| 导入 | `POST /api/contracts/:id/import/parse`, `POST /api/contracts/:id/import/commit` |
| MCP | `GET /api/mcp/status`, `GET/PUT /api/mcp/active-contract`, `GET /api/mcp/ide-config`, `GET /api/mcp/access-log`, `POST /api/mcp/query` |
| 健康 | `GET /health` |

详细规格：[docs/requirements.md §四](./docs/requirements.md#四后端-api-规格)

---

## MCP 工具

通过 `POST /api/mcp/query` 调用：

| 工具 | 说明 |
|---|---|
| `get_contract_apis` | 获取活跃契约集的所有 API |
| `get_contract_entities` | 获取活跃契约集的所有数据模型 |
| `get_api_detail` | 获取单个 API 完整定义 |
| `get_entity_detail` | 获取单个数据模型完整定义 |
| `get_api_dependencies` | API 依赖关系 |
| `get_entity_dependencies` | 数据模型依赖关系 |
| `validate_code_against_contract` | 校验代码是否符合契约（核心约束工具） |
| `list_contracts` / `find_contract` | 跨契约集发现 |

详细规格：[docs/mcp-spec.md §二](./docs/mcp-spec.md#二工具规范)

---

## 5 分钟接通（用户视角）

1. **安装 + 启动**：双击 Synkord 图标，登录 admin/admin123
2. **创建契约集**：「契约集」页面 → 「+ 新建」 → 输入名称「订单平台」
3. **录入数据**：
   - 方式 A：导入 OpenAPI/Swagger 文件
   - 方式 B：手动添加 API + 数据模型
4. **设为活跃**：在契约集详情点击「设为活跃」
5. **复制 IDE 配置**：顶部「MCP」页面 → 「接入 AI IDE」→ 选 IDE → 「复制配置」
6. **粘贴到 IDE**：配置 Cursor / Claude Desktop 的 MCP 配置
7. **让 AI 写代码**：在 IDE 里问"基于订单平台，写个查询订单的代码"

AI 会通过 MCP 读取契约集，按真实接口约束生成代码 — **不瞎编**。

---

## 开发

### 前端开发

```bash
cd frontend
npm run dev              # Vite dev server
npm run dev:electron     # 同时启动 Electron
npm run build            # 类型检查 + 构建
npx tsc --noEmit         # 仅类型检查
```

### 后端开发

```bash
cd backend
go run main.go
go build ./...
bash scripts/smoketest.sh
```

### 端到端冒烟

```bash
# 1. 启动后端
cd backend && go run main.go &

# 2. 后端冒烟（17 测试）
cd backend && bash scripts/smoketest.sh

# 3. Electron 冒烟（验证主进程 + Gateway + Connect）
cd frontend && node scripts/smoke-test.cjs
```

### 调试

- **前端**：浏览器 DevTools（F12） + Vite HMR
- **Electron 主进程**：`npm run dev:electron` 时主进程日志输出在启动终端
- **MCP 子进程**：日志写到 `~/.synkord/logs/`
- **后端**：默认日志输出到 stdout

---

## 部署

### 开发环境
- 后端：`go run main.go`（监听 :8000）
- 前端：`npm run dev:electron`（监听 :3000 + Electron 窗口）

### 生产环境

**单台机器（推荐）**：
- 后端编译：`cd backend && go build -o synkord-core main.go`
- 前端打包：`cd frontend && npm run dist`
- 用户下载安装包，桌面客户端自动连接 `127.0.0.1:8000` 后端

**多机器（团队）**：
- 后端部署在服务器（修改 CORS 配置）
- 前端打包后，配置 `SYNKORD_API_BASE` 环境变量指向服务器
- 每台开发机运行自己的 Connect 子进程（无需本地后端）

---

## 路线图

| 阶段 | 状态 | 说明 |
|---|---|---|
| Phase 1 | ✅ | 路由与导航重构 |
| Phase 2 | ✅ | MCP 页面重做（Electron IPC） |
| Phase 3 | ✅ | 活跃契约集实现 |
| Phase 4 | ✅ | Auth Gateway 抽取 |
| Phase 5 | ✅ | OpenAPI/Postman 导入 |
| Phase 6 | ✅ | 成员管理 + UX 清理 |
| Phase 7 | ✅ | 可访问性与文档 |
| **Phase 8** | ✅ | **Electron 桌面客户端（AuthManager + AuthGateway）** |
| 打包 | ✅ | electron-builder 配置 + smoke test 17/17 |

**当前完成度：95%**

剩余：
- 真实 IDE 集成测试（手动）
- 应用签名（Code signing for Windows/macOS）
- 自动更新机制（electron-updater）
- 国际化（i18n）

---

## 许可证

MIT

---

## 反馈

- 文档：[docs/](./docs/)
- 问题：GitHub Issues
- 邮件：team@synkord.dev