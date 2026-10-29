# Proposal: the public repository, CI and releases

Status: draft, 2026-10-29. The work is the REPO stream in the [backlog](../backlog.md), and the calls made are in
[decisions.md](../decisions.md) under "Repository and releases".

## In one line

Parity moves to Vite+ and goes public under the Fencing Club organization. Beachball change files version the desktop
app and the npm packages. Pipelines shared with Buildkit, Better Apps and Copacker run CI, previews, and delivery of the
CLI to npm and of unsigned installers to GitHub Releases, as betas first and to everyone when promoted. Signing comes
later.

## Where things stand

- **The tools are already most of Vite+:** a pnpm 12 workspace (`apps/*`, `packages/*`, `examples/*`), oxlint, oxfmt,
  Vitest 5, TypeScript 7 for checking and TypeScript 6 where code uses the compiler API. On 2026-10-29 lint took 2
  seconds, types 2 seconds, and 679 tests 9 seconds.
- **There's no remote, CI, README or licence.** The root `package.json` says `UNLICENSED`.
- **Nothing builds for production.** The main process exits without `PARITY_RENDERER_URL`, so Parity only runs under
  `pnpm dev`.
- **Nothing is versioned.** Every package is `private` at `0.0.0`, and the CLI runs from source.
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
    types, so they need no build. Only what's published gets `vp pack`: the CLI (see npm packages).
  - **The example project, the fixtures and `@parity/builder-vite` stay on stock Vite.** `examples/shadcn-vite` stands
    in for a customer's project, and builder-vite drives the customer's own Vite, so the override mustn't reach them.
    The `prefer-vite-plus-imports` lint rule skips builder-vite for the same reason.
  - **`pnpm verify` keeps its name** and runs `vp check` and `vp test`, since AGENTS.md, the backlog and every running
    session use it. Every repo using the shared pipelines has a `pnpm verify`, which is what the shared CI runs.
- **Two steps, so running sessions aren't broken.** The configuration goes first (REPO-1), made in a worktree, because
  `vp migrate` reinstalls `node_modules` under any running `pnpm dev`. The 75 test files' imports move to
  `vite-plus/test` later, when sessions have committed (REPO-2).

## Checks on commit

- **A commit lints and formats the files it stages, and a push checks types,** as the agency monorepo does with
  lefthook. Vite+ does this itself with `vp staged` and `vp hooks` (REPO-3).
- **It also fixes the shared-folder problem:** a commit is checked on its own files, not on other sessions' unfinished
  ones. Nobody bypasses the hooks with `--no-verify`.

## Versions: Beachball change files

This is how Buildkit and the agency monorepo already release, and you asked for it on 2026-10-29 (REPO-12).

- **A change to a versioned package carries a change file** saying the bump type and a line for the changelog.
  `pnpm change` writes one without prompting (`beachball change --type patch --message "…" --no-commit`), so sessions
  can, and `pnpm verify` and CI run `beachball check`.
- **What's versioned:**
  - **The CLI is published** to npm.
  - **The desktop app is versioned but not published:** not `private`, with `"beachball": { "shouldPublish": false }`.
    Beachball still bumps it and writes its changelog, which the desktop release reads.
  - **The workspace packages the CLI and the app bundle are versioned the same way.** Beachball ignores `private`
    packages, so without this a change to `@parity/core` would never bump the CLI or the app that ship it. With it, a
    change file for core bumps core, and Beachball's dependent bumps, which follow `devDependencies` too, carry it to
    every package that bundles core.
  - **Everything else stays `private`:** the example project, the fixtures and anything not shipped.
- **Beachball 2.66 understands pnpm's `workspace:` and `catalog:` versions,** and treats a catalog change as a change to
  the packages that use it.
- **A release PR, then delivery,** as Buildkit does it (REPO-17): after CI passes on `main`, pending change files open a
  pull request with `beachball bump`'s versions and changelogs, which merges itself once its checks pass. Its version
  changes start the CD pipelines. Sessions pull before they push, so they pick up the release commits.
- **Every merged release PR ships,** the CLI to npm and the app to GitHub Releases, as Buildkit's packages do. The app
  goes to the beta, and reaches everyone only when it's promoted (see Betas), so how often release PRs merge doesn't
  decide how often people's Parity changes.

## npm packages

- **The CLI is the published package** (REPO-14), which you settled on 2026-10-29. `vp pack` builds it into one package
  that bundles the workspace packages it uses, listed as `devDependencies` so they aren't installed separately, and
  ships its skills and registry files. Later, the extension SDK [extensions.md](extensions.md) describes would be a
  second.
- **It can't be `@parity/cli`.** The `@parity` scope on npm belongs to Parity Technologies (`@parity/api`,
  `@parity/abi`), so the published name is Q7. Its command can still be `parity`. Inside the repository the workspace
  packages keep their `@parity/*` names, since they're never published.
- **Publishing uses npm's trusted publishing,** with provenance and no token: `pnpm publish --provenance` from a job
  with `id-token: write` in a protected `npm` environment, as Buildkit's `publish.yml` does (REPO-15). npm checks the
  _top-level_ workflow's file name, not a reusable one it calls, so each repository registers its own `cd-npm.yml` on
  npmjs.com.
- **Only packages Beachball would publish are published.** pnpm doesn't know Beachball's `shouldPublish`, so the publish
  step publishes the packages that are neither `private` nor marked `shouldPublish: false`, in dependency order.

## CI

- **The shared CI template runs `pnpm verify`** on an operating system matrix (REPO-4): Ubuntu, Windows and macOS for
  Parity, since a public repository's runners are free on all three and Parity is developed on Windows. It sets up Vite+
  through `voidzero-dev/setup-vp`, pinned to an exact release, since its docs say the `v1` tag no longer gets updates.
- **Parity's own steps go before it:** installing the fixture projects with npm, Yarn and Bun
  (`pnpm --filter @parity/fixtures install-projects`), cached on their lockfiles. Without them `detection.test.ts`
  fails.
- **Pull requests also run `beachball check`.**
- **A newer push cancels the run before it.** Release and deploy runs never cancel.
- **Dependabot opens a weekly PR** for npm minor and patch updates, grouped, and one for Actions, which also keeps the
  shared pipelines' pinned versions current (REPO-5).

## Desktop releases

1. **A production build** (REPO-10): the renderer through `vp build`, the main, utility, preload and worker bundles, and
   the main process loading the built files when packaged.
2. **Unsigned installers with electron-builder** (CAN-37): NSIS for Windows, a DMG for macOS (arm64 and x64) and an
   AppImage for Linux, with Parity's name, icon and version. The utility process needs TypeScript 6 at runtime with its
   `lib.*.d.ts` files on disk, so it ships unbundled and outside the asar archive. Everything else is bundled, which
   keeps pnpm's symlinked `node_modules` out of the package.
3. **cd-desktop** (REPO-11): when a release PR raises the desktop app's version on `main`, it builds the installers on
   all three systems and publishes them as a GitHub pre-release tagged `v<version>`, the form electron-updater reads,
   with the app's changelog and the update metadata. The tldraw licence key comes from a repository secret, and signing
   steps skip with a notice until their secrets exist.
4. **Promotion** (REPO-18): run by hand with a version, it marks that pre-release a full release, so it reaches
   everyone. See Betas.
5. **Only the desktop app makes GitHub Releases.** electron-updater reads the repository's releases, so a CLI release
   there could look like an app update. npm packages keep their changelogs in `CHANGELOG.md`.
6. **Signing later** (REPO-13): Windows through Azure Artifact Signing, macOS with a Developer ID and notarization.

Unsigned, Windows SmartScreen warns on first run, and macOS blocks the app until it's allowed in System Settings >
Privacy & Security. macOS can't update an unsigned app in place either, so updates on macOS (CAN-38) wait for REPO-13;
Windows and Linux can update unsigned.

## Betas

You asked on 2026-10-29 for beta builds and production releases, promoted the way the web apps go from staging to
production.

- **Every release is a beta first.** cd-desktop publishes it as a GitHub pre-release. Parity with Get beta updates on
  (CAN-38) takes pre-releases too, through electron-updater's `allowPrerelease`; everyone else only takes full releases.
  The beta is a setting, not a second app, so one build serves both.
- **Promoting reuses the release** (REPO-18). `cd-desktop.yml`, run by hand with a version, waits for approval in a
  protected `production` environment, then marks the pre-release a full release and the latest, as
  `gh release edit v1.4.0 --prerelease=false --latest` does. Nothing is rebuilt, so everyone gets the files the beta
  ran.
- **Pulling a bad release back** is marking it a pre-release again. People who haven't updated stay on the release
  before it; people who have keep it until a fixed release reaches them, since Parity doesn't install an older version.
- **Leaving the beta doesn't go back a version.** Someone on a beta newer than the latest full release stays on it until
  a full release passes it.
- **Electron Forge doesn't fit this.** Its free update service, update.electronjs.org, ignores pre-releases and serves
  only Windows and macOS, so there'd be no beta and no updates on Linux.

## Previews

- **Each pull request gets builds to try** (REPO-16): the CLI through pkg.pr.new, installable with `npx` from the URL it
  comments, and the unsigned installers as the run's artifacts, linked from a comment.
- **Web apps in other repositories get a deployed preview per pull request,** removed when it closes, as Copacker, Spawn
  and the HOA app do today. Parity has no web app yet.

## Shared pipelines

You asked on 2026-10-29 for one repository of pipelines that Parity, Buildkit, Better Apps and Copacker all use, built
from discrete templates, with a pipeline per stage rather than one that does everything. Each repository has its own
`setup` action, `verify` workflow and release flow today, written separately.

**Each repository keeps thin top-level pipelines, one per stage, and only the ones it needs:**

| Pipeline              | Runs on                                              | Calls                                                                                       |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ci.yml`              | pull requests and `main`                             | `ci-verify`, plus the repository's own extra jobs                                           |
| `preview.yml`         | pull requests                                        | `preview-npm`, `preview-desktop` or `preview-web`                                           |
| `preview-cleanup.yml` | a closed pull request, and a schedule                | `preview-web-cleanup`                                                                       |
| `release.yml`         | CI passing on `main`                                 | `release-prepare` and `release-merge`, Beachball's PR                                       |
| `cd-npm.yml`          | a published package's version changing               | `cd-npm-publish`; this file is npm's trusted publisher                                      |
| `cd-desktop.yml`      | the desktop app's version changing, then a promotion | `cd-desktop-build` and `cd-desktop-release` for the beta, `cd-desktop-promote` for everyone |
| `cd-web.yml`          | `main`, then a promotion to production               | `cd-web-deploy` for staging, `cd-web-promote` for production                                |

**The pipelines repository holds the templates:**

- **Reusable workflows** (`on: workflow_call`), one job's worth each, in `.github/workflows/`. GitHub only finds them
  there and not in subfolders, so the stage is the name's prefix: `ci-`, `preview-`, `release-`, `cd-npm-`,
  `cd-desktop-`, `cd-web-`.
- **Composite actions** for steps several templates share, in `actions/<name>/action.yml`: `setup` (checkout, Node from
  `.nvmrc`, Vite+ or pnpm, a frozen install and caches), `publishable-packages` and `changed-versions`.
- **Each template documents its inputs, secrets, permissions and an example caller,** and the repository's own CI runs
  each template against a small example workspace.

**Rules:**

- **It's public.** Callers span `AndrewCraswell/*` and `Fencing-Club/*`, and a private repository's workflows can only
  be called from its own owner. Where it lives is Q8.
- **Callers pin a full commit SHA,** with the version in a comment, and Dependabot moves the pins. Buildkit already
  calls its merge workflow this way, so a pull request can never run a changed copy.
- **Templates call their own actions by full path and release tag.** In a reusable workflow, `./` means the caller's
  repository.
- **Secrets are passed by name,** never `secrets: inherit`, and each job asks for the least permissions it needs.
- **CI is shared as far as `pnpm verify` goes.** Jobs only one repository has, such as Buildkit's database servers or
  Copacker's end-to-end tests, stay in that repository's `ci.yml` beside the call.

## From the agency monorepo

The agency monorepo (`D:\agency`) is set up the same way. What Parity takes from it:

- **Checks on commit and push,** never bypassed (REPO-3).
- **Beachball change files** (REPO-12), which Buildkit uses too.
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
- **"Prefer `type` over `interface`".** Parity's code uses `interface` 414 times to `type`'s 177.
- **The React Compiler rule and "don't write `useMemo`".** Parity doesn't run the compiler.
- **Its library catalogs** (`ts-extras`, `ts-pattern`, `tiny-invariant`, `zod`, `@mantine/hooks`) and Fluent UI styling.
  Parity uses none of them, and adding one is a new dependency to discuss.
- **Its deployment docs,** which are about the legislation apps' environments and databases.

## Order

1. REPO-1, the Vite+ configuration, with PKG-1's rule moving into `lint.overrides` if PKG-1 has landed. Meanwhile the
   pipelines repository gets its first templates, `setup` and `ci-verify`, in a session of its own.
2. REPO-4, CI through the shared template, REPO-3, checks on commit, and REPO-12, change files. REPO-2 when sessions are
   quiet.
3. REPO-8, a README and licence, then REPO-9, the repository on GitHub, once CI passes on a clean checkout.
4. REPO-17, the release PR, then REPO-10, CAN-37, REPO-11 and REPO-18, the first unsigned desktop release and its
   promotion. REPO-14 and REPO-15, the CLI on npm, once Q7 names it.
5. REPO-16, previews, then REPO-5, REPO-6 and REPO-7 whenever there's room. REPO-13 when signing is set up.
