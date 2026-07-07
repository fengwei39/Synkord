#!/usr/bin/env bash
# Synkord 服务端初始化脚本（内部部署用）
# 用法：
#   sudo ./init-db.sh                          # 第一次部署：建数据目录 + 空 .db
#   sudo ./init-db.sh --reset                   # 危险：删旧 .db 重建（备份旧文件）
#
# 假设：
#   - synkord-core 已经解压到 /opt/synkord/
#   - 用 systemd 管理（synkord.service）
#   - 数据目录：/var/lib/synkord
#   - 配置目录：/etc/synkord

set -euo pipefail

INSTALL_DIR="/opt/synkord"
DATA_DIR="/var/lib/synkord"
CONFIG_DIR="/etc/synkord"
DB_FILE="$DATA_DIR/synkord.db"
SERVICE_FILE="/etc/systemd/system/synkord.service"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

err() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# 1. 检查 root
if [ "$(id -u)" != "0" ]; then
  err "需要 root 权限。运行：sudo $0"
  exit 1
fi

# 2. 检查 synkord-core
if [ ! -f "$INSTALL_DIR/synkord-core" ]; then
  err "找不到 $INSTALL_DIR/synkord-core"
  err "请先解压服务端包："
  err "  mkdir -p /opt/synkord"
  err "  cp synkord-core-linux-amd64 /opt/synkord/synkord-core"
  err "  tar -xzf synkord-sqlite-deploy-X.Y.Z.tar.gz -C /opt/synkord"
  exit 1
fi
chmod +x "$INSTALL_DIR/synkord-core"
ok "synkord-core 权限 +x"

# 3. 解析 reset 参数
RESET=0
if [ "${1:-}" = "--reset" ]; then
  warn "检测到 --reset：将备份旧 DB 并重建"
  RESET=1
fi

# 4. 备份旧 DB（如果存在且不是 reset）
if [ -f "$DB_FILE" ] && [ "$RESET" = "0" ]; then
  err "已存在 $DB_FILE"
  err "如确认重新初始化，先备份再跑："
  err "  sudo cp $DB_FILE $DB_FILE.bak.\$(date +%F)"
  err "  sudo $0 --reset"
  exit 1
fi

# 5. 创建目录
mkdir -p "$DATA_DIR" "$CONFIG_DIR"
chmod 750 "$DATA_DIR" "$CONFIG_DIR"
ok "创建数据目录 $DATA_DIR"
ok "创建配置目录 $CONFIG_DIR"

# 6. reset 时备份旧 DB
if [ "$RESET" = "1" ] && [ -f "$DB_FILE" ]; then
  BAK="$DB_FILE.bak.$(date +%F-%H%M%S)"
  mv "$DB_FILE" "$BAK"
  warn "旧 DB 已备份到 $BAK"
fi

# 7. 生成随机密钥（如未配置）
if [ ! -f "$CONFIG_DIR/synkord.env" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  MCP_TOKEN=$(openssl rand -hex 32)
  cat > "$CONFIG_DIR/synkord.env" <<EOF
# Synkord 服务端环境变量（由 init-db.sh 自动生成）
# 修改后需重启：sudo systemctl restart synkord

# 必填：JWT 签名密钥（改了所有旧 token 失效）
SYNKORD_JWT_SECRET=$JWT_SECRET

# 必填：MCP 工具调用鉴权 token
SYNKORD_MCP_TOKEN=$MCP_TOKEN

# 端口（默认 8000）
SYNKORD_PORT=8000

# 数据目录（不要改，init 脚本固定）
SYNKORD_DB_PATH=$DB_FILE

# 时区
TZ=Asia/Shanghai

# CORS 白名单（多个用逗号分隔；* 表示全开）
# 内部部署推荐填前端访问的域名，例如 https://synkord.yourcompany.com
SYNKORD_CORS_ORIGINS=
EOF
  chmod 600 "$CONFIG_DIR/synkord.env"
  ok "生成 $CONFIG_DIR/synkord.env（已随机化 JWT_SECRET + MCP_TOKEN）"
  warn "请妥善备份这两个密钥！丢了 = 所有用户重新登录"
else
  ok "$CONFIG_DIR/synkord.env 已存在，跳过生成"
fi

# 8. 安装 systemd service
if [ ! -f "$SERVICE_FILE" ]; then
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Synkord Core (API server)
After=network.target

[Service]
Type=simple
User=synkord
Group=synkord
WorkingDirectory=/opt/synkord
EnvironmentFile=/etc/synkord/synkord.env
ExecStart=/opt/synkord/synkord-core
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

# 安全加固
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/synkord
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
  ok "创建 $SERVICE_FILE"
else
  ok "$SERVICE_FILE 已存在，跳过创建"
fi

# 9. 创建系统用户
if ! id synkord &>/dev/null; then
  useradd --system --home /var/lib/synkord --shell /usr/sbin/nologin --comment "Synkord service account" synkord
  ok "创建系统用户 synkord"
fi
chown -R synkord:synkord "$DATA_DIR" "$CONFIG_DIR" "$INSTALL_DIR"
ok "目录权限调整到 synkord:synkord"

# 10. 启动服务（如果 .db 还没创建，synkord-core 首次启动会 AutoMigrate 建表 + 建默认 admin）
systemctl daemon-reload
systemctl enable synkord.service
ok "systemd enable synkord.service"
systemctl restart synkord.service
ok "systemd restart synkord.service"

# 11. 等待启动
echo "等待服务启动..."
for i in 1 2 3 4 5; do
  if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
    ok "服务已起来（http://127.0.0.1:8000/health）"
    break
  fi
  sleep 1
done

# 12. 提示
echo ""
echo "=========================================="
echo "  初始化完成"
echo "=========================================="
echo ""
echo "  数据文件： $DB_FILE"
echo "  配置文件： $CONFIG_DIR/synkord.env"
echo "  服务管理： systemctl {start|stop|status} synkord"
echo "  日志查看： journalctl -u synkord -f"
echo ""
echo "  接下来："
echo "  1. 编辑 $CONFIG_DIR/synkord.env"
echo "     - 把 SYNKORD_CORS_ORIGINS 改成前端访问的域名"
echo "       （多个用逗号分隔，或填 * 全开）"
echo "  2. sudo systemctl restart synkord"
echo "  3. 用浏览器或客户端访问 http(s)://<你的服务器域名>"
echo "  4. 默认 admin 账号："
echo "     用户名：admin"
echo "     密码：admin123（首次登录后立即改！）"
echo ""
ok "完成 ✓"
