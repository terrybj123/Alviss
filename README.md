# Alviss

**A local-first Markdown vault editor with an AI assistant — for macOS.**

Your notes are plain Markdown files in a folder you own. Alviss opens an existing
vault — including Obsidian vaults, without migration — and adds an AI chat that
works with the provider you choose.

> **Status: pre-release.** Alviss is in active development and has not had a
> public release yet. Keep backups of anything irreplaceable.

## Install

**[Download Alviss-0.1.3-macos-universal.zip](https://github.com/terrybj123/Alviss/releases/download/alviss-v0.1.3/Alviss-0.1.3-macos-universal.zip)**
— macOS 13.3 or newer, Apple Silicon or Intel, one universal app.
It speaks **English, 简体中文, Deutsch**, and — marked beta — **Français** and **日本語**;
switch in **Settings → Appearance → Language**.

Unzip, drag **Alviss.app** into **Applications**, open it. The build is signed with a Developer ID
and **notarized by Apple**, so macOS verifies it on its own — no security warning to click through.
[docs/INSTALL.md](docs/INSTALL.md) covers the checksum, updating and a clean uninstall.

## What Alviss is

Alviss is an independent derivative of [Plainva](https://github.com/plainva/plainva),
an open-source vault editor by the Plainva contributors. It keeps Plainva's
product rules and adds an assistant.

- **Plain Markdown, always.** Notes are standard Markdown with YAML frontmatter.
  Nothing Alviss writes is locked in, and every file still opens in Obsidian.
- **Local-first.** The vault is a folder on your disk. There is no account and no
  telemetry.
- **Databases over notes.** Tables, boards, calendars and graphs over the
  frontmatter of ordinary notes.
- **Sync through your storage.** WebDAV/Nextcloud, S3-compatible storage, Google
  Drive, OneDrive and Dropbox.
- **Versioning built in.** Every write is snapshotted; browse, diff and restore.

## The AI assistant

Press **⌘⇧K** (or search the command palette for "Open the chat") inside a
vault. Open **Providers** in the panel, pick a provider, enter your own key and
choose a model. Alviss never brings its own AI service and never proxies your
requests.

Built-in presets:

| Provider | Kind |
|---|---|
| OpenAI | cloud |
| Anthropic | cloud |
| DeepSeek | cloud |
| Ollama | on this Mac, no key |
| LM Studio | on this Mac, no key |

Plus **any OpenAI-compatible endpoint**: give it a name, a base URL such as
`https://your-server/v1`, and a token. This covers self-hosted servers, gateways
and any provider that speaks the OpenAI chat protocol.

The note you are reading is offered as context and can be switched off with one
click. The assistant does not write to your vault.

Your key goes into the macOS keychain and is never shown again — not in the
panel, not in the settings, not in a log. Answers stream in as they arrive, and
**Stop** ends one mid-sentence.

## System requirements

| Platform | Minimum |
|---|---|
| macOS | **13.3 (Ventura)** or newer, Apple Silicon or Intel |
| Windows | 10 or newer with the **WebView2** runtime — not built yet |
| Linux | **WebKitGTK 2.40** or newer — not built yet |

The floor is the web engine, not the CPU: the window is drawn by the system
WebView, so an older macOS cannot run the app however current its Safari is.

## Build from source

Requirements: macOS 14 or newer to develop, Node.js ≥ 22, pnpm 10, Rust stable,
and the Xcode command line tools.

```bash
git clone https://github.com/terrybj123/Alviss.git
cd Alviss
pnpm install --frozen-lockfile

pnpm --filter desktop tauri dev      # run the app
pnpm lint && pnpm typecheck && pnpm test
```

For a release bundle:

```bash
pnpm --filter desktop tauri build
```

More detail — the toolchain versions, the guards that will stop a commit, and
troubleshooting — is in [BUILDING.md](BUILDING.md). Cutting a signed release is
[RELEASING.md](RELEASING.md).

## License

**AGPL-3.0-only.** Alviss is a modified version of Plainva; the full terms, the
modification notice and the trademark statement are in [NOTICE](NOTICE), and the
licence text is in [LICENSE](LICENSE).

Because the licence is AGPL, the source of every release is public and you may
read, modify and redistribute it. Alviss is sold as a signed, notarized,
self-updating build with support — not as source you cannot see.

## Upstream

Alviss is not affiliated with, endorsed by, or supported by the Plainva project.
The exact upstream state this tree is based on, and the policy for merging
upstream releases, are recorded in [UPSTREAM.md](UPSTREAM.md).
