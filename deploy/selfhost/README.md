# Synkord 自托管部署

5–50 人研发团队的单机 / 小集群部署方案。

## 资源需求

| 项目 | 最小 | 推荐 |
|---|---|---|
| CPU | 1 核 | 2 核 |
| 内存 | 512 MB | 1 GB |
| 磁盘 | 10 GB | 50 GB（含备份）|
| 网络 | 1 Mbps | 10 Mbps |

数据库用 **SQLite**（单文件），50 人并发写足够。如果团队 > 100 人或有高并发场景，
迁移到 PostgreSQL：见 [docs/deployment.md §4](../../../docs/deployment.md#4-生产环境升级路径)。

## 部署步骤

### 1. 准备服务器

```bash
# 安装 Docker（Ubuntu / Debian）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 创建部署目录
mkdir -p /opt/synkord && cd /opt/synkord
git clone https://github.com/synkord/synkord.git
cd synkord/deploy/selfhost
```

### 2. 配置环境变量

```bash
cp .env.example .env
vi .env
```

必填项：
```bash
# 用 openssl rand -hex 32 生成 64 字符随机串
JWT_SECRET=$(openssl rand -hex 32)
MCP_TOKEN=$(openssl rand -hex 32)

SYNKORD_DOMAIN=synkord.yourcompany.com
ALLOWED_ORIGINS=https://synkord.yourcompany.com
LETSENCRYPT_EMAIL=ops@yourcompany.com
```

### 3. DNS 解析

在域名 DNS 服务商把 `SYNKORD_DOMAIN` 解析到服务器 IP（A 记录）。

### 4. 启动服务

```bash
# 拉取镜像（首次或升级时）
docker compose pull

# 后台启动
docker compose up -d

# 跟踪启动日志
docker compose logs -f synkord-core
```

看到 `synkord-core starting on :8000` 即启动成功。

### 5. 首次访问

打开 `https://$SYNKORD_DOMAIN`，用默认账号登录：

- 用户名：`admin`
- 密码：`admin123`

**登录后立即修改默认密码！**（在"设置 → 用户管理"里）

### 6. 部署前端

前端 dist/ 可以：

**A. 同机反代**（最简单）  
构建后 `scp -r dist/* user@server:/srv/synkord/frontend/`，取消 Caddyfile 中 `reverse_proxy {$FRONTEND_ORIGIN}` 改用 `file_server` + `root`。

**B. CDN / 对象存储**（推荐）  
```bash
cd frontend
VITE_API_BASE=https://$SYNKORD_DOMAIN/api pnpm build
# 上传 dist/* 到 Cloudflare Pages / S3 / OSS
```
Caddyfile 中 `$FRONTEND_ORIGIN` 指向 CDN 域名。

## 日常运维

### 升级

```bash
cd /opt/synkord
git pull
cd deploy/selfhost
docker compose pull
docker compose up -d
```

### 备份

**手动备份**：
```bash
docker compose exec synkord-core sqlite3 /app/data/synkord.db ".backup /app/data/backup-$(date +%F).db"
docker compose cp synkord-core:/app/data/backup-*.db ./backups/
```

**自动备份**：取消 `docker-compose.yml` 中 `backup` service 注释，每天 03:00 自动备份到 `synkord_backups` 卷。

### 还原

```bash
docker compose stop synkord-core
docker compose cp ./backups/synkord-2026-07-06.db synkord-core:/app/data/synkord.db
docker compose start synkord-core
```

### 查看日志

```bash
# 实时跟踪
docker compose logs -f synkord-core

# 最近 100 行
docker compose logs --tail=100 synkord-core

# 访问日志（Caddy）
docker compose exec caddy cat /data/access.log | tail
```

### 健康检查

```bash
curl -s https://$SYNKORD_DOMAIN/api/health | jq
# 期望: { "status": "ok", "service": "synkord-core", "components": { "database": "ok" } }
```

## 安全清单

- [ ] `JWT_SECRET` 和 `MCP_TOKEN` 用 `openssl rand -hex 32` 生成，不要用默认值
- [ ] 修改默认 admin 密码（`admin123`）
- [ ] 服务器防火墙只开 80 / 443 端口
- [ ] 定期更新镜像：`docker compose pull && docker compose up -d`
- [ ] 定期备份 SQLite（已配 cron 或手动）
- [ ] 服务器时间同步（`apt install chrony` 或 `timedatectl`）
- [ ] 启用 SSH 密钥登录，禁用密码登录
- [ ] 配置 fail2ban 防爆破

## 升级路径

团队规模 / 性能需求增长时：
- **50 → 100 人**：调高 docker 资源 limits，SQLite + WAL 模式仍可撑
- **100 → 500 人**：迁移到 PostgreSQL，synkord-core 改 driver
- **多机集群**：synkord-core 无状态化（多副本），PostgreSQL 主从 + Redis
- **异地多活**：SaaS 模式（多租户改造）

详见 [docs/deployment.md §4](../../../docs/deployment.md#4-生产环境升级路径)。
