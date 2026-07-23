---
name: mux-docs
description: Use for any question about Mux APIs, SDKs, the mux CLI, webhooks, assets, uploads, playback, live streaming, Mux Data, or Mux Robots. Finds the current Mux documentation — Mux publishes every docs page as LLM-ready markdown indexed at mux.com/llms.txt — so answers come from today's published docs instead of web search or model memory.
---

# Mux docs discovery

Mux publishes its entire documentation as agent-ready markdown, auto-generated from the same source as the real docs site. For any Mux question, fetch the relevant page and answer from it — never answer Mux API questions from memory, because API shapes and guidance change.

## Workflow

1. **Route.** Pick the most specific starting point:
   - A known page URL (see collection indexes below to find one).
   - A collection index for the topic area (small, fast to scan).
   - An API reference bundle or spec (below) for exact request/response shapes.
   - The Mux Robots guides (below) for AI video workflows — summaries, moderation, captions, chapters, and more.
   - https://www.mux.com/llms.txt — the master index of every docs page — when you don't know where the topic lives.
2. **Fetch** the page's markdown. Every docs page has a markdown version: append `.md` to its URL (e.g. `https://www.mux.com/docs/guides/start-live-streaming.md`).
3. **Answer from the fetched content** and cite the page URL.

## Collection indexes

| Collection | URL |
| --- | --- |
| Core concepts | https://www.mux.com/docs/core.txt |
| Video: upload, encode, manage assets | https://www.mux.com/docs/guides/video.txt |
| Uploader: handle user uploads | https://www.mux.com/docs/guides/uploader.txt |
| Player: embed video playback | https://www.mux.com/docs/guides/player.txt |
| Data: playback quality and analytics | https://www.mux.com/docs/guides/data.txt |
| Data integrations: third-party player monitoring | https://www.mux.com/docs/guides/data-integrations.txt |
| Framework integrations and SDKs | https://www.mux.com/docs/integrations.txt |
| Example implementations | https://www.mux.com/docs/examples.txt |
| Pricing and billing | https://www.mux.com/docs/pricing.txt |

`https://www.mux.com/llms-full.txt` is the entire documentation in one file — very large; prefer per-page fetches.

## Mux Robots (AI video workflows)

Robots — Mux's AI-powered video workflows — don't have their own collection index; their guides are part of the video collection and the master llms.txt index. Start here:

| Resource | URL |
| --- | --- |
| Robots overview | https://www.mux.com/docs/guides/robots.md |
| Robots directives reference | https://www.mux.com/docs/guides/robots-directives.md |

Task-specific guides follow the pattern `https://www.mux.com/docs/guides/robots-<task>.md`, where `<task>` is one of: `summarize`, `moderate`, `generate-chapters`, `ask-questions`, `find-key-moments`, `find-scenes`, `find-best-thumbnails`, `translate-captions`, `translate-audio`, `generate-premium-captions`, `edit-captions`, `generate-engagement-insights`.

## API references and specs

For exact endpoint, parameter, and webhook shapes, prefer these over prose guides:

| Resource | URL |
| --- | --- |
| Video API reference | https://www.mux.com/docs/api-reference/video.txt |
| Data API reference | https://www.mux.com/docs/api-reference/data.txt |
| System API reference | https://www.mux.com/docs/api-reference/system.txt |
| Full API spec (OpenAPI JSON) | https://www.mux.com/api-spec.json |
| Webhook spec (JSON) | https://www.mux.com/webhook-spec.json |
| Mux Player web component API | https://raw.githubusercontent.com/muxinc/elements/refs/heads/main/packages/mux-player/REFERENCE.md |
| Mux Player React component API | https://raw.githubusercontent.com/muxinc/elements/refs/heads/main/packages/mux-player-react/REFERENCE.md |

All of these resources are also discoverable from the docs site itself: every docs page links to "Docs for LLMs" (https://www.mux.com/docs/core/llms-txt), the canonical page describing Mux's llms.txt files and machine-readable bundles. If this skill's URL lists ever drift from reality, that page is the source of truth.

## Self-healing

If a docs URL 404s, the docs have likely been reorganized. Do not give up after one 404: fetch https://www.mux.com/llms.txt, search it for the topic, and use the current URL.

## Staying in sync

- This skill is distributed from the `muxinc/skills` repository and ships embedded in the `mux` CLI. Updating the CLI (`brew upgrade mux` / `npm update -g @mux/cli`) updates the embedded skills; `mux docs path --agent` rewrites the on-disk copy to match the installed version. You can also pull the latest directly from https://github.com/muxinc/skills.
- If the `mux` CLI is installed, `mux docs path --json` prints the local paths to its embedded agent skill and bundled docs — useful offline. Check `mux docs --help` for what the installed version offers; when the network is available, prefer the live fetch workflow above so answers reflect today's published docs.

## Guardrails

- Cite the docs page URL you answered from.
- If the network is unavailable, say you could not verify against current docs — never guess API request/response shapes from memory.
