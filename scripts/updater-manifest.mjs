#!/usr/bin/env node
/**
 * Writes the static update manifest the app's updater reads.
 *
 *   node scripts/updater-manifest.mjs <version> <tarball-url> <sig-file> <out-file> [notes]
 *
 * The platform keys are what `tauri-plugin-updater` computes at runtime:
 * `{os}-{arch}` — `darwin-aarch64` on Apple Silicon, `darwin-x86_64` on Intel.
 * One universal tarball serves both, so both entries carry its URL and the one
 * signature that was made over it.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [version, url, sigFile, outFile, notes = ""] = process.argv.slice(2);
if (!version || !url || !sigFile || !outFile) {
  console.error("usage: updater-manifest.mjs <version> <tarball-url> <sig-file> <out-file> [notes]");
  process.exit(1);
}

// Tauri writes the signature base64-encoded; the updater base64-decodes it
// before minisign verifies, so the manifest carries the file content verbatim.
const signature = readFileSync(sigFile, "utf8").trim();
if (!/^[A-Za-z0-9+/=]+$/.test(signature)) {
  console.error(`${sigFile} does not look like a base64 signature`);
  process.exit(1);
}

const platform = { signature, url };
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform },
};

writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${outFile} for ${version} (${Object.keys(manifest.platforms).join(", ")})`);
