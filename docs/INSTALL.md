# Installing Alviss on macOS

Alviss is a macOS app, distributed as a download from this repository's
[releases](https://github.com/terrybj123/Alviss/releases). There is no App Store
listing and no account to create.

> **0.1.2 is signed and notarized by Apple**, so macOS verifies it by itself: download, drag,
> open. The Gatekeeper workaround in §3 is only needed for the older 0.1.0 build, which had no
> Apple certificate.
>
> The download runs entirely on your Mac. It writes into a folder you choose and
> talks to the model provider you configure — nothing else.

## 1. What you need

| | |
|---|---|
| macOS | **13.3 (Ventura)** or newer — the window is drawn by the system WebView, so this is a hard floor |
| Chip | Apple Silicon or Intel — the download is a universal build |

## 2. Download and install

1. Open the [latest release](https://github.com/terrybj123/Alviss/releases/latest), or take the
   file directly:
   [Alviss-0.1.2-macos-universal.zip](https://github.com/terrybj123/Alviss/releases/download/alviss-v0.1.2/Alviss-0.1.2-macos-universal.zip).
2. Download the `.zip` — it sits under **Assets** on the release page, named
   `Alviss-<version>-macos-universal.zip`.
3. Double-click it, then drag **Alviss.app** into **Applications**.
4. Optionally check the file is what it claims to be:

   ```bash
   shasum -a 256 ~/Downloads/Alviss-*.zip
   ```

   Compare with the `SHA256` line in the release notes.

## 3. The first launch

Open it. macOS checks the Developer ID signature and the notarization ticket that is stapled into
the app, and starts it. There is no dialog to dismiss and nothing to allow.

If you see a security warning instead, one of two things happened: the app was modified after
download (check the SHA256 in §2), or you installed **0.1.0**, which predates notarization. For that
older build only, two ways past it:

**The dialog way**

1. Try to open Alviss once, and dismiss the dialog.
2. Open **System Settings → Privacy & Security**.
3. Scroll to **Security**; the line about Alviss sits at the bottom with an
   **Open Anyway** button.
4. Click it, authenticate, and confirm **Open**.

**The terminal way**

```bash
xattr -dr com.apple.quarantine /Applications/Alviss.app
```

This removes the "downloaded from the internet" mark from that one app. It is
the same trust decision as the button above — you are telling macOS you checked
this download yourself. Do not run it on a file you did not download from this
repository.

After either step Alviss opens normally, including updates within its own version line. Installing
0.1.2 or newer needs none of this.

## 4. Your first five minutes

1. **Open a vault** — a vault is just a folder of Markdown files. Choose an
   existing one (an Obsidian vault works as it is) or let Alviss create one.
2. **Open the chat** — the row at the top of the left sidebar, or **⌘⇧K**.
3. **Add a provider** — Ollama and LM Studio work without a key; OpenAI,
   Anthropic and DeepSeek want one; any OpenAI-compatible server can be added by
   its address.
4. Ask something about the note you have open.

The full guide is in [`docs/user`](../docs/user), and the chat has its own page
([English](../docs/user/en/AI_Chat.md), [简体中文](../docs/user/zh-CN/AI_Chat.md)).

## 5. Updating

The app checks this repository's releases for a newer version. While the
project is pre-1.0, expect that a new release may also change the vault-side
formats only in ways that stay plain Markdown — the product rule is that every
file it writes opens in any editor.

To update by hand: quit Alviss, download the new `.zip`, replace
`/Applications/Alviss.app`. Your vaults, settings and keys are outside the app
bundle and stay.

## 6. Uninstalling

1. Quit Alviss.
2. Drag **Alviss.app** to the Trash.
3. If you want the settings and cached keys gone as well:

   ```bash
   rm -rf ~/Library/Application\ Support/com.alviss.desktop
   rm -rf ~/Library/WebKit/com.alviss.desktop
   ```

   Your notes are **not** touched — they are plain files in the folder you
   chose. Keys you stored are in the macOS keychain under the service `alviss`;
   remove them in **Keychain Access** if you want them gone.

## 7. If you would rather build it

The repository builds from source with Node, pnpm, Rust and the Xcode command
line tools; see [BUILDING.md](../BUILDING.md). That path needs no Gatekeeper
step, because the app is built on your own machine.
