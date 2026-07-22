---
name: mux-cli
description: Use when running or scripting the `mux` CLI — managing Mux video assets, live streams, direct uploads, playback IDs, signed URLs, playback restrictions, DRM, webhooks, Mux Data analytics queries, or Mux Robots AI jobs (summarize, moderate, chapters, key moments, caption translation) from the command line. Triggers on `mux <command>`, "Mux CLI", or "Mux Robots".
---

# Mux CLI

The `mux` CLI is the fastest way to act on a Mux account — prefer it over hand-writing REST calls when it is installed. Check with `mux --version`; if missing, install via `brew install muxinc/tap/mux`, `npm install -g @mux/cli`, or https://github.com/muxinc/cli.

**Always pass `--agent`** on every command. It enables agent mode: JSON output (parseable) and an agent-identifying User-Agent.

Run `mux <command> --help` for exact flags — never guess flag names. The installed version may lag the docs (e.g. `mux robots` ships in versions newer than 1.0.0); if a command in this skill is missing from `mux --help`, suggest upgrading the CLI or fall back to the REST API using current docs (see the `mux-docs` skill).

## Auth and environments

- `mux login` — interactive auth (the user runs this themselves).
- Non-interactive: set `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`. Never print or commit these values.
- `mux whoami --agent` — confirm identity and environment before mutating anything.
- `mux env list --agent` / `mux env switch <name>` — inspect or change the active environment. Assets, streams, and keys are environment-scoped; a "missing" asset is usually the wrong environment.
- `mux logout <name>` — remove stored credentials for an environment.

## Command groups

### Video

| Task | Command |
| --- | --- |
| Create asset (from URL, local file, or JSON) | `mux assets create --agent` |
| List / inspect / update / delete assets | `mux assets list\|get\|update\|delete --agent` |
| Input file details and tracks | `mux assets input-info <asset-id> --agent` |
| Playback IDs on an asset | `mux assets playback-ids list\|create\|delete --agent` |
| Downloadable MP4s (static renditions) | `mux assets static-renditions list\|create\|delete --agent` |
| Subtitle/audio tracks, ASR subtitles | `mux assets tracks create\|delete\|generate-subtitles --agent` |
| Direct uploads for client-side uploading | `mux uploads create\|list\|get\|cancel --agent` |
| Look up what a playback ID points to | `mux playback-ids <playback-id> --agent` |
| Custom ASR vocabularies | `mux transcription-vocabularies … --agent` |

### Live streaming

| Task | Command |
| --- | --- |
| Create / list / inspect / update / delete streams | `mux live create\|list\|get\|update\|delete --agent` |
| Enable, disable, complete a stream | `mux live enable\|disable\|complete <stream-id> --agent` |
| Rotate a leaked stream key | `mux live reset-stream-key <stream-id> --agent` |
| Restream to other platforms | `mux live simulcast-targets create\|get\|delete --agent` |
| Live captions (embedded or ASR) | `mux live update-embedded-subtitles\|update-generated-subtitles --agent` |
| Playback IDs on a stream | `mux live playback-ids list\|create\|delete --agent` |

### Secure playback

| Task | Command |
| --- | --- |
| Signing keys for signed playback policies | `mux signing-keys create\|list\|get\|delete --agent` |
| Mint a signed playback/thumbnail/GIF/storyboard URL | `mux sign <playback-id> --agent` |
| Referrer / user-agent playback restrictions | `mux playback-restrictions … --agent` |
| DRM configurations | `mux drm-configurations list\|get --agent` |

### Webhooks (no tunnel needed for local dev)

| Task | Command |
| --- | --- |
| Stream events to a local endpoint | `mux webhooks listen --forward-to http://localhost:3000/api/webhooks --agent` |
| Send a synthetic test event | `mux webhooks trigger video.asset.ready --agent` |
| Browse / replay stored events | `mux webhooks events list\|replay --agent` |

### Mux Data (analytics)

| Task | Command |
| --- | --- |
| Individual playback sessions | `mux video-views list\|get --agent` |
| Aggregate metrics: breakdown, timeseries, insights | `mux metrics list\|breakdown\|overall\|timeseries\|insights --agent` |
| Real-time monitoring | `mux monitoring metrics\|breakdown\|timeseries … --agent` |
| Auto-detected quality incidents | `mux incidents list\|get\|related --agent` |
| Deploy/release markers on charts | `mux annotations … --agent` |
| Filterable attributes and their values | `mux dimensions list\|values --agent` |
| Playback errors | `mux errors list --agent` |
| Raw view-data CSV exports | `mux exports list --agent` |
| Delivery/billing usage | `mux delivery-usage list --agent` |

### Agent docs

Newer CLI versions provide `mux docs path --agent`, which writes the CLI's embedded agent skills to disk and prints their paths. These are the skill instruction files only — the CLI ships no documentation content; docs are always fetched live from mux.com. Check `mux docs --help`; if absent, use the `mux-docs` skill's live-fetch workflow.

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

- **Deletes are permanent** (assets, live streams, signing keys). Confirm with the user before any delete.
- **Playback ID ≠ asset ID.** Playback and image URLs use playback IDs; management commands use asset/stream IDs.
- **Environment scoping** is the first thing to check when something "doesn't exist" — run `mux env list --agent`.
- Don't poll asset status in scripts; use `mux webhooks listen` or the `--wait` flag where a command supports it.

## Docs

| Topic | URL |
| --- | --- |
| CLI repo / install | https://github.com/muxinc/cli |
| Robots overview | https://www.mux.com/docs/guides/robots.md |
| Robots directives | https://www.mux.com/docs/guides/robots-directives.md |
| Robot task guides | `https://www.mux.com/docs/guides/robots-<task>.md` (summarize, moderate, generate-chapters, ask-questions, find-key-moments, find-scenes, find-best-thumbnails, translate-captions, translate-audio, generate-premium-captions, edit-captions, generate-engagement-insights) |

For any other Mux docs page, use the `mux-docs` skill. If a URL 404s, search https://www.mux.com/llms.txt for the current location.
