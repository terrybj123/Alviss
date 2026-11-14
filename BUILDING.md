# Building Alviss

Everything needed to go from a clean macOS machine to a running app, and the
guards that will stop a commit when it breaks a rule this repository cares
about. Releasing (signing, notarization) is [RELEASING.md](RELEASING.md).

## Toolchain

| Tool | Version | Why exactly this |
|---|---|---|
| Node.js | ≥ 22 (development: 22 or 26) | the packages declare `engines.node` |
| pnpm | **10.0.0** | `packageManager` pins it and the lockfile is v10; another major produces a different lockfile |
| Rust | stable | Tauri shell and the AI egress |
| Xcode | command line tools; full Xcode for a bundle | Tauri needs the SDK |
| macOS | 14+ to develop (13.3+ to run) | the app's engine floor |

```bash
# pnpm: the repository switches itself only if corepack is enabled
corepack prepare pnpm@10.0.0 --activate
pnpm --version          # 10.0.0

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # universal builds

# Dependencies
pnpm install --frozen-lockfile
```

## Daily commands

```bash
pnpm --filter desktop tauri dev     # the app, hot reload
pnpm --filter desktop build         # typecheck + Vite bundle only
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter desktop tauri build   # .app (+ .dmg in a GUI session)
```

The first `cargo` build takes 10–20 minutes on Apple Silicon; later ones are
incremental. `--filter desktop` matters: the repository is a pnpm/Turborepo
monorepo.

## Where things live

```
apps/desktop        the macOS shell: React UI + Tauri (Rust) in src-tauri/
apps/mobile         the phone shell (not built by Phase 1)
packages/core       logic with no UI: vault, sync, markdown, and llm/
packages/ui         shared components, primitives, i18n bundles, and llm/
docs/               ADRs, engineering notes, the user guide
```

The chat is a worked example of the split: `packages/core/src/llm` builds
request specifications and decodes streams, `packages/ui/src/llm` draws the
panel, and `apps/desktop/src-tauri/src/llm.rs` is the only place that touches a
provider key.

## The guards that will stop you

These are tests, not conventions. A commit that breaks one is red.

| Guard | Demands |
|---|---|
| `designLint.test.ts` | build on the primitives, take spacing/colour/size from the tokens, no `title=` tooltips, no new raw values (the budget map only shrinks) |
| `localeParity.test.ts` | every key in all ten bundles; a new English-only string must be justified in the allowlist |
| `featureParity.test.ts` | a feature one shell lacks needs a dated catalog entry with a reason |
| `docsParity.test.ts` | `docs/user/<lang>/` folders carry identical file lists |
| `interactionGrammar.test.ts` | rows, menus, modals and empty states come from the shared definitions |

## Troubleshooting

| Symptom | Cause |
|---|---|
| `ERR_PNPM_OUTDATED_LOCKFILE` | you are not on pnpm 10 |
| `failed to run bundle_dmg.sh` | no logged-in Finder session; the `.app` is fine, run the DMG step from a desktop terminal |
| `A public key has been found, but no private key` | `createUpdaterArtifacts` is on and `TAURI_SIGNING_PRIVATE_KEY` is unset |
| A test fails only on a non-English Mac | the suite pins English in `test-setup.ts`; a failure there means a test changes the language and does not restore it |
| `boot-guard`/floor tests fail after editing the README | the README must keep naming the engine floor (`13.3 (Ventura)`, `2.40`…) |
