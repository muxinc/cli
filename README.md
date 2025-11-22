# Mux CLI

A command-line interface for interacting with the Mux API, designed to provide a first-class development experience for working with Mux services locally.

## Installation

```bash
# Using pnpm
pnpm install

# Build the CLI
pnpm run build
```

## Getting Started

### Authentication

Before using the Mux CLI, you need to authenticate with your Mux API credentials. You can obtain these from the [Mux Dashboard](https://dashboard.mux.com/settings/access-tokens).

#### Interactive Login

The simplest way to authenticate:

```bash
mux login
```

You'll be prompted to enter your Mux Token ID and Token Secret. The CLI will validate your credentials before saving them.

#### Login with .env File

If you have your credentials in a `.env` file:

```bash
mux login --env-file .env
```

Your `.env` file should contain:

```bash
MUX_TOKEN_ID=your_token_id
MUX_TOKEN_SECRET=your_token_secret
```

#### Named Environments

You can manage multiple environments (e.g., production, staging, development):

```bash
# Add a production environment
mux login --name production

# Add a staging environment
mux login --name staging
```

The first environment you add becomes the default. You can switch between environments later.

## Commands

### Asset Management

#### `mux assets create`

Create a new Mux video asset from a URL, local file, or JSON configuration.

**Options:**
- `--url <url>` - Video URL to ingest from the web
- `--upload <path>` - Local file(s) to upload (supports glob patterns like `*.mp4` or `videos/**/*.mp4`)
- `--file, -f <path>` - JSON configuration file for complex asset creation
- `--playback-policy <policy>` - Playback policy: `public` or `signed` (can be specified multiple times)
- `--test` - Create test asset (watermarked, 10s limit, deleted after 24h)
- `--passthrough <string>` - User metadata (max 255 characters)
- `--mp4-support <option>` - MP4 support level: `none`, `capped-1080p`, `audio-only`, `audio-only,capped-1080p`
- `--encoding-tier <tier>` - Encoding tier: `smart` or `baseline`
- `--normalize-audio` - Normalize audio loudness level
- `-y, --yes` - Skip confirmation prompts
- `--json` - Output JSON instead of pretty format
- `--wait` - Wait for asset processing to complete (polls until ready)

**Examples:**

```bash
# Create asset from remote URL
mux assets create --url https://example.com/video.mp4 --playback-policy public

# Upload a single local file
mux assets create --upload video.mp4 --playback-policy public --test

# Upload multiple files with glob pattern
mux assets create --upload ./videos/*.mp4 --playback-policy public
# Shows confirmation prompt with file list and total size

# Skip confirmation for multiple files
mux assets create --upload ./videos/*.mp4 --playback-policy public -y

# Create asset with complex configuration from JSON file
mux assets create --file asset-config.json

# Override config file options with flags
mux assets create --file asset-config.json --test --playback-policy signed

# Wait for asset to be ready
mux assets create --url https://example.com/video.mp4 --playback-policy public --wait

# Get JSON output for scripting
mux assets create --url https://example.com/video.mp4 --playback-policy public --json
```

**JSON Configuration File:**

For complex asset creation (overlays, subtitles, multiple input tracks), use a JSON configuration file:

```json
{
  "input": [
    {
      "url": "https://example.com/video.mp4",
      "overlay_settings": {
        "url": "https://example.com/logo.png",
        "vertical_align": "bottom",
        "horizontal_align": "right",
        "vertical_margin": "5%",
        "horizontal_margin": "5%",
        "opacity": "80%"
      },
      "generated_subtitles": [
        {
          "language_code": "en",
          "name": "English"
        }
      ]
    }
  ],
  "playback_policy": ["signed"],
  "encoding_tier": "smart",
  "mp4_support": "capped-1080p",
  "normalize_audio": true,
  "passthrough": "my-video-123"
}
```

Then create the asset:

```bash
mux assets create --file asset-config.json
```

**Multiple File Uploads:**

When using glob patterns, each file creates a separate asset:

```bash
mux assets create --upload ./videos/*.mp4 --playback-policy public
# Creates 3 separate assets if 3 files match

# Output:
# Found 3 files to upload:
#   - intro.mp4 (45.2 MB)
#   - main.mp4 (128.7 MB)
#   - outro.mp4 (23.1 MB)
# Total size: 197.1 MB
# Continue with upload? (y/n):
```

#### `mux assets list`

List all video assets with pagination and filtering options.

**Options:**
- `--limit <number>` - Number of results to return (default: 25)
- `--page <number>` - Page number for pagination (default: 1)
- `--upload-id <id>` - Filter assets by upload ID
- `--live-stream-id <id>` - Filter assets by live stream ID
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# List assets with default settings (25 assets, page 1)
mux assets list

# List first 10 assets
mux assets list --limit 10

# List second page of results
mux assets list --page 2

# Filter by upload ID
mux assets list --upload-id abc123xyz

# Get JSON output for scripting
mux assets list --json
```

**Output:**

```
Found 3 asset(s):

Asset ID: abc123xyz
  Status: ready
  Duration: 120.45s
  Created: 1234567890
  Playback URL: https://stream.mux.com/playback123.m3u8
  Passthrough: my-video-metadata

Asset ID: def456uvw
  Status: preparing
  Duration: N/A
  Created: 1234567891
  Playback URL: https://stream.mux.com/playback456.m3u8
```

#### `mux assets get <asset-id>`

Get detailed information about a specific video asset.

**Arguments:**
- `<asset-id>` - The ID of the asset to retrieve

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Get asset details
mux assets get abc123xyz

# Get asset details as JSON
mux assets get abc123xyz --json
```

**Output:**

```
Asset ID: abc123xyz
Status: ready
Duration: 120.45s
Created: 1234567890
Aspect Ratio: 16:9
Resolution Tier: 1080p
Encoding Tier: smart
Max Resolution: HD
Max Frame Rate: 30.00 fps

Playback IDs:
  - playback123 (public)
    URL: https://stream.mux.com/playback123.m3u8

Tracks:
  - audio: audio_track_id
    Duration: 120.45s
  - video: video_track_id
    Duration: 120.45s

Passthrough: my-video-metadata

WARNING: This is a test asset (will be deleted after 24 hours)
```

#### `mux assets delete <asset-id>`

Delete a video asset permanently.

**Arguments:**
- `<asset-id>` - The ID of the asset to delete

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Delete asset with confirmation prompt
mux assets delete abc123xyz

# Delete asset without confirmation
mux assets delete abc123xyz --force

# Delete asset with JSON output (requires --force for safety)
mux assets delete abc123xyz --json --force
```

**Important:** When using `--json` output mode, you must also provide the `--force` flag. This safety feature prevents accidental deletions in automated scripts.

**Output:**

```
Are you sure you want to delete asset abc123xyz? (y/n): y
Asset abc123xyz deleted successfully
```

### Live Stream Management

#### `mux live create`

Create a new Mux live stream for broadcasting.

**Options:**
- `--playback-policy <policy>` - Playback policy: `public` or `signed` (can be specified multiple times)
- `--new-asset-settings <settings>` - Automatically create an asset from this live stream. Use `none` to disable, or provide a JSON string with asset settings (e.g., `'{"playback_policy": ["public"]}'`)
- `--reconnect-window <seconds>` - Time in seconds a stream can be disconnected before being considered finished (default: 60)
- `--latency-mode <mode>` - Latency mode: `low` or `standard` (default: `low`)
- `--test` - Create test live stream (deleted after 24h)
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Create a basic live stream with public playback
mux live create --playback-policy public

# Create a low-latency live stream
mux live create --playback-policy public --latency-mode low

# Create a stream that automatically saves to an asset
mux live create --playback-policy public --new-asset-settings '{"playback_policy": ["public"]}'

# Create a test stream (deleted after 24 hours)
mux live create --playback-policy public --test

# Create with extended reconnect window (5 minutes)
mux live create --playback-policy public --reconnect-window 300

# Get JSON output for scripting
mux live create --playback-policy public --json
```

**Output:**

```
Live stream created: abc123xyz
  Status: idle
  Stream Key: your-secret-stream-key
  Playback URL: https://stream.mux.com/playback123.m3u8

WARNING: This is a test stream (will be deleted after 24 hours)
```

**Using the Stream:**

Once created, you can stream to your live stream using the RTMP URL and stream key:
- **RTMP URL:** `rtmp://global-live.mux.com/app`
- **Stream Key:** The `stream_key` returned in the response

Configure your streaming software (OBS, Wirecast, etc.) with these values to start broadcasting.

#### `mux live list`

List all live streams with pagination.

**Options:**
- `--limit <number>` - Number of results to return (default: 25)
- `--page <number>` - Page number for pagination (default: 1)
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# List live streams with default settings
mux live list

# List first 10 streams
mux live list --limit 10

# List second page of results
mux live list --page 2

# Get JSON output for scripting
mux live list --json
```

**Output:**

```
Found 3 live stream(s):

Stream ID: abc123xyz
  Status: active
  Created: 1234567890
  Stream Key: your-stream-key
  Playback URL: https://stream.mux.com/playback123.m3u8

Stream ID: def456uvw
  Status: idle
  Created: 1234567891
  Stream Key: another-stream-key
  Playback URL: https://stream.mux.com/playback456.m3u8
```

#### `mux live get <stream-id>`

Get detailed information about a specific live stream.

**Arguments:**
- `<stream-id>` - The ID of the live stream to retrieve

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Get live stream details
mux live get abc123xyz

# Get live stream details as JSON
mux live get abc123xyz --json
```

**Output:**

```
Live Stream ID: abc123xyz
Status: active
Created: 1234567890
Stream Key: your-secret-stream-key
Latency Mode: low
Reconnect Window: 60s

Playback IDs:
  - playback123 (public)
    URL: https://stream.mux.com/playback123.m3u8

New Asset Settings:
  Playback Policy: public
  Recording enabled: Yes

WARNING: This is a test stream (will be deleted after 24 hours)
```

#### `mux live delete <stream-id>`

Delete a live stream permanently.

**Arguments:**
- `<stream-id>` - The ID of the live stream to delete

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Delete stream with confirmation prompt
mux live delete abc123xyz

# Delete stream without confirmation
mux live delete abc123xyz --force

# Delete stream with JSON output (requires --force for safety)
mux live delete abc123xyz --json --force
```

**Important:** When using `--json` output mode, you must also provide the `--force` flag. This safety feature prevents accidental deletions in automated scripts.

**Output:**

```
Are you sure you want to delete live stream abc123xyz? (y/n): y
Live stream abc123xyz deleted successfully
```

### Authentication & Environment Management

#### `mux login`

Authenticate with Mux and save credentials.

**Options:**
- `-f, --env-file <path>` - Path to .env file containing credentials
- `-n, --name <name>` - Name for this environment (default: "default")

**Examples:**

```bash
# Interactive login
mux login

# Login with .env file
mux login --env-file .env

# Login with a named environment
mux login --name production --env-file .env.production
```

#### `mux logout <name>`

Remove credentials for a specific environment.

**Arguments:**
- `<name>` - Name of the environment to remove

**Examples:**

```bash
# Remove the default environment
mux logout default

# Remove a named environment
mux logout staging
```

When you remove the default environment, the CLI automatically selects another environment as the new default.

#### `mux env list`

Display all configured environments.

**Examples:**

```bash
mux env list
```

**Output:**
```
Configured environments:

* production (default)
  staging
  development

3 environments total
```

#### `mux env switch <name>`

Change the default environment.

**Arguments:**
- `<name>` - Name of the environment to set as default

**Examples:**

```bash
# Switch to staging environment
mux env switch staging
```

## Configuration

Credentials are stored securely in `~/.config/mux/config.json` with restrictive file permissions (readable/writable only by the owner).

The configuration file structure:

```json
{
  "environments": {
    "production": {
      "tokenId": "your_token_id",
      "tokenSecret": "your_token_secret"
    },
    "staging": {
      "tokenId": "your_staging_token_id",
      "tokenSecret": "your_staging_token_secret"
    }
  },
  "defaultEnvironment": "production"
}
```

## Development

This project uses [Bun](https://bun.sh) as the JavaScript runtime and is written in TypeScript.

### Prerequisites

- Bun runtime installed
- pnpm for package management

### Setup

```bash
# Install dependencies
pnpm install

# Run tests
bun test

# Build the project
pnpm run build
```

### Testing

The project includes comprehensive test coverage for core functionality:

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch
```

### Project Structure

```
src/
├── commands/           # CLI command definitions
│   ├── assets/        # Asset management commands
│   │   ├── index.ts   # Main assets command
│   │   ├── create.ts  # Create assets
│   │   ├── list.ts    # List assets
│   │   ├── get.ts     # Get asset details
│   │   └── delete.ts  # Delete assets
│   ├── live/          # Live stream management commands
│   │   ├── index.ts   # Main live command
│   │   ├── create.ts  # Create live streams
│   │   ├── list.ts    # List live streams
│   │   ├── get.ts     # Get live stream details
│   │   └── delete.ts  # Delete live streams
│   ├── env/           # Environment management commands
│   │   ├── index.ts   # Main env command
│   │   ├── list.ts    # List environments
│   │   └── switch.ts  # Switch default environment
│   ├── login.ts       # Login command
│   └── logout.ts      # Logout command
├── lib/               # Shared libraries
│   ├── config.ts      # Configuration management
│   ├── mux.ts         # Mux API integration and auth helpers
│   ├── json-config.ts # JSON configuration parsing
│   ├── file-upload.ts # File upload utilities
│   └── xdg.ts         # XDG base directory support
└── index.ts           # CLI entry point
```

## License

See LICENSE file for details.

## Support

For issues and questions:
- File an issue on GitHub
- Visit [Mux Documentation](https://docs.mux.com/)
- Contact Mux Support
