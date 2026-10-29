# Proposal: the public repository, CI and releases

Status: draft, 2026-10-29. The work is the REPO stream in the [backlog](../backlog.md), and the calls made are in
[decisions.md](../decisions.md) under "Repository and releases".

## In one line

Parity moves to Vite+, gets CI on GitHub Actions, and ships unsigned installers from tagged releases, from a public
repository under the Fencing Club organization. Signing comes later.

## Where things stand

- **The tools are already most of Vite+:** a pnpm 12 workspace (`apps/*`, `packages/*`, `examples/*`), oxlint, oxfmt,
  Vitest 5, TypeScript 7 for checking and TypeScript 6 where code uses the compiler API. On 2026-10-29 lint took 2
  seconds, types 2 seconds, and 679 tests 9 seconds.
- **There's no remote, CI, README or licence.** The root `package.json` says `UNLICENSED`.
- **Nothing builds for production.** The main process exits without `PARITY_RENDERER_URL`, so Parity only runs under
  `pnpm dev`.
- **`pnpm verify` checks other sessions' unfinished work too,** because several sessions share the folder. On 2026-10-29
  it failed on another session's scratch file, so on its own it isn't a reliable gate.

## Vite+

Vite+ 1.4.0 (MIT) puts Vite, Vitest 5.0.5, oxlint, oxfmt, tsdown and a task runner with caching behind one `vp` command,
with a type checker that runs on TypeScript 7. Its `vite:monorepo` template has one root `vite.config.ts` holding
`lint`, `fmt` and `run`, a pnpm catalog for shared versions, an override pointing every `vite` at
`@voidzero-dev/vite-plus-core`, and packages built to `dist` with `vp pack`.

- **Migrate in place with `vp migrate`,** which keeps the history, then shape the result to the template.
- **Three departures from the template:**
  - **Workspace packages stay source-only** (`exports: ./src/index.ts`). The app bundles them and Node strips their
    types, so they need no build. Only something that ships on its own gets `vp pack`, such as the CLI if it goes to npm
    (Q3).
  - **The example project, the fixtures and `@parity/builder-vite` stay on stock Vite.** `examples/shadcn-vite` stands
    in for a customer's project, and builder-vite drives the customer's own Vite, so the override mustn't reach them.
    The `prefer-vite-plus-imports` lint rule skips builder-vite for the same reason.
  - **`pnpm verify` keeps its name** and runs `vp check` and `vp test`, since AGENTS.md, the backlog and every running
    session use it.
- **Two steps, so running sessions aren't broken.** The configuration goes first (REPO-1), made in a worktree, because
  `vp migrate` reinstalls `node_modules` under any running `pnpm dev`. The 75 test files' imports move to
  `vite-plus/test` later, when sessions have committed (REPO-2).

## Checks on commit

- **A commit lints and formats the files it stages, and a push checks types,** as the agency monorepo does with
  lefthook. Vite+ does this itself with `vp staged` and `vp hooks` (REPO-3).
- **It also fixes the shared-folder problem:** a commit is checked on its own files, not on other sessions' unfinished
  ones. Nobody bypasses the hooks with `--no-verify`.

## CI

- **GitHub Actions, with `voidzero-dev/setup-vp` pinned to an exact release** (REPO-4). Its docs say the `v1` tag no
  longer gets updates.
- **`vp check` on Ubuntu, and `vp test` on Ubuntu, Windows and macOS.** A public repository's runners are free on all
  three, and Parity is developed on Windows.
- **The fixture projects are installed first,** with npm, Yarn and Bun, as
  `pnpm --filter @parity/fixtures install-projects` does, and cached on their lockfiles. Without them
  `detection.test.ts` fails.
- **A newer push cancels the run before it.** Release runs never cancel.
- **Dependabot opens a weekly PR** for npm minor and patch updates, grouped, and one for Actions (REPO-5).

## Releases

1. **A production build** (REPO-10): the renderer through `vp build`, the main, utility, preload and worker bundles, and
   the main process loading the built files when packaged.
2. **Unsigned installers with electron-builder** (CAN-37): NSIS for Windows, a DMG for macOS (arm64 and x64) and an
   AppImage for Linux, with Parity's name, icon and version. The utility process needs TypeScript 6 at runtime with its
   `lib.*.d.ts` files on disk, so it ships unbundled and outside the asar archive. Everything else is bundled, which
   keeps pnpm's symlinked `node_modules` out of the package.
3. **A release workflow** (REPO-11): a `v*` tag builds on all three systems and drafts a GitHub Release with the
   installers and the update metadata. The tldraw licence key comes from a repository secret. Signing steps skip with a
   notice until their secrets exist.
4. **Versions and release notes from release-please** (REPO-12), reading the conventional commits AGENTS.md already asks
   for. Not `@changesets/cli`, whose name clashes with PKG-2's changesets, and not beachball, which wants a change file
   with every commit and is made for publishing npm packages.
5. **Signing later** (REPO-13): Windows through Azure Artifact Signing, macOS with a Developer ID and notarization.

Unsigned, Windows SmartScreen warns on first run, and macOS blocks the app until it's allowed in System Settings >
Privacy & Security. macOS can't update an unsigned app in place either, so updates on macOS (CAN-38) wait for REPO-13;
Windows and Linux can update unsigned.

## From the agency monorepo

The agency monorepo (`D:\agency`) is the other monorepo set up this way. What Parity takes from it:

- **Checks on commit and push,** never bypassed (REPO-3).
- **Dependabot, cancelling superseded CI runs, and release steps that skip with a notice** when their secret is missing
  (REPO-4, REPO-5, REPO-11).
- **knip for unused files, dependencies and exports** (REPO-6), which matters more as code moves into packages.
- **Its stricter lint rules** (REPO-7), without `curly` (2,623 hits: Parity writes one-line `if (x) return`),
  `no-console` (the CLI and scripts print) and `no-bitwise`. That leaves about 250 to fix, most of them nested
  ternaries.
- **pnpm's `verifyDepsBeforeRun: error`,** so a script stops when another session changed the dependencies without
  installing them, and **shared versions in a pnpm catalog** (both in REPO-1).
- **Editor settings in `.vscode`:** the oxc extension formatting on save, and TypeScript's native preview (REPO-1).
- **Its working conventions,** adapted in [conventions.md](../conventions.md).

What it doesn't take:

- **Turborepo,** since `vp run` runs tasks and caches them.
- **Shared config packages** (`@repo/oxlint-config`, `@repo/typescript-config`). Vite+ keeps lint and format settings in
  the root config, with overrides per folder.
- **beachball,** as above.
- **"Prefer `type` over `interface`".** Parity's code uses `interface` 414 times to `type`'s 177.
- **The React Compiler rule and "don't write `useMemo`".** Parity doesn't run the compiler.
- **Its library catalogs** (`ts-extras`, `ts-pattern`, `tiny-invariant`, `zod`, `@mantine/hooks`) and Fluent UI styling.
  Parity uses none of them, and adding one is a new dependency to discuss.
- **Its deployment docs,** which are about the legislation apps' environments and databases.

## Order

1. REPO-1, the Vite+ configuration, with PKG-1's rule moving into `lint.overrides` if PKG-1 has landed.
2. REPO-4, CI, and REPO-3, checks on commit. REPO-2 when sessions are quiet.
3. REPO-8, a README and licence, then REPO-9, the repository on GitHub, once CI passes on a clean checkout.
4. REPO-10, CAN-37 and REPO-11, the first unsigned release, then REPO-12.
5. REPO-5, REPO-6 and REPO-7 whenever there's room. REPO-13 when signing is set up.
