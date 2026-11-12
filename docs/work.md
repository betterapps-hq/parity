# Planned work

Every piece of planned work for Parity is an issue in Linear, in the
[Parity project](https://linear.app/agency-platform/project/parity-3179c1feb580) of the Parity team, whose issue IDs
start with PAR. It moved there from `docs/backlog.md` on 2026-10-29. Sessions reach it through the Linear connector.
Designs go in [proposals](proposals), and what works in [support.md](support.md).

## How sessions use it

1. **Look before starting work** in `D:\canvas`: check the project's In Progress issues, so two sessions don't take
   related work.
2. **Pick** the first Todo issue that nothing unfinished blocks: Urgent first, then High, then the rest, lowest ID first
   within each. Each issue should fit one session; split a bigger one into new issues first, and cancel it with a
   comment naming them.
3. **Mark it started before writing code.** Check it's still Todo, since other sessions pick too, then move it to In
   Progress, assign it to the user, and comment with your session's title. Work on something without an issue only after
   creating one and marking it the same way.
4. **Name it in everything the work leaves behind.** Each commit message ends with its ID
   (`feat(core): read SQLite schemas (PAR-16)`). A branch uses the name Linear gives the issue
   (`ajcraswell/par-16-read-sqlite-and-d1-schemas-with-pragma`). A pull request has the ID in its title and
   `Fixes PAR-16` in its description, one line per issue it finishes, so Linear links it and closes the issue when it
   merges.
5. **Finish:** run `pnpm verify`, then do what the issue's "Update when done" says: the rows it changes in support.md
   (and ask the Design Editor session to republish the support matrix) and the feature's section in editor.md. Commit as
   [AGENTS.md](../AGENTS.md) says.
6. **Close it once the work is on main,** with a comment saying what landed: the files, the tests, the doc section and
   the commit. Work lands through a pull request on GitHub (betterapps-hq/parity), as [AGENTS.md](../AGENTS.md) says;
   never commit to or push `main` itself. Once the work is verified, push its branch and open the pull request yourself,
   without waiting to be asked. A pull request closes its issue when it merges, since Linear is connected to
   betterapps-hq: after it merges, check the issue moved to Done and has that comment, and move it or add the comment if
   not. Work that's only partly landed stays In Progress, with a comment saying what's left.
7. **Found more work?** Create an issue in the Parity project, written as below. A bug Sentry filed is picked up as
   [Bugs from Sentry](#bugs-from-sentry) says.
8. **Blocked by a decision?** Create an issue with the Decision label, assigned to the user, that blocks the issue it
   holds up. Questions go to the user, not into the code. When the user answers, close the Decision issue and update the
   issues it blocked.

## Bugs from Sentry

Sentry files bugs itself. A new error, a regression or a report in `parity-desktop` or `parity-cli` becomes a Todo issue
with the Bug label and its Sentry link, as [sentry.md](sentry.md#alerts) says.

- **Read the Sentry issue before the code.** Open the Sentry link attached to the bug with Sentry's MCP server, which
  `.mcp.json` and `.codex/config.toml` give every session in this repository. Read its events, stack, breadcrumbs, trace
  and replay, and the release, environment and `test_run` it came from. The first time, sign in with OAuth as
  `admin@betterapps.io`: `/mcp` in Claude Code, `codex mcp login sentry` in Codex.
- **Name the proof in the pull request:** the Sentry event or trace that showed the bug. Closing the Linear issue
  resolves the Sentry issue in the next release, and Linear reopens the bug if the error comes back after that.
- **An agent's test pass sets `PARITY_TEST_RUN`** to a name for the pass, so its events, errors and replays carry that
  `test_run`. When something looks wrong but nothing threw, it reports it with `parity report "<what's wrong>"`, which
  Sentry files the same way. `parity report` arrives with PAR-646.

## Writing an issue

- **Title:** what the work does, starting with a verb: "Read SQLite and D1 schemas with PRAGMA".
- **Description,** in this order:
  - **Done when:** what's true once it's finished, specific enough to check.
  - **Source:** the proposal section, audit or request it came from.
  - **Update when done:** the docs it changes. Editor features get their section in editor.md with the tests that cover
    them, adapters and lenses their rows in support.md, and agent calls their line in the skill with an example that
    runs.
- **Stream:** one label from the Stream group, such as Data lens or Canvas and editor.
- **Estimate:** 2 points is a short session, 3 a full one, 5 a full one with little slack (the backlog's S, M and L).
- **Blocked by:** the issues it needs first.

## Statuses, priorities and labels

- **Todo** is planned work. A blocked one shows what it's waiting for. It's the team's default status, so an issue
  created without one, or a Sentry bug reopened by a regression, lands there.
- **Backlog** is work the user put after the core, and work that's parked or waiting on Better Apps.
- **In Progress, Done** and **Canceled** mean what they say. A split or dropped issue is Canceled with a comment why.
- **Urgent** is open bugs in what's built, with the refactors they wait on. **High** is the new-user experience and the
  editor, including reading the code behind a design, which is the first and most important lens. **Medium** is the rest
  of the editor's core: linked code, decorators and modes, Storybook, tokens, libraries, agents, validation projects,
  and the zod and package cleanup. **Low** is the other lenses, in the user's order (databases, the API, routes and mock
  data, then telemetry, links from code and writing back), plus what comes after the core. A blocker ranks at least as
  high as what it blocks.
- **Decision** marks a question for the user. **Parked** is React and Vite only, until the user asks for a second.
  **Waits on Better Apps** needs one of Better Apps' packages first.

## Old IDs

Work before 2026-10-29 had IDs such as CAN-47 and FIND-11, which commits and docs from then still use. Each issue that
moved says its old ID on its last line ("Backlog ID: CAN-46"), so searching Linear for one finds it. Work that was
already done is in the history of `docs/backlog.md` (`git log -p -- docs/backlog.md`).
