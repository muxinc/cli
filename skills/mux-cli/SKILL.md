---
name: mux-cli
description: Use the Mux CLI to interact with Mux APIs and search/read Mux documentation. Use when answering questions about Mux, developing Mux integrations, or operating Mux resources from a terminal.
---

# Mux CLI

Use the `mux` command for Mux API operations and documentation lookup.

## Documentation workflow

Before answering Mux-specific implementation questions, prefer the local docs interface instead of guessing:

```bash
mux docs search "<topic>" --json
mux docs read "<doc-id>" --format markdown
```

Use `mux docs search` first to identify the right page. Use `mux docs read` when you need full details or code examples.

## Docs sources

The CLI resolves docs in this order:

1. `--source <path>`
2. `MUX_DOCS_PATH`
3. A sibling `../mux.com` checkout for local Mux development
4. The CLI docs cache populated by `mux docs update`

For local Mux development, the docs repository is usually available as a sibling checkout:

```bash
MUX_DOCS_PATH=../mux.com mux docs search "webhook signatures" --json
```

For public/default usage, refresh the cache from the mux.com repository:

```bash
mux docs update
```

This downloads the published docs manifest and index from `docs.mux.com`. The index contains only `.mdx` files from `apps/web/app/docs/_guides`.

## Agent usage guidelines

- Prefer `--json` for search results.
- Cite docs by `doc.id` and `doc.url` when possible.
- Use `mux docs read <doc-id>` before providing detailed API behavior or code examples.
- Do not mutate Mux resources unless the user explicitly asks you to.
- For write/delete/update operations, explain the intended action and confirm if there is any ambiguity.
