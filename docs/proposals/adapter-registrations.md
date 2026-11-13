# Proposal: what adapters register in the editor (PAR-1071)

Status: draft for discussion. Only status items are built: each adapter's `status` hook adds its own items to the status
bar (2026-11-13). Plugins, and how they're packaged and trusted, are in [extensions.md](extensions.md); this page is
only about where an adapter's content appears in the editor.

## In one line

An adapter registers what it adds to the editor, such as an icon, a status item, a panel tab, a kind of node, a file on
the canvas or an action, and the app draws each in its place. Adding an adapter means writing its package and adding it
to one list, with no code in the app.

## Where adapter content appears today

Only the status bar takes what an adapter gives without knowing which tool gave it. Everywhere else the app names the
tool.

| Where        | What comes from an adapter                      | How the app knows it                                                                        |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Status bar   | One item per adapter                            | The `status` hook, except that clicking Storybook's item is matched by name                 |
| Canvas       | Storybook's stories and TanStack Router's pages | Two fixed design files, `(stories)` in `story-screens.ts` and `(pages)` in `route-pages.ts` |
| Layers panel | Pages first, then stories                       | `LayerTree.tsx` and `read-from-code.ts` look for those two files by name                    |
| Node types   | Routes                                          | `RouteNode` is one of core's node types, so the `.par` model knows what a route is          |
| Assets panel | Whether a component has stories, and opening it | `info.storybook`, `openInStorybook` and the service's `storybook.open`                      |
| Tokens panel | The theme and how classes are written           | `info.styles` and `info.theme`, from the one styles adapter                                 |
| Processes    | Storybook's server                              | `ServerKind` is `"builder" \| "storybook"`                                                  |
| Detection    | Each tool's version and its version cutoff      | A fixed list of tools in `packages/project/src/detect.ts`                                   |

Adapters can't add panel tabs, inspector sections, menu items or entries in the actions search. The left panel's tabs
are fixed in `LeftPanel.tsx`, and status items can only use Lucide's icons, which have no logos.

## What an adapter registers

Each registration is data. The app has one place that draws each kind, and it draws them all the same way, whichever
adapter gave them.

| Registration    | What the adapter gives                                                          | Where the app draws it                                    | What it replaces                                |
| --------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Icons           | Its logo, and named icons for what it adds, as SVG                              | Anywhere an icon goes, beside Lucide's                    | Status items limited to Lucide                  |
| Status items    | An icon, a value, words, a tooltip and what a click does                        | The status bar                                            | Built                                           |
| Actions         | Commands with a name and an icon, and where each is offered                     | Status items, a component's menu, the actions search      | `storybook.open`, `openInStorybook`, `{ tool }` |
| Canvas files    | Read-only design files it makes from the tool's files, with their layout        | The canvas, and the layers panel in the order it asks for | The `(stories)` and `(pages)` files             |
| Node types      | A kind of node with a name, an icon and the fields it shows                     | Layers, the canvas and the inspector                      | `RouteNode` in core                             |
| Component facts | Facts about each of the project's components, as a count with a label           | The Assets panel's cards and a component's menu           | `info.storybook`                                |
| Panel tabs      | A tab with a name and an icon, and its content as a list or a tree              | The left panel                                            | Fixed tabs                                      |
| Inspector rows  | Fields for a node of one of its types, or a component's props                   | The Design panel                                          | Nothing yet                                     |
| Servers         | A server it runs for the project, with a name                                   | The processes panel                                       | `ServerKind`                                    |
| Version facts   | The packages that carry its version, each major's release date, its config file | Detection and the version cutoff                          | The fixed list in `detect.ts`                   |

Every id an adapter registers is its own (`storybook:open`, `tanstack-router:route`), so two adapters can't collide.

## The shape

The interfaces for each kind of adapter (renderer, builder, styles, router, entities) keep what's particular to them,
and share one base that holds registrations:

```ts
interface Adapter {
  id: string
  name: string
  /** Its logo, as SVG that draws in `currentColor`. */
  icon?: string
  /** Icons its registrations name, by name. */
  icons?: Record<string, string>
  /** What detection reads its version from. */
  versions?: VersionFacts
  /** What it adds to the editor, from what Parity found of its tool. */
  registers?(facts: ProjectFacts): Registrations
  /** Runs one of its actions. */
  run?(action: string, context: ActionContext): Promise<ActionResult>
}

interface Registrations {
  status?: StatusItem[]
  actions?: AdapterAction[]
  files?: CanvasFile[]
  nodeTypes?: NodeType[]
  components?: Record<string, ComponentFact[]>
  tabs?: PanelTab[]
  rows?: InspectorRow[]
  servers?: ServerInfo[]
}
```

`status` becomes one field of `registers`. The service asks each detected adapter once when the project opens, and again
when one of the adapter's files changes, and sends the results to the windows with the project's info, by adapter.

## Data, not React

Registrations are data the app draws with its own kit, rather than components an adapter ships:

- **Adapters stay in the utility process.** They read files and run tools, and their results cross to the windows as
  data, as status items do now.
- **They're tested without Electron,** as [packages.md](packages.md) asks: a test calls `registers` and checks what
  comes back.
- **Everything looks like Parity.** A tab from an adapter is drawn by the same list and tree as the layers panel, so it
  keeps the editor's spacing, keyboard use and accessible names.

The app needs a few views for this: a list, a tree, an empty state, and the inspector's existing fields. A plugin that
needs a view of its own can ship one later, as [extensions.md](extensions.md) describes.

## Where adapters live

Adapters are in two folders under `adapters/`, by whether the app's code is written with the tool or the tool runs
beside the app:

```
adapters/
  frameworks/   react-adapter, tanstack-router-adapter, tailwind-adapter
  tools/        vite-adapter, storybook-adapter
```

- **`frameworks`** holds what the app's code is written with, which Parity reads to draw it and writes to edit it: Vue,
  React Router and Panda would go here, and so would Next.js, though it also builds the app.
- **`tools`** holds what runs beside the app to build or document it: webpack, Ladle and Histoire would go here.

Each folder is named after its package, and every package keeps the `-adapter` suffix (`@parity-app/react-adapter`),
since they'll be published to a registry. The folders sort packages for finding them; one package can still register
several kinds.

## Order of work

1. **The base, icons and one list of adapters.** The `Adapter` base, logos for React, Vite, Tailwind, TanStack Router
   and Storybook, one list the service, the builder process, Storybook's example project and the fixtures share, and a
   Tailwind status item. The adapters move into `frameworks` and `tools`, while no other session is changing them.
2. **Version facts.** Detection reads each adapter's `versions`, and the fixed list in `detect.ts` goes.
3. **Actions.** Storybook registers Open in Storybook; `storybook.open` and the `{ tool }` click go.
4. **Canvas files and node types.** Stories and pages become canvas files, and routes a node type TanStack Router
   registers.
5. **Component facts, panel tabs, inspector rows and servers,** each when an adapter first needs it.

## Decisions needed

- **Logos as SVG markup or as path data.** Markup carries any logo, but the app has to strip scripts and outside links
  from it. Path data is safe by construction but can't carry a logo with several colours.
- **Whether routes leave the `.par` model.** `RouteNode` is one of core's node types today, though the `(pages)` file
  that holds them is never saved. A node type an adapter registers would be a generic node naming its adapter and kind,
  which a design could only hold once adapters' node types can be saved.
- **Which views panel tabs get first.** A list and a tree cover routes and stories; anything else waits until an adapter
  needs it.
