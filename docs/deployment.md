# Synkord 部署方案

> 本文档覆盖 Synkord 的所有部署形态：桌面端单机、自托管服务端、SaaS 多租户。
> 同时含 CI/CD、CLI 分发、升级路径。

## 目录

1. [形态总览](#1-形态总览)
2. [桌面端单机（Electron）](#2-桌面端单机electron)
3. [自托管服务端（Go + SQLite）](#3-自托管服务端go--sqlite)
4. [生产环境升级路径](#4-生产环境升级路径)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [CLI 工具分发](#6-cli-工具分发)
7. [安装提示](#7-安装提示)
8. [监控 / 告警 / 备份](#8-监控--告警--备份)

---

## 1. 形态总览

| 形态 | 目标 | 工作量级 | 现状 |
|---|---|---|---|
| **A. 桌面端** | 单用户 / 小团队 | O(天) | ✅ 已就绪（electron-builder 全平台） |
| **B. 自托管服务端** | 5–50 人团队 | O(周) | ✅ 部署方案就绪（[`deploy/docker/`](../deploy/docker/)，推荐） |
| **C. SaaS 多租户** | 50+ 客户 | O(月) | ⏳ 商业化阶段 |

**关键架构特点**：
- 后端 Gin 同一份代码支持本地 + 服务端模式
- 前端 Electron 内嵌本地 MCP service（无需自起后端）
- SQLite 默认；服务端可选升级 PostgreSQL
- CLI 走 REST，不走 MCP（边界清晰：CLI = 人类，IDE/AI = MCP）

---

## 2. 桌面端（Electron）

### 构建

```bash
cd frontend
pnpm install
pnpm build              # 产出 dist/
pnpm dist:win           # → release/Synkord-Setup-0.1.0-x64.exe
pnpm dist:mac           # → release/Synkord-0.1.0-{arch}.dmg
pnpm dist:linux         # → release/Synkord-0.1.0-x64.AppImage + .deb
```

### 自动更新

集成 [electron-updater](https://www.electron.build/auto-update)：

- **触发**：每次 App 启动后 3 秒检查 GitHub Releases
- **流程**：发现新版本 → 弹窗"立即下载 / 稍后" → 后台下载 → 下载完成再弹"立即重启 / 稍后"
- **失败容错**：用户拒绝可继续用当前版本；下次启动再询问
- **开发模式跳过**：`!app.isPackaged` 时不加载 updater

实现：[frontend/electron/main.cjs `setupAutoUpdater()`](../../frontend/electron/main.cjs)

### 数据持久化

- `~/.synkord/synkord.db` — SQLite 数据库
- `~/.synkord/config.json` — 用户配置、token
- Electron userData 目录自动管理（`app.getPath('userData')`）

### 跨平台差异

| 平台 | 安装包 | 启动器 | 备注 |
|---|---|---|---|
| Windows | NSIS + portable | .exe | 需要代码签名避免 SmartScreen 警告 |
| macOS | DMG | .app | 需要 Apple Developer ID 签名 + notarization |
| Linux | AppImage + deb | 双击 / .deb | AppImage 无需安装；deb 适合企业内分发 |

---

## 3. 自托管服务端（Go + SQLite）

**详细步骤**：[`deploy/docker/README.md`](../deploy/docker/README.md)

**Docker 快速部署**：

```bash
mkdir -p /opt/synkord && cd /opt/synkord
# 拉本目录的 docker-compose.yml / .env.example / Caddyfile / backup.sh
cp .env.example .env && vi .env       # 改 SYNKORD_JWT_SECRET
docker compose up -d                   # 内部 / VPN / Tunnel 模式
# 或公网 HTTPS：
# docker compose --profile https up -d
```

### 架构

**内部 / VPN / Tunnel 模式**：

```
              ┌────────────────────┐
              │ synkord (container)│  :8000
              │ Go + Gin + GORM    │  UID 65532 (非 root)
              │ read-only fs       │  /app/data bind-mount
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │ ./data/synkord.db  │  SQLite（bind-mount，operator 可 scp）
              └────────────────────┘
```

**HTTPS 模式**（加 `--profile https`）：

```
              ┌────────────┐
              │ Caddy      │  :80 / :443（Let's Encrypt 自动续签）
              │ (TLS)      │
              └─────┬──────┘
                    │ :8000
              ┌─────▼──────┐
              │ synkord-   │  Go + Gin + GORM
              │ core       │  1 CPU / 512M 限制
              └─────┬──────┘
                    │
              ┌─────▼──────┐
              │ synkord.db │  SQLite（bind-mount 持久化）
              └────────────┘
```

### 反代路由（HTTPS 模式）

| 路径 | 后端 |
|---|---|
| `/api/*` | synkord:8000 |
| `/health` | synkord:8000 |
| `/*` | 前端 CDN / OSS / Cloudflare Pages |

Caddyfile 已配：
- 强制 HTTPS（HSTS）
- 安全头（CSP / X-Frame-Options / nosniff）
- HTTP → HTTPS 301 重定向
- 访问日志滚动（100MB × 5 文件）

---

## 4. 生产环境升级路径

| 团队规模 | 部署形态 | 改造点 |
|---|---|---|
| 1-10 人 | 桌面端单机 | 零 |
| 5-50 人 | 自托管 + SQLite | 当前 [`deploy/docker/`](../deploy/docker/) |
| 50-200 人 | 自托管 + PostgreSQL | 换 DB driver，加连接池 |
| 200+ 人 | K8s 多副本 + PG 主从 + Redis | 无状态化 + 多租户 |
| 商业化 | SaaS 多租户 | 加 tenant_id / SSO / 对象存储 |

### 4.1 SQLite → PostgreSQL 迁移

模型层零改动（都是 GORM），只改驱动：

```go
// backend/database/database.go
import "gorm.io/driver/postgres"

// 把
DB, err = gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{})
// 改为
DB, err = gorm.Open(postgres.Open(cfg.DBPath), &gorm.Config{})
```

`cfg.DBPath` 改成 DSN 格式：`host=... user=... password=... dbname=synkord sslmode=require`

### 4.2 多副本无状态化

`backend/main.go` 当前是单实例。多副本要：
- 移除本地文件状态（如 `mcp_audit_logs` 表里不要有进程级缓存）
- 用 Redis 存 session / rate-limit
- 用对象存储（S3 / OSS）存上传的 schema 文件

### 4.3 多租户改造

每张表加 `tenant_id`：
```go
type ContractSet struct {
    ID          string `...`
    TenantID    string `...;index`  // 新增
    // ...
}
```

加 `Tenant` 表 + 邀请流程 + 计费。

---

## 5. CI/CD Pipeline

CI / 发布 workflow 在 [`.github/workflows/`](../.github/workflows/)：

### CI（[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)）

PR 触发，三端并行：

| Job | 检查项 |
|---|---|
| `backend` | `go build` / `go vet` / `go test -race` |
| `frontend` | `pnpm tsc --noEmit` / `pnpm build` |
| `cli` | `go build` / `go vet` / `go test -race` |

并发控制：同分支前一个 CI 未完成时自动取消。

### Release（[`.github/workflows/release.yml`](../.github/workflows/release.yml)）

`v*.*.*` tag 触发，并行构建：

| Job | 产物 | 版本号来源 |
|---|---|---|
| `resolve` | （内部）| 从 tag 抽 `vX.Y.Z`，下游用 |
| `backend` | Go 后端：`synkord-core-linux-amd64` | `-ldflags "-X main.version=$VERSION"` |
| `docker` | Docker 镜像：`ghcr.io/synkord/synkord-core:vX.Y.Z` / `X.Y.Z` / `X.Y` / `latest` | `docker/metadata-action` |
| `desktop` | 客户端 3 个：macOS Apple Silicon DMG、macOS Intel DMG、Windows NSIS | `frontend/package.json` `version` |

汇总 job 收集所有 artifact → 生成 SHA256SUMS → 创建 GitHub Release。

**完整发布流程**：[docs/release-process.md](release-process.md)，含：
- 版本号单一事实源（[`VERSION`](../VERSION)）
- 一键 bump 脚本（[`scripts/bump-version.sh`](../scripts/bump-version.sh)）
- release notes 自动起草（[`.github/release-drafter.yml`](../.github/release-drafter.yml)）
- hotfix / 预发布 / 撤销流程

### Dependabot（[`.github/dependabot.yml`](../.github/dependabot.yml)）

- backend (Go modules) / cli (Go modules)：每周一检查
- frontend (npm)：每周一检查，security patch 单独一组
- github-actions：每周检查自身

### 本地开发验证

```bash
# 跑 CI 等价的本地检查
cd backend && go test -race ./...
cd frontend && pnpm exec tsc --noEmit && pnpm build
cd synkord-cli && go test -race ./...
```

---

## 6. CLI 工具分发

[synkord-cli](../synkord-cli/) 是独立 Go 工具，用于 CI 推送 spec / Git Hook 前置校验。

### 安装方式

| 系统 | 命令 |
|---|---|
| macOS / Linux（Homebrew）| `brew install synkord/tap/synkord` |
| Windows（Scoop）| `scoop install synkord` |
| 通用（curl 脚本）| `curl -fsSL https://synkord.dev/install.sh \| sh` |
| Go install | `go install github.com/synkord/synkord/synkord-cli@latest` |

### install.sh（极简安装）

发布到 `https://synkord.dev/install.sh`：

```bash
#!/bin/sh
# 检测 OS / 架构 → 下载对应二进制 → 安装到 /usr/local/bin
set -e
REPO="synkord/synkord"
BIN="synkord"
# ... 检测 + curl + chmod + mv
```

### 首次使用

```bash
synkord login --server https://synkord.yourcompany.com
# 提示输入用户名/密码，token 存到 ~/.synkord/token

synkord push-spec --spec ./openapi.json
synkord validate-deps --used-entities User,Order --used-apis /api/users/{id},/api/orders
```

详见 [synkord-cli/main.go 帮助](../synkord-cli/main.go)。

---

## 7. 安装提示

桌面端安装包**不做代码签名**（节省 99 USD/年的 Apple Developer ID 费用 + EV 证书），用户首次运行时会看到 OS 自身的告警：

- **Windows**：SmartScreen 弹出"Windows 已保护你的电脑" → 点"更多信息" → "仍要运行"
- **macOS**：Gatekeeper 弹出"无法验证开发者" → 系统设置 → 隐私与安全性 → 点"仍要打开"
- **Linux**：AppImage 需 `chmod +x`；deb 双击安装

**适合**：
- 内部团队 / 早期用户
- 灰度测试
- 不想承担证书成本的小团队

**商业化前必做**：申请 Apple Developer ID + EV 代码签名证书，否则 macOS 用户根本无法运行。

---

## 8. 监控 / 告警 / 备份

### 8.1 健康检查

后端已有 `/health` 端点（[backend/main.go](../../backend/main.go)）：

```bash
curl -s https://synkord.yourcompany.com/health
# {
#   "status": "ok",
#   "service": "synkord-core",
#   "version": "1.0.0",
#   "components": { "database": "ok" }
# }
```

Docker Compose 容器由 `restart: unless-stopped` 自动管理：
- 失败自动重启
- 日志通过 `docker compose logs -f synkord` 查看

### 8.2 推荐接入的监控

| 工具 | 用途 | 接入方式 |
|---|---|---|
| UptimeRobot / Better Stack | HTTP 健康监控 | 探 `/health`，5min 一次 |
| Prometheus + Grafana | 指标 + 仪表盘 | 需后端加 `/metrics`（pprof 已有）|
| Loki / Vector | 日志聚合 | Caddy 访问日志 + systemd journal |
| Sentry | 错误聚合 | 后端加 sentry-go，前端 @sentry/react |

### 8.3 备份策略

**当前实现**（[`deploy/docker/backup.sh`](../deploy/docker/backup.sh) 一键备份）：

```yaml
# 每天 03:00 把 SQLite 备份到 /backup 卷
# 保留 BACKUP_KEEP_DAYS=30 天
```

**生产建议**：

1. 启用内置 backup service
2. 加 `offsite backup` cron：每天把 `synkord_data` 卷 tar 到 S3 / OSS
3. 月度恢复演练（确保备份可用）
4. RPO ≤ 24h（每天一次备份），RTO ≤ 1h（恢复时间）

```bash
# 推荐的 offsite 备份脚本
docker compose exec synkord sqlite3 /app/data/synkord.db ".backup /app/data/backup.db"
docker compose cp synkord:/app/data/backup.db - | \
  aws s3 cp - s3://your-bucket/synkord/$(date +%F).db
```

---

## 附录 A：架构图

### 自托管生产架构

```
                         ┌──────────────────┐
                         │  Cloudflare / DDNS│
                         │  DNS + CDN 加速   │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  Caddy (TLS 终止) │
                         │  :80 / :443      │
                         │  HSTS / CSP / ... │
                         └────────┬─────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
      ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
      │ 浏览器 A   │         │ 浏览器 B   │         │ IDE Plugin│
      │ (React)   │         │            │         │ (MCP stdio)│
      └─────┬─────┘         └─────┬─────┘         └─────┬─────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │ HTTPS
                         ┌────────▼─────────┐
                         │   synkord-core    │
                         │   (Go + Gin)      │
                         │   1 CPU / 512M    │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │   SQLite (WAL)   │
                         │   synkord.db     │
                         └──────────────────┘
```

### 桌面端单机架构

```
┌────────────────────────────────────────────┐
│  Synkord 桌面端（Electron）                  │
│  ┌──────────────┐    ┌──────────────┐       │
│  │  Renderer    │    │   Main       │       │
│  │  (Vite/React)│◄──►│  Process     │       │
│  │  Vite bundle │    │  (Node.js)   │       │
│  └──────────────┘    │  ┌─────────┐ │       │
│                      │  │ local-  │ │       │
│                      │  │ mcp-    │ │       │ ← stdio MCP
│                      │  │ service │ │       │   (IDE 连接)
│                      │  └─────────┘ │       │
│                      └──────┬───────┘       │
└─────────────────────────────┼──────────────┘
                                │
                         ┌──────▼──────┐
                         │ SQLite 文件  │
                         │ ~/.synkord/  │
                         └─────────────┘
```

---

## 附录 B：常用运维命令

```bash
# 看容器状态
docker compose ps

# 进入后端容器调试
docker compose exec synkord sh

# 看后端日志（实时）
docker compose logs -f synkord

# 重启单个服务
docker compose restart synkord

# 停全部
docker compose down

# 停 + 清数据（危险！删 SQLite）
docker compose down -v

# 升级镜像
docker compose pull && docker compose up -d

# 备份
docker compose exec synkord sqlite3 /app/data/synkord.db ".backup /app/data/backup.db"
docker compose cp synkord:/app/data/backup.db ./backup-$(date +%F).db

# 健康检查
curl -s https://$SYNKORD_DOMAIN/health | jq
```

---

## 附录 C：故障排查

| 症状 | 检查 |
|---|---|
| 启动后 502 | `docker compose logs synkord` 看 `SYNKORD_JWT_SECRET` 是否设置 |
| 前端 404 | 域名 DNS 解析 + Caddyfile 的 `{$SYNKORD_DOMAIN}` 是否对 |
| 桌面端更新失败 | `electron-log` 日志在 `%APPDATA%/Synkord/logs/main.log` |
| MCP 工具调用失败 | `/api/mcp/access-log` 看请求；`mcp_audit_logs` 表查历史 |
| 数据库被锁 | SQLite WAL 模式下并发写偶尔锁，重启容器即可 |

更多问题参考 [docs/troubleshooting.md](troubleshooting.md)。
