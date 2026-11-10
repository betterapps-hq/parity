# Parity's own telemetry

> **The events are generated.** [Events](#events) is written from the schemas in `@parity-app/telemetry`, and a test
> fails when they disagree. To add an event, follow [Adding an event](#adding-an-event); to rewrite the list, run
> `pnpm exec vp test run packages/telemetry -u`. Everything else here is written by hand.

Parity sends what happens inside it to Sentry, so a bug that a tester or an agent hits arrives with its context: the
error, the trace from click to file write, the replay of the window and the events before it. This page says what's
sent, how code records it, how to turn it down and what's kept out, and lists every event Parity records.

The plan is [proposals/product-telemetry.md](proposals/product-telemetry.md), and the direction is in
[decisions.md](decisions.md#paritys-own-telemetry-goes-to-sentry-on-by-default). It's being built in the Product
telemetry stream in Linear, and each issue in it updates this page as it lands. This is about Parity itself: the
Telemetry lens, which reads OpenTelemetry from the app a person builds, shares nothing with it.

## What goes to Sentry

- **Errors, crashes and hangs** from every process, as Sentry issues, each with its trace and the events before it.
- **Spans,** as Sentry traces linked across the window, the service, render jobs, builders and the CLI.
- **Events,** the ones listed below, as Sentry structured logs and breadcrumbs, searchable by every attribute.
- **Replays** of the editor window, unmasked.

The app sends to the `parity-desktop` project and the CLI to `parity-cli`; [sentry.md](sentry.md) says how Sentry is set
up.

## Who's driving

Every error, span, log and replay is tagged so a test pass can be found and filtered in Sentry:

- **`environment`:** `development` for `pnpm dev` and agent drives, `ci` wherever `CI` is set, `preview` for a pull
  request's installer or a pkg.pr.new CLI, `release` for the published app and CLI (PAR-778), and `production` for a
  published app or CLI that's been promoted to everyone, from the start after it learns so (PAR-779, PAR-799).
- **`release`:** the published version, or the commit any other build was made from.
- **`test_run`:** from `PARITY_TEST_RUN`, when it's set. The end-to-end suite sets it to `github-<run>-<attempt>` in
  GitHub Actions, and `pnpm perf` to `perf-<time>` unless it's already set. An agent that starts a copy to drive with
  `drive.ts` sets it on that copy.
- **`driver`:** `person`, or `agent` from an agent's call until the person presses a key in the window or no call has
  come for 10 seconds. An agent's events add `agent`, its caller name, and `agent_client`, the MCP client's name (such
  as `claude-code`), when it calls through MCP.
- **Sentry's user:** the install ID, named by `PARITY_TESTER` when it's set, or else by the agent's session while one is
  driving.

Main holds these on its Sentry scope, which the windows' and the service's events join. The rules are `runTags`,
`driverTags`, `telemetryUser` and `createDriverTracker` in `@parity-app/telemetry`.

## How events get there

Each process records events with `createTelemetry` and the Sentry sink, `createSentrySink` in `@parity-app/telemetry`,
which the CLI shares:

- **In the process that records it,** an event or span becomes a breadcrumb, so an error there carries the events before
  it (Sentry keeps the last 100). An `error.*` event, or one at the `error` or `fatal` level, becomes a Sentry error,
  linked to its trace.
- **Then it goes to main:** a window's over IPC from its preload, a render window's from a preload that gives the page
  only that, the service's over its channel to main, and the props worker's through the service, which adds them to its
  own breadcrumbs and errors.
- **Main sends it to Sentry** as a structured log, its message the event's name and its attributes searchable as they
  are, with the envelope's fields beside them under `parity.`. A span goes as a Sentry span with Parity's own trace and
  span IDs, so spans from every process join one trace. Main's hooks decide what leaves, by the level below.
- **Main also writes it to the local copy,** `<userData>/logs/parity-<date>.jsonl`, one envelope per line, at every
  level, Off included. A file continues in `parity-<date>.2.jsonl` and on once it reaches 5 MB, and the newest 10 are
  kept. Lines are written each second, and at once for a `fatal` event.

Why it works this way is in [decisions.md](decisions.md), "Events go to Sentry through main, and to a local copy at
every level".

Every event carries the same envelope besides its own attributes: its `name`, `time` and `level`; the `process` it came
from (`main`, `renderer`, `render`, `service`, `worker`, `builder` or `cli`); the `installId`, the `sessionId` of this
run and, where there is one, the `windowId` and `project`. An event inside a trace adds its `traceId` and `spanId`, and
a span adds its `parentSpanId`, `durationMs` and `outcome` (`ok`, `error` or `cancelled`).

## Traces

One action is one trace in Sentry, across every process that works on it (PAR-629):

- **The window starts a trace** for each action, as `command.ran` with its ID from `chrome/actions.ts`, and each canvas
  drag, as `gesture.ran` with its kind from `canvas/gesture.ts`. The service's requests made while it runs carry it.
- **Requests carry the trace** as `sentry-trace` and `baggage`, in the channel message's `trace` field. The service and
  main answer each in a `request.handled` span, with the error code when it fails.
- **Requests to main's own IPC channels carry it too,** such as signing in, sending a report, checking for updates or
  picking a file. The preload sends the window's trace after each request's argument, and main runs each handler in a
  `request.handled` span named by its channel in `shared/channels.ts`, such as `pickFolder` (PAR-810).
- **Queued work keeps its trace:** an offscreen frame or preview is a `frame.rendered` span with how long it waited for
  a window, and a builder's start is `builder.started`.
- **An agent's call starts its trace in the CLI.** A `parity` command's calls carry its `cli.ran` span, and each MCP
  call starts a trace of its own. The agent server's `agent.called` span continues it, so the call and the frame it drew
  are one trace.

To find one, open a span's trace in Sentry, or search spans by `trace` from an error.

## Checking it in the end-to-end tests

The end-to-end suite reads back what the app recorded and checks the main workflows' events (PAR-648), in
`apps/desktop/e2e/telemetry.e2e.ts`. Like the rest of the suite it runs only in CI, through `.github/workflows/app.yml`.

- **It reads the local copy,** from the copy's own profile, since main writes every event and span from every process
  there at every level. That's the same thing Sentry gets, without asking Sentry for it. `e2e/events.ts` reads it and
  finds events by name, envelope field and attribute. Main writes each second, so a test waits for an event with
  `expect.poll`.
- **What it checks:** opening the project, from `project.opening` to `project.opened`, `project.loaded` and
  `project.drawn`; a layer drag, as `gesture.ran` and `gesture.ended`; Duplicate and Save from the keyboard, as
  `command.ran` from `key`; the file write as `document.saved`; and an agent's `parity state`, as `cli.ran` in the CLI's
  log and `agent.called` in the app's.
- **It checks the traces across processes:** the service's `project.opened` and its answers are in the trace of
  `project.opening`, with `project.loaded` and `project.drawn`. The service's answer to `document.save` is in the trace
  of Save. `agent.called` continues the command's `cli.ran` span. The drag and Duplicate each start a trace of their
  own; with autosave off, as it is by default, neither asks the service for anything. `gesture.ended` is under the
  drag's `gesture.ran` span and the window's `document.saved` under Save's `command.ran`, though each is recorded after
  that span ends (PAR-752).
- **CI's runs send only their errors and reports to Sentry** (PAR-777), as `environment: ci` with `test_run` set to
  `github-<run>-<attempt>`, each error with its breadcrumbs. Spans and logs stay in the local copy, which is written in
  full, and every line of it carries that `testRun`, which the suite checks. The editor window doesn't start Session
  Replay. The `parity` command it runs does the same, with the same tags, and writes its log and outbox inside the
  copy's profile.
- **A CI run's spans and logs are kept as an artifact of its run** (PAR-785), named `telemetry-github-<run>-<attempt>`
  after its `test_run` and kept for 7 days, whether the tests passed or not. Before the suite removes the copy's
  profile, `e2e/launch.ts` copies the app's `logs/`, the `parity` commands' `cli-logs/` and the app's output, `app.log`,
  to the folder `PARITY_E2E_TELEMETRY` names, which `app.yml` uploads. Download it from the run's summary page or with
  `gh run download <run> -n telemetry-github-<run>-<attempt>`, and read it with
  `PARITY_USER_DATA=<folder> parity logs --session all`, which takes the same filters as the app's own copy. The CLI's
  files are JSON lines too, read directly.

## Agents and the CLI

Agents' calls are recorded where they're answered, once for every operation, whichever way they came (PAR-641):

- **The agent server records each call as `agent.called`:** the operation, `cli` or `mcp`, the caller's declared name
  and MCP client, the params as JSON, the answer's size, and how it ended. A failure adds its code, `retryable` and how
  many alternatives it offered; a snippet or screenshot that failed without throwing counts as failed too. The answer's
  warning groups are listed by category. An `exec` call's snippet goes on the span by itself, so a failed snippet reads
  beside its error. `agentCallStart`, `agentCallAnswered` and `agentCallFailed` in `@parity-app/telemetry` read these
  from the body and the answer, scrubbing the open projects' `.env` values before the params are serialized or cut,
  since an escaped or shortened secret wouldn't match later. When the server can't start, the service records
  `agent.serverFailed`.
- **The CLI records its own runs** through `@parity-app/telemetry`: `cli.ran` for each command, with the flags' names
  but not their values; `cli.connectFailed` when no copy of the app is registered (`not_running`) or none answers
  (`not_answering`); `cli.versionMismatch` when the app is newer than the CLI reads, or its answer doesn't check; and
  `mcp.session` with each MCP client's name and version. They're written to `~/.parity/logs/parity-cli-<date>.jsonl`,
  the newest 10 days kept, at every level.
- **The CLI sends to Sentry's `parity-cli` project** (PAR-642), with the same tags as the app: `environment`, `release`,
  `test_run`, and `driver` with `agent` and `agent_client`, since every CLI call is an agent's as the app counts them.
  Its events go as logs and breadcrumbs, `cli.ran` as a span, and an error the CLI throws that isn't one of Parity's
  coded failures, or one nothing caught, as a Sentry error in the command's trace. A command's `cli.ran` span is the
  root of the trace its calls carry, so the app's `agent.called` span in `parity-desktop` joins it.
- **A command never waits for Sentry.** Loading `@sentry/node` takes about 300 ms, so a command keeps what it would
  send, writes it to `~/.parity/outbox` as it exits (`PARITY_CLI_OUTBOX` names another folder), and starts a detached
  `parity` process that sends it and exits. That costs a command about 20 ms. `parity mcp` hands over what's waiting
  every 10 seconds as well. One sender runs at a time, and a batch a day old is dropped.
- **The CLI's release** is `parity-cli@<version>` when `npm publish` built it, and otherwise the commit it was built
  from or runs from: a pkg.pr.new preview, a checkout's own `dist`, or source (PAR-719). Published to npm, it reports as
  `release` while its version is on `next`, and `production` once it's been `latest` (PAR-799): the sender asks npm's
  registry after it sends and keeps the answer in `~/.parity/installed-cli.json`, which the next command reads, so no
  command waits on npm. From a pkg.pr.new preview URL it reports as `preview`; from a checkout, as `development`.
- **Agents report what they find** with `parity report "<what's wrong>"` or MCP's `report_problem` (PAR-646), above all
  when nothing threw: a test pass that sees a wrong result. The service draws the frames of the design it names, asks
  the window to flush its replay, and passes both to main, which sends a Sentry user feedback from `parity-desktop` as
  Help > Report a problem does: the window's screenshot, the frames, the last hour of the local copy, versions and
  projects, with the replay beside it. It's tied to the call's trace, so it sits under the command's `cli.ran` span, and
  tagged `report: agent` with `tab`, `design`, `state`, `node` and the CLI's `test_run`. The answer is the feedback's ID
  and link (`https://sentry.io/organizations/better-apps/projects/parity-desktop/events/<id>/`, which finds its issue);
  Sentry's alert files it in Linear. Unlike the person's own report, it isn't sent while Telemetry is off.

## Frames, previews and the bitmap cache

Every frame and component preview drawn offscreen is recorded, so a slow or broken frame can be found and read
(PAR-638):

- **`frame.rendered`** is the span of each one, under the action, agent call or capture that asked for it: the design,
  state and mode, the queue it waited in and for how long, how long the guest took to draw it (`renderMs`) and how long
  settling and capturing took after (`captureMs`), its size and how many layers were measured. A frame that failed ends
  as `error` with why.
- **`frame.failed`** records a frame whose guest failed, with its error message, its stack and why: `module not found`,
  `render threw`, or `timed out` when it's still drawing 30 seconds after its turn came, which is left to finish. A
  failure the render page throws while the frame is settled, checked or measured is recorded the same way, with the
  page's own message and stack rather than Electron's "Script failed to execute". It's a warning, a log rather than a
  Sentry issue, since a project's own component failing isn't Parity's bug. Main keeps a picture of what the window
  showed, and the Sentry errors in the 10 minutes after carry it as `failed-frame.png`, until another frame fails.
- **`preview.made` and `preview.failed`** come from the service: each preview's component, size and time, or why it
  couldn't be made.
- **`bitmapCache.used`** gives the session's hits and misses for frame bitmaps and component previews kept on disk, each
  minute there were lookups. A preview kept as failing or as drawing nothing counts as a hit, since it isn't drawn
  again.

None of them is sampled. Opening `examples/shadcn-vite` on an empty cache drew about 640 frames and made 520 previews in
two minutes, once; opening it again drew none.

## Turning it off

Telemetry is on by default everywhere Parity runs, development and CI included, each tagged with its environment. It's
either sent or not: errors, crashes, traces, events, replays and failure bitmaps all go, or nothing does. CI is the one
exception: wherever `CI` is set, only errors and reports go, whatever the level, since its end-to-end runs sent nine in
ten of `parity-desktop`'s spans (PAR-777). `resolveTelemetry` in `@parity-app/telemetry` decides this with the level, as
`errorsOnly`. The local copy is written either way. Unit tests leave it off.

- **Settings > Privacy > Share diagnostics** turns it off or on again, at once, with no restart. It's kept with the
  install ID in `<userData>/telemetry.json`, which the CLI reads too, as each command starts (`desktopDataFolder` in
  `@parity-app/telemetry` finds the folder). Before the app has run, the CLI sends, as install `none`.
- **`PARITY_TELEMETRY=all` or `off`** decides a run whatever the setting says, and **`DO_NOT_TRACK=1`** turns it off.
  Settings then shows the variable and leaves the switch disabled. Any other `PARITY_TELEMETRY` value stops the app, and
  fails a `parity` command.
- **The CLI says so once.** The first time it runs with diagnostics on, it prints one line to stderr saying they're
  shared and how to stop it, and keeps `~/.parity/telemetry-notice` so it doesn't again.
- **The install ID** is a random UUID made on the first run and sent as Sentry's user. Turning sharing off makes a new
  one, so what's sent after turning it on again isn't linked to what came before. About shows it beside the versions.

## Replays and frame bitmaps

Sentry's Session Replay records the editor window, so a bug's event links to what happened before it: the panels, the
canvas, selections, menus and dialogs, as they looked, with what was clicked and typed. Only secrets are hidden, as in
every other event (see "Secrets are scrubbed" below). The offscreen render windows aren't recorded, and neither are
Storybook or the CLI.

- **While diagnostics are on, every session is recorded.** The share is `replaySessionRate` in
  `apps/desktop/src/renderer/replay.ts`, 1 for now; lower it when replay volume or Sentry's quota says so.
- **While they're off, nothing is recorded,** and the recorder isn't loaded. Turning them off in Settings stops it at
  once, and turning them on starts it.
- **While a project's canvas mounts, the page isn't recorded,** from the tab being ready until its first frame shows, or
  5 seconds at most. The replay keeps the page as it was before, then a snapshot of the canvas once the frame shows, in
  the same replay. Clicks and requests are still recorded meanwhile.
- **Recording doesn't grow the window's memory over a session.** Over an hour of zooming, selecting and editing, the JS
  heap and the window's private memory stayed level with Replay on, as with it off. The page counts about 21,000 more
  DOM nodes while recording: one for each attribute of each element the recorder reads, which go with their elements.
  `pnpm perf --soak <minutes>` measures it again; see "Session Replay's memory stays level over an hour" in
  [decisions.md](decisions.md).

A project's frames and icons are left out of replays, shown as boxes their size, and the recorder never sees their
shadow roots: it kept every one it saw, and with a frame's the closed project's canvas. The offscreen windows that draw
their bitmaps aren't recorded either, so failures carry the frames themselves:

- **Every error from the editor window** has `frames.json` attached, listing the frames on the canvas: the project,
  design, state and mode of each, its size and whether it has a bitmap.
- **A frame whose offscreen capture fails** is reported as an error tagged `render: failed`, with the WebP bitmap the
  frame last showed attached as `frame.webp`, from before the edit whose render failed. A capture tried again until it
  works is reported once.

The frames are noted in `apps/desktop/src/renderer/canvas/frames-on-screen.ts`.

The window asks main whether diagnostics are on as it starts, so the recorder starts a moment after the page.

## Secrets are scrubbed

Names, paths, values and messages are sent as written, since they're what makes a bug findable. Secrets aren't: they're
replaced with `[redacted]` in every string and stack frame, in every process, before anything leaves it. Sentry's own
server-side scrubbing stays on as a second net.

`createScrubber()` in `@parity-app/telemetry` does it. `createTelemetry` runs one on every event's attributes before its
sinks, and each process's Sentry setup (`main/telemetry.ts`, `renderer/telemetry.ts`, `utility/telemetry.ts`, and the
CLI's `send.ts`) starts Sentry with `sentryScrubbing()`, which runs one in `beforeSend`, `beforeSendTransaction`,
`beforeSendSpan`, `beforeSendLog` and `beforeBreadcrumb`. It sends spans inside their transaction
(`traceLifecycle: 'static'`), since a span Sentry streams on its own skips `beforeSendTransaction`. It replaces:

- keys and tokens with a known shape: `sk-…`, Stripe, GitHub, Slack, AWS access key IDs, Google, npm and Sentry tokens,
  JWTs and private key blocks
- the token after `Bearer`, and the password in a URL's `user:password@`
- the whole value of a field or `name=value` whose name says it's secret, such as `password`, `apiKey`, `accessToken`,
  `Authorization`, `Cookie` or `GITHUB_TOKEN`. A bare `token` or `key` is a design token or design key, and stays.
- long random strings, though not hex (hashes, commit SHAs, UUIDs, trace IDs), file names or `data:` URLs
- values it's given, such as a project's `.env` values read with `envSecrets()`

The values it's given are the open projects' `.env`, `.env.local` and other `.env.*` values. The service reads them with
`envSecrets()` whenever a project opens or closes and sends them to main. Main scrubs them from every process's events
and passes them to each window, which asks for them as its telemetry starts. Each process's telemetry gets them through
`setSecrets()`. The CLI reads none: it scrubs keys, tokens and passwords, as every process does, but not a project's
`.env` values, which only the service reads.

Replays are scrubbed in the editor window as they're recorded, by the window's own scrubber, so they lose the same
secrets, `.env` values included (`replayPrivacy` in `apps/desktop/src/renderer/replay.ts`):

- **Text on screen** passes through the scrubber, node by node, as the recorder reads it and each time it changes.
  Styles and scripts don't.
- **What's typed into a field is recorded as written,** since Replay can only show a field's value or stars. A password
  field, and a field in a row whose name says it's secret, such as an `apiKey` prop in the inspector, show as stars
  (`Field` in `apps/desktop/src/renderer/chrome/fields.tsx`). Anything else marked `data-sentry-mask` does too.
- **Replay's own clicks, requests and spans** are scrubbed as they're added, since they don't pass `beforeBreadcrumb`.
- **Titles, placeholders and accessible names** show as stars, as Replay masks them by default.

What was chosen and why is in [decisions.md](decisions.md), "Secrets are scrubbed before any event leaves a process" and
"Replays are scrubbed as they're recorded".

## Editing

Editing on the canvas and in the inspector is recorded once per thing done, never per pointer move or per frame
(PAR-640):

- **`gesture.ended` comes from `canvas/gesture.ts`.** `followPress` records each pointer drag as it ends, `GestureRun`
  each run of arrow presses or of Up and Down in a field, `CameraGestures` each pan or zoom once the camera has been
  still for 300 ms, and `InsertDrag` each item dragged in from the Assets panel. Boards and notes moved by tldraw are
  recorded where `CanvasEditor.tsx` ends their gesture. `undoStep` is whether the design store's gesture made a step,
  and `fps` counts the animation frames drawn while it lasted.
- **`edit.undone` and `edit.redone` come from the design store,** whichever button, key or toast undid the step.
- **`inspector.changed` comes from wherever the inspector writes** (PAR-640, PAR-713), once per change made: previews,
  such as a number prop being scrubbed, record nothing, and nor does a change that leaves the value as it was. Values
  are JSON; a style row whose layers differ was `mixed`. Its `field` is one of:
  - a style row, `style.*`, from `chrome/style-editor.ts`, and a layer's `text`, `hidden` and props, `props.*`, from
    `chrome/LayerPanel.tsx`, as each is set or reset;
  - `name`, a layer's or, with no layers, the design's, wherever it's renamed: the inspector, a Layers row or a board's
    title on the canvas, through `renameAndRecord` (PAR-728);
  - an image's `image.src`, `image.alt` and `image.fit`, and an instance's `instance.state` and `instance.design`, the
    component it was swapped to;
  - `overrides`, what a state, variant or copy changes about a layer, when they're reset all at once, from Reset, Reset
    all or States' Reset;
  - `bind.text` and `bind.visible`, the prop a component's layer uses (`chrome/field-prop.tsx`);
  - `slot`, the slot a component's layout is, and `slots.*`, the layers, by id, an instance fills a slot with
    (`chrome/slot-props.tsx`, `chrome/instance-slots.tsx`);
  - `states`, each by id and name (`chrome/StatesSection.tsx`), and `params.*`, a component's prop or variant, a
    variant's options by id and name (`chrome/ComponentsSection.tsx`, `chrome/slot-props.tsx`). These have no layers;
  - `token.*`, a token's values by theme, from the Tokens panel, with no design or layers.

  `updateAndRecord` in `chrome/inspector-events.ts` makes a change through the design store and reads the field back
  from the store before and after, so a change the store refuses records nothing. Buttons that act on a whole layer
  aren't fields, so they aren't `inspector.changed`.

- **`component.changed` comes from Detach, Push to main and Make component** (PAR-728), once each changes the designs:
  `detach` from the instance section's Detach and Object > Detach instance, `push` from Push to main on an instance or
  on a layer inside a copy, and `extract` from Make component in the inspector, the menu or Components' suggestions.
  `chrome/component-events.ts` makes each change through the design store and records the design, the layers and the
  component by id. As key presses and menus, Detach instance and Make component are `command.ran` too.

- **`insert.done` comes from `canvas/insert.ts`, `canvas/drop-files.ts` and `canvas/clipboard.ts`,** so an item from the
  Assets panel or Quick insert, files dropped and a paste are each one. A paste is `clipboard.pasted` too, and a paste
  that pastes nothing is `clipboard.failed` with why.
- **`text.edited` comes from the text editor on the canvas** as it closes.

## Levels and sampling

Each event has a level, lowest first: `debug`, `info`, `warn`, `error` and `fatal`. `error` and `fatal` events also
become Sentry errors, as every `error.*` event does. **Kept** is the share of an event that's recorded: all of them
unless the event says otherwise. Sampling is decided when an event is tracked or a span starts.

## Recording events and errors

Code records through its process's helpers, not through Sentry. Each records nothing until its process's telemetry has
started, as in unit tests and stories, and logs a mistake the development build's checks catch rather than throwing it,
so recording never stops the work it describes.

- **An error the person sees goes through `reportError`** in `renderer/report-error.ts`:
  `reportError(error, { operation, title, context, ...toast })` shows the error notification and records `error.caught`
  with the error's code, what failed and what it acted on. Lint refuses `toast.error` anywhere else (PAR-644). A failure
  that isn't shown is recorded as its work's own event, such as `document.saveFailed` or `export.failed`, or as a span
  that ends as `error`.
- **In the editor window,** `track` from `renderer/report-error.ts` records an event, under a span when given. Every
  action in `chrome/actions.ts` runs in its own `command.ran` trace through `tracedCommand`, and a canvas drag starts a
  `gesture.ran` trace with `startTrace`, both in `renderer/tracing.ts`. Work that runs later, such as a save an edit
  scheduled, keeps the trace with `keepTrace`. An event recorded after its trace has moved on passes the span it belongs
  to as `track`'s `span`: `gesture.ended` its drag's, from the trace's `context`, and `document.saved` the one its write
  was asked in, from `currentTraceContext()` before it waits on the service (PAR-752). Tabs, panels, dialogs, the mode,
  settings and the start page are recorded by the store that owns them, through `recordInterface`, not at each control.
- **In main and the service,** `track` and `inSpan` from `shared/tracing.ts` record under the span the process is
  working in, followed across `await`s. A request to another process carries it with `currentTraceHeaders()`, and queued
  work keeps it with `currentTrace()`. A channel's handlers each run in a `request.handled` span through `handleInSpan`.
  Main's IPC handlers are registered with `handle` and `listen` from `main/ipc-handlers.ts`, which run each in one
  through `handlerInSpan`. Only `telemetry`, where each span would record another, and the window's `closePending` reply
  skip them. The window gives its preload its trace with `traceFrom`, as `renderer/main.tsx` does.
- **In the CLI,** `recordCli` records an event under the running command, and `inCliRun` runs a command in its `cli.ran`
  span. `runTraceHeaders()` gives the headers that carry that span to the app.

Some failures are recorded for you, so code doesn't record them again:

- **A failed request from the window to the service** is recorded as `ipc.failed` by `request` in `renderer/service.ts`.
- **A failed request from the window to main** ends main's `request.handled` span as `error`, with the error's code.
- **A failed check of data Parity didn't make,** through `checkData`, `parseData` or `parseInput` in `@parity-app/core`,
  is recorded as `data.invalid` in every process.
- **Uncaught errors and crashes** reach Sentry through each app process's Sentry setup, and what a React render throws
  through `reactErrorHandlers` in `renderer/telemetry.ts`.

## Adding an event

1. Define it with `defineEvent` in `@parity-app/telemetry`. Give it a dotted name, area first (`project.opened`), and a
   `z.object` schema with a `.describe()` on every attribute saying what it means. Say its `level`, which processes send
   it (`sentBy`) and when (`when`, a sentence). Add `sample` to keep only a share.
2. Add it to `registeredEvents` in `packages/telemetry/src/registry.ts`, which every process passes to
   `createTelemetry`.
3. Run `pnpm exec vp test run packages/telemetry -u` to rewrite [Events](#events), then review the diff and commit it
   with the event.

`packages/telemetry/src/catalog.test.ts` fails when this page and the registry disagree, and says how to regenerate it.

## Events

<!-- Generated from the event registry: see “Adding an event”. -->

| Event                 | Level | Kept | Sent by                                 | When                                                                                                         |
| --------------------- | ----- | ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `agent.called`        | info  | all  | service                                 | The agent server answers a call from the CLI or MCP, from reading it to the answer.                          |
| `agent.serverFailed`  | error | all  | service                                 | The agent server can't start, so agents can't reach this copy.                                               |
| `app.first_project`   | info  | all  | main                                    | The first project opened since the app started has its tab ready to draw.                                    |
| `app.quit`            | info  | all  | main                                    | The app quits.                                                                                               |
| `app.started`         | info  | all  | main                                    | The first window has painted and the project service is running.                                             |
| `bitmapCache.used`    | info  | all  | service                                 | Each minute in which bitmaps or previews were looked up, with this session's totals so far.                  |
| `builder.crashed`     | warn  | all  | service                                 | A project's builder stops by itself while the project is open.                                               |
| `builder.ready`       | info  | all  | service                                 | A project's builder answers and serves the project.                                                          |
| `builder.restarted`   | info  | all  | service                                 | A project's builder is started again from the processes list.                                                |
| `builder.started`     | info  | all  | service                                 | The service starts a project's builder, until it's spawned.                                                  |
| `cli.connectFailed`   | warn  | all  | cli                                     | The CLI can't reach a running copy of the app for a call.                                                    |
| `cli.ran`             | info  | all  | cli                                     | A `parity` command runs, until it's done.                                                                    |
| `cli.versionMismatch` | warn  | all  | cli                                     | The CLI and the app it calls are versions apart that don't fit.                                              |
| `clipboard.failed`    | info  | all  | renderer                                | A paste pastes nothing, and says why.                                                                        |
| `clipboard.pasted`    | info  | all  | renderer                                | A paste puts something on the canvas.                                                                        |
| `command.ran`         | info  | all  | renderer                                | An action in `chrome/actions.ts` is asked for, from anywhere, until it's done.                               |
| `component.changed`   | info  | all  | renderer                                | Detach, Push to main or Make component changes how layers follow a component.                                |
| `data.invalid`        | warn  | all  | main, renderer, render, service, worker | A check of a file, input, setting or response Parity didn't make fails.                                      |
| `dialog.opened`       | info  | all  | renderer                                | One of the app's own dialogs opens.                                                                          |
| `document.saveFailed` | warn  | all  | renderer                                | A design file couldn't be saved.                                                                             |
| `document.saved`      | info  | all  | renderer                                | A design file is saved.                                                                                      |
| `edit.redone`         | info  | all  | renderer                                | A step undone is redone.                                                                                     |
| `edit.undone`         | info  | all  | renderer                                | A step is undone.                                                                                            |
| `error.caught`        | error | all  | renderer                                | A failure is shown as an error notification.                                                                 |
| `export.done`         | info  | all  | renderer                                | An export finishes.                                                                                          |
| `export.failed`       | warn  | all  | renderer                                | An export fails.                                                                                             |
| `frame.failed`        | warn  | all  | main                                    | A frame or preview drawn offscreen fails, or is still drawing 30 seconds after its turn came.                |
| `frame.rendered`      | debug | all  | main                                    | An offscreen window draws a frame or a preview, from its turn to the end, under the trace that asked for it. |
| `gesture.ended`       | info  | all  | renderer                                | A gesture ends: a drag, a resize, a run of presses, a pan or a zoom.                                         |
| `gesture.ran`         | info  | all  | renderer                                | A press on the canvas becomes a drag, until the drag ends.                                                   |
| `insert.done`         | info  | all  | renderer                                | Something is inserted onto the canvas.                                                                       |
| `inspector.changed`   | info  | all  | renderer                                | A field in the inspector changes a layer, a design or a token.                                               |
| `ipc.failed`          | warn  | all  | renderer                                | A request to the project service fails.                                                                      |
| `library.added`       | info  | all  | renderer                                | A catalog library is installed into the project.                                                             |
| `library.failed`      | warn  | all  | renderer                                | A catalog library couldn't be installed.                                                                     |
| `main.blocked`        | warn  | all  | main                                    | Main's event loop runs again after being blocked for over 2 seconds.                                         |
| `mcp.session`         | info  | all  | cli                                     | An MCP client starts a session with `parity mcp`.                                                            |
| `mode.switched`       | info  | all  | renderer                                | The canvas switches between designing and Interact, where designs take the pointer.                          |
| `panel.shown`         | info  | all  | renderer                                | A side panel or the console opens, or a side panel shows another tab.                                        |
| `preview.failed`      | warn  | all  | service                                 | A component's preview can't be made.                                                                         |
| `preview.made`        | info  | all  | service                                 | A component's preview is drawn and kept.                                                                     |
| `process.memory`      | info  | all  | main                                    | Every 5 minutes, and when a window stops answering.                                                          |
| `project.closed`      | info  | all  | service                                 | An open project is closed.                                                                                   |
| `project.detected`    | debug | all  | service                                 | The service reads a project's package, tools, files and components as it opens, until it's done.             |
| `project.drawn`       | info  | all  | renderer                                | A newly opened project's canvas first draws a frame, in the trace of `project.opening`.                      |
| `project.loaded`      | info  | all  | renderer                                | A project's tab has its components loaded and is ready to draw.                                              |
| `project.openFailed`  | warn  | all  | service                                 | A project can't be opened.                                                                                   |
| `project.opened`      | info  | all  | service                                 | A project opens, with its builder serving it.                                                                |
| `project.opening`     | info  | all  | renderer                                | A tab asks the service to open a project, until the tab is ready or the open fails.                          |
| `project.unsupported` | warn  | all  | service                                 | A project is opened that Parity doesn't support.                                                             |
| `projectEdit.applied` | info  | all  | renderer                                | Parity changes the project's files and says so, with Undo.                                                   |
| `projectEdit.undone`  | info  | all  | renderer                                | Undo puts back a project edit's files, or fails to.                                                          |
| `renderer.long_task`  | info  | all  | renderer                                | A task in the editor window runs for over 200 ms.                                                            |
| `report.sent`         | info  | all  | main                                    | Help > Report a problem, parity report or report_problem sends a report.                                     |
| `request.handled`     | debug | all  | service, main                           | The service or main answers another process's request.                                                       |
| `server.failed`       | warn  | all  | service                                 | A server the process manager started can't start.                                                            |
| `server.started`      | info  | all  | service                                 | A server the process manager started answers at its address.                                                 |
| `service.exited`      | warn  | all  | main                                    | The project service exits while the app runs: it failed, or a fresh one replaced it. Not as the app quits.   |
| `service.lag`         | warn  | all  | service                                 | The project service's event loop is late by over 200 ms.                                                     |
| `setting.changed`     | info  | all  | renderer                                | A preference or the telemetry level is changed.                                                              |
| `start.action`        | info  | all  | renderer                                | A control on Home or a new tab's start page is used.                                                         |
| `styles.imported`     | info  | all  | renderer                                | A library's styles are imported into the project's stylesheet.                                               |
| `tab.closed`          | info  | all  | renderer                                | A tab closes.                                                                                                |
| `tab.opened`          | info  | all  | renderer                                | A tab opens, for a project or as a new tab.                                                                  |
| `tab.switched`        | info  | all  | renderer                                | Another tab, or Home, comes to the front.                                                                    |
| `text.edited`         | info  | all  | renderer                                | Editing a text layer in place on the canvas ends.                                                            |
| `tokens.saved`        | info  | all  | renderer                                | Token changes are written to the stylesheet, or fail to be.                                                  |
| `update.checked`      | info  | all  | main                                    | A check for an update finds one or finds none.                                                               |
| `update.downloaded`   | info  | all  | main                                    | An update finishes downloading.                                                                              |
| `update.failed`       | warn  | all  | main                                    | Checking for, downloading or installing an update fails.                                                     |
| `update.installed`    | info  | all  | main                                    | The app quits to install a downloaded update.                                                                |
| `window.hung`         | warn  | all  | main                                    | A window that stopped answering answers again.                                                               |

### `agent.called`

| Attribute      | Type                | Meaning                                                                                                |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `method`       | `string`            | The operation called, such as `exec` or `screenshot`, or `unreadable`                                  |
| `transport`    | `"cli" \| "mcp"`    | How the agent called: `cli` for the parity command, `mcp` for MCP                                      |
| `agent`        | `string`, optional  | The caller's declared name, as PAR-450 has it                                                          |
| `client`       | `string`, optional  | The MCP client's program, such as `claude-code`                                                        |
| `input`        | `string`, optional  | The call's params as JSON, without an exec call's snippet, cut at 2,000 characters                     |
| `snippet`      | `string`, optional  | An exec call's snippet, cut at 10,000 characters                                                       |
| `resultBytes`  | `integer`, optional | How long the answer was, as JSON, in characters                                                        |
| `code`         | `string`, optional  | The error code, when it failed                                                                         |
| `retryable`    | `boolean`, optional | Whether the failure says sending it again unchanged can succeed                                        |
| `alternatives` | `integer`, optional | How many alternatives the failure offered instead of what was asked for                                |
| `warnings`     | `string`, optional  | The answer's warning groups by category, with how many places each, such as `overlap:2 unknown_prop:1` |

### `agent.serverFailed`

| Attribute | Type               | Meaning                                   |
| --------- | ------------------ | ----------------------------------------- |
| `message` | `string`           | Why it couldn't start                     |
| `code`    | `string`, optional | The error's code, such as Node's `EACCES` |

### `app.first_project`

| Attribute        | Type      | Meaning                                                                                             |
| ---------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `firstProjectMs` | `integer` | From the process starting to the first project's tab being ready to draw                            |
| `restored`       | `boolean` | Whether the window opened it as it started, as last time's tabs, rather than the person choosing it |

### `app.quit`

| Attribute   | Type                                     | Meaning                                                                                   |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `reason`    | `"window closed" \| "update" \| "other"` | How it quit: the last window closed, to install an update, or otherwise, as from the menu |
| `sessionMs` | `integer`                                | How long this run lasted                                                                  |

### `app.started`

| Attribute        | Type      | Meaning                                                               |
| ---------------- | --------- | --------------------------------------------------------------------- |
| `mainReadyMs`    | `integer` | From the process starting to Electron being ready                     |
| `windowShownMs`  | `integer` | From the process starting to the first window being created and shown |
| `firstPaintMs`   | `integer` | From the process starting to the first window's first paint           |
| `serviceReadyMs` | `integer` | From the process starting to the project service starting to run      |

### `bitmapCache.used`

| Attribute        | Type      | Meaning                                                                                 |
| ---------------- | --------- | --------------------------------------------------------------------------------------- |
| `frameHits`      | `integer` | Frame bitmaps found kept on disk for the code they draw, this session                   |
| `frameMisses`    | `integer` | Frame bitmaps looked for on disk and not kept for the code they draw, this session      |
| `frameHitRate`   | `number`  | The share of frame bitmap lookups found this session, from 0 to 1                       |
| `previewHits`    | `integer` | Component previews found kept on disk for the code they draw, this session              |
| `previewMisses`  | `integer` | Component previews looked for on disk and not kept for the code they draw, this session |
| `previewHitRate` | `number`  | The share of component preview lookups found this session, from 0 to 1                  |

### `builder.crashed`

| Attribute  | Type                | Meaning                                                  |
| ---------- | ------------------- | -------------------------------------------------------- |
| `builder`  | `string`            | The builder's name, as Vite                              |
| `exitCode` | `integer`, optional | The builder process's exit code, when it exited with one |
| `signal`   | `string`, optional  | The signal that ended it, when one did                   |
| `output`   | `string`            | The last of what it printed, up to 50 lines              |

### `builder.ready`

| Attribute    | Type      | Meaning                                        |
| ------------ | --------- | ---------------------------------------------- |
| `builder`    | `string`  | The builder's name, as Vite                    |
| `durationMs` | `number`  | How long it took, in milliseconds              |
| `restart`    | `boolean` | Whether it was started again, as after a crash |

### `builder.restarted`

| Attribute    | Type               | Meaning                                         |
| ------------ | ------------------ | ----------------------------------------------- |
| `builder`    | `string`           | The builder's name, as Vite                     |
| `durationMs` | `number`           | How long it took, in milliseconds               |
| `outcome`    | `"ok" \| "error"`  | Whether it answered again                       |
| `code`       | `string`, optional | The `CodedError` code, when the failure has one |

### `builder.started`

| Attribute | Type     | Meaning            |
| --------- | -------- | ------------------ |
| `builder` | `string` | The builder's name |

### `cli.connectFailed`

| Attribute | Type                               | Meaning                                                                                            |
| --------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `code`    | `"not_running" \| "not_answering"` | `not_running` when no copy of the app is registered, `not_answering` when none registered answered |
| `copies`  | `integer`                          | How many copies of the app were registered                                                         |

### `cli.ran`

| Attribute  | Type                | Meaning                                                                |
| ---------- | ------------------- | ---------------------------------------------------------------------- |
| `command`  | `string`            | The command, such as `exec` or `mcp`, or `help` with none              |
| `flags`    | `string[]`          | The flags given, by name, without their values                         |
| `exitCode` | `integer`, optional | What the command exited with: 0, or 1 when it failed or found problems |
| `code`     | `string`, optional  | The error code, when it failed                                         |

### `cli.versionMismatch`

| Attribute     | Type                                 | Meaning                                                                                               |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `cause`       | `"app_newer" \| "unreadable_answer"` | `app_newer` when the app's registry entry is newer, `unreadable_answer` when its answer doesn't check |
| `cliRegistry` | `integer`                            | The registry version this CLI reads                                                                   |
| `appRegistry` | `integer`, optional                  | The registry version the app wrote, for `app_newer`                                                   |
| `method`      | `string`, optional                   | The method whose answer couldn't be read, for `unreadable_answer`                                     |

### `clipboard.failed`

| Attribute | Type                                                                                        | Meaning                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `how`     | `"paste" \| "over" \| "replace" \| "here"`                                                  | Which paste: Paste, Paste over selection, Paste to replace, or Paste here                                                                                                        |
| `content` | `"layers" \| "designs" \| "notes" \| "image" \| "svg" \| "text" \| "empty" \| "unreadable"` | What was on the clipboard: Parity's layers, designs or notes, an image, SVG markup, text, nothing, or a copy that can't be read                                                  |
| `reason`  | `"empty" \| "unreadable" \| "wrongKind" \| "noTarget" \| "instance" \| "imageFailed"`       | Why nothing was pasted: nothing to paste, a copy that can't be read, content that can't go there, no layout there, layers inside an instance, or an image that couldn't be saved |
| `code`    | `string`, optional                                                                          | The error code, when saving an image failed                                                                                                                                      |

### `clipboard.pasted`

| Attribute | Type                                                                                        | Meaning                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `how`     | `"paste" \| "over" \| "replace" \| "here"`                                                  | Which paste: Paste, Paste over selection, Paste to replace, or Paste here                                                       |
| `content` | `"layers" \| "designs" \| "notes" \| "image" \| "svg" \| "text" \| "empty" \| "unreadable"` | What was on the clipboard: Parity's layers, designs or notes, an image, SVG markup, text, nothing, or a copy that can't be read |
| `count`   | `integer`                                                                                   | How many layers, designs or notes were pasted                                                                                   |

### `command.ran`

| Attribute | Type                                                                                  | Meaning                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `action`  | `string`                                                                              | The action's ID in the keymap, as `chrome/actions.ts` names it                                                                    |
| `from`    | `"key" \| "menu" \| "canvasMenu" \| "layersMenu" \| "search" \| "toolbar" \| "panel"` | What ran it: a key, the menubar, the canvas's or a Layers row's menu, Search actions, the toolbar, or a button in a panel or page |
| `enabled` | `boolean`                                                                             | Whether it applied then. One that didn't is recorded as cancelled, without running                                                |
| `layers`  | `integer`                                                                             | How many layers were selected                                                                                                     |
| `designs` | `integer`                                                                             | How many designs were selected, with no layer inside one                                                                          |
| `code`    | `string`, optional                                                                    | The error code, when it failed                                                                                                    |

### `component.changed`

| Attribute   | Type                              | Meaning                                                                                                                       |
| ----------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `action`    | `"detach" \| "push" \| "extract"` | What was done: an instance detached into plain layers, a copy's overrides pushed to its component, or layers made a component |
| `design`    | `string`                          | The design whose layers it changed, by key                                                                                    |
| `layers`    | `string[]`                        | The layers: the instance detached or pushed, a layer inside one by path, or the layers made a component                       |
| `component` | `string`                          | The component, by id: the one the copy follows, or the one made                                                               |

### `data.invalid`

| Attribute | Type       | Meaning                                                       |
| --------- | ---------- | ------------------------------------------------------------- |
| `schema`  | `string`   | The schema's name, or the function that checked with it       |
| `pointer` | `string`   | Where the first problem is, as a JSON pointer                 |
| `message` | `string`   | What was expected there                                       |
| `issues`  | `string[]` | Every problem zod found, as `/pointer: message`, the first 20 |
| `data`    | `string`   | The data that failed, as JSON, cut to 2,000 characters        |

### `dialog.opened`

| Attribute | Type     | Meaning                                                     |
| --------- | -------- | ----------------------------------------------------------- |
| `dialog`  | `string` | Which dialog: settings, shortcuts, about, actions or report |

### `document.saveFailed`

| Attribute    | Type               | Meaning                                         |
| ------------ | ------------------ | ----------------------------------------------- |
| `file`       | `string`           | The file written                                |
| `durationMs` | `number`           | How long it took                                |
| `bytes`      | `integer`          | The document's size as JSON                     |
| `code`       | `string`, optional | The `CodedError` code, when the failure has one |

### `document.saved`

| Attribute    | Type      | Meaning                     |
| ------------ | --------- | --------------------------- |
| `file`       | `string`  | The file written            |
| `durationMs` | `number`  | How long it took            |
| `bytes`      | `integer` | The document's size as JSON |

### `edit.redone`

| Attribute | Type       | Meaning                                                                   |
| --------- | ---------- | ------------------------------------------------------------------------- |
| `step`    | `string`   | The step's label, as Edit > Undo names it: `Move frame`, `Change padding` |
| `designs` | `string[]` | The designs it changed, by key                                            |
| `files`   | `string[]` | The files it changed, which are written again                             |
| `modes`   | `boolean`  | Whether it changed the project's modes                                    |
| `tokens`  | `boolean`  | Whether it changed token values                                           |

### `edit.undone`

| Attribute | Type       | Meaning                                                                   |
| --------- | ---------- | ------------------------------------------------------------------------- |
| `step`    | `string`   | The step's label, as Edit > Undo names it: `Move frame`, `Change padding` |
| `designs` | `string[]` | The designs it changed, by key                                            |
| `files`   | `string[]` | The files it changed, which are written again                             |
| `modes`   | `boolean`  | Whether it changed the project's modes                                    |
| `tokens`  | `boolean`  | Whether it changed token values                                           |

### `error.caught`

| Attribute | Type               | Meaning                                            |
| --------- | ------------------ | -------------------------------------------------- |
| `action`  | `string`           | What failed, as `document.save` or `export.layers` |
| `title`   | `string`           | The notification's title                           |
| `message` | `string`           | The error's message                                |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one    |
| `context` | `object`, optional | What it was acting on                              |

### `export.done`

| Attribute    | Type                    | Meaning                                                                                        |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `kind`       | `"layers" \| "designs"` | Layers at the Export section's sizes, or whole designs as images                               |
| `formats`    | `("png" \| "jpg")[]`    | The formats written                                                                            |
| `scales`     | `number[]`              | The scales written                                                                             |
| `designs`    | `integer`               | The designs and layers exported                                                                |
| `states`     | `integer`, optional     | The states exported, when they're counted                                                      |
| `durationMs` | `integer`               | From asking for the export, once its folder is picked, until its files are written or it fails |
| `files`      | `integer`               | The files written                                                                              |

### `export.failed`

| Attribute    | Type                    | Meaning                                                                                        |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `kind`       | `"layers" \| "designs"` | Layers at the Export section's sizes, or whole designs as images                               |
| `formats`    | `("png" \| "jpg")[]`    | The formats written                                                                            |
| `scales`     | `number[]`              | The scales written                                                                             |
| `designs`    | `integer`               | The designs and layers exported                                                                |
| `states`     | `integer`, optional     | The states exported, when they're counted                                                      |
| `durationMs` | `integer`               | From asking for the export, once its folder is picked, until its files are written or it fails |
| `code`       | `string`, optional      | The `CodedError` code, when the failure has one                                                |

### `frame.failed`

| Attribute  | Type                                                               | Meaning                                                                                                               |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `design`   | `string`, optional                                                 | The design's key, as the document names it. None for a component preview                                              |
| `state`    | `string`, optional                                                 | The design's state, when it draws one                                                                                 |
| `mode`     | `string`, optional                                                 | The mode it draws in, by ID                                                                                           |
| `priority` | `string`                                                           | The queue it waited in: render, visible or idle                                                                       |
| `failure`  | `"module not found" \| "render threw" \| "timed out" \| "crashed"` | Why: its module didn't load, its code threw while drawing, it didn't finish in time, or its window's renderer crashed |
| `message`  | `string`                                                           | The guest's error message, or what happened to its window                                                             |
| `stack`    | `string`, optional                                                 | The guest's stack, when it threw an error that has one                                                                |

### `frame.rendered`

| Attribute   | Type                                                                         | Meaning                                                                                                               |
| ----------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `design`    | `string`, optional                                                           | The design's key, as the document names it. None for a component preview                                              |
| `state`     | `string`, optional                                                           | The design's state, when it draws one                                                                                 |
| `mode`      | `string`, optional                                                           | The mode it draws in, by ID                                                                                           |
| `priority`  | `string`                                                                     | The queue it waited in: render, visible or idle                                                                       |
| `queuedMs`  | `integer`                                                                    | How long it waited for an offscreen window                                                                            |
| `whole`     | `boolean`                                                                    | Whether it was drawn whole, to capture or check it                                                                    |
| `renderMs`  | `integer`, optional                                                          | How long the guest took to draw and measure it                                                                        |
| `captureMs` | `integer`, optional                                                          | How long settling, checking and capturing it took after that, when it was drawn whole                                 |
| `width`     | `number`, optional                                                           | Its width in CSS pixels                                                                                               |
| `height`    | `number`, optional                                                           | Its height in CSS pixels                                                                                              |
| `nodes`     | `integer`, optional                                                          | How many layers were measured                                                                                         |
| `failure`   | `"module not found" \| "render threw" \| "timed out" \| "crashed"`, optional | Why: its module didn't load, its code threw while drawing, it didn't finish in time, or its window's renderer crashed |

### `gesture.ended`

| Attribute    | Type                                                                                                                                                             | Meaning                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `kind`       | `"move" \| "resize" \| "layerDrag" \| "absoluteDrag" \| "titleDrag" \| "boxSelect" \| "frameDraw" \| "nudge" \| "fieldNudge" \| "insertDrag" \| "pan" \| "zoom"` | The gesture, as `canvas/gesture.ts` names it                           |
| `how`        | `"release" \| "escape" \| "interrupted" \| "cancelled" \| "settled" \| "selection" \| "ended"`                                                                   | How it ended                                                           |
| `kept`       | `boolean`                                                                                                                                                        | Whether what it did stands, rather than being taken back or called off |
| `durationMs` | `number`                                                                                                                                                         | From when it began to when it ended, in milliseconds                   |
| `designs`    | `string[]`, optional                                                                                                                                             | The designs it moved or changed, by key                                |
| `layers`     | `string[]`, optional                                                                                                                                             | The layers it moved                                                    |
| `fps`        | `number`, optional                                                                                                                                               | Frames the window drew per second during it                            |
| `presses`    | `integer`, optional                                                                                                                                              | How many presses a run took                                            |
| `undoStep`   | `boolean`                                                                                                                                                        | Whether it became an undo step                                         |

### `gesture.ran`

| Attribute | Type               | Meaning                                             |
| --------- | ------------------ | --------------------------------------------------- |
| `gesture` | `string`           | The gesture's kind, as `canvas/gesture.ts` names it |
| `how`     | `string`, optional | How it ended: release, escape or interrupted        |

### `insert.done`

| Attribute   | Type                                                                                 | Meaning                                                                                       |
| ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `source`    | `"components" \| "icons" \| "images" \| "paste" \| "drop"`                           | Where it came from: the Assets panel's Components, Icons or Images, a paste, or files dropped |
| `via`       | `"click" \| "drag" \| "quickInsert" \| "clipboard" \| "files"`                       | How: clicked or dragged from the panel, Quick insert, the clipboard, or files dropped         |
| `kind`      | `"component" \| "instance" \| "image" \| "layers" \| "designs" \| "notes" \| "text"` | What it inserted                                                                              |
| `item`      | `string`, optional                                                                   | Which: the component, the design an instance places, or the image's file                      |
| `count`     | `integer`                                                                            | How many layers, designs or notes went in                                                     |
| `design`    | `string`, optional                                                                   | The design it went into, by key                                                               |
| `newDesign` | `boolean`                                                                            | Whether it made a design of its own, with nothing to go into                                  |

### `inspector.changed`

| Attribute | Type               | Meaning                                                                                                                                                                         |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field`   | `string`           | What it changed: a style row (`style.padding`), a prop (`props.variant`), `name`, a param (`params.size`), a token (`token.primary`) or another field the Editing section lists |
| `design`  | `string`, optional | The design, by key; none for a token, which the whole project shares                                                                                                            |
| `layers`  | `string[]`         | The layers it changed; none for the design's own name, states and params, or a token                                                                                            |
| `state`   | `string`, optional | The state the edit went to, by id                                                                                                                                               |
| `from`    | `string`           | The value before, as JSON; `mixed` when the layers differed                                                                                                                     |
| `to`      | `string`           | The value after, as JSON                                                                                                                                                        |
| `gesture` | `boolean`          | Whether it's part of a run of Up and Down presses                                                                                                                               |

### `ipc.failed`

| Attribute | Type               | Meaning                                         |
| --------- | ------------------ | ----------------------------------------------- |
| `method`  | `string`           | The service method asked                        |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one |

### `library.added`

| Attribute | Type               | Meaning                                        |
| --------- | ------------------ | ---------------------------------------------- |
| `package` | `string`           | The library, by its catalog ID or package name |
| `version` | `string`, optional | The version installed, when known              |

### `library.failed`

| Attribute | Type               | Meaning                                         |
| --------- | ------------------ | ----------------------------------------------- |
| `package` | `string`           | The library, by its catalog ID or package name  |
| `version` | `string`, optional | The version installed, when known               |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one |

### `main.blocked`

| Attribute | Type      | Meaning                                                                 |
| --------- | --------- | ----------------------------------------------------------------------- |
| `stuckMs` | `integer` | How late main's timer ran, which is how long its event loop was blocked |

### `mcp.session`

| Attribute         | Type               | Meaning                                                        |
| ----------------- | ------------------ | -------------------------------------------------------------- |
| `client`          | `string`, optional | The MCP client's name from `initialize`, such as `claude-code` |
| `clientVersion`   | `string`, optional | The MCP client's version from `initialize`                     |
| `protocolVersion` | `string`, optional | The MCP protocol version the client asked for                  |

### `mode.switched`

| Attribute | Type                     | Meaning                       |
| --------- | ------------------------ | ----------------------------- |
| `mode`    | `"design" \| "interact"` | The mode the canvas is in now |

### `panel.shown`

| Attribute | Type                             | Meaning                                                |
| --------- | -------------------------------- | ------------------------------------------------------ |
| `panel`   | `"left" \| "right" \| "console"` | The side panel, or the console under the canvas        |
| `tab`     | `string`, optional               | The tab the side panel shows, such as layers or design |

### `preview.failed`

| Attribute    | Type                                                 | Meaning                                                                                                         |
| ------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `component`  | `string`                                             | The component it pictures, by ID                                                                                |
| `reason`     | `"render threw" \| "drew nothing" \| "not finished"` | Why: its component failed to draw, it drew nothing to see, or the draw didn't finish, as when its window closed |
| `message`    | `string`, optional                                   | What went wrong, when there's an error                                                                          |
| `durationMs` | `integer`                                            | From asking for it to giving up                                                                                 |

### `preview.made`

| Attribute    | Type      | Meaning                                                                    |
| ------------ | --------- | -------------------------------------------------------------------------- |
| `component`  | `string`  | The component it pictures, by ID                                           |
| `durationMs` | `integer` | From asking for it to keeping it, waiting for an offscreen window included |
| `width`      | `number`  | The large picture's width in pixels                                        |
| `height`     | `number`  | The large picture's height in pixels                                       |
| `bytes`      | `integer` | The size of both pictures kept, in bytes                                   |

### `process.memory`

| Attribute      | Type                   | Meaning                                                                                   |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| `reason`       | `"interval" \| "hang"` | Whether it's the regular reading or one taken as a window hung                            |
| `mainBytes`    | `integer`              | The app's main process's private memory in bytes                                          |
| `serviceBytes` | `integer`              | The project service's private memory in bytes, or 0 while none runs                       |
| `editorBytes`  | `integer`              | Every editor window's private memory together, in bytes                                   |
| `renderBytes`  | `integer`              | The offscreen renderers' private memory together, in bytes                                |
| `totalBytes`   | `integer`              | Every process's private memory together, in bytes, counting builders, the GPU and helpers |
| `processes`    | `object[]`             | Each process's role and private memory in bytes, as the system's monitor counts it        |

### `project.closed`

| Attribute | Type     | Meaning                                                 |
| --------- | -------- | ------------------------------------------------------- |
| `name`    | `string` | The project's name, from its package.json or its folder |
| `root`    | `string` | The project's folder                                    |
| `openMs`  | `number` | How long it was open, in milliseconds                   |

### `project.detected`

| Attribute | Type     | Meaning              |
| --------- | -------- | -------------------- |
| `root`    | `string` | The project's folder |

### `project.drawn`

| Attribute    | Type                 | Meaning                                                                     |
| ------------ | -------------------- | --------------------------------------------------------------------------- |
| `name`       | `string`             | The project's name, from its package.json or its folder                     |
| `root`       | `string`             | The project's folder                                                        |
| `durationMs` | `number`             | From asking to open it until its canvas first drew a frame, in milliseconds |
| `from`       | `"live" \| "bitmap"` | Whether the frame drew its design, or showed a bitmap kept of it            |

### `project.loaded`

| Attribute      | Type                | Meaning                                                                                            |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `name`         | `string`            | The project's name, from its package.json or its folder                                            |
| `root`         | `string`            | The project's folder                                                                               |
| `durationMs`   | `number`            | From asking to open it until its tab is ready, in milliseconds                                     |
| `componentsMs` | `number`            | How long its guest and components took to load in the window                                       |
| `components`   | `integer`           | The components it has                                                                              |
| `restored`     | `boolean`, optional | Whether the window opened it as it started, as last time's tabs, rather than the person opening it |

### `project.openFailed`

| Attribute     | Type                       | Meaning                                                                            |
| ------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `name`        | `string`                   | The project's name, from its package.json or its folder                            |
| `root`        | `string`                   | The project's folder                                                               |
| `reopen`      | `boolean`                  | Whether it was reopened as Parity started, because it was open last time (PAR-179) |
| `durationMs`  | `number`                   | How long it took, in milliseconds                                                  |
| `detectionMs` | `number`, optional         | How long detection took, when it finished                                          |
| `builderMs`   | `number`, optional         | How long the builder took to answer, when it did                                   |
| `framework`   | `string`, optional         | The renderer's ID, as `react`, once one was found                                  |
| `builder`     | `string`, optional         | The builder's ID, as `vite`, once one was found                                    |
| `react`       | `string`, optional         | The React version installed, once detection found it                               |
| `vite`        | `string`, optional         | The Vite version installed, once detection found it                                |
| `tailwind`    | `string`, optional         | The Tailwind version installed, once detection found it                            |
| `storybook`   | `string`, optional         | The Storybook version installed, once detection found it                           |
| `typescript`  | `string`, optional         | The TypeScript version installed, once detection found it                          |
| `step`        | `"detection" \| "builder"` | The step that failed                                                               |
| `message`     | `string`                   | Why, as the tab says it                                                            |
| `code`        | `string`, optional         | The `CodedError` code, when the failure has one                                    |

### `project.opened`

| Attribute     | Type               | Meaning                                                                            |
| ------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `name`        | `string`           | The project's name, from its package.json or its folder                            |
| `root`        | `string`           | The project's folder                                                               |
| `reopen`      | `boolean`          | Whether it was reopened as Parity started, because it was open last time (PAR-179) |
| `durationMs`  | `number`           | How long it took, in milliseconds                                                  |
| `detectionMs` | `number`, optional | How long detection took, when it finished                                          |
| `builderMs`   | `number`, optional | How long the builder took to answer, when it did                                   |
| `framework`   | `string`, optional | The renderer's ID, as `react`, once one was found                                  |
| `builder`     | `string`, optional | The builder's ID, as `vite`, once one was found                                    |
| `react`       | `string`, optional | The React version installed, once detection found it                               |
| `vite`        | `string`, optional | The Vite version installed, once detection found it                                |
| `tailwind`    | `string`, optional | The Tailwind version installed, once detection found it                            |
| `storybook`   | `string`, optional | The Storybook version installed, once detection found it                           |
| `typescript`  | `string`, optional | The TypeScript version installed, once detection found it                          |
| `cached`      | `boolean`          | Whether its components and props came from the last detection, as nothing changed  |
| `components`  | `integer`          | The components it has                                                              |
| `designs`     | `integer`          | The designs in its project files                                                   |
| `tokens`      | `integer`          | The theme variables its styles have                                                |
| `libraries`   | `integer`          | The component libraries it depends on                                              |

### `project.opening`

| Attribute | Type               | Meaning                                                                        |
| --------- | ------------------ | ------------------------------------------------------------------------------ |
| `reload`  | `boolean`          | Whether the tab's project was opened again in place, as after adding a library |
| `root`    | `string`, optional | The project's folder                                                           |
| `name`    | `string`, optional | The project's name, from its package.json or its folder                        |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one                                |

### `project.unsupported`

| Attribute | Type                                            | Meaning                                                                            |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `reason`  | `"no_package" \| "no_renderer" \| "no_builder"` | Why: no package.json, no renderer for its framework, or no builder for its bundler |
| `detail`  | `string`                                        | What Parity found, as shown to the person opening it                               |

### `projectEdit.applied`

| Attribute | Type               | Meaning                                         |
| --------- | ------------------ | ----------------------------------------------- |
| `files`   | `string[]`         | The files it changed, by path                   |
| `outcome` | `"ok" \| "error"`  | Whether it worked                               |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one |

### `projectEdit.undone`

| Attribute | Type               | Meaning                                         |
| --------- | ------------------ | ----------------------------------------------- |
| `files`   | `string[]`         | The files it changed, by path                   |
| `outcome` | `"ok" \| "error"`  | Whether it worked                               |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one |

### `renderer.long_task`

| Attribute    | Type               | Meaning                                                               |
| ------------ | ------------------ | --------------------------------------------------------------------- |
| `durationMs` | `integer`          | How long the task ran                                                 |
| `action`     | `string`, optional | The input that started it, such as `pointerdown` or `keydown`, if any |

### `report.sent`

| Attribute    | Type                  | Meaning                                                         |
| ------------ | --------------------- | --------------------------------------------------------------- |
| `feedbackId` | `string`              | The Sentry event ID of the user feedback the report became      |
| `screenshot` | `boolean`             | Whether a screenshot of the window went with it                 |
| `afterCrash` | `boolean`             | Whether it was offered on start after the last run crashed      |
| `by`         | `"person" \| "agent"` | Who sent it: a person from Help, or an agent with parity report |

### `request.handled`

| Attribute | Type               | Meaning                        |
| --------- | ------------------ | ------------------------------ |
| `method`  | `string`           | The method asked for           |
| `code`    | `string`, optional | The error code, when it failed |

### `server.failed`

| Attribute    | Type                    | Meaning                                                         |
| ------------ | ----------------------- | --------------------------------------------------------------- |
| `kind`       | `string`                | The kind of server, as `storybook`                              |
| `name`       | `string`                | Its name, as the processes list shows it                        |
| `durationMs` | `number`                | How long it took, in milliseconds                               |
| `reason`     | `"exited" \| "timeout"` | Whether it stopped before it answered, or didn't answer in time |
| `output`     | `string`                | The last of what it printed, up to 50 lines                     |

### `server.started`

| Attribute    | Type     | Meaning                                  |
| ------------ | -------- | ---------------------------------------- |
| `kind`       | `string` | The kind of server, as `storybook`       |
| `name`       | `string` | Its name, as the processes list shows it |
| `durationMs` | `number` | How long it took, in milliseconds        |

### `service.exited`

| Attribute   | Type      | Meaning                                                                                                  |
| ----------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `exitCode`  | `integer` | The code the project service exited with                                                                 |
| `ranMs`     | `integer` | How long it ran before it exited                                                                         |
| `restarted` | `boolean` | Whether a fresh service takes its place: one replaced it, or a crash starts one, with back-off (PAR-788) |

### `service.lag`

| Attribute | Type      | Meaning                                                                        |
| --------- | --------- | ------------------------------------------------------------------------------ |
| `lateMs`  | `integer` | How late the service's timer ran, which is how long its event loop was blocked |

### `setting.changed`

| Attribute | Type                          | Meaning                                                  |
| --------- | ----------------------------- | -------------------------------------------------------- |
| `setting` | `string`                      | The setting's name, such as theme, snapping or telemetry |
| `value`   | `string \| number \| boolean` | Its new value; a list, such as the export sizes, as JSON |

### `start.action`

| Attribute | Type                                                                                                  | Meaning                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `page`    | `"home" \| "new"`                                                                                     | The start page it came from: Home, or a new tab                                                          |
| `action`  | `"new-project" \| "open-folder" \| "open-file" \| "recent-project" \| "search" \| "star" \| "forget"` | What was done: start a project, open a folder or file, open a listed project, search, star or forget one |

### `styles.imported`

| Attribute | Type               | Meaning                                        |
| --------- | ------------------ | ---------------------------------------------- |
| `package` | `string`           | The library, by its catalog ID or package name |
| `version` | `string`, optional | The version installed, when known              |
| `files`   | `string[]`         | The files it changed, by path                  |

### `tab.closed`

| Attribute | Type                           | Meaning                                            |
| --------- | ------------------------------ | -------------------------------------------------- |
| `kind`    | `"home" \| "project" \| "new"` | What the tab shows: Home, a project, or a new tab  |
| `tabs`    | `integer`                      | How many tabs are open after it, not counting Home |

### `tab.opened`

| Attribute | Type                           | Meaning                                            |
| --------- | ------------------------------ | -------------------------------------------------- |
| `kind`    | `"home" \| "project" \| "new"` | What the tab shows: Home, a project, or a new tab  |
| `tabs`    | `integer`                      | How many tabs are open after it, not counting Home |

### `tab.switched`

| Attribute | Type                           | Meaning                  |
| --------- | ------------------------------ | ------------------------ |
| `from`    | `"home" \| "project" \| "new"` | What was in front before |
| `to`      | `"home" \| "project" \| "new"` | What is in front now     |

### `text.edited`

| Attribute    | Type                                        | Meaning                                                                                       |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `design`     | `string`                                    | The design, by key                                                                            |
| `layer`      | `string`                                    | The text layer, by id                                                                         |
| `outcome`    | `"committed" \| "unchanged" \| "cancelled"` | Whether the text was changed, left as it was, or the editor closed before it could be written |
| `how`        | `"enter" \| "escape" \| "blur"`, optional   | What closed it: Enter, Escape, or clicking away                                               |
| `durationMs` | `number`                                    | How long it was open, in milliseconds                                                         |
| `length`     | `integer`                                   | How many characters the text has after it                                                     |

### `tokens.saved`

| Attribute | Type               | Meaning                                         |
| --------- | ------------------ | ----------------------------------------------- |
| `changes` | `integer`          | The tokens written                              |
| `files`   | `string[]`         | The files it changed, by path                   |
| `outcome` | `"ok" \| "error"`  | Whether it worked                               |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one |

### `update.checked`

| Attribute   | Type                 | Meaning                                   |
| ----------- | -------------------- | ----------------------------------------- |
| `channel`   | `"stable" \| "beta"` | The update channel this install takes     |
| `version`   | `string`             | The version running now                   |
| `available` | `string`, optional   | The newer version found, if there was one |

### `update.downloaded`

| Attribute   | Type                 | Meaning                               |
| ----------- | -------------------- | ------------------------------------- |
| `channel`   | `"stable" \| "beta"` | The update channel this install takes |
| `version`   | `string`             | The version running now               |
| `available` | `string`             | The version downloaded                |

### `update.failed`

| Attribute | Type                                 | Meaning                               |
| --------- | ------------------------------------ | ------------------------------------- |
| `channel` | `"stable" \| "beta"`                 | The update channel this install takes |
| `version` | `string`                             | The version running now               |
| `stage`   | `"check" \| "download" \| "install"` | What was under way when it failed     |
| `message` | `string`                             | What went wrong                       |

### `update.installed`

| Attribute   | Type                 | Meaning                               |
| ----------- | -------------------- | ------------------------------------- |
| `channel`   | `"stable" \| "beta"` | The update channel this install takes |
| `version`   | `string`             | The version running now               |
| `available` | `string`             | The version being installed           |

### `window.hung`

| Attribute | Type                     | Meaning                                                                                 |
| --------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `window`  | `"renderer" \| "render"` | Which window: `renderer` for the editor's, `render` for an offscreen one drawing frames |
| `stuckMs` | `integer`                | How long the window didn't answer                                                       |

<!-- End of the generated events. -->
