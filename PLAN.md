# Alviss — Phase 1 Plan

**Status:** Draft for approval
**Date:** 2026-11-14
**Base:** Plainva v0.8.7 (commit `423752705`, released 2026-11-04)
**Target:** First paid macOS release with an in-app LLM chat

---

## 1. Summary

Alviss is a commercially distributed, rebranded derivative of [Plainva](https://github.com/plainva/plainva),
an open-source local-first Markdown vault editor, extended with an in-app LLM chat.

The three decisions this plan is built on:

1. **Base on the stable release, not on upstream's development branch.** v0.8.7 is what users
   actually run; upstream `main` is 277 unreleased commits ahead.
2. **Write our own LLM chat.** Upstream has an unreleased AI subsystem on `main` (about 78k lines
   across `packages/core/src/ai` and `packages/ui/src/ai`). It is a useful **reference** for
   architecture and pitfalls, but it is not a dependency: shipping it would mean shipping an
   unreleased, still-changing module we do not control.
3. **macOS first, paid, direct distribution.** Windows and Linux are a later step and are not
   designed against in Phase 1.

Phase 1 delivers: a rebranded, signed and notarized macOS app that keeps every Plainva feature
and adds a working, provider-agnostic LLM chat.

---

## 2. Legal position

Plainva is licensed **AGPL-3.0-only**. Alviss is therefore a derivative work and must remain
AGPL-3.0-only in its entirety — including the code we write ourselves.

This does **not** prevent selling the app. AGPL §4 explicitly allows charging any price for a
conveyed copy. It does mean:

- Every recipient may obtain the source and redistribute it freely. The business must be built on
  things that are not the source: signed builds, notarization, updates, support, curated AI presets,
  and later team or sync services. It cannot be built on withholding code.
- We must ship the complete corresponding source for whatever binaries we publish.

### 2.1 Mandatory obligations

| # | Obligation | Where it lands |
|---|---|---|
| 1 | Keep `LICENSE` (full AGPL-3.0 text) in the repository and in the app bundle | `LICENSE`, bundle resources |
| 2 | `license: "AGPL-3.0-only"` in every `package.json` and `Cargo.toml` | all manifests |
| 3 | Prominent notice that the work was **modified**, with a date (§5a) | `NOTICE`, `README.md`, About window |
| 4 | Prominent notice that the work is **released under AGPL-3.0-only** (§5b) | same |
| 5 | The whole work licensed under AGPL, no partial relicensing (§5c) | repository-wide |
| 6 | Appropriate Legal Notices in the interactive UI (§5d): copyright, no warranty, how to view the licence | About window |
| 7 | Corresponding Source available wherever a binary is published (§6d) | every release page links the source |
| 8 | No additional restrictions imposed on downstream recipients (§10) | no "non-commercial" or "no-fork" clauses anywhere |
| 9 | No use of upstream trademarks or brand assets (§7(e)) | see §4 |

Obligation 7 is satisfied by publishing every release from this repository together with a source
archive for the exact tag, and linking the repository from the release page.

### 2.2 §13 (network interaction)

AGPL §13 is triggered when users interact with **our modified program** remotely over a network.
An in-app LLM client that calls a provider's API directly is not such a service, so §13 does not
apply to Phase 1.

It **would** apply if we later operate a server that runs or serves Alviss — for example a hosted
sync backend, a shared-vault server, or a proxy that lets users spend our provider credits. Any
such service must offer its source to its users. This is recorded here so the decision is
deliberate when it comes up.

### 2.3 Mobile and iOS

The iOS/Android shells are out of scope for Phase 1 and are not built or shipped. The code stays
in the tree; the App Store listings, TestFlight and Apple Developer identifiers from upstream are
not reusable and are not touched.

---

## 3. Naming and branding

### 3.1 Name

**Alviss** — from Old Norse *Alvíss* ("all-wise"), the wise dwarf of *Alvíssmál* in the Poetic
Edda. Already the repository name.

It fits the product, is short, pronounceable in English and Chinese, and carries no plausible
association with upstream. Note that *Alvíss* is mythological, but a software trademark on
"Alviss" may still exist; a register search in our target markets is required before spending on
branding (see §12, R5).

Fallback candidates if the search is unfavourable: **Gandálfr** ("wand-elf"), **Vindálfr**
("wind-elf"), **Ljósálfr** ("light-elf").

### 3.2 Brand constants

| Item | Value |
|---|---|
| Product name | `Alviss` |
| Bundle identifier | `com.alviss.desktop` |
| URL scheme | `alviss://` |
| Window title / About | `Alviss` |
| Website | to be registered (e.g. `alviss.app`) |
| Updater endpoint | our own GitHub releases |

### 3.3 Rebrand strategy — three tiers

A full rename of every identifier is not worth its cost. The split:

**Tier 1 — must change (user-visible).**

- `apps/desktop/src-tauri/tauri.conf.json`: `productName`, window `title`, `identifier`,
  `deep-link` scheme, `updater.pubkey`, `updater.endpoints`
- `apps/desktop/src-tauri/Cargo.toml`: package `name`, `description`
- App icon set under `apps/desktop/src-tauri/icons/`
- Window titles and About page
- Product name in all ten locale files (`packages/ui/src/locales/*.json`, about 350 occurrences
  each)
- `AI_FEEDBACK_URL` and any other URL pointing at the upstream repository
- `README.md`, `SECURITY.md`, `CONTRIBUTING.md`

**Tier 2 — should change (developer-visible).**

- `package.json` descriptions, repository/homepage fields
- `CHANGELOG.md` header, `docs/` footers
- Error and diagnostic strings naming the product

**Tier 3 — deliberately unchanged.**

- Internal package names `@plainva/core`, `@plainva/ui` — invisible to users, and renaming them
  would touch thousands of import lines and make every future upstream merge a conflict.
- The `plainva:` YAML frontmatter namespace — renaming it would break compatibility with existing
  vaults and with Obsidian, which the product's core promise depends on.
- The `.plainva/` hidden folder inside vaults and the `plainva.db` filename — renaming requires a
  data migration for no user benefit.
- The `plainva-mcp` helper binary name — internal.

Tier 3 is **descriptive use** of a name to preserve file compatibility, not brand use of it, and
it is recorded in `NOTICE` so the choice is explicit.

### 3.4 Upstream relationship statement

`README.md` and the About window state, in plain language:

> Alviss is an independent, unofficial derivative of Plainva, licensed under AGPL-3.0-only.
> It is not affiliated with, endorsed by, or supported by the Plainva project.

---

## 4. Phase 1 scope

### 4.1 In scope

| Area | Content |
|---|---|
| Rebrand | Tier 1 + Tier 2 above |
| Languages | **English and Simplified Chinese only.** The other eight bundles stay in the tree as upstream assets but are not offered in the picker, not resolved from the OS locale, and not loaded into the bundle |
| LLM chat | Own implementation, see §5 |
| macOS release | Signed, notarized, universal DMG, in-app updates |
| Compliance | `NOTICE`, About notices, source links on releases |
| Docs | English user guide page for the chat; `BUILDING.md` for contributors |

### 4.2 Out of scope

- Windows and Linux builds
- iOS and Android builds
- AI agents that modify the vault (tools, routines, skills, memory, MCP)
- Embeddings, semantic search, transcription
- Sync services of our own
- Payment/licensing system (Phase 2)

### 4.3 Non-negotiable product rule inherited from upstream

Every file Alviss writes must remain plain Markdown that opens in Obsidian. The chat must never
write into the vault in Phase 1 — it reads and answers only. This keeps the promise intact and
removes the largest class of data-loss risk from the first release.

---

## 5. LLM chat — our implementation

### 5.1 Scope

A chat panel inside the app that talks to any OpenAI-compatible or Anthropic-compatible endpoint
configured by the user with a base URL, an API key and a model name.

Built-in presets: **OpenAI**, **Anthropic** and **DeepSeek**. Every other provider is reached
through the **custom endpoint** entry — a label, a base URL and a token — which is a first-class
part of Phase 1, not a fallback, because customised deployments are expected.

Phase 1 capabilities:

- Configure one or more endpoints: label, base URL, protocol (OpenAI chat / Anthropic messages),
  API key, model id
- Test connection and list models
- Streamed answers, stop, regenerate
- Markdown rendering with code blocks and copy
- Attach context: the open note, or the current selection
- Per-conversation history, saved locally
- Clear errors: rejected key, unreachable host, unknown model, rate limit, context overflow

Explicitly not in Phase 1: tool calling, vault writes, multi-step agents, embeddings.

### 5.2 Architecture

Mirrors the pattern that upstream arrived at, for the same reasons:

```
┌──────────────────────────────┐
│ React chat panel             │  packages/ui/src/llm/
│  - conversations, streaming  │
└──────────────┬───────────────┘
               │ Tauri commands + events
┌──────────────▼───────────────┐
│ Rust egress                  │  apps/desktop/src-tauri/src/llm/
│  - holds the key             │
│  - builds the HTTP request   │
│  - parses SSE, emits deltas  │
│  - enforces endpoint allowlist│
└──────────────┬───────────────┘
               │ HTTPS
        provider API
```

The API key lives in the OS keychain and is read by Rust at request time. The WebView never holds
a usable key, so a compromised renderer or an injected note cannot exfiltrate it and cannot
redirect it to another host.

New modules:

| Path | Purpose |
|---|---|
| `packages/core/src/llm/types.ts` | conversation, message, endpoint, model types |
| `packages/core/src/llm/openai.ts` | OpenAI chat-completions codec + SSE parser |
| `packages/core/src/llm/anthropic.ts` | Anthropic messages codec + SSE parser |
| `packages/core/src/llm/errors.ts` | provider error normalisation |
| `packages/core/src/llm/context.ts` | builds the prompt from note/selection within a token budget |
| `packages/ui/src/llm/` | chat state, hooks, components |
| `apps/desktop/src-tauri/src/llm/` | keychain, HTTP egress, streaming events |

Reuse from the existing codebase (already present in v0.8.7):

- `ICredentialStore` / `CredentialManager` — the keychain abstraction from ADR 0011, already used
  for sync credentials
- Settings storage and the settings page framework (`SettingsSurface`, `settingsCatalog`)
- The design system: tokens, primitives, `data-tip` tooltips, `designGuards` rules

The new settings page is registered in `packages/ui/src/lib/settingsCatalog.ts` next to the
existing areas, so the phone layout and the settings search pick it up for free.

### 5.3 Storage

- Endpoint configuration (label, URL, protocol, model, temperature): the existing settings store.
- API keys: OS keychain only. Never in the vault, never in settings JSON, never logged.
- Conversations: plain Markdown files in the vault's hidden `.plainva/chats/` folder, one file per
  conversation, with YAML frontmatter for endpoint and model. Rationale: the user owns the data,
  it syncs through whatever sync they already configured, and it stays readable in any editor.
  Being inside the existing hidden folder means no new exclusion rules are needed and no vault
  migration is required.

### 5.4 Prompt assembly

1. System prompt: short, static, product-defined, no vault content.
2. Optional attached context: the open note (whole) or the selection, truncated to the profile's
   context budget with an explicit, visible notice when truncation happens.
3. Conversation turns, oldest dropped first when the budget is exceeded.
4. Explicit warning in the UI before the first request that note content leaves the device for the
   configured endpoint.

No hidden context. Whatever is sent is shown to the user in a "what is being sent" expansion.

### 5.5 Reference material from upstream

Upstream's unreleased AI code stays available for reading on the local branch `upstream-main` and
through the `upstream` remote. It is used as a design reference for:

- the egress boundary (why the key must not live in the WebView)
- SSE parsing edge cases and provider error shapes
- the provider conformance test approach
- settings UX for adding a custom OpenAI-compatible server

Any code copied verbatim from upstream is AGPL-3.0-only and is attributed in `NOTICE`. The default
is to write our own and copy nothing.

---

## 6. Repository and workflow

### 6.1 Remotes and branches

| Remote | URL | Role |
|---|---|---|
| `origin` | `https://github.com/terrybj123/Alviss.git` | our repository |
| `upstream` | `https://github.com/plainva/plainva.git` | reference only |

| Branch | Meaning |
|---|---|
| `main` | **ours**: v0.8.7 + Alviss work |
| `upstream-main` | local mirror of upstream `main`, never pushed, used for reading |

Upstream sync policy: deliberate merges of **release tags** only (`git merge v0.8.8`), never of
`upstream/main`. Each merge gets its own branch and a full test run. This keeps the base stable
and the history auditable.

### 6.2 Versioning

Our own semantic version starting at `1.0.0` for the first paid release. `UPSTREAM.md` records the
exact upstream commit our tree is based on, updated with every upstream merge.

### 6.3 CI

Upstream's workflows assume their secrets, their signing keys and their release targets. Most are
deleted in the first commit. What remains is a minimal `ci.yml`: install, lint, typecheck, unit
tests, and a macOS build. Release signing runs locally or in a workflow with our own secrets.

---

## 7. macOS development environment

Verified on this machine: macOS 26.6, Apple Silicon (arm64), Xcode 27.2 at
`/Applications/Xcode.app`, Homebrew, git 2.55, Node 26.12, pnpm 11.22, disk 85 GiB free.
**Missing: Rust.**

### 7.1 Required versions

The app's engine floor is Safari 16.4 / macOS 13.3; development requires macOS 14 or newer.
Do not develop on an older macOS than the one you intend to support.

| Tool | Required | This machine | Action |
|---|---|---|---|
| Node.js | ≥ 22 | 26.12 | ok |
| pnpm | **exactly 10.0.0** | 11.22 | downgrade — the lockfile and `packageManager` field pin 10 |
| Rust | stable | missing | install via rustup |
| Xcode CLT | required | present | ok |

### 7.2 Setup steps

```bash
# 1. pnpm 10 (the project pins packageManager: pnpm@10.0.0)
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm --version            # must print 10.0.0

# 2. Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # universal builds

# 3. Dependencies
pnpm install --frozen-lockfile

# 4. Optional: local semantic-search models (~200 MB, not needed for the chat)
node apps/desktop/scripts/fetch-onnxruntime.mjs
```

### 7.3 Daily commands

```bash
pnpm --filter desktop tauri dev        # run the desktop app
pnpm --filter desktop tauri build      # produce the .app/.dmg
pnpm test && pnpm lint && pnpm typecheck
```

The first `cargo` build takes 10–20 minutes on Apple Silicon; later builds are incremental.

### 7.4 Common macOS pitfalls

- **pnpm 11 silently producing a different lockfile** — always verify `pnpm --version` before
  `install`.
- **Gatekeeper on local builds** — `tauri dev` output is not quarantined, so it just runs. Only
  downloaded `.dmg` files are quarantined.
- **WebKit is the platform, not the CPU** — the app draws its window with the system WebView.
  Behaviour differences on macOS 13.3 versus 26 are engine differences.
- **Universal build needs both Rust targets**, otherwise the `.dmg` is arm64-only and x86 users
  get a broken app.
- **Rosetta is not a substitute** for the x86_64 target when building; it only helps running.

---

## 8. Signing, notarization, release

### 8.1 Prerequisites

- Apple Developer Program membership, 99 USD/year
- A **Developer ID Application** certificate (not "Apple Development")
- An app-specific password or an App Store Connect API key for `notarytool`

### 8.2 Tauri configuration

Bundle identifier `com.alviss.desktop`, hardened runtime on, and these entitlements:

- `com.apple.security.network.client` (the LLM requests)
- `com.apple.security.keychain-access-groups` (if the default access is insufficient)

Signing environment for the build:

```bash
APPLE_CERTIFICATE=...            # base64 .p12
APPLE_CERTIFICATE_PASSWORD=...
APPLE_SIGNING_IDENTITY="Developer ID Application: ..."
APPLE_ID=...  APPLE_PASSWORD=...  APPLE_TEAM_ID=...   # notarytool
```

### 8.3 Updater keys

The upstream updater public key must be replaced. Generate our own pair once and store the private
key outside the repository:

```bash
pnpm tauri signer generate -w ~/.tauri/alviss.key
```

Public key goes into `tauri.conf.json`; private key and its password become CI secrets.

### 8.4 Release checklist

1. `pnpm test && pnpm lint && pnpm typecheck` green
2. `pnpm --filter desktop tauri build` produces the universal `.dmg`
3. `codesign --verify --deep --strict` on the `.app`
4. `xcrun notarytool submit` accepted, `xcrun stapler staple` applied
5. Fresh-machine test: download the DMG from the release URL, install, launch
6. Release page contains: the DMG, the `.sig`, and a link to the source tag
7. `NOTICE`, `LICENSE`, About window verified in the built app

### 8.5 Distribution channel

**Direct download, not the Mac App Store.** Apple's store terms impose restrictions on use and
redistribution that conflict with AGPL §10 and §12; distributing AGPL software through the Mac App
Store is a known legal risk. Selling a notarized DMG from our own site avoids the conflict
entirely and also avoids the 15–30% store fee.

---

## 9. Commercial model under AGPL

| Item | Decision |
|---|---|
| Price | Paid licence, one-time, includes 12 months of updates |
| Delivery | Notarized DMG from our site, plus GitHub Releases for the source |
| Trial | 14 days, full features |
| Licence enforcement | App-side check, no account required at launch |
| What buyers get | The binary, the update feed, priority support |
| What buyers can do | Read, modify, redistribute the source — always |
| Anti-piracy posture | Accept it. The moat is convenience, not obfuscation. |

Because the source is public by design, the paid tier must stay worth paying for after the code is
visible: reliable signed builds, timely updates, support, and curated provider presets.

---

## 10. Milestones

Estimates assume one focused developer; they are ranges, not commitments.

| # | Milestone | Deliverable | Est. |
|---|---|---|---|
| M0 | Foundation | Baseline pinned, remotes, CI, Tier 1 rebrand compiles, app runs locally | 1 week |
| M1 | LLM core | Provider adapters, SSE streaming, keychain, connection test, unit tests | 2–3 weeks |
| M2 | Chat UI | Panel, streaming, stop/regenerate, markdown, context attach, history | 2 weeks |
| M3 | Hardening | Error states, budget/truncation notices, docs, accessibility pass | 1 week |
| M4 | Release | Signing, notarization, updater, DMG, fresh-machine test | 1 week |

**First paid macOS release: roughly 7–8 weeks from approval.**

---

## 11. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Upstream releases an AI feature that overlaps ours | Wasted work, confusing merge | Ours is scoped to chat; keep it in separate directories so an upstream merge does not collide |
| R2 | AGPL compliance slips in a shipped build | Legal exposure, takedown | Release checklist §8.4 including source link and About notices |
| R3 | Provider API drift | Broken chat | Adapters isolated behind one interface; conformance tests per protocol |
| R4 | Key leaked through logs or the WebView | Security incident, trust loss | Key only in Rust; redaction tests; never in diagnostics bundles |
| R5 | "Alviss" trademark conflict | Forced rename after branding spend | Register search in EU/US before spending on domain and design |
| R6 | Upstream moves the file format | Vault incompatibility | Never write new formats; chat data stays in plain Markdown |
| R7 | Notarization rejections | Release delay | Sign early in M0, not at the end |
| R8 | Scope creep into agents/tools | Missed release, data-loss risk | §4.2 is binding for Phase 1 |

---

## 12. Decisions and open questions

Decided (2026-11-14):

- **Languages:** English and Simplified Chinese only.
- **Chat history:** `.plainva/chats/` — the existing hidden folder inside the vault, one Markdown
  file per conversation. No new folder, no migration, and it syncs through whatever sync the user
  already configured.
- **Provider presets:** OpenAI, Anthropic and DeepSeek, plus a first-class custom endpoint
  (label + base URL + token) for everything else, including customised deployments.

Still open:

1. **Trial and licence mechanism** — offline licence file, or a small activation server? (The
   server option triggers AGPL §13 if it serves the app; a licence check API does not.)
2. **Upstream merge cadence** — per release tag (proposed) or quarterly?

---

## 13. First commit

The first commit to Alviss contains, in order:

1. Baseline: the v0.8.7 tree, unmodified, so the provenance is one clean commit on top of the tag
2. `NOTICE` — upstream copyright, modification statement, date
3. `UPSTREAM.md` — base commit, merge policy
4. `PLAN.md` — this document
5. Tier 1 rebrand
6. CI trimmed to what we actually run

Nothing is pushed until this plan is approved.
