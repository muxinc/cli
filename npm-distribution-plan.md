# Plan: npm optionalDependencies for @mux/cli binary distribution

## Context

The Mux CLI currently builds to a Bun-targeted ESM script (`dist/index.js`) with a `#!/usr/bin/env bun` shebang. This means `npm install -g @mux/cli` requires users to have Bun installed, which is a poor experience. We also build standalone binaries via `bun build --compile` for GitHub Releases, but there's no seamless bridge between npm install and those binaries.

The goal is to make `npm install -g @mux/cli` (or `npx @mux/cli`) work on any system with Node.js — no Bun required — by shipping platform-specific binaries as separate npm packages and using the `optionalDependencies` pattern that Biome, esbuild, Turbo, and Bun itself all use.

Additionally, we'll provide a shell installer script as an alternative for users who don't use npm.

## Installation methods (after implementation)

| Method | Requires | Command |
|---|---|---|
| Shell installer | curl | `curl -fsSL https://raw.githubusercontent.com/muxinc/cli/master/install.sh \| bash` |
| npm global | Node.js | `npm install -g @mux/cli` |
| npx (one-off) | Node.js | `npx @mux/cli@latest` |
| GitHub Releases | browser | Download binary from Releases page |

## How the npm distribution works

```
npm install -g @mux/cli
         │
         ▼
  ┌──────────────────────┐
  │  @mux/cli             │  ← main package (thin shim)
  │  bin/mux (Node.js)    │
  │  optionalDependencies │
  └──────┬───────────────┘
         │ npm reads os/cpu fields and only installs the matching one:
         ▼
  ┌─────────────────────────┐
  │ @mux/cli-darwin-arm64   │  ← contains the compiled binary
  │ os: ["darwin"]          │
  │ cpu: ["arm64"]          │
  │ └── mux (66MB binary)  │
  └─────────────────────────┘

When user runs `mux`:
  1. Node.js executes bin/mux (the shim)
  2. Shim detects process.platform + process.arch
  3. require.resolve("@mux/cli-darwin-arm64/mux")
  4. spawnSync(binaryPath, process.argv.slice(2))
```

This is the same pattern used by [Biome](https://biomejs.dev/), [esbuild](https://esbuild.github.io/), [Turbo](https://turbo.build/), and [Bun](https://bun.sh/).

## Packages to create

### Main package: `@mux/cli`

The existing package, restructured:

**`package.json`** changes:
```json
{
  "bin": {
    "mux": "bin/mux"
  },
  "optionalDependencies": {
    "@mux/cli-darwin-arm64": "1.0.0",
    "@mux/cli-darwin-x64": "1.0.0",
    "@mux/cli-linux-x64": "1.0.0",
    "@mux/cli-linux-arm64": "1.0.0"
  },
  "files": [
    "bin",
    "README.md",
    "LICENSE"
  ]
}
```

- Remove `dist` from `files` — the main package no longer ships built JS
- `bin` points to `bin/mux` (a Node.js shim, not the Bun-built output)

**`bin/mux`** — A `#!/usr/bin/env node` script (~40 lines) modeled after Biome's:
```js
#!/usr/bin/env node
const { platform, arch, env } = process;

const PLATFORMS = {
  darwin: {
    x64: "@mux/cli-darwin-x64/mux",
    arm64: "@mux/cli-darwin-arm64/mux",
  },
  linux: {
    x64: "@mux/cli-linux-x64/mux",
    arm64: "@mux/cli-linux-arm64/mux",
  },
};

const binPath = env.MUX_BINARY || PLATFORMS?.[platform]?.[arch];

if (binPath) {
  const result = require("child_process").spawnSync(
    require.resolve(binPath),
    process.argv.slice(2),
    { shell: false, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status;
} else {
  console.error(
    `The Mux CLI doesn't ship prebuilt binaries for your platform (${platform}/${arch}) yet.\n` +
    "You can build from source: https://github.com/muxinc/cli"
  );
  process.exitCode = 1;
}
```

### Platform packages: `@mux/cli-{os}-{arch}`

Four packages, each containing only the binary + package.json:

| Package | os | cpu |
|---|---|---|
| `@mux/cli-darwin-arm64` | `["darwin"]` | `["arm64"]` |
| `@mux/cli-darwin-x64` | `["darwin"]` | `["x64"]` |
| `@mux/cli-linux-x64` | `["linux"]` | `["x64"]` |
| `@mux/cli-linux-arm64` | `["linux"]` | `["arm64"]` |

Each platform package.json:
```json
{
  "name": "@mux/cli-darwin-arm64",
  "version": "1.0.0",
  "description": "Platform-specific binary for @mux/cli (macOS ARM64)",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/muxinc/cli.git"
  },
  "os": ["darwin"],
  "cpu": ["arm64"],
  "publishConfig": {
    "access": "public"
  }
}
```

Contents of each platform package (binary is added at publish time, not checked in):
```
@mux/cli-darwin-arm64/
├── package.json
└── mux              ← the compiled binary
```

## Repository structure

Add a `packages/` directory at the repo root:

```
packages/
├── @mux/cli-darwin-arm64/
│   └── package.json
├── @mux/cli-darwin-x64/
│   └── package.json
├── @mux/cli-linux-x64/
│   └── package.json
└── @mux/cli-linux-arm64/
    └── package.json
```

The binaries are NOT checked in — the release workflow builds them and copies them into the right package directory before `npm publish`.

## Shell installer script (alternative to npm)

For users who don't want to use npm, provide an `install.sh` script that downloads the correct binary from GitHub Releases and installs it to a local path.

**Usage:**
```bash
curl -fsSL https://raw.githubusercontent.com/muxinc/cli/master/install.sh | bash
```

**`install.sh`** — A POSIX shell script that:

1. Detects `OS` (`uname -s` → `darwin` or `linux`) and `ARCH` (`uname -m` → `arm64` or `x64`)
2. Determines the latest release tag via the GitHub API (`/repos/muxinc/cli/releases/latest`)
3. Constructs the download URL: `https://github.com/muxinc/cli/releases/download/${VERSION}/mux-${OS}-${ARCH}`
4. Downloads the binary with `curl`
5. Installs to `~/.mux/bin/mux` (or `$MUX_INSTALL_DIR` if set)
6. Prints instructions to add to `$PATH` if not already present

```bash
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
```

**Environment variables:**
- `MUX_VERSION` — pin to a specific version (e.g. `v1.0.0`). Defaults to latest.
- `MUX_INSTALL_DIR` — override install directory. Defaults to `~/.mux/bin`.

## Release workflow changes

Update `.github/workflows/release.yml` to:

1. Build all 4 platform binaries (already does this)
2. Copy each binary into its platform package directory
3. `npm publish` each platform package
4. `npm publish` the main `@mux/cli` package
5. Create GitHub Release with binaries (already does this)

```yaml
# After building binaries:
- name: Publish platform packages
  run: |
    for target in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
      cp ./dist/mux-${target} ./packages/@mux/cli-${target}/mux
      cd ./packages/@mux/cli-${target}
      npm publish --access public
      cd ../..
    done

- name: Publish main package
  run: npm publish --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

The workflow needs an `NPM_TOKEN` secret configured in the GitHub repo settings.

## Version management

All 5 packages must have the same version. The `optionalDependencies` in the main package.json must reference the exact version being published. Options:

- **Simple**: Manually bump version in all 5 package.json files before tagging
- **Scripted**: Add a `version` script that updates all platform package.json files to match the main package version

## What changes for existing users

- **Binary download from GitHub Releases**: No change, still works
- **`npm install -g @mux/cli`**: Now works without Bun (downloads ~66MB platform binary via optionalDependencies)
- **`npx @mux/cli`**: Now works without Bun
- **Shell installer**: `curl -fsSL .../install.sh | bash` — downloads binary directly from GitHub Releases, no npm or Node.js required
- **Development**: Still uses `bun run src/index.ts` as before

## Files to create/modify

| File | Action |
|---|---|
| `bin/mux` | Create — Node.js shim script |
| `package.json` | Modify — update `bin`, `files`, add `optionalDependencies` |
| `packages/@mux/cli-darwin-arm64/package.json` | Create |
| `packages/@mux/cli-darwin-x64/package.json` | Create |
| `packages/@mux/cli-linux-x64/package.json` | Create |
| `packages/@mux/cli-linux-arm64/package.json` | Create |
| `install.sh` | Create — Shell installer script for binary download |
| `.github/workflows/release.yml` | Modify — add npm publish steps |
| `README.md` | Modify — update install instructions with all methods |

## Verification

After implementation:
1. `npm pack --dry-run` on main package — should show `bin/mux`, `README.md`, `LICENSE` (no `dist/`)
2. Build a binary locally: `pnpm run build:binary` → copy into platform package → `npm pack --dry-run` on platform package — should show `mux` binary + `package.json`
3. Confirm the `bin/mux` shim runs correctly by: building a binary, placing it in the expected `require.resolve` path, and running `node bin/mux --help`
4. Test `install.sh` locally: `bash install.sh` — should detect platform, download binary, install to `~/.mux/bin/mux`
