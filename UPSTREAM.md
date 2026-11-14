# Upstream

Alviss is an independent derivative of [Plainva](https://github.com/plainva/plainva),
a local-first Markdown vault editor by the Plainva contributors, licensed
AGPL-3.0-only.

| | |
|---|---|
| Upstream repository | https://github.com/plainva/plainva |
| Base release | **v0.8.7** |
| Base commit | `423752705` |
| Base date | 2026-11-04 |

`UPSTREAM.md` is updated in the same commit as every upstream merge. When the
base changes, the base commit here changes with it — a release must always name
the exact upstream state it was built from.

## Why v0.8.7 and not upstream `main`

Upstream `main` is an active integration branch, not a release line. At the time
this base was chosen it was 277 commits ahead of v0.8.7, carrying large
unreleased work (an AI subsystem, sync transaction rework, error-handling
changes). Adopting it would have meant shipping code that upstream has not
released and is still reshaping.

v0.8.7 is what users actually run, so it is what Alviss starts from.

## Merge policy

- **Only release tags are merged** (`v0.8.8`, `v0.9.0`, …). `upstream/main` is
  never merged.
- Each merge happens on its own branch, runs the full check suite, and lands as
  one merge commit with a message naming the upstream tag.
- After a merge, `UPSTREAM.md` records the new base commit and the entries in
  `NOTICE` gain a line describing what changed.

Rationale: a stable base, an auditable history, and no surprise features
arriving from a branch nobody released.

## Reference: upstream's unreleased AI work

Upstream has an AI assistant on `main` (roughly 78k lines under
`packages/core/src/ai` and `packages/ui/src/ai`), unreleased as of this writing.
It is **not** part of Alviss and is **not** a build dependency.

It remains readable for design reference through the local `upstream-main`
branch and the `upstream` remote:

```bash
git show upstream-main:packages/core/src/ai/providers.ts
git show upstream-main:packages/ui/src/ai/aiSettingsModel.ts
```

Alviss's own chat lives in `packages/core/src/llm`, `packages/ui/src/llm` and
`apps/desktop/src-tauri/src/llm`. Any code copied verbatim from upstream is
AGPL-3.0-only and is attributed in `NOTICE`.

## What Alviss does not take from upstream

- the Plainva name, logo, domain, bundle identifiers and store listings
- the Plainva update feed and its signing key
- the upstream release workflows and their secrets
- the upstream AI subsystem as a dependency
