# Project Notes

This file should be an ongoing collection of working notes for working with this codebase, primarily maintained by Claude.

## Claude.md suggestions

## Codebase

### Authentication & Environment Management

**Configuration Storage**
- Credentials be stored in `~/.config/mux/config.json` with secure file permissions (0o600)
- Config directory created with 0o700 permissions fer added security
- Multiple named environments supported (e.g., "production", "staging", "development")
- First environment added automatically becomes the default
- Default environment can be switched with `mux env switch <name>`

**Credential Validation**
- The `validateCredentials()` function in `/Users/mmcc/Projects/muxinc/cli/src/lib/mux.ts` validates credentials by makin' a lightweight API call to Mux (list assets with limit=1)
- Credentials be validated BEFORE bein' saved to config to prevent invalid credentials from polluting the config
- Error messages provide clear guidance fer common authentication failures (401, 403)
- Note: This function currently lacks test coverage but was manually verified. Future enhancement: add unit tests with mocked Mux API responses.

**Default Environment Logic**
- When removin' the default environment, the system automatically selects the first remaining environment as the new default
- When removin' the last environment, defaultEnvironment be set to undefined
- When only one environment exists, it's automatically used regardless of defaultEnvironment setting

**Bun Compatibility**
- Fixed `Deno.exit` → `process.exit` fer proper Bun runtime support
- All file operations use native Node.js APIs compatible with Bun

### Command Structure

**Cliffy Best Practices**
- Action handlers registered BEFORE command registration (`.action().then command()`)
- Commands use `allowEmpty: false` by default fer required arguments
- Error messages include helpful guidance fer next steps

### Testing Strategy

**Current Coverage (46 tests passin')**
- Unit tests fer `parseEnvFile()` - comprehensive coverage of .env file parsing edge cases
- Unit tests fer all config management functions (read, write, get, set, remove, list)
- Tests use temporary directories and clean up after themselves
- Tests avoid sleep() and timing dependencies
- Tests favor readability over extreme DRY patterns

**Notable Test Gap**
- `validateCredentials()` function has no test coverage (requires mockin' Mux API)
- CLI command integration tests be minimal (commands be thin wrappers around tested functions)
- Manual testing performed and documented in PLAN.md

## Workflow

### Feature Development Pattern
When implementin' new features:
1. Create a `PLAN.md` file with goals, architecture, and TODOs
2. Write tests FIRST fer core functionality
3. Implement features incrementally, updatin' PLAN.md with observations
4. Perform manual end-to-end testing
5. When complete, migrate relevant notes to NOTES.md and remove PLAN.md

### Branch Strategy
- Work on features in separate branches (e.g., `mmcc/revamp`)
- Keep commits small and focused
- Main branch be `master` (not `main`)

## Asset Management

### Asset Creation Architecture

**Input Method Design**
The `mux assets create` command supports three distinct input methods, each mutually exclusive:
1. **URL ingestion** (`--url`) - Create assets from remote video URLs
2. **Local file upload** (`--upload`) - Upload local files with glob pattern support (e.g., `*.mp4`, `videos/**/*.mp4`)
3. **JSON configuration** (`--file`) - Complex asset creation with overlays, subtitles, and advanced options

**Design Rationale:**
- Direct flags handle 80% of simple use cases (URL ingestion, single file uploads)
- JSON config files handle complex scenarios (overlay settings, generated subtitles, multiple input tracks)
- Flag overrides allow mixing both approaches: load a config file and override specific options via flags
- Each file uploaded via glob patterns creates a separate, independent asset
- This matches expected behavior from similar CLI tools and keeps the interface predictable

**Multiple File Handling:**
When using `--upload` with glob patterns matching multiple files:
- Each file creates a separate asset (not combined into one)
- User receives a confirmation prompt showing all files and total size (skippable with `-y`)
- Each upload creates its own direct upload URL and asset
- This design be simpler and more predictable than trying to combine tracks

**JSON Configuration Philosophy:**
- CLI validates only file existence and JSON syntax
- Business rule validation (enum values, required fields, array constraints) be handled by the Mux API
- This keeps the CLI flexible when Mux adds new features or changes constraints
- Error messages from the API be passed through to the user
- The `AssetConfig` interface uses an index signature to allow future Mux API additions

**Wait Flag Implementation:**
- `--wait` flag polls asset status every 5 seconds
- Maximum 60 attempts (5 minutes) before timing out
- Only works with URL ingestion and JSON config modes (returns asset immediately)
- File upload mode returns upload IDs, not asset IDs, so wait be not applicable

**Progress Reporting Limitation:**
The `uploadFile()` function uses native fetch, which doesn't provide granular progress updates for PUT requests. Currently reports only 0% and 100%. For large files, the CLI may appear to hang during upload. Future enhancement: implement streaming upload with chunked progress tracking.

### Commands Implemented

**Phase 1: Asset Creation**
- `mux assets create` - Create assets via URL, file upload, or JSON config
  - Supports multiple input methods with glob patterns
  - Confirmation prompts and progress reporting
  - Wait flag for polling asset status

**Phase 2: Asset Management**
- `mux assets list` - List assets with pagination and filtering
  - Flags: `--limit`, `--page`, `--upload-id`, `--live-stream-id`, `--json`
- `mux assets get <asset-id>` - Get detailed asset information
  - Shows tracks, playback IDs, resolution, encoding tier, errors
- `mux assets delete <asset-id>` - Delete assets with confirmation
  - Requires `--force` flag when using `--json` output for safety
  - Interactive confirmation prompt in non-JSON mode

### Test Coverage Notes

**Asset Management Tests (100 total):**
- 96 passing tests
- 2 skipped (require network mocking)
- 2 todo tests (network-dependent upload tests)

**Test Breakdown:**
- `json-config.test.ts`: JSON parsing and validation tests
- `file-upload.test.ts`: Glob expansion and file validation tests (2 skipped network tests)
- `create.test.ts`: 19 CLI interface tests covering:
  - Flag combinations and mutual exclusivity validation
  - JSON config file error handling
  - File upload error handling
  - Output formatting flags verification
  - Optional flags verification
  - Command metadata verification
- `list.test.ts`: 5 tests for command structure and flag parsing
- `get.test.ts`: 4 tests for command structure and argument validation
- `delete.test.ts`: 4 tests for command structure and confirmation behavior

**Test Strategy:**
- Unit tests cover JSON parsing, glob expansion, file validation
- Command tests focus on CLI interface layer (flag parsing, validation, error messages)
- Command tests use `spyOn` to mock `process.exit` and `console.error`
- Tests do NOT mock the Mux SDK - API integration verified via manual E2E testing
- Tests follow project philosophy: no sleep(), human readable, test real code, clean up properly

**Validation Scope:**
- ✅ Test and validate OUR CLI interface only (file exists, valid JSON, required fields present)
- ❌ Do NOT validate Mux API constraints (enum values, field length limits, empty arrays, etc.)
- Let the Mux API handle business rule validation and pass through their error messages

### Code Quality Improvements (Phase 2)

**Authentication Pattern:**
- Extracted `createAuthenticatedMuxClient()` helper in `lib/mux.ts`
- Eliminates code duplication across all asset commands
- Centralizes authentication logic for easier maintenance

**Type Safety:**
- Replaced `any` types with explicit type definitions
- Better compile-time safety and IDE support

**Error Handling:**
- Consistent error handling across all commands
- Handles both Error and non-Error exceptions gracefully
- Proper JSON error formatting for `--json` mode

**Professional Output:**
- Removed all emojis per project guidelines
- Professional language in all user-facing messages
- Consistent formatting between commands

**Safety Features:**
- Delete command requires `--force` flag with `--json` output
- Prevents accidental deletions in automated scripts
- Interactive confirmation prompts for destructive operations

**Defensive Programming:**
- Optional chaining for API responses (`response.data?.length ?? 0`)
- Null-safe operations throughout

## Global TODOs

### Future Enhancements
- Add unit tests fer `validateCredentials()` with mocked Mux API responses
- Consider adding integration tests fer CLI commands if complexity increases
- Evaluate need fer credential refresh/expiration handling
- **Update README.md installation instructions fer end users** - Current instructions be fer developers (pnpm install, pnpm run build). Need to add end-user installation methods:
  - Global install via npm/pnpm (`npm install -g @mux/cli`)
  - Homebrew installation (`brew install mux/tap/mux-cli`)
  - Keep developer setup in a separate "Development" section
- **Support custom base URL fer staging/sandbox environments** - Allow users to pass a custom Mux API base URL (e.g., `--base-url https://api.staging.mux.com`) to use the CLI with non-production Mux environments. This would need to be:
  - Configurable per environment in the config
  - Passed to the Mux SDK client initialization
  - Validated during credential setup
  - Documented in help text
- **Implement streaming upload with progress tracking** - Replace the current fetch-based upload in `file-upload.ts` with a streaming solution that provides granular progress updates for large file uploads
