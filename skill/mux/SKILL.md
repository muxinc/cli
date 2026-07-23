---
name: mux
description: Use when working with Mux — video upload and encoding, live streaming, playback (stream.mux.com URLs, playback IDs, signed URLs, DRM), webhooks, thumbnails, Mux Player, Mux Data monitoring and analytics, or the mux CLI. Also use when you see MUX_TOKEN_ID / MUX_TOKEN_SECRET environment variables, @mux packages, or the Mux Node/Python/Go SDKs in a project.
---

# Building with Mux

Mux is a video API: upload or ingest video, get back an asset with playback IDs, and stream it via `stream.mux.com`. Mux Data monitors playback quality. The `mux` CLI is the primary action layer — prefer it over hand-writing REST calls when it is installed.

## CLI

Check availability with `mux --version`. If it is not installed, direct the user to https://github.com/muxinc/cli, or fall back to the Mux SDK / REST API using current docs (see Docs routing below).

**Always pass `--agent`** on every command. It enables agent mode and forces JSON output so results are parseable.

### Auth and environments

- `mux login` — interactive auth (user runs this themselves).
- Non-interactive: set `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` (API access token pair, scoped to a Mux environment). Never print or commit these values.
- `mux whoami --agent` — confirm identity and current environment before mutating anything.
- `mux env --agent` — inspect/switch the active Mux environment. Assets, live streams, and tokens are all environment-scoped; a "missing" asset is often just the wrong environment.

### Task-to-command map

| Task | Command |
| --- | --- |
| Upload a local file / create direct upload | `mux uploads create --agent` |
| List / inspect / delete assets | `mux assets list\|get\|delete --agent` |
| Create or manage live streams and stream keys | `mux live --agent` |
| Add or manage playback IDs | `mux playback-ids --agent` |
| Signed playback: manage keys, mint tokens | `mux signing-keys --agent`, `mux sign --agent` |
| Playback restrictions (referrer/user-agent) | `mux playback-restrictions --agent` |
| DRM configuration | `mux drm-configurations --agent` |
| Webhooks for local dev | `mux webhooks listen --agent`, `mux webhooks trigger --agent` |
| Browse/replay received webhook events | `mux webhooks events list\|browse\|replay --agent` |
| Mux Data: views, metrics, real-time, incidents | `mux video-views`, `mux metrics`, `mux monitoring`, `mux incidents` (all `--agent`) |
| Data exports / annotations / dimensions / errors | `mux exports`, `mux annotations`, `mux dimensions`, `mux errors` (all `--agent`) |
| Delivery/billing usage | `mux delivery-usage --agent` |

This is the high-traffic subset. For the complete command reference — every subcommand plus Mux Robots AI jobs (`mux robots`) — see the `mux-cli` skill. For finding current Mux documentation, see the Docs routing section below and the `mux-docs` skill.

Run `mux <command> --help` for flags; do not guess flag names.

### Webhooks for local development

No tunnel (ngrok etc.) is needed:

1. `mux webhooks listen --forward-to http://localhost:3000/api/webhooks --agent` — streams your environment's webhook events to a local endpoint.
2. `mux webhooks trigger video.asset.ready --agent` — send a test event without uploading real video.

## Docs routing

Mux publishes LLM-ready markdown docs. Fetch the specific page for the task instead of answering API questions from memory — API shapes change. High-traffic routes:

| Task | URL |
| --- | --- |
| Mux CLI guide (all commands and flags) | https://www.mux.com/docs/integrations/mux-cli.md |
| Upload files (direct uploads) | https://www.mux.com/docs/guides/upload-files-directly.md |
| Mux Uploader component | https://www.mux.com/docs/guides/mux-uploader.md |
| Stream/playback fundamentals | https://www.mux.com/docs/core/stream-video-files.md |
| Start live streaming | https://www.mux.com/docs/guides/start-live-streaming.md |
| Signed URLs / secure playback | https://www.mux.com/docs/guides/secure-video-playback.md |
| DRM | https://www.mux.com/docs/guides/protect-videos-with-drm.md |
| Mux Player (web) | https://www.mux.com/docs/guides/mux-player-web.md |
| Thumbnails / images from video | https://www.mux.com/docs/guides/get-images-from-a-video.md |
| Listen for webhooks | https://www.mux.com/docs/core/listen-for-webhooks.md |
| Verify webhook signatures | https://www.mux.com/docs/core/verify-webhook-signatures.md |
| Mux Data metrics | https://www.mux.com/docs/guides/monitoring-metrics.md |

For anything not listed, see [references/doc-index.md](references/doc-index.md) for collection indexes, or fetch https://www.mux.com/llms.txt (full per-page index). If a URL 404s (docs occasionally reorganize), fetch `llms.txt` and search it for the topic to find the page's new location — do not give up after one 404.

## Conventions and pitfalls

- **Do not poll asset status.** Listen for the `video.asset.ready` webhook instead of polling `GET /video/v1/assets/{id}` in a loop.
- **Always verify webhook signatures** (the `Mux-Signature` header) before trusting a payload.
- **Playback ID ≠ asset ID.** Playback URLs (`https://stream.mux.com/{PLAYBACK_ID}.m3u8`) and image URLs use the playback ID. API management calls use the asset ID. Passing an asset ID to `stream.mux.com` fails.
- **`signed` vs `public` playback policy** is set per playback ID at creation. Signed playback requires minting a JWT with a signing key for every playback, thumbnail, and storyboard URL. Do not create a signed playback ID unless the app is prepared to sign URLs.
- **Deletes are permanent.** Deleting an asset or live stream cannot be undone. Confirm with the user before any delete.
- **Environment scoping.** Tokens, assets, and webhooks belong to one Mux environment. Mismatched environment is the first thing to check when something "doesn't exist."

## Offline degradation

If docs URLs are unreachable, fall back to `mux <command> --help` output for CLI usage and say explicitly that you are working offline from CLI help only. Never guess API request/response shapes from memory — mark them as unverified and point the user to docs.mux.com.
