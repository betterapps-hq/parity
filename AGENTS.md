# Parity agent guidance

- **Work comes from the Parity project in Linear** (team PAR), as [docs/work.md](docs/work.md) says. Look there before
  starting, mark the issue In Progress before writing code, name it in every commit and pull request, and close it with
  what landed once the work is on main. `docs/backlog.md` is gone; don't recreate it.
- **What's decided is in [docs/decisions.md](docs/decisions.md)** and what works with which tools in
  [docs/support.md](docs/support.md). Designs still being decided are in [docs/proposals](docs/proposals).
- **Editor features are described in [docs/editor.md](docs/editor.md),** each with the tests that cover it. When you add
  or change one, add its tests and update its section in the same commit.
- **Logic goes in packages that take data and return data,** with tests that run without Electron, as
  [docs/proposals/packages.md](docs/proposals/packages.md) sets out. The app keeps views, files, IPC and processes.
- **How code, tests and docs are written is in [docs/conventions.md](docs/conventions.md):** finish a change before
  checking it, ask before adding a dependency, and try changes people see in the running app.
- **Several sessions edit this folder at once.** Re-read a file just before changing it.
- **Commit your work when you judge it's ready,** without waiting to be asked: an issue done, a fix in, a doc finished,
  with `pnpm verify` passing. Stage your own files by path, so other sessions' unfinished work stays out unless the user
  asks for a wholesale commit. Shared docs such as decisions.md go in whole. Write conventional messages
  (`feat(core): …`, `fix(desktop): …`, `docs: …`). There's no remote, so nothing is pushed.
- **Commits are checked by hooks.** A commit gets lint and formatting on the files it stages, fixed where they can be, a
  conventional subject of at most 100 characters that isn't work in progress, and a change file for each versioned
  package it touches. After staging, run `pnpm changefile --type patch --message "what changed, for the changelog"`
  (`minor` for a feature, `none` for a change that shouldn't release) and the file it writes is staged too. It's
  `pnpm changefile`, not pnpm's own `pnpm change`. A push also checks types, which `pnpm check:types` runs on its own.
  Never bypass a hook with `--no-verify`; if one fails on something that isn't yours, tell the user.
- Run `pnpm verify` before finishing. It leaves types to the push.
