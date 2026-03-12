---
name: mux-cli
description: Use this skill when working with the Mux CLI or bundled Mux documentation, especially when the CLI may be installed through npm, Homebrew, or the shell installer and the agent needs a reliable way to find the embedded docs.
---

# Mux CLI

Use this skill when the user wants to work with Mux through the `mux` CLI or when the task depends on the bundled Mux docs that ship with the CLI.

## Locate the embedded docs

Run `mux docs path --json` to get the installed paths for:

- `skill_path`
- `docs_path`
- `agents_path`

If the CLI command is not available and you are reading this file directly, the bundled docs live at `../docs/guides`.

## How to use the docs

The bundled Mux docs in `../docs/guides` are the source of truth for Mux API behavior, concepts, and integration guidance.

Search them with `rg`:

- Video on demand: `rg -l "video" ../docs/guides`
- Live streaming: `rg -l "live" ../docs/guides`
- Player: `rg -l "player" ../docs/guides`
- Data and analytics: `rg -l "data|analytics" ../docs/guides`
- Uploads: `rg -l "upload" ../docs/guides`
- Webhooks: `rg -l "webhook" ../docs/guides`
- Subtitles and captions: `rg -l "subtitle|caption" ../docs/guides`
- DRM: `rg -l "drm" ../docs/guides`
- Encoding and renditions: `rg -l "encoding|rendition" ../docs/guides`
- Signed playback: `rg -l "signed|playback.*token" ../docs/guides`

Start in `../docs/guides/core` for fundamentals. The `developer` directory has the most detailed product-specific guides.

## Notes

- `AGENTS.md` contains repo-specific guidance for this codebase and is shipped alongside the embedded skill.
- Keep `docs/guides` as the editable source of truth in the repository. Distribution packaging should copy the docs and this skill; it should not move the source docs into `dist`.
