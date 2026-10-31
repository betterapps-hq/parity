# Parity

Parity is a design canvas that draws a project's real components, from its own source, styled only with its own tokens.
A design isn't a picture of the app: every button, card and table on the canvas is the project's component, rendered by
the project's own build tool. What you design is what the code can build, and the files in the repository are the source
of truth.

> **Beta.** Parity is in active development. Desktop builds have no publisher signature while signing is being set up.

## How it works

- **You open a project folder.** Parity reads its `package.json` to find the framework, libraries and package manager,
  starts the project's own Vite in a process of its own, and lists the components it exports.
- **Designs are frames of real DOM.** Each frame imports the project's components from its dev server and adopts its
  stylesheets, so a design looks as the app would.
- **Styles name the project's tokens,** its CSS custom properties, rather than raw colours or pixels. Modes switch a
  frame's theme, viewport or locale, and a design can have states such as loading, empty and error.
- **Designs live in `.par` files** in the project, as JSON, saved when you save (Ctrl+S). Component libraries are
  described by `.lib.par` files, and Parity ships them for libraries that don't have their own.
- **Agents work on the canvas too,** through the `parity` CLI or its MCP server: they read the designs, change them in
  one undoable step, take screenshots and check accessibility.

Today Parity expects React 19, Vite 7 or later, Tailwind CSS v4 and TypeScript, the stack of the example project. A
project on another stack may open with less, or not at all; [docs/support.md](docs/support.md) says what works with
which tools.

## Releases

Installers for Windows, macOS and Linux are published to
[GitHub Releases](https://github.com/betterapps-hq/parity/releases), as betas first. Choose the latest pre-release and
download the installer for your system. These early builds need new versions installed by hand. They have no publisher
signature, so the first run needs a step on Windows and macOS:

- **Windows:** SmartScreen warns that the app is unrecognised. Choose **More info**, then **Run anyway**.
- **macOS:** the app is blocked the first time it opens. Open **System Settings > Privacy & Security** and choose **Open
  Anyway**.
- **Linux:** make the AppImage executable with `chmod +x`, then run it.

## Developing Parity

You need [Node 24](https://nodejs.org) and [pnpm 12](https://pnpm.io). Parity is developed on Windows, and CI runs on
Windows, macOS and Linux.

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the desktop app with the example project, `examples/shadcn-vite`, open. Other commands (with Vite+
installed globally, `vp` works without `pnpm exec`):

| Command                                     | What it does                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm verify`                               | Formatting, lint and tests, as CI runs them: `vp run check` and `vp run test`. |
| `pnpm exec vp run check`                    | Formatting and lint only.                                                      |
| `pnpm exec vp run test`                     | The unit tests only.                                                           |
| `pnpm check:types`                          | Type checks, which run on push and in CI rather than in `verify`.              |
| `pnpm build`                                | The standalone production app in `apps/desktop/out`, with no UI dev server.    |
| `pnpm --filter @parity-app/desktop package` | Package the built app into this system's installer in `apps/desktop/dist`.     |
| `pnpm test:app`                             | The editor's end-to-end tests, run only in CI.                                 |
| `pnpm storybook`                            | The app's interface in Storybook, against a stand-in project service.          |

Some tests open the projects in `fixtures/`, which need installing first:
`pnpm --filter @parity-app/fixtures install-projects` installs those it knows, and the rest install with `npm ci` in
their folders.

Run `pnpm build` before packaging. Windows produces a per-user NSIS installer, macOS produces DMG and ZIP files for
Apple Silicon and Intel, and Linux produces an x64 AppImage. These first installers are unsigned. TypeScript and the
project-service runtime are shipped as physical files in the installed resources, so a project's own Vite can load them
without a checkout. CI alone installs, opens and uninstalls the Windows build against a fresh project.

## The CLI

The `parity` command drives a running Parity from a terminal or an agent. It's on npm as `@parity-app/cli`:

```sh
npx @parity-app/cli state
```

From a checkout, `node packages/cli/src/bin.ts` runs it from source. `parity --help` lists its commands, `parity mcp`
serves them as MCP tools, and `parity skill` prints the skill that teaches an agent to design with Parity.
[packages/cli/README.md](packages/cli/README.md) has more.

## Layout

| Folder                     | What's in it                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/desktop`             | The Electron app: the window and its views, the project service, and the processes it starts.  |
| `packages/core`            | The `.par` model and the operations on it: documents, edits, instances, modes, tokens and CSS. |
| `packages/editor`          | Editor behaviour without the views, starting with arranging and the clipboard.                 |
| `packages/code`            | Reading a project's code with TypeScript: its components and their props.                      |
| `packages/project`         | Detecting and reading a project: its tools, configs, libraries and Storybook.                  |
| `packages/renderer-react`  | The React adapter, which draws components in frames.                                           |
| `packages/builder-vite`    | The Vite adapter, which runs a project's own Vite.                                             |
| `packages/styles-tailwind` | The Tailwind CSS adapter.                                                                      |
| `packages/cli`             | The `parity` command and MCP server, and the skill for agents.                                 |
| `packages/libgen`          | Writes a `.lib.par` by inspecting a component library, an icon set or an app.                  |
| `packages/registry`        | Parity's own `.lib.par` files, for libraries that don't ship one.                              |
| `packages/icons`           | Lists an icon set's icons and searches them by name, alias and tag.                            |
| `packages/agent`           | The agent runtime that runs snippets against designs.                                          |
| `packages/fixtures`        | Generates and checks the validation projects.                                                  |
| `fixtures`                 | The validation projects: real projects on other stacks, each with the detection it expects.    |
| `examples/shadcn-vite`     | The example project, Acme: React 19, Vite, Tailwind CSS v4 and shadcn, with its designs.       |
| `docs`                     | What's decided, what's supported, the editor's features, conventions and proposals.            |

Logic goes in packages that take data and return data, with tests that run without Electron; the app keeps the views,
files, IPC and processes. [docs/proposals/packages.md](docs/proposals/packages.md) sets this out.

## Contributing

Read [AGENTS.md](AGENTS.md) and [docs/conventions.md](docs/conventions.md) first. In short:

- **Work on a branch and open a pull request to `main`.** Its title is a conventional commit subject, since pull
  requests are squash-merged. It merges once CI (which checks the title too) and CodeRabbit's review pass and every
  thread is resolved.
- **Hooks check each commit and push.** A commit lints and formats the files it stages and needs a conventional subject
  of at most 100 characters; a push also checks types. Don't bypass them with `--no-verify`.
- **A change to the desktop app or the CLI, or a package they bundle, needs a change file.** After staging, run
  `pnpm changefile --type patch --message "what changed, for the changelog"` (`minor` for a feature, `none` for a change
  that shouldn't release).
- **Editor features are described in [docs/editor.md](docs/editor.md)** with the tests that cover them, and change in
  the same commit.

## Licence

MIT. See [LICENSE](LICENSE).
