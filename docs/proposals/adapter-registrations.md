# Proposal: what adapters register in the editor (PAR-1071)

Status: draft for discussion. Built on 2026-11-13: each adapter's `status` hook adds its own items to the status bar,
and steps 1 to 3 below without the folder move: every adapter interface extends one `Adapter`, React, Vite, Tailwind,
TanStack Router and Storybook bring their logos, `packages/adapters` is the one list, Tailwind has a status item, and
every adapter detects its own tool through one context and gives its own version facts, and adapters offer actions the
app runs, as Open in Storybook, and step 4's node index in the window. Plugins, and how they're packaged and trusted,
are in [extensions.md](extensions.md); this page is only about where an adapter's content appears in the editor.

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

| Registration   | What the adapter gives                                                          | Where the app draws it                                    | What it replaces                                |
| -------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Icons          | Its logo, and named icons for what it adds, as SVG                              | Anywhere an icon goes, beside Lucide's                    | Status items limited to Lucide                  |
| Status items   | An icon, a value, words, a tooltip and what a click does                        | The status bar                                            | Built                                           |
| Actions        | Commands with a name and an icon, and where each is offered                     | Status items, a component's menu, the actions search      | `storybook.open`, `openInStorybook`, `{ tool }` |
| Canvas files   | Read-only design files it makes from the tool's files, with their layout        | The canvas, and the layers panel in the order it asks for | The `(stories)` and `(pages)` files             |
| Node types     | A kind of node with a name, an icon and the fields it shows                     | Layers, the canvas and the inspector                      | `RouteNode` in core                             |
| Node facts     | Facts about any node, by its type and key, as a count with a label or a value   | Cards, the inspector, and overlays on the canvas          | `info.storybook`                                |
| Panel tabs     | A tab with a name and an icon, and its content as a list or a tree              | The left panel                                            | Fixed tabs                                      |
| Inspector rows | Fields for a node of one of its types, or a component's props                   | The Design panel                                          | Nothing yet                                     |
| Servers        | A server it runs for the project, with a name                                   | The processes panel                                       | `ServerKind`                                    |
| Version facts  | The packages that carry its version, each major's release date, its config file | Detection and the version cutoff                          | The fixed list in `detect.ts`                   |

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
  /** Facts about nodes of any type: a component's stories, a route's load time. */
  facts?: NodeFact[]
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

## Node identity

Every node an adapter can read, add or say something about has one address, a `NodeRef`, whatever made it. Whoever
creates a node owns its key: the designs, or the adapter that added it.

```ts
interface NodeRef {
  /** Who made it and keeps its key: `design`, or an adapter's id. */
  owner: string
  type: string
  /** Unique within its owner and type, and kept across edits by its owner. */
  key: string
}
```

| Node                           | Owner and type             | Key                                                                       | Stable today?                                    |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| A layer in a design            | `design`, its kind         | design key and node id, or path inside an instance (`pricing/card/title`) | Yes: saved in the `.par`                         |
| A component                    | `react`, `component`       | `nova/Button`, `marketing/Card`                                           | Yes, unless its file moves or a namesake appears |
| A route                        | `tanstack-router`, `route` | the router's route id (`/settings/billing`)                               | Yes, while the route keeps its path              |
| A story                        | `storybook`, `story`       | `file#Export`                                                             | Yes, while the export keeps its name             |
| An element a component renders | `react`, `element`         | today only `button.tsx:12:5`                                              | No: it moves with every edit above it            |

- **Unique by construction.** A key need only be unique within its owner and type, and the owner leads, so two adapters,
  or an adapter and the designs, can't collide. A component's key is already unique: a library's is `library/Export`,
  and the app's own share a name only with folders added (`marketing/Card`, `billing/Card`). Adapters match their tool's
  files to components by file and export, never by name (`componentFor`, tested in
  `packages/project/src/component-for.test.ts` with same-named components across folders and libraries).
- **Stable is the owner's promise.** A router has it easy. The code adapter keys an element by its place in its
  component's JSX rather than its line: the component's key, then each element's tag and index among its siblings
  (`marketing/Card>div.0>Button.1`). That survives edits elsewhere in the file; when the element itself moves, the code
  adapter reports the old key renamed to the new one, so whatever points at it follows, or removed.

## Querying nodes

Adapters, and the app's own panels, find nodes through one index instead of each walking designs, routes and code its
own way. The designs, each adapter that adds nodes and the code adapter keep their nodes in it as they change.

```ts
interface ProjectNodes {
  get(ref: NodeRef): ProjectNode | undefined
  /** Every node of a type, from any owner unless one is named: all routes, all text layers. */
  ofType(type: string, options?: { owner?: string }): ProjectNode[]
  /** Nodes matching a filter: inside a design, placing a component, carrying a fact. */
  query(filter: NodeQuery): ProjectNode[]
  children(ref: NodeRef): ProjectNode[]
  parent(ref: NodeRef): ProjectNode | undefined
  /** Links besides parent and child: an instance to its component, a route to what its page places. */
  links(ref: NodeRef, kind?: string): NodeRef[]
  /** Told of every change to nodes a query matches, after edits settle. */
  watch(filter: NodeQuery, listener: (change: NodeChange) => void): () => void
  /** Told when one node changes, gets a new ref, or goes. */
  subscribe(ref: NodeRef, listener: (event: NodeEvent) => void): () => void
}

interface ProjectNode {
  ref: NodeRef
  name: string
  /** Its own data: a layer's style, a route's path, a component's props. */
  data: unknown
  /** What adapters have said about it. */
  facts: NodeFact[]
}

type NodeEvent =
  | { kind: "added"; node: ProjectNode }
  | { kind: "changed"; node: ProjectNode; fields: string[] }
  | { kind: "renamed"; from: NodeRef; to: NodeRef }
  | { kind: "removed"; ref: NodeRef }
  /** One its type declares, sent by its owner: `route:visited`, `component:failed`. */
  | { kind: "type"; name: string; ref: NodeRef; data: unknown }
```

- **Subscriptions follow a node.** When its owner renames its key, as when an element moves in its file, a subscription
  and the facts on it move with it; when it goes, they're told and dropped. `fields` lets an adapter skip changes it
  doesn't read, such as a layer's colour when it only reads its text.
- **Each type has its own events too.** Every node has added, changed, renamed and removed. A node type also declares
  events of its own, with what each carries, and its owner sends them: a route visited in the preview or its loader
  failing, a component drawing or failing to draw, a story's args changing, a layer selected. An adapter subscribes to
  them by name, as `route:visited`, the same way.
- **After edits settle.** Events come once an edit lands, not on every frame of a drag.
- **Read-only to start.** An adapter adds nodes only under its own owner and attaches facts; it changes designs only
  through an action the person runs, which goes through the app's own edits and undo. Direct writes wait until plugins
  and trust are settled ([extensions.md](extensions.md)).
- **One API for everyone.** Layers, Search actions and the agent API walk designs one way and routes another today;
  they'd query the index too.
- **Where it runs.** Adapters run in the utility process and designs live in the window, so the window sends design
  changes across as data. That's the largest cost.

## Facts about any node

An adapter says things about nodes of any type by their `NodeRef`: Storybook gives a component's stories, and a plugin
could measure a route and give its load time or bundle size. The app shows facts in the node's card and inspector, and
an adapter can ask for one to be drawn on the canvas, as a badge on the node or a line between nodes, in the canvas's
own styles. A fact follows its node when the node is renamed, and goes with it.

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
2. **One detector each, and version facts.** Built: every `detect` takes a `DetectContext` and returns an
   `AdapterDetection`, detection reads each adapter's `versions`, `watches` took over from a builder's `configFiles`,
   and the fixed list in `detect.ts` is gone. The context has no `files(match)` yet, since no detector needs to search;
   it's added when one does. `findStorybook` still reads Storybook's script, port and stories for `info.storybook`,
   until node facts replace it in step 5. A styles adapter is still chosen per stylesheet, by `handles(source)`.
3. **Actions.** Built: an adapter lists its `actions` and does them in `run`, given an `ActionContext` whose `servers`
   find or start its tool's server. Storybook's Open in Storybook is one; `storybook.open`, `utility/storybook.ts` and
   the `{ tool }` click are gone, and a tool's server is listed as kind `tool`. An action names the components it's
   offered for, and a code component offers them wherever it's picked, with the adapter's logo: its layer's header, its
   right-click menus in Layers, on the canvas and in the Components panel, its row's button and card, and Search
   actions. Only the stories count on a component's card still reads `info.storybook`, until node facts in step 5.
4. **Node identity and the index.** Built in the window: `NodeRef`, and `ProjectNodes` with `get`, `ofType`, `query`,
   `children`, `parent`, `watch`, `subscribe` and type events, read only, over the designs and the nodes adapters
   already make (components, routes, stories), kept up to date as edits settle. Search actions reads its layers from it.
   Left: sending it to adapters in the utility process, layers inside instances, elements' structural keys (with the
   code adapter) and `links`.
5. **Node facts,** attached by `NodeRef`, starting with Storybook's stories count, which lets `findStorybook` and
   `info.storybook` go.
6. **Canvas files and node types.** Stories and pages become canvas files, and routes a node type TanStack Router
   registers.
7. **Panel tabs, inspector rows and servers,** each when an adapter first needs it.

## Decisions needed

- **Elements' keys.** A structural key (`marketing/Card>div.0>Button.1`) needs nothing written into the person's code
  but changes when the element moves; an id attribute written into the source survives moves but edits their code.
- **Whether designs can save other owners' refs.** A design that saves a fact, or points at a route or element, needs
  that owner's key kept for good, not only while the project is open.

- **Logos as path data (decided in step 1).** An `AdapterIcon` is a `viewBox`, one path and its fill rule, which the app
  fills with the text's colour. It can't run script or load anything, so nothing needs stripping; a logo in several
  colours draws in one, which suits the status bar and the layers panel. A colour logo can be added beside it later if a
  place needs one.
- **Whether routes leave the `.par` model.** `RouteNode` is one of core's node types today, though the `(pages)` file
  that holds them is never saved. A node type an adapter registers would be a generic node naming its adapter and kind,
  which a design could only hold once adapters' node types can be saved.
- **Which views panel tabs get first.** A list and a tree cover routes and stories; anything else waits until an adapter
  needs it.
