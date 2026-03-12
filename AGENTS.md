# Agent Instructions — Mux CLI

## Mux Documentation

The `docs/guides/` directory contains the full Mux documentation as MDX files, synced from the `muxinc/mux.com` repo. Use these files as the authoritative source for Mux API behavior, concepts, and integration patterns.

For searching and using the docs, see the canonical guide in `skill/SKILL.md`.

### Repo-specific notes

- MDX files have YAML frontmatter with `title`, `product`, and `description` fields. They may contain JSX components; focus on the prose and code blocks for factual content.
- Docs are synced daily via GitHub Actions. Run `bash scripts/sync-docs.sh` to update locally.
- For installed copies of the CLI, prefer `mux docs path --json` over guessing npm, Homebrew, or shell-install locations.
