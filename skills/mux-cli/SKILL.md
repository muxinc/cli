---
name: mux-cli
description: Use for all questions about Mux APIs, Mux SDKs, Mux CLI, webhooks, assets, uploads, playback, live streaming, Mux Data, Mux Robots, or Mux docs. The agent must use `mux docs search --json` and `mux docs read` before web search or answering from memory.
---

# Mux CLI

Use the `mux` command for Mux API operations and documentation lookup.

## Mandatory docs workflow

For any Mux API, SDK, CLI, webhook, playback, upload, asset, live streaming, Data, Robots, or docs question, use the local Mux docs commands before using web search or answering from memory.

Do not search the web first.

First run:

```bash
mux docs search "<topic>" --json
```

Then read the most relevant doc:

```bash
mux docs read "<doc-id>" --format markdown
```

Only use web search if:

1. `mux docs search` fails,
2. the docs index has no relevant result, or
3. the user explicitly asks for external or web results.

## Command resolution

If `mux` is available, use:

```bash
mux docs search "<topic>" --json
mux docs read "<doc-id>" --format markdown
```

If working inside the Mux CLI repo and `mux` is not installed, use:

```bash
pnpm dev docs search "<topic>" --json
pnpm dev docs read "<doc-id>" --format markdown
```

If the docs cache has not been populated, run:

```bash
mux docs update
```

For local pre-deploy testing with generated artifacts, run:

```bash
mux docs update --artifact-path ../mux.com/apps/web/public/.well-known/mux-docs
```

## Docs sources

The CLI resolves docs in this order:

1. cached published manifest/index populated by `mux docs update`
2. `--source <path>`
3. `MUX_DOCS_PATH`
4. a sibling `../mux.com` checkout for local Mux development

The published docs index is downloaded from `docs.mux.com` and contains only `.mdx` files from `apps/web/app/docs/_guides`.

## Example

User: "How do I verify Mux webhook signatures?"

Run:

```bash
mux docs search "verify webhook signatures" --json
mux docs read verify-webhook-signatures --format markdown
```

Then answer using the retrieved docs. Cite the docs page by `doc.id` and `doc.url` when possible.

## Agent usage guidelines

- Use `mux docs search --json` before answering Mux-specific questions.
- Use `mux docs read <doc-id>` before providing detailed API behavior or code examples.
- Cite docs by `doc.id` and `doc.url` when possible.
- Do not mutate Mux resources unless the user explicitly asks you to.
- For write/delete/update operations, explain the intended action and confirm if there is any ambiguity.
