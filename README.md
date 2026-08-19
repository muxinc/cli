# Mux CLI

A command-line interface for interacting with the Mux API, designed to provide a first-class development experience for working with Mux services locally.

## Table of Contents

- [Installation](#installation)
- [Shell Completions](#shell-completions)
- [Getting Started](#getting-started)
- [Common Options](#common-options)
- [Webhook Forwarding](#webhook-forwarding)
- [Commands](#commands)
  - [Assets](#assets)
  - [Live Streams](#live-streams)
  - [Uploads](#uploads)
  - [Playback ID Lookup](#playback-id-lookup)
  - [Playback Restrictions](#playback-restrictions)
  - [Signing Keys & Secure Playback](#signing-keys--secure-playback)
  - [Transcription Vocabularies](#transcription-vocabularies)
  - [Delivery Usage](#delivery-usage)
  - [DRM Configurations](#drm-configurations)
  - [Robots](#robots)
  - [Mux Data](#mux-data)
  - [Authentication & Environment Management](#authentication--environment-management)
- [Configuration](#configuration)
- [Development](#development)
- [License](#license)
- [Support](#support)

## Installation

### Homebrew (macOS)

```bash
brew install muxinc/tap/mux
```

### Install via npm

```bash
npm install -g @mux/cli
```

Or run directly with npx:

```bash
npx @mux/cli
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

```bash
mux completions install
```

This detects your shell and adds the appropriate source line to your config file (e.g. `~/.zshrc`). Restart your shell or source the file to activate completions.

### Manual setup

If you prefer to configure completions yourself, add the appropriate line to your shell's config file:

**Bash:** Add the following line to `~/.bashrc`:
```bash
source <(mux completions bash)
```

**Zsh:** Add the following line to `~/.zshrc`:
```bash
source <(mux completions zsh)
```

**Fish:** Add the following line to `~/.config/fish/config.fish`:
```fish
source (mux completions fish | psub)
```

After saving the file, restart your shell or source it (e.g. `source ~/.zshrc`) to activate completions.

## Getting Started

### Authentication

The CLI supports two ways to sign in, and both are fully supported:

- **Browser sign-in (default).** `mux login` opens the Mux Dashboard, where you pick an organization and environment. The CLI receives the result on a local loopback address and manages token refresh for you. Best for local development.
- **Mux API access token.** A Token ID and Secret from the [Mux Dashboard](https://dashboard.mux.com/settings/access-tokens). Best for CI, service accounts, and scripting, where no browser is available.

```bash
# Browser sign-in: pick an organization and environment in the dashboard
mux login

# Sign in to more environments by running it again — each one is saved separately
mux login

# Mux API access token, entered manually
mux login --interactive

# Access token from a .env file (expects MUX_TOKEN_ID and MUX_TOKEN_SECRET)
mux login --env-file .env

# Save the MUX_TOKEN_ID / MUX_TOKEN_SECRET already set in this shell
mux login --from-env

# Named environments for multi-environment workflows
mux login --name production
mux login --name staging --env-file .env.staging
```

> [!IMPORTANT]
> When `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` are set in your shell, `mux login` with no
> flags stops and asks which method you meant, rather than silently saving them. Those
> variables already work on their own — no login needed — and they take precedence over
> any saved login, so a config entry written from them has no effect until they are unset.
> Pass `--from-env` to save them deliberately, or `--oauth` for a browser sign-in.

Browser sign-in names each environment after the organization and environment you selected (for example `acme-inc-production`); pass `--name` to choose your own. Signing in again to the *same* environment refreshes its credentials in place and keeps its signing keys and forward URL; signing in to a *different* environment adds a new entry and never overwrites an existing one.

The first environment you add becomes the default, and a new browser sign-in becomes the active environment unless you pass `--keep-current`. Run `mux auth status` at any time to see every credential the CLI can find and which one is active. See [Authentication & Environment Management](#authentication--environment-management) for more details.

#### Credential sources and precedence

The CLI resolves credentials from two sources, in order:

1. **Environment variables** — `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`. Used only when both are set and non-empty; a lone variable is ignored.
2. **Stored login** — the active environment saved by `mux login`, whether it holds a browser sign-in or an access token pair.

Environment variables take precedence over the stored login, matching the convention of tools like the GitHub, Stripe, and Vercel CLIs. When they shadow a stored login, the CLI prints a one-line notice on stderr naming the shadowed environment (suppressed in agent mode). `mux auth status` lays out every source and marks the active one.

Because environment variables win, `mux login` with `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` already set refuses to guess: it prints the four explicit methods and exits without writing anything. Pass `--from-env` to save the shell credentials, or `--oauth` for a browser sign-in. If a login is saved while those variables are set, the CLI says so — the saved login will not take effect until they are unset.

#### One environment, two ways in

A single environment can hold both credential kinds at once: an access token pair saved for CI and a browser sign-in saved by `mux login`. Both are kept, and **OAuth is preferred when present** — OAuth credentials go stale unless they are exercised and refreshed, so the CLI does not quietly live on the token pair.

If an OAuth login stops working for good (its refresh token was revoked or expired), the CLI records the failure on that credential, surfaces it in `mux auth status` and `mux env list`, and falls back to the access token pair on the same environment if there is one. Nothing is deleted automatically: run `mux login` to replace the dead login, or `mux logout <name>` to remove the environment entirely.

All OAuth endpoints live on the Mux API host, so they are derived from one base — `MUX_BASE_URL` moves the API calls, discovery, and the sign-in flow together, and the token endpoint can never end up on a different host than the authorization endpoint. On top of that, the CLI discovers the authorization server's endpoints at runtime (RFC 8414 / OIDC discovery, cached for a day in `~/.cache/mux/`), so Mux can move them without breaking installed versions. Discovery is never required: if it is unreachable the CLI falls back to built-in defaults, and `MUX_OAUTH_AUTHORIZE_URL` / `MUX_OAUTH_TOKEN_URL` / `MUX_OAUTH_REVOKE_URL` always win when set. It is consulted only on login and refresh, never on ordinary commands.

Requests carry `Authorization: Basic` for access token credentials and `Authorization: Bearer` for browser sign-ins. Access tokens for a browser sign-in are refreshed automatically: shortly before they expire, and once on an unexpected `401` before the request is retried. Concurrent `mux` processes coordinate through a lock file so a refresh token is never spent twice. When a refresh token is finally rejected, the CLI names the environment and tells you to run `mux login` again.

All values in a credential bundle come from the same source — the CLI never mixes sources:

| Variable | Purpose |
|----------|---------|
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | API credentials (both required to take effect) |
| `MUX_BASE_URL` | API host override (applies to either source). Also moves the OAuth endpoints and endpoint discovery, so one variable points the whole CLI at another environment |
| `MUX_SIGNING_KEY` / `MUX_PRIVATE_KEY` | Signing key pair for `mux sign` (setting only one of the pair is an error; used alongside API credentials, not instead of them) |
| `MUX_OAUTH_CLIENT_ID` | OAuth client identifier. Needed when pointing at a non-production authorization server |
| `MUX_OAUTH_SCOPES` | Narrow the scopes requested at sign-in (space or comma separated). Defaults to what the CLI's commands need |
| `MUX_OAUTH_AUTHORIZE_URL` / `MUX_OAUTH_TOKEN_URL` / `MUX_OAUTH_REVOKE_URL` | Override a single OAuth endpoint. Takes precedence over both discovery and `MUX_BASE_URL` |

When credentials come from environment variables, the API host is `MUX_BASE_URL` or the default `https://api.mux.com` — never a stored environment's custom host. Similarly, `mux sign` only falls back to a stored environment's signing keys when that environment matches the active credentials, so tokens for one environment cannot mint tokens with another environment's key.

## Common Options

These options are available on most commands and are not repeated in individual command docs below.

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON instead of pretty-printed format. Useful for scripting and piping to `jq`. |
| `--compact` | One-line-per-item output, grep-friendly. Available on `list` commands. |
| `--limit <n>` | Number of results to return (default: 25). Available on `list` commands. |
| `--page <n>` | Page number for pagination (default: 1). Available on `list` commands. |
| `-f, --force` | Skip confirmation prompts on destructive actions. **Required** for `delete` commands with `--json` or in agent mode. |
| `--wait` | Poll until the resource is ready before returning. Available on `create` commands. |

## Webhook Forwarding

Listen for Mux webhook events in real-time and forward them to your local development server. Events are stored locally for replay during development.

> [!CAUTION]
> These CLI commands are for **local development only** and provide **no delivery guarantees**. In production, you must configure a webhook endpoint in the [Mux Dashboard](https://dashboard.mux.com) that points to your server webhook endpoint URL.

### `mux webhooks listen`

Connect to Mux's event stream and optionally forward events to a local URL.

**Options:**
- `--forward-to <url>` - POST received events to a local URL in real-time
- `--json` - Output raw JSON per event

```bash
# Listen and print events
mux webhooks listen

# Forward to local dev server
mux webhooks listen --forward-to http://localhost:3000/api/webhooks/mux
```

When using `--forward-to`, the CLI displays a webhook signing secret and signs each forwarded request with a `mux-signature` header. Set `MUX_WEBHOOK_SECRET` in your app's environment to verify these signatures using the Mux Node SDK:

```typescript
const event = mux.webhooks.unwrap(body, headers, process.env.MUX_WEBHOOK_SECRET);
```

The signing secret is unique per environment and persisted between sessions, so you only need to configure it once.

### `mux webhooks events list`

List locally stored webhook events captured during `listen` sessions. The CLI stores the last 100 events.

**Options:**
- `--limit <n>` - Maximum number of events to show (default: 25)

```bash
mux webhooks events list
mux webhooks events list --limit 50
```

### `mux webhooks events replay [event-id]`

Replay stored webhook events. Useful for re-testing your webhook handler without creating new resources.

**Options:**
- `--forward-to <url>` - POST event(s) to a local URL
- `--all` - Replay all stored events
- `--json` - Output JSON instead of pretty format

```bash
# Replay a specific event to your local server
mux webhooks events replay abc123-event-id --forward-to http://localhost:3000/api/webhooks/mux

# Replay all stored events
mux webhooks events replay --all --forward-to http://localhost:3000/api/webhooks/mux

# View event payload without forwarding
mux webhooks events replay abc123-event-id
```

### `mux webhooks trigger <event-type>`

Send a synthetic webhook event to a local URL for testing. No API call is made — the payload is generated locally and signed with the per-environment signing secret. This is useful for testing your webhook handler without creating real resources.

**Options:**
- `--forward-to <url>` - Local URL to POST the example event to (required)
- `--json` - Output JSON instead of pretty format

```bash
# Send an example video.asset.ready event
mux webhooks trigger video.asset.ready --forward-to http://localhost:3000/api/webhooks/mux

# Send a live stream event
mux webhooks trigger video.live_stream.active --forward-to http://localhost:3000/api/webhooks/mux

# See the generated payload
mux webhooks trigger video.asset.created --forward-to http://localhost:3000/api/webhooks/mux --json
```

Run `mux webhooks trigger <invalid-type>` to see all supported event types.

## Commands

<details open>
<summary><h3>Assets</h3></summary>

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
<summary><h3>Live Streams</h3></summary>

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
<summary><h3>Robots</h3></summary>

Run AI-powered workflows on your video assets using [Mux Robots](https://docs.mux.com/guides/robots). Requires accepting the Robots terms of service in the [Mux Dashboard](https://dashboard.mux.com) and a token with `robots:read` and `robots:write` permissions.

#### Job Management

```bash
# List all jobs (with optional filters)
mux robots list [--workflow summarize] [--status completed] [--asset-id <id>]

# Get full details about a specific job
mux robots get <job-id> --workflow <type>

# Cancel a running job
mux robots cancel <job-id>
```

**List options:** `--workflow`, `--status`, `--asset-id`, `--limit`, `--page`, `--compact`

#### `mux robots summarize <asset-id>`

Generate a title, description, and tags for a video.

**Options:**
- `--tone <tone>` - `neutral`, `playful`, or `professional`
- `--language-code <code>` - BCP 47 code of the caption track to analyze
- `--output-language-code <code>` - BCP 47 code for the generated output
- `--title-length <n>` - Maximum title length in words
- `--description-length <n>` - Maximum description length in words
- `--tag-count <n>` - Maximum number of tags (default: 10)
- `--passthrough <string>` - Arbitrary metadata (max 255 chars)

```bash
mux robots summarize abc123 --tone playful
```

#### `mux robots moderate <asset-id>`

Analyze video content for policy violations.

**Options:**
- `--language-code <code>` - BCP 47 code for transcript analysis (audio-only assets)
- `--sampling-interval <seconds>` - Interval between sampled thumbnails (min 5)
- `--max-samples <n>` - Maximum number of thumbnails to sample
- `--threshold-sexual <n>` - Score threshold (0.0-1.0) for sexual content (default: 0.7)
- `--threshold-violence <n>` - Score threshold (0.0-1.0) for violent content (default: 0.8)
- `--passthrough <string>` - Arbitrary metadata (max 255 chars)

```bash
mux robots moderate abc123 --threshold-sexual 0.5 --threshold-violence 0.9
```

#### `mux robots generate-chapters <asset-id>`

Automatically generate chapters for a video.

**Options:**
- `--language-code <code>` - BCP 47 code of the caption track to analyze
- `--output-language-code <code>` - BCP 47 code for output chapter titles
- `--passthrough <string>` - Arbitrary metadata (max 255 chars)

```bash
mux robots generate-chapters abc123
```

#### `mux robots ask-questions <asset-id>`

Ask questions about a video and get answers.

**Options:**
- `--question <question>` - Question to ask (required, repeatable)
- `--language-code <code>` - BCP 47 code of the caption track to analyze
- `--passthrough <string>` - Arbitrary metadata (max 255 chars)

```bash
mux robots ask-questions abc123 --question "What is this video about?" --question "Are there children?"
```

#### `mux robots find-key-moments <asset-id>`

Find key moments and highlights in a video.

**Options:**
- `--max-moments <n>` - Maximum number of key moments to extract (default: 5)
- `--target-duration-min-ms <ms>` - Preferred minimum highlight duration in milliseconds (must be paired with max)
- `--target-duration-max-ms <ms>` - Preferred maximum highlight duration in milliseconds (must be paired with min)
- `--passthrough <string>` - Arbitrary metadata (max 255 chars)

```bash
mux robots find-key-moments abc123 --max-moments 3 --target-duration-min-ms 15000 --target-duration-max-ms 45000
```

#### `mux robots translate-captions <asset-id>`

Translate captions on a video to another language.

**Options:**
- `--track-id <id>` - Source caption track ID to translate (required)
- `--to-language-code <code>` - BCP 47 code for translated output (required)
- `--no-upload` - Do not upload the translated VTT to Mux
- `--passthrough <string>` - Arbitrary metadata (max 255 chars)

```bash
mux robots translate-captions abc123 --track-id track456 --to-language-code es
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

Sign in to Mux and save credentials. With no flags, opens your browser to select an organization and environment; the CLI then manages token refresh for you.

The four authentication methods are mutually exclusive; passing more than one is an error.

**Options:**
- `--oauth` - Sign in with a browser (the default when no shell credentials are set)
- `--interactive` - Enter a Mux API access token (Token ID and Secret) manually
- `-f, --env-file <path>` - Path to .env file containing `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`, and optionally `MUX_SIGNING_KEY` and `MUX_PRIVATE_KEY` (saved for `mux sign` when both are present)
- `--from-env` - Save the `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` already set in this shell
- `-n, --name <name>` - Name for this environment (default: derived from the organization and environment for browser sign-in, or `default` otherwise)
- `--print-url` - Print the authorization URL instead of opening a browser
- `--port <port>` - Local port to receive the login redirect on
- `--keep-current` - Save the login without making it the active environment

```bash
mux login                                         # browser sign-in
mux login --interactive                           # prompts for Token ID and Secret
mux login --env-file .env                         # from .env file
mux login --from-env                              # save this shell's credentials
mux login --name production --env-file .env.prod  # named environment
mux login --print-url                             # no browser available
```

`--oauth` and `--interactive` both need a real terminal: they fail immediately with instructions under `--json`, in agent mode, or when stdin is not a TTY (CI, piped input), rather than hanging. Use `--env-file`, `--from-env`, or the environment variables for automation.

**Signing in from a remote or SSH session:** the redirect goes to a loopback address on the machine running the CLI, which your browser cannot reach from elsewhere. Either forward the port (`ssh -L 51372:127.0.0.1:51372 …`, then `mux login --port 51372`) or use `mux login --interactive`.

#### `mux auth status`

Show every credential source the CLI can find, which one is active, and how to change it. Reads only local state — no network calls — and never prints token material.

**Options:**
- `--json` - Output JSON instead of pretty format

```bash
mux auth status
```

```
Active:       acme-inc-production
Sign-in:      browser sign-in
Environment:  Acme Inc / Production

Other environments (1):
  ci-token  access token  env_01H9

Switch with 'mux env switch <name>'.
```

When `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` are set they outrank every saved login, so no saved login is active and all of them are listed — including the one that would take over if you unset the variables:

```
Active:       MUX_TOKEN_ID / MUX_TOKEN_SECRET
Source:       environment variables
Note:         takes precedence over the saved login acme-inc-production
              unset both variables to use that instead

Saved logins (2):
  acme-inc-production  browser sign-in  Acme Inc / Production  (selected)
  ci-token             access token     env_01H9

Switch with 'mux env switch <name>'.
```

An environment reachable both ways reads `browser sign-in (also has access token)`, naming the one requests actually use. Access token expiry is deliberately not shown: it is refreshed automatically, so there is nothing to act on. `--json` carries `expires_at` for callers that want it.

`mux auth login` and `mux auth logout` are aliases of the top-level commands.

#### `mux logout [name]`

Remove credentials for a specific environment. When you remove the default environment, the CLI automatically selects another as the new default. For a browser sign-in, the refresh token is also revoked server-side; if that call fails, the local credentials are still removed and a warning is printed.

**Options:**
- `--all` - Remove stored credentials for every environment

```bash
mux logout default
mux logout staging
mux logout --all
```

#### `mux env list`

Display all configured environments, with the credential kind and the organization and environment they point at. An environment holding both credentials shows `oauth+token`, and a credential that has failed shows a warning line beneath it.

**Options:**
- `--json` - Output JSON instead of pretty format

```bash
mux env list
```

```
Configured environments:

* acme-inc-production (current)  oauth  Acme Inc / Production
  ci-token                       token  env_01H9

2 environments total
```

#### `mux env switch [name]`

Change the default environment. Works for both credential kinds. Run it without a name in an interactive terminal to pick from a list.

```bash
mux env switch staging
mux env switch            # interactive picker
```

</details>

## Configuration

Credentials are stored securely in `~/.config/mux/config.json` with restrictive file permissions (readable/writable only by the owner).

Each environment holds its identity and settings, plus one or both credential blocks. Entries written by earlier versions are flat (`tokenId` / `tokenSecret` at the top level) and are read as a `token` block automatically — there is no migration step and no config version to track.

```json
{
  "environments": {
    "acme-inc-production": {
      "environmentId": "env_…",
      "environmentName": "Production",
      "organizationId": "org_…",
      "organizationName": "Acme Inc",
      "oauth": {
        "accessToken": "…",
        "refreshToken": "…",
        "expiresAt": 1799999999,
        "scope": "video:read video:write"
      },
      "token": {
        "tokenId": "your_token_id",
        "tokenSecret": "your_token_secret"
      }
    },
    "staging": {
      "tokenId": "your_staging_token_id",
      "tokenSecret": "your_staging_token_secret"
    }
  },
  "defaultEnvironment": "acme-inc-production"
}
```

`acme-inc-production` above is reachable both ways; requests use the `oauth` block. `staging` is a flat entry from an older version, read as an access token login. A credential that has failed terminally gains a `lastError` field, which is what `mux auth status` reports.

### Upgrading from 2.x

Nothing to do beyond signing in again. Two things are worth knowing:

- **Run `mux login` after upgrading.** The first command that writes the config converts every entry to the layout above, including entries it wasn't asked about. Version 2.x looks for `tokenId` at the top level, so if you go back to it afterwards it will report that you are not logged in.
- **Your access token secret is not lost.** It is still in `~/.config/mux/config.json`, just nested under `token`. Mux only displays a token secret once, at creation, so don't mint a replacement — signing in again, or moving the two fields back up a level, restores it.

In CI, `mux login` now fails when `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` are set, because those variables already work without a login and take precedence over anything saved. Use `mux login --from-env` if you specifically want them written to the config.

Writes are atomic (written to a temporary file in the same directory, then renamed), so a config read during a token refresh never sees a partial file.

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
│   ├── robots/                       # Mux Robots AI workflows
│   ├── signing-keys/                 # Signing key management
│   ├── video-views/                  # Mux Data: video view analytics
│   ├── metrics/                      # Mux Data: metric analytics
│   ├── monitoring/                   # Mux Data: real-time monitoring
│   ├── incidents/                    # Mux Data: incident tracking
│   ├── annotations/                  # Mux Data: annotation management
│   ├── dimensions/                   # Mux Data: dimension queries
│   ├── errors/                       # Mux Data: error analytics
│   ├── exports/                      # Mux Data: export files
│   ├── webhooks/                     # Webhook listening & replay
│   │   ├── events/                  # Event storage & replay
│   │   └── listen.ts                # Real-time SSE listener
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
│   ├── webhook-signing.ts            # Webhook signature generation
│   ├── events-store.ts               # Local webhook event storage
│   ├── sse.ts                        # Server-Sent Events parser
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
