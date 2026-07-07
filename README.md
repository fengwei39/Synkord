<div align="center">

# Synkord

**让 AI 在 IDE 里真正理解你的 API**

MCP 时代的 API 知识层 — 把后端契约集中管理，让 Cursor / VSCode / Codex 等 IDE 里的 AI 按真实接口约束生成代码，不再瞎编。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/synkord/synkord)](https://github.com/synkord/synkord/releases)
[![CI](https://github.com/synkord/synkord/workflows/CI/badge.svg)](.github/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/synkord/synkord/pkgs/container/synkord-core)
[![GitHub stars](https://img.shields.io/github/stars/synkord/synkord?style=social)](https://github.com/synkord/synkord/stargazers)

[English](README.en.md) · [快速开始](#-快速开始) · [文档](docs/) · [贡献](CONTRIBUTING.md)

</div>

---

## ✨ Synkord 是什么？

把团队的 API + 数据模型集中到一个"**契约集**"里，让 IDE 里的 AI 在写代码时**实时校验**：

| 场景 | 之前 | 有了 Synkord |
|---|---|---|
| AI 生成 fetch 调用 | 编个 `/api/wrong-path` | 给出真实存在的端点 |
| 改了 OpenAPI 规范 | 没人知道，调用全报错 | MCP 实时同步，AI 立刻感知 |
| 多人协作 | 接口各写各的 | 共享契约集，统一约束 |
| 写新接口 | 翻 5 个文档 | 一句话问 AI 拿完整定义 |

**核心能力**：
- 📚 **OpenAPI / Postman 一键导入**（批量建契约）
- 🔍 **MCP 工具**：让 IDE AI 查端点 / 校验代码 / 跨契约搜索
- 👥 **成员协作**：owner / editor / viewer 三级权限
- 🖥️ **桌面端 + 服务端双形态**：单机 SQLite 自带 MCP / 团队自托管 Docker

---

## 🚀 快速开始

### 方式 A：桌面端（推荐，3 分钟上手）

下载对应平台安装包：

| 平台 | 下载 |
|---|---|
| **macOS** (Apple Silicon / Intel) | [Synkord-0.1.0-arm64.dmg](https://github.com/synkord/synkord/releases/latest) |
| **Windows** | [Synkord-Setup-0.1.0-x64.exe](https://github.com/synkord/synkord/releases/latest) |
| **Linux** | [Synkord-0.1.0-x64.AppImage](https://github.com/synkord/synkord/releases/latest) · [.deb](https://github.com/synkord/synkord/releases/latest) |

首次运行会看到 OS 自身的"未知发布者"告警（[为什么不签名？](docs/deployment.md#7-安装提示)），点"仍要运行"即可。
首次启动用 `admin / admin123` 登录，**登录后立即改密码**。

### 方式 B：自托管服务端（团队用）

需要 Docker，5 分钟上线：

```bash
git clone https://github.com/synkord/synkord.git
cd synkord/deploy/selfhost
cp .env.example .env
vi .env  # 改 JWT_SECRET / MCP_TOKEN / 域名
docker compose up -d
```

详见 [deploy/selfhost/README.md](deploy/selfhost/README.md) 和 [docs/deployment.md](docs/deployment.md)。

### 方式 C：CLI

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/synkord/synkord/main/install.sh | sh

# Windows (Scoop)
scoop install synkord

# 或 Go install
go install github.com/synkord/synkord/synkord-cli@latest

# 首次使用
synkord login --server https://your-synkord-host
synkord push-spec --spec ./openapi.json
```

### 方式 D：从源码开发

```bash
# 后端
cd backend && go run .

# 前端（另一终端）
cd frontend && pnpm install && pnpm dev
# → http://localhost:5173

# CLI
cd synkord-cli && go run . login --server http://localhost:8000
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md) 的"本地开发环境"。

---

## 🛠 MCP 集成

把 Synkord 当作 MCP server 接入你的 IDE：

1. 打开 Synkord → **设置 → MCP**
2. 复制配置（JSON 片段）
3. 粘贴到 IDE 的 MCP 配置：
   - **Cursor**：`~/.cursor/mcp.json`
   - **VSCode** (Copilot Chat)：`.vscode/mcp.json`
   - **Claude Desktop**：`~/Library/Application Support/Claude/claude_desktop_config.json`
4. 重启 IDE，AI 即可调用：
   - `list_contracts` / `find_contract` — 跨契约集发现
   - `get_contract_apis` / `get_contract_entities` — 查接口 / 数据模型
   - `validate_code_against_contract` — **代码校验**，粘贴代码片段，自动标红错误

详见 [docs/mcp-user-guide.md](docs/mcp-user-guide.md)。

---

## 📦 项目结构

```
synkord/
├── docs/                       # 产品规格（v1.2 锁定）
│   ├── requirements.md           # 产品需求、数据模型、API 规格
│   ├── architecture.md           # 技术架构、认证、Electron 模块
│   ├── mcp-spec.md               # MCP 工具、资源、错误码
│   ├── ui-spec.md                # UI/UX 规范
│   ├── deployment.md             # 部署方案（桌面端 / Docker / SaaS）
│   ├── implementation.md        # 8 周实施路线
│   ├── mcp-user-guide.md        # MCP 用户使用指南
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
├── frontend/                   # React + Vite + Electron 桌面端
│   ├── src/
│   │   ├── api/                   # 后端调用封装
│   │   ├── components/            # 通用组件
│   │   ├── pages/                 # 页面
│   │   ├── contexts/              # React Context
│   │   ├── hooks/                 # 自定义 Hooks
│   │   ├── utils/                 # 工具函数
│   │   └── types/                 # TypeScript 类型
│   └── electron/                  # Electron 主进程 + MCP 子进程
│
├── synkord-cli/                # Go CLI（CI 推送 / Git Hook 校验）
│
├── deploy/selfhost/            # 自托管部署（docker-compose + Caddy）
│
├── .github/                    # CI/CD + Issue / PR 模板
│   ├── workflows/                # GitHub Actions
│   ├── ISSUE_TEMPLATE/           # Bug / Feature / Question 模板
│   └── PULL_REQUEST_TEMPLATE.md
│
├── docs/deployment.md          # 完整部署方案
├── CONTRIBUTING.md             # 贡献指南
├── SECURITY.md                 # 安全策略
└── LICENSE                     # MIT
```

---

## 🧩 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go 1.25 + Gin + GORM + SQLite（生产可选 PG）|
| 前端 | React 19 + Vite 8 + TypeScript + Ant Design 6 |
| 桌面端 | Electron 42 + electron-updater |
| MCP | stdio 协议，自研 Node.js 实现 |
| CLI | Go（与后端共用 go.mod 思路）|
| CI/CD | GitHub Actions + electron-builder + GHCR |

---

## 🤝 贡献

我们欢迎所有形式的贡献：

- 🐛 [报告 Bug](../../issues/new?template=bug_report.yml)
- 💡 [提功能建议](../../issues/new?template=feature_request.yml)
- ❓ [提问 / 求助](../../issues/new?template=question.yml)
- 🔧 [贡献代码](CONTRIBUTING.md)
- 📖 [改进文档](docs/)
- ⭐ 给项目加 Star
- 📣 分享给朋友

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 💬 社区

- 💭 [GitHub Discussions](https://github.com/synkord/synkord/discussions) — 功能讨论、最佳实践
- 🐛 [GitHub Issues](https://github.com/synkord/synkord/issues) — Bug 跟踪
- 🔒 [Security Advisories](https://github.com/synkord/synkord/security/advisories) — 安全漏洞私下报告
- 📧 Email：team@synkord.dev

---

## 📜 许可

[MIT License](LICENSE) — 商用、修改、分发、私用均可，只需保留版权声明。

---

## 🙏 致谢

- 灵感来源：[Stripe API Docs](https://stripe.com/docs/api) 的"AI 友好"设计
- MCP 协议：[Model Context Protocol](https://modelcontextprotocol.io)
- 桌面端框架：[Electron](https://www.electronjs.org)

---

<sub align="center">如果 Synkord 对你有帮助，请考虑给我们一个 ⭐ — 这是对开源项目最大的支持</sub>
