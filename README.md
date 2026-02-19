# Mux CLI

A command-line interface for interacting with the Mux API, designed to provide a first-class development experience for working with Mux services locally.

## Table of Contents

- [Installation](#installation)
- [Shell Completions](#shell-completions)
- [Getting Started](#getting-started)
- [Common Options](#common-options)
- [Commands](#commands)
  - [Asset Management](#asset-management)
  - [Live Stream Management](#live-stream-management)
  - [Uploads](#uploads)
  - [Playback ID Lookup](#playback-id-lookup)
  - [Playback Restrictions](#playback-restrictions)
  - [Signing Keys & Secure Playback](#signing-keys--secure-playback)
  - [Transcription Vocabularies](#transcription-vocabularies)
  - [Delivery Usage](#delivery-usage)
  - [DRM Configurations](#drm-configurations)
  - [Mux Data](#mux-data)
  - [Authentication & Environment Management](#authentication--environment-management)
- [Configuration](#configuration)
- [Development](#development)
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

## Shell Completions

Enable tab completion for commands, subcommands, and options in your shell:

**Bash** (add to `~/.bashrc`):
```bash
source <(mux completions bash)
```

**Zsh** (add to `~/.zshrc`):
```bash
source <(mux completions zsh)
```

**Fish** (add to `~/.config/fish/config.fish`):
```fish
source (mux completions fish | psub)
```

Restart your shell or source the config file to activate completions.

## Getting Started

### Authentication

Before using the Mux CLI, you need to authenticate with your Mux API credentials. You can obtain these from the [Mux Dashboard](https://dashboard.mux.com/settings/access-tokens).

```bash
# Interactive login (prompts for Token ID and Secret)
mux login

# Login with .env file (expects MUX_TOKEN_ID and MUX_TOKEN_SECRET)
mux login --env-file .env

# Named environments for multi-environment workflows
mux login --name production
mux login --name staging --env-file .env.staging
```

The first environment you add becomes the default. See [Authentication & Environment Management](#authentication--environment-management) for more details.

## Common Options

These options are available on most commands and are not repeated in individual command docs below.

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON instead of pretty-printed format. Useful for scripting and piping to `jq`. |
| `--compact` | One-line-per-item output, grep-friendly. Available on `list` commands. |
| `--limit <n>` | Number of results to return (default: 25). Available on `list` commands. |
| `--page <n>` | Page number for pagination (default: 1). Available on `list` commands. |
| `-f, --force` | Skip confirmation prompts on destructive actions. **Required** when combining `--json` with `delete` commands. |
| `--wait` | Poll until the resource is ready before returning. Available on `create` commands. |

## Commands

<details open>
<summary><h3>Asset Management</h3></summary>

#### `mux assets create`

Create a new Mux video asset from a URL, local file, or JSON configuration.

**Options:**
- `--url <url>` - Video URL to ingest from the web
- `--upload <path>` - Local file(s) to upload (supports glob patterns like `*.mp4`)
- `--file, -f <path>` - JSON configuration file for complex asset creation
- `--playback-policy <policy>` - `public` or `signed` (repeatable)
- `--test` - Create test asset (watermarked, 10s limit, deleted after 24h)
- `--passthrough <string>` - User metadata (max 255 characters)
- `--static-renditions <resolution>` - e.g. `1080p`, `720p`, `highest`, `audio-only` (repeatable)
- `--video-quality <quality>` - `basic`, `plus`, or `premium`
- `--normalize-audio` - Normalize audio loudness level
- `-y, --yes` - Skip confirmation prompts

**Examples:**

```bash
# Create from URL
mux assets create --url https://example.com/video.mp4 --playback-policy public

# Upload local files (glob supported, each file becomes a separate asset)
mux assets create --upload ./videos/*.mp4 --playback-policy public

# Complex config from JSON file (overlays, subtitles, multiple inputs)
mux assets create --file asset-config.json

# Wait for processing to complete
mux assets create --url https://example.com/video.mp4 --playback-policy public --wait
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
        { "language_code": "en", "name": "English" }
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

```bash
mux assets create --file asset-config.json
```

#### `mux assets list`

List all video assets with pagination and filtering.

**Unique options:**
- `--upload-id <id>` - Filter by upload ID
- `--live-stream-id <id>` - Filter by live stream ID

```bash
mux assets list
mux assets list --limit 10 --page 2
mux assets list --live-stream-id abc123
```

#### `mux assets get <asset-id>`

Get detailed information about a specific video asset.

```bash
mux assets get abc123xyz
```

#### `mux assets update <asset-id>`

Update metadata fields on a video asset. At least one field flag must be provided.

**Options:**
- `--title <string>` - Set `meta.title` (max 512 characters)
- `--creator-id <string>` - Set `meta.creator_id` (max 128 characters)
- `--external-id <string>` - Set `meta.external_id` (max 128 characters)
- `--passthrough <string>` - Set `passthrough` (max 255 characters)

```bash
mux assets update abc123xyz --title "My Video" --creator-id "user-42"
mux assets update abc123xyz --title ""  # clear a field
```

#### `mux assets delete <asset-id>`

Delete a video asset permanently.

```bash
mux assets delete abc123xyz          # with confirmation prompt
mux assets delete abc123xyz --force  # skip confirmation
```

#### `mux assets manage`

Interactive terminal UI (TUI) to browse assets, view details, manage playback IDs, and copy URLs. Navigate with arrow keys, Enter, and `q` to quit.

```bash
mux assets manage
```

**Note:** Requires an interactive terminal (TTY). For scripting, use `mux assets list`, `mux assets get`, etc.

#### `mux assets input-info <asset-id>`

Retrieve input info for an asset, including file details, tracks, and encoding settings.

```bash
mux assets input-info abc123xyz
```

#### `mux assets update-master-access <asset-id>`

Update master access settings for an asset (`temporary` or `none`).

```bash
mux assets update-master-access abc123xyz --master-access temporary
```

#### Playback ID Management

Manage playback IDs on assets. Each asset can have multiple playback IDs with different policies.

```bash
mux assets playback-ids list <asset-id>
mux assets playback-ids create <asset-id> [--policy signed]
mux assets playback-ids delete <asset-id> <playback-id> [--force]
```

#### Static Renditions Management

Static renditions are downloadable MP4 versions of your video assets at specific resolutions.

```bash
mux assets static-renditions list <asset-id>
mux assets static-renditions create <asset-id> --resolution 1080p [--wait]
mux assets static-renditions delete <asset-id> <rendition-id> [--force]
```

**Resolution options:** `highest`, `audio-only`, `2160p`, `1440p`, `1080p`, `720p`, `540p`, `480p`, `360p`, `270p`

#### Track Management

Manage text and audio tracks (subtitles, captions, audio) on video assets.

##### `mux assets tracks create <asset-id>`

Add a text or audio track to an asset.

**Options:**
- `--url <url>` - URL of the track file (required)
- `--type <type>` - Track type: `text` or `audio` (required)
- `--language-code <code>` - BCP 47 language code, e.g., `en-US` (required)
- `--name <name>` - Human-readable name for the track
- `--text-type <type>` - Text track type: `subtitles` or `captions`
- `--closed-captions` - Indicates the track provides SDH
- `--passthrough <string>` - Passthrough metadata (max 255 characters)

```bash
mux assets tracks create abc123xyz --url https://example.com/subs.vtt --type text --language-code en --text-type subtitles
```

##### `mux assets tracks delete <asset-id> <track-id>`

Delete a track from an asset. Supports `--force`.

##### `mux assets tracks generate-subtitles <asset-id> <track-id>`

Generate subtitles for an audio track using automatic speech recognition.

**Options:** `--language-code <code>`, `--name <name>`, `--passthrough <string>`

```bash
mux assets tracks generate-subtitles abc123xyz track456 --language-code en --name "English (auto)"
```

</details>

<details>
<summary><h3>Live Stream Management</h3></summary>

#### `mux live create`

Create a new Mux live stream for broadcasting.

**Options:**
- `--playback-policy <policy>` - `public` or `signed` (repeatable)
- `--new-asset-settings <settings>` - Auto-create asset from stream. Use `none` to disable, or JSON string (e.g., `'{"playback_policies": ["public"]}'`)
- `--reconnect-window <seconds>` - Reconnect timeout (default: 60)
- `--latency-mode <mode>` - `low`, `reduced`, or `standard` (default: `low`)
- `--test` - Create test stream (deleted after 24h)

```bash
mux live create --playback-policy public
mux live create --playback-policy public --latency-mode low --test
mux live create --playback-policy public --new-asset-settings '{"playback_policies": ["public"]}'
```

Once created, stream using:
- **RTMP URL:** `rtmp://global-live.mux.com/app`
- **Stream Key:** returned in the response

#### `mux live list`

List all live streams with pagination.

```bash
mux live list
mux live list --limit 10 --compact
```

#### `mux live get <stream-id>`

Get detailed information about a specific live stream.

```bash
mux live get abc123xyz
```

#### `mux live update <stream-id>`

Update configuration on a live stream. At least one option must be provided.

**Options:**
- `--latency-mode <mode>` - `low`, `reduced`, or `standard`
- `--reconnect-window <seconds>` - Reconnect window (0-1800)
- `--max-continuous-duration <seconds>` - Max continuous duration (60-43200)
- `--passthrough <string>` - Passthrough metadata (max 255 characters)
- `--reconnect-slate-url <url>` - Image to display during reconnect
- `--use-slate-for-standard-latency` - Display slate for standard latency streams
- `--title <string>` - Title for the live stream

```bash
mux live update abc123xyz --latency-mode standard
mux live update abc123xyz --reconnect-window 300 --title "My Stream"
```

#### `mux live delete <stream-id>`

Delete a live stream permanently.

```bash
mux live delete abc123xyz          # with confirmation
mux live delete abc123xyz --force  # skip confirmation
```

#### `mux live complete <stream-id>`

Signal that a live stream has ended and Mux should complete the recording.

#### `mux live enable <stream-id>`

Enable a disabled live stream, allowing it to accept new connections.

#### `mux live disable <stream-id>`

Disable a live stream, preventing it from accepting new connections.

```bash
mux live complete abc123xyz
mux live enable abc123xyz
mux live disable abc123xyz
```

#### `mux live reset-stream-key <stream-id>`

Reset the stream key for a live stream. This invalidates the current key.

```bash
mux live reset-stream-key abc123xyz          # with confirmation
mux live reset-stream-key abc123xyz --force  # skip confirmation
```

#### Simulcast Targets

Manage simulcast targets to restream a live stream to third-party platforms (e.g., YouTube, Twitch).

```bash
# Create a simulcast target
mux live simulcast-targets create <stream-id> --url rtmp://live.twitch.tv/app --stream-key live_xxxxx

# Get details about a simulcast target
mux live simulcast-targets get <stream-id> <target-id>

# Delete a simulcast target
mux live simulcast-targets delete <stream-id> <target-id> [--force]
```

#### Embedded & Generated Subtitles

##### `mux live update-embedded-subtitles <stream-id>`

Update embedded subtitle (CEA-608) configuration.

**Options:** `--language-channel <cc1|cc2|cc3|cc4>`, `--language-code <code>`, `--name <name>`, `--passthrough <string>`, `--clear`

```bash
mux live update-embedded-subtitles abc123xyz --language-channel cc1 --language-code en --name "English CC"
```

##### `mux live update-generated-subtitles <stream-id>`

Update generated subtitle (ASR) configuration.

**Options:** `--language-code <code>`, `--name <name>`, `--passthrough <string>`, `--transcription-vocabulary-ids <id>` (repeatable), `--clear`

```bash
mux live update-generated-subtitles abc123xyz --language-code en --name "English (auto)"
```

#### New Asset Static Renditions

Configure static rendition settings for assets automatically created from a live stream.

```bash
# Set rendition resolutions
mux live update-new-asset-static-renditions <stream-id> --resolution 1080p --resolution 720p

# Delete rendition settings
mux live delete-new-asset-static-renditions <stream-id> [--force]
```

#### Playback ID Management (Live)

Manage playback IDs on live streams, same interface as asset playback IDs.

```bash
mux live playback-ids list <stream-id>
mux live playback-ids create <stream-id> [--policy signed]
mux live playback-ids delete <stream-id> <playback-id> [--force]
```

</details>

<details>
<summary><h3>Uploads</h3></summary>

Manage direct uploads for client-side video uploading. Direct uploads provide a URL that clients can use to upload video files directly to Mux.

#### `mux uploads create`

Create a new direct upload URL.

**Options:**
- `--cors-origin <origin>` - Allowed CORS origin for the upload (required)
- `-p, --playback-policy <policy>` - `public` or `signed`
- `--timeout <seconds>` - Seconds before the upload times out (default: 3600)
- `--test` - Create a test upload (asset deleted after 24 hours)

```bash
mux uploads create --cors-origin "https://example.com" --playback-policy public
```

#### `mux uploads list`

List direct uploads with pagination. Supports `--limit`, `--page`, `--compact`.

#### `mux uploads get <upload-id>`

Get details about a specific direct upload.

#### `mux uploads cancel <upload-id>`

Cancel a waiting direct upload. Supports `--force`.

```bash
mux uploads cancel abc123xyz --force
```

</details>

<details>
<summary><h3>Playback ID Lookup</h3></summary>

#### `mux playback-ids <playback-id>`

Look up which asset or live stream a playback ID belongs to.

**Options:**
- `--expand` - Fetch the full asset or live stream object instead of just the reference

```bash
mux playback-ids abc123playbackid
mux playback-ids abc123playbackid --expand
```

**Note:** The nested `playback-ids` commands under `assets` and `live` are for managing playback IDs on known resources. This top-level command is for discovering what resource a playback ID belongs to.

</details>

<details>
<summary><h3>Playback Restrictions</h3></summary>

Manage playback restrictions to control where and how your content can be played.

#### `mux playback-restrictions create`

Create a new playback restriction.

**Options:**
- `--allowed-domains <domain>` - Allowed referrer domains (required, repeatable)
- `--allow-no-referrer` - Allow playback when no referrer is sent
- `--allow-no-user-agent` - Allow playback when no user agent is sent
- `--allow-high-risk-user-agent` - Allow playback from high-risk user agents

```bash
mux playback-restrictions create --allowed-domains "example.com" --allowed-domains "*.example.com"
```

#### `mux playback-restrictions list`

List playback restrictions. Supports `--limit`, `--page`, `--compact`.

#### `mux playback-restrictions get <restriction-id>`

Get details about a playback restriction.

#### `mux playback-restrictions delete <restriction-id>`

Delete a playback restriction. Supports `--force`.

#### `mux playback-restrictions update-referrer <restriction-id>`

Update the referrer restriction.

**Options:** `--allowed-domains <domain>` (required, repeatable), `--allow-no-referrer`

#### `mux playback-restrictions update-user-agent <restriction-id>`

Update the user agent restriction.

**Options:** `--allow-no-user-agent <boolean>` (required), `--allow-high-risk-user-agent <boolean>` (required)

</details>

<details>
<summary><h3>Signing Keys & Secure Playback</h3></summary>

#### Signing Key Management

```bash
mux signing-keys create              # creates key and saves to current environment
mux signing-keys list                # lists keys with environment indicators
mux signing-keys get <key-id>
mux signing-keys delete <key-id> [--force]
```

The private key is only returned once during creation. The CLI automatically stores it in your current environment configuration.

Deleting a signing key invalidates all tokens and signed URLs created with it and removes it from any local environment configurations.

#### `mux sign <playback-id>`

Sign a playback ID to generate a secure URL for video playback, thumbnails, GIFs, or storyboards. Used with assets or live streams that have a `signed` playback policy.

**Options:**
- `-e, --expiration <duration>` - Token expiration (default: `7d`). Examples: `7d`, `24h`, `30m`
- `-t, --type <type>` - `video` (default), `thumbnail`, `gif`, `storyboard`
- `-p, --param <key=value>` - JWT claim as key=value (repeatable)
- `--params-json <json>` - JWT claims as JSON object
- `--token-only` - Output only the JWT token (no URL)

When both `--param` and `--params-json` are provided, `--params-json` is applied first and `--param` values override on top.

**Examples:**

```bash
mux sign abc123playbackid
mux sign abc123playbackid --expiration 24h
mux sign abc123playbackid --type thumbnail --param time=14 --param width=100
mux sign abc123playbackid --type gif
mux sign abc123playbackid --params-json '{"custom": {"session_id": "xxxx-123"}}'
mux sign abc123playbackid --token-only
```

**Output URLs by type:**

| Type | Domain | Example path |
|------|--------|-------------|
| `video` | `stream.mux.com` | `/{id}.m3u8?token=...` |
| `thumbnail` | `image.mux.com` | `/{id}/thumbnail.png?token=...` |
| `gif` | `image.mux.com` | `/{id}/animated.gif?token=...` |
| `storyboard` | `image.mux.com` | `/{id}/storyboard.vtt?token=...` |

**Thumbnail parameters** (embedded in JWT via `--param`):

| Parameter | Description |
|-----------|-------------|
| `time` | Video timestamp in seconds |
| `width` | Width in pixels |
| `height` | Height in pixels |
| `rotate` | Clockwise rotation: 90, 180, or 270 |
| `fit_mode` | `preserve`, `stretch`, `crop`, `smartcrop`, `pad` |
| `flip_v` | Flip vertically |
| `flip_h` | Flip horizontally |

**Prerequisite:** You must have a signing key in your current environment. Run `mux signing-keys create` to set one up.

</details>

<details>
<summary><h3>Transcription Vocabularies</h3></summary>

Manage custom transcription vocabularies to improve automatic speech recognition accuracy for domain-specific terms.

#### `mux transcription-vocabularies create`

**Options:**
- `--phrase <phrase>` - Phrase to include (required, repeatable)
- `--name <name>` - Name for the vocabulary
- `--passthrough <string>` - Passthrough metadata (max 255 characters)

```bash
mux transcription-vocabularies create --phrase "Mux" --phrase "HLS" --phrase "RTMP" --name "Streaming Terms"
```

#### `mux transcription-vocabularies list`

List vocabularies. Supports `--limit`, `--page`, `--compact`.

#### `mux transcription-vocabularies get <vocabulary-id>`

Get details about a vocabulary.

#### `mux transcription-vocabularies update <vocabulary-id>`

Update a vocabulary. This replaces all existing phrases.

**Options:** `--phrase <phrase>` (required, repeatable), `--name <name>`, `--passthrough <string>`

#### `mux transcription-vocabularies delete <vocabulary-id>`

Delete a vocabulary. Supports `--force`.

</details>

<details>
<summary><h3>Delivery Usage</h3></summary>

#### `mux delivery-usage list`

List delivery usage reports for video assets and live streams.

**Options:**
- `--asset-id <id>` - Filter by asset ID
- `--live-stream-id <id>` - Filter by live stream ID
- `--timeframe <timeframe>` - Timeframe as Unix epoch timestamps (specify twice for start and end)

```bash
mux delivery-usage list
mux delivery-usage list --asset-id abc123xyz
```

Supports `--limit`, `--page`, `--compact`.

</details>

<details>
<summary><h3>DRM Configurations</h3></summary>

View DRM configurations for your Mux environment. DRM configurations are provisioned by Mux and are read-only.

```bash
mux drm-configurations list
mux drm-configurations get <drm-configuration-id>
```

</details>

<details>
<summary><h3>Mux Data</h3></summary>

Commands for video analytics, monitoring, and incident tracking via the Mux Data API.

#### Video Views

```bash
mux video-views list [--filters "country:US"] [--timeframe "24:hours"] [--viewer-id <id>] [--error-id <id>]
mux video-views get <view-id>
```

**List options:** `--filters`, `--metric-filters`, `--timeframe`, `--viewer-id`, `--error-id`, `--order-direction`, `--limit`, `--page`, `--compact`

#### Metrics

```bash
# List available metrics
mux metrics list [--dimension <dimension>] [--value <value>]

# Breakdown by dimension
mux metrics breakdown <metric-id> --group-by country --measurement median

# Overall metric values
mux metrics overall <metric-id> [--measurement avg]

# Timeseries data
mux metrics timeseries <metric-id> [--group-by hour]

# Performance insights
mux metrics insights <metric-id> [--measurement 95th]
```

**Common options:** `--measurement <95th|median|avg|count|sum>`, `--filters`, `--metric-filters`, `--timeframe`

**Breakdown/timeseries also support:** `--group-by`, `--order-by`, `--order-direction`, `--limit`, `--page`, `--compact`

#### Monitoring

Real-time monitoring data from Mux Data.

```bash
mux monitoring dimensions                              # list available dimensions
mux monitoring metrics                                  # list available metrics
mux monitoring breakdown <metric-id> [--dimension <d>] [--timestamp <ts>]
mux monitoring breakdown-timeseries <metric-id> [--dimension <d>]
mux monitoring histogram-timeseries [--filters ...]
mux monitoring timeseries <metric-id> [--timestamp <ts>]
```

#### Incidents

```bash
mux incidents list [--status open] [--severity alert]
mux incidents get <incident-id>
mux incidents related <incident-id>
```

**List options:** `--status <open|closed|expired>`, `--severity <warning|alert>`, `--order-by`, `--order-direction`, `--limit`, `--page`, `--compact`

#### Annotations

Mark significant events (deployments, config changes, etc.) on your analytics timeline.

```bash
# Create annotation
mux annotations create --date 1700000000 --note "Deployed v2.1.0" [--sub-property-id <id>]

# List, get, update, delete
mux annotations list [--timeframe ...]
mux annotations get <annotation-id>
mux annotations update <annotation-id> --date <timestamp> --note <text>
mux annotations delete <annotation-id> [--force]
```

#### Dimensions

```bash
mux dimensions list                                    # list available dimensions
mux dimensions values <dimension-id> [--timeframe "24:hours"]
```

#### Errors

```bash
mux errors list [--filters ...] [--timeframe ...]
```

#### Exports

```bash
mux exports list                                       # list video view export files
```

</details>

<details>
<summary><h3>Authentication & Environment Management</h3></summary>

#### `mux login`

Authenticate with Mux and save credentials.

**Options:**
- `-f, --env-file <path>` - Path to .env file containing `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`
- `-n, --name <name>` - Name for this environment (default: `default`)

```bash
mux login                                        # interactive
mux login --env-file .env                         # from .env file
mux login --name production --env-file .env.prod  # named environment
```

#### `mux logout <name>`

Remove credentials for a specific environment. When you remove the default environment, the CLI automatically selects another as the new default.

```bash
mux logout default
mux logout staging
```

#### `mux env list`

Display all configured environments.

```bash
mux env list
```

#### `mux env switch <name>`

Change the default environment.

```bash
mux env switch staging
```

</details>

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

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch
```

### Project Structure

```
src/
├── commands/                          # CLI command definitions
│   ├── assets/                       # Asset management
│   │   ├── manage/                   # Interactive TUI
│   │   ├── playback-ids/             # Playback ID sub-resource
│   │   ├── static-renditions/        # Static rendition sub-resource
│   │   ├── tracks/                   # Track management (subtitles, audio)
│   │   ├── create.ts, list.ts, get.ts, update.ts, delete.ts
│   │   ├── input-info.ts             # Retrieve input info
│   │   └── update-master-access.ts   # Update master access settings
│   ├── live/                         # Live stream management
│   │   ├── playback-ids/             # Playback ID sub-resource
│   │   ├── simulcast-targets/        # Simulcast target sub-resource
│   │   ├── create.ts, list.ts, get.ts, update.ts, delete.ts
│   │   ├── complete.ts, enable.ts, disable.ts
│   │   ├── reset-stream-key.ts
│   │   ├── update-embedded-subtitles.ts
│   │   ├── update-generated-subtitles.ts
│   │   ├── update-new-asset-static-renditions.ts
│   │   └── delete-new-asset-static-renditions.ts
│   ├── uploads/                      # Direct upload management
│   ├── playback-restrictions/        # Playback restriction management
│   ├── transcription-vocabularies/   # Transcription vocabulary management
│   ├── delivery-usage/               # Delivery usage reports
│   ├── drm-configurations/          # DRM configuration management
│   ├── signing-keys/                 # Signing key management
│   ├── video-views/                  # Mux Data: video view analytics
│   ├── metrics/                      # Mux Data: metric analytics
│   ├── monitoring/                   # Mux Data: real-time monitoring
│   ├── incidents/                    # Mux Data: incident tracking
│   ├── annotations/                  # Mux Data: annotation management
│   ├── dimensions/                   # Mux Data: dimension queries
│   ├── errors/                       # Mux Data: error analytics
│   ├── exports/                      # Mux Data: export files
│   ├── env/                          # Environment management
│   ├── login.ts, logout.ts, sign.ts  # Auth & signing commands
│   └── playback-ids.ts               # Playback ID lookup
├── lib/                              # Shared libraries
│   ├── tui/                          # Reusable TUI components
│   ├── config.ts                     # Configuration management
│   ├── formatters.ts                 # Output formatting
│   ├── data-filters.ts               # Mux Data filter utilities
│   ├── mux.ts                        # Mux API client
│   ├── urls.ts                       # URL generation
│   ├── signing.ts                    # JWT signing
│   └── ...                           # Other utilities
└── index.ts                          # CLI entry point
```

## License

Apache-2.0. See [LICENSE](LICENSE) for details.

## Support

For issues and questions:
- File an issue on GitHub
- Visit [Mux Documentation](https://docs.mux.com/)
- Contact Mux Support
