# Planned work

Every piece of planned work for Parity is an issue in Linear, in the
[Parity project](https://linear.app/agency-platform/project/parity-3179c1feb580) of the Parity team, whose issue IDs
start with PAR. It moved there from `docs/backlog.md` on 2026-10-29. Sessions reach it through the Linear connector.
What's decided goes in [decisions.md](decisions.md), designs in [proposals](proposals), and what works in
[support.md](support.md).

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
   (and ask the Design Editor session to republish the support matrix), the feature's section in editor.md, and any
   calls you made in decisions.md. Commit as [AGENTS.md](../AGENTS.md) says.
6. **Close it once the work is on main,** with a comment saying what landed: the files, the tests, the doc section and
   the commit. Work lands through a pull request on GitHub (betterapps-hq/parity), as [AGENTS.md](../AGENTS.md) says;
   never commit to or push `main` itself. A pull request closes its issue when it merges, since Linear is connected to
   betterapps-hq: after it merges, check the issue moved to Done and has that comment, and move it or add the comment if
   not. Work that's only partly landed stays In Progress, with a comment saying what's left.
7. **Found more work?** Create an issue in the Parity project, written as below.
8. **Blocked by a decision?** Create an issue with the Decision label, assigned to the user, that blocks the issue it
   holds up. Questions go to the user, not into the code. When the user answers, record the answer in decisions.md,
   close the Decision issue, and update the issues it blocked.

## Writing an issue

- **Title:** what the work does, starting with a verb: "Read SQLite and D1 schemas with PRAGMA".
- **Description,** in this order:
  - **Done when:** what's true once it's finished, specific enough to check.
  - **Source:** the proposal section, decisions.md section, audit or request it came from.
  - **Update when done:** the docs it changes. Editor features get their section in editor.md with the tests that cover
    them, adapters and lenses their rows in support.md, agent calls their line in the skill with an example that runs,
    and every issue decisions.md for any calls made.
- **Stream:** one label from the Stream group, such as Data lens or Canvas and editor.
- **Estimate:** 2 points is a short session, 3 a full one, 5 a full one with little slack (the backlog's S, M and L).
- **Blocked by:** the issues it needs first.

## Statuses, priorities and labels

- **Todo** is planned work. A blocked one shows what it's waiting for.
- **Backlog** is work the user put after the core, and work that's parked or waiting on Better Apps.
- **In Progress, Done** and **Canceled** mean what they say. A split or dropped issue is Canceled with a comment why.
- **Urgent** is the repository work: Vite+, CI and checks on commit, the first package boundaries, then the first
  unsigned release. **High** is what's next after it, in the user's lens priority: databases, the API, routes and mock
  data, then telemetry, then links from code, then writing back. **Low** is after the core. The rest aren't ranked yet.
- **Decision** marks a question for the user. **Parked** is React and Vite only, until the user asks for a second.
  **Waits on Better Apps** needs one of Better Apps' packages first.

## Old IDs

Work before 2026-10-29 had IDs such as CAN-47 and FIND-11, which commits and docs from then still use. Each issue that
moved says its old ID on its last line ("Backlog ID: CAN-46"), so searching Linear for one finds it. Work that was
already done is in the history of `docs/backlog.md` (`git log -p -- docs/backlog.md`).
