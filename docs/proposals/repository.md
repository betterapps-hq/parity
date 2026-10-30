# Proposal: the public repository, CI and releases

Status: draft, 2026-10-29. The work is the Repository, CI and releases stream in Linear, and the calls made are in
[decisions.md](../decisions.md) under "Repository and releases".

## In one line

Parity moves to Vite+ and goes public under the Better Apps organization. Beachball change files version the desktop app
and the npm packages. Pipelines shared with Buildkit, Better Apps and Copacker run CI, previews, and delivery of the CLI
to npm and of unsigned installers to GitHub Releases, as betas first and to everyone when promoted. Signing comes later.

## Where things stand

- **The tools are already most of Vite+:** a pnpm 12 workspace (`apps/*`, `packages/*`, `examples/*`), oxlint, oxfmt,
  Vitest 5, TypeScript 7 for checking and TypeScript 6 where code uses the compiler API. On 2026-10-29 lint took 2
  seconds, types 2 seconds, and 679 tests 9 seconds.
- **The repository has a README and the MIT licence** (PAR-397). The README says what Parity is, how to get past an
  unsigned release's warnings and how to develop it, and the CLI has a README of its own for npm. Every Parity
  package.json says MIT; the example project and the fixtures stand in for other people's projects, so they don't.
- **Nothing builds for production.** The main process exits without `PARITY_RENDERER_URL`, so Parity only runs under
  `pnpm dev`.
- **Only the desktop app and the CLI are versioned,** from Beachball change files (PAR-4). The packages they bundle stay
  `private`, and the CLI still runs from source.
- **The agency monorepo's stricter lint rules are on** (PAR-396), apart from the three left out below.
- **Hooks check what a commit stages and what a push sends** (PAR-3), so other sessions' unfinished work no longer fails
  a commit. `pnpm verify` still checks the whole folder.
- **The type-aware lint rules are on** (PAR-396), checked with types on push and in CI. One test file turns
  `no-implied-eval` off in `lint.overrides`, since it runs generated source; decisions.md says why.
- **`pnpm check:unused` runs knip** (PAR-395) for unused files, dependencies and exports, from `knip.jsonc`. CI's checks
  job runs it; `pnpm verify` doesn't.
- **Dependabot keeps dependencies current** (PAR-394): weekly, grouped, a few days behind each release, and never in the
  fixtures or the Vite+ toolchain. decisions.md has the calls.

## Vite+

Vite+ 1.4.0 (MIT) puts Vite, Vitest 5.0.5, oxlint, oxfmt, tsdown and a task runner with caching behind one `vp` command,
with a type checker that runs on TypeScript 7. Its `vite:monorepo` template has one root `vite.config.ts` holding
`lint`, `fmt` and `run`, a pnpm catalog for shared versions, an override pointing every `vite` at
`@voidzero-dev/vite-plus-core`, and packages built to `dist` with `vp pack`.

- **Migrate in place with `vp migrate`,** which keeps the history, then shape the result to the template.
- **Three departures from the template:**
  - **Workspace packages stay source-only** (`exports: ./src/index.ts`). The app bundles them and Node strips their
    types, so they need no build. Only what's published gets `vp pack`: the CLI (see npm packages).
  - **The example project, the fixtures and `@parity-app/builder-vite` stay on stock Vite.** `examples/shadcn-vite`
    stands in for a customer's project, and builder-vite drives the customer's own Vite, so the override mustn't reach
    them. The `prefer-vite-plus-imports` lint rule skips builder-vite for the same reason.
  - **`pnpm verify` keeps its name** and runs `vp check` and `vp test`, since AGENTS.md, work.md and every running
    session use it. Every repo using the shared pipelines has a `pnpm verify`, which is what the shared CI runs.
- **Two steps, so running sessions aren't broken.** The configuration goes first (PAR-1), made in a worktree, because
  `vp migrate` reinstalls `node_modules` under any running `pnpm dev`. The test files' imports moved to `vite-plus/test`
  afterwards (PAR-393), and `prefer-vite-plus-imports` is on everywhere but builder-vite.

## Checks on commit and push

- **A commit lints and formats the files it stages, and a push checks types,** as the agency monorepo and Copacker do
  with lefthook. Vite+ does this itself with `vp staged` and `vp hooks` (PAR-3).
- **It also fixes the shared-folder problem:** a commit is checked on its own files, not on other sessions' unfinished
  ones. Nobody bypasses the hooks with `--no-verify`.
- **What each hook checks:**
  - **pre-commit:** lint and formatting on the staged files, fixed where they can be, then `scripts/changes.ts check`
    for change files, both from what's staged.
  - **commit-msg:** a conventional subject of at most 100 characters that isn't work in progress (`scripts/commits.ts`).
  - **pre-push:** the pushed commits' messages, with fixups refused, formatting, lint with the type-aware rules and type
    errors (`pnpm check:types`), and `scripts/changes.ts check --committed`. It catches a commit that skipped its hooks.
- **`pnpm verify` leaves types to the push,** since type checking grows slow, and tests run on twelve workers locally
  and four in CI, as Copacker's do.

## Pull requests

- **`main` takes changes only through pull requests,** under a ruleset Terraform writes when the repository goes on
  GitHub (PAR-398), from a shared module the other repositories can use too.
- **A pull request merges once its checks pass and every thread is resolved:** CI's, CodeRabbit's status and the
  title's. No approval is required, since GitHub doesn't let you approve your own.
- **Merges squash,** so a pull request's title becomes the commit's subject, and CI checks it with
  `node scripts/commits.ts title`.
- **CodeRabbit reviews every pull request** from `.coderabbit.yaml`: assertively, against AGENTS.md and conventions.md,
  with notes on change files, packages, tests and workflows. Lint, format, types, tests and change files are CI's, so
  its own linters are off. It needs the CodeRabbit app installed on betterapps-hq.
- **Force pushes to `main`, deleting it and bypassing the ruleset aren't allowed,** and GitHub's secret scanning and
  push protection stay on.

## Versions: Beachball change files

This is how Buildkit and the agency monorepo already release, and you asked for it on 2026-10-29 (PAR-4).

- **A change to a versioned package carries a change file** saying the bump type and a line for the changelog.
  `pnpm changefile --type patch --message "…"` writes the missing ones without prompting, so sessions can. The hooks
  check them with `scripts/changes.ts`, from what's staged or committed, and CI also runs `beachball check`, which
  counts the working tree and so only suits a clean checkout.
- **What's versioned:**
  - **The CLI is published** to npm.
  - **The desktop app is versioned but not published.** Beachball bumps it and writes its changelog, which the desktop
    release reads.
  - **The workspace packages the CLI and the app bundle stay `private`,** in their `devDependencies`. Beachball ignores
    private packages, so `scripts/changes.ts` asks for a change file on the app or the CLI when one they bundle changes,
    following private packages through each other.
  - **Everything else stays `private` too:** the example project, the fixtures and anything not shipped.
- **Beachball 2.66 understands pnpm's `workspace:` and `catalog:` versions,** and treats a catalog change as a change to
  the packages that use it.
- **A release PR, then delivery,** as Buildkit does it (PAR-10): after CI passes on `main`, pending change files open a
  pull request with `beachball bump`'s versions and changelogs, which merges itself once its checks pass. Its version
  changes start the CD pipelines. Sessions pull before they push, so they pick up the release commits.
- **Every merged release PR ships,** the CLI to npm and the app to GitHub Releases, as Buildkit's packages do. The app
  goes to the beta, and reaches everyone only when it's promoted (see Betas), so how often release PRs merge doesn't
  decide how often people's Parity changes.

## npm packages

- **The CLI is the published package** (PAR-13), which you settled on 2026-10-29. `vp pack` builds it into one package
  that bundles the workspace packages it uses, listed as `devDependencies` so they aren't installed separately, and
  ships its skills and registry files. Later, the extension SDK [extensions.md](extensions.md) describes would be a
  second.
- **It's `@parity-app/cli`,** since the `@parity` scope on npm belongs to Parity Technologies (`@parity/api`,
  `@parity/abi`). You created the `parity-app` organization on 2026-10-29 (PAR-26). Its command is still `parity`. It
  has that name in the repository too, since `publishConfig` can't rename a package. The private workspace packages
  share the scope, so every package is `@parity-app/*` (PAR-425).
- **Publishing uses npm's trusted publishing,** with provenance and no token: `pnpm publish --provenance` from a job
  with `id-token: write` in a protected `npm` environment, as Buildkit's `publish.yml` does (PAR-14). npm checks the
  _top-level_ workflow's file name, not a reusable one it calls, so each repository registers its own `cd-npm.yml` on
  npmjs.com. npm only trusts a workflow for a package that exists, so the first version is published by hand, then
  `npm trust github @parity-app/cli --repo betterapps-hq/parity --file cd-npm.yml --env npm --allow-publish` hands it to
  CI.
- **Only packages with a `publishConfig` are published,** which the CLI gets with its npm name. The desktop app isn't
  private, since Beachball versions it, so `private` alone can't tell the publish step what goes to npm.

## CI

- **The shared CI template runs `pnpm verify`** on an operating system matrix (PAR-2): Ubuntu, Windows and macOS for
  Parity, since a public repository's runners are free on all three and Parity is developed on Windows. It sets up Vite+
  through `voidzero-dev/setup-vp`, pinned to an exact release, since its docs say the `v1` tag no longer gets updates.
- **Parity's own steps go before it:** installing the fixture projects with npm, Yarn and Bun
  (`pnpm --filter @parity-app/fixtures install-projects`), cached on their lockfiles. Without them `detection.test.ts`
  fails.
- **Pull requests also run `beachball check`.**
- **A newer push cancels the run before it.** Release and deploy runs never cancel.
- **Dependabot opens a weekly PR** for npm minor and patch updates, grouped, and one for Actions, which also keeps the
  shared pipelines' pinned versions current (PAR-394). It waits out a cooldown longer than pnpm's minimum release age,
  and its pull requests need no change file, since Beachball's config ignores manifests on its own pull requests.

## Desktop releases

1. **A production build** (PAR-8): the renderer through `vp build`, the main, utility, preload and worker bundles, and
   the main process loading the built files when packaged.
2. **Unsigned installers with electron-builder** (PAR-9): NSIS for Windows, a DMG for macOS (arm64 and x64) and an
   AppImage for Linux, with Parity's name, icon and version. The utility process needs TypeScript 6 at runtime with its
   `lib.*.d.ts` files on disk, so it ships unbundled and outside the asar archive. Everything else is bundled, which
   keeps pnpm's symlinked `node_modules` out of the package.
3. **cd-desktop** (PAR-11): when a release PR raises the desktop app's version on `main`, it builds the installers on
   all three systems and publishes them as a GitHub pre-release tagged `v<version>`, the form electron-updater reads,
   with the app's changelog and the update metadata. The tldraw licence key comes from a repository secret, and signing
   steps skip with a notice until their secrets exist.
4. **Promotion** (PAR-12): run by hand with a version, it marks that pre-release a full release, so it reaches everyone.
   See Betas.
5. **Only the desktop app makes GitHub Releases.** electron-updater reads the repository's releases, so a CLI release
   there could look like an app update. npm packages keep their changelogs in `CHANGELOG.md`.
6. **Signing later** (PAR-399): Windows through Azure Artifact Signing, macOS with a Developer ID and notarization.

Unsigned, Windows SmartScreen warns on first run, and macOS blocks the app until it's allowed in System Settings >
Privacy & Security. macOS can't update an unsigned app in place either, so updates on macOS (PAR-160) wait for PAR-399;
Windows and Linux can update unsigned.

## Betas

You asked on 2026-10-29 for beta builds and production releases, promoted the way the web apps go from staging to
production.

- **Every release is a beta first.** cd-desktop publishes it as a GitHub pre-release. Parity with Get beta updates on
  (PAR-160) takes pre-releases too, through electron-updater's `allowPrerelease`; everyone else only takes full
  releases. The beta is a setting, not a second app, so one build serves both.
- **Promoting reuses the release** (PAR-12). `cd-desktop.yml`, run by hand with a version, waits for approval in a
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

- **Each pull request gets builds to try** (PAR-400): the CLI through pkg.pr.new, installable with `npx` from the URL it
  comments, and the unsigned installers as the run's artifacts, linked from a comment.
- **Parity's UI gets a web preview too** (PAR-113): its Storybook, built as a static site and deployed to Cloudflare
  through the shared `publish-storybook` template to the preview environment, linked from the same comment and removed
  when the pull request closes. It runs the real interface against the stand-in service in `stories/host.ts`, so a
  change can be seen without installing anything. It isn't the whole app: the project service needs Node for files, each
  project's Vite and the agent, so breakage only the desktop app has is the installers' to catch.
- **The static build needs the example's frames first** (PAR-111). Stories load the example's guest module from
  Storybook's Vite dev server, which a static build doesn't have, so the build emits it as a file.
- **Pull requests from forks get no deployed preview,** since they can't use the Cloudflare secret.
- **Web apps in other repositories get a deployed preview per pull request,** removed when it closes, as Copacker, Spawn
  and the HOA app do today, through the `preview-web` template.

## Shared pipelines

You asked on 2026-10-29 for one repository of pipelines that Parity, Buildkit, Better Apps and Copacker all use, built
from discrete templates, with a pipeline per stage rather than one that does everything. Each repository has its own
`setup` action, `verify` workflow and release flow today, written separately.

**Each repository keeps thin top-level pipelines, one per stage, and only the ones it needs:**

| Pipeline              | Runs on                                              | Calls                                                                                         |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ci.yml`              | pull requests and `main`                             | `ci-verify`, plus the repository's own extra jobs                                             |
| `preview.yml`         | pull requests                                        | `preview-npm`, `preview-desktop`, `preview-web`, or `publish-storybook` to `preview`          |
| `preview-cleanup.yml` | a closed pull request, and a schedule                | `preview-web-cleanup` or `unpublish-storybook`                                                |
| `release.yml`         | CI passing on `main`                                 | `release-prepare` and `release-merge`, Beachball's PR                                         |
| `cd-npm.yml`          | a published package's version changing               | `cd-npm-publish`; this file is npm's trusted publisher                                        |
| `cd-desktop.yml`      | the desktop app's version changing, then a promotion | `cd-desktop-build` and `cd-desktop-release` for the beta, `cd-desktop-promote` for everyone   |
| `cd-web.yml`          | `main`, then a promotion to production               | `cd-web-deploy` for staging, `cd-web-promote` for production, and `publish-storybook` to each |

**`betterapps-hq/pipelines` holds the templates,** with a folder per CI system, as you said on 2026-10-29: `github/`
now, and room for others such as Azure DevOps, which PAR-239's visual tests also target.

- **Composite actions** for steps several templates share, in `github/actions/<name>/action.yml`: `setup` (checkout,
  Node from `.nvmrc`, Vite+ or pnpm, a frozen install and caches), `publishable-packages` and `changed-versions`. Their
  docs are in `github/README.md`.
- **Reusable workflows** (`on: workflow_call`), one job's worth each, are the exception: GitHub only calls a reusable
  workflow from the repository's own `.github/workflows/`, never from another folder or a subfolder. So they live there,
  and the stage is the name's prefix: `ci-`, `preview-`, `release-`, `cd-npm-`, `cd-desktop-`, `cd-web-`. A template any
  stage calls is named for what it does instead, such as `publish-storybook`.
- **Each template documents its inputs, secrets, permissions and an example caller,** and the repository's own CI runs
  each template against a small example workspace.
- **The first templates are `setup` and `ci-verify`** (PAR-110), which Parity's CI (PAR-2) calls first. v1.0.1 has them,
  tested against a pnpm and a Vite+ example workspace on Ubuntu, Windows and macOS.
- **One template publishes Storybook, `publish-storybook`, to whichever environment the caller names.** You publish
  pull-request, staging and production Storybooks often, from many repositories, each to a place of its own, as you said
  on 2026-10-29. The caller's stage picks the environment:
  - `preview.yml` publishes each pull request's Storybook to `preview` as a Worker preview named for it, as the HOA
    app's previews are, and comments its URL. `unpublish-storybook` deletes it when the pull request closes.
  - `cd-web.yml` publishes to `staging` from `main` and to `production` on promotion.
- **Where an environment's Storybook goes is that GitHub environment's settings,** which Terraform writes: the Worker's
  name and URL, the account and a token. A new destination is a new environment, and production can wait for an
  approval, as GitHub environments can.
- **It publishes what it builds, or a Storybook an earlier job built,** so staging and production can get the same
  build.

**Cloud services come from Terraform,** as you said on 2026-10-29. Nothing a pipeline needs is made by hand or by the
pipeline itself:

- **Each repository that needs a cloud service has a Terraform project in `infra/`,** with its state in R2 and Terraform
  and the Cloudflare provider at Copacker's versions.
- **`betterapps-hq/pipelines` holds the modules,** in `terraform/`, beside the templates that need them. The first,
  `cloudflare-storybook`, makes a static-assets Worker for each environment a repository publishes Storybook to, with a
  custom domain where one is given, an API token that can deploy Workers, and each GitHub environment's variables and
  secret that `publish-storybook` reads.
- **So the templates only deploy.** They take names and tokens from the variables and secrets Terraform wrote, and skip
  with a notice when those don't exist yet.

**Rules:**

- **It's public.** Callers span `AndrewCraswell/*` and `betterapps-hq/*`, and a private repository's workflows can only
  be called from its own owner.
- **Callers pin a full commit SHA,** with the version in a comment, and Dependabot moves the pins. Buildkit already
  calls its merge workflow this way, so a pull request can never run a changed copy.
- **Templates call their own actions by full path and release tag.** In a reusable workflow, `./` means the caller's
  repository.
- **Secrets are passed by name,** never `secrets: inherit`, and each job asks for the least permissions it needs.
- **CI is shared as far as `pnpm verify` goes.** Jobs only one repository has, such as Buildkit's database servers or
  Copacker's end-to-end tests, stay in that repository's `ci.yml` beside the call.

## From the agency monorepo

The agency monorepo (`D:\agency`) is set up the same way. What Parity takes from it:

- **Checks on commit and push,** never bypassed (PAR-3).
- **Beachball change files** (PAR-4), which Buildkit uses too.
- **Dependabot, cancelling superseded CI runs, and release steps that skip with a notice** when their secret is missing
  (PAR-2, PAR-394, PAR-11).
- **knip for unused files, dependencies and exports** (PAR-395), which matters more as code moves into packages.
- **Its stricter lint rules** (PAR-396), without `curly` (2,623 hits: Parity writes one-line `if (x) return`),
  `no-console` (the CLI and scripts print) and `no-bitwise`. They flagged 278 places, 169 of them nested ternaries, all
  fixed when the rules went on.
- **pnpm's `verifyDepsBeforeRun: error`,** so a script stops when another session changed the dependencies without
  installing them, and **shared versions in a pnpm catalog** (both in PAR-1).
- **Editor settings in `.vscode`:** the oxc extension formatting on save, and TypeScript's native preview (PAR-1).
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

1. PAR-1, the Vite+ configuration, with PAR-5's rule moving into `lint.overrides` if PAR-5 has landed. Meanwhile the
   pipelines repository gets its first templates, `setup` and `ci-verify`, in a session of its own.
2. PAR-2, CI through the shared template, PAR-3, checks on commit, and PAR-4, change files. PAR-393 when sessions are
   quiet.
3. PAR-397, a README and licence, then PAR-398, the repository on GitHub, once CI passes on a clean checkout.
4. PAR-10, the release PR, then PAR-8, PAR-9, PAR-11 and PAR-12, the first unsigned desktop release and its promotion.
   PAR-13 and PAR-14, the CLI on npm, once PAR-26 names it.
5. PAR-400, previews, then PAR-394, PAR-395 and PAR-396 whenever there's room. PAR-399 when signing is set up.
