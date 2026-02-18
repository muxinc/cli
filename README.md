# Mux CLI

A command-line interface for interacting with the Mux API, designed to provide a first-class development experience for working with Mux services locally.

## Table of Contents

- [Installation](#installation)
  - [Install via npm](#install-via-npm)
  - [Shell installer](#shell-installer)
  - [Download the binary](#download-the-binary)
- [Getting Started](#getting-started)
  - [Authentication](#authentication)
- [Commands](#commands)
  - [Asset Management](#asset-management)
    - [Create Assets](#mux-assets-create)
    - [List Assets](#mux-assets-list)
    - [Get Asset](#mux-assets-get-asset-id)
    - [Update Asset](#mux-assets-update-asset-id)
    - [Delete Asset](#mux-assets-delete-asset-id)
    - [Interactive Management](#mux-assets-manage)
    - [Playback ID Management](#playback-id-management)
    - [Static Renditions Management](#static-renditions-management)
  - [Live Stream Management](#live-stream-management)
    - [Create Live Stream](#mux-live-create)
    - [List Live Streams](#mux-live-list)
    - [Get Live Stream](#mux-live-get-stream-id)
    - [Delete Live Stream](#mux-live-delete-stream-id)
    - [Playback ID Management (Live)](#playback-id-management-1)
  - [Playback ID Lookup](#playback-id-lookup)
  - [Signing Keys & Secure Playback](#signing-keys--secure-playback)
    - [Create Signing Key](#mux-signing-keys-create)
    - [List Signing Keys](#mux-signing-keys-list)
    - [Get Signing Key](#mux-signing-keys-get-key-id)
    - [Delete Signing Key](#mux-signing-keys-delete-key-id)
    - [Sign Playback ID](#mux-sign-playback-id)
  - [Authentication & Environment Management](#authentication--environment-management)
- [Configuration](#configuration)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Testing](#testing)
  - [Project Structure](#project-structure)
- [License](#license)
- [Support](#support)

## Installation

### Install via npm

```bash
npm install -g @mux/cli@beta
```

Or run directly with npx:

```bash
npx @mux/cli@beta
```

### Shell installer

```bash
curl -fsSL https://raw.githubusercontent.com/muxinc/cli/main/install.sh | bash
```

### Download the binary

Download the latest binary for your platform from [GitHub Releases](https://github.com/muxinc/cli/releases):

```bash
# macOS (Apple Silicon)
curl -L https://github.com/muxinc/cli/releases/latest/download/mux-darwin-arm64 -o mux
chmod +x mux
sudo mv mux /usr/local/bin/

# macOS (Intel)
curl -L https://github.com/muxinc/cli/releases/latest/download/mux-darwin-x64 -o mux
chmod +x mux
sudo mv mux /usr/local/bin/

# Linux (x64)
curl -L https://github.com/muxinc/cli/releases/latest/download/mux-linux-x64 -o mux
chmod +x mux
sudo mv mux /usr/local/bin/

# Linux (arm64)
curl -L https://github.com/muxinc/cli/releases/latest/download/mux-linux-arm64 -o mux
chmod +x mux
sudo mv mux /usr/local/bin/
```

The binary is self-contained and has no dependencies.

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
- `--static-renditions <resolution>` - Static rendition resolutions: `highest`, `audio-only`, `2160p`, `1440p`, `1080p`, `720p`, `540p`, `480p`, `360p`, `270p` (can be specified multiple times)
- `--video-quality <quality>` - Video quality level: `basic`, `plus`, or `premium`
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
  "playback_policies": ["signed"],
  "video_quality": "plus",
  "static_renditions": [{ "resolution": "1080p" }],
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
- `--compact` - Output one line per asset in grep-friendly format

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

# Get compact output for grep and parsing
mux assets list --compact
```

**Output (default pretty format):**

```
Found 3 asset(s):

sRkgb02SMJOjf72PFIkegcrZR3knHPEPG  ready  0:09  07/25 14:16
  Details:
    ├─ Aspect Ratio: 240:427
    ├─ Resolution: 720p
    └─ Quality: plus
  Meta:
    └─ Title: golf-swing
  Playback IDs:
    ├─ 🔓 rFHdcXSf95EHT32qYnf6ZnBz01D7VyKR4
    └─ 🔒 qo5Y6CpYtdZBgQlI6VskadqdNcQQVdPh
```

**Output (with --compact flag):**

```
sRkgb02SMJOjf72PFIkegcrZR3knHPEPG  ready  0:09  07/25 14:16  720p  "golf-swing"  public,signed  -
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
Video Quality: plus
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

#### `mux assets update <asset-id>`

Update metadata fields on a video asset.

**Arguments:**
- `<asset-id>` - The ID of the asset to update

**Options:**
- `--title <string>` - Set `meta.title` (max 512 characters)
- `--creator-id <string>` - Set `meta.creator_id` (max 128 characters)
- `--external-id <string>` - Set `meta.external_id` (max 128 characters)
- `--passthrough <string>` - Set `passthrough` (max 255 characters)
- `--json` - Output JSON instead of pretty format

At least one field flag must be provided.

**Examples:**

```bash
# Set a title on an asset
mux assets update abc123xyz --title "My Video"

# Set multiple fields at once
mux assets update abc123xyz --title "My Video" --creator-id "user-42" --external-id "vid-001"

# Update passthrough metadata
mux assets update abc123xyz --passthrough "my-custom-metadata"

# Clear a field by passing an empty string
mux assets update abc123xyz --title ""

# Get JSON output
mux assets update abc123xyz --title "My Video" --json
```

**Output:**

```
Asset updated successfully.

Asset ID: abc123xyz
Status: ready
Duration: 120.45s
...
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

#### `mux assets manage`

Interactively manage Mux video assets using a terminal user interface (TUI). This command provides a visual interface to browse assets, view details, manage playback IDs, and copy URLs directly from your terminal.

**Examples:**

```bash
# Launch the interactive asset management TUI
mux assets manage
```

**Features:**

- Browse all video assets with pagination
- View detailed asset information
- Create and delete playback IDs
- Copy stream URLs (HLS) to clipboard
- Copy player URLs to clipboard
- Delete assets with confirmation
- Automatic URL signing for signed playback policies

**Navigation:**

- **Arrow keys** - Navigate through assets and menu options
- **Enter** - Select an asset or action
- **q** - Quit or go back to previous view
- **Escape** - Cancel current operation

**Note:** This command requires an interactive terminal (TTY). For scripting and non-interactive use cases, use `mux assets list`, `mux assets get`, and related commands instead.

#### Playback ID Management

Playback IDs control access to your video assets. Each asset can have multiple playback IDs with different policies (public or signed).

##### `mux assets playback-ids list <asset-id>`

List all playback IDs for a specific asset.

**Arguments:**
- `<asset-id>` - The ID of the asset

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# List playback IDs for an asset
mux assets playback-ids list abc123xyz

# Get JSON output
mux assets playback-ids list abc123xyz --json
```

**Output:**

```
Found 2 playback ID(s) for asset abc123xyz:

Playback ID: playback123
  Policy: public
  URL: https://stream.mux.com/playback123.m3u8

Playback ID: playback456
  Policy: signed
  URL: https://stream.mux.com/playback456.m3u8
```

##### `mux assets playback-ids create <asset-id>`

Create a new playback ID for an asset.

**Arguments:**
- `<asset-id>` - The ID of the asset

**Options:**
- `--policy <policy>` - Playback policy: `public` or `signed` (default: `public`)
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Create a public playback ID
mux assets playback-ids create abc123xyz

# Create a signed playback ID
mux assets playback-ids create abc123xyz --policy signed

# Get JSON output
mux assets playback-ids create abc123xyz --policy public --json
```

**Output:**

```
Playback ID created: playback123
  Policy: public
  URL: https://stream.mux.com/playback123.m3u8
```

##### `mux assets playback-ids delete <asset-id> <playback-id>`

Delete a playback ID from an asset.

**Arguments:**
- `<asset-id>` - The ID of the asset
- `<playback-id>` - The ID of the playback ID to delete

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Delete a playback ID with confirmation
mux assets playback-ids delete abc123xyz playback123

# Delete without confirmation
mux assets playback-ids delete abc123xyz playback123 --force

# Delete with JSON output
mux assets playback-ids delete abc123xyz playback123 --force --json
```

**Output:**

```
Are you sure you want to delete playback ID playback123 from asset abc123xyz? (y/n): y
Playback ID playback123 deleted successfully
```

#### Static Renditions Management

Static renditions are downloadable MP4 versions of your video assets at specific resolutions. Unlike streaming playback, these are complete files that can be downloaded.

##### `mux assets static-renditions list <asset-id>`

List all static renditions for a specific asset.

**Arguments:**
- `<asset-id>` - The ID of the asset

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# List static renditions for an asset
mux assets static-renditions list abc123xyz

# Get JSON output
mux assets static-renditions list abc123xyz --json
```

**Output:**

```
Static renditions for asset abc123xyz:

  1080p.mp4        [ready]      1920x1080    5.2 Mbps   42.3 MB
    ID: rendition123
  720p.mp4         [preparing]  1280x720     -          -
    ID: rendition456
```

##### `mux assets static-renditions create <asset-id>`

Create a new static rendition for an asset.

**Arguments:**
- `<asset-id>` - The ID of the asset

**Options:**
- `-r, --resolution <resolution>` - Target resolution (required): `highest`, `audio-only`, `2160p`, `1440p`, `1080p`, `720p`, `540p`, `480p`, `360p`, `270p`
- `-p, --passthrough <string>` - Custom metadata for the rendition (max 255 characters)
- `-w, --wait` - Wait for the rendition to be ready instead of returning immediately
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Create a 1080p rendition
mux assets static-renditions create abc123xyz --resolution 1080p

# Create and wait for completion
mux assets static-renditions create abc123xyz --resolution 720p --wait

# Create with custom metadata
mux assets static-renditions create abc123xyz --resolution 1080p --passthrough "web-download"

# Get JSON output
mux assets static-renditions create abc123xyz --resolution 1080p --json
```

**Output:**

```
Static rendition created:
  ID: rendition123
  Name: 1080p.mp4
  Resolution: 1080p
  Status: preparing

Note: Static rendition generation is asynchronous. Use 'mux assets static-renditions list <asset-id>' to check the status, or use the --wait flag to poll until ready.
```

##### `mux assets static-renditions delete <asset-id> <rendition-id>`

Delete a static rendition from an asset.

**Arguments:**
- `<asset-id>` - The ID of the asset
- `<rendition-id>` - The ID of the rendition to delete

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Delete a static rendition with confirmation
mux assets static-renditions delete abc123xyz rendition123

# Delete without confirmation
mux assets static-renditions delete abc123xyz rendition123 --force

# Delete with JSON output
mux assets static-renditions delete abc123xyz rendition123 --force --json
```

**Output:**

```
Are you sure you want to delete static rendition rendition123? (y/n): y
Static rendition rendition123 deleted from asset abc123xyz
```

### Live Stream Management

#### `mux live create`

Create a new Mux live stream for broadcasting.

**Options:**
- `--playback-policy <policy>` - Playback policy: `public` or `signed` (can be specified multiple times)
- `--new-asset-settings <settings>` - Automatically create an asset from this live stream. Use `none` to disable, or provide a JSON string with asset settings (e.g., `'{"playback_policies": ["public"]}'`)
- `--reconnect-window <seconds>` - Time in seconds a stream can be disconnected before being considered finished (default: 60)
- `--latency-mode <mode>` - Latency mode: `low`, `reduced`, or `standard` (default: `low`)
- `--test` - Create test live stream (deleted after 24h)
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Create a basic live stream with public playback
mux live create --playback-policy public

# Create a low-latency live stream
mux live create --playback-policy public --latency-mode low

# Create a stream that automatically saves to an asset
mux live create --playback-policy public --new-asset-settings '{"playback_policies": ["public"]}'

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
- `--compact` - Output one line per stream in grep-friendly format

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

# Get compact output for grep and parsing
mux live list --compact
```

**Output (default pretty format):**

```
Found 2 live stream(s):

waWxn5KIZCYmILAOWgXW9dFBPnOXq00JM  idle  08/18 16:43
  Details:
    ├─ Stream Key: c3eb...1724
    ├─ Latency Mode: standard
    ├─ Reconnect Window: 60s
    └─ Max Duration: 12h
  Recent Assets:
    └─ 00QNOSkxzBdlASP3iIvTfvqxDN3u74hUX
  Playback IDs:
    └─ 🔒 EIyqm8p4VwGj5sO9rNBtykFbbKFFSNWA
```

**Output (with --compact flag):**

```
waWxn5KIZCYmILAOWgXW9dFBPnOXq00JM  idle  08/18 16:43  standard  60s  signed  1 assets
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

#### Playback ID Management

Manage playback IDs for live streams. Each live stream can have multiple playback IDs with different policies (public or signed).

##### `mux live playback-ids list <stream-id>`

List all playback IDs for a specific live stream.

**Arguments:**
- `<stream-id>` - The ID of the live stream

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# List playback IDs for a live stream
mux live playback-ids list abc123xyz

# Get JSON output
mux live playback-ids list abc123xyz --json
```

**Output:**

```
Found 2 playback ID(s) for live stream abc123xyz:

Playback ID: playback123
  Policy: public
  URL: https://stream.mux.com/playback123.m3u8

Playback ID: playback456
  Policy: signed
  URL: https://stream.mux.com/playback456.m3u8
```

##### `mux live playback-ids create <stream-id>`

Create a new playback ID for a live stream.

**Arguments:**
- `<stream-id>` - The ID of the live stream

**Options:**
- `--policy <policy>` - Playback policy: `public` or `signed` (default: `public`)
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Create a public playback ID
mux live playback-ids create abc123xyz

# Create a signed playback ID
mux live playback-ids create abc123xyz --policy signed

# Get JSON output
mux live playback-ids create abc123xyz --policy public --json
```

**Output:**

```
Playback ID created: playback123
  Policy: public
  URL: https://stream.mux.com/playback123.m3u8
```

##### `mux live playback-ids delete <stream-id> <playback-id>`

Delete a playback ID from a live stream.

**Arguments:**
- `<stream-id>` - The ID of the live stream
- `<playback-id>` - The ID of the playback ID to delete

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Delete a playback ID with confirmation
mux live playback-ids delete abc123xyz playback123

# Delete without confirmation
mux live playback-ids delete abc123xyz playback123 --force

# Delete with JSON output
mux live playback-ids delete abc123xyz playback123 --force --json
```

**Output:**

```
Are you sure you want to delete playback ID playback123 from live stream abc123xyz? (y/n): y
Playback ID playback123 deleted successfully
```

### Playback ID Lookup

#### `mux playback-ids <playback-id>`

Look up which asset or live stream a playback ID belongs to. This is useful when you have a playback ID and need to find the associated resource.

**Arguments:**
- `<playback-id>` - The playback ID to look up

**Options:**
- `--expand` - Fetch and return the full asset or live stream object instead of just the reference
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Look up a playback ID (returns basic info)
mux playback-ids abc123playbackid

# Look up and fetch the full asset or live stream object
mux playback-ids abc123playbackid --expand

# Get JSON output
mux playback-ids abc123playbackid --json
```

**Output (basic lookup):**

```
Playback ID: abc123playbackid
Policy: public
Type: asset
ID: abc123xyz
```

**Output (with --expand):**

When using `--expand`, the output will be the full asset or live stream object, formatted the same as `mux assets get` or `mux live get` commands.

**Note:** The nested `playback-ids` commands under `assets` and `live` (e.g., `mux assets playback-ids list`) are for managing playback IDs on known resources. This top-level command is for discovering what resource a playback ID belongs to.

### Signing Keys & Secure Playback

#### `mux signing-keys create`

Create a new signing key for secure video playback and automatically save it to the current environment.

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Create a new signing key
mux signing-keys create

# Create a signing key with JSON output
mux signing-keys create --json
```

**Output:**

```
Signing key created and saved to environment: default
Key ID: qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ
```

**Important:** The private key is only returned once during creation. The CLI automatically stores it in your current environment configuration, so you don't need to manually save it.

#### `mux signing-keys list`

List all signing keys with indicators showing which keys are configured in local environments.

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# List all signing keys
mux signing-keys list

# List signing keys with JSON output
mux signing-keys list --json
```

**Output:**

```
Found 2 signing key(s):

Key ID: qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ
  Created: 1234567890
  Active in environments: production, staging

Key ID: abc123def456ghi789jkl012mno345pq
  Created: 1234567891
  Active in environments: development
```

#### `mux signing-keys get <key-id>`

Get detailed information about a specific signing key.

**Arguments:**
- `<key-id>` - The ID of the signing key to retrieve

**Options:**
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Get signing key details
mux signing-keys get qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ

# Get signing key details as JSON
mux signing-keys get qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ --json
```

**Output:**

```
Signing Key ID: qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ
Created: 1234567890
Active in environments: production
```

#### `mux signing-keys delete <key-id>`

Delete a signing key permanently. This will invalidate all signed URLs created with this key.

**Arguments:**
- `<key-id>` - The ID of the signing key to delete

**Options:**
- `-f, --force` - Skip confirmation prompt
- `--json` - Output JSON instead of pretty format

**Examples:**

```bash
# Delete signing key with confirmation prompt
mux signing-keys delete qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ

# Delete signing key without confirmation
mux signing-keys delete qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ --force

# Delete signing key with JSON output
mux signing-keys delete qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ --force --json
```

**Important:** Deleting a signing key will invalidate all tokens and signed URLs created with that key. If the key is configured in any local environment, it will be automatically removed from those environment configurations.

**Output:**

```
WARNING: This signing key is configured in the following environments: production

Deleting this key will invalidate all signed URLs created with it.
Are you sure you want to delete signing key qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ? (y/n): y

Signing key qrdSB18tYITC7GNQCFJWKr25M9JPkMxJ deleted successfully
Removed from environment: production
```

#### `mux sign <playback-id>`

Sign a playback ID to generate a secure URL for video playback, thumbnails, GIFs, or storyboards. This is used with assets or live streams that have a `signed` playback policy.

**Arguments:**
- `<playback-id>` - The playback ID to sign

**Options:**
- `-e, --expiration <duration>` - Token expiration duration (default: '7d')
  - Examples: '7d', '24h', '1h', '30m'
- `-t, --type <type>` - Token type: `video`, `thumbnail`, `gif`, `storyboard` (default: 'video')
- `-p, --param <key=value>` - JWT claim as key=value (repeatable). Used to embed parameters like `time`, `width`, or `height` directly in the signed token.
- `--params-json <json>` - JWT claims as a JSON object. Useful for complex claims including nested values like `custom`.
- `--json` - Output JSON instead of pretty format
- `--token-only` - Output only the JWT token (no URL)

When `--param` and `--params-json` are both provided, `--params-json` is applied first as a base layer and `--param` values override on top.

**Examples:**

```bash
# Sign a playback ID with default settings (7 day expiration, video type)
mux sign abc123playbackid

# Sign with custom expiration
mux sign abc123playbackid --expiration 24h

# Sign for thumbnail access at a specific time
mux sign abc123playbackid --type thumbnail --param time=14

# Sign for thumbnail with dimensions
mux sign abc123playbackid --type thumbnail --param time=14 --param width=100

# Sign for animated GIF
mux sign abc123playbackid --type gif

# Sign with custom claims for tracking (nested under "custom" in JWT)
mux sign abc123playbackid --params-json '{"custom": {"session_id": "xxxx-123"}}'

# Get JSON output with full details
mux sign abc123playbackid --json

# Get only the JWT token for scripting
mux sign abc123playbackid --token-only
```

**Output:**

The output URL uses the appropriate domain based on the token type:

```bash
# Video (default) - uses stream.mux.com
mux sign abc123playbackid
https://stream.mux.com/abc123playbackid.m3u8?token=eyJ...

# Thumbnail - uses image.mux.com
mux sign abc123playbackid --type thumbnail --param time=14
https://image.mux.com/abc123playbackid/thumbnail.png?token=eyJ...

# GIF - uses image.mux.com
mux sign abc123playbackid --type gif
https://image.mux.com/abc123playbackid/animated.gif?token=eyJ...

# Storyboard - uses image.mux.com
mux sign abc123playbackid --type storyboard
https://image.mux.com/abc123playbackid/storyboard.vtt?token=eyJ...
```

**Thumbnail Parameters:**

When signing thumbnails, parameters like `time` and `width` must be embedded in the JWT claims (not as query parameters). The `--param` flag handles this automatically:

| Parameter | Description |
|-----------|-------------|
| `time` | Video timestamp in seconds for the thumbnail |
| `width` | Thumbnail width in pixels |
| `height` | Thumbnail height in pixels |
| `rotate` | Rotate clockwise: 90, 180, or 270 |
| `fit_mode` | How to fit: `preserve`, `stretch`, `crop`, `smartcrop`, `pad` |
| `flip_v` | Flip vertically |
| `flip_h` | Flip horizontally |

**Prerequisites:**

Before using `mux sign`, you must have a signing key configured in your current environment:

```bash
# Create and configure a signing key
mux signing-keys create
```

If no signing keys are configured, the command will provide helpful instructions on how to set one up.

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
├── commands/                 # CLI command definitions
│   ├── assets/              # Asset management commands
│   │   ├── manage/          # Interactive TUI for asset management
│   │   │   ├── index.ts     # TUI command entry point
│   │   │   └── AssetManageApp.tsx  # Main TUI application
│   │   ├── playback-ids/    # Playback ID commands for assets
│   │   │   ├── index.ts     # Main playback-ids command
│   │   │   ├── create.ts    # Create playback IDs
│   │   │   ├── list.ts      # List playback IDs
│   │   │   └── delete.ts    # Delete playback IDs
│   │   ├── index.ts         # Main assets command
│   │   ├── create.ts        # Create assets
│   │   ├── list.ts          # List assets
│   │   ├── get.ts           # Get asset details
│   │   ├── update.ts        # Update asset metadata
│   │   └── delete.ts        # Delete assets
│   ├── live/                # Live stream management commands
│   │   ├── playback-ids/    # Playback ID commands for live streams
│   │   │   ├── index.ts     # Main playback-ids command
│   │   │   ├── create.ts    # Create playback IDs
│   │   │   ├── list.ts      # List playback IDs
│   │   │   └── delete.ts    # Delete playback IDs
│   │   ├── index.ts         # Main live command
│   │   ├── create.ts        # Create live streams
│   │   ├── list.ts          # List live streams
│   │   ├── get.ts           # Get live stream details
│   │   └── delete.ts        # Delete live streams
│   ├── signing-keys/        # Signing key management commands
│   │   ├── index.ts         # Main signing-keys command
│   │   ├── create.ts        # Create signing keys
│   │   ├── list.ts          # List signing keys
│   │   ├── get.ts           # Get signing key details
│   │   └── delete.ts        # Delete signing keys
│   ├── env/                 # Environment management commands
│   │   ├── index.ts         # Main env command
│   │   ├── list.ts          # List environments
│   │   └── switch.ts        # Switch default environment
│   ├── login.ts             # Login command
│   ├── logout.ts            # Logout command
│   └── sign.ts              # Sign playback IDs command
├── lib/                     # Shared libraries
│   ├── tui/                 # Reusable TUI components
│   │   ├── index.ts         # TUI exports
│   │   ├── renderer.tsx     # OpenTUI renderer setup
│   │   ├── SelectList.tsx   # Reusable selection list component
│   │   ├── ActionMenu.tsx   # Reusable action menu component
│   │   ├── ConfirmDialog.tsx # Reusable confirmation dialog
│   │   └── clipboard.ts     # Clipboard utilities
│   ├── config.ts            # Configuration management
│   ├── formatters.ts        # Shared output formatting (timestamps, durations, statuses)
│   ├── mux.ts               # Mux API integration and auth helpers
│   ├── json-config.ts       # JSON configuration parsing
│   ├── file-upload.ts       # File upload utilities
│   ├── urls.ts              # URL generation (stream, player, thumbnail, gif, storyboard)
│   ├── signing.ts           # JWT signing utilities
│   ├── playback-ids.ts      # Playback ID operations
│   └── xdg.ts               # XDG base directory support
└── index.ts                 # CLI entry point
```

## License

Apache-2.0. See [LICENSE](LICENSE) for details.

## Support

For issues and questions:
- File an issue on GitHub
- Visit [Mux Documentation](https://docs.mux.com/)
- Contact Mux Support
