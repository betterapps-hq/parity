# AGENTS.md

## Permission to change guidance

Treat repository rules, agent instructions, skills, and best practices as read-only unless the user explicitly
authorizes a concrete change. This covers this rule itself, every `AGENTS.md` and `CLAUDE.md`, instructions loaded
from other files, and everything in [best-practices/](best-practices/README.md). It applies to creating, editing,
formatting, moving, renaming, and deleting protected files, including changes made by tools or scripts.

When permission is needed, show the proposed changes in a table with **File**, **Before**, and **After** columns.
Give the exact affected wording or paths, with a row for each change. For additions or deletions, mark the absent
side as “absent.” Ask for approval of that table and wait before applying it. If the user has already explicitly
authorized the concrete change, apply only that change. A feature request, review, or failing check does not authorize
changing the rules.

## Repository instructions

- Start at the [best-practices index](best-practices/README.md). For every code change, apply the
  [coding principles](best-practices/principles.md) and [conventions](best-practices/conventions.md).
- Check the [preferred tech stack](best-practices/tech-stack.md) and discuss new libraries before adding them.
- Before adding a script to any `package.json`, get explicit user permission for the script name and command.
  If an existing script or a direct `vp` command covers the task, use it.

## Copy and UX

- Review every new or changed user-facing string with at least one writing skill before opening a PR. Use
  [writing-style-guide](.agents/skills/writing-style-guide/SKILL.md) for interface text, including labels, errors,
  empty states, and accessible names. Use [copy-editing](.agents/skills/copy-editing/SKILL.md) for marketing copy.
  Apply [brand-voice](.agents/skills/brand-voice/SKILL.md) when shaping the voice or
  [deslopify-writing](.agents/skills/deslopify-writing/SKILL.md) when checking for formulaic phrasing.
- Exercise changed user workflows in the running app with the integrated browser. Check desktop and mobile layouts,
  keyboard use, and accessible names.

## Documentation and data

- Update product documentation alongside behavior changes. Keep each page focused on one topic. Review prose, evidence
  ledgers, status tables, and narrative records directly. Reserve executable tests for code and generated artifacts
  that affect behavior, fabrication, or an external interface.
- Treat stale prototype data as disposable. Only migrate or repair it on explicit request. Preserve integration
  credentials and unrelated external configuration during a data reset unless the user explicitly requests a full reset.

## Before opening a PR

- Open pull requests on GitHub, where these repositories are hosted.
- When the change is ready for review, run the relevant focused checks, fix related failures together, and run
  `pnpm verify`.
- Only bypass a Git hook with explicit user permission for an unrelated failure. Run focused checks on the files
  being committed and report the blocker and checks in the handoff.

# Project-specific guidance

Project-specific requirements below take precedence over shared recommendations when they differ.

# Parity agent guidance

- **Work comes from the Parity project in Linear** (team PAR), as [docs/work.md](docs/work.md) says. Look there before
  starting, mark the issue In Progress before writing code, name it in every commit and pull request, and close it with
  what landed once the work is on main. `docs/backlog.md` is gone; don't recreate it.
- **What works with which tools is in [docs/support.md](docs/support.md).** Designs still being decided are in
  [docs/proposals](docs/proposals).
- **Editor features are described in [docs/editor.md](docs/editor.md),** each with the tests that cover it. When you add
  or change one, add its tests and update its section in the same commit.
- **Logic goes in packages that take data and return data,** with tests that run without Electron, as
  [docs/proposals/packages.md](docs/proposals/packages.md) sets out. The app keeps views, files, IPC and processes.
- **How code, tests and docs are written is in [docs/conventions.md](docs/conventions.md):** finish a change before
  checking it, ask before adding a dependency, and try changes people see in the running app.
- **Several sessions work in this repository at once.** Re-read a file just before changing it.
- **Work on a branch, and land it through a pull request.** `main` on GitHub (betterapps-hq/parity) takes changes only
  through pull requests, squash-merged once the `CI passes` check succeeds, the OpenAI review is addressed and every
  thread is resolved. Start each piece of work in its own worktree, on a branch from `origin/main`, and never commit to
  `main` itself.
- **Commit your work when you judge it's ready,** without waiting to be asked: an issue done, a fix in, a doc finished,
  with `pnpm verify` passing. Write conventional messages (`feat(core): …`, `fix(desktop): …`, `docs: …`). Then push the
  branch and open a pull request whose title is the squashed commit's subject, in the same form. Answer the OpenAI
  review's threads by fixing or replying. Once it passes, squash-merge it yourself (`gh pr merge --squash`), without
  waiting to be asked, then remove the worktree and its branch.
- **Commits are checked by hooks.** A commit gets lint and formatting on the files it stages, fixed where they can be, a
  conventional subject of at most 100 characters that isn't work in progress, and a change file for each versioned
  package it touches. After staging, run `pnpm changefile --type patch --message "what changed, for the changelog"`
  (`minor` for a feature, `none` for a change that shouldn't release) and the file it writes is staged too. It's
  `pnpm changefile`, not pnpm's own `pnpm change`. A push also checks types, which `pnpm check:types` runs on its own,
  and leaves the editor's end-to-end tests to CI. Never bypass a hook with `--no-verify`; if one fails on something that
  isn't yours, tell the user.
- Run `pnpm verify` before finishing. It leaves types to the push. End-to-end tests (`pnpm test:app`) run only in CI,
  through `.github/workflows/app.yml`; do not run them locally, including focused files.
