#!/usr/bin/env bash
# scripts/bump-version.sh
#
# 同步版本号到 2 处（其他位置由 ldflags / electron-builder 在构建时覆盖）：
#   - VERSION                   根目录版本文件（单一事实源）
#   - frontend/package.json     桌面端 electron-builder 读取
#
# backend / synkord-cli 的 var version 在构建时由 -ldflags "-X main.version=..."
# 注入（见 .github/workflows/release.yml），所以源码里写什么不重要。
#
# 用法：
#   ./scripts/bump-version.sh patch    # 0.1.0 → 0.1.1
#   ./scripts/bump-version.sh minor    # 0.1.0 → 0.2.0
#   ./scripts/bump-version.sh major    # 0.1.0 → 1.0.0
#   ./scripts/bump-version.sh 0.2.5    # 直接指定
#
# 发布流程（maintainer 用）：
#   1. 合并 dev → main 后
#   2. ./scripts/bump-version.sh minor
#   3. git add VERSION frontend/package.json
#   4. git commit -m "chore(release): bump version to 0.2.0"
#   5. git tag v0.2.0 && git push origin main --tags
#   6. .github/workflows/release.yml 自动跑：构建 3 平台 + Docker + GitHub Release

set -euo pipefail

BUMP_TYPE="${1:-}"
if [ -z "$BUMP_TYPE" ]; then
  echo "Usage: $0 {patch|minor|major|X.Y.Z}" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$ROOT/VERSION"
CURRENT="$(tr -d '[:space:]' < "$VERSION_FILE")"

bump_version() {
  local current="$1"
  local bump_type="$2"
  IFS='.' read -r major minor patch <<< "$current"
  case "$bump_type" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *)
      if [[ "$bump_type" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "$bump_type"
      else
        echo "Invalid version: $bump_type" >&2
        exit 1
      fi
      ;;
  esac
}

NEW_VERSION="$(bump_version "$CURRENT" "$BUMP_TYPE")"
echo "Version: $CURRENT → $NEW_VERSION"

# ----------------------------------------------------------------------------
# 1. VERSION 文件
# ----------------------------------------------------------------------------
echo "$NEW_VERSION" > "$VERSION_FILE"
echo "  ✓ $VERSION_FILE"

# ----------------------------------------------------------------------------
# 2. frontend/package.json（electron-builder 读取这里的 version）
# ----------------------------------------------------------------------------
PKG_JSON="$ROOT/frontend/package.json"
if [ -f "$PKG_JSON" ]; then
  # Windows 下用 cygpath 把 MSYS 路径转成 node 可识别的路径
  NODE_PATH_ARG="$PKG_JSON"
  if command -v cygpath >/dev/null 2>&1; then
    NODE_PATH_ARG="$(cygpath -w "$PKG_JSON")"
  fi
  node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync(process.argv[1], JSON.stringify(pkg, null, 2) + '\n');
" "$NODE_PATH_ARG"
  echo "  ✓ $PKG_JSON"
fi

# ----------------------------------------------------------------------------
# 不再修改 backend/main.go 和 synkord-cli/main.go：
# 这两个文件里的 var version 由 release.yml 通过 -ldflags 注入实际版本。
# 默认值 \"dev\" 足够。
# ----------------------------------------------------------------------------

echo ""
echo "Next steps:"
echo "  git add VERSION frontend/package.json"
echo "  git commit -m 'chore(release): bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
echo "  git push origin main --tags"
echo ""
echo "Then .github/workflows/release.yml auto-runs:"
echo "  - 3 平台后端 / CLI / 桌面端二进制（用 -ldflags 注入 $NEW_VERSION）"
echo "  - Docker 镜像：ghcr.io/synkord/synkord-core:$NEW_VERSION"
echo "  - GitHub Release v$NEW_VERSION"
