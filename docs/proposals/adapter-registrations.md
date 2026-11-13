# Proposal: what adapters register in the editor (PAR-1071)

Status: draft for discussion. Built on 2026-11-13: each adapter's `status` hook adds its own items to the status bar,
and step 1 below without the folder move: every adapter interface extends one `Adapter`, React, Vite, Tailwind, TanStack
Router and Storybook bring their logos, `packages/adapters` is the one list, and Tailwind has a status item. Plugins,
and how they're packaged and trusted, are in [extensions.md](extensions.md); this page is only about where an adapter's
content appears in the editor.

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
and share one base that holds detection and registrations:

```ts
interface Adapter {
  id: string
  name: string
  /** Its logo, as path data filled with the text's colour. */
  icon?: AdapterIcon
  /** Icons its registrations name, by name. */
  icons?: Record<string, AdapterIcon>
  /** What detection reads its version from. */
  versions?: VersionFacts
  /** Files, from the project root, whose coming, going or changing means it's detected again. */
  watches?: readonly string[]
  /** Whether the project uses its tool, and what was found. */
  detect(project: DetectContext): Promise<AdapterDetection>
  /** What it adds to the editor, from what Parity found of its tool. Only asked once it's detected. */
  registers?(facts: ProjectFacts): Registrations
  /** Runs one of its actions. */
  run?(action: string, context: ActionContext): Promise<ActionResult>
}

/** What every detector reads the project through, so each can look where its tool keeps its traces. */
interface DetectContext {
  root: string
  pkg: PackageManifest
  /** A file's text by its path from the root, or undefined when there's no such file. */
  read(path: string): Promise<string | undefined>
  /** The project's files whose path matches, leaving out dependencies and builds. */
  files(match: RegExp): Promise<string[]>
}

interface AdapterDetection {
  found: boolean
  version?: string
  /** Its config file, from the project root. */
  config?: string
  /** What was found, or what was looked for, in a sentence. */
  summary: string
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

## Who detects a tool today

No one place does. Storybook is detected three times, each asking something slightly different, and the app joins the
answers by the id `"storybook"`:

| Where                                                      | What it checks                                                                            | What uses the answer                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The adapter's own `detect(pkg)`                            | `storybook` or any `@storybook/*` in package.json                                         | `importEntities`, to read stories as screens, and `projects.ts`, to choose whose status item shows                                  |
| The fixed `tools` list in `packages/project/src/detect.ts` | The same dependencies again, then the installed version, `.storybook/main` and the majors | The project's detection and the version cutoff, which `adapterStatus` matches to the adapter by id                                  |
| `findStorybook` in `packages/project/src/storybook.ts`     | Its config folder, the script that starts it, its port, and which components have stories | `info.storybook`: whether a component has stories in the Assets panel, `openInStorybook`, and starting it in `utility/storybook.ts` |

React, Vite and Tailwind each have their adapter's `detect` and an entry in that list. TanStack Router has only its
adapter's `detect`, so it isn't in the project's detection and has no version cutoff.

With one detector each, all three become the Storybook adapter's `detect`, which says whether it's found, its version,
its config and why. Its script, port and which components have stories are what it knows for its own registrations.

## Detect, then register

Opening a project runs every adapter's detector, all at once, and registers only those that find their tool:

1. **Detect.** Each `detect` gets the same `DetectContext`. Today a renderer, router and entities adapter take a
   package.json, a builder the root folder, and Tailwind a stylesheet's text; all of them can look through one context.
   What each finds is its line in the project's detection, with its version checked against the cutoff from its
   `versions`, so `detect.ts` keeps no list of tools.
2. **Choose.** A project needs one renderer and one builder, the first in the list that finds its tool. Every other
   adapter that finds its tool is used.
3. **Register.** The service calls `registers` on each adapter in use, and sends the results to the windows with the
   project's info, by adapter. `status` is one field of it.
4. **Again when it changes.** When a file one of its `watches` names comes, goes or changes, as when
   `.storybook/main.ts` is added, the adapter is detected again. One that's found registers afresh; one that's gone
   takes its registrations with it. An adapter also registers afresh when the tool's own files change, as when a story
   is added.

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

Only the kinds that will keep growing get a folder: UI frameworks and builders. Everything else sits in `adapters/`
itself until there are enough of a kind to group.

```
adapters/
  frameworks/react
  builders/vite
  storybook
  tailwind
  tanstack-router
```

- **`frameworks`** holds UI frameworks, which draw the app's components: Vue, Svelte and Solid would go here.
- **`builders`** holds build tools, which compile the app: webpack, and Next.js, which registers its router from there
  too.

A folder is named after its tool, without `-adapter`, and its package keeps the suffix (`@parity-app/react-adapter`),
since packages will be published to a registry. The workspace lists `adapters/*`, `adapters/frameworks/*` and
`adapters/builders/*`. The folders sort packages for finding them; one package can still register several kinds.

## Order of work

1. **The base, icons and one list of adapters.** Built: the `Adapter` base, logos for React, Vite, Tailwind, TanStack
   Router and Storybook, one list (`packages/adapters`) the service, the builder process, Storybook's example project
   and the fixtures share, and a Tailwind status item. Left: moving React and Vite into `frameworks` and `builders` with
   every folder dropping `-adapter`. The move waits until no dev app or Storybook is running from this checkout, since
   they hold the adapters' folders open.
2. **One detector each, and version facts.** Every `detect` takes a `DetectContext` and returns an `AdapterDetection`,
   detection reads each adapter's `versions`, `watches` takes over from a builder's `configFiles`, and the fixed list in
   `detect.ts` goes.
3. **Actions.** Storybook registers Open in Storybook; `storybook.open` and the `{ tool }` click go.
4. **Canvas files and node types.** Stories and pages become canvas files, and routes a node type TanStack Router
   registers.
5. **Component facts, panel tabs, inspector rows and servers,** each when an adapter first needs it.

## Decisions needed

- **Logos as path data (decided in step 1).** An `AdapterIcon` is a `viewBox`, one path and its fill rule, which the app
  fills with the text's colour. It can't run script or load anything, so nothing needs stripping; a logo in several
  colours draws in one, which suits the status bar and the layers panel. A colour logo can be added beside it later if a
  place needs one.
- **Whether routes leave the `.par` model.** `RouteNode` is one of core's node types today, though the `(pages)` file
  that holds them is never saved. A node type an adapter registers would be a generic node naming its adapter and kind,
  which a design could only hold once adapters' node types can be saved.
- **Which views panel tabs get first.** A list and a tree cover routes and stories; anything else waits until an adapter
  needs it.
