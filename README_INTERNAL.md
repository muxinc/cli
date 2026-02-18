# Internal: Publishing

## How npm distribution works

The `@mux/cli` npm package is a thin Node.js shim. When a user runs `npm install -g @mux/cli`, npm installs the matching platform-specific binary package via `optionalDependencies`:

| Package | Platform |
|---|---|
| `@mux/cli-darwin-arm64` | macOS Apple Silicon |
| `@mux/cli-darwin-x64` | macOS Intel |
| `@mux/cli-linux-x64` | Linux x64 |
| `@mux/cli-linux-arm64` | Linux ARM64 |

The shim (`bin/mux`) detects the platform and spawns the correct binary.

## Publishing a release

Releases are published automatically via GitHub Actions using [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC, no tokens required).

### 1. Tag the release

```bash
git tag v1.0.0
git push origin v1.0.0
```

For pre-release versions, the npm dist-tag is inferred from the version string:

```bash
git tag v1.0.0-beta.1   # publishes to "beta" tag
git tag v1.0.0-rc.1      # publishes to "rc" tag
git tag v1.0.0            # publishes to "latest" tag
```

### 2. What happens

The `release.yml` workflow:

1. **Build** -- Compiles binaries on 4 platform-specific runners (macOS, Linux)
2. **Release** -- Creates a GitHub Release with the binaries attached
3. **Publish** -- Runs `scripts/publish.sh` which:
   - Sets the version across all 5 `package.json` files
   - Copies each binary into its platform package
   - Publishes all 4 platform packages to npm
   - Publishes the main `@mux/cli` package from a staging directory (stripped of dev dependencies)

### 3. Verify

```bash
npm view @mux/cli versions --json
npx @mux/cli@latest --help
```

## Publishing locally

You can publish from your local machine for testing. Only your current platform binary will be built (cross-compilation fails due to native dependencies).

```bash
./scripts/publish.sh 1.0.0-beta.1
```

This will:
- Build binaries for all platforms it can (skips failures)
- Sync versions across all packages
- Publish platform packages that have binaries
- Publish the main `@mux/cli` package

You must be logged into npm with access to the `@mux` org.

## Trusted Publisher setup

Each of the 5 npm packages is configured with a Trusted Publisher on npmjs.com:

- **Organization**: `muxinc`
- **Repository**: `cli`
- **Workflow**: `release.yml`

This allows the GitHub Actions workflow to publish without npm tokens. If a new platform package is added, configure the Trusted Publisher in its npmjs.com settings.
