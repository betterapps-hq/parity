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

| Event             | Level | Kept | Sent by  | When                                                                                |
| ----------------- | ----- | ---- | -------- | ----------------------------------------------------------------------------------- |
| `dialog.opened`   | info  | all  | renderer | One of the app's own dialogs opens.                                                 |
| `mode.switched`   | info  | all  | renderer | The canvas switches between designing and Interact, where designs take the pointer. |
| `panel.shown`     | info  | all  | renderer | A side panel or the console opens, or a side panel shows another tab.               |
| `setting.changed` | info  | all  | renderer | A preference or the telemetry level is changed.                                     |
| `start.action`    | info  | all  | renderer | A control on Home or a new tab's start page is used.                                |
| `tab.closed`      | info  | all  | renderer | A tab closes.                                                                       |
| `tab.opened`      | info  | all  | renderer | A tab opens, for a project or as a new tab.                                         |
| `tab.switched`    | info  | all  | renderer | Another tab, or Home, comes to the front.                                           |

### `dialog.opened`

| Attribute | Type     | Meaning                                             |
| --------- | -------- | --------------------------------------------------- |
| `dialog`  | `string` | Which dialog: settings, shortcuts, about or actions |

### `mode.switched`

| Attribute | Type                     | Meaning                       |
| --------- | ------------------------ | ----------------------------- |
| `mode`    | `"design" \| "interact"` | The mode the canvas is in now |

### `panel.shown`

| Attribute | Type                             | Meaning                                                |
| --------- | -------------------------------- | ------------------------------------------------------ |
| `panel`   | `"left" \| "right" \| "console"` | The side panel, or the console under the canvas        |
| `tab`     | `string`, optional               | The tab the side panel shows, such as layers or design |

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

<!-- End of the generated events. -->
