# Parity agent guidance

- **Work comes from [docs/backlog.md](docs/backlog.md).** Read it before starting, claim an item before writing code,
  and keep it true as you go, following its "How sessions use it" rules.
- **What's decided is in [docs/decisions.md](docs/decisions.md)** and what works with which tools in
  [docs/support.md](docs/support.md). Designs still being decided are in [docs/proposals](docs/proposals).
- **Logic goes in packages that take data and return data,** with tests that run without Electron, as
  [docs/proposals/packages.md](docs/proposals/packages.md) sets out. The app keeps views, files, IPC and processes.
- **Several sessions edit this folder at once.** Re-read a file just before changing it.
- **Commit only when the user asks,** and then only the changes they asked for, since other sessions' work in progress
  shares this tree.
- Run `pnpm verify` before finishing.
