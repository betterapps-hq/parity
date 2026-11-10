# Telemetry coverage

What Parity's own telemetry collects, where it goes, who sees it, and what it still misses. It describes the code on
`main` and what Sentry holds, and changes with them: work that closes a gap, or changes what's sent, updates this page
in the same commit. The [decisions](#decisions-for-par-619) for the first public release are still Andrew's to make
(PAR-619).

## In one line

While Share diagnostics is on, which it is by default, Parity sends Sentry everything it records from every process.
That includes design, component and token names, file paths, values, error messages, a replay of the editor window
showing all its text, and pictures of designs. Only secrets are removed. Before anyone outside the testers runs it, that
needs a lighter default for public builds, a notice saying it's on, and masked replays.
[Decisions](#decisions-for-par-619) proposes one for each, and [What we might be missing](#what-we-might-be-missing)
lists the gaps that are left.

[telemetry.md](telemetry.md) catalogues every event and field, [sentry.md](sentry.md) covers Sentry's setup, and
[product-telemetry.md](proposals/product-telemetry.md) is the original plan. This page doesn't repeat them. It says what
all of it adds up to.

## What's collected

Each process records Parity's own typed events with `createTelemetry` in `@parity-app/telemetry`. In the process that
records it, an event becomes a Sentry breadcrumb, and an `error.*` event becomes a Sentry error. Main sends every event
on as a Sentry log and every span as a transaction, and writes both to the local copy. Sentry's SDKs add what they catch
themselves. Paths on this page are under `apps/desktop/src`, except that `cli/` is `packages/cli/src/`.

| Surface                    | Sentry SDK                                                  | Errors and crashes                                                                                                                                                           | Spans                                                                    | Events (logs, breadcrumbs)                                                                                                                       | Replay | Attachments                                                                    |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| Desktop main               | `@sentry/electron/main` (`main/telemetry.ts:165`)           | Uncaught errors, native minidumps, child processes that exit abnormally, run out of memory or fail to launch; main's loop blocked 2 s or more, as it starts and when it ends | Its own requests, `request.handled`                                      | Startup, quitting, updates, memory every 5 minutes, hangs, and every other process's events, which pass through main                             | No     | `failed-frame.png` on every error for 10 minutes after a frame fails offscreen |
| Editor window              | `@sentry/electron/renderer` (`renderer/telemetry.ts:28`)    | Uncaught errors, React render errors with the component stack, `error.caught` from every error toast, `ipc.failed`                                                           | `command.ran` for every action, `gesture.ran` for every drag             | Commands, gestures, inspector changes, inserts, pastes, undo, tabs, panels, dialogs, settings. The SDK adds console, click and fetch breadcrumbs | Yes    | `frames.json` on every error; `frame.webp` when an offscreen capture fails     |
| Render windows (offscreen) | `@sentry/electron/renderer`                                 | Uncaught errors; a frame whose capture fails                                                                                                                                 | `frame.rendered` for every frame                                         | `frame.failed`, with the guest's message and stack                                                                                               | No     | The frame's last bitmap                                                        |
| Service                    | `@sentry/electron/utility` (`utility/telemetry.ts:29`)      | Uncaught errors; a builder that crashes, with its last 50 lines of output                                                                                                    | `request.handled` for every request, `frame.rendered`, `builder.started` | Project opening and closing, detection, builders, previews, the bitmap cache, saves, exports, libraries, `data.invalid`                          | No     | None                                                                           |
| Props worker               | None; sends through the service (`worker-telemetry.ts:139`) | A crash, tagged `worker`                                                                                                                                                     | None                                                                     | Its events, through the service                                                                                                                  | No     | None                                                                           |
| Builders (dev servers)     | None                                                        | A crash, reported by the service with its output                                                                                                                             | `builder.started`                                                        | `builder.*` and `server.*` events, with 50 lines of output on failure                                                                            | No     | None                                                                           |
| Agent server (in service)  | The service's                                               | Failed calls, by code                                                                                                                                                        | `agent.called` for every call, continuing the CLI's trace                | The call's parameters as JSON (up to 2,000 characters), and an `exec` snippet (up to 10,000)                                                     | No     | Reports: the window's screenshot, the frames, the last hour of logs            |
| CLI and MCP                | `@sentry/node`, in a detached sender (`cli/send.ts:118`)    | Uncaught errors and uncoded failures, with full stacks                                                                                                                       | `cli.ran` for every command                                              | `cli.ran` (flag names, not values), `cli.connectFailed`, `cli.versionMismatch`, `mcp.session`. No SDK breadcrumbs                                | No     | None                                                                           |

Across all of them:

- **Every event carries the same envelope:** the install ID, the run's session ID, the window, the project's name, and
  the trace and span. Every error, span and log is tagged `environment`, `release`, `driver` (`person` or `agent`, with
  the agent's caller name and MCP client) and `test_run`.
- **Sentry's user** is the install ID, a random UUID that's replaced when sharing is turned off. Its name is
  `PARITY_TESTER` when that's set, or the agent's caller name while one drives.
- **Sentry works out the sender's country from their IP address, but no longer keeps the address.** Sentry's ingest
  reads it from the connection, though no code asks for it. Until 2026-11-09 it kept the address too. You chose then to
  keep the country and drop the address, so both projects now have "Prevent storing of IP addresses" on. Sentry still
  derives the location when that's on: country, and also region and city where it can.
- **Sentry's own sessions** come from main, so crash-free rates exist for the app. The CLI sends none.
- **Nothing is sampled.** No process sets `tracesSampleRate` or a sampler, so the SDKs make no spans of their own, and
  every span Parity makes is sent. No registered event uses `defineEvent`'s `sample` option.

### Report a problem

Help > Report a problem, `parity report` and MCP's `report_problem` send a Sentry user feedback from `parity-desktop`
(`main/report.ts`):

- What the person or agent wrote, tied to the replay and the trace.
- A screenshot of the window: the person can untick it, but an agent's report always has one, and frames the service
  draws for the design it names.
- `logs.jsonl`, the last hour of the local copy, scrubbed. Also `versions.json`, `projects.json`, and `crash.json` after
  a crash.

A person's report is sent even while Share diagnostics is off. For the up to 15 seconds it takes, Sentry is switched on
for the whole of main (`report.ts:237`), so anything else queued in that time goes too. An agent's report is refused
while it's off.

## What leaves the computer, and when

| Environment   | What sends it                                               | What's sent                                                                                         |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `development` | `pnpm dev`, agents' drives, the CLI from a checkout         | Everything: errors, crashes, spans, logs, breadcrumbs, every session's replay, attachments, reports |
| `ci`          | Anything run where `CI` is set                              | Errors and reports, with their breadcrumbs. No spans, logs or replay (PAR-777)                      |
| `preview`     | A pull request's preview installer, the CLI from pkg.pr.new | Everything                                                                                          |
| `release`     | The published app and CLI, before promotion                 | Everything                                                                                          |
| `production`  | A promoted app, a CLI version that's been npm's `latest`    | Everything. No build has sent it yet                                                                |

- **Sample rates:** replay records every session (`replaysSessionSampleRate: 1`) and keeps every error's buffer
  (`replaysOnErrorSampleRate: 1`), in `renderer/replay.ts:9`. Spans and events aren't sampled. A frame is one span, so
  opening `examples/shadcn-vite` on an empty cache sends about 640 of them in two minutes.
- **The controls:** Settings > Privacy > Share diagnostics turns everything off or on at once, kept in
  `<userData>/telemetry.json`, which the CLI reads too. `PARITY_TELEMETRY=all|off` overrides it for a run, and
  `DO_NOT_TRACK=1` turns it off. Unit tests are always off. There's no level between all and off: PAR-626 dropped one,
  though CI's errors-only mode (`errorsOnly` in `resolveTelemetry`) is the same thing under another name.
- **The notice:** the CLI prints one line to stderr the first time it shares, and keeps `~/.parity/telemetry-notice`.
  The app shows nothing: the first sign is Settings, if someone opens it.
- **Turning it off** stops Sentry at once without a restart. Main starts Sentry either way and flips its `enabled`
  option, and the editor window stops its recorder.
- **What stays local only:** the local copy, `<userData>/logs/parity-<date>.jsonl`, written at every level, Off
  included, with secrets scrubbed. It's 5 MB a file, the newest 10 files, with no age limit. The CLI keeps
  `~/.parity/logs/parity-cli-<date>.jsonl`, the newest 10 days, and its unsent batches in `~/.parity/outbox`, dropped
  after a day. `parity logs` reads the app's copy, and `parity diagnostics` writes a zip to the current folder without
  sending it. CI's spans and logs are a run artifact for 7 days.

## Personal and project data

[decisions.md](decisions.md) chose "send it as it is, except secrets" for testers. This is what that sends:

| Data                                     | Where it goes                                                                                                                                                                  | Sent as written?                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Project names and folders                | Every event's `project`; `project.*` events' `root`; `projects.json` in reports                                                                                                | Yes, the full path, home folder and user name included                                            |
| Design, component, layer and state names | `frame.*`, `component.changed`, `inspector.changed`, `frames.json` (with each design's file path), report tags, replay                                                         | Yes                                                                                               |
| Token names and values                   | `inspector.changed` `token.*`, by theme                                                                                                                                        | Yes                                                                                               |
| Inspector values                         | `inspector.changed`: the old and new value of every field, text included                                                                                                       | Yes, as JSON                                                                                      |
| Text on screen and typed into fields     | Session Replay of the editor window                                                                                                                                            | Yes. Password fields, and fields whose name says secret, show as stars                            |
| Pictures of designs                      | Replay of the window's own canvases; `failed-frame.png`, `frame.webp`; report screenshots and frames                                                                           | Yes. Frames and icons are blocked in the replay itself, shown as boxes                            |
| Agents' requests                         | `agent.called`: the parameters, and the whole `exec` snippet                                                                                                                   | Yes, after the open projects' `.env` values are removed                                           |
| The project's own output                 | 50 lines of a crashed builder's output; a failed frame's error message and stack; the project's `console` output as breadcrumbs, since its components run in the editor's page | Yes                                                                                               |
| Error messages and stacks                | Every error                                                                                                                                                                    | Yes. In development, stacks show the worktree's path. A CLI stack can show the user's home folder |
| Report text and screenshots              | User feedback                                                                                                                                                                  | Yes; the person sees and sends it                                                                 |
| A tester's name                          | Sentry's user, from `PARITY_TESTER`                                                                                                                                            | Yes, when set                                                                                     |
| Location                                 | Every event, added by Sentry from the IP address                                                                                                                               | The country, region and city. The IP address isn't kept, since 2026-11-09                         |

**What's removed is secrets, and only secrets.** `createScrubber` replaces them with `[redacted]` in every process
before anything leaves. It runs on events as they're recorded and in every Sentry hook (`beforeSend`,
`beforeSendTransaction`, `beforeSendSpan`, `beforeSendLog` and `beforeBreadcrumb`). It catches keys and tokens with a
known shape, `Bearer` tokens, passwords in URLs, the values of fields named like `password` or `apiKey`, long random
strings, and the open projects' `.env` values. The CLI doesn't know the `.env` values. Sentry's server-side scrubbing is
a second net. [telemetry.md](telemetry.md#secrets-are-scrubbed) has the details.

**The replay masks almost nothing.** `maskAllText` is on, but only so every text node passes through the scrubber, which
returns it unchanged unless it's a secret. `maskAllInputs` and `blockAllMedia` are off, and the canvas integration
records the canvas's own `<canvas>` elements. Titles, placeholders and accessible names are masked, as Replay does by
default. The project's frames and icons are blocked, since the recorder can't see into them and kept every shadow root
it did see.

## Where it goes and who sees it

- **Sentry, in the `better-apps` organisation, in its US region:** `parity-desktop` for the app, `parity-cli` for the
  CLI. Its one member is `admin@betterapps.io`, and agents read it through Sentry's MCP server signed in as that
  account, so anyone who can run an agent session in this repository can read everything above.
- **Retention:** Sentry's, which can't be set per project. The Business trial ends on 2026-11-19. On the free Developer
  plan everything is kept 30 days. On Team or Business, errors, replays, attachments and user feedback are kept 90 days,
  and logs and spans 30.
- **Linear:** three alerts file a bug in PAR, as Todo with the Bug label, for each new issue or regression, each user
  feedback, and each monitor breach. The bug's title is the Sentry issue's, so an error message's names and paths show
  in Linear, and a feedback's title is Sentry's summary of what the person wrote. Its description is empty and links to
  Sentry. Anyone in the Better Apps Linear workspace can read it.
- **Dashboards:** four in Sentry (Parity, performance, workflows, releases and telemetry), covering every project and
  environment. [on-call-health.md](proposals/on-call-health.md) says what each widget reads.
- **GitHub:** CI's spans and logs are an artifact on the run, kept 7 days, readable by anyone who can read the
  repository.

## Decisions for PAR-619

Each row is one of PAR-619's decisions, for builds that report `release` and `production`. The recommendation keeps
`development`, `ci` and `preview` as they are, for testers and agents. Until Parity has users, it collects as much as it
can rather than miss an issue, as you chose on 2026-11-09, so nothing is sampled.

| Decision                          | Today                                                                                   | Options                                                                                                                                                                                     | Recommendation                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default level                     | Everything, on                                                                          | 1. Everything, on. 2. Errors, crashes and reports on; the rest asked for. 3. Off until asked                                                                                                | **2.** Errors, crashes and reports are what on-call needs, and CI's `errorsOnly` already does it. Bring back a three-way setting (Everything, Errors only, Off), with Errors only the default for public builds and Everything for testers |
| First-run notice                  | None in the app; one line in the CLI                                                    | 1. None. 2. A notice on first start that says what's sent and links to the setting. 3. A choice to make before the first project opens                                                      | **2.** One quiet notice on first start, not a dialog, naming what's sent and linking to Settings > Privacy and a public page, as the CLI's line does                                                                                       |
| Design, component and token names | Sent as written in events, replay and attachments                                       | 1. As written. 2. As stable IDs, with names kept only in reports the person sends. 3. Dropped                                                                                               | **2.** IDs still group and link a bug's events; a name is what a client project would most mind leaking. Reports keep names, since the person sees what goes                                                                               |
| Paths                             | Full paths, home folder included, in `root`, `frames.json`, stacks                      | 1. As written. 2. The home folder as `~`, and project paths relative to the project. 3. Dropped                                                                                             | **2.** In the scrubber, so every process and hook gets it. A relative path still finds the file                                                                                                                                            |
| Values                            | Every inspector change's old and new value, token values, agent parameters and snippets | 1. As written. 2. The kind and size only (`string`, 12 characters). 3. Dropped                                                                                                              | **2.** A value rarely explains a bug that its field and kind don't, and text values are the person's content                                                                                                                               |
| Messages                          | Error messages, guest errors, builder output and the project's console, as written      | 1. As written. 2. Parity's own messages as written, the project's own (guest errors, builder output, console breadcrumbs) dropped. 3. Codes only                                            | **2.** Parity's messages are Parity's text. What the project's code prints is the project's, and Parity's bugs show in Parity's frames                                                                                                     |
| Replay masking                    | All text and inputs as written, canvases recorded; secrets scrubbed                     | 1. As today. 2. Replay's defaults (all text, inputs and media masked) with Parity's own interface unmasked by `data-sentry-unmask` on menus, buttons, labels and panel titles. 3. No replay | **2.** The replay still shows what was clicked and which panel was open, without the person's layer names, text or images. Turn the canvas integration off                                                                                 |
| Replay sample rate                | Every session, and every error's buffer                                                 | 1. Every session. 2. No sessions; the minute before each error. 3. None                                                                                                                     | **1.** Every session, while there are no users. Revisit once volume says so                                                                                                                                                                |
| Trace sample rate                 | Every span, every frame                                                                 | 1. Every span. 2. A share of traces, decided where each starts, with every trace that has an error kept. 3. No spans                                                                        | **1.** Every span, while there are no users. Revisit once volume says so                                                                                                                                                                   |

The replay and trace rates apply to anyone who chooses Everything, since Errors only sends neither.
[Privacy risks](#privacy-risks) lists the calls the code turned up that PAR-619 doesn't.

## What we might be missing

Most of the original plan landed. Every event it named is registered and sent, and so are Report a problem, the offer to
report after a crash, `parity diagnostics`, `parity logs` and the lint rule against bare `toast.error`. Two pieces were
canceled, the cost budget in `pnpm perf` (PAR-647) and counting the CLI's dropped batches (PAR-776), and stay so. These
are the gaps left. Each comes from the code or from Sentry, with the Linear issue that closes it.

### Signals that never arrive

| Gap                                                 | Evidence                                                                                                                                                                                                                                                                                                   | Issue   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A crash comes without the log before it             | The plan attached the last log file to a crash. Main's `beforeSend` attaches only `failed-frame.png` (`main/telemetry.ts:176`), and the log goes only with a report. Main's hangs say how long, not where (`:393`)                                                                                         | PAR-805 |
| Signing in has no events                            | No `account.*` event is registered. An unreadable session store is cleared, signing the person out (`main/session-store.ts:103`); a refused refresh ends the session unrecorded (`main/account.ts:389`); other failures only reach the console (`:197`, `:450`)                                            | PAR-807 |
| The service degrades without a word                 | Failing to watch a project for changes only calls `console.warn` (`utility/projects.ts:803`, `:835`, `:877`, `:927`), as do sharp failing to load, which turns the bitmap cache off (`utility/webp.ts:32`), keeping bitmaps (`utility/bitmap-store.ts:94`) and prop inference (`utility/projects.ts:1026`) | PAR-808 |
| Partial failures count as successes                 | An export with layers that couldn't be drawn shows a warning and still records `export.done`, with no count (`renderer/chrome/commands.ts:225`). A save that finds the file changed on disk records nothing (`renderer/agent/handlers.ts:128`)                                                             | PAR-809 |
| Main's own requests aren't timed                    | Main's 33 `ipcMain` handlers in `main/index.ts` (account, report, update, file pickers) don't run in `request.handled`, which wraps only the service's channel (`shared/tracing.ts:86`), and `ipc.failed` covers only the service                                                                          | PAR-810 |
| An install ID that can't be saved changes every run | The install ID landed in PAR-626. When `telemetry.json` can't be written, the failure is swallowed and the next run makes another ID (`main/telemetry-setting.ts:38`), so Sentry counts each run as a new user, and nothing says why                                                                       | PAR-811 |

### Privacy risks

These go beyond "names and values as written", which the decisions above cover.

| Risk                                             | Evidence                                                                                                                                                                           | Issue   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A report with sharing off can send other events  | `sendFeedback` turns Sentry on for the whole of main while the report flushes, up to 15 seconds (`main/report.ts:237`)                                                             | PAR-813 |
| The project's console output becomes breadcrumbs | The project's components run in the editor's page (`renderer/telemetry.ts:19`), and the browser SDK's console breadcrumbs are on by default                                        | PAR-814 |
| The CLI doesn't scrub `.env` values              | Only the service reads them ([telemetry.md](telemetry.md#secrets-are-scrubbed)), so a secret in an uncaught error's message or stack leaves the CLI unless its shape gives it away | PAR-815 |
