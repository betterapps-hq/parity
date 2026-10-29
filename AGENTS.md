# Parity agent guidance

- **Work comes from [docs/backlog.md](docs/backlog.md).** Read it before starting, claim an item before writing code,
  and keep it true as you go, following its "How sessions use it" rules.
- **What's decided is in [docs/decisions.md](docs/decisions.md)** and what works with which tools in
  [docs/support.md](docs/support.md). Designs still being decided are in [docs/proposals](docs/proposals).
- **Editor features are described in [docs/editor.md](docs/editor.md),** each with the tests that cover it. When you add
  or change one, add its tests and update its section in the same commit.
- **Logic goes in packages that take data and return data,** with tests that run without Electron, as
  [docs/proposals/packages.md](docs/proposals/packages.md) sets out. The app keeps views, files, IPC and processes.
- **How code, tests and docs are written is in [docs/conventions.md](docs/conventions.md):** finish a change before
  checking it, ask before adding a dependency, and try changes people see in the running app.
- **Several sessions edit this folder at once.** Re-read a file just before changing it.
- **Commit your work when you judge it's ready,** without waiting to be asked: a backlog item done, a fix in, a doc
  finished, with `pnpm verify` passing. Stage your own files by path, so other sessions' unfinished work stays out
  unless the user asks for a wholesale commit. Shared docs such as the backlog and decisions.md go in whole. Write
  conventional messages (`feat(core): …`, `fix(desktop): …`, `docs: …`). There's no remote, so nothing is pushed.
- Run `pnpm verify` before finishing.
