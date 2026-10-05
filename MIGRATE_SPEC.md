# `mux migrate` specification

Status: draft for review
Branch: `feat/migrate-command`
Companion: the "Migrate to Mux" prompt in the docs prompt library (`mux.com`, branch `docs/prompt-migrate-vimeo`), which drives this command and then updates the customer's application to Video.js v10.

## Goals

- Move a video library from another platform into Mux with one resumable command.
- Be safe to run unattended by a coding agent: nothing costs money without an explicit confirmation, every run can be resumed, and every failure says what to do next.
- Produce a mapping from source video IDs to Mux asset and playback IDs that an agent can use to update application code and data.
- Optionally enrich migrated assets with Mux Robots workflows (captions, chapters, summaries, thumbnails, moderation).

## Non-goals

- Downloading media to the local machine. Mux ingests every source by URL.
- Rewriting application code. That belongs to the prompt and the agent running it.
- Migrating live streams, players, analytics history, or viewer data.
- Sources whose terms or APIs do not allow export (YouTube, Loom, Panopto, VdoCipher).

## Providers

| Tier | Provider | ID | Fidelity |
|---|---|---|---|
| v1 | Vimeo | `vimeo` | Original (paid plans) |
| v1 | Cloudflare Stream | `cloudflare-stream` | Rendition only |
| v1 | Bunny Stream | `bunny` | Original when kept, otherwise rendition |
| v1 | Wistia | `wistia` | Original |
| v1 | S3-compatible bucket (S3, R2, GCS interop, MinIO) | `bucket` | Original |
| v1 | Manifest file (CSV or JSON) | `manifest` | As supplied |
| v1.1 | Brightcove, api.video, JW Player, Gumlet, Cloudinary, Kaltura | | Varies |

Provider-specific details live in [Provider notes](#provider-notes).

## Commands

All commands accept the global `--agent` flag and a per-command `--json` flag. In either mode, output is machine-readable (see [Output contract](#output-contract)).

```
mux migrate init <provider>        Write a starter recipe file
mux migrate plan [provider]        Inventory the source and estimate the migration. Free.
mux migrate run  [provider]        Create Mux assets. Requires --yes.
mux migrate status                 Summarize progress from the state file
mux migrate verify                 Check every migrated asset against its source
mux migrate export                 Write the source → Mux mapping
mux migrate retry                  Re-queue errored items
mux migrate rollback               Delete assets created by this migration (v1.1)
mux migrate scan <path>            Find source-platform references in a codebase (v1.1)
```

The provider argument may be omitted when a recipe file supplies it.

### Shared flags

| Flag | Default | Purpose |
|---|---|---|
| `--recipe <path>` | `./mux-migrate.json` if present | Declarative configuration (see [Recipe file](#recipe-file)) |
| `--state <path>` | `./.mux-migrate/state.db` | Resumable state |
| `--json` | off | Machine-readable output |

### `mux migrate plan`

Lists the full source library, resolves nothing that costs money or expires, and writes discovered items to the state file. Prints:

- Item counts by type and status (ready, processing, private, live archive, audio-only)
- Total duration and total size, where the provider reports them
- Fidelity breakdown: originals vs renditions
- Caption tracks found, by language
- Configured directives, their workflows, and the number of items each will be attached to
- Warnings, each with a code and a fix (for example `VIMEO_SCOPE_MISSING`)
- Nothing is billed. Pricing is linked, not computed.

`plan` is idempotent and can be re-run to pick up newly added source videos.

### `mux migrate run`

| Flag | Default | Purpose |
|---|---|---|
| `--yes` | off | Required. Without it the command prints the plan summary and exits with code 3. |
| `--limit <n>` | none | Process at most n items, for a pilot run |
| `--ids <a,b,c>` | none | Process only these source IDs |
| `--time-budget <duration>` | none | Stop cleanly after this long (for example `8m`), leaving the state consistent |
| `--concurrency <n>` | provider default | Parallel asset creations, capped by the provider rate limit |
| `--test` | off | Create Mux test assets (watermarked, 10 seconds, deleted after 24 hours) |
| `--no-wait` | off | Exit once every asset is created, without waiting on the event stream for `ready` |
| `--directive <id>` | from recipe | Attach a Robots directive to every asset created. Repeatable. |
| `--skip-robots` | off | Do not attach directives on this run |

Asset settings (`--playback-policy`, `--video-quality`, `--max-resolution-tier`, `--generated-subtitles <lang>`) override the recipe.

`run` always resumes. Items already `ready` or `skipped` are never touched again. Running the same command repeatedly is the expected way to finish a large library within agent tool-call timeouts. When `--time-budget` expires, the command exits with code 4 and prints the exact command to continue.

### `mux migrate status`

Counts by lifecycle state, the oldest in-flight items, and every errored item with its error code. Exit codes follow the precedence in [Output contract](#output-contract).

### `mux migrate verify`

For each `ready` item:

- The asset exists and its status is `ready`
- Duration is within one second of the source duration, when known
- The number of text tracks matches the source caption count, minus any marked `captions_pending`
- `https://stream.mux.com/{playback_id}.m3u8` responds (public playback IDs only; signed IDs are checked with a short-lived token when a signing key is configured)
- Each attached directive's run reached `completed` (`partial` and `errored` are reported with the bindings that failed)

Writes results to the state file and prints failures with fixes. Exit code 0 means every item passed.

### `mux migrate export`

| Flag | Default |
|---|---|
| `--format json\|csv` | `json` |
| `--output <path>` | stdout |
| `--include <states>` | `ready` |

See [Mapping file](#mapping-file).

### `mux migrate rollback` (v1.1)

Deletes Mux assets this migration created, identified by the state file and confirmed against each asset's `meta.external_id`. Requires `--yes`. Supports `--ids` and `--run <run-id>`. Never deletes an asset whose `meta.external_id` does not match the state file.

### `mux migrate scan <path>` (v1.1)

Searches a codebase for provider references: embed URLs, player SDK imports, hard-coded IDs in fixtures and seed data. Reports file, line, the reference, and the matching Mux playback ID from the state file. IDs that appear in code but were never migrated are flagged. The prompt uses this output as the work list for the application migration.

## Credentials

Credentials come from environment variables or flags, never from interactive prompts, so an agent can supply them. Flags take precedence over environment variables. Secrets are never written to the state file, the recipe, or any output.

| Provider | Environment variables | Notes |
|---|---|---|
| `vimeo` | `VIMEO_ACCESS_TOKEN` | Scopes `public private video_files` |
| `cloudflare-stream` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Stream Write is required to generate downloads |
| `bunny` | `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, optional `BUNNY_CDN_TOKEN_KEY` | Token key is needed only when CDN token authentication is on |
| `wistia` | `WISTIA_API_TOKEN` | Read-only token is sufficient |
| `bucket` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, optional `AWS_ENDPOINT_URL` | Endpoint override covers R2, GCS interop, and MinIO |
| `manifest` | none | |

Mux credentials use the existing CLI authentication (`mux login` or environment).

## Recipe file

An optional, declarative description of a migration. It is safe to commit (it holds no secrets) and lets an agent or a teammate re-run the same migration exactly. Generated by `mux migrate init <provider>`.

```json
{
  "$schema": "https://www.mux.com/schemas/migrate-recipe.v1.json",
  "provider": "vimeo",
  "source": {
    "folders": ["Marketing"],
    "include_live_archives": false,
    "include_private": true
  },
  "asset": {
    "playback_policy": ["public"],
    "video_quality": "basic",
    "max_resolution_tier": "1080p",
    "generated_subtitles": null
  },
  "captions": {
    "import": true,
    "host_bucket": null
  },
  "directives": ["drv_abc123"]
}
```

Command-line flags override recipe values for a single run. The state file records the recipe hash used for each item so `status` can report drift.

## Robots enrichment

A migration is the one moment every asset in a library passes through Mux, which makes it the cheapest point to fill gaps the source platform left: missing captions, chapters, summaries, or posters.

v1 relies on [Robots Directives](https://www.mux.com/docs/guides/robots-directives) as Mux ships them, and adds no orchestration of its own:

- The customer creates one or more directives in the Mux Dashboard (or with the API), choosing workflows, parameters, and caption dependencies there.
- The recipe's `directives` array, or `--directive <id>` (repeatable), lists their IDs.
- `run` passes them on asset creation as `directives: [{ "id": "<id>" }]`. Mux starts each attached directive once the asset is ready. Attaching is idempotent, so the CLI never starts runs or reconciles them.

Rules:

- Before creating any asset, `run` retrieves each directive with `client.robots.directives.retrieve(id)` and fails early with `DIRECTIVE_NOT_FOUND` or `ROBOTS_NOT_ENABLED`.
- `plan` lists each directive's name and workflows, and the number of items it will be attached to. Robots usage is billed per workflow run; `plan` links to pricing.
- Run status arrives on the event stream as `robots.directive_run.*` events (see [Status updates](#status-updates)) and is stored per item. Run outputs are not copied; the mapping export records the run ID and each binding's job ID, which an agent can look up with `mux robots get`.
- `run` reports runs that ended `partial` or `errored` as `DIRECTIVE_RUN_PARTIAL` and `DIRECTIVE_RUN_ERRORED` warnings without failing, because the asset migrated and no `migrate` command can re-run a directive in v1. `verify` reports them as failures, with the failed bindings.
- `--skip-robots` creates assets without attaching directives.

### Fast follow

Not in v1, pinned for the release after it:

- `mux robots directives create|list|get|delete` and `mux robots directives runs create|list|get`, so directives can be managed without the Dashboard.
- A recipe `robots` array that declares workflows inline, with per-item `when` conditions (for example, generate chapters only when the source has none). The CLI would create the directives itself, one per distinct workflow set.
- Built-in guidance that maps migration gaps to workflows:

| Problem | Workflow |
|---|---|
| Source has no captions, or captions could not be imported | `generate-premium-captions` |
| Captions exist in one language only | `translate-captions` |
| Custom posters cannot be imported into Mux | `find-best-thumbnails` |
| Source has no chapters | `generate-chapters` |
| Titles or descriptions are missing or poor | `summarize` |
| Legacy library has never been reviewed | `moderate` |

## Lifecycle

```
discovered → preparing → resolved → creating → processing → ready
                │            │          │           │
                └────────────┴──────────┴───────────┴──→ errored  (retryable)
discovered → skipped   (filtered out, not exportable, or unsupported type)
ready → enriching → ready   (attached directive runs, started by Mux)
```

- `preparing`: the provider needs asynchronous work before a URL exists (Cloudflare download generation, Brightcove master feeds).
- `resolved`: a source URL exists. URLs are resolved immediately before creation, never during `plan`, because Vimeo links expire after 24 hours, Brightcove after 6, and api.video private links after one use.
- `creating`: the asset create request is in flight. See [Duplicate prevention](#duplicate-prevention).
- `processing`: the asset exists and is not yet `ready`. See [Status updates](#status-updates).
- Every state transition is written before the next network call, so a crash at any point resumes without duplicates.

## Duplicate prevention

A duplicate asset costs the customer money and pollutes their library, so `run` treats asset creation as the one step that must never repeat. The Mux API has no idempotency key for asset creation and no server-side lookup by `external_id`, so duplicates are prevented on the client and detected from events.

1. Before the create request, the item moves to `creating` and the state file records `create_started_at`.
2. Every asset is created with `meta.external_id` set to `{provider}:{source_id}`. This is a field the migration owns. `passthrough` is left to the customer, because many applications already store their own data there.
3. The create request is never retried automatically. A timeout, a dropped connection, or a 5xx response leaves the item in `creating`, because the asset may exist even though no response arrived. The shared HTTP client retries 429 responses only for this call, since a 429 means the request was not processed.
4. When the response arrives, the asset ID is written and the item moves to `processing`.
5. Every `video.asset.created` event on the stream is matched by `meta.external_id`, counting only assets created after the item's `create_started_at` minus five minutes, so assets from earlier migrations of the same source are not matched:
   - An item in `creating` adopts the asset and moves to `processing`. This resolves step 3 without a second request.
   - An item that already has a different asset ID has a duplicate. The CLI keeps the asset it recorded first, does not delete the other, and reports `DUPLICATE_ASSET` with both IDs and the command to remove the extra one. `status` and `verify` list unresolved duplicates.
6. On the next run, an item still in `creating` had no response and no matching event, for example because the CLI was offline. The CLI lists assets newest first, stops once `created_at` is earlier than the oldest `create_started_at` minus five minutes, and matches `meta.external_id`. A match is adopted. Otherwise the item returns to `resolved` and is created again.
7. Items in `processing` are reconciled on reconnect with a `GET` per asset, which also catches events missed while the CLI was offline.

If a future source uploads local files through direct uploads instead of ingesting by URL, it follows the same rule: create one upload per item, store its upload ID before sending media, and on retry fetch that upload with `GET /video/v1/uploads/{upload_id}` instead of creating a new one.

## Status updates

`run` does not poll assets. It opens the webhook event stream (`GET /system/v1/webhook-events/stream`), the same server-sent events connection `mux webhooks listen` uses, so no public URL or webhook endpoint is needed. The connection opens before the first create request, so no event is missed in a running session.

| Event | Effect |
|---|---|
| `video.asset.ready` | Item moves to `ready`, or to `enriching` when directives are attached |
| `video.asset.errored` | Item moves to `errored` with the asset's error messages |
| `video.asset.track.ready`, `video.asset.track.errored` | Caption track state updates |
| `robots.directive_run.created` | Run ID recorded for the item |
| `robots.directive_run.completed`, `.partial`, `.errored` | Run status and each binding's job ID recorded; the item returns to `ready` once every attached run is terminal |

Events for assets that are not in the state file are ignored. On disconnect, the CLI reconnects with the same backoff and credential refresh as `webhooks listen`, then reconciles in-flight items, because the stream is not known to replay missed events: assets with a `GET`, and directive runs with `client.robots.directives.runs.list(directiveId)` matched by asset ID. `run` exits when no item is left in `processing` or `enriching` and no create request is in flight, when `--time-budget` expires, or immediately after the last create with `--no-wait`. An item whose create request failed without a response stays in `creating` and does not hold the run open; the next run resolves it (see [Duplicate prevention](#duplicate-prevention)), so the run exits 4.

## State file

SQLite via `bun:sqlite` at `./.mux-migrate/state.db`. SQLite gives atomic per-item updates for libraries of 100,000+ items without rewriting a JSON file on every change, and needs no added dependency. The directory also holds downloaded caption files awaiting a host (see [Captions](#captions)).

Agents and humans read state through `status`, `verify`, and `export`, not the database directly.

Tables: `migration` (one row: run IDs, provider, recipe hash, created time), `items` (source ID, state, source metadata JSON, resolved fidelity, asset ID, playback IDs, `create_started_at`, error code and message, attempts, timestamps), `tracks` (per caption: language, kind, state). Each item's directive runs (directive ID, run ID, status) are stored as JSON on the item row, indexed by asset ID for event lookups.

`.mux-migrate/` should be added to `.gitignore` by `init`.

## Mux asset mapping

| Mux field | Value |
|---|---|
| `inputs[0].url` | Resolved source URL |
| `inputs[n]` | Caption text tracks, by URL |
| `meta.external_id` | `{provider}:{source_id}` (128 code points max). Used for duplicate detection and rollback. |
| `meta.title` | Source title, truncated to 512 characters |
| `passthrough` | Not set, except from the manifest `passthrough` column. Left for the customer's own use. |
| `directives` | `[{ "id": "<id>" }]` for each configured directive, unless `--skip-robots` |
| Playback and quality settings | From the recipe or flags |

## Captions

Mux adds text tracks from a URL. Providers that return a caption URL (Vimeo, Cloudflare Stream, Bunny, api.video, JW Player, Brightcove) are passed through, resolved just in time like media URLs.

Providers that return caption text inline (Wistia) cannot be passed by URL. In v1:

1. If `captions.host_bucket` is set (an S3-compatible bucket the customer owns), the CLI uploads the file, passes a presigned URL to Mux, and deletes the object once the track is ready.
2. Otherwise the file is saved under `.mux-migrate/captions/`, the track is recorded as `captions_pending`, and `status` prints the command to attach it once hosting is available. A recipe can fall back to `generate-premium-captions` instead.

Third-party paste services (for example GitHub Gists) are deliberately not supported, because they publish customer content outside the customer's control.

Language codes are normalized to BCP 47 (for example Wistia `eng` becomes `en`).

Recommendation to the Mux API team: accept text track content by direct upload, which removes the hosting step for every provider.

## Mapping file

`mux migrate export --format json`:

```json
{
  "version": 1,
  "migration_id": "mig_01J...",
  "provider": "vimeo",
  "exported_at": "2026-10-05T18:00:00Z",
  "items": [
    {
      "source_id": "123456789",
      "source_url": "https://vimeo.com/123456789",
      "source_embed_patterns": ["player.vimeo.com/video/123456789", "vimeo.com/123456789"],
      "title": "Product tour",
      "description": "…",
      "tags": ["onboarding"],
      "folder": "Marketing",
      "duration_seconds": 184.2,
      "source_poster_url": "https://i.vimeocdn.com/…",
      "source_chapters": [{ "title": "Intro", "start_seconds": 0 }],
      "fidelity": "original",
      "asset_id": "abc123",
      "playback_ids": [{ "id": "xyz789", "policy": "public" }],
      "text_tracks": [{ "language": "en", "kind": "subtitles", "state": "ready" }],
      "directive_runs": [
        {
          "directive_id": "drv_abc123",
          "run_id": "drvrun_xyz789",
          "status": "completed",
          "bindings": [{ "reference_id": "chapters", "workflow": "generate-chapters", "job_id": "rjob_1" }]
        }
      ],
      "status": "ready",
      "verified": true
    }
  ]
}
```

CSV contains the scalar columns only: `source_id`, `source_url`, `title`, `fidelity`, `asset_id`, `playback_id`, `status`, `verified`.

`source_embed_patterns` exists so the application migration (and `scan`) can find every way the video is referenced without provider-specific knowledge.

## Output contract

Human mode prints progress and summaries. With `--json` or `--agent`:

- `plan`, `status`, `verify`, `export` print one JSON document to stdout.
- `run` prints newline-delimited JSON events to stdout, one per state transition, and a final `summary` event:

```json
{"type":"item","source_id":"123","state":"creating","asset_id":null}
{"type":"item","source_id":"123","state":"ready","asset_id":"abc","playback_id":"xyz"}
{"type":"warning","code":"CLOUDFLARE_RENDITION_ONLY","message":"…"}
{"type":"summary","ready":40,"errored":1,"remaining":59,"next_command":"mux migrate run --yes --time-budget 8m"}
```

Every error, in both modes, carries:

```json
{ "code": "VIMEO_SCOPE_MISSING", "message": "…", "hint": "Create a token with the video_files scope at https://developer.vimeo.com/apps", "next_command": "mux migrate plan vimeo" }
```

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Complete: every item is `ready` or `skipped`. Directive runs that ended `partial` or `errored` are warnings here and failures in `verify`. |
| 1 | The command failed (authentication, network, unexpected error), or only errored items remain |
| 2 | Invalid usage or configuration |
| 3 | Confirmation required (`--yes` missing) |
| 4 | Stopped with work remaining. Run `next_command` again. |

When several apply, the first match in this order wins: 2, 3, 1 (command failed), 4, 1 (only errored items remain), 0. Errored items alone never produce 4, so an agent that re-runs on 4 cannot loop on failures. `next_command` is always a command that makes progress: it repeats the run's `--limit` and `--time-budget`, and never includes `--no-wait`. With `--ids`, completion is judged on the listed items only. Errored items are listed in the output with `mux migrate retry` as the `next_command`.

Error codes are a documented, stable list. The prompt references them by name.

## Provider interface

```ts
interface SourceProvider<Credentials> {
  id: ProviderId;
  credentials: CredentialSpec<Credentials>;
  rateLimit: RateLimitSpec;
  defaultConcurrency: number;

  verify(creds: Credentials): Promise<VerifyResult>;
  list(creds: Credentials, cursor?: string): Promise<ListPage>;
  resolve(creds: Credentials, item: SourceItem): Promise<ResolveResult>;
}

interface ListPage {
  items: SourceItem[];
  next?: string;
}

interface SourceItem {
  sourceId: string;
  type: 'video' | 'audio' | 'live_archive';
  exportable: boolean;
  skipReason?: string;
  title?: string;
  description?: string;
  tags?: string[];
  folder?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  createdAt?: string;
  sourceUrl?: string;
  embedPatterns: string[];
  posterUrl?: string;
  chapters?: Array<{ title: string; startSeconds: number }>;
  captionCount: number;
  passthrough?: string;
  raw: unknown;
}

type ResolveResult =
  | {
      kind: 'resolved';
      url: string;
      fidelity: 'original' | 'rendition';
      expiresAt?: Date;
      captions: CaptionSource[];
    }
  | { kind: 'pending'; retryAfterMs: number }
  | { kind: 'unavailable'; code: string; message: string };

type CaptionSource =
  | { kind: 'url'; url: string; language: string; label?: string; closedCaptions: boolean }
  | { kind: 'text'; text: string; format: 'srt' | 'vtt'; language: string; label?: string; closedCaptions: boolean };

interface RateLimitSpec {
  requests: number;
  perMs: number;
  scope: 'account' | 'token';
}
```

All HTTP goes through one shared client that checks response status, honors `Retry-After` and provider rate-limit headers, retries 429 and 5xx with jittered exponential backoff, and maps failures to error codes. Providers do not implement retries themselves. Requests that are not safe to repeat, such as Mux asset creation, opt out of 5xx and timeout retries (see [Duplicate prevention](#duplicate-prevention)).

## Provider notes

### Vimeo

- Verify with `GET /oauth/verify` and require the `video_files` scope (`VIMEO_SCOPE_MISSING`). Accounts without file access return no `download` entries (`VIMEO_PLAN_NO_DOWNLOADS`).
- List `GET /me/videos?per_page=100&fields=…` and follow `paging.next`.
- Exportable when `upload.status` and `transcode.status` are `complete`. Live archives are included only when the recipe opts in. Stock videos are skipped.
- Prefer the `source` rendition, then the largest by `size`. Links expire after 24 hours.
- Captions from `GET /videos/{id}/texttracks`; links expire.
- Corrects three defects in the Truckload implementation: the inverted status filter, ignored rendition priority, and page-count arithmetic.

### Cloudflare Stream

- Cloudflare does not retain originals. Every item is `rendition` fidelity, and `plan` warns about it (`CLOUDFLARE_RENDITION_ONLY`).
- Downloads require Stream Write and are billed as delivered minutes by Cloudflare. `plan` states this.
- `resolve` creates the download and returns `pending` until `status` is `ready`.
- Signed-URL videos need a token with `downloadable: true`.
- Account-wide limit of 1,200 requests per five minutes. Exceeding it blocks the account for five minutes, so the limiter is conservative by default.
- Page by `created` date with `limit=1000`.

### Bunny Stream

- One library per run. Multiple libraries mean multiple migrations or multiple recipe entries (open question).
- Resolve via `GET /library/{id}/videos/{guid}/play`, which returns `originalUrl` and the fallback MP4.
- `original` fidelity only when `hasOriginal` is true. Otherwise use the highest available MP4 fallback, or mark unavailable (`BUNNY_NO_ORIGINAL_OR_MP4`).
- Sign URLs when CDN token authentication is enabled. Referrer or direct-access blocking returns 403 to Mux (`BUNNY_DIRECT_ACCESS_BLOCKED`), detected by a HEAD request during `verify`.
- Migrate status `4` (finished) only.

### Wistia

- `GET /medias?type=Video&per_page=100`, with the `X-Wistia-Api-Version` header pinned.
- Use the `OriginalFile` asset. Guard against an empty `assets` array (a crash in Truckload).
- Captions are returned as inline SRT text. See [Captions](#captions).

### Bucket

- List objects by prefix, filtered by extension and an optional glob. Presign each object just in time with a TTL longer than the expected ingest.
- Optional sidecar metadata: `video.mp4.json` next to `video.mp4` supplies title and passthrough fields, and `video.en.vtt` supplies captions.

### Manifest

- The manifest path comes from `--manifest <path>` or the recipe's `source.manifest`.
- CSV or JSON. JSON is preferred for generated manifests. In CSV, `tags` is semicolon-separated and `captions` is a quoted JSON column. Required column: `url`. Optional: `id`, `title`, `description`, `tags`, `captions` (JSON array of `{url, language}`), `poster_url`, `passthrough`.
- When `id` is missing, a stable hash of the URL is used, so re-running stays idempotent.
- The schema is published, so customers or agents can script exports from any unsupported platform into it.

## Testing

Tests are written first and reviewed before implementation, per the project guidelines.

- **Command tests:** flags, `--yes` gating, exit codes, JSON output shapes, and `next_command` hints, with providers and the Mux client stubbed.
- **Lifecycle tests:** crash and resume at every transition, idempotency (no duplicate assets), `--time-budget`, `--limit`, retry of errored items.
- **Provider tests:** recorded API responses for each provider covering pagination, private, processing, live archive, no original, expiring URLs, captions, and rate-limit responses. CI never calls real provider APIs.
- **Duplicate prevention tests:** a create that times out is never retried and is adopted from its `video.asset.created` event; a crash before the state write is adopted by the time-window scan, which stops at the right page; a second asset with the same `external_id` is reported as `DUPLICATE_ASSET` and not deleted; assets from an earlier migration of the same source are not matched.
- **Event stream tests:** a recorded stream drives items through `ready`, `errored`, and `enriching`; disconnects trigger reconnection and reconciliation; events for unknown assets are ignored.
- **Robots tests:** directives are attached on create and omitted with `--skip-robots`; `DIRECTIVE_NOT_FOUND` and `ROBOTS_NOT_ENABLED` fail before any asset is created; run events update `directive_runs`; `verify` reports `partial` and `errored` runs.
- **Team QA:** a seeded test account per provider containing the edge cases above, a QA checklist per provider, and agent runs of the companion prompt against sample applications.

## Delivery order

1. Command shell, state file, lifecycle engine, output contract, `manifest` provider (exercises everything without third-party APIs)
2. `vimeo`
3. `plan` and `verify` complete, directive attachment
4. `cloudflare-stream`, `bunny`, `wistia`, `bucket`
5. Fast follow: `mux robots directives` commands and inline recipe workflows (see [Fast follow](#fast-follow))
6. v1.1: `rollback`, `scan`, the next provider tier

## Open questions

1. Does the webhook event stream support `Last-Event-ID` to replay events missed during a disconnect? If not, reconciliation on reconnect stays as specified.
2. What are the Mux ingest and API rate limits per account? These set the `--concurrency` default and the shared limiter for Mux calls.
3. Directives are `/robots/v0`. Is the API stable enough to depend on in v1, or should attachment wait for the fast follow too?
4. End-to-end testing: is a paid Vimeo account available, or do provider tests rely on recorded responses only?
5. Bunny: one library per migration, or allow several in one recipe?
6. Should `plan` estimate Mux cost from duration and the published price list, or only link to pricing?
7. Is `.mux-migrate/` in the working directory the right default, or should state live under the CLI config directory keyed by migration ID?
8. Name for the recipe concept: "recipe", "migration file", or something else.
