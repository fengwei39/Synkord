# Synkord Docker 部署

> **推荐部署方式。** 5–50 人研发团队的单机 / 小集群部署。
>
> 之前的两套路径 [`../selfhost/`](../selfhost/) 和 [`../server/`](../server/) 已废弃，但保留文件以便过渡。

## 资源需求

| 项目 | 最小 | 推荐 |
|---|---|---|
| CPU | 1 核 | 2 核 |
| 内存 | 512 MB | 1 GB |
| 磁盘 | 10 GB | 50 GB（含备份）|
| 网络 | 1 Mbps | 10 Mbps |

SQLite 单文件，50 人并发写足够。> 100 人参考 [升级路径](#升级路径)。

## 选哪种模式

| 模式 | 何时用 | 启动命令 |
|---|---|---|
| **内部（默认）** | 服务器在内网 / VPN / Tailscale / Cloudflare Tunnel 后面 | `docker compose up -d` |
| **公网 HTTPS** | 服务端要直接暴露在公网 | `docker compose --profile https up -d` |

两种模式**共用同一个 compose 文件**，只是后者多启一个 Caddy 容器 + 开放 80/443。

---

## 模式 1：内部 / VPN / Tunnel（4 条命令搞定）

```bash
# 1. 装 Docker（Ubuntu / Debian 一次性）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER    # 重新登录生效

# 2. 准备部署目录
mkdir -p /opt/synkord && cd /opt/synkord
# （把本目录的 docker-compose.yml / .env.example / Caddyfile / backup.sh 复制或 clone 过来）

# 3. 配环境变量
cp .env.example .env
vi .env
# 必改这一行（用 openssl rand -hex 32 生成）：
#   SYNKORD_JWT_SECRET=粘贴64字符随机串

# 4. 启动
docker compose up -d
docker compose logs -f synkord    # 看到 "starting on :8000" 就 OK
```

客户端登录页填 `http://服务器IP:8000`，admin / admin123 进去后立即改密码。

### 自带 .db 文件

```bash
# 停服
docker compose down

# 放进 ./data
scp synkord.db /opt/synkord/data/synkord.db
chown 65532:65532 /opt/synkord/data/synkord.db    # 容器用户是 UID 65532
chmod 644 /opt/synkord/data/synkord.db

# 起服务
docker compose up -d
```

> **WAL 模式说明**：Go 后端用 `glebarez/sqlite`（纯 Go），默认 `journal_mode=DELETE`，所以**只有 1 个 `.db` 文件**，没有 `-wal` / `-shm` 兄弟文件要一起传。直接 `scp .db` 就够了。

---

## 模式 2：公网 + HTTPS

在模式 1 的基础上：

```bash
# 1. DNS：把域名 A 记录指向服务器公网 IP

# 2. 在 .env 里取消注释 + 填值
vi .env
#   SYNKORD_DOMAIN=synkord.yourcompany.com
#   LETSENCRYPT_EMAIL=ops@yourcompany.com
#   FRONTEND_ORIGIN=https://synkord.yourcompany.com
#   SYNKORD_CORS_ORIGINS=https://synkord.yourcompany.com

# 3. 启动（加 --profile https）
docker compose --profile https up -d

# 4. 等 30 秒，Caddy 自动签 Let's Encrypt 证书
docker compose logs -f caddy
curl https://synkord.yourcompany.com/api/health
```

防火墙只开 80 / 443 即可。

---

## 升级

```bash
# 1. 备份（务必）
./backup.sh

# 2. 改 .env 里的 SYNKORD_IMAGE_TAG 到新版本
vi .env
#   SYNKORD_IMAGE_TAG=0.4.0

# 3. 拉新镜像 + 重启
docker compose pull
docker compose up -d        # 不用 --profile https 的话会跳过 Caddy
docker compose logs -f synkord
```

数据卷（`./data`）完全不动，零停机升级。

---

## 日常运维

### 备份

```bash
./backup.sh
# 备份到 ./backups/backup-YYYYmmdd-HHMMSS.db
```

加 cron（每天 03:00）：

```bash
sudo crontab -e
# 加一行：
0 3 * * * cd /opt/synkord && ./backup.sh >> /var/log/synkord-backup.log 2>&1
```

异地备份（推到 S3 / OSS）：

```bash
# 备份完后同步
0 3 * * * cd /opt/synkord && ./backup.sh && aws s3 sync ./backups s3://your-bucket/synkord-backups
```

### 还原

```bash
docker compose stop synkord
cp ./backups/backup-20260708-030000.db ./data/synkord.db
chown 65532:65532 ./data/synkord.db
docker compose up -d
curl http://localhost:8000/health
```

### 查看日志

```bash
docker compose logs -f synkord                  # 实时跟踪
docker compose logs --tail=200 synkord         # 最近 200 行
docker compose logs --since 1h synkord         # 最近 1 小时
```

Caddy 访问日志（HTTPS 模式）：

```bash
docker compose exec caddy cat /data/access.log | tail
```

### 健康检查

```bash
curl -s http://localhost:8000/health | jq
# 期望：
# { "status": "ok", "service": "synkord-core", "components": { "database": "ok" } }
```

`docker compose ps` 里 `synkord` 显示 `healthy` 表示数据库连接正常。

### 重启 / 停止

```bash
docker compose restart synkord
docker compose stop
docker compose down                # 停 + 删容器（数据卷 ./data 不动）
```

### 完全重置（危险）

```bash
docker compose down -v              # ⚠️ 删容器 + 删 named volume（./data 不受影响）
rm -rf ./data ./backups             # 想真清掉就连数据一起删
```

---

## 升级路径

| 团队规模 | 建议 |
|---|---|
| 5–50 人 | 保持本配置 |
| 50–100 人 | 调高资源 limits（`.deploy.resources.limits`），SQLite 仍够 |
| 100+ 人 | 迁移到 PostgreSQL（[docs/deployment.md §4.1](../../docs/deployment.md#4-生产环境升级路径)）|
| 多副本 | 加 Redis 做 session 共享；synkord-core 改为无状态 |

---

## 安全清单

- [ ] `SYNKORD_JWT_SECRET` 用 `openssl rand -hex 32` 生成，**不**用示例值
- [ ] 登录后立即改默认 admin 密码（`admin123`）
- [ ] 内部模式：服务端口 8000 只在 trusted 网络（内网 / Tailscale / Tunnel）开放
- [ ] HTTPS 模式：服务器防火墙只开 80 / 443
- [ ] 定期 `./backup.sh`，备份推到异地
- [ ] 定期升级：`docker compose pull && docker compose up -d`
- [ ] SSH 改密钥登录，关密码登录
- [ ] 服务器时间同步（`timedatectl` / chrony）

---

## 文件结构

```
deploy/docker/
├── docker-compose.yml    # 主 compose（synkord 必选 + caddy https profile 可选）
├── Caddyfile             # 仅 https profile 用，自动签 Let's Encrypt
├── .env.example          # 环境变量模板
├── .gitignore            # 忽略 .env / data / backups
├── backup.sh             # 一键备份到 ./backups/
└── README.md             # 本文件
```

部署目录（运行时的样子）：

```
/opt/synkord/
├── docker-compose.yml
├── Caddyfile
├── .env                  # 实际配置（gitignore）
├── data/                 # bind-mount，.db 文件在这
│   └── synkord.db
└── backups/              # 备份文件
    └── backup-20260708-030000.db
```
