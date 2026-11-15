# Releasing Alviss

What it takes to put a signed, notarized macOS build in front of a user. Everything here needs
material that is **not** in this repository: an Apple Developer account, its certificate, and the
updater private key.

## 1. Prerequisites (once)

| Item | Where | Note |
|---|---|---|
| Apple Developer Program | developer.apple.com | 99 USD/year; a free account cannot notarize |
| **Developer ID Application** certificate | Certificates, Identifiers & Profiles | not "Apple Development" |
| Team ID | developer.apple.com → Membership | ten characters |
| Notarization secret | app-specific password, or an App Store Connect API key | |
| Updater key pair | `pnpm --filter desktop tauri signer generate -w ~/.tauri/alviss.key` | **Back it up.** Losing it means no further updates for installed copies |

The updater **public** key is in `apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
The private key never enters the repository and never enters CI in plain text — it is a repository
secret.

## 2. Environment

```bash
export APPLE_CERTIFICATE="<base64 of the .p12>"
export APPLE_CERTIFICATE_PASSWORD="<its password>"
export APPLE_SIGNING_IDENTITY="Developer ID Application: <Name> (<TEAMID>)"
export APPLE_ID="<apple id>"
export APPLE_PASSWORD="<app-specific password>"
export APPLE_TEAM_ID="<TEAMID>"

export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/alviss.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
```

## 3. Cut the release

```bash
# 1. Version and changelog
#    apps/desktop/src-tauri/tauri.conf.json  ->  "version"
#    apps/desktop/package.json               ->  "version"
#    CHANGELOG.md                            ->  a dated entry

# 2. The whole check, once
pnpm lint && pnpm typecheck && pnpm test

# 3. Build, sign, notarize, staple
pnpm --filter desktop tauri build --bundles app,dmg
```

`tauri build` signs with `APPLE_SIGNING_IDENTITY`, submits to `notarytool` and staples the result
when the three `APPLE_*` variables are present. Without them the build is unsigned and macOS will
refuse it on another machine.

**The DMG step needs a logged-in GUI session.** `bundle_dmg.sh` drives Finder through AppleScript;
over SSH or in a headless agent it fails with `failed to run bundle_dmg.sh` while the `.app` itself
is fine. Run the release from a normal desktop session.

## 4. Verify before publishing

```bash
codesign --verify --deep --strict --verbose=2 "Alviss.app"
spctl --assess --type execute --verbose=2 "Alviss.app"      # accepted, source=Notarized Developer ID
xcrun stapler validate "Alviss.app"
```

Then the fresh-machine test: download the DMG from the release URL, install, launch, open a vault,
open the chat (`⌘⇧K`).

## 5. Publish

1. Tag **`alviss-vX.Y.Z`** on the commit that was built. The prefix is not decoration: the
   repository's history carries the upstream project's tags, so a bare `v0.1.0` already exists and
   GitHub would attach the release to that years-old upstream commit. Our tags are namespaced so
   that cannot happen — the first release proved it the expensive way.
2. Attach: the `.dmg`, its `.sig`, and the updater archive Tauri produced.
3. Write the release page **and link the source for that tag** — AGPL-3.0 §6(d) requires the
   corresponding source to be obtainable from the place the binary is offered.
   Mark a build as a **prerelease only when a newer stable release already exists** — GitHub keeps
   prereleases out of `/releases/latest`, and on 2026-11-15 the single installable build was marked
   that way, so every "latest" link led to an empty list and nobody could find the download. While
   it is the only build, publish it normally and say "developer preview" in the title.
4. Update the updater manifest (`latest.json`) the app reads:
   `https://github.com/terrybj123/Alviss/releases/latest/download/latest.json`.
5. Keep `NOTICE` accurate: it names the upstream base commit and the modifications. A release
   whose `NOTICE` is stale is a licence problem, not a documentation problem.

### The unsigned path (what 0.1.0 shipped)

Before the Apple certificate exists, `tauri build` signs nothing and `spctl` rejects the bundle —
that is expected, and it is why the download needs one approval step
([docs/INSTALL.md](docs/INSTALL.md) §3). It still has to be a **universal** build and still carries
a checksum in the notes:

```bash
pnpm --filter desktop tauri build --target universal-apple-darwin --bundles app
cd apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos
ditto -c -k --sequesterRsrc --keepParent Alviss.app Alviss-X.Y.Z-macos-universal.zip
shasum -a 256 Alviss-X.Y.Z-macos-universal.zip
```

## 6. Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` green
- [ ] version bumped in both files, `CHANGELOG.md` dated
- [ ] `UPSTREAM.md` names the base commit this release was built from
- [ ] `.dmg` signed, notarized, stapled, `spctl` accepted
- [ ] installed from the published URL on a machine that never had it
- [ ] chat works against at least one provider with a real key
- [ ] release page links the source for the tag
- [ ] `latest.json` points at the new build and verifies against the embedded public key

## 7. What is still missing

- The Apple Developer account itself (§1). Until then every build is unsigned and local only.
- A release workflow in CI. It needs the certificates and the updater key as repository secrets;
  the build itself is already reproducible locally with the commands above.
