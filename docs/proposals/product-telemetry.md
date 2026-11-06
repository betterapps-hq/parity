# Parity's own telemetry

Parity sends what happens inside it to Sentry, from every process and package, so a problem a tester or an agent hits
arrives with its context: the errors, the trace from click to file write, the replay of the window, and the events
before it. Agents running test passes file bugs from it, pick them up from Linear, and fix them with that context in
hand, without reproducing anything first.

Telemetry is on by default, everywhere Parity runs, including development and CI. Settings can turn it off, and so can
`PARITY_TELEMETRY=off`. Parity isn't released: everyone running it is a tester or an agent, and they expect it
collected. What's sent is revisited before the first public release.

This is about Parity itself. The Telemetry lens (PAR-74 to PAR-78) is a different thing: it reads OpenTelemetry from the
app a person builds. The two share no code paths or settings. Where this page says "telemetry" it means Parity's own.

## Why now

- **Agentic development is scaling, and agents can't attach a debugger.** An agent driving a test pass sees a toast or a
  wrong frame and nothing else. A bug it files today says what it saw, not why.
- **Errors reach nobody.** About 20 `toast.error` calls tell the person something failed, then the cause is gone. Main
  and the service log a few failures to a console no one reads.
- **Crashes leave nothing.** A renderer, offscreen render window, service, worker or builder that dies records no exit
  reason, no stack and no minidump. The service's restart hides it.
- **Nothing ties processes together.** A slow save runs in the renderer, the service and the file system; an agent's
  call crosses the CLI, the agent server, the service and the window.

## What's there to build on

- **Coded errors** (PAR-472): a closed list of codes in `@parity-app/core/errors`, carried across processes as checked
  data. They become Sentry tags and fingerprints.
- **One RPC shape** between the window and the service (`ChannelMessage` in `shared/protocol.ts`) and between main and
  the service (`ServiceMessage` and `MainMessage`). One added field carries trace context everywhere.
- **One gesture lifecycle** (`renderer/canvas/gesture.ts`, PAR-568) and **one action list** (`chrome/actions.ts`, read
  by the keymap, menus and Search actions). Instrumenting these covers most interactions in two places.
- **Caller names** (PAR-450): every agent call already says which agent made it.
- **Memory and process readings** (`main/memory-readings.ts`, `ProcessUsage`), and the process manager (PAR-20), which
  keeps each server's output and exit.
- **zod checks** on data Parity didn't make (PAR-578), which say which schema and path failed.

## Principles

1. **Everything goes to Sentry by default.** Errors, crashes, traces, structured events, replays and the frame bitmaps
   behind a failure. Off is one setting away, and the only thing it keeps is the local copy.
2. **Context over volume.** An error is only useful with what led to it. Every error carries its trace, the 100 events
   before it, the replay, and who was driving: a tester, an agent and which pass.
3. **Send it as it is, except secrets.** Design, component and token names, paths, project versions and error messages
   go as written, since they're what makes a bug findable. Keys, tokens, passwords and `.env` values are scrubbed in
   every process before anything leaves.
4. **Typed events.** Each event has a zod schema in `@parity-app/telemetry`, so its fields are known, searchable in
   Sentry and listed in the catalog. Ad hoc strings aren't events.
5. **Correlated.** Every event carries the install, session, window, project and trace it belongs to, so one failure can
   be followed from an agent's call or a click to the file it wrote and back.
6. **Cheap.** Nothing runs per pointer move or per frame. Gestures send one summary when they end. A perf check holds
   the cost under a budget.
7. **Logic in a package.** The event model, spans, scrubbing and the ring buffer live in `@parity-app/telemetry`, data
   in and data out, tested in Vitest without Electron, as [packages.md](packages.md) requires. Only the app and the CLI
   import Sentry.
8. **A local copy.** Main also writes every event to rotating log files, so `parity logs` works offline and a failed
   upload loses nothing.
9. **One catalog.** `docs/telemetry.md` lists every event and field, generated from the schemas, and a test fails when
   they disagree.

## Architecture

```text
 window (editor) ──── @sentry/electron/renderer: errors, replay, spans, events ─┐
 render windows ───── @sentry/electron/renderer: errors, spans ─────────────────┤ Sentry's IPC
 utility service ──── @sentry/electron utility: errors, spans, events ──────────┤
   ├─ props worker ── via the service                                           │
   ├─ builders ────── exit, signal and last output, via the process manager     │
   └─ agent server ── continues the CLI's trace from its request headers        │
 main ─────────────── @sentry/electron/main: native crashes, hangs, process gone ┴─► Sentry (parity-desktop)
                      └─► logs/parity-<date>.jsonl, the local copy

 CLI / MCP ────────── @sentry/node ─► Sentry (parity-cli), ~/.parity/logs
```

### `@parity-app/telemetry`

- **Envelope:** `name`, `time`, `level` (`debug`, `info`, `warn`, `error`, `fatal`), `process` (`main`, `renderer`,
  `render`, `service`, `worker`, `builder`, `cli`), `installId`, `sessionId`, `windowId?`, `project?`, `traceId?`,
  `spanId?`, `durationMs?`, and the event's own `attributes`.
- **Registry:** `defineEvent(name, schema, { level, sample? })`. Names are dotted, area first (`project.opened`,
  `command.ran`, `gesture.ended`, `error.caught`). `track()` takes only registered names, so the types stop an unknown
  event, and its attributes are checked against the schema in development and tests.
- **Spans:** `startSpan(name, attributes)` returns a span to `end(outcome)`. Trace and span IDs follow W3C Trace
  Context, which Sentry continues.
- **Sinks:** the package calls a sink interface; it never imports Sentry. The app's sink sends events as Sentry
  structured logs and breadcrumbs, spans as Sentry spans, and `error.*` events as Sentry errors. A test sink records
  them for unit and end-to-end tests.
- **Secrets:** patterns for keys and tokens (`sk-`, `ghp_`, `xoxb-`, JWTs, `Bearer …`, URL credentials, long
  high-entropy strings) and the values of `.env` files the project has, replaced in every string field and stack frame.
  Sentry's own server-side scrubbing stays on as a second net.
- **Ring buffer:** each process keeps its last 500 events, for breadcrumbs and Report a problem.

### Trace context

- **The window starts a trace for every action and gesture:** the action's ID from `actions.ts`, or the gesture's kind
  from `gesture.ts`. Work that action causes, in any process, is a span in that trace.
- **`ChannelMessage` requests gain an optional `trace` field** (`sentry-trace` and `baggage`). The service's handler
  table wraps every method in a span, so each is timed and its failures coded with no change to the handlers.
- **Render jobs, preview jobs and builder starts carry the trace** they were queued under, so a slow frame shows its
  queue wait and capture time under the action that asked for it.
- **The CLI sends its trace headers** with each request to the agent server, so an agent's call and everything the app
  did for it are one trace, from the agent's command line to the frame it drew.

### Who's driving

Every event is tagged so a test pass can be found, filtered and compared:

- `environment`: `development` for `pnpm dev` and agent drives, `ci` for CI's end-to-end tests, `tester` for installed
  builds.
- `release`: the app's version and, in development, the commit.
- `driver`: `person` or `agent`, and for an agent its caller name (PAR-450) and client (`claude-code`, `codex`, …).
- `test_run`: from `PARITY_TEST_RUN`, which an agent or CI sets for a pass, so every event, error and replay from one
  pass groups together. CI sets it to the workflow run.
- Sentry's `user`: the install ID, and the tester's name or the agent's session when set.

### On by default

| Level             | Sent                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| **All** (default) | Errors, crashes, traces, events, replays and failure bitmaps             |
| **Errors**        | Errors and crashes, with their breadcrumbs, traces and the replay buffer |
| **Off**           | Nothing; the local copy is still written                                 |

- Set in Settings > Telemetry, or by `PARITY_TELEMETRY=all|errors|off`. The CLI reads the same setting and variables.
- On in development and CI too, with their own `environment`. Only unit tests (Vitest) leave it off, through the test
  sink.
- About shows the level and the install ID, with a button to copy them.

## Replays

- **Sentry Session Replay records the editor window,** unmasked, with media and the canvas included (`maskAllText`,
  `maskAllInputs` and `blockAllMedia` off, canvas recording on for the selection overlay's canvas).
- **Every session is recorded at All,** while there are few testers and agents; the rate is one setting to lower when
  volume or quota says so. At Errors, replays are kept only in the buffer mode Sentry uses for errors: the minute before
  each error.
- **Guest frames don't replay.** A frame is an iframe from the project's builder, a different origin, which Replay can't
  record. So an error or failed render attaches the frame's bitmap, which Parity already captures, and the frames on
  screen at the time.
- **Render windows aren't replayed:** they're offscreen and drawn into bitmaps already.

## What's recorded

Each area becomes one Linear issue. Attribute names are illustrative; the schemas are the source of truth once written.

### App and processes

- `app.started` with startup timings: main ready, window shown, first paint, service ready, first project shown.
- `app.quit`, with how (window closed, update, crash restart), and the session's length.
- `update.checked`, `update.downloaded`, `update.installed`, `update.failed` with channel and versions.
- `process.gone` for any process: kind, reason, exit code, the last 50 lines it printed, and the trace that was running.
  `window.unresponsive` and `window.responsive` with how long it hung. Sentry's own hang detection covers the main
  process's event loop.
- `process.memory` every 5 minutes and when a window hangs: each process's private memory.
- `service.lag` when the service's event loop is late by over 200 ms; `renderer.longTask` for tasks over 200 ms, with
  the action running at the time.

### Projects

- `project.opened` and `project.openFailed`: the project's name and root, duration of each step (detection, builder
  start, first components, first frame), outcome code, framework and builder kind, versions of React, Vite, Tailwind,
  Storybook and TypeScript, counts of components, designs, tokens and libraries, and whether it was a reopen (PAR-179)
  or used detection's cache.
- `project.closed` with how long it was open.
- `builder.started`, `builder.ready`, `builder.crashed`, `builder.restarted` with durations, exit codes and output.
- `server.started` and `server.failed` from the process manager, by server kind.
- `project.unsupported` with the reason (PAR-213).

### Rendering and previews

- `frame.rendered` with the design and state, queue wait, render and capture time, size and outcome.
- `frame.failed` with the guest's error message and stack, its category (module not found, render threw, timed out), and
  the bitmap.
- `preview.made` and `preview.failed`, and the bitmap cache's hit rate per session.

### Commands

- `command.ran` for every entry in `actions.ts`, from one wrapper: action ID, where it came from (key, menu, canvas
  menu, Search actions, toolbar, panel button), whether it was enabled, what was selected, outcome and duration.

### Canvas and editing

- `gesture.ended` from `gesture.ts`: kind (move, resize, nudge run, box select, insert drag, layer drag, pan, zoom), how
  it ended (release, Escape, interrupted), duration, the designs and layers it moved, frames per second during it, and
  whether it became an undo step.
- `edit.undone` and `edit.redone`, with the step's kind and what it touched.
- `inspector.changed` with the field, the layer, and the old and new values.
- `insert.done` with the source (Components, Icons, Images, paste, drop) and what was inserted.
- `clipboard.pasted` and `clipboard.failed` with what kind of content and the outcome.
- `text.edited` with duration and whether it was committed or cancelled.

### Files and saving

- `document.saved`, `document.saveFailed` with the file, duration, size and code.
- `tokens.saved`, `projectEdit.applied`, `projectEdit.undone` with the files and outcome.
- `export.done` and `export.failed` with format, scale, designs and states.
- `library.added`, `library.failed`, `styles.imported` with the package and version.

### Agents, CLI and MCP

- `agent.called` for every operation, in the service: operation, transport (CLI or MCP), caller name, the request's
  inputs, duration, result size, outcome, error code, `retryable`, alternatives offered and warnings by category. An
  execute call's snippet is attached to its span, so a failed snippet can be read beside its error.
- `agent.serverFailed` when the agent server can't start.
- In the CLI's own process: `cli.ran` (command and flags), `cli.connectFailed` (`not_running`, `not_answering`), version
  mismatch with the app, and `mcp.session` (client name and version).

### Errors

- `error.caught` for every handled failure. One helper, `reportError(error, context)`, records it and shows the toast,
  so the 20 `toast.error` calls each become one call that does both.
- Uncaught errors and unhandled rejections in every process, from Sentry's SDK, and `process.on` handlers in builders.
- `error.boundary` from React error boundaries around the app, the canvas, each panel and each dialog.
- `ipc.failed` for every failed RPC, by method and code.
- `data.invalid` when a zod check fails on data Parity didn't make (PAR-578), with the schema, the issues and the data.

### Interface and navigation

- `tab.opened`, `tab.closed`, `tab.switched`; `panel.shown`; `dialog.opened`; `mode.switched`.
- `setting.changed` with the setting and its new value.
- `start.action` from Home and new tabs (PAR-605): new project, open folder, recent project.

## Agents in the loop

The point of all this is that the agent fixing a bug can see what the agent or tester who hit it saw.

1. **Agents report what they find.** `parity report "<what's wrong>"` and an MCP tool, `report_problem`, send a Sentry
   user feedback tied to the current trace and replay, with a screenshot of the window and the frames involved, and
   return its link. An agent's test pass calls it whenever something looks wrong but nothing threw.
2. **Sentry files the bug.** Alert rules turn a new issue, a regression or a report into a Linear issue in PAR's Todo
   with the Bug label, its Sentry link, release and `test_run`. Sentry's Linear integration links the two, so resolving
   one resolves the other.
3. **Agents read the context.** Sessions in this repository get Sentry's MCP server, so an agent picking up a bug reads
   its events, stack, trace, breadcrumbs and replay without leaving the session. `parity logs` reads the local copy for
   a bug on the agent's own machine.
4. **The fix names its proof.** The pull request says which event or trace showed the bug, and the issue stays open
   until that error stops in the next release, which Sentry's "resolved in next release" tracks.

## Where events go

- **Sentry, as you decided on 2026-11-05.** The `better-apps` organisation, set up as [sentry.md](../sentry.md)
  describes: `parity-desktop` for the app and `parity-cli` for the CLI, so their releases and quotas stay apart, beside
  projects for the web app, dashboard and API.
- **Errors** become Sentry issues, grouped by `CodedError` code and Parity's own frames.
- **Events** become Sentry structured logs and breadcrumbs, searchable by every attribute.
- **Spans** become Sentry traces, linked across processes and to the CLI.
- **Replays** and **attachments** (bitmaps, screenshots, the last log file on a crash) go with the error or session.
- **Native crashes** upload their minidumps.
- **Source maps** and native debug files upload from the build, so stacks resolve to source.

## Report a problem

- **Help > Report a problem** opens a dialog for testers: what happened, a screenshot of the window (on by default), and
  what will be attached: the replay, the last hour of logs, versions and the open projects. It sends a Sentry user
  feedback, which Sentry files as above, and shows the link.
- **A crash on the last run** offers the same dialog when Parity starts again, with the crash attached.
- **`parity diagnostics`** in the CLI writes a zip of the same, for a bug filed by hand.

## Releases, dashboards and alerts

- **Every build is a release:** installed builds by version, development and CI builds by commit, so a bug points at the
  code that had it.
- **Dashboards:** crash-free sessions by release; top errors by release and environment; agent test passes by
  `test_run`, with their error counts; project open failures by framework and version; p95 of opening, saving, rendering
  and agent calls; agent error codes by operation; gestures interrupted or cancelled.
- **Alerts:** a new issue or a regression in any environment, a crash-free rate under 99% in `tester`, or an agent
  operation failing more than 5% of the time files a Linear issue.

## Guidance changes this needs

These change protected files, so each needs your approval as its own table when the work reaches it:

- `best-practices/conventions.md`, Logging: allow the telemetry logger alongside `console.warn` and `console.error`.
- `docs/conventions.md`: a new feature adds its events to the catalog and reports its failures through `reportError`, in
  the same commit, as editor features add their tests.
- `docs/work.md`: picking up a Bug issue from Sentry means reading its Sentry issue, trace and replay first, and an
  agent's test pass sets `PARITY_TEST_RUN` and reports what it finds with `parity report`.
- `.mcp.json` (or the repository's agent settings): add Sentry's MCP server.
- `docs/editor.md`: sections for Report a problem and the Telemetry setting, with their tests.

## Before the first public release

Revisit what's sent before anyone outside the testers runs Parity: the default level, a first-run notice, whether names
and values are sent as written, replay masking and the sample rates. This is its own issue, in Backlog.

## The work

In order. Estimates use [work.md](../work.md)'s points: 2 is a short session, 3 a full one, 5 a full one with little
slack. Each issue's "Update when done" includes `docs/telemetry.md` for the events it adds, and decisions.md for calls
made. All go under the **Product telemetry** stream.

PAR-617, PAR-620 and PAR-624 give crash, error and replay coverage on their own, since Sentry's SDK catches uncaught
errors, crashes and hangs without any of Parity's events. Everything after adds context.

### Sentry in the app

| #       | Issue                                                                             | Pts | Blocked by |
| ------- | --------------------------------------------------------------------------------- | --- | ---------- |
| PAR-617 | Set up Sentry's organisation, projects, DSNs and the Linear integration           | 2   |            |
| PAR-620 | Send errors, crashes and hangs from every process to Sentry, on by default        | 3   | PAR-617    |
| PAR-624 | Record the editor window with Session Replay and attach frame bitmaps to failures | 3   | PAR-620    |
| PAR-625 | Upload source maps and native debug files, and name every build as a release      | 3   | PAR-620    |

### The event model

| #       | Issue                                                                                      | Pts | Blocked by       |
| ------- | ------------------------------------------------------------------------------------------ | --- | ---------------- |
| PAR-618 | Create `@parity-app/telemetry` with the event registry, spans, sinks and ring buffer       | 3   |                  |
| PAR-621 | Scrub secrets from every event before it leaves a process                                  | 2   | PAR-618          |
| PAR-627 | Send events as Sentry logs, breadcrumbs and spans, and keep a local copy in rotating files | 3   | PAR-620, PAR-618 |
| PAR-629 | Carry trace context across the window, the service, render jobs, builders and the CLI      | 5   | PAR-627          |
| PAR-630 | Tag every event with its environment, release, driver and test run                         | 2   | PAR-627          |
| PAR-626 | Add the Telemetry setting, the environment variables and the install ID in About           | 2   | PAR-620          |

### Instrumenting

| #       | Issue                                                                                     | Pts | Blocked by |
| ------- | ----------------------------------------------------------------------------------------- | --- | ---------- |
| PAR-631 | Record startup, quitting, updates, memory, hangs and long tasks                           | 3   | PAR-627    |
| PAR-637 | Record project opening, detection, builders and servers                                   | 3   | PAR-629    |
| PAR-638 | Record frame renders, previews and the bitmap cache                                       | 3   | PAR-629    |
| PAR-639 | Record every command from one wrapper in the action list                                  | 3   | PAR-629    |
| PAR-640 | Record gestures, undo, inspector changes, inserts, pastes and text edits                  | 3   | PAR-629    |
| PAR-632 | Route every error toast through `reportError` and record saves, exports and project edits | 3   | PAR-627    |
| PAR-641 | Record agent calls in the service and the CLI's own runs and connection failures          | 3   | PAR-629    |
| PAR-633 | Record failed data checks and unsupported projects                                        | 2   | PAR-627    |
| PAR-634 | Record tabs, panels, dialogs, modes, settings and start page actions                      | 2   | PAR-627    |

### Agents in the loop

| #       | Issue                                                                                         | Pts | Blocked by       |
| ------- | --------------------------------------------------------------------------------------------- | --- | ---------------- |
| PAR-642 | Send the CLI's errors, traces and events to Sentry                                            | 3   | PAR-617, PAR-629 |
| PAR-646 | Let agents report problems with `parity report` and an MCP tool, tied to the trace and replay | 3   | PAR-624, PAR-642 |
| PAR-622 | File Linear bugs from Sentry alerts, reports and regressions                                  | 2   | PAR-617          |
| PAR-628 | Give sessions Sentry's MCP server and say how to pick up a Sentry bug                         | 2   | PAR-622          |
| PAR-635 | Add Help > Report a problem and `parity diagnostics`                                          | 3   | PAR-624, PAR-627 |
| PAR-636 | Add `parity logs` to read the local copy by level, process, trace or test run                 | 2   | PAR-627          |

### Keeping it useful

| #       | Issue                                                                           | Pts | Blocked by       |
| ------- | ------------------------------------------------------------------------------- | --- | ---------------- |
| PAR-623 | Generate `docs/telemetry.md` from the schemas and test that it matches          | 2   | PAR-618          |
| PAR-643 | Set up dashboards and alerts for releases, test runs and slow operations        | 2   | PAR-630, PAR-622 |
| PAR-647 | Hold telemetry's cost under a budget in `pnpm perf`                             | 2   | PAR-639, PAR-640 |
| PAR-644 | Stop new `toast.error` calls that skip `reportError`                            | 2   | PAR-632          |
| PAR-648 | Check the main workflows' events in CI's end-to-end tests through the test sink | 3   | PAR-637, PAR-640 |
| PAR-619 | Revisit what's sent before the first public release                             | 2   |                  |

About 81 points: Sentry in the app 11, the event model 17, instrumenting 25, agents in the loop 15, upkeep 13. PAR-617
and PAR-618 can start now.
