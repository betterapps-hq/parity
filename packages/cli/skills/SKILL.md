# Parity

Parity is a design canvas that draws a project's real components, from its own source, styled only with its own tokens.
A design here isn't a picture of the app: every button, card and table on the canvas is the project's component,
rendered by its builder. What you design is what the code can build, and the files are the source of truth.

Read this file first. Read `execute.md` and `document.md` before your first change; read a guide when the task calls for
it.

## Files

| Read                        | When                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `execute.md`                | Before any change: the functions a snippet can call, with examples. Required.          |
| `document.md`               | Before any change: designs, nodes, styles, states and responsive patches. Required.    |
| `guide/components.md`       | Using the project's components, making component designs, instances and params, icons. |
| `guide/states-and-modes.md` | Loading, empty, error and other states; themes, viewports and locales.                 |
| `guide/checking.md`         | Screenshots, layout problems, accessibility, the console, and trying a design.         |
| `guide/design-system.md`    | Composing screens from the project's components and tokens.                            |
| `guide/web-app.md`          | Designing web app screens: dashboards, settings, lists, forms.                         |
| `guide/mobile.md`           | Designing for phones and small viewports.                                              |

## Tools

The same tools are MCP tools and `parity` commands in a terminal. They act on a tab, which is one open project. Without
`tab`, they act on the open project your working folder is in, and otherwise on `active`: what the person is looking at,
the active tab of the Parity window they used last. When the person says "this" or "what I've selected" without naming a
project, pass `tab: "active"` (`--tab active`) and read `get_app_state` for the selection.

| MCP                   | CLI                                             | What it does                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_app_state`       | `parity state`                                  | Designs (with how many references each has), the selection, modes (the primary one marked), components and token names, and what Parity detected (builder and config, package manager, installed versions). Start here. |
| `get_status`          | `parity status`                                 | The revision, whether anything is unsaved and which files and tokens, the last save, and undo and redo; `summary` names them.                                                                                           |
| `get_modes`           | `parity modes [design]`                         | Viewports (the ids `Responsive` takes), modes (the ids renders take) and what each design shows; a design adds its frames.                                                                                              |
| `execute`             | `parity exec`                                   | Runs a JavaScript snippet against the designs. Its changes land as one undo step, merged per design with edits made meanwhile.                                                                                          |
| `screenshot`          | `parity screenshot <design>`                    | Renders a design in its states and modes, offscreen, and returns the images.                                                                                                                                            |
| `find_problems`       | `parity problems <design>`                      | Render errors, overflow, clipping and unknown components, per frame.                                                                                                                                                    |
| `check_accessibility` | `parity a11y <design>`                          | axe-core against WCAG 2.2 AA, per frame, on the layers that break each rule.                                                                                                                                            |
| `get_console`         | `parity console`                                | What the project's own code wrote to the console, on the canvas and offscreen.                                                                                                                                          |
| `get_tokens`          | `parity tokens`                                 | Tokens filtered by category, source or name, with values in every theme.                                                                                                                                                |
| `get_components`      | `parity components`                             | Components, libraries, icon sets and exports left out or failing to render.                                                                                                                                             |
| `get_props`           | `parity props <Component>`                      | Props from source, then what it goes inside and holds, its slots and an example to insert; `all` adds passed-through attributes.                                                                                        |
| `get_images`          | `parity images`                                 | The project's images (files in `public/images`, linked photos) with what uses each, in designs and code.                                                                                                                |
| `remove_image`        | `parity images remove <img>`                    | Removes an image file nothing uses; says where one is still used.                                                                                                                                                       |
| `get_tabs`            | `parity tabs`                                   | The open projects.                                                                                                                                                                                                      |
| `open_project`        | `parity open <folder>`                          | Opens a project in a new tab.                                                                                                                                                                                           |
| `find_references`     | `parity references "<screen>"`                  | Screens from real apps, with previews to look at, when this copy of Parity can search.                                                                                                                                  |
| `get_references`      | `parity references placed [design]`             | The screens placed beside designs as references, with who placed each and why, and their pictures to look at.                                                                                                           |
| `find_media`          | `parity media "<subject>"`                      | Stock photos, illustrations, vectors or videos, with previews to look at.                                                                                                                                               |
| `place_result`        | `parity place <connector> <id> "<design/node>"` | Puts a picture a search found into an image node, a video into a video node, or either into a component's prop, as one undoable edit. Credit its author and the source where the design shows it.                       |
| `report_problem`      | `parity report "<problem>"`                     | Reports a problem in Parity itself to its developers, with the window's screenshot and replay and the design's frames; returns the link.                                                                                |
| `read_skill`          | `parity skill [file]`                           | This skill.                                                                                                                                                                                                             |

The token, component and prop tools read what designs can use without writing a snippet in either transport.
`parity components` also says which file each of the project's own components is written in, which of the app's exports
aren't components and why, which components fail to draw on the canvas and why (often a missing provider, which a
decorator adds), and what the person listed or took off the list by hand. `Measure` gives the file and line that writes
each node's element.

CLI commands and MCP tools share validation and defaults. Screenshot scale defaults to 1 and accepts 0.25 to 3. Audits
check every state and shown mode unless narrowed; a single-element selector list is equivalent to a string. Screenshot
failures and audit findings exit with 1 in the CLI and set MCP `isError`, with details retained. `get_console` defaults
`clear` to false; `get_props` defaults `all` to false. MCP project paths must be absolute; the CLI resolves relative
folders from its working directory. Skill reading is local and needs no running app.

Several copies of Parity can run at once, each with its own projects open. Each call goes to the copy that has its
project open, so naming the project is enough; `get_tabs` lists every copy's projects. A project open in two copies goes
to the one that has been running longest. A copy kept apart with `PARITY_AGENT_FILE` is reached only through that file:

```sh
parity tabs                                         # every project open in any copy
parity state --tab active                           # what the person is looking at, and their selection
PARITY_AGENT_FILE=copy/agent.json pnpm dev &        # a copy of Parity kept apart
PARITY_AGENT_FILE=copy/agent.json parity tabs       # just that copy
```

Every tool returns its result as data too: MCP `structuredContent`, or `--json` in the CLI. Read that rather than the
text. A failure has `error.code` to branch on, `retryable` (send it again unchanged), `path` (the input at fault) and
`alternatives` (valid ids for one it didn't know), so a mistyped id is fixed in one retry:

```sh
parity problems button --state loading --json
# {"error": {"code": "unknown_state", "path": "/state", "alternatives": ["default", "outline", "destructive", "disabled"], ...}}
parity problems button --state disabled --json
```

`get_tokens` returns the first 100 tokens and `get_console` the newest 50 messages, with `total` and `truncated`; narrow
the read or raise `limit` when `truncated` is true.

When a library's components, tokens or icons don't show, `parity lib <package> --root <project>` describes the package
in a `.lib.par`: its components, tokens and the providers its frames need. It writes `./<id>.lib.par` in the current
folder, or prints with `--out -`. With no package it describes the app at `--root` into the `.lib.par` at its root,
keeping the designs there, so ask before running that in someone's project.

## How to work

1. **Get your bearings.** Call `get_app_state`. Note the designs, which one is selected (the person usually means that
   one), the modes, and the components. Designs, states and nodes have ids; use them.
2. **See how real apps do it,** for a common screen such as onboarding, a paywall, settings or a checkout:
   `find_references` with one screen per search, its type and up to three parts it shows ("paywall with a free trial").
   Follow the patterns you see with the project's own components and tokens, never an app's layout, text or branding,
   and say which apps you drew on. Leave the ones you drew on beside the design with `PlaceReference` in `execute`, each
   with a note on what you took from it. If it says there's no key, carry on without it. For a real photo or
   illustration, look at `find_media` previews and put the one you choose in an image node with `place_result`; for a
   video, insert a `video` node and place it there. Searches give no link to paste.
3. **Look before you change.** Read the design with `Get("design-id", { depth: 3 })` in `execute`, and take a screenshot
   of what's there. When `get_app_state` gives the design `references`, look at them first with `get_references` for
   that design: they're the screens the person or an agent picked for it, with notes on why. Find the components you
   need with `Components()` and their props with `Props()`.
4. **Change it in one snippet.** Build or edit the design with `Insert`, `Update`, `Replace`, `Move` and the rest. A
   snippet either applies whole, as one step the person can undo, or changes nothing. Name the layouts you make. If it
   fails because the person changed a design it changes, run it again by its `editId`.
5. **Cover every state.** A screen that loads has a loading state, a list has an empty one, a form has an error one. Add
   them with `AddState`, as changes to the base design, not as copies.
6. **Check every frame.** Screenshot the design in all its states and the modes it shows (`state: "all"`,
   `mode: "shown"`). Run `find_problems` and `check_accessibility` too, and read the warnings `execute` returns: they're
   usually a token that doesn't exist or a prop the component doesn't take. A render failure comes first and means a
   frame wasn't checked. Fix what you find, then check again.
7. **Say what you did.** Tell the person what changed and what you couldn't verify. Ask them to try anything interactive
   themselves with the Interact tool (I), which hands their mouse and keyboard to the real components.

Your changes to designs are on the canvas but not saved: the person saves (Ctrl+S) or undoes them, as with their own
edits. Don't say they're saved. Token values from `SetTokens` are the same: they show at once, and go into the project's
stylesheet when the person saves. `get_status` says what's saved and what isn't, and its `revision` (also in
`get_app_state`) stays the same until something changes, so compare it before reading the board again:

```sh
parity status --summary
# shadcn-vite is at revision 7c612c04:1.
# 1 file isn't saved. They wait for the person to save; agents can't.
#   shadcn-vite.par: changed button
```

## Rules

- **Use the project's components.** `Components()` lists them; library components are namespaced, as in `nova/Button`,
  and icons too, as in `lucide/Heart`. A name that isn't in the list renders as a placeholder. Don't rebuild a button,
  card or input out of layouts and text when the project has one.
- **Use the project's tokens.** Colours, radii, shadows, fonts, sizes, leading and tracking name a token, such as
  `muted-foreground`, `radius-lg` or `text-sm`, without the `--`. Lengths are steps of the spacing scale: `4` is four
  spacing units (1rem in a default Tailwind project). `GetTokens()` lists them. Never write a raw colour or pixel value.
  When a design hands you one, such as `#2f6fed` or `13px`, use the nearest token: `GetTokens({ nearest: "#2f6fed" })`
  lists the closest first, and a length takes a category too, as in
  `GetTokens({ nearest: "13px", category: "font-size" })`.
- **Prefer semantic colours** (`background`, `foreground`, `card`, `muted`, `muted-foreground`, `primary`, `border`,
  `destructive`) over palette ones (`color-blue-500`). They change with the theme; palette colours don't.
- **Layout is auto layout.** A `layout` node is a flex box (or a grid with `display: "grid"`); children fill, hug or
  take a fixed length. Avoid absolute positioning unless something truly overlaps, such as a badge on an avatar.
- **One design, every viewport.** Don't copy a screen for mobile. Patch it with `Responsive(node, "mobile", patch)`:
  hide the sidebar, stack the columns, shrink the padding.
- **Real content.** Write the words the screen would show: names, numbers, dates and messages that fit the product.
  Lorem ipsum hides layout problems.
- **Reuse what repeats.** When a row, card or list item appears more than twice, make it a component design with
  `ExtractComponent`, so each copy is an instance with its own content.
- **Leave the canvas tidy.** New designs go into empty space (`FindEmptySpace`). A call warns only about the boards it
  moves; `Overlaps()` checks every board, telling collisions from a title too close (`titleOnly`) and boards sized from
  their frames because the canvas hasn't drawn them (`estimated: true`).

## When something fails

`execute` returns an `editId` when a snippet throws, and nothing changes; `error.code` says why, and
`error.alternatives` names the valid ids when a design, state, mode or component wasn't found. Fix it with `editId` and
`edits` (exact find and replace on the snippet) instead of sending it all again. The error names the line. Common
causes: a node path that matches two designs (write it as `design/node`), a node property that doesn't exist, and a
state change to something states can't change (only `hidden`, `text`, `props` and `style`).

When Parity itself gets something wrong, report it with `report_problem` (`parity report`), even if nothing failed: a
screenshot that doesn't match the design, a check that missed something or flagged nothing wrong, a call that should
have worked. Say what you did, what you expected and what you saw, and name the design, state or node. It goes to the
Parity team in Sentry, with the window's screenshot and replay, the call's trace and the frames, and gives you the link
to pass on. Don't report a project's own bugs or your snippet's mistakes this way.

```sh
parity report "The default state's screenshot shows the outline variant" --design button --state default
```
