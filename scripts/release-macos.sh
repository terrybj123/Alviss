#!/usr/bin/env bash
# Build, sign, notarize and staple a macOS release.
#
# Needs, in the environment:
#   APPLE_SIGNING_IDENTITY  "Developer ID Application: Name (TEAMID)"
#   APPLE_ID                the Apple ID that owns the team
#   APPLE_PASSWORD          an app-specific password (not the account password)
#   APPLE_TEAM_ID           ten characters
#   TAURI_SIGNING_PRIVATE_KEY (+ optional _PASSWORD) for the updater artifacts
#
# `~/.tauri/notary.env` may hold the APPLE_* values; this script sources it if
# it exists, so a password never has to be pasted into a shell history.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$HOME/.tauri/notary.env" ]]; then
  set -a; . "$HOME/.tauri/notary.env"; set +a
fi

for name in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "missing $name" >&2
    exit 1
  fi
done

VERSION=$(python3 -c 'import json;print(json.load(open("apps/desktop/src-tauri/tauri.conf.json"))["version"])')
echo "== Alviss $VERSION =="

echo "== checks =="
pnpm lint
pnpm typecheck
pnpm test

echo "== build (universal) =="
pnpm --filter desktop tauri build --target universal-apple-darwin --bundles app

BUNDLE="apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos"
APP="$BUNDLE/Alviss.app"
echo "== verify =="
codesign --verify --deep --strict --verbose=2 "$APP"
# Notarized, this must say "accepted / source=Notarized Developer ID".
spctl --assess --type execute --verbose=2 "$APP"
xcrun stapler validate "$APP"

echo "== package =="
ZIP="$BUNDLE/Alviss-$VERSION-macos-universal.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
shasum -a 256 "$ZIP" | tee "$ZIP.sha256"
ls -lh "$ZIP"

echo
echo "Ready to publish:"
echo "  tag        alviss-v$VERSION"
echo "  asset      $(basename "$ZIP")"
echo "  sha256     $(cut -d' ' -f1 "$ZIP.sha256")"
