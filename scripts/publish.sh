#!/bin/sh
set -euo pipefail

# Publish @mux/cli and platform packages to npm.
#
# Usage:
#   ./scripts/publish.sh <version> [binary-dir]
#
# Examples:
#   ./scripts/publish.sh 1.0.0-beta.1            # local: builds what it can, publishes those
#   ./scripts/publish.sh 1.0.0 ./artifacts        # CI: all binaries pre-built

VERSION="${1:?Usage: scripts/publish.sh <version> [binary-dir]}"
BINARY_DIR="${2:-./dist}"
TARGETS="darwin-arm64 darwin-x64 linux-x64 linux-arm64"

# Use --provenance in CI (requires OIDC token), skip locally
PROVENANCE=""
if [ -n "${CI:-}" ]; then
  PROVENANCE="--provenance"
fi

# Detect npm tag from version string
# e.g. 1.0.0-beta.1 -> beta, 1.0.0-rc.1 -> rc, 1.0.0 -> latest
if echo "$VERSION" | grep -qE '\-'; then
  NPM_TAG=$(echo "$VERSION" | sed 's/.*-\([a-zA-Z]*\).*/\1/')
else
  NPM_TAG="latest"
fi

echo "Version: $VERSION"
echo "Tag: $NPM_TAG"
echo "Binaries: $BINARY_DIR"
echo ""

# Build binaries for any missing platforms, skipping failures (e.g. native deps)
mkdir -p "$BINARY_DIR"
for target in $TARGETS; do
  if [ ! -f "$BINARY_DIR/mux-${target}" ]; then
    echo "Building mux-${target}..."
    if bun build --compile --minify --sourcemap ./src/index.ts --target=bun-${target} --outfile "$BINARY_DIR/mux-${target}" 2>/dev/null; then
      echo "  Built mux-${target}"
    else
      echo "  Skipping mux-${target} (build failed, likely missing native deps)"
    fi
  fi
done

echo ""

# Sync version across all platform package.json files
for target in $TARGETS; do
  pkg="./packages/@mux/cli-${target}/package.json"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
    pkg.version = '$VERSION';
    fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2) + '\n');
  "
done

# Sync version in main package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Synced version $VERSION across all packages"
echo ""

# Publish platform packages (only those with binaries)
PUBLISHED=0
for target in $TARGETS; do
  if [ ! -f "$BINARY_DIR/mux-${target}" ]; then
    echo "Skipping @mux/cli-${target} (no binary)"
    continue
  fi

  pkg_dir="./packages/@mux/cli-${target}"
  cp "$BINARY_DIR/mux-${target}" "${pkg_dir}/mux"
  echo "Publishing @mux/cli-${target}@${VERSION}..."
  (cd "$pkg_dir" && npm publish --access public --tag "$NPM_TAG" $PROVENANCE)
  rm -f "${pkg_dir}/mux"
  PUBLISHED=$((PUBLISHED + 1))
done

echo ""

if [ "$PUBLISHED" -eq 0 ]; then
  echo "No platform packages were published. Aborting."
  exit 1
fi

# Publish main package from a staging directory so the root package.json
# is never modified. The published package is just a shim — no runtime deps.
STAGING="$(mktemp -d)"
trap "rm -rf $STAGING" EXIT

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  delete pkg.dependencies;
  delete pkg.devDependencies;
  delete pkg.peerDependencies;
  delete pkg.scripts;
  delete pkg.type;
  pkg.optionalDependencies = {
    '@mux/cli-darwin-arm64': '$VERSION',
    '@mux/cli-darwin-x64': '$VERSION',
    '@mux/cli-linux-x64': '$VERSION',
    '@mux/cli-linux-arm64': '$VERSION',
  };
  fs.writeFileSync('$STAGING/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
cp -r bin "$STAGING/bin"
cp README.md LICENSE "$STAGING/"

echo "Publishing @mux/cli@${VERSION}..."
(cd "$STAGING" && npm publish --access public --tag "$NPM_TAG" $PROVENANCE)

echo ""
echo "Published $PUBLISHED of 4 platform packages."
echo "Install with: npm install -g @mux/cli@${NPM_TAG}"
