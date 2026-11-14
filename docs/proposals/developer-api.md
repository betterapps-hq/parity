# Proposal: Parity's developer API (PAR-1071)

Status: draft for discussion, 2026-11-13. Nothing here is built beyond what
[adapter-registrations.md](adapter-registrations.md) marks as built. This page builds on two others:
[extensions.md](extensions.md) settles how extensions are packaged, found and trusted, and adapter-registrations.md
settles how nodes are addressed, indexed and given facts. This page is about what a developer can build: the API their
code gets, what they declare, where their work shows in Parity, and how quickly they can try it.

## In one line

Anyone can add a tool or a feature to Parity as an extension: it reads and changes what's on the canvas through the same
commands people use, moves the person around the app, and adds its own tabs, panels, menu items and canvas overlays. A
first version should take a few files, and Parity's own integrations are built the same way.

## What a developer can do today

Only Parity's own team can add to Parity, because every adapter is compiled in from one list (`packages/adapters`). An
adapter can:

| Part                 | What it does                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `id`, `name`, `icon` | Names itself, with its logo as path data                                                           |
| `detect(project)`    | Reads the project root, `package.json` and any file, and says whether its tool is there and why    |
| `watches`            | Names files whose change means detecting again                                                     |
| `versions`           | Names the packages that carry its tool's version, and each major's release date                    |
| `status(facts)`      | Adds status bar items: an icon, a value, a tooltip, and a tab or action a click opens              |
| `actions` and `run`  | Offers commands in the layer header, menus, Search actions and the Components panel, and runs them |

Each kind of adapter also does one job: a renderer finds and draws components, a builder starts the dev server, a styles
adapter reads and writes the theme, a router reads routes, and an entities adapter imports screens such as stories.

It can't read designs, select or reveal anything, add a tab, a panel, a setting, an inspector section, a node type or a
canvas overlay, keep state, be turned off, or fail without taking the project service down with it.

## Principles

- **Parity's own features are extensions.** Storybook, TanStack Router, Tailwind, React and Vite use only the public
  API. When Storybook needs something the API lacks, the API is missing it, so every gap shows up in real use first.
- **One typed, versioned API.** Extensions depend on `@parity-app/extension-api`, which holds types and nothing else,
  and name the version they need in `engines.parity`. Nothing from `@parity-app/core` leaks, so Parity can change inside
  without breaking anyone.
- **Declare what shows before any code runs.** The manifest says which commands, tabs, settings and node types an
  extension adds, and where. Parity draws them at once and loads the code only when it's needed.
- **Native by default.** Extensions describe their UI as data that Parity draws with its own kit. A sandboxed web view,
  for one that needs its own drawing, comes in a later release.
- **The person stays in charge.** Extensions can change designs, and every change is one undo step named after the
  extension that made it. Every extension can be turned off. Every permission is asked for.
- **A broken extension never breaks the editor.** Extensions run in their own process, start only when needed, and are
  named when they fail.
- **Agents get what people get.** Every command, node type and fact an extension adds is open to agents too.
- **A short loop.** Scaffolding, running, reloading, testing and publishing are one command each.

## Words

- **Extension:** the package a developer publishes, and what Parity's own integrations become. It's the only name: an
  extension that recognises a tool is still an extension.
- **Contribution:** anything an extension adds: a command, a menu item, a tab, a panel, a setting, a node type, a fact,
  an overlay, a status item, an agent tool.
- **Provider:** a contribution that does one of a tool's jobs: drawing components (a renderer), starting the dev server
  (a builder), reading and writing the theme (styles), reading routes (a router) or importing screens such as stories
  (entities).

Today's code and [extensions.md](extensions.md) say adapter for both the package and the job. Both would follow as they
move over: an adapter's `id`, `name`, `icon`, `versions` and `actions` move to the manifest, its `detect` and `run` to
`activate`, and its kind becomes a provider it registers.

## Anatomy of an extension

An extension is an npm package with a `parity` field in its `package.json` and a module that exports `activate`. This
one measures how long each route takes to load and shows it:

```jsonc
// package.json
{
  "name": "parity-route-timings",
  "version": "1.0.0",
  "main": "dist/extension.js",
  "engines": { "parity": "^1.0.0" },
  "peerDependencies": { "@tanstack/react-router": "^1.0.0" },
  "parity": {
    "displayName": "Route timings",
    "icon": "icon.svg",
    "activates": ["onDetect", "onCommand:timings.measure"],
    "permissions": { "network": ["localhost"] },
    "contributes": {
      "commands": [{ "id": "timings.measure", "title": "Measure route timings", "icon": "timer" }],
      "menus": {
        "layer": [{ "command": "timings.measure", "when": "node.type == route" }],
        "search": [{ "command": "timings.measure" }]
      },
      "tabs": [{ "id": "timings", "area": "right", "title": "Timings", "icon": "timer", "view": "table" }],
      "settings": {
        "timings.runs": { "type": "number", "default": 3, "scope": "project", "title": "Runs per route" }
      }
    }
  }
}
```

```ts
// src/extension.ts
import type { Parity } from "@parity-app/extension-api"

export function activate(parity: Parity) {
  const table = parity.views.table("timings", { columns: ["Route", "Load time"] })

  parity.commands.register("timings.measure", async () => {
    const runs = parity.settings.get<number>("timings.runs")

    await parity.ui.progress("Measuring routes…", async () => {
      for (const route of parity.nodes.ofType("route")) {
        const time = await measure(route, runs)

        parity.facts.set(route.ref, [{ id: "load", label: "Load time", value: `${time} ms` }])
        parity.canvas.badge(route.ref, { text: `${time} ms`, tone: time > 500 ? "warning" : "neutral" })
        table.upsert(route.ref.key, [route.name, `${time} ms`])
      }
    })
  })
}
```

Parity draws the command in each route's right-click menu and in Search actions, and the Timings tab in the right panel,
from the manifest alone. The code loads the first time the command runs.

## Lifecycle

- **Found.** Extensions come built in, installed into the app by the person, or named in the project's
  `parity.config.ts`, as [extensions.md](extensions.md) describes.
- **Activated** on what its manifest names:
  - `onDetect`: its tool is in the project. The default detector checks the peer dependencies (below), and an extension
    can add its own `detect` for config files or conventions.
  - `onCommand:id`: one of its commands runs.
  - `onView:id`: one of its tabs or panels opens.
  - `onNodeType:type`: a node of that type appears.
  - `onStartup`: always. It's discouraged, and the extensions list says when one uses it.
- **Running.** Everything it registers or subscribes to returns a `Disposable`. Those it adds to `parity.subscriptions`
  go when it does.
- **Deactivated** when it's turned off, the project closes, or it's reloaded during development. Its contributions,
  facts, nodes, overlays and servers go with it.

## Turning extensions on and off

Settings gains an Extensions page, also reachable from Search actions. Each extension shows its logo, what it adds, what
detection found ("Storybook 9.1, config in `.storybook`"), whether it's on, and its settings.

- **Two places, as settings have (below).** Off in the app, for every project the person opens, saved with the app's
  state. Or on or off in the project's settings, for everyone who opens it, kept in `parity.config.ts`. A project that
  turns an extension on has it on for everyone, even a person who turned it off in the app.
- **Turning one off takes effect at once.** It deactivates, its contributions disappear from every panel and menu, its
  servers stop, and its canvas files close. Nodes of its types in saved designs stay in the file and show as "From Route
  timings, which is off", so nothing is lost.
- **Some can't be turned off.** A project needs one renderer and one builder, so the only one that fits says "Needed to
  draw this project" instead of a switch.
- **Found but off is quiet.** A project that uses Storybook, with the Storybook extension off, says so once in the
  status bar's tooltip, with a way to turn it on.

## Settings

An extension declares its settings in its manifest as JSON Schema, as [extensions.md](extensions.md) proposes. Parity
draws the form on the extension's page with the kit's own controls, and Search actions finds each setting by its title.

```jsonc
"settings": {
  "storybook.port": { "type": "number", "default": 6006, "scope": "project", "title": "Port" },
  "storybook.openIn": {
    "type": "string",
    "enum": ["browser", "parity"],
    "enumTitles": ["Your browser", "Parity's browser"],
    "default": "browser",
    "scope": "app",
    "title": "Open stories in"
  },
  "chromatic.token": { "type": "string", "scope": "secret", "title": "Project token" }
}
```

| Scope     | Whose, and where it's kept                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `app`     | The person's, for every project, saved with the app's state                                                  |
| `project` | Everyone's who opens the project, written where the tool keeps it, or in `parity.config.ts` when it has none |
| `secret`  | The person's, in the system keychain, never in the project or the app's state                                |

- **No team scope.** A team shares a setting by putting it in the project, where it's committed with the code.
- **The app's state.** How the app saves its state is being worked out separately. `app` settings need only a place
  keyed by extension and setting that survives updates and can be migrated when a setting is renamed.
- **The API:** `parity.settings.get(key)`, `onChange(key, listener)` and `update(key, value, scope)`. A value that
  doesn't fit its schema falls back to the default, with a note on the extension's page.
- **Defaults come from the tool when they can.** Storybook's port defaults to the one its `storybook dev` script names,
  as it does today, so most people never open the page.

## Tool versions from peer dependencies

Today an adapter lists the packages that carry its tool's version and the release date of each major, and Parity tests
each major for two years from its release. An extension package can say all of that in its `package.json` instead:

```jsonc
"peerDependencies": { "storybook": "^8.0.0 || ^9.0.0 || ^10.0.0", "@storybook/react": "^8.0.0 || ^9.0.0 || ^10.0.0" },
"peerDependenciesMeta": { "@storybook/react": { "optional": true } }
```

- **Supported means in the range.** Parity reads the installed version and checks it against the range: inside is
  supported, below is older than the extension supports, and above is newer than it was tested with. Both of the last
  two stay one quiet line, as now.
- **The default detector.** An extension is found when any of its peer dependencies is installed, so most need no
  `detect` of their own.
- **One source of truth.** npm warns at install when the project's version is out of range, and the author widens the
  range when they've tested a new major. The two-year rule becomes the author's policy when they set the range, so
  Parity no longer carries release dates.
- **What peer dependencies can't say** stays in the manifest: `scope` for tools whose packages share a scope
  (`@storybook/`), `distributions` for packages that ship the tool under another name, and `prefix` for how its majors
  are written (`v4`).
- **Built-ins too.** Parity's own extensions ship inside the app, so npm never checks them; Parity reads their manifests
  the same way when it builds, and `ToolVersions` shrinks to those three fields.

## The API

`activate` gets one `Parity` object. Each area below is a namespace on it.

### The project and its files

- `parity.project`: its root, name, package manifest, package manager and what detection found.
- `parity.files.read(path)`, `find(glob)` and `watch(glob, listener)`, limited to what the manifest's permissions allow.
- `parity.servers.serve(server)`: finds or starts a tool's server, listed with the project's processes, as actions use
  today.
- `parity.processes.run(command)`: runs a tool's command line and streams its output to a Console tab.
- `parity.providers.register(kind, provider)`: a renderer, builder, styles, router or entities provider, the jobs
  adapters do today.

### Nodes, node types and facts

From [adapter-registrations.md](adapter-registrations.md#querying-nodes):

- `parity.nodes`: `get`, `ofType`, `query`, `children`, `parent`, `watch` and `subscribe`, over every node by its
  `NodeRef`.
- `parity.nodes.add` and `remove`: nodes under the extension's own owner, such as a route or a story.
- `parity.nodeTypes.register`: a type's name, icon, color, the fields the inspector shows (as JSON Schema), the links it
  has to other types, and the events it sends (`route:visited`).
- `parity.facts.set(ref, facts)`: facts about any node, shown on its card and in the inspector.

### Changing designs

- `parity.edits.transact(label, change)`: changes designs through the same edits people make, as one undo step named
  after the extension and `label` ("Route timings: Add load badges"). An extension that declares the `edits` permission
  can do it from a command or on its own, as a linter fixing what it finds or a sync bringing in tokens would.
- **The same verbs as the app:** insert, move, delete, set props, set style, wrap, make component. Extensions never
  write `.par` files directly, so collaboration, recovery and undo keep working.
- **Code changes,** such as a story's args or a test, are written to the project's files with the permission to write
  them, as the Storybook integration writes a story's args back to its file today.

### Selection, navigation and commands

This is how an extension works with Parity's UX rather than beside it.

- **Selection:** `parity.selection.get()`, `set(refs)` and `onChange(listener)`, by `NodeRef`, so selecting a route, a
  layer or a component is one call. `parity.selection.highlight(refs)` outlines nodes without selecting them, as
  pointing at a layer in Layers does.
- **Navigation:**
  - `parity.view.reveal(ref)` scrolls Layers and the canvas to a node;
  - `zoomTo(ref)` frames it;
  - `openDesign(key)` opens a design;
  - `setMode(mode)` and `setState(design, state)` switch what the canvas shows;
  - `showTab(id)` opens any tab, Parity's own or an extension's;
  - `openSettings(id)` opens an extension's page.
- **Commands:** `parity.commands.execute(id, args)` runs any of Parity's own commands, the ones in the keymap and the
  menus (`zoomToSelection`, `duplicate`, `wrapInLayout`). `register(id, handler)` adds one, which the manifest places in
  menus and gives keys.
- **When clauses:** a contribution shows only when its `when` holds, as `node.type == route`, `selection.count > 1`,
  `tool == select`, `project.uses(storybook)` or `fact.load > 500`. An extension can set context keys of its own
  (`timings.measured`).

### Talking to the person

- `parity.ui.notify(message, actions)`: a toast, with buttons.
- `parity.ui.progress(title, task)`: progress in a toast or the status bar, which can be cancelled.
- `parity.ui.pick(items)`, `input(prompt)` and `confirm(message)`: Search's picker, a field and a dialog, in Parity's
  own look.
- `parity.ui.open(url, { in: "parity" | "browser" })`: a page in Parity's built-in browser or the person's own.
- `parity.status.item(...)`: a status bar item, as `status` adds today.
- `parity.log`: lines in the Console, filtered by extension, with errors linked to the extension that threw them.

### State and secrets

- `parity.state.app` and `parity.state.project`: small values an extension keeps for itself, saved with the app's state.
- `parity.secrets`: values in the system keychain, such as a service's token.

### Working with other extensions and agents

- **An extension's API for others.** What `activate` returns is its API, which another extension gets with
  `parity.extensions.get(id).api` after naming it in `extensionDependencies`. A Storybook accessibility extension builds
  on the Storybook extension's this way.
- **Agents.** Every command, node type and fact is open to agents through the agent API, and an extension can add agent
  tools of its own with a schema for their input, so the same feature works by hand or by asking.

## Where the UI can be extended

| Area              | In it today                                                | What an extension adds                                                    |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Left panel        | Tabs: Layers, Components, Icons, Media, Tokens             | A tab with its own icon, such as Routes, Stories or Tests                 |
| Right panel       | Tabs: Design, Modes, Accessibility                         | A tab, such as Timings or Analytics                                       |
| Design tab        | Sections for the selection                                 | A section for nodes of a type, or any selection a `when` matches          |
| Bottom panel      | The Console, alone                                         | Tabs beside it: a terminal, test results, network, its own output         |
| Status bar        | Tool items, component and token counts, processes          | Items, as today                                                           |
| App menu          | File, Edit, View, Object, Arrange, Help                    | Items in a group of one of them                                           |
| Right-click menus | Layers, the canvas, a design's title, the Components panel | Items, placed by `when`, as actions are today                             |
| Search actions    | Parity's commands, designs, layers, components, tokens     | Commands, and results of its own, such as routes by URL                   |
| Canvas toolbar    | Tools, frames, review                                      | A tool, such as a ruler or a comment pin                                  |
| Canvas            | Designs, the stories and pages files, route lines          | Overlays on nodes, canvas files, node types                               |
| Frames            | Decorators from the project's preview file                 | Decorators, such as a mock or a provider ([decorators.md](decorators.md)) |
| Components panel  | Cards, the menu, the Storybook button                      | Facts and actions on cards                                                |
| Settings          | Appearance, Saving, Canvas, Code, Export, Updates, Privacy | Its own page, drawn from its schema                                       |
| Tabs at the top   | Projects, Home, a new tab                                  | A page of its own in a tab, such as a dashboard or a setup guide          |

- **The bottom panel becomes tabbed.** The Console is the only thing there today; it becomes the first of its tabs, and
  the processes list could join it.
- **A panel of its own.** Each panel's tab icons work as VS Code's activity bar does, so an extension with a whole area
  of its own, such as an analytics extension, adds a tab with its icon to the left or right panel, and its tab can hold
  several views stacked, each collapsible.
- **Canvas overlays** are data: badges, labels, outlines, lines between two nodes and shaded regions, each attached to a
  `NodeRef`. Parity draws them in the canvas's own styles, keeps them on their nodes while zooming and panning, and
  hides them while the person drags. An overlay can run a command when clicked.

## Drawing UI: three levels

1. **Contributions.** A menu item, a status item, a fact, an overlay or a settings form needs no UI code at all.
2. **Declarative views.** A tab, panel or section can be a tree, a list, a table, a form, key-value pairs or an empty
   state, with toolbar actions and row actions. The extension sends its data, and updates it (`view.upsert`,
   `view.remove`); Parity draws it with its own kit, so it has the editor's spacing, keyboard use, themes and accessible
   names without the extension doing anything. Routes, stories, test results and settings need nothing more.
3. **Web views, in a later release.** When a view needs its own drawing, such as a chart, a flame graph or a timeline,
   it's a web view: a sandboxed frame in a tab, panel, section, dialog or page, which can be built with React or
   anything else. It talks to the extension through a typed message channel, gets Parity's theme as CSS variables with a
   small stylesheet so it looks native, can't reach Node or the network beyond its permissions, and keeps its state
   while hidden if it asks. The first release has levels 1 and 2, so the declarative views are tried before the escape
   hatch.

Extensions don't put React components into Parity's window. That would tie them to Parity's React and kit versions, let
one freeze the editor, and give their code the window's access. A web view gives the same freedom without those.

## Developer experience

- **Scaffold:** `npm create parity-extension` asks what to start with: a tool's provider, a command, a tab or a node
  type. It writes a working extension with a test.
- **Run:** `parity dev` opens Parity with a project and the extension loaded, and reloads the extension when a file
  changes. Its logs, activation time and errors show in its own Console tab.
- **Debug:** the extension host takes a debugger, as Node does, and an error names the extension, the command and the
  line.
- **Test:** `@parity-app/extension-test` runs an extension against a fixture project without Electron, with nodes,
  selection, settings and a fake person who picks and confirms. Tests check what it contributed and what it changed, as
  [packages.md](packages.md) asks of Parity's own packages. Declarative views can be previewed in Storybook with a
  stand-in host.
- **Learn:** an API reference generated from `@parity-app/extension-api`, with an example for every call; recipes for
  the common jobs; Parity's own extensions as samples.
- **Publish:** an npm package with the `parity-extension` keyword and `engines.parity`; later a registry with verified
  publishers ([extensions.md](extensions.md#packaging-and-discovery)).
- **Stay compatible:** the API follows semver. A deprecated call warns while developing and keeps working for a major
  version.

## Speed and isolation

- **One extension host, as VS Code has:** one process that runs every extension, apart from the project service and the
  window. VS Code runs one per window, as an Electron utility process, and restarts it when it crashes, until it has
  crashed a few times in a row; its Running Extensions view shows each extension's activation time and names the one
  that made the host unresponsive. Parity would do the same, and say which extension was running when it crashed.
- **Heavy work in processes of the extension's own,** as VS Code's language servers are: an extension starts one with
  `parity.processes`, which lists it with the project's processes and stops it with the extension. VS Code can also
  split extensions across hosts (`extensions.experimental.affinity`); Parity can add that if one host turns out to be
  too coarse.
- **Nothing loads until it's needed,** thanks to activation events, so many installed extensions cost nothing on open.
- **Changes cross as differences.** The node index sends the host only what changed, as soon as an edit lands, which
  needs the index to be incremental rather than rebuilt after a pause (adapter-registrations.md, step 4).
- **The extensions page shows each extension's activation time and memory,** so a slow one is easy to find.

## Trust

As [extensions.md](extensions.md#trust) sets out, an extension asks for what it needs in its manifest: files to read or
write, network hosts, processes, secrets, and `edits` for changing designs. Parity shows these before an extension
installed into the app first runs. A project's own extensions are trusted with the project.

## Moving Parity's own over

Storybook goes first, because it already uses most of what's here:

1. A manifest with its peer dependencies, `onDetect`, its settings (port, config folder, where stories open) and Open in
   Storybook with its placements.
2. `activate` adds stories as nodes and its canvas file, sets the stories-count fact, and registers its command.
3. `findStorybook` and `info.storybook` go, and Storybook can be turned off.

TanStack Router follows, registering the route node type and its router provider; then Tailwind, which brings the tokens
it reads; then React and Vite, which register the renderer and builder providers.

## Order of work

1. **An incremental node index,** sending differences as edits land rather than rebuilding after a pause.
2. **The extension host, `@parity-app/extension-api` and the manifest,** with Storybook moved onto them.
3. **Turning extensions off and settings,** on the Extensions page, once the app's state has a place for them.
4. **Versions from peer dependencies.**
5. **Selection, navigation, running Parity's commands and when clauses.**
6. **Declarative views** in the left, right and bottom panels and the Design tab, with the bottom panel becoming tabbed.
7. **Canvas overlays and node types,** with TanStack Router's routes moving onto them.
8. **The scaffold, `parity dev`, the test harness and the reference.**
9. **Third-party extensions** from `parity.config.ts` and installed into the app, then a registry.
10. **Web views,** in a later release.

## Decided

- **"Extension" is the only word** for what a developer builds. The jobs adapters do today are providers it registers.
- **Extensions can change designs** with the `edits` permission, from a command or on their own, each change one undo
  step named after the extension.
- **Settings are the app's or the project's,** plus secrets. A team shares settings through the project.
- **Web views come in a later release,** after declarative views.

## Decisions needed

- **Placements in the manifest.** Should an extension list in its `package.json` what it adds and where (its commands
  and the menus and keys they're in, its tabs, settings, and node types' names and icons), as VS Code's `contributes`
  does? Parity could then show them all when a project opens and load the extension's code only when one is used. The
  other way is for `activate` to register everything, which is less to learn but runs every extension on open and shows
  nothing until each has run. Behaviour (what a command does, a provider, facts, overlays) is code either way.
- **One host for every extension,** as VS Code does, to start?
- **Who wins on turning off.** A project that turns an extension on, over a person who turned it off in the app, as
  above?
