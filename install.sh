#!/usr/bin/env bash
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

# Download binary
INSTALL_DIR="${MUX_INSTALL_DIR:-$HOME/.mux/bin}"
SHARE_DIR="${MUX_SHARE_DIR:-$HOME/.mux/share}"
mkdir -p "$INSTALL_DIR" "$SHARE_DIR"

DOWNLOAD_URL="https://github.com/muxinc/cli/releases/download/${VERSION}/mux-${OS}-${ARCH}"
echo "Downloading mux ${VERSION} for ${OS}-${ARCH}..."
curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/mux"
chmod +x "$INSTALL_DIR/mux"

# Download docs
DOCS_URL="https://github.com/muxinc/cli/releases/download/${VERSION}/mux-docs.tar.gz"
echo "Downloading docs..."
curl -fsSL "$DOCS_URL" -o "$SHARE_DIR/mux-docs.tar.gz"
tar -xzf "$SHARE_DIR/mux-docs.tar.gz" -C "$SHARE_DIR"
rm "$SHARE_DIR/mux-docs.tar.gz"

echo "Installed mux to $INSTALL_DIR/mux"
echo "Installed docs to $SHARE_DIR/docs/"
echo "Installed skill to $SHARE_DIR/skill/SKILL.md"

# PATH hint
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "Add to your PATH: export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
esac
