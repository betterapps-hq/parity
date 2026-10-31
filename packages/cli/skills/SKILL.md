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

The same tools are MCP tools and `parity` commands in a terminal. They act on a tab, which is one open project; the
active tab is the default.

| MCP                   | CLI                          | What it does                                                                                                                                               |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_app_state`       | `parity state`               | Designs, the selection, modes, components and token names, and what Parity detected (builder and config, package manager, installed versions). Start here. |
| `execute`             | `parity exec`                | Runs a JavaScript snippet against the designs. All changes land as one undo step.                                                                          |
| `screenshot`          | `parity screenshot <design>` | Renders a design in its states and modes, offscreen, and returns the images.                                                                               |
| `find_problems`       | `parity problems <design>`   | Render errors, overflow, clipping and unknown components, per frame.                                                                                       |
| `check_accessibility` | `parity a11y <design>`       | axe-core against WCAG 2.2 AA, per frame, on the layers that break each rule.                                                                               |
| `get_console`         | `parity console`             | What the project's own code wrote to the console, on the canvas and offscreen.                                                                             |
| `get_tokens`          | `parity tokens`              | Tokens filtered by category, source or name, with values in every theme.                                                                                   |
| `get_components`      | `parity components`          | Components, libraries, icon sets and exports left out or failing to render.                                                                                |
| `get_props`           | `parity props <Component>`   | Props from source; `all` includes passed-through attributes.                                                                                               |
| `get_tabs`            | `parity tabs`                | The open projects.                                                                                                                                         |
| `open_project`        | `parity open <folder>`       | Opens a project in a new tab.                                                                                                                              |
| `read_skill`          | `parity skill [file]`        | This skill.                                                                                                                                                |

The token, component and prop tools read what designs can use without writing a snippet in either transport.
`parity components` also says which of the app's exports aren't components and why, which components fail to draw on the
canvas and why (often a missing provider, which a decorator adds), and what the person listed or took off the list by
hand.

CLI commands and MCP tools share validation and defaults. Screenshot scale defaults to 1 and accepts 0.25 to 3. Audits
check every state and shown mode unless narrowed; a single-element selector list is equivalent to a string. Screenshot
failures and audit findings exit with 1 in the CLI and set MCP `isError`, with details retained. `get_console` defaults
`clear` to false; `get_props` defaults `all` to false. MCP project paths must be absolute; the CLI resolves relative
folders from its working directory. Skill reading is local and needs no running app.

When a library's components, tokens or icons don't show, `parity lib <package> --root <project>` describes the package
in a `.lib.par`: its components, tokens and the providers its frames need. It writes `./<id>.lib.par` in the current
folder, or prints with `--out -`. With no package it describes the app at `--root` into the `.lib.par` at its root,
keeping the designs there, so ask before running that in someone's project.

## How to work

1. **Get your bearings.** Call `get_app_state`. Note the designs, which one is selected (the person usually means that
   one), the modes, and the components. Designs, states and nodes have ids; use them.
2. **Look before you change.** Read the design with `Get("design-id", { depth: 3 })` in `execute`, and take a screenshot
   of what's there. Find the components you need with `Components()` and their props with `Props()`.
3. **Change it in one snippet.** Build or edit the design with `Insert`, `Update`, `Replace`, `Move` and the rest. A
   snippet either applies whole, as one step the person can undo, or changes nothing. Name the layouts you make.
4. **Cover every state.** A screen that loads has a loading state, a list has an empty one, a form has an error one. Add
   them with `AddState`, as changes to the base design, not as copies.
5. **Check every frame.** Screenshot the design in all its states and the modes it shows (`state: "all"`,
   `mode: "shown"`). Run `find_problems` and `check_accessibility` too, and read the warnings `execute` returns: they're
   usually a token that doesn't exist or a prop the component doesn't take. Fix what you find, then check again.
6. **Say what you did.** Tell the person what changed and what you couldn't verify. Ask them to try anything interactive
   themselves with the Interact tool (I), which hands their mouse and keyboard to the real components.

Your changes to designs are on the canvas but not saved: the person saves (Ctrl+S) or undoes them, as with their own
edits. Don't say they're saved. Token values from `SetTokens` are the same: they show at once, and go into the project's
stylesheet when the person saves.

## Rules

- **Use the project's components.** `Components()` lists them; library components are namespaced, as in `nova/Button`,
  and icons too, as in `lucide/Heart`. A name that isn't in the list renders as a placeholder. Don't rebuild a button,
  card or input out of layouts and text when the project has one.
- **Use the project's tokens.** Colours, radii, shadows, fonts, sizes, leading and tracking name a token, such as
  `muted-foreground`, `radius-lg` or `text-sm`, without the `--`. Lengths are steps of the spacing scale: `4` is four
  spacing units (1rem in a default Tailwind project). `GetTokens()` lists them. Never write a raw colour or pixel value.
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
- **Leave the canvas tidy.** New designs go into empty space (`FindEmptySpace`); `Overlaps()` tells you if boards
  collide, sizing boards the canvas hasn't drawn yet from their frames (`estimated: true`).

## When something fails

`execute` returns an `editId` when a snippet throws, and nothing changes. Fix it with `editId` and `edits` (exact find
and replace on the snippet) instead of sending it all again. The error names the line. Common causes: a node path that
matches two designs (write it as `design/node`), a node property that doesn't exist, and a state change to something
states can't change (only `hidden`, `text`, `props` and `style`).
