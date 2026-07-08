<div align="center">

<img src="assets/brand/synkord-logo-light.svg" alt="Synkord" width="420" />

**让 AI 在 IDE 里真正理解你的 API**

MCP 时代的 API 知识层 — 把后端契约集中管理，让 Cursor / VSCode / Codex 等 IDE 里的 AI 按真实接口约束生成代码，不再瞎编。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/synkord/synkord)](https://github.com/synkord/synkord/releases)
[![CI](https://github.com/synkord/synkord/workflows/CI/badge.svg)](.github/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-client%20%2B%20server-blue)](https://github.com/synkord/synkord/releases)
[![GitHub stars](https://img.shields.io/github/stars/synkord/synkord?style=social)](https://github.com/synkord/synkord/stargazers)

[快速开始](#-快速开始) · [部署](#-部署) · [文档](docs/) · [品牌资产](docs/brand.md) · [贡献](CONTRIBUTING.md)

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
- 🖥️ **桌面端 + 服务端双形态**：成员安装客户端 / 团队只部署一台 Go + SQLite 后端

---

## 🚀 快速开始

### 部署架构（一图说明关系）

```
   ┌────────────────────┐
   │  你的电脑（成员）  │  ← 每个团队成员各装一份
   │  Synkord 桌面端    │
   └──────────┬─────────┘
              │ HTTPS / HTTP
              ▼
   ┌────────────────────┐
   │  1 台服务器（团队）│  ← 管理员部署，全队共享
   │  synkord-core      │     Go + Gin + SQLite
   │  （Docker / 裸机） │     5-50 人单机足够
   └────────────────────┘
```

**桌面端是客户端，服务端是数据中枢**——没有服务端，桌面端登录时会提示"未配置服务器地址"。

所以部署流程是：
1. **管理员**先把服务端跑起来（一次性，~5 分钟）
2. **每个成员**装桌面端，登录页填服务端地址（~3 分钟）

下面按使用场景分两条路：**团队部署**（多数人的场景）和**单机试用**（想先跑起来看看）。

---

### 场景一：团队部署（5–50 人）

> 管理员只部署**一台**服务端，团队成员全部装桌面端连过来。

#### 第 1 步：管理员部署服务端

**选哪种网络模式：**

| 你的情况 | 用什么 |
|---|---|
| 服务在内网 / VPN / Tailscale / Cloudflare Tunnel 后面 | **内部模式**（不开 HTTPS，最简） |
| 服务要直接在公网暴露 | **HTTPS 模式**（自动签 Let's Encrypt 证书） |

> 团队规模 5–50 人、SQLite 即可；> 100 人见 [升级路径](deploy/docker/README.md#升级路径)。

**a. 装 Docker（一次性）**

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录让 docker 组生效
```

**b. 拿部署文件**

```bash
mkdir -p /opt/synkord && cd /opt/synkord
# 从 GitHub 拉 deploy/docker 目录（不需要 git clone 全仓库）
curl -fsSL https://codeload.github.com/synkord/synkord/tar.gz/refs/heads/main | \
  tar -xz --strip-components=2 synkord-main/deploy/docker
ls   # 看到 Caddyfile  backup.sh  docker-compose.yml  README.md
```

**c. 配环境变量**

```bash
cp .env.example .env
# 一行生成 64 字符随机密钥
sed -i "s/__REPLACE_WITH_64_HEX_CHARS__/$(openssl rand -hex 32)/" .env

# HTTPS 模式还要补这几行（去掉 # 注释 + 改成你的域名）
vi .env
#   SYNKORD_DOMAIN=synkord.yourcompany.com
#   LETSENCRYPT_EMAIL=ops@yourcompany.com
#   FRONTEND_ORIGIN=https://synkord.yourcompany.com
#   SYNKORD_CORS_ORIGINS=https://synkord.yourcompany.com
```

> `.env` 不要提交到 Git（已在 `.gitignore`）。

**d. 启动**

```bash
# 内部模式（一条命令搞定）
docker compose up -d
docker compose ps                  # STATUS 应显示 "healthy"

# 或公网 HTTPS 模式（需要先把 DNS A 记录指过来）
docker compose --profile https up -d
```

**e. 验证**

```bash
# 内部模式
curl http://localhost:8000/health
# 期望：{"status":"ok","service":"synkord-core","components":{"database":"ok"}}

# HTTPS 模式
curl https://synkord.yourcompany.com/api/health
```

#### 第 2 步：通知团队成员装桌面端

把这段复制到邮件 / 钉钉 / 飞书 / Slack：

```
📦 Synkord 团队服务已上线

桌面端下载（任选一台电脑）：
  macOS / Windows / Linux: https://github.com/synkord/synkord/releases/latest

首次打开后：
  1. 登录页填入服务器地址：http://服务器IP:8000
     （HTTPS 模式：https://synkord.yourcompany.com）
  2. 默认账号： admin  密码： admin123（首次登录立即改！）
  3. 切换地址：设置 → 后端连接 → 服务器域名
```

**桌面端文件名（带版本号）：**

| 平台 | 文件名 |
|---|---|
| macOS (Apple Silicon) | `Synkord-{version}-arm64.dmg` |
| macOS (Intel) | `Synkord-{version}-x64.dmg` |
| Windows | `Synkord-Setup-{version}-x64.exe` |
| Linux | `Synkord-{version}-x64.AppImage` · `.deb` |

> 首次运行会看到 OS 自身的"未知发布者"告警（[为什么不签名？](docs/deployment.md#7-安装提示)），点"仍要运行"即可。

#### 第 3 步：日常运维速查

```bash
# 升级（改 .env 里 SYNKORD_IMAGE_TAG，再拉+起）
sed -i 's/^SYNKORD_IMAGE_TAG=.*/SYNKORD_IMAGE_TAG=0.4.0/' .env
docker compose pull && docker compose up -d

# 备份（写到 ./backups/）
./backup.sh

# 恢复
docker compose stop synkord
cp ./backups/backup-20260708-030000.db ./data/synkord.db
docker compose up -d

# 看日志
docker compose logs -f synkord

# 重启 / 停 / 启
docker compose restart synkord
docker compose stop
docker compose down     # 删容器（./data 数据保留）
```

#### 故障排查

| 症状 | 排查 |
|---|---|
| `docker compose ps` 显示 unhealthy | `docker compose logs synkord` 看启动错误 |
| 桌面端 network error | 服务器防火墙是否放行 8000（内部）/80,443（HTTPS） |
| 401 / 密码错 | 看 [deploy/docker/README.md#安全清单](deploy/docker/README.md) |
| HTTPS 模式证书签不下来 | DNS A 记录是否生效（`dig synkord.yourcompany.com`） |

---

### 场景二：单机试用（先跑起来看看）

只在一台电脑上同时跑服务端 + 桌面端：

```bash
# 1. 装 Docker（场景一里有命令）
# 2. 起服务端
mkdir -p ~/synkord && cd ~/synkord
curl -fsSL https://codeload.github.com/synkord/synkord/tar.gz/refs/heads/main | \
  tar -xz --strip-components=2 synkord-main/deploy/docker
cp .env.example .env
sed -i "s/__REPLACE_WITH_64_HEX_CHARS__/$(openssl rand -hex 32)/" .env
docker compose up -d

# 3. 装桌面端（从上面表格下载）
# 4. 桌面端登录页填：http://localhost:8000
# 5. admin / admin123 登录，立即改密码
```

---

完整版（生产级安全清单、监控、PostgreSQL 升级路径）：[**deploy/docker/README.md**](deploy/docker/README.md) · [docs/deployment.md](docs/deployment.md)

---

### 附：开发者工具（不是部署方式）

**CLI** — 命令行推 / 拉契约、查接口

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/synkord/synkord/main/install.sh | sh

# Windows (Scoop)
scoop install synkord

# 或 Go install
go install github.com/synkord/synkord/synkord-cli@latest

# 首次使用（指向团队或本机的服务端）
synkord login --server http://localhost:8000
synkord push-spec --spec ./openapi.json
```

**从源码开发** — 改代码 / 提 PR

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
│   ├── deployment.md             # 部署方案（桌面端 / Go+SQLite / SaaS）
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
├── deploy/docker/              # 自托管部署（Docker，唯一推荐）
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
