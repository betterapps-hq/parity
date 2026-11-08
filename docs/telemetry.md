# Parity's own telemetry

> **The events are generated.** [Events](#events) is written from the schemas in `@parity-app/telemetry`, and a test
> fails when they disagree. To add an event, follow [Adding an event](#adding-an-event); to rewrite the list, run
> `pnpm exec vp test run packages/telemetry -u`. Everything else here is written by hand.

Parity sends what happens inside it to Sentry, so a bug that a tester or an agent hits arrives with its context: the
error, the trace from click to file write, the replay of the window and the events before it. This page says what's
sent, how to turn it down and what's kept out, and lists every event Parity records.

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

- **`environment`:** `development` for `pnpm dev` and agent drives, `ci` wherever `CI` is set, `tester` for installed
  builds.
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

Each process records events with `createTelemetry` and the app's Sentry sink (`apps/desktop/src/shared/sentry-sink.ts`):

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

- **The window starts a trace** for each action, as `action.ran` with its ID from `chrome/actions.ts`, and each canvas
  drag, as `gesture.ran` with its kind from `canvas/gesture.ts`. The service's requests made while it runs carry it.
- **Requests carry the trace** as `sentry-trace` and `baggage`, in the channel message's `trace` field. The service and
  main answer each in a `request.handled` span, with the error code when it fails.
- **Queued work keeps its trace:** an offscreen frame or preview is a `frame.drawn` span with how long it waited for a
  window, and a builder's start is `builder.started`.
- **An agent's call starts its trace in the CLI.** A `parity` command's calls carry its `cli.ran` span, and each MCP
  call starts a trace of its own. The agent server's `agent.called` span continues it, so the call and the frame it drew
  are one trace.

To find one, open a span's trace in Sentry, or search spans by `trace` from an error.

## Agents and the CLI

Agents' calls are recorded where they're answered, once for every operation, whichever way they came (PAR-641):

- **The agent server records each call as `agent.called`:** the operation, `cli` or `mcp`, the caller's declared name
  and MCP client, the params as JSON, the answer's size, and how it ended. A failure adds its code, `retryable` and how
  many alternatives it offered; a snippet or screenshot that failed without throwing counts as failed too. The answer's
  warning groups are listed by category. An `exec` call's snippet goes on the span by itself, so a failed snippet reads
  beside its error. `agentCallStart`, `agentCallAnswered` and `agentCallFailed` in `@parity-app/telemetry` read these
  from the body and the answer. When the server can't start, the service records `agent.serverFailed`.
- **The CLI records its own runs** through `@parity-app/telemetry`: `cli.ran` for each command, with the flags' names
  but not their values; `cli.connectFailed` when no copy of the app is registered (`not_running`) or none answers
  (`not_answering`); `cli.versionMismatch` when the app is newer than the CLI reads, or its answer doesn't check; and
  `mcp.session` with each MCP client's name and version. They're written to `~/.parity/logs/parity-cli-<date>.jsonl`,
  the newest 10 days kept, and don't go to Sentry until PAR-642.

## Turning it off

Telemetry is on by default everywhere Parity runs, development and CI included, each tagged with its environment. It's
either sent or not: errors, crashes, traces, events, replays and failure bitmaps all go, or nothing does. The local copy
is written either way. Unit tests leave it off.

- **Settings > Privacy > Share diagnostics** turns it off or on again, at once, with no restart. It's kept with the
  install ID in `<userData>/telemetry.json`, which the CLI reads too (`desktopDataFolder` in `@parity-app/telemetry`
  finds the folder).
- **`PARITY_TELEMETRY=all` or `off`** decides a run whatever the setting says, and **`DO_NOT_TRACK=1`** turns it off.
  Settings then shows the variable and leaves the switch disabled. Any other `PARITY_TELEMETRY` value stops the app.
- **The install ID** is a random UUID made on the first run and sent as Sentry's user. Turning sharing off makes a new
  one, so what's sent after turning it on again isn't linked to what came before. About shows it beside the versions.

## Replays and frame bitmaps

Sentry's Session Replay records the editor window, so a bug's event links to what happened before it: the panels, the
canvas, selections, menus and dialogs, as they looked, with what was clicked and typed. Nothing is masked, as with every
other event. The offscreen render windows aren't recorded, and neither are Storybook or the CLI.

- **While diagnostics are on, every session is recorded.** The share is `replaySessionRate` in
  `apps/desktop/src/renderer/replay.ts`, 1 for now; lower it when replay volume or Sentry's quota says so.
- **While they're off, nothing is recorded,** and the recorder isn't loaded. Turning them off in Settings stops it at
  once, and turning them on starts it.

A project's frames and icons are left out of replays, shown as boxes their size, and the recorder never sees their
shadow roots: it kept every one it saw, and with a frame's the closed project's canvas. The offscreen windows that draw
their bitmaps aren't recorded either, so failures carry the frames themselves:

- **Every error from the editor window** has `frames.json` attached, listing the frames on the canvas: the project,
  design, state and mode of each, its size and whether it has a bitmap.
- **A frame whose offscreen capture fails** is reported as an error tagged `render: failed`, with the WebP bitmap the
  frame last showed attached as `frame.webp`, from before the edit whose render failed. A capture tried again until it
  works is reported once.

The frames are noted in `apps/desktop/src/renderer/canvas/frames-on-screen.ts`.

The window asks main whether diagnostics are on as it starts, so the recorder starts a moment after the page. Replay
recordings aren't scrubbed for secrets yet; Sentry's server-side scrubbing is the only net there (PAR-679).

## Secrets are scrubbed

Names, paths, values and messages are sent as written, since they're what makes a bug findable. Secrets aren't: they're
replaced with `[redacted]` in every string and stack frame, in every process, before anything leaves it. Sentry's own
server-side scrubbing stays on as a second net.

`createScrubber()` in `@parity-app/telemetry` does it. `createTelemetry` runs one on every event's attributes before its
sinks, and each process's Sentry setup (`main/telemetry.ts`, `renderer/telemetry.ts`, `utility/telemetry.ts`) runs one
in `beforeSend`, `beforeSendTransaction`, `beforeSendLog` and `beforeBreadcrumb`. It replaces:

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
`setSecrets()`. The CLI doesn't send to Sentry yet, so it reads none.

What was chosen and why is in [decisions.md](decisions.md), "Secrets are scrubbed before any event leaves a process".

## Levels and sampling

Each event has a level, lowest first: `debug`, `info`, `warn`, `error` and `fatal`. `error` and `fatal` events also
become Sentry errors, as every `error.*` event does. **Kept** is the share of an event that's recorded: all of them
unless the event says otherwise. Sampling is decided when an event is tracked or a span starts.

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

| Event                 | Level | Kept | Sent by                                 | When                                                                                |
| --------------------- | ----- | ---- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `action.ran`          | info  | all  | renderer                                | An action runs from a key, a menu or the actions search, until it's done.           |
| `agent.called`        | info  | all  | service                                 | The agent server answers a call from the CLI or MCP, from reading it to the answer. |
| `agent.serverFailed`  | error | all  | service                                 | The agent server can't start, so agents can't reach this copy.                      |
| `app.quit`            | info  | all  | main                                    | The app quits.                                                                      |
| `app.started`         | info  | all  | main                                    | The first window has painted and the project service is running.                    |
| `builder.started`     | info  | all  | service                                 | The service starts a project's builder, until it's spawned.                         |
| `cli.connectFailed`   | warn  | all  | cli                                     | The CLI can't reach a running copy of the app for a call.                           |
| `cli.ran`             | info  | all  | cli                                     | A `parity` command runs, until it's done.                                           |
| `cli.versionMismatch` | warn  | all  | cli                                     | The CLI and the app it calls are versions apart that don't fit.                     |
| `data.invalid`        | warn  | all  | main, renderer, render, service, worker | A check of a file, input, setting or response Parity didn't make fails.             |
| `dialog.opened`       | info  | all  | renderer                                | One of the app's own dialogs opens.                                                 |
| `document.saveFailed` | warn  | all  | renderer                                | A design file couldn't be saved.                                                    |
| `document.saved`      | info  | all  | renderer                                | A design file is saved.                                                             |
| `error.caught`        | error | all  | renderer                                | A failure is shown as an error notification.                                        |
| `export.done`         | info  | all  | renderer                                | An export finishes.                                                                 |
| `export.failed`       | warn  | all  | renderer                                | An export fails.                                                                    |
| `frame.drawn`         | debug | all  | main                                    | An offscreen window draws a frame or a preview, from its turn to the end.           |
| `gesture.ran`         | info  | all  | renderer                                | A press on the canvas becomes a drag, until the drag ends.                          |
| `ipc.failed`          | warn  | all  | renderer                                | A request to the project service fails.                                             |
| `library.added`       | info  | all  | renderer                                | A catalog library is installed into the project.                                    |
| `library.failed`      | warn  | all  | renderer                                | A catalog library couldn't be installed.                                            |
| `mcp.session`         | info  | all  | cli                                     | An MCP client starts a session with `parity mcp`.                                   |
| `mode.switched`       | info  | all  | renderer                                | The canvas switches between designing and Interact, where designs take the pointer. |
| `panel.shown`         | info  | all  | renderer                                | A side panel or the console opens, or a side panel shows another tab.               |
| `process.memory`      | info  | all  | main                                    | Every 5 minutes, and when a window stops answering.                                 |
| `project.unsupported` | warn  | all  | service                                 | A project is opened that Parity doesn't support.                                    |
| `projectEdit.applied` | info  | all  | renderer                                | Parity changes the project's files and says so, with Undo.                          |
| `projectEdit.undone`  | info  | all  | renderer                                | Undo puts back a project edit's files, or fails to.                                 |
| `renderer.long_task`  | info  | all  | renderer                                | A task in the editor window runs for over 200 ms.                                   |
| `report.sent`         | info  | all  | main                                    | Help > Report a problem sends a report.                                             |
| `request.handled`     | debug | all  | service, main                           | The service or main answers another process's request.                              |
| `service.lag`         | warn  | all  | service                                 | The project service's event loop is late by over 200 ms.                            |
| `setting.changed`     | info  | all  | renderer                                | A preference or the telemetry level is changed.                                     |
| `start.action`        | info  | all  | renderer                                | A control on Home or a new tab's start page is used.                                |
| `styles.imported`     | info  | all  | renderer                                | A library's styles are imported into the project's stylesheet.                      |
| `tab.closed`          | info  | all  | renderer                                | A tab closes.                                                                       |
| `tab.opened`          | info  | all  | renderer                                | A tab opens, for a project or as a new tab.                                         |
| `tab.switched`        | info  | all  | renderer                                | Another tab, or Home, comes to the front.                                           |
| `tokens.saved`        | info  | all  | renderer                                | Token changes are written to the stylesheet, or fail to be.                         |
| `update.checked`      | info  | all  | main                                    | A check for an update finds one or finds none.                                      |
| `update.downloaded`   | info  | all  | main                                    | An update finishes downloading.                                                     |
| `update.failed`       | warn  | all  | main                                    | Checking for, downloading or installing an update fails.                            |
| `update.installed`    | info  | all  | main                                    | The app quits to install a downloaded update.                                       |

### `action.ran`

| Attribute | Type               | Meaning                                                        |
| --------- | ------------------ | -------------------------------------------------------------- |
| `action`  | `string`           | The action's ID in the keymap, as `chrome/actions.ts` names it |
| `code`    | `string`, optional | The error code, when it failed                                 |

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

### `error.caught`

| Attribute | Type               | Meaning                                            |
| --------- | ------------------ | -------------------------------------------------- |
| `action`  | `string`           | What failed, as `document.save` or `export.layers` |
| `title`   | `string`           | The notification's title                           |
| `message` | `string`           | The error's message                                |
| `code`    | `string`, optional | The `CodedError` code, when the failure has one    |
| `context` | `object`, optional | What it was acting on                              |

### `export.done`

| Attribute | Type                    | Meaning                                                          |
| --------- | ----------------------- | ---------------------------------------------------------------- |
| `kind`    | `"layers" \| "designs"` | Layers at the Export section's sizes, or whole designs as images |
| `formats` | `("png" \| "jpg")[]`    | The formats written                                              |
| `scales`  | `number[]`              | The scales written                                               |
| `designs` | `integer`               | The designs and layers exported                                  |
| `states`  | `integer`, optional     | The states exported, when they're counted                        |
| `files`   | `integer`               | The files written                                                |

### `export.failed`

| Attribute | Type                    | Meaning                                                          |
| --------- | ----------------------- | ---------------------------------------------------------------- |
| `kind`    | `"layers" \| "designs"` | Layers at the Export section's sizes, or whole designs as images |
| `formats` | `("png" \| "jpg")[]`    | The formats written                                              |
| `scales`  | `number[]`              | The scales written                                               |
| `designs` | `integer`               | The designs and layers exported                                  |
| `states`  | `integer`, optional     | The states exported, when they're counted                        |
| `code`    | `string`, optional      | The `CodedError` code, when the failure has one                  |

### `frame.drawn`

| Attribute  | Type      | Meaning                                                     |
| ---------- | --------- | ----------------------------------------------------------- |
| `priority` | `string`  | The queue it waited in: render, visible or background       |
| `queuedMs` | `number`  | How long it waited for an offscreen window, in milliseconds |
| `whole`    | `boolean` | Whether it was drawn whole, to capture or check it          |

### `gesture.ran`

| Attribute | Type               | Meaning                                             |
| --------- | ------------------ | --------------------------------------------------- |
| `gesture` | `string`           | The gesture's kind, as `canvas/gesture.ts` names it |
| `how`     | `string`, optional | How it ended: release, escape or interrupted        |

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

### `process.memory`

| Attribute   | Type                   | Meaning                                                                            |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `reason`    | `"interval" \| "hang"` | Whether it's the regular reading or one taken as a window hung                     |
| `processes` | `object[]`             | Each process's role and private memory in bytes, as the system's monitor counts it |

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

| Attribute    | Type      | Meaning                                                    |
| ------------ | --------- | ---------------------------------------------------------- |
| `feedbackId` | `string`  | The Sentry event ID of the user feedback the report became |
| `screenshot` | `boolean` | Whether the person included a screenshot of the window     |
| `afterCrash` | `boolean` | Whether it was offered on start after the last run crashed |

### `request.handled`

| Attribute | Type               | Meaning                        |
| --------- | ------------------ | ------------------------------ |
| `method`  | `string`           | The method asked for           |
| `code`    | `string`, optional | The error code, when it failed |

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

<!-- End of the generated events. -->
