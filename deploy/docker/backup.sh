#!/usr/bin/env bash
# Synkord 数据库备份
# 用法：./backup.sh  （必须在 deploy/docker 目录下执行）
#
# 用 sqlite3 .backup 拿一致性快照。当前后端默认 journal_mode=DELETE，
# 通常只有 synkord.db 单文件；.backup 仍可避免运行中拷贝的不一致。
# 输出到 ./backups/backup-YYYYmmdd-HHMMSS.db

set -euo pipefail

# 切到脚本所在目录（确保 ./data 路径对）
cd "$(dirname "$0")"

# 检查容器在不在
if ! docker compose ps synkord --status running >/dev/null 2>&1; then
  echo "[ERROR] synkord 容器没在运行：docker compose up -d 先" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="backup-${TS}.db"
mkdir -p ./backups

# 容器里生成 .backup（一致性快照）
docker compose exec -T synkord \
  sqlite3 /app/data/synkord.db ".backup /app/data/${BACKUP_NAME}"

# 拷出来
cp "./data/${BACKUP_NAME}" "./backups/${BACKUP_NAME}"

# 清理容器里的临时文件
rm -f "./data/${BACKUP_NAME}"

# 报告
SIZE=$(du -h "./backups/${BACKUP_NAME}" | cut -f1)
COUNT=$(ls -1 ./backups/*.db 2>/dev/null | wc -l)
echo "[OK] 备份完成: ./backups/${BACKUP_NAME} (${SIZE})"
echo "     当前共 ${COUNT} 个备份"
