#!/bin/sh
set -euo pipefail

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
esac

# Validate platform
case "$OS-$ARCH" in
  darwin-arm64|darwin-x64|linux-x64|linux-arm64) ;;
  *) echo "Unsupported platform: $OS-$ARCH" >&2; exit 1 ;;
esac

# Get latest version
VERSION="${MUX_VERSION:-$(curl -fsSL https://api.github.com/repos/muxinc/cli/releases/latest | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//')}"

# Download
INSTALL_DIR="${MUX_INSTALL_DIR:-$HOME/.mux/bin}"
mkdir -p "$INSTALL_DIR"
DOWNLOAD_URL="https://github.com/muxinc/cli/releases/download/${VERSION}/mux-${OS}-${ARCH}"
echo "Downloading mux ${VERSION} for ${OS}-${ARCH}..."
curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/mux"
chmod +x "$INSTALL_DIR/mux"

echo "Installed mux to $INSTALL_DIR/mux"

# PATH hint
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "Add to your PATH: export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
esac
