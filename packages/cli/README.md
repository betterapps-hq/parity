# @parity-app/cli

The `parity` command drives the [Parity](https://github.com/betterapps-hq/parity) desktop app from a terminal or an
agent. Parity is a design canvas that draws a project's real components, styled with its own tokens. The CLI reads the
open project's designs, components and tokens, runs edits as one undoable step, takes screenshots, checks accessibility,
and serves all of this as MCP tools.

> **Pre-release.** Versions before 1.0 may change their commands and output between releases.

## Install

It needs Node 24. Run it without installing:

```sh
npx @parity-app/cli --help
```

or install it to get the `parity` command:

```sh
npm install --global @parity-app/cli
```

That's the version released to everyone, npm's `latest`. Every change to Parity is published to `next` first, for
testers: `npx @parity-app/cli@next` runs it, and `npm install --global @parity-app/cli@next` installs it.

Most commands act on a project open in a running Parity app: the one `--tab` names, else the one the current folder is
in, else the active tab of the Parity window used last (`--tab active` names that one). `parity lib` runs without the
app.

Each running copy of the app writes where to reach it to `~/.parity/agents`, and each call goes to the copy that has its
project open; a project open in two copies goes to the one running longest. A copy started with `PARITY_AGENT_FILE`
writes only that file, and a CLI given the same file reaches only that copy.

## Commands

| Command                      | What it does                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `parity tabs`                | Lists the open projects.                                                                   |
| `parity state`               | A tab's designs, selection, modes, components and tokens. Start here.                      |
| `parity status`              | Revision, unsaved files and token values, the last save, and undo and redo.                |
| `parity modes [design]`      | Viewports, modes and what each design shows; a design adds its frames' sizes.              |
| `parity exec [file]`         | Runs a JavaScript snippet against the designs, from a file or stdin, as one undoable step. |
| `parity screenshot <design>` | Renders a design in its states and modes, offscreen, as images.                            |
| `parity problems <design>`   | Render errors, overflow, clipping and unknown components, per frame.                       |
| `parity a11y <design>`       | Checks accessibility with axe-core, per frame.                                             |
| `parity console`             | What the project's own code wrote to the console.                                          |
| `parity logs`                | Parity's own events from its local log, by level, process, trace, test run or time.        |
| `parity diagnostics`         | A zip of the last hour of the local log, versions, projects and the latest crash.          |
| `parity report "<problem>"`  | Reports a problem in Parity itself to its team, with a screenshot, replay and trace.       |
| `parity tokens`              | The tokens styles can name, with their values per theme.                                   |
| `parity components`          | The components designs can use, by library.                                                |
| `parity props <Component>`   | A component's props, read from its source.                                                 |
| `parity lib [package]`       | Writes a `.lib.par` describing a library's components, tokens and icons, or the app's.     |
| `parity open <folder>`       | Opens a project in a new tab.                                                              |
| `parity skill [file]`        | Prints the skill that teaches an agent to design with Parity.                              |
| `parity mcp`                 | Serves these commands as MCP tools on stdio.                                               |

`parity --help` lists every option. `problems` and `a11y` exit with 1 when they find something, so they can gate a
script.

## With an agent

Add the MCP server to your agent's configuration:

```json
{
  "mcpServers": {
    "parity": { "command": "npx", "args": ["-y", "@parity-app/cli", "mcp"] }
  }
}
```

Then have the agent read the skill first, with the `read_skill` tool or `parity skill`.

## Execute contract

CLI `exec` and MCP `execute` share one operation. CLI file/stdin becomes MCP's `input`; `--label` becomes `description`;
`--tab`, `--edit-id` and parsed `--edits` have the same meaning in both. The default task label is `Edit designs`, and
an omitted tab uses the open project the current folder is in, else the active tab.

Send a nonblank snippet or a failed call's `editId`, not both. Retry patches need a nonempty `find`, a string `replace`
(which can be empty), and optional boolean `all`; omitted patches default to an empty list. Invalid requests are
rejected before reaching the desktop. Caller identity and session IDs travel separately from operation inputs.

CLI failures exit with 1; MCP failures set `isError` and include the same failure and retry details, as the structured
`error` below. CLI `--json` omits screenshot image data; MCP returns image content blocks.

## Shared operations

All desktop commands use the same operation contracts as their MCP counterparts:

| CLI                      | MCP                   |
| ------------------------ | --------------------- |
| `tabs`                   | `get_tabs`            |
| `state`                  | `get_app_state`       |
| `status`                 | `get_status`          |
| `modes`                  | `get_modes`           |
| `exec`                   | `execute`             |
| `screenshot`             | `screenshot`          |
| `problems`               | `find_problems`       |
| `a11y` / `accessibility` | `check_accessibility` |
| `console`                | `get_console`         |
| `logs`                   | `get_logs`            |
| `open`                   | `open_project`        |
| `tokens`                 | `get_tokens`          |
| `components`             | `get_components`      |
| `props`                  | `get_props`           |
| `report`                 | `report_problem`      |
| `skill`                  | `read_skill`          |

Screenshot scale defaults to 1 and must be a finite number from 0.25 to 3. Screenshot state and mode default to the
current state and primary mode. `sheet` (`--sheet`) defaults to false; with it, a screenshot returns `sheets`, one
labeled PNG per design with states in rows and modes in columns, in place of `screenshots`. Audits default to every
state and shown modes. State and mode accept a nonblank string or a nonempty list of nonblank strings; one-item lists
normalize to strings. `clear` for console and `all` for props default to false. Requests with invalid input fail before
contacting the app.

Screenshots that fail and audits that find issues exit with 1 in the CLI and set MCP `isError`, retaining the full
report. CLI JSON omits screenshot image data; MCP emits image blocks. CLI `open` resolves relative folders; MCP requires
an absolute path. Skill reading uses the same local reader and default `SKILL.md` in both transports. Library generation
and checking remain CLI commands; library checking runs its snippets through the shared execute operation.

## Structured results

Every command takes `--json` and prints the same data the MCP tool returns as `structuredContent`. `tools/list` doesn't
publish output schemas, since agents would pay for them in context; `operations.ts` and `execute.ts` hold them. Human
text and screenshot images stay beside it. A failure is
`{ "error": { code, message, retryable, path?, alternatives?, editId? } }` (with `--json` on stdout, and the message on
stderr), or, for `exec` and `screenshot`, the whole report with `error` in it:

- `code` is stable: `invalid_input`, `not_running`, `not_answering`, `unknown_tab`, `tab_not_ready`, `unknown_design`,
  `unknown_node`, `ambiguous_reference`, `unknown_state`, `unknown_mode`, `unknown_viewport`, `unknown_component`,
  `unknown_icon_set`, `unknown_edit_id`, `unknown_image`, `image_in_use`, `conflict`, `execution_failed` or `app_error`.
- `retryable` is true when the same request, unchanged, can succeed: the app is starting, or edits collided.
- `path` is a JSON pointer to the input at fault, in the transport's field names (`/design`, `/input`, `/edits/0/find`).
- `alternatives` lists up to 20 valid ids for an unknown or ambiguous one, closest first.
- `editId` retries a failed snippet with `edits`.

```sh
$ parity props Buton --json
{ "error": { "code": "unknown_component", "message": "\"Buton\" isn't one of the project's components. Check Components().",
  "retryable": false, "path": "/component", "alternatives": ["Avatar", "Badge", "Button", "Card", …] } }
```

`tokens` returns the first 100 unless `--limit` (up to 1000) says otherwise, `console` the newest 50 and `logs` the
newest 100; each says `total` and `truncated`.

`logs` reads the file the app writes every event to, `<userData>/logs/parity-<date>.jsonl`, so it needs no running app
and works with diagnostics off. It shows the last run unless `--session` names one (or `all`); `--trace` and
`--test-run` search every run. `--level` is the lowest shown, and `--since` takes an ISO time or `30s`, `10m`, `2h` or
`1d`. `PARITY_USER_DATA` points it at another copy's folder. `tabs` is `{ "tabs": [...] }`.

## Reporting a problem

`parity report "<what's wrong>"` and MCP's `report_problem` tell Parity's team about a problem in Parity itself, even
one where nothing failed, such as a screenshot that doesn't match its design. The app sends it to Sentry as user
feedback, with a screenshot of its window, the window's replay, the last hour of its log, and the frames of the design
named with `--design` (in `--state`, else the state it shows). It's tied to the command's trace and tagged with the tab,
design, state, `--node` and test pass (`PARITY_TEST_RUN` unless `--test-run` says), and the command prints the
feedback's link. Sentry files it in Linear and links the issue from the feedback. Without `--design` it works with a
project that failed to open, or with none open, and isn't sent while Share diagnostics is off in Parity's settings.

```sh
parity report "The default state's screenshot shows the outline variant" --design button --state default
```

## What the CLI records

Each run writes a few events to `~/.parity/logs/parity-cli-<date>.jsonl`, one per line, keeping the newest 10 days: the
command and the names of the flags you gave (never their values), when it can't reach the app, when it and the app are
versions apart, and each MCP client's name and version. `PARITY_CLI_LOGS` names another folder. The app records each
call it answers in its own telemetry, as
[docs/telemetry.md](https://github.com/betterapps-hq/parity/blob/main/docs/telemetry.md) describes.

The CLI also shares these diagnostics with Parity, with any error it hits, to help fix bugs. It follows the app: it
shares them unless you turn off Share diagnostics in Parity's Settings, or set `PARITY_TELEMETRY=off` or
`DO_NOT_TRACK=1`. The first run that shares them says so on stderr, once. Sending never holds up a command: what a
command would send waits in `~/.parity/outbox`, and a separate `parity` process sends it after the command exits.

## Licence

MIT. See [LICENSE](https://github.com/betterapps-hq/parity/blob/main/LICENSE).

## Caller name on the canvas

For CLI calls, set `PARITY_AGENT_NAME` to the name you want shown on cursors and badges (for example,
`DeepSeek Harness`). Without a nonblank name, calls show `Terminal`. Use `PARITY_AGENT_ID` to distinguish concurrent CLI
callers sharing a display name. `--label` names the task separately.

For MCP, Parity uses the client's declared `clientInfo.title`, then `clientInfo.name`, then `Agent` if neither is
nonblank. Names are trimmed and otherwise preserved; no list of known agents or tool environment detection is needed.
These display names are self-reported, not authentication.
