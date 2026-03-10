# Agent Instructions — Mux CLI

## Mux Documentation

The `docs/guides/` directory contains the full Mux documentation as MDX files, synced from the `muxinc/mux.com` repo. Use these files as the authoritative source for Mux API behavior, concepts, and integration patterns.

### Directory structure

```
docs/guides/
  core/           — Fundamentals: API requests, webhooks, system architecture
  developer/      — Player, upload, streaming, encoding, subtitles, DRM, and more
  examples/       — End-to-end examples and demos
  frameworks/     — Framework-specific guides (Next.js, React, etc.)
  integrations/   — Third-party integrations (Cloudflare, WordPress, etc.)
  pricing/        — Billing and pricing details
  snippets/       — Reusable code snippets
```

### Searching the docs

Each MDX file has YAML frontmatter with `title`, `product`, and `description` fields.

Common search patterns:

| Topic | Grep pattern |
|-------|-------------|
| Video on demand | `grep -rl "video" docs/guides/` |
| Live streaming | `grep -rl "live" docs/guides/` |
| Mux Player | `grep -rl "player" docs/guides/` |
| Mux Data / Analytics | `grep -rl "data\|analytics" docs/guides/` |
| Upload | `grep -rl "upload" docs/guides/` |
| Webhooks | `grep -rl "webhook" docs/guides/` |
| Subtitles / Captions | `grep -rl "subtitle\|caption" docs/guides/` |
| DRM | `grep -rl "drm" docs/guides/` |
| Encoding | `grep -rl "encoding\|rendition" docs/guides/` |
| Signed URLs / Playback tokens | `grep -rl "signed\|playback.*token" docs/guides/` |

### Tips

- Start with the `core/` directory for foundational concepts.
- The `developer/` directory has the most content — narrow searches with subdirectory paths when possible.
- MDX files may contain JSX components; focus on the prose and code blocks for factual content.
- These docs are synced daily via GitHub Actions. Run `bash scripts/sync-docs.sh` to update locally.
