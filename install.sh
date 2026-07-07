#!/bin/sh
# Synkord CLI 一键安装
# 用法：curl -fsSL https://synkord.dev/install.sh | sh
# 或：  curl -fsSL https://synkord.dev/install.sh | sh -s -- --version v0.1.0
#
# 检测 OS / 架构 → 从 GitHub Releases 下载对应二进制 → 安装到 /usr/local/bin
set -e

REPO="${SYNKORD_REPO:-synkord/synkord}"
BIN="synkord"
VERSION=""

# 解析参数
while [ $# -gt 0 ]; do
    case "$1" in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --repo)
            REPO="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--version vX.Y.Z] [--repo owner/name]"
            exit 0
            ;;
        *)
            echo "Unknown arg: $1" >&2
            exit 1
            ;;
    esac
done

# 检测 OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
    linux)  OS="linux"  ;;
    darwin) OS="darwin" ;;
    mingw*|msys*|cygwin*) OS="windows" ;;
    *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

# 检测架构
ARCH=$(uname -m)
case "$ARCH" in
    x86_64|amd64)  ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    i386|i686)     ARCH="386" ;;
    *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

# 组装 asset 名（与 .github/workflows/release.yml 一致）
EXT=""
[ "$OS" = "windows" ] && EXT=".exe"
ASSET="synkord-cli-${OS}-${ARCH}${EXT}"

# 版本：默认 latest
if [ -z "$VERSION" ]; then
    VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep '"tag_name"' | head -1 | sed -E 's/.*"v?([^"]+)".*/\1/')
    [ -z "$VERSION" ] && { echo "Failed to resolve latest version" >&2; exit 1; }
    VERSION="v${VERSION}"
fi

# 下载
URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "Downloading ${URL}"
if ! curl -fsSL -o "${TMP}/${BIN}${EXT}" "$URL"; then
    echo "Failed: ${URL}" >&2
    echo "Available assets: https://github.com/${REPO}/releases/tag/${VERSION}" >&2
    exit 1
fi

chmod +x "${TMP}/${BIN}${EXT}"

# 安装路径
if [ "$(id -u)" = "0" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="${HOME}/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

# Windows 上没法 chmod +x，cp 即可
cp "${TMP}/${BIN}${EXT}" "${INSTALL_DIR}/${BIN}${EXT}"
echo "Installed to ${INSTALL_DIR}/${BIN}${EXT}"
echo ""
echo "Run '${BIN} version' to verify."
echo "Run '${BIN} login --server https://your-synkord-host' to get started."
