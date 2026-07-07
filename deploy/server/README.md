# Synkord 服务端部署指南（内部团队用）

> 这台服务器就是放 1 份，**所有员工共享**。

## 0. 你需要什么

| 项 | 说明 |
|---|---|
| Linux x64 服务器 | 1 台，2C2G 起步（Ubuntu 22.04 LTS 推荐）|
| 公网 IP / 域名 | 如 `synkord.yourcompany.com`，DNS A 记录到服务器 |
| 这 2 个发布包 | `synkord-core-linux-amd64`（Go 后端）+ `synkord-sqlite-deploy-X.Y.Z.tar.gz`（SQLite 初始化 / 备份 / Caddy / README）|
| SSH 登录 | 用密钥，不用密码 |

管理员只部署这一台后端服务。其他成员不需要部署 Go 或 SQLite，只安装 macOS / Windows 客户端，然后在登录页填写服务器域名。

## 1. 准备服务器（一次性）

```bash
# 1.1 安装 Caddy（用 caddy 官方源，自动续 Let's Encrypt）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/deb/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# 1.2 安装 sqlite3 CLI（用于 backup / inspect，可选但强烈推荐）
sudo apt install -y sqlite3

# 1.3 安装 Go 后端二进制和 SQLite 部署包
sudo mkdir -p /opt/synkord
sudo cp synkord-core-linux-amd64 /opt/synkord/synkord-core
sudo chmod +x /opt/synkord/synkord-core
sudo tar -xzf synkord-sqlite-deploy-X.Y.Z.tar.gz -C /opt/synkord

# 1.4 把 Caddyfile 放好
sudo cp /opt/synkord/Caddyfile /etc/caddy/Caddyfile
# 编辑 /etc/caddy/Caddyfile 改域名和邮箱
sudo vi /etc/caddy/Caddyfile
```

## 2. 一键初始化数据库

```bash
sudo /opt/synkord/init-db.sh
```

这个脚本会做：
1. 验证 `synkord-core` 在 `/opt/synkord/`
2. 创建系统用户 `synkord`（不登录）
3. 创建数据目录 `/var/lib/synkord`（权限 750）
4. 生成配置 `/etc/synkord/synkord.env`（**自动生成强随机 JWT_SECRET 和 MCP_TOKEN**）
5. 第一次启动 synkord-core → **自动建表 + 创建默认 admin 用户**（admin / admin123）
6. 装 systemd unit `/etc/systemd/system/synkord.service`
7. 启动服务并探活

## 3. 配置 CORS（必须）

```bash
sudo vi /etc/synkord/synkord.env
```

找到 `SYNKORD_CORS_ORIGINS=`，改成前端访问的域名（**必须有协议头**）：

```bash
# 内部员工用什么地址访问就填什么
SYNKORD_CORS_ORIGINS=https://synkord.yourcompany.com

# 多域名用逗号
# SYNKORD_CORS_ORIGINS=https://synkord.yourcompany.com,https://admin.yourcompany.com

# 测试时临时全开（生产别用！）
# SYNKORD_CORS_ORIGINS=*
```

保存后重启服务：

```bash
sudo systemctl restart synkord
```

## 4. 启动 Caddy

```bash
# 4.1 验证 Caddyfile 语法
sudo caddy validate --config /etc/caddy/Caddyfile

# 4.2 启动
sudo systemctl reload caddy
sudo systemctl status caddy

# 4.3 看日志
sudo journalctl -u caddy -f
```

Caddy 第一次启动会自动申请 Let's Encrypt 证书，约 30 秒。

## 5. 验证

```bash
# 健康检查
curl https://synkord.yourcompany.com/health
# 期望：{"status":"ok","service":"synkord-core","version":"v0.1.0",...}

# 看 synkord 服务日志
sudo journalctl -u synkord -f
```

## 6. 通知员工配置

邮件 / 钉钉 / 飞书群发：

```
Synkord 内部部署已上线

下载地址：
  macOS:    https://github.com/fengwei39/Synkord/releases/download/v0.1.0/Synkord-0.1.0-arm64.dmg
  Windows:  https://github.com/fengwei39/Synkord/releases/download/v0.1.0/Synkord-Setup-0.1.0-x64.exe

首次打开后：
  1. 登录页填入服务器地址：https://synkord.yourcompany.com
  2. 账号：admin  密码：admin123
  3. 登录后立即改密码（设置 → 修改密码）
  4. 如需切换地址：设置 → 后端连接 → 服务器域名
```

员工首次打开会看到登录页有橙色的"首次使用，请配置服务器地址"提示。

## 7. 日常运维

### 改密码 / 改配置

```bash
sudo vi /etc/synkord/synkord.env
sudo systemctl restart synkord
```

### 备份（推荐每天 1 次）

```bash
# 加 cron
sudo crontab -e
# 加一行（每天 03:00 备份，保留 30 天）：
0 3 * * * /opt/synkord/backup.sh /var/backups/synkord 30
```

或异地备份（推到 S3 / OSS）：

```bash
# 简单版：本地备份后同步到对象存储
0 3 * * * /opt/synkord/backup.sh /var/backups/synkord 30 \
  && aws s3 sync /var/backups/synkord s3://your-bucket/synkord-backups
```

### 还原

```bash
sudo systemctl stop synkord
sudo cp /var/backups/synkord-2026-07-07-030000.db /var/lib/synkord/synkord.db
sudo chown synkord:synkord /var/lib/synkord/synkord.db
sudo systemctl start synkord
```

### 监控（推荐）

```bash
# 装 UptimeRobot 或类似，探 /health，5 分钟一次
# 探活 URL：https://synkord.yourcompany.com/health
```

### 升级

```bash
# 1. 备份（务必）
sudo /opt/synkord/backup.sh

# 2. 下新版本二进制替换
sudo systemctl stop synkord
sudo cp synkord-core-new /opt/synkord/synkord-core
sudo chmod +x /opt/synkord/synkord-core
sudo systemctl start synkord

# 3. 验证
curl https://synkord.yourcompany.com/health
```

## 8. 故障排查

| 症状 | 排查 |
|---|---|
| 客户端登录报 network error | 1) 服务 `systemctl status synkord` 2) 端口 `ss -tlnp \| grep 8000` 3) Caddy `journalctl -u caddy` 4) 客户端登录页域名是否写对 |
| 客户端登录报 401/密码错 | admin 密码忘了 → `sudo sqlite3 /var/lib/synkord/synkord.db "UPDATE users SET hashed_password='xxx' WHERE username='admin'"`（用 `HashPassword` 工具）|
| CORS 错 | 服务端 `SYNKORD_CORS_ORIGINS` 漏了 / 协议头写错 / 域名拼错 |
| 性能差 | `journalctl -u synkord` 看 DB lock 等；50 人内 SQLite 足够，超过换 PostgreSQL |
| DB 锁 | 重启服务即可（`systemctl restart synkord`）|

## 9. 不在本文档范围（按需查）

- 升级 PostgreSQL（100+ 人时）：[docs/deployment.md §4.1](../../docs/deployment.md#4-生产环境升级路径)
- HA / 多副本：[docs/deployment.md §4.2](../../docs/deployment.md#4-生产环境升级路径)
- MCP 工具列表：[docs/mcp-user-guide.md](../../docs/mcp-user-guide.md)
