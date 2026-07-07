#!/usr/bin/env bash
# Synkord 服务端备份脚本（内部部署用）
# 用法（建议加 cron）：
#   0 3 * * * /opt/synkord/backup.sh /var/backups/synkord 30
#
# 参数：
#   $1: 备份目录（默认 /var/backups/synkord）
#   $2: 保留天数（默认 30）

set -euo pipefail

BACKUP_DIR="${1:-/var/backups/synkord}"
KEEP_DAYS="${2:-30}"
DB_FILE="/var/lib/synkord/synkord.db"
TS=$(date +%F-%H%M%S)

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "[ERROR] 找不到 $DB_FILE" >&2
  exit 1
fi

# 用 sqlite3 .backup 拿一致快照（推荐；不要直接 cp，正在写会损坏）
BAK="$BACKUP_DIR/synkord-$TS.db"
if command -v sqlite3 > /dev/null 2>&1; then
  sudo -u synkord sqlite3 "$DB_FILE" ".backup '$BAK'"
  echo "[OK] 备份到 $BAK（sqlite3 .backup）"
else
  # 没装 sqlite3 CLI 就直接 cp（要 synkord 暂时停一下更稳；或用 VACUUM INTO）
  cp "$DB_FILE" "$BAK"
  echo "[WARN] 用 cp 备份（建议 apt install sqlite3 用 .backup 命令）"
fi

# 清理旧备份
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "synkord-*.db" -mtime +$KEEP_DAYS -delete -print | wc -l)
echo "[OK] 清理 $DELETED 个超过 $KEEP_DAYS 天的旧备份"

# 统计
TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name "synkord-*.db" | wc -l)
echo "[INFO] 当前备份：$COUNT 个，共 $TOTAL"
