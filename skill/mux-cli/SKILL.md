---
name: mux-cli
description: Use when running or scripting the `mux` CLI — managing Mux video assets, live streams, direct uploads, playback IDs, signed URLs, playback restrictions, DRM, webhooks, Mux Data analytics queries, or Mux Robots AI jobs (summarize, moderate, chapters, key moments, caption translation) from the command line. Triggers on `mux <command>`, "Mux CLI", or "Mux Robots".
---

# Mux CLI

The `mux` CLI is the fastest way to act on a Mux account — prefer it over hand-writing REST calls when it is installed. Check with `mux --version`; if missing, install via `brew install muxinc/tap/mux`, `npm install -g @mux/cli` (or `npx @mux/cli`), or https://github.com/muxinc/cli.

**Always pass `--agent`** on every command. It enables agent mode: JSON output (parseable) and an agent-identifying User-Agent.

Run `mux <command> --help` for exact flags — never guess flag names. For full option tables and examples beyond this skill, fetch the official CLI docs page: https://www.mux.com/docs/integrations/mux-cli.md. If a command here is missing from `mux --help`, suggest upgrading the CLI or fall back to the REST API using current docs (see the `mux-docs` skill).

## Common options

Available on most commands:

| Option | Description |
| --- | --- |
| `--json` | Raw JSON output (implied by `--agent`) |
| `--compact` | One-line-per-item output on `list` commands, grep-friendly |
| `--limit <n>` / `--page <n>` | Pagination on `list` commands (default 25 / page 1) |
| `-f, --force` | Skip confirmation prompts on destructive actions |
| `--wait` | On `create` commands, poll until the resource is ready before returning |

## Auth and environments

- `mux login` — interactive auth (the user runs this themselves). `mux login --env-file .env` reads `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` from a file.
- Non-interactive: set `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` env vars. Never print or commit these values.
- Multiple accounts: `mux login --name production`, `mux login --name staging --env-file .env.staging`. The first environment added becomes the default.
- `mux whoami --agent` — confirm identity and environment before mutating anything.
- `mux env list --agent` / `mux env switch <name>` — inspect or change the active environment. Assets, streams, and keys are environment-scoped; a "missing" asset is usually the wrong environment.
- `mux logout <name>` — remove stored credentials for an environment.

Credentials are stored in `~/.config/mux/config.json` with owner-only permissions.

## Assets

```bash
mux assets create --url https://example.com/video.mp4 --playback-policy public --agent
mux assets create --upload ./videos/*.mp4 --playback-policy public --agent   # local files, glob OK
mux assets create --file asset-config.json --agent   # JSON config: overlays, subtitles, multi-input
mux assets create --url … --wait --agent              # block until ready (scripts only; prefer webhooks in apps)

mux assets list|get|update|delete --agent
mux assets update <asset-id> --title "My Video" --passthrough "my-id" --agent
mux assets input-info <asset-id> --agent
```

Useful `create` flags: `--test` (watermarked test asset, auto-deleted after 24h — use for experiments), `--static-renditions 1080p` (repeatable; also `highest`, `audio-only`), `--video-quality basic|plus|premium`, `--normalize-audio`, `--passthrough <string>`.

`mux assets manage` opens an interactive TUI — for humans; agents should use the non-interactive commands.

Sub-resources:

```bash
mux assets playback-ids list|create|delete --agent          # --policy public|signed on create
mux assets static-renditions list|create|delete --agent     # --resolution 1080p … --wait
mux assets tracks create <asset-id> --url …/subs.vtt --type text --language-code en --text-type subtitles --agent
mux assets tracks generate-subtitles <asset-id> <track-id> --language-code en --agent   # ASR subtitles
mux assets tracks delete <asset-id> <track-id> --agent
```

## Live streams

```bash
mux live create --playback-policy public --latency-mode low --reconnect-window 60 --agent
mux live list|get|update|delete --agent
mux live complete|enable|disable <stream-id> --agent
mux live reset-stream-key <stream-id> --agent   # rotate a leaked key
```

Broadcast to **RTMP URL** `rtmp://global-live.mux.com/app` with the returned stream key. Create flags: `--latency-mode low|reduced|standard`, `--reconnect-window <seconds>`, `--new-asset-settings none|<json>`, `--test`.

Sub-resources:

```bash
mux live simulcast-targets create <stream-id> --url rtmp://live.twitch.tv/app --stream-key … --agent
mux live update-embedded-subtitles <stream-id> --language-channel cc1 --language-code en --agent   # CEA-608
mux live update-generated-subtitles <stream-id> --language-code en --agent                          # ASR; --clear to remove
mux live update-new-asset-static-renditions <stream-id> --resolution 1080p --resolution 720p --agent
mux live playback-ids list|create|delete --agent
```

## Direct uploads

```bash
mux uploads create --cors-origin "https://example.com" --playback-policy public --agent
mux uploads list|get|cancel --agent
```

`--cors-origin` is required. Other flags: `--timeout <seconds>` (default 3600), `--test`.

## Secure playback

```bash
mux signing-keys create --agent   # private key returned ONCE; CLI stores it in the current environment
mux signing-keys list|get|delete --agent

mux sign <playback-id> --agent                                     # signed playback URL + JWT
mux sign <playback-id> --expiration 24h --agent                    # default 7d; also 30m etc.
mux sign <playback-id> --type thumbnail --param time=14 --param width=100 --agent
mux sign <playback-id> --type gif --agent                          # types: video|thumbnail|gif|storyboard
mux sign <playback-id> --token-only --agent                        # JWT only, no URL
mux sign <playback-id> --params-json '{"custom":{"session_id":"x"}}' --agent
```

Thumbnail `--param` keys: `time`, `width`, `height`, `rotate`, `fit_mode`, `flip_v`, `flip_h`.

```bash
mux playback-ids <playback-id> --agent            # which asset/stream owns this playback ID
mux playback-ids <playback-id> --expand --agent   # fetch the full owning object
mux playback-restrictions create --allowed-domains "example.com" --allowed-domains "*.example.com" --agent
mux playback-restrictions list|get|delete|update-referrer|update-user-agent --agent
mux drm-configurations list|get --agent           # provisioned by Mux, read-only
```

## Webhooks (local development — no tunnel needed)

```bash
mux webhooks listen --forward-to http://localhost:3000/api/webhooks --agent   # stream real events to local
mux webhooks trigger video.asset.ready --forward-to http://localhost:3000/api/webhooks --agent   # synthetic event, no API call
mux webhooks events list --agent                  # last 100 captured events
mux webhooks events replay <event-id> --forward-to … --agent   # or --all
```

- `listen --forward-to` prints a **webhook signing secret** and signs each request (`mux-signature` header). Set it as `MUX_WEBHOOK_SECRET` in the app so signature verification works locally; it persists per environment.
- `mux webhooks trigger <invalid-type>` lists all supported event types.
- CLI webhooks are for local dev only — no delivery guarantees. Production needs a dashboard-configured endpoint.

## Mux Data (analytics)

```bash
mux video-views list --filters "country:US" --timeframe "24:hours" --agent
mux video-views list --viewer-id <id> --agent && mux video-views get <view-id> --agent

mux metrics list --agent
mux metrics breakdown <metric-id> --group-by country --measurement median --agent
mux metrics overall <metric-id> --measurement avg --agent
mux metrics timeseries <metric-id> --group-by hour --agent
mux metrics insights <metric-id> --measurement 95th --agent

mux monitoring dimensions|metrics|breakdown|breakdown-timeseries|histogram-timeseries|timeseries --agent
mux incidents list --status open --severity alert --agent
mux incidents get|related <incident-id> --agent
mux annotations create --date 1700000000 --note "Deployed v2.1.0" --agent
mux dimensions list --agent && mux dimensions values <dimension-id> --timeframe "24:hours" --agent
mux errors list --agent
mux exports list --agent
mux delivery-usage list --asset-id <id> --agent
```

Metric commands share `--measurement <95th|median|avg|count|sum>`, `--filters`, `--metric-filters`, `--timeframe`.

## Transcription vocabularies

```bash
mux transcription-vocabularies create --phrase "Mux" --phrase "HLS" --name "Streaming Terms" --agent
mux transcription-vocabularies list|get|update|delete --agent
```

## Agent skills

Newer CLI versions provide `mux skills path --agent`, which writes the CLI's embedded agent skills to disk and prints their paths; `mux skills install`, which installs them into an agent skills directory (default `~/.claude/skills`, auto-loaded by Claude Code — suggest it to users who want the skills available without per-project setup); and `mux skills update`, which refreshes all local copies to match the installed CLI and reports when a newer CLI release is available. These are the skill instruction files only — the CLI ships no documentation content; docs are always fetched live from mux.com. Check `mux skills --help`; if absent, use the `mux-docs` skill's live-fetch workflow.

## Mux Robots (AI jobs)

Robots run AI workflows on video assets: point a robot at an **asset ID**, it runs as an asynchronous job, collect the result.

```bash
mux robots summarize <asset-id> --agent          # title, description, tags
mux robots generate-chapters <asset-id> --agent  # chapter markers
mux robots moderate <asset-id> --agent           # content moderation signals
mux robots ask-questions <asset-id> --agent      # answer questions about the video
mux robots find-key-moments <asset-id> --agent   # notable timestamps (pairs with mux-clipping)
mux robots translate-captions <asset-id> --agent # translate captions

mux robots list --agent                          # all jobs
mux robots get <job-id> --agent                  # status + results
mux robots cancel <job-id> --agent
```

Each robot has its own flags (e.g. `summarize` takes `--description-length`, `--tag-count`) — check `mux robots <robot> --help`.

The robot catalog grows over time (find-scenes, best thumbnails, premium captions, audio translation, engagement insights are documented). If a robot exists in the docs but not in the installed CLI, use the REST API (`/robots/v0/jobs/...`) per the docs, or suggest upgrading the CLI.

Robots-specific pitfalls:

- **The asset must be ready** (`video.asset.ready`) before starting a job.
- **Jobs are asynchronous.** Store the job ID and check status, or handle the completion webhook — don't block synchronously in an app.
- **Robots directives** steer behavior (tone, format, constraints) — fetch the directives doc before hand-rolling prompt-like options.
- Results may need human review before publishing (especially `moderate` and generated metadata) — surface as suggestions, not silent writes.

## Conventions and pitfalls

- **Deletes are permanent** (assets, live streams, signing keys). Confirm with the user before any delete; `--force` skips the CLI's own prompt, so use it only after the user has confirmed.
- **Playback ID ≠ asset ID.** Playback and image URLs use playback IDs; management commands use asset/stream IDs. `mux playback-ids <id>` resolves one to the other.
- **Environment scoping** is the first thing to check when something "doesn't exist" — run `mux env list --agent`.
- Don't poll asset status in scripts; use `mux webhooks listen` or `--wait` on create commands.
- Use `--test` assets/streams for experiments — they're free, watermarked, and auto-deleted after 24h.

## Docs

| Topic | URL |
| --- | --- |
| CLI guide (all commands, full flag tables) | https://www.mux.com/docs/integrations/mux-cli.md |
| CLI repo / install | https://github.com/muxinc/cli |
| Robots overview | https://www.mux.com/docs/guides/robots.md |
| Robots directives | https://www.mux.com/docs/guides/robots-directives.md |
| Robot task guides | `https://www.mux.com/docs/guides/robots-<task>.md` (summarize, moderate, generate-chapters, ask-questions, find-key-moments, find-scenes, find-best-thumbnails, translate-captions, translate-audio, generate-premium-captions, edit-captions, generate-engagement-insights) |

For any other Mux docs page, use the `mux-docs` skill. If a URL 404s, search https://www.mux.com/llms.txt for the current location.
