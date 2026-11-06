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
up. Main also writes every event to rotating log files, a local copy that's kept even with telemetry off.

Every event carries the same envelope besides its own attributes: its `name`, `time` and `level`; the `process` it came
from (`main`, `renderer`, `render`, `service`, `worker`, `builder` or `cli`); the `installId`, the `sessionId` of this
run and, where there is one, the `windowId` and `project`. An event inside a trace adds its `traceId` and `spanId`, and
a span adds its `parentSpanId`, `durationMs` and `outcome` (`ok`, `error` or `cancelled`).

## Turning it down or off

Telemetry is on by default, at its fullest level, everywhere Parity runs, development and CI included, each tagged with
its environment. Unit tests leave it off.

| Level             | Sent                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| **All** (default) | Errors, crashes, traces, events, replays and failure bitmaps             |
| **Errors**        | Errors and crashes, with their breadcrumbs, traces and the replay buffer |
| **Off**           | Nothing; the local copy is still written                                 |

Choose the level in Settings > Telemetry, or set `PARITY_TELEMETRY` to `all`, `errors` or `off`. The CLI reads the same
setting and variable.

## Replays and frame bitmaps

Sentry's Session Replay records the editor window, so a bug's event links to what happened before it: the panels, the
canvas, selections, menus and dialogs, as they looked, with what was clicked and typed. Nothing is masked, as with every
other event. The offscreen render windows aren't recorded, and neither are Storybook or the CLI.

- **At All, every session is recorded.** The share is `replaySessionRate` in `apps/desktop/src/renderer/replay.ts`, 1
  for now; lower it when replay volume or Sentry's quota says so.
- **At Errors, only the buffer before an error is sent:** Sentry records about the last minute in memory and sends it
  with each error.
- **At Off, nothing is recorded,** and the recorder isn't started.

A project's frames are shadow roots in the editor page, so they're recorded with it, and zoomed out they're bitmaps,
recorded as images. The offscreen windows that draw those bitmaps aren't recorded, so failures carry the frames
themselves:

- **Every error from the editor window** has `frames.json` attached, listing the frames on the canvas: the project,
  design, state and mode of each, its size and whether it has a bitmap.
- **A frame whose offscreen capture fails** is reported as an error tagged `render: failed`, with the WebP bitmap the
  frame last showed attached as `frame.webp`, from before the edit whose render failed. A capture tried again until it
  works is reported once.

The frames are noted in `apps/desktop/src/renderer/canvas/frames-on-screen.ts`.

The window doesn't read the level itself: main passes it the level it started at as it opens the window. Replay
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
become Sentry errors. **Kept** is the share of an event that's recorded: all of them unless the event says otherwise.
Sampling is decided when an event is tracked or a span starts.

## Adding an event

1. Define it with `defineEvent` in `@parity-app/telemetry`. Give it a dotted name, area first (`project.opened`), and a
   `z.object` schema with a `.describe()` on every attribute saying what it means. Say its `level`, which processes send
   it (`sentBy`) and when (`when`, a sentence). Add `sample` to keep only a share.
2. Add it to `registeredEvents` in `packages/telemetry/src/registry.ts`, and to the events the sending process passes to
   `createTelemetry`.
3. Run `pnpm exec vp test run packages/telemetry -u` to rewrite [Events](#events), then review the diff and commit it
   with the event.

`packages/telemetry/src/catalog.test.ts` fails when this page and the registry disagree, and says how to regenerate it.

## Events

<!-- Generated from the event registry: see “Adding an event”. -->

No events are registered yet.

<!-- End of the generated events. -->
