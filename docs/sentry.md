# Sentry

Where Parity's own telemetry goes, how Sentry is set up for it, and what was done by hand. The plan for what's sent is
[proposals/product-telemetry.md](proposals/product-telemetry.md), and the calls are in
[decisions.md](decisions.md#sentry-is-set-up-in-better-apps-by-hand-par-617). What it all collects, and who sees it, is
in [proposals/telemetry-coverage.md](proposals/telemetry-coverage.md).

## The organisation

- **Organisation:** [better-apps](https://better-apps.sentry.io/), in Sentry's US region, owned by
  `admin@betterapps.io`. Its only member is that account; people's own accounts aren't members.
- **Plan:** a 14-day Business trial, started on 2026-11-05, so a second member could be added during the handover. When
  it ends on 2026-11-19, the organisation drops to the free Developer plan unless it's upgraded.
- **Team:** `parity`, which owns every project below.

## Projects

Each surface has its own project, so its releases, quotas and alerts stay apart. DSNs are public by design: they only
let a client send events, so they live here, and in each surface's build config once it adds Sentry's SDK.

| Project            | What sends to it                                      | DSN                                                                                               |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `parity-desktop`   | The Electron app: main, windows, the service, workers | `https://1367d69a56a94bcd328db394a4a5a2d4@o4512381874274304.ingest.us.sentry.io/4512381906190336` |
| `parity-cli`       | The `parity` CLI and its MCP server                   | `https://65d0cf052034375c83fb8f442e40e7f8@o4512381874274304.ingest.us.sentry.io/4512381906255872` |
| `parity-web`       | Parity's web app                                      | `https://79f6a3f6a9ac82ce8e9afb77d1e7dfbd@o4512381874274304.ingest.us.sentry.io/4512381906386944` |
| `parity-dashboard` | The dashboard site                                    | `https://511064c456cb0b3c31754b26b440b523@o4512381874274304.ingest.us.sentry.io/4512381906452480` |
| `parity-api`       | Parity's API                                          | `https://56d4bb2b70a4a7321c489e7faf0c0111@o4512381874274304.ingest.us.sentry.io/4512381906518016` |

Only `parity-desktop` and `parity-cli` have code in this repository. The other three wait for their surfaces.

## Environments

Every event is tagged with one environment. Sentry creates an environment the first time an event names it, so there's
nothing to set up ahead of the SDKs. `telemetryEnvironment` in `@parity-app/telemetry` decides it for the app and the
CLI.

| Environment   | What sends it                                                              |
| ------------- | -------------------------------------------------------------------------- |
| `development` | `pnpm dev`, agents' drives through `drive.ts`, and the CLI from a checkout |
| `ci`          | Anything run where `CI` is set, whatever the build                         |
| `preview`     | A pull request's preview installer, and the CLI from pkg.pr.new            |
| `release`     | The app the release workflow published, and the CLI `npm publish` made     |
| `production`  | A published app or CLI that's been promoted to everyone                    |

Until 2026-11-09, `preview` and `release` were one environment, `tester` (PAR-778). Events from before then keep it.

`production` is the app's GitHub release once it's no longer a pre-release (PAR-779). Promotion doesn't rebuild the app,
so it learns it was promoted from GitHub: it asks as it starts, saves the answer in `installed-build.json`, and reports
`production` from its next start. The first start of a newly promoted version reports `release`. No build has been
promoted yet, so Sentry hasn't seen `production`, and the monitors that watch it can't be made until it has.

The CLI's `production` is a version that's been npm's `latest` (PAR-799). Every merge publishes the CLI to `next`, and
approving `cd-npm.yml`'s Production job moves `latest` to it. The CLI's sender asks npm after it sends, saves the answer
in `~/.parity/installed-cli.json`, and the next command reports `production`. A version that was `latest` stays
`production` after a newer one is promoted.

`ci` sends only errors and reports, with their breadcrumbs: no spans, logs or replays (PAR-777). Those stay in the run's
local copy, which the end-to-end suite checks. CI sent 718,000 of `parity-desktop`'s 794,000 spans in the week to
2026-11-09, which would have run past every plan's 5 million spans a month. So a CI test pass shows in Sentry only
through its errors. Its spans and logs are in the `telemetry-github-<run>-<attempt>` artifact of its App tests run, kept
for 7 days; [telemetry.md](telemetry.md#checking-it-in-the-end-to-end-tests) says how to read it (PAR-785).

## Releases and source maps

Each build names its release, so an event points at the code that had the bug, and its stack trace resolves to Parity's
source. The calls are in [decisions.md](decisions.md#every-build-is-a-sentry-release-with-its-source-maps-par-625).

| Build                                   | Release                 | Source maps                                                       |
| --------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| Published app (`release`, `production`) | `parity-desktop@0.21.0` | Uploaded by `cd-desktop.yml`'s Source maps, once it's public      |
| Preview installers (`preview`)          | The commit's full hash  | Uploaded by `preview.yml`'s Source maps                           |
| CI's app (`ci`)                         | The commit's full hash  | Uploaded by `ci.yml`'s Upload source maps, from the Windows build |
| `pnpm dev` (`development`)              | The commit's full hash  | Read locally: stacks are resolved before they're sent             |
| Published CLI (`release`, `production`) | `parity-cli@0.27.1`     | Uploaded by `cd-npm.yml`'s Source maps, once it's on npm          |
| CLI preview on pkg.pr.new (`preview`)   | The commit's full hash  | Not uploaded                                                      |
| CLI from a checkout (`development`)     | The commit's full hash  | Not uploaded                                                      |

- **`pnpm build`** writes hidden source maps for main, the preload script, the service, its workers and the windows.
  **The CLI's `vp pack`** writes them for its bundles. Both then run `separateSourceMaps` in
  [scripts/sourcemaps.ts](../scripts/sourcemaps.ts), which gives each bundle a debug ID with
  `sentry-cli sourcemaps inject` and moves the maps, with a copy of their bundles, to the package's `sourcemaps/`
  (`apps/desktop/sourcemaps/`, `packages/cli/sourcemaps/`). The installer and the npm package ship no maps.
  `sourcemaps/build.json` records the version and commit.
- **`node scripts/upload-sourcemaps.ts <package> --project <name> [--published] [--link-commits]`** creates the release,
  uploads the package's `sourcemaps/` to that Sentry project and finalizes it: `apps/desktop` to `parity-desktop`,
  `packages/cli` to `parity-cli`. `--link-commits` then ties the release to its commit in `betterapps-hq/parity`, which
  suspect commits and "resolved in the next release" use. A link that fails is a warning, not a failed upload: until
  2026-11-09 it ran first and failed every time, with Sentry answering "Unknown repo 'betterapps-hq/parity'", so no
  build from main and no published one had its maps uploaded.
- **`node scripts/check-release.ts <release>`** asks Sentry for the release's summary and fails when it has no source
  maps or no linked commits, or doesn't exist (PAR-774). After a published version's upload, `upload-sourcemaps.yml`
  runs it as Check the release in Sentry, so `cd-desktop.yml` and `cd-npm.yml` fail when the upload's commit link only
  warned: until 2026-11-09 that warning went unseen on every published build. It asks 6 times, 10 to 50 seconds apart,
  about 2.5 minutes in all, while Sentry processes the upload: 3 tries over 30 seconds missed `parity-cli@0.31.0`'s maps
  (PAR-803). It only reads, so it can be run against any release with `SENTRY_AUTH_TOKEN` set. Releases named by a
  commit, for previews and CI, aren't checked.
- **Electron's native crashes** are symbolicated by Sentry's built-in Electron, Apple and Microsoft symbol servers,
  which `parity-desktop`'s Settings > Debug Files had on from the start, as Sentry does for an Electron project.
- **Pull requests' preview installers** are named by their commit, so they stay out of a published version's release.
  The shared preview template builds them without Sentry's token, so `preview.yml`'s Source maps builds the same commit
  again, with the same tldraw key, and uploads its maps. CI's upload of that commit doesn't cover them: CI builds
  without the key, which changes the window's bundles.
- **The shared templates build without Sentry's token,** so each upload after one goes through
  [upload-sourcemaps.yml](../.github/workflows/upload-sourcemaps.yml): it builds the commit or tag again on Ubuntu with
  the template's command and runs `scripts/upload-sourcemaps.ts`. Each debug ID comes from its bundle and its map, and
  the build is the same on every system, so the maps match what the template built. That needs every system to name
  `node_modules/.pnpm`'s folders alike, which `virtualStoreDirMaxLength` in `pnpm-workspace.yaml` sees to: pnpm's own
  default is shorter on Windows, and the maps list those paths.
- **The CLI's release comes from `dist/build.json`,** which `vp pack` writes beside the bundles: only the build
  `npm publish` makes (its `prepack`) is `parity-cli@<version>`. A pkg.pr.new preview or a checkout's own `dist` is
  named by the commit it was built from, and a checkout run from source by its current commit.
- **`cd-npm.yml` builds the published CLI again from its tag** (`@parity-app/cli_v<version>`), and `cd-desktop.yml` the
  published app from `v<version>`, to upload their maps.
- **Each event's `dist`** is the platform and architecture, such as `win32-x64`, and an installed build's events carry
  `update_channel`, `stable` or `beta`.

## Integrations

- **Linear** is installed for the Better Apps workspace, so alert rules can file issues in PAR and resolving one side
  resolves the other.
- **GitHub** is installed for `betterapps-hq`, for commits in releases, suspect commits and stack trace links. Sentry
  adds each repository the GitHub app can see to Settings > Repositories, and `sentry-cli releases set-commits` fails
  with `Unknown repo` for one missing there. The app can see every `betterapps-hq` repository; releases link
  `betterapps-hq/parity` (PAR-768).
- **Sentry's MCP server** is how agents read an issue's events, trace and replay. `.mcp.json` and `.codex/config.toml`
  give it to every session in this repository, scoped to `better-apps`, and it signs in with OAuth, as
  `admin@betterapps.io`. Picking up a bug with it is in [work.md](work.md#bugs-from-sentry).

## Alerts

Three alerts file Linear bugs. Each has one action, Linear's "Create a Linear issue": team Parity, project Parity,
status Todo, label Bug, no priority. The calls behind them are in
[decisions.md](decisions.md#sentry-files-linear-bugs-par-622) and
[decisions.md](decisions.md#sentry-watches-agent-failures-and-crash-free-sessions-par-643).

| Alert                                                                                               | Fires on                                   | For                                                 | At most        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- | -------------- |
| [File new issues and regressions in Linear](https://better-apps.sentry.io/monitors/alerts/6301645/) | A new issue, or a resolved one coming back | Every issue but user feedback, from desktop and CLI | Once in 30 min |
| [File user feedback in Linear](https://better-apps.sentry.io/monitors/alerts/6301647/)              | A new issue                                | User feedback, from desktop and CLI                 | Every time     |
| [File monitor breaches in Linear](https://better-apps.sentry.io/monitors/alerts/6310188/)           | A monitor's issue opening, or coming back  | The metric monitors below that are connected to it  | Once in 30 min |

### Metric monitors

A metric monitor opens a Sentry issue while its number is past its threshold and resolves it once it's back, and the
alert above files that issue in Linear.

**Only `production` alerts,** and nothing sends it until Parity is public, so no monitor is on. Development, CI and
testers' builds are watched on the [dashboards](#dashboards) instead. The monitors on-call gets once `production` sends,
with their thresholds, are in [proposals/on-call-health.md](proposals/on-call-health.md#the-monitors), and PAR-779 makes
them.

| Monitor                                                                         | Project          | Watches                                                                                      | State                                      |
| ------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [Agent calls failing over 5%](https://better-apps.sentry.io/monitors/10889795/) | `parity-desktop` | `failure_rate()` of spans with `span.op:agent.called`, every environment, over the last hour | Off since 2026-11-09, until PAR-779        |
| Crash-free sessions under 99% in production (PAR-714)                           | `parity-desktop` | A crash-free session rate, environment `production`, over the last hour                      | Not made: waits for `production` (PAR-779) |

What a filed issue carries:

- **The title is the Sentry issue's.** For user feedback, Sentry writes a short summary of the message.
- **The description is empty.** The Sentry link is attached to the Linear issue, and the release, environment and
  `test_run` of each event are in the Sentry issue it points to, read through Sentry's MCP server. Linear's action has
  no description field, and putting them on the bug would take code of its own (PAR-668).
- **The two are linked both ways.** The Sentry issue lists the Linear one under its linked issues. Resolving the Sentry
  issue closes the Linear one, and closing the Linear issue resolves the Sentry one in the next release.
- **There's one Linear issue per Sentry issue.** A regression reopens the linked Linear issue in Todo rather than filing
  another, even when the alert fires on it. Linear reopens it in the Parity team's default status, so Todo is the
  default, set in Linear's team settings under Statuses.
- **Linear's "in the next release" is literal.** Events from the release the bug was closed in, and from the next
  release Sentry sees, count as fixed and don't reopen it.

Errors thrown on purpose, such as a check that Sentry receives them, file bugs too, since they're new issues. Close each
one when the check is done, and say in it that it was a test.

Sentry's own defaults stay as they are: each project's "Send a notification for high priority issues" and the
organisation's "Send a notification when pull requests are ready" email `admin@betterapps.io`.

## Dashboards

Four dashboards, each answering one question on-call asks. What each widget reads, and why, is in
[proposals/on-call-health.md](proposals/on-call-health.md#the-dashboards).

| Dashboard                                                                          | Answers                                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [Parity](https://better-apps.sentry.io/dashboard/10723054/)                        | Is anything wrong right now? On-call's first stop        |
| [Parity performance](https://better-apps.sentry.io/dashboard/10723055/)            | Is anything slow? p50, p95 and p99 of each measured step |
| [Parity workflows](https://better-apps.sentry.io/dashboard/10723056/)              | Which step of a workflow is failing, and why?            |
| [Parity releases and telemetry](https://better-apps.sentry.io/dashboard/10723057/) | Is the latest build healthy, and is the data coming in?  |

- **Every dashboard covers all of `better-apps`' projects,** with environment and release filters that narrow every
  widget at once, starting at the last 7 days. Sentry won't let a dashboard pick projects its maker isn't a member of,
  and `admin@betterapps.io` is an owner but not a member of the `parity` team. `parity-web`, `parity-dashboard` and
  `parity-api` join them once they send.
- **Where events land decides each widget's dataset:** errors are Sentry errors, spans are Sentry spans with `span.op`
  the span's name and its attributes as they are, and other events are Sentry logs with `message` the event's name. A
  numeric attribute in a logs widget is picked as a number, as `durationMs`, which the API writes as
  `tags[durationMs,number]`. An attribute sent as an object, such as `process.memory`'s `processes`, is kept as a JSON
  string and can't be charted (PAR-772).
- **They were made through Sentry's own API from the browser,** signed in as `admin@betterapps.io`, on 2026-11-09, since
  Sentry's MCP server can't create dashboards and agents have no token that can. To change one, edit it in Sentry's UI,
  or, from a page on `better-apps.sentry.io`, `PUT /api/0/organizations/better-apps/dashboards/<id>/` with the
  `sentry-sc` cookie as `X-CSRFToken`.
- **PAR-643's eight widgets are all in them:** the crash-free rate, top errors and test passes on Parity; p95 of
  rendering, agent calls, opening and saving on Parity performance; and project open failures, agent error codes and
  interrupted gestures on Parity workflows.

## Secrets

- **`SENTRY_AUTH_TOKEN`** on `betterapps-hq/parity` is the `parity-ci` organisation token, scoped to `org:ci`: uploading
  source maps and debug files, and creating releases. Builds don't need it to send events.

## Done by hand

None of this is in Terraform yet. The pipelines' Terraform templates only pass Cloudflare, GitHub and Neon credentials,
so a Sentry module needs them to take a Sentry token first. Until then, these were done in Sentry's UI:

1. Created the organisation, the `parity` team and the five projects, which made each project's default DSN.
2. Moved ownership to `admin@betterapps.io`: it asked to join, was approved as Owner, and the personal account left.
3. Started the Business trial, which raised the one-member limit for the handover.
4. Installed the Linear integration from Settings > Integrations > Linear, approved in Linear.
5. Installed the GitHub integration from Settings > Integrations > GitHub > Add Installation, on 2026-11-08 (PAR-768).
   An earlier attempt never finished, so Sentry had no repositories. GitHub's authorization ran in a popup, and the
   first pass ended with "Integration does not exist". Starting again from step 1 and choosing `betterapps-hq` linked
   it, and Sentry then added the organisation's repositories itself.
6. Created the `parity-ci` organisation token and stored it with `gh secret set SENTRY_AUTH_TOKEN`.
7. Created the two alerts above with Sentry's MCP server, signed in as `admin@betterapps.io`. Linear's action takes
   Linear's ids: team `ffa6e3c4-91d5-4501-868e-a7a7a797e256`, project `84f1963b-e7c0-4ee8-9f3b-0a23cddd3714`, Todo
   `141b0d67-7506-4a2a-91b9-c77117d7204f` and Bug `a6475d27-8132-4225-88de-b7f0c2d09177`.
8. Made Todo the Parity team's default status in Linear, under Settings > Teams > Parity > Statuses, so regressions
   reopen there (PAR-668). It was Backlog.
9. Created the monitor "Agent calls failing over 5%" and the alert "File monitor breaches in Linear" with Sentry's MCP
   server, on 2026-11-08, with the same Linear action.
10. Created the four [dashboards](#dashboards) on 2026-11-09, and turned "Agent calls failing over 5%" off, since only
    `production` alerts (PAR-716).
11. Turned on "Prevent storing of IP addresses" under Security & Privacy in `parity-desktop` and `parity-cli`, on
    2026-11-09 (PAR-619). Sentry still works out each event's location from the address, so the country stays.

PAR-658 brings all of this into Terraform in `infra/sentry`, which the Sentry provider supports for monitors, alerts and
dashboards.

## Still to do

1. **Make the on-call monitors (PAR-779)** once public builds send `production`, the crash-free monitor (PAR-714) among
   them, and turn "Agent calls failing over 5%" on again for `production`.
