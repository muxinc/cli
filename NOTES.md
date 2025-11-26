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

## Live Streams

### Live Stream Commands

**Commands Implemented:**
- `mux live create` - Create live streams with configurable settings
  - Flags: `--playback-policy`, `--new-asset-settings`, `--reconnect-window`, `--latency-mode`, `--test`, `--json`
  - Validation fer playback policy (public/signed) and latency mode (low/standard)
  - Support fer automatic asset creation from live streams via `--new-asset-settings`
- `mux live list` - List live streams with pagination
  - Flags: `--limit`, `--page`, `--json`
- `mux live get <stream-id>` - Get detailed live stream information
  - Shows stream key, playback URLs, status, and configuration
- `mux live delete <stream-id>` - Delete live streams with confirmation
  - Requires `--force` flag with `--json` output fer safety

**Test Coverage:**
- 20 tests covering CLI interface, flag validation, and enum validation
- Tests focus on command structure and input validation (not Mux API integration)
- Validation tests fer playback policy, latency mode, and JSON parsing
- Follows project philosophy: no sleep(), human readable, test real code

## Asset Management

### Type Safety Improvements

**Phase 3 Enhancements:**
- Replaced all `any` types in `assets/create.ts` with proper Mux SDK types
- Added explicit type imports: `Video.Asset`, `Video.AssetCreateParams`, `Video.UploadCreateParams`
- Type-safe enum casting throughout (playback policy, mp4 support, encoding tier)
- Added `UploadResult` interface fer file upload responses

**Extracting Types from Mux SDK:**
- All type definitions fer enums and constraints be extracted directly from the Mux SDK rather than hardcoded
- Uses TypeScript utility types to extract from SDK interfaces:
  - `type LatencyMode = NonNullable<Mux.Video.LiveStreamCreateParams['latency_mode']>`
  - `type PlaybackPolicy = Mux.PlaybackPolicy`
  - `type EncodingTier = NonNullable<Mux.Video.AssetCreateParams['encoding_tier']>`
  - `type Mp4Support = NonNullable<Mux.Video.AssetCreateParams['mp4_support']>`
- Benefits:
  - CLI types automatically stay in sync when the Mux SDK updates
  - Single source of truth fer all Mux API types
  - No risk of the CLI types driftin' out of sync with the SDK
- Implemented in `assets/create.ts` and `live/create.ts`

**Validation Architecture:**
- CLI-level validation fer flag values using Cliffy's `value` callback
- Validates enums at parse time with helpful error messages listing valid options
- Validates passthrough string length (255 char limit)
- Consistent error messages across all enum validations
- Mux API handles business rule validation (we only validate syntax and basic constraints)

**Test Coverage fer Validation:**
- 15+ new tests specifically fer enum validation logic
- Tests both rejection of invalid values and acceptance of valid values
- Error messages verified to include helpful guidance with valid options
- Covers: playback-policy, mp4-support, encoding-tier validations

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

## Signing Keys & Secure Playback

### Overview
Implemented complete signing key management and JWT-based playback ID signing fer secure video playback. The feature consists of two main command groups:

1. **Signing Key Management** (`mux signing-keys`) - Manage RSA signing keys via the Mux API
2. **Playback ID Signing** (`mux sign`) - Sign playback IDs to generate secure URLs

### Architecture

**Config Storage:**
- Signing keys stored in the Environment interface with optional fields:
  - `signingKeyId?: string` - The signing key ID from Mux
  - `signingPrivateKey?: string` - Base64-encoded RSA private key (2048-bit)
- One signing key per environment (design follows Mux's recommendation)
- Keys stored securely in config with 0o600 file permissions

**SDK Integration:**
- Signing key management uses `mux.system.signingKeys` API:
  - `create()` - Returns private key ONLY ONCE during creation
  - `list()` - Returns all keys (without private keys)
  - `retrieve(id)` - Gets specific key details (without private key)
  - `delete(id)` - Deletes a key and invalidates all signatures
- JWT signing uses `Mux.JWT.sign()` with explicit credentials:
  - Takes `keyId` and `keySecret` from environment config
  - Supports type ('video', 'thumbnail', 'gif', 'storyboard')
  - Supports expiration duration strings ('7d', '1h', etc.)

### Commands Implemented

**Signing Key Management (`mux signing-keys`):**
- `mux signing-keys create` - Creates a new signing key and automatically stores it in the current environment
  - No required arguments
  - Flag: `--json` fer JSON output
  - Automatic config update with returned private key
  - Private key only returned once by API, must be captured immediately

- `mux signing-keys list` - Lists all signing keys with local environment indicators
  - Shows which keys are configured in local environments
  - Flag: `--json` fer JSON output
  - Displays created_at timestamps and active environment names

- `mux signing-keys get <key-id>` - Gets details about a specific signing key
  - Required argument: `signing-key-id`
  - Flag: `--json` fer JSON output
  - Shows if key is active in any local environment

- `mux signing-keys delete <key-id>` - Deletes a signing key with safety checks
  - Required argument: `signing-key-id`
  - Flag: `-f, --force` to skip confirmation prompt
  - Warns if key is in use by any local environment
  - Automatically removes from affected environment configs
  - Requires explicit confirmation unless --force is provided

**Playback ID Signing (`mux sign`):**
- `mux sign <playback-id>` - Signs a playback ID fer secure playback
  - Required argument: `playback-id`
  - Flags:
    - `-e, --expiration <duration>` - Expiration duration (default: '7d')
    - `-t, --type <type>` - Token type: video, thumbnail, gif, storyboard (default: 'video')
    - `--json` - Output JSON format with all details
    - `--token-only` - Output only the JWT token (no URL)
  - Default output: Full signed URL (https://stream.mux.com/{id}.m3u8?token={jwt})
  - Validates signing keys are configured before attempting to sign
  - Helpful error message directs users to `mux signing-keys create` if not configured

### Test Coverage

**Total: 48 new tests, all passing**

- `signing-keys/create.test.ts`: 4 tests
  - Command metadata (description, flags, arguments)
  - JSON flag validation
  - Auth requirement verification

- `signing-keys/list.test.ts`: 4 tests
  - Command metadata
  - JSON flag validation
  - Auth requirement verification

- `signing-keys/get.test.ts`: 4 tests
  - Command metadata
  - Argument validation (signing-key-id required)
  - JSON flag validation
  - Auth requirement verification

- `signing-keys/delete.test.ts`: 4 tests
  - Command metadata
  - Argument validation
  - Force flag validation
  - Auth requirement verification

- `sign.test.ts`: 12 tests
  - Command metadata (description, arguments, flags)
  - Default values (expiration='7d', type='video')
  - Type validation (video, thumbnail, gif, storyboard)
  - Invalid type rejection with helpful error message
  - Signing key configuration requirement

**Test Strategy:**
- Tests focus on CLI interface layer (command structure, flag parsing, validation)
- Do NOT test actual Mux API integration (verified via manual testing)
- Use spyOn to mock process.exit and console methods
- Follow project philosophy: no sleep(), human readable, test real code

### Design Decisions

**1. Automatic Key Storage on Creation:**
- Private keys are only returned once by the Mux API during creation
- CLI automatically stores key in current environment to prevent loss
- Users don't have to manually edit config files
- Reduces friction and potential fer user error

**2. One Key Per Environment:**
- Mux documentation states "you probably only need one active at a time"
- Creating a new key automatically replaces the old one in config
- Simpler mental model fer users
- Still supports key rotation (create new, delete old after URLs expire)

**3. Top-Level Sign Command:**
- Using `mux sign` instead of `mux assets sign` or `mux live sign`
- Signing works identically fer both asset and live stream playback IDs
- Simpler UX with fewer nested commands
- Playback ID is agnostic to source type

**4. Default Output Format:**
- Sign command defaults to outputting full signed URL
- Most common use case is copy/paste the URL fer testing
- `--token-only` flag available fer scripts that need just the JWT
- `--json` flag provides structured output with all details

**5. Environment Indicators in List:**
- `mux signing-keys list` shows which keys are configured locally
- Helps users understand which keys are in use
- Cross-references Mux API data with local config
- Useful fer key rotation and cleanup

**6. Safety Features in Delete:**
- Delete command warns if key is in use by any environment
- Requires explicit confirmation (unless --force)
- Automatically cleans up affected environment configs
- Prevents accidental deletion of keys in active use

### Type Safety

**Using Mux SDK Types:**
- All signing key types extracted from `@mux/mux-node`
- Uses SDK's `SigningKey` interface directly
- JWT signing uses `Mux.JWT.sign()` method
- Token types defined as const array with type extraction:
  ```typescript
  const VALID_TYPES = ["video", "thumbnail", "gif", "storyboard"] as const;
  type TokenType = (typeof VALID_TYPES)[number];
  ```
- Ensures CLI types stay in sync with SDK updates

**Benefits:**
- Single source of truth fer all signing-related types
- Compile-time safety fer token types and options
- No risk of CLI types driftin' out of sync with SDK

### Error Handling

**Helpful Error Messages:**
- Sign command checks fer configured signing keys before attempting to sign
- If keys not configured, provides actionable guidance:
  ```
  Signing keys not configured for this environment.

  To create and configure a signing key, run:
    mux signing-keys create

  This will create a new signing key and automatically configure it for your current environment.
  ```
- Delete command warns about invalidating signed URLs
- All errors support both pretty and JSON output formats

**Validation:**
- Token type validated at parse time with helpful error listing valid options
- Auth requirement validated before any API calls
- Consistent error handling across all commands

### Integration Notes

**Command Registration:**
- Signing keys commands registered as command group in `src/index.ts`
- Sign command registered as top-level command
- Both commands visible in main CLI help

**Dependencies:**
- Uses existing `getDefaultEnvironment()` and `setEnvironment()` from `lib/config.ts`
- No new dependencies required (uses existing Mux SDK and Cliffy)
- JWT signing handled entirely by Mux SDK

### Known Limitations

**Bun Runtime Compatibility (RESOLVED):**
- Previous issue with CryptoKey/KeyObject type mismatch in Bun has been resolved
- The `mux sign` command now works properly in Bun runtime
- Fix merged in Mux Node SDK PR: https://github.com/muxinc/mux-node-sdk/pull/585
- All commands now fully compatible with Bun runtime

### Future Enhancements

**Potential Improvements:**
- Support fer multiple token types in one call (SDK supports arrays)
- Thumbnail parameters (`--time`, `--width`) fer thumbnail tokens
- Playback restriction ID support fer domain/user-agent validation
- Integration with `mux login` to optionally capture signing keys during auth
- Key rotation helper command (`mux signing-keys rotate`) that creates new, updates config, and optionally deletes old after delay

## Interactive TUI for Asset Management

### Overview
Implemented an interactive Terminal User Interface using OpenTUI fer managin' Mux assets directly from the terminal. This complements the existing CLI commands by providin' a visual, interactive alternative fer asset management tasks.

### Architecture Decisions

**Command Separation:**
- `mux assets manage` - Interactive TUI fer visual asset management
- `mux assets list` - Non-interactive command fer scripting and piping
- Clear separation keeps both use cases optimal fer their respective purposes
- TUI checks fer TTY presence and falls back with helpful error message

**Shared Utilities Philosophy:**
- All business logic extracted to reusable lib functions (`src/lib/`)
- Both TUI and CLI commands use the same underlying utilities
- This ensures consistent behavior across interactive and non-interactive modes
- Shared functions: `playback-ids.ts`, `urls.ts`, `signing.ts`, `clipboard.ts`

**Reusable TUI Components:**
- Built generic components in `src/lib/tui/` fer future reuse
- `SelectList` - Keyboard-navigable list with scrolling
- `ActionMenu` - Action selection with highlighting
- `ConfirmDialog` - Confirmation prompts fer destructive operations
- `clipboard.ts` - Cross-platform clipboard support (macOS, Linux, Windows)
- These components can be reused fer future TUI commands (live streams, signing keys, etc.)

### Technology Stack

**OpenTUI Framework:**
- Uses `@opentui/core` and `@opentui/react` fer TUI rendering
- React-based component model fer familiar development experience
- Built on Yoga layout engine (Flexbox-like layout fer terminals)
- React 19 fer modern hooks and concurrent features

**TypeScript Configuration:**
- Added `"jsxImportSource": "@opentui/react"` to tsconfig fer proper JSX handling
- TUI components use `.tsx` extension fer React components
- Type safety maintained throughout with proper Mux SDK types

### Key Features Implemented

**Asset Browsing:**
- Paginated asset list with keyboard navigation
- Shows asset ID, status, duration, and passthrough/title
- Loading states and error handling
- Empty state fer accounts with no assets

**Action Menu:**
- View asset details
- Copy stream URL (HLS .m3u8) - automatically signed if policy requires it
- Copy player URL - automatically signed if policy requires it
- Create new playback ID (choose public or signed)
- Delete existing playback ID
- Delete asset (with confirmation)

**Automatic URL Signing:**
- Detects if playback ID has `signed` policy
- Automatically generates JWT token using configured signing keys
- Seamlessly appends token to URLs before clipboard copy
- Falls back gracefully if signing keys not configured

**Clipboard Integration:**
- Cross-platform clipboard support
- macOS: Uses `pbcopy`
- Linux: Uses `xclip` (with `xsel` fallback)
- Windows: Uses `clip`
- Helpful error messages if clipboard tools not available

### Playback ID CLI Commands

Added complete playback ID management fer both assets and live streams:

**Asset Playback IDs:**
- `mux assets playback-ids list <asset-id>` - List all playback IDs
- `mux assets playback-ids create <asset-id>` - Create new playback ID
- `mux assets playback-ids delete <asset-id> <playback-id>` - Delete playback ID

**Live Stream Playback IDs:**
- `mux live playback-ids list <stream-id>` - List all playback IDs
- `mux live playback-ids create <stream-id>` - Create new playback ID
- `mux live playback-ids delete <stream-id> <playback-id>` - Delete playback ID

All commands support `--json` output and follow consistent patterns with other CLI commands.

### Test Coverage

**Shared Utilities:**
- `urls.test.ts` - 6 tests fer URL generation functions
- `signing.test.ts` - 5 tests fer signing key detection
- `playback-ids.test.ts` - 9 tests fer playback ID operations with mocked Mux client

**CLI Commands:**
- Comprehensive test coverage fer all playback-id commands (list, create, delete)
- Tests cover command structure, flag parsing, and validation
- Follow project philosophy: no sleep(), human readable, test real code

**TUI Components:**
- No test coverage fer TUI components (AssetManageApp, SelectList, ActionMenu, ConfirmDialog)
- TUI components be UI-focused and difficult to test without E2E framework
- Verified through manual testing instead
- Future consideration: Add E2E tests with terminal automation if needed

### Design Patterns

**Dynamic Imports:**
- TUI dependencies loaded only when `mux assets manage` command is invoked
- Keeps CLI startup fast fer non-TUI commands
- Uses dynamic imports: `await import("@opentui/core")`

**Error Handling:**
- TTY check prevents errors in non-interactive environments
- Graceful fallbacks fer missing clipboard tools
- User-friendly error messages throughout
- Loading states prevent confusion during API calls

**State Management:**
- React hooks fer local component state
- View-based state machine (`list`, `actions`, `confirm-delete`, etc.)
- Clear state transitions fer predictable UX

### Integration Notes

**Command Registration:**
- TUI command NOT registered in assets index to avoid accidental discovery
- Available through `mux assets manage` but not listed in base help
- This keeps the CLI focused on scripting use cases by default
- Users discover TUI through documentation or explicit search

**SDK Usage:**
- Uses same Mux SDK client as CLI commands
- Authenticates using existing config management
- Consistent credential handling across TUI and CLI

### Known Limitations

**Terminal Requirements:**
- Requires interactive terminal (TTY)
- No support fer piping or scripting
- Falls back with helpful error message if run non-interactively

**Clipboard Dependencies:**
- Linux users must have `xclip` or `xsel` installed
- Windows users must have `clip` available (usually present by default)
- macOS works out of box with `pbcopy`

**Pagination:**
- Currently loads first page of assets only
- Future enhancement: Add "load more" action fer pagination

### Future Enhancements

**Potential Improvements:**
- Live stream management TUI using same reusable components
- Signing key management TUI
- Search/filter functionality in asset list
- Pagination support fer large asset libraries
- Asset creation through TUI interface
- Batch operations (select multiple assets)

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
