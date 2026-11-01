# Agent notes

The overlay is drawn in Rust (`src/`) and exposed to TypeScript through
napi-rs: `bun run build` compiles it into `native/`, with `native/index.d.ts`
generated from the `#[napi]` items in `src/lib.rs`. `ts/index.ts` wraps it in
an Effect service.

## After every change

1. Bump the version in both `Cargo.toml` and `package.json`: patch for fixes,
   minor for new features.
2. `bun run test`: runs the Rust tests, builds the native module, then runs
   the Bun tests. The
   end-to-end test opens a nested Hyprland window for about a second and
   saves what it saw to `screenshots/`.
3. `bun run lint` and `cargo clippy --all-targets` must print no warnings.

A visual change breaks the snapshot tests on purpose: look at the new frames,
then rewrite them with `UPDATE_SNAPSHOTS=1 bun test test/render.test.ts`.

## Style

Rust follows the Google Rust style guide in `docs/rust-style-guide.md`,
enforced by `[lints.clippy]` in `Cargo.toml` and by `tests/style.rs`.

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
