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

Most commands act on a running Parity app, on its active tab unless `--tab` names another. `parity lib` runs without the
app.

## Commands

| Command                      | What it does                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `parity tabs`                | Lists the open projects.                                                                   |
| `parity state`               | A tab's designs, selection, modes, components and tokens. Start here.                      |
| `parity exec [file]`         | Runs a JavaScript snippet against the designs, from a file or stdin, as one undoable step. |
| `parity screenshot <design>` | Renders a design in its states and modes, offscreen, as images.                            |
| `parity problems <design>`   | Render errors, overflow, clipping and unknown components, per frame.                       |
| `parity a11y <design>`       | Checks accessibility with axe-core, per frame.                                             |
| `parity console`             | What the project's own code wrote to the console.                                          |
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
an omitted tab uses the active tab.

Send a nonblank snippet or a failed call's `editId`, not both. Retry patches need a nonempty `find`, a string `replace`
(which can be empty), and optional boolean `all`; omitted patches default to an empty list. Invalid requests are
rejected before reaching the desktop. Caller identity and session IDs travel separately from operation inputs.

CLI failures exit with 1; MCP failures set `isError` and include the same failure and retry details. CLI `--json` omits
screenshot image data; MCP returns image content blocks.

## Shared operations

All desktop commands use the same operation contracts as their MCP counterparts:

| CLI                      | MCP                   |
| ------------------------ | --------------------- |
| `tabs`                   | `get_tabs`            |
| `state`                  | `get_app_state`       |
| `exec`                   | `execute`             |
| `screenshot`             | `screenshot`          |
| `problems`               | `find_problems`       |
| `a11y` / `accessibility` | `check_accessibility` |
| `console`                | `get_console`         |
| `open`                   | `open_project`        |
| `tokens`                 | `get_tokens`          |
| `components`             | `get_components`      |
| `props`                  | `get_props`           |
| `skill`                  | `read_skill`          |

Screenshot scale defaults to 1 and must be a finite number from 0.25 to 3. Screenshot state and mode default to the
current state and primary mode. Audits default to every state and shown modes. State and mode accept a nonblank string
or a nonempty list of nonblank strings; one-item lists normalize to strings. `clear` for console and `all` for props
default to false. Requests with invalid input fail before contacting the app.

Screenshots that fail and audits that find issues exit with 1 in the CLI and set MCP `isError`, retaining the full
report. CLI JSON omits screenshot image data; MCP emits image blocks. CLI `open` resolves relative folders; MCP requires
an absolute path. Skill reading uses the same local reader and default `SKILL.md` in both transports. Library generation
and checking remain CLI commands; library checking runs its snippets through the shared execute operation.

## Licence

MIT. See [LICENSE](https://github.com/betterapps-hq/parity/blob/main/LICENSE).
