# Conventions

How Parity's code and docs are written. [AGENTS.md](../AGENTS.md) links here, and lint enforces some of it. These came
from the agency monorepo's guidelines on 2026-10-29, keeping what fits Parity; what was left out and why is in
[proposals/repository.md](proposals/repository.md).

## Working

- **Finish the change, then check it.** Don't run tests, types or lint after each small edit. When the change is
  complete, run the checks closest to it (a test file, a package), fix what they find together, then run `pnpm verify`.
- **Fix forward.** Parity has no releases yet, so an obsolete contract or implementation is replaced outright: no `V2`,
  `legacy` or compatibility names, shims or dual paths. Once releases ship, the files people save (`.par`, `.lib.par`)
  are the exception, and a change to their format still reads the old one.
- **Reuse before building.** Check whether `@parity/core`, another package or an installed library already does it.
- **A new dependency needs the user's agreement.** Ask before adding a library Parity doesn't already use, saying what
  it's for and what it replaces.

## Code

- **No `any`.** A value that's truly unknown is `unknown`, narrowed before use (lint enforces this).
- **Avoid `as` assertions.** Narrow with a type guard, or check and throw when the assumption fails. `as const` is fine.
- **String-literal unions, not enums,** which Node can't strip anyway (see decisions.md, "Developing Parity").
- **Named exports.** Default exports are for what a tool requires, such as a story file's `meta`.
- **No barrel files,** apart from a package's own entry, `src/index.ts`.
- **Components are function declarations,** not arrow functions or `React.FC`.
- **Data from outside is checked where it comes in:** a file, an IPC message or a project's config is checked against
  its schema once, and trusted after that.

## Tests

- **Test code is held to the same bar** as the code it tests.
- **Tests sit beside their source** as `*.test.ts`.
- **Mock the least you can.** Prefer tests that use the real collaborators.
- **Prose isn't tested.** The backlog, decisions and docs are checked by reading them, not by tests or validators.

## Checking a change in the app

- **A change people see is tried in the running app,** not only in tests. Start `pnpm dev`, drive the change with
  `scripts/drive.ts`, and look at the screenshots it saves in `.inspect`. Check it with the keyboard, and check that
  controls have accessible names.

## Interface text

- **No dot glyph as a separator.** Don't use `·`, `•` or another dot between items. Use layout, separate elements or
  words.

## Docs

- **AGENTS.md stays short** and links to the docs rather than repeating them.
- **One topic per page,** short enough to scan. Start a new page rather than growing one past that.
- **A doc changes in the same commit as what it describes,** as editor features and their [editor.md](editor.md)
  sections already do.
