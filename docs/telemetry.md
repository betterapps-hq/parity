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
- **An agent's call starts its trace in the CLI,** which sends the headers with each request; the agent server's
  `agent.called` span continues it, so the call and the frame it drew are one trace.

To find one, open a span's trace in Sentry, or search spans by `trace` from an error.

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

| Event             | Level | Kept | Sent by       | When                                                                      |
| ----------------- | ----- | ---- | ------------- | ------------------------------------------------------------------------- |
| `action.ran`      | info  | all  | renderer      | An action runs from a key, a menu or the actions search, until it's done. |
| `agent.called`    | info  | all  | service       | The agent server answers a call from the CLI.                             |
| `builder.started` | info  | all  | service       | The service starts a project's builder, until it's spawned.               |
| `frame.drawn`     | debug | all  | main          | An offscreen window draws a frame or a preview, from its turn to the end. |
| `gesture.ran`     | info  | all  | renderer      | A press on the canvas becomes a drag, until the drag ends.                |
| `request.handled` | debug | all  | service, main | The service or main answers another process's request.                    |

### `action.ran`

| Attribute | Type               | Meaning                                                        |
| --------- | ------------------ | -------------------------------------------------------------- |
| `action`  | `string`           | The action's ID in the keymap, as `chrome/actions.ts` names it |
| `code`    | `string`, optional | The error code, when it failed                                 |

### `agent.called`

| Attribute | Type               | Meaning                        |
| --------- | ------------------ | ------------------------------ |
| `method`  | `string`           | The agent method called        |
| `agent`   | `string`, optional | The caller's name              |
| `code`    | `string`, optional | The error code, when it failed |

### `builder.started`

| Attribute | Type     | Meaning            |
| --------- | -------- | ------------------ |
| `builder` | `string` | The builder's name |

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

### `request.handled`

| Attribute | Type               | Meaning                        |
| --------- | ------------------ | ------------------------------ |
| `method`  | `string`           | The method asked for           |
| `code`    | `string`, optional | The error code, when it failed |

<!-- End of the generated events. -->
