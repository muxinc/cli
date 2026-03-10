#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS_DIR="$REPO_ROOT/docs/guides"
TMP_DIR="$(mktemp -d)"
# Use token for private repo access (CI), fall back to default git credentials (local)
if [ -n "${MUX_COM_TOKEN:-}" ]; then
  REMOTE_REPO="https://x-access-token:${MUX_COM_TOKEN}@github.com/muxinc/mux.com.git"
else
  REMOTE_REPO="https://github.com/muxinc/mux.com.git"
fi
GUIDES_PATH="apps/web/app/docs/_guides"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Syncing Mux docs from muxinc/mux.com..."

# Sparse checkout: only fetch the _guides directory
git clone --no-checkout --depth 1 --filter=blob:none --sparse "$REMOTE_REPO" "$TMP_DIR/mux.com"
cd "$TMP_DIR/mux.com"
git sparse-checkout set "$GUIDES_PATH"
git checkout

# Remove existing docs and copy fresh
rm -rf "$DOCS_DIR"
mkdir -p "$DOCS_DIR"

# Copy all .mdx files, preserving directory structure
cd "$TMP_DIR/mux.com/$GUIDES_PATH"
find . -name '*.mdx' | while read -r file; do
  dir="$(dirname "$file")"
  mkdir -p "$DOCS_DIR/$dir"
  cp "$file" "$DOCS_DIR/$file"
done

# Count synced files
FILE_COUNT=$(find "$DOCS_DIR" -name '*.mdx' | wc -l | tr -d ' ')
echo "Synced $FILE_COUNT MDX files to docs/guides/"
