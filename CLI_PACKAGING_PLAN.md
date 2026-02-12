# CLI Packaging & Distribution Plan

## Goal

Make `@mux/cli` installable without requiring Bun, Node.js, or any runtime — just a standalone binary.

## Installation Methods

| Method | Command | Requires |
|---|---|---|
| Shell script | `curl -fsSL https://raw.githubusercontent.com/muxinc/cli/master/install.sh \| bash` | curl (we can put this behind a vaniy cli.mux.dev/install.sh URL) |
| npm | `npm install -g @mux/cli` | Node.js |
| npx | `npx @mux/cli@latest` | Node.js |
| Manual | Download from [GitHub Releases](https://github.com/muxinc/cli/releases) | — |

## How It Works

### Standalone binary (via `bun build --compile`)

Bun compiles the entire CLI — TypeScript source, dependencies, and runtime — into a single self-contained binary. No runtime needed on the user's machine.

We cross-compile for 4 targets:
- `darwin-arm64` (macOS Apple Silicon)
- `darwin-x64` (macOS Intel)
- `linux-x64`
- `linux-arm64`

### npm distribution (optionalDependencies pattern)

This is the same approach used by **Biome**, **esbuild**, **Turbo**, and **Bun** for distributing native binaries via npm.

The main `@mux/cli` package contains a tiny Node.js shim (`bin/mux`) that detects the user's platform and delegates to the correct platform-specific package. npm's `optionalDependencies` with `os`/`cpu` fields ensures only the matching binary is downloaded.

```
@mux/cli                        ← main package (shim only, ~2KB)
├── @mux/cli-darwin-arm64        ← macOS ARM binary (~66MB)
├── @mux/cli-darwin-x64          ← macOS Intel binary
├── @mux/cli-linux-x64           ← Linux x64 binary
└── @mux/cli-linux-arm64         ← Linux ARM binary
```

Users only download one binary — npm filters out the rest automatically.

### Shell installer (`install.sh`)

A simple shell script that:
1. Detects OS and architecture
2. Fetches the latest release from GitHub
3. Downloads the correct binary
4. Installs to `~/.mux/bin/`

Supports `MUX_VERSION` and `MUX_INSTALL_DIR` env vars for customization.

## Release Process

On `git tag v1.x.x && git push --tags`:

1. CI builds 4 platform binaries
2. Publishes each platform binary as its own npm package (`@mux/cli-{os}-{arch}`)
3. Publishes the main `@mux/cli` package (with the shim)
4. Creates a GitHub Release with the binaries attached

All 5 npm packages share the same version number.

## Repository Structure

```
bin/mux                                  ← Node.js shim (checked in)
install.sh                               ← Shell installer (checked in)
packages/@mux/cli-darwin-arm64/          ← Platform package.json only (binary added at publish time)
packages/@mux/cli-darwin-x64/
packages/@mux/cli-linux-x64/
packages/@mux/cli-linux-arm64/
```

## Prerequisites

- `NPM_TOKEN` secret in GitHub repo settings for npm publishing
- npm org access to publish `@mux/cli-*` packages
