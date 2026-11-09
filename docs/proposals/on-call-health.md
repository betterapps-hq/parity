# Proposal: what on-call watches

Status: approved by Andrew on 2026-11-09. The four dashboards are built (PAR-716) and linked in
[sentry.md](../sentry.md#dashboards). The monitors and the proposed issues are tracked in Linear, PAR-771 to PAR-779.

## In one line

Four Sentry dashboards, each answering one question, give whoever is on call the whole of Parity's health across every
process and surface. **Parity** is the one-screen overview, and **Parity performance**, **Parity workflows** and
**Parity releases and telemetry** hold the detail behind it. Metric monitors watch only `production`, once a public
release sends it. Until then, new issues, regressions and reports still file Linear bugs, and everything else waits on
the dashboards for a weekly look. CI sends only its errors and reports, which keeps the plan's quotas.

## What it's built from

Everything below comes from what Parity sends today, as [telemetry.md](../telemetry.md) catalogues it, and from the
setup in [sentry.md](../sentry.md). Nothing here needs code unless it's listed under
[Proposed issues](#proposed-issues).

- **Errors** are Sentry errors in `parity-desktop` and `parity-cli`, tagged `process` (`main`, `renderer`, `render`,
  `service`, `worker`, `builder`), `environment`, `release`, `driver` and `test_run`. Hangs are warnings tagged `hang`:
  `main` when main's loop was blocked for 2 seconds or more, `window` when a window stopped answering.
- **Spans** are Sentry spans, `span.op` the span's name, with `failure_rate()` from their outcome.
- **Events** are Sentry logs, `message` the event's name. A number is read as `tags[<name>,number]`.
- **Sessions** come from `@sentry/electron`'s session tracking in main, so crash-free rates exist for the desktop app.
  The CLI sends no sessions: it starts Sentry without its default integrations.
- **Volume**, from Sentry's stats for `parity-desktop` over the last week: about 300,000 spans, 85,000 logs and 120
  errors a day. Nearly all of it is CI's end-to-end runs. `parity-cli` sent about 500 spans a day. `parity-web`,
  `parity-dashboard` and `parity-api` have sent nothing. No event was dropped.
- **What exists:** the alerts "File new issues and regressions in Linear", "File user feedback in Linear" and "File
  monitor breaches in Linear", one metric monitor ("Agent calls failing over 5%"), and no custom dashboards. The
  dashboards listed in Sentry are its prebuilt ones, which have no widgets.

### Today's numbers

These set the thresholds below. They're the last 7 days, from `parity-desktop`.

| Measure                                    | Environment   | Count   | p50    | p95    | p99    |
| ------------------------------------------ | ------------- | ------- | ------ | ------ | ------ |
| First paint (`app.started` `firstPaintMs`) | `ci`          | 1,043   | 1.1 s  | 7.9 s  |        |
|                                            | `development` | 55      | 5.3 s  | 21.0 s |        |
|                                            | `tester`      | 3       | 1.8 s  | 2.3 s  |        |
| Opening (`project.loaded`)                 | `ci`          | 889     | 2.7 s  | 5.9 s  | 8.9 s  |
|                                            | `development` | 110     | 3.4 s  | 7.7 s  | 18.3 s |
| First frame (`project.drawn`)              | `ci`          | 550     | 4.9 s  | 12.4 s | 14.4 s |
|                                            | `development` | 103     | 6.3 s  | 14.3 s | 20.8 s |
| Saving (`document.saved`)                  | `ci`          | 403     | 54 ms  | 176 ms | 256 ms |
| A frame (`frame.rendered` span)            | all           | 93,410  | 140 ms | 302 ms | 1.9 s  |
| An agent call (`agent.called` span)        | all           | 960     | 30 ms  | 295 ms | 881 ms |
| A service request (`request.handled` span) | all           | 507,784 | 130 ms | 356 ms | 1.9 s  |
| A command (`command.ran` span)             | all           | 82,456  | 0 ms   | 2 ms   | 87 ms  |

Failure rates over the same week: `frame.rendered` 6.6%, `request.handled` 2.1%, `project.opening` 0.26% and
`agent.called` 0.21%. Main was blocked 19 times, 18 of them in CI, and no window hung.

## Severity

Each alert below has one of three severities:

- **Critical:** people are losing work or can't use Parity. The monitor's critical level files an Urgent Linear bug and
  emails `admin@betterapps.io`. Look the same day.
- **High:** a workflow is failing or slow for more than one person or pass. The monitor's warning level files a Linear
  bug with no priority, as "File monitor breaches in Linear" does today. Triage it with the day's other bugs.
- **Watch:** no alert. It's on a dashboard and looked at in the weekly review.

Every monitor connects to "File monitor breaches in Linear", which files both levels. A second alert, "Email critical
monitor breaches", sends the email and sets Urgent for a critical issue.

### Which environments alert

- **Only `production` alerts, and it doesn't exist yet.** `development` is agents' and Andrew's own drives, `ci` is the
  end-to-end suite, which fails renders, opens and saves on purpose, and installed builds are testers'. None of them
  should wake anyone. Sentry refuses a monitor on an environment it hasn't seen, so the monitors in
  [The monitors](#the-monitors) are made once the first public release sends `production` (PAR-779).
- **The issue alerts stay as they are.** "File new issues and regressions in Linear" and "File user feedback in Linear"
  keep filing bugs from every environment, since a new error is worth a look wherever it's found.
- **"Agent calls failing over 5%" is turned off until then.** It watches every environment, `ci` and `development`
  included, so today it files bugs from runs that aren't people's. PAR-779 turns it on again for `production`.
- **The dashboards show every environment,** with its filter, so a slowdown in CI or a tester's build is still seen.
- **Thresholds are set above what development sees today.** Production's own numbers replace them once it has a few
  weeks of them, and its rates replace counts once it sends a few hundred sessions a week.

### The environments

Today `tester` is any installed build. PAR-778 splits it in two, so each can be watched apart:

| Environment   | What sends it                                                      |
| ------------- | ------------------------------------------------------------------ |
| `development` | `pnpm dev`, and agents' drives through `drive.ts`                  |
| `ci`          | CI's end-to-end runs, errors and reports only (PAR-777)            |
| `preview`     | A pull request's preview installer                                 |
| `release`     | The published app and CLI, which testers install                   |
| `production`  | The published app and CLI once Parity is public (PAR-779, PAR-619) |

## Stability

| Signal                         | Comes from                                                                                    | Widget (Parity)                             | Alert                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| Crash-free sessions            | Releases: `crash_free_rate(session)`, by `release`                                            | Crash-free sessions by release (Parity)     | Under 99% in `production` over 1 h: High. Under 97%: Critical. PAR-714 |
| Crash-free users               | Releases: `crash_free_rate(user)`, by `release`                                               | Crash-free users by release (Parity)        | Watch                                                                  |
| Crashes by process             | Errors: `error.handled:false`, `count()` by `process`, `environment`                          | Crashes by process (Parity)                 | Covered by "File new issues and regressions in Linear"                 |
| Native crashes                 | Errors: `error.mechanism:minidump`, `count()` by `process`, `release`                         | Same widget, as its own series              | Same                                                                   |
| Out of memory and lost windows | Errors from `childProcessIntegration`: `abnormal-exit`, `launch-failed`, `oom`, by `process`  | Crashes by process (Parity)                 | Same                                                                   |
| Main's loop blocked            | Errors: `hang:main`, `count()`                                                                | Hangs by process (Parity)                   | 5 or more in 1 h in `production`: High                                 |
| Windows hung                   | Errors: `hang:window`, `count()` by `process` (`renderer` or `render`)                        | Hangs by process (Parity)                   | 3 or more in 1 h in `production`: High                                 |
| Service restarts               | Logs: `message:service.exited`, `count()` by `release`, with `exitCode`, `ranMs`, `restarted` | Service restarts (Parity)                   | 3 or more in 1 h in `production`: High                                 |
| Error volume                   | Errors: `count()` and `count_unique(user)`, by `project`, `environment`                       | Errors over time (Parity)                   | Watch                                                                  |
| Top errors                     | Errors: `count()`, `count_unique(user)` by `issue`, `title`, `release`, `environment`         | Top errors by release and environment       | Watch                                                                  |
| New and regressed issues       | Issues: `is:unresolved firstSeen:-24h`, and `is:regressed`                                    | New issues today, Regressed issues (Parity) | Covered by "File new issues and regressions in Linear"                 |
| Errors people saw              | Logs: `message:error.caught`, `count()` by `action`, `code`                                   | Errors shown, by action (Parity)            | Watch. Each is a Sentry error too, so a new one already files          |

## Performance

All of these are on **Parity performance**, as p50, p95 and p99 lines over time, with the dashboard's environment
filter. Thresholds are p95 over the window named, in `production`, set above what development sees today.

| Signal                   | Comes from                                                                                  | Widget                                | Alert                                           |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| Startup                  | Logs: `message:app.started`, `firstPaintMs`, `windowShownMs`, `serviceReadyMs`              | Startup                               | First paint over 25 s over 24 h: High           |
| First project            | Logs: `message:app.first_project`, `firstProjectMs`, by `restored`                          | Startup                               | Watch                                           |
| Project open             | Logs: `message:project.loaded`, `durationMs`; `project.opened`'s `detectionMs`, `builderMs` | Opening                               | Over 20 s over 6 h: High                        |
| Time to first frame      | Logs: `message:project.drawn`, `durationMs`, by `from`                                      | Time to first frame (PAR-727)         | Over 30 s over 6 h: High                        |
| Renders                  | Spans: `span.op:frame.rendered`, `span.duration`; logs' `queuedMs`, `renderMs`, `captureMs` | Frames, and frame time by part        | Over 2 s over 1 h: High                         |
| Previews                 | Logs: `message:preview.made`, `durationMs`. `bitmapCache.used`'s hit rates wait for PAR-772 | Previews                              | Watch                                           |
| Gestures                 | Logs: `message:gesture.ended`, `p50(fps)` and `count()` by `kind`                           | Gesture frame rate by kind            | Watch                                           |
| Commands                 | Spans: `span.op:command.ran`, `span.duration` by `command`                                  | Slowest commands                      | Watch                                           |
| Saves                    | Logs: `message:document.saved`, `durationMs`                                                | Saving                                | Over 1 s over 1 h: High                         |
| Exports                  | Logs: `message:[export.done,export.failed]`, `p50`, `p95` and `p99` of `durationMs`         | Exporting                             | Watch                                           |
| Agent and MCP calls      | Spans: `span.op:agent.called`, `span.duration` by `method`, `transport`                     | Agent calls by method                 | Over 3 s over 1 h: High                         |
| CLI commands             | Spans in `parity-cli`: `span.op:cli.ran`, `span.duration` by `command`                      | CLI commands                          | Watch                                           |
| Service requests         | Spans: `span.op:request.handled`, `span.duration` by `method`                               | Slowest service requests              | Watch                                           |
| Service loop lag         | Logs: `message:service.lag`, `count()` and `p95(lateMs)`                                    | Event loop lag                        | 20 or more in 1 h in `production`: High         |
| Main loop lag            | Logs: `message:main.blocked`, `count()` and `p95(stuckMs)`                                  | Event loop lag                        | As in Stability                                 |
| Long tasks in the editor | Logs: `message:renderer.long_task`, `count()` and `p95(durationMs)` by `action`             | Long tasks by input                   | Watch                                           |
| Memory                   | Logs: `message:process.memory`. Its `processes` list can't be charted yet (PAR-772)         | Memory by process, once PAR-772 lands | Watch, then main or the service over 2 GB: High |

## Reliability of key workflows

The alerts are counts until `production` sends enough for rates, as
[Which environments alert](#which-environments-alert) says. The overview, Parity, shows each workflow's failures as one
count; this dashboard has the breakdowns.

| Workflow             | Comes from                                                                                                                                 | Widget (Parity workflows)                              | Alert                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Opening projects     | Spans: `span.op:project.opening`, `failure_rate()`; logs: `message:project.openFailed` by `step`, `code`, `framework`, `builder`, versions | Project opens: failure rate, and Project open failures | 5 or more failures in 1 h in `production`: High                                                                                 |
| Unsupported          | Logs: `message:project.unsupported`, `count()` by `reason`                                                                                 | Project open failures                                  | Watch                                                                                                                           |
| Builders             | Logs: `message:builder.crashed` by `builder`, `exitCode`, `signal`; `builder.ready` by `restart`                                           | Builder crashes                                        | 3 or more crashes in 1 h in `production`: High                                                                                  |
| Servers              | Logs: `message:server.failed` by `kind`, `reason`; `server.started`                                                                        | Servers that failed to start                           | Watch                                                                                                                           |
| Renders              | Spans: `span.op:frame.rendered`, `failure_rate()` by `failure`; logs: `message:frame.failed`, `preview.failed` by `reason`                 | Frame failures by why                                  | 5 or more `failure:crashed` in 1 h in `production`: High. `render threw` and `module not found` are the project's own, so Watch |
| Saves                | Logs: `message:document.saveFailed` by `code`; `tokens.saved` and `projectEdit.undone` with `outcome:error`                                | Save failures                                          | 1 in 1 h in `production`: High. 3: Critical                                                                                     |
| Exports              | Logs: `message:export.failed` by `kind`, `code`, beside `export.done`                                                                      | Export failures                                        | Watch                                                                                                                           |
| Agent and MCP calls  | Spans: `span.op:agent.called`, `failure_rate()`; by `method`, `code`, `transport` where `has:code`                                         | Agent error codes by operation                         | Over 5% over 1 h in `production`: High. Over 20%: Critical                                                                      |
| Agent server         | Logs: `message:agent.serverFailed`                                                                                                         | Agent server failures                                  | 1 in 1 h in `production`: High                                                                                                  |
| CLI reaching the app | Logs in `parity-cli`: `message:cli.connectFailed` by `code`; `cli.versionMismatch` by `cause`                                              | CLI connection failures                                | Watch                                                                                                                           |
| Service requests     | Spans: `span.op:request.handled`, `failure_rate()` by `method`, `code`; logs: `message:ipc.failed`                                         | Failed requests by method                              | Watch                                                                                                                           |
| Updates              | Logs: `message:update.failed` by `stage`, `channel`; `update.checked`, `update.downloaded`, `update.installed`                             | Updates: checked, downloaded, installed, failed        | 1 failure in 24 h in `production`: High                                                                                         |
| Data checks          | Logs: `message:data.invalid`, `count()` by `schema`, `pointer`                                                                             | Failed data checks by schema                           | 20 or more in 1 h in `production`: High                                                                                         |
| Editing              | Logs: `message:gesture.ended how:[interrupted,cancelled]` by `kind`, `how`; `clipboard.failed`                                             | Gestures interrupted or cancelled                      | Watch                                                                                                                           |

## Releases

| Signal                  | Comes from                                                                                         | Widget (Parity releases and telemetry) | Alert                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Adoption, desktop       | Releases: `count_unique(user)` and `sum(session)` by `release`, `environment:[release,production]` | Users by release                       | Watch                                                  |
| Adoption, CLI           | Spans in `parity-cli`: `span.op:cli.ran`, `count_unique(user)` by `release`                        | Users by release, as its own series    | Watch                                                  |
| Crash-free by release   | As in Stability                                                                                    | Crash-free sessions by release         | As in Stability                                        |
| A release's new issues  | Issues: `is:unresolved firstRelease:latest`, by project                                            | New in the latest release              | Covered by "File new issues and regressions in Linear" |
| Regressions by release  | Issues: `is:regressed`, by `release`                                                               | Regressed issues                       | Same                                                   |
| Errors by release       | Errors: `count()` by `release`, the latest five                                                    | Top errors by release and environment  | Watch                                                  |
| Source maps and commits | The release's page in Sentry: its artifacts and commits. No dashboard widget can show them         | None: a check per published release    | The release workflow says (PAR-774)                    |

Commit links depend on PAR-768, which adds `betterapps-hq/parity` to Sentry's repositories.

## Reports and feedback

| Signal                | Comes from                                                                                           | Widget (Parity)              | Alert                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Reports sent          | Logs: `message:report.sent`, `count()` by `by` (`person`, `agent`), `afterCrash`                     | Reports by who sent them     | Every report files a bug, by "File user feedback in Linear" |
| User Feedback         | Issues: `issue.category:feedback is:unresolved`, by project                                          | Open feedback                | Same                                                        |
| Reports after a crash | Logs: `message:report.sent afterCrash:true`                                                          | Reports by who sent them     | Watch                                                       |
| Agent test passes     | Errors: `has:test_run`, `count()`, `count_unique(issue)`, `last_seen()` by `test_run`, `environment` | Test passes and their errors | Watch                                                       |

## Telemetry's own health

| Signal                    | Comes from                                                                                            | Where                                            | Alert                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Dropped events            | Sentry's stats: rate limited, over quota, filtered, client discards, by category                      | Settings > Stats. Dashboards can't chart them    | Sentry's spend notifications at 80% and 100% of each quota |
| Quota                     | Settings > Subscription, by category                                                                  | Same                                             | Same                                                       |
| Events sent, by category  | Spans `count()`, logs `count()`, errors `count()` by `project`, `environment`                         | Telemetry volume (Parity releases and telemetry) | Watch                                                      |
| Scrubbing is working      | Nothing in production. Unit tests check the scrubber; a CI canary (PAR-775) was dropped on 2026-11-09 | None                                             | None                                                       |
| The CLI's dropped batches | Nothing yet: a batch a day old is dropped silently, and the CLI sends no client reports (PAR-776)     | Once PAR-776 lands                               | Watch                                                      |

**At today's volume, the free Developer plan's quotas don't last the month.** Every plan includes 5 million spans, 50
replays, 5 GB of logs, one uptime monitor and one cron monitor, and Developer 5,000 errors. Last week CI sent 718,000 of
`parity-desktop`'s 794,000 spans, about 9 million a month between them, and every session's replay is recorded.

- **CI sends only its errors and reports (PAR-777).** Its spans, logs and replays stay in the local copy, which the
  end-to-end suite reads to check events, so its checks keep working. That leaves about 330,000 spans a month, well
  inside the quota, and CI's failures still reach Sentry with their stacks and breadcrumbs.
- **Replays still overrun.** `development` started about 55 sessions last week, so about 240 a month against 50
  included. Lowering `replaySessionRate` for `development`, or paying for replays, is part of the plan choice.
- The plan is Andrew's call, before 2026-11-19.

## Web, dashboard and API

None of these sends anything yet: they wait for their surfaces, and their Sentry projects are empty. When each ships,
its issue adds Sentry's SDK, and a fifth dashboard, **Parity web**:

| Signal                   | Comes from                                                                         | Widget (Parity web)  | Alert                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| Uptime                   | An uptime monitor per public URL, every minute                                     | Uptime               | 3 failed checks in a row: Critical                                            |
| API error rate           | Spans in `parity-api`: `span.op:http.server`, `failure_rate()` by `transaction`    | API errors by route  | Over 1% over 5 min: High. Over 5%: Critical                                   |
| API latency              | Spans in `parity-api`: `span.op:http.server`, `p50`, `p95`, `p99` by `transaction` | API latency by route | p95 over 1 s over 15 min: High                                                |
| Web and dashboard errors | Errors in `parity-web` and `parity-dashboard`: `count()`, `count_unique(user)`     | Errors over time     | Covered once "File new issues and regressions in Linear" takes these projects |
| Page speed               | Web Vitals: `p75` of LCP, INP and CLS by page                                      | Web Vitals           | Watch                                                                         |
| Crash-free sessions      | Releases, as for the desktop app                                                   | Crash-free sessions  | Under 99% over 1 h: High                                                      |

Uptime monitors beyond the first are $1 a month each on any plan.

## The dashboards

Four dashboards, each answering one question. Each covers all of `better-apps`' projects, so `parity-web`,
`parity-dashboard` and `parity-api` join them once they send: `admin@betterapps.io` is an owner but not a member of the
`parity` team, and Sentry won't let a dashboard pick projects its maker isn't a member of.

- **Parity: is anything wrong right now?** On-call's first stop, on one screen: the crash-free pair, Crashes by process,
  Hangs by process, New issues today, Regressed issues, Errors over time, Top errors by release and environment, one
  count of failures per workflow (opens, builders, renders, saves, agent calls, updates, data checks), Reports by who
  sent them, Open feedback and Test passes and their errors. A number here that looks wrong leads to one of the other
  three.
- **Parity performance: is anything slow?** The percentiles: Startup, Opening, Time to first frame, Frames and frame
  time by part, Previews, Gesture frame rate by kind, Slowest commands, Saving, Agent calls by method, CLI commands,
  Slowest service requests, Event loop lag and Long tasks by input.
- **Parity workflows: which step is failing, and why?** The breakdowns in
  [Reliability of key workflows](#reliability-of-key-workflows): Project opens, Project open failures, Builder crashes,
  Servers that failed to start, Frame failures by why, Save failures, Export failures, Agent error codes by operation,
  Agent server failures, CLI connection failures, Failed requests by method, Updates, Failed data checks by schema and
  Gestures interrupted or cancelled.
- **Parity releases and telemetry: is the latest build healthy, and is the data coming in?** Users by release,
  Crash-free sessions by release, New in the latest release, Regressed issues by release, Errors by release, Telemetry
  volume (spans, logs and errors sent, by environment).
- **Parity web** waits for those surfaces, as [Web, dashboard and API](#web-dashboard-and-api) says.

PAR-643's eight widgets are each in one of the four, so "Parity" in sentry.md becomes this set. PAR-727's widget is Time
to first frame, so PAR-727 closes with this.

Each dashboard's environment and release filters narrow every widget at once, and each starts at the last 7 days. Every
widget was checked against live data as it was made. Two planned widgets were left out, since Sentry can't read what
they need:

- **Bitmap cache hit rate:** `bitmapCache.used` sends `frames` and `previews` as objects, which Sentry's logs keep as
  JSON strings, so their rates can't be charted. PAR-772 flattens them.
- **Secrets scrubbed:** a log's attributes can't be searched for `[redacted]` across every attribute. Nothing replaces
  it: the CI canary planned for that (PAR-775) was dropped on 2026-11-09.

## The monitors

Made once `production` sends (PAR-779), each connected to "File monitor breaches in Linear". None is made with this
issue.

| Monitor                                      | Project          | Query and aggregate                                                              | Window | High      | Critical  |
| -------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- | ------ | --------- | --------- |
| Crash-free sessions (PAR-714)                | `parity-desktop` | Sessions, crash-free rate, `environment:production`                              | 1 h    | Under 99% | Under 97% |
| Agent calls failing (exists, turned off now) | `parity-desktop` | `span.op:agent.called environment:production`, `failure_rate()`                  | 1 h    | Over 5%   | Over 20%  |
| Saves failing                                | `parity-desktop` | Logs `message:document.saveFailed environment:production`, `count()`             | 1 h    | 1         | 3         |
| Project opens failing                        | `parity-desktop` | Logs `message:project.openFailed environment:production`, `count()`              | 1 h    | 5         |           |
| Render windows crashing                      | `parity-desktop` | Spans `span.op:frame.rendered failure:crashed environment:production`, `count()` | 1 h    | 5         |           |
| Builders crashing                            | `parity-desktop` | Logs `message:builder.crashed environment:production`, `count()`                 | 1 h    | 3         |           |
| Agent server down                            | `parity-desktop` | Logs `message:agent.serverFailed environment:production`, `count()`              | 1 h    | 1         |           |
| Updates failing                              | `parity-desktop` | Logs `message:update.failed environment:production`, `count()`                   | 24 h   | 1         |           |
| Main blocked                                 | `parity-desktop` | Errors `hang:main environment:production`, `count()`                             | 1 h    | 5         |           |
| Windows hung                                 | `parity-desktop` | Errors `hang:window environment:production`, `count()`                           | 1 h    | 3         |           |
| Service lagging                              | `parity-desktop` | Logs `message:service.lag environment:production`, `count()`                     | 1 h    | 20        |           |
| Data checks failing                          | `parity-desktop` | Logs `message:data.invalid environment:production`, `count()`                    | 1 h    | 20        |           |
| Opening slow                                 | `parity-desktop` | Logs `message:project.loaded environment:production`, `p95(durationMs)`          | 6 h    | Over 20 s |           |
| First frame slow                             | `parity-desktop` | Logs `message:project.drawn environment:production`, `p95(durationMs)`           | 6 h    | Over 30 s |           |
| Saving slow                                  | `parity-desktop` | Logs `message:document.saved environment:production`, `p95(durationMs)`          | 1 h    | Over 1 s  |           |
| Frames slow                                  | `parity-desktop` | Spans `span.op:frame.rendered environment:production`, `p95(span.duration)`      | 1 h    | Over 2 s  |           |
| Agent calls slow                             | `parity-desktop` | Spans `span.op:agent.called environment:production`, `p95(span.duration)`        | 1 h    | Over 3 s  |           |
| Startup slow                                 | `parity-desktop` | Logs `message:app.started environment:production`, `p95(firstPaintMs)`           | 24 h   | Over 25 s |           |

The monitors that wait on missing signals (service restarts, memory) are made with their issues. "Email critical monitor
breaches" is one new alert, for the critical levels, made with PAR-779.

## Proposed issues

Each of these is a Linear issue in the Product telemetry stream, filed on 2026-11-09.

| #       | Issue                                                                                          | Why                                                                                                                                                                                                  | Pts |
| ------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| PAR-771 | Record the service restarting, windows hanging and main's loop blocked as events with how long | A service restart is only a breadcrumb, so it can't be counted. Hangs are Sentry messages whose `stuckMs` is in `extra`, which can't be searched or charted                                          | 2   |
| PAR-772 | Record memory and the bitmap cache as numbers Sentry can chart                                 | `process.memory` and `bitmapCache.used` send objects, which Sentry's logs keep as JSON strings. One number per role (`main`, `service`, `editor`, `render`, `total`) and per hit rate can be charted | 2   |
| PAR-773 | Time exports in `export.done` and `export.failed`                                              | Neither has a duration, so export latency can't be measured                                                                                                                                          | 1   |
| PAR-774 | Check each published release has its source maps and commits in Sentry                         | An upload or commit link that fails is a warning today, and until 2026-11-09 every one failed unnoticed. The release workflow should fail, or file a bug                                             | 2   |
| PAR-775 | ~~Put a canary secret through CI's end-to-end run and alert if Sentry ever sees it~~           | Dropped by Andrew on 2026-11-09, and canceled. Scrubbing stays checked by unit tests only                                                                                                            | 2   |
| PAR-776 | Count the CLI's dropped outbox batches and send them with the next batch                       | A batch a day old is dropped silently, and the CLI turns client reports off, so its losses don't show in Sentry's stats                                                                              | 1   |
| PAR-777 | Send only errors and reports from CI, and keep its spans, logs and replays in the local copy   | CI sends 90% of the spans, which runs past every plan's quota. The end-to-end suite reads the local copy, so its event checks keep working                                                           | 2   |
| PAR-778 | Split the `tester` environment into `preview` and `release`                                    | A pull request's preview installer and the published app are both `tester` today, so a preview's bugs read as the release's                                                                          | 1   |
| PAR-779 | Send `production` from public builds and make the on-call monitors for it                      | Only production alerts, and Sentry can't watch an environment it hasn't seen. Blocked by the first public release (PAR-619). Takes in PAR-714                                                        | 3   |

**PAR-714** now watches `production` rather than `tester`, and is blocked by PAR-779.

**`release` beside Sentry's own release:** an environment named `release` reads oddly next to Sentry's `release` field
(`environment:release release:parity-desktop@0.21.0`). PAR-778 can name it `published` instead if that reads better.

## What needs a paid plan

The Business trial ends on 2026-11-19. Per Sentry's pricing as of today, and to be confirmed on the subscription page
before then:

- **Needs Team or higher:** metric monitors, so every alert in [The monitors](#the-monitors), including the one that
  exists; the Linear integration, which files every bug; more than one member; and custom dashboards beyond the free
  plan's allowance.
- **Needs Business:** dynamic (anomaly) thresholds, which would suit startup and opening better than fixed ones once
  there's volume, and longer lookback in Explore. Nothing above relies on them.
- **Needs budget on any plan:** spans past 5 million, replays past 50, uptime monitors past the first, and errors past
  the plan's allowance.
- **Works on Developer:** the dashboards' queries themselves, issue alerts by email, release health, and User Feedback.

## Decided

Andrew settled these on 2026-11-09:

- **Four dashboards, by question,** as [The dashboards](#the-dashboards) lists.
- **PAR-727 closes with this,** since Time to first frame is a widget here.
- **Only `production` alerts.** `development`, `ci` and testers' builds don't, so no metric monitor is made until
  production sends.
- **CI sends errors and reports only (PAR-777).**
- **`tester` splits into `preview` and `release` (PAR-778).**

## Open questions

1. **`release` or `published`** for the published app's environment? PAR-778 decides.
2. **The plan and the quotas** are Andrew's, before 2026-11-19, as [Telemetry's own health](#telemetrys-own-health)
   says.
