# Proposal: Parity's developer API (PAR-1071)

Status: draft for discussion, 2026-11-13. Nothing here is built beyond what
[adapter-registrations.md](adapter-registrations.md) marks as built. This page is about what a developer can build: the
API their code gets, what they declare, where their work shows in Parity, and how quickly they can try it. It builds on
adapter-registrations.md for how nodes are addressed, indexed and given facts, and on [extensions.md](extensions.md) for
packaging, with these changes to what those pages record:

- **The manifest is the `parity` field in `package.json`,** not a `.lib.par`.
- **A project names its extensions and their settings in its `.par` file,** and trusting the project covers the
  extensions its `.par` names. There's no `parity.config.ts`.
- **Extensions with the `edits` permission may change designs on their own,** which replaces adapter-registrations.md's
  "read-only to start".
- **Connectors are providers** like the rest (below).

## In one line

Anyone can add a tool or a feature to Parity as an extension: it reads and changes what's on the canvas through the same
commands people use, moves the person around the app, and adds its own tabs, menu items, sections and canvas overlays. A
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
adapter reads and writes the theme, a router reads routes, and an entities adapter imports screens such as stories and
writes them back. Connectors (`packages/connectors`) find screens, photos and videos in outside libraries such as
Mobbin, Unsplash and Pixabay.

It can't read designs, select or reveal anything, add a tab, a setting, an inspector section, a node type or a canvas
overlay, keep state, or fail without taking the project service down with it.

## Principles

- **Parity's own features are extensions.** Storybook, TanStack Router, Tailwind, React and Vite use only the public
  API. When Storybook needs something the API lacks, the API is missing it, so every gap shows up in real use first.
- **One typed, versioned API.** Extensions depend on `@parity-app/extension-api`, which holds types and nothing else,
  and name the version they need in `engines.parity`. Nothing from `@parity-app/core` leaks, so Parity can change inside
  without breaking anyone.
- **Declare what shows before any code runs.** The manifest must list every contribution and where it shows. Parity
  draws them at once and loads the code only when one is used.
- **Native by default.** Extensions describe their UI as data that Parity draws with its own kit. A sandboxed web view,
  for one that needs its own drawing, comes in a later release.
- **The person stays in charge.** Extensions can change designs, and every change is one undo step named after the
  extension that made it. Every permission is shown, and asked for unless it comes with a project the person trusted.
- **A broken extension never breaks the editor.** Each extension runs in a process of its own, starts only when needed,
  and is named when it fails.
- **Agents get what people get.** Every command, node type and fact an extension adds is open to agents too.
- **A short loop.** Scaffolding, running, reloading, testing and publishing are one command each.

## Words

- **Extension:** the package a developer publishes, and what Parity's own integrations become. It's the only name: an
  extension that recognises a tool is still an extension. Its id is its package name.
- **Contribution:** anything an extension adds: a command, a menu item, a key, a tab, a section, a setting, a node type,
  a provider, a fact, an overlay, a status item, an agent tool.
- **Provider:** a contribution that does one of a tool's jobs: drawing components (a renderer), starting the dev server
  (a builder), reading and writing the theme (styles), reading routes (a router), importing screens such as stories and
  writing them back (entities), finding screens, photos or videos in an outside library (a connector), or answering
  Search actions with results of its own (search).

Today's code and [extensions.md](extensions.md) say adapter for both the package and the job. As they move over:

| Today's adapter      | Becomes                                                                                |
| -------------------- | -------------------------------------------------------------------------------------- |
| `id`, `name`, `icon` | The package name, and the manifest's `displayName` and `icon`                          |
| `detect`, `watches`  | The manifest's `detect` module and `watches` globs, run before the extension activates |
| `versions`           | Peer dependencies, plus `scope`, `distributions` and `prefix` in the manifest          |
| `status(facts)`      | `parity.status.item`, from code                                                        |
| `actions`            | Commands and their placements in the manifest                                          |
| `run`                | The command's handler, registered in `activate`                                        |
| Its kind             | A provider, declared in the manifest and given behaviour in code (below)               |

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
    "prefix": "timings",
    "icon": "icon.svg",
    "activates": ["onDetect", "onCommand:timings.measure"],
    "permissions": { "network": ["localhost"] },
    "contributes": {
      "commands": [{ "id": "timings.measure", "title": "Measure route timings", "icon": "timer" }],
      "menus": {
        "layers": [{ "command": "timings.measure", "when": "node.type == route" }],
        "search": [{ "command": "timings.measure" }]
      },
      "tabs": [{ "id": "timings.table", "area": "right", "title": "Timings", "icon": "timer", "view": "table" }],
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
  const table = parity.views.table("timings.table", { columns: ["Route", "Load time"] })

  parity.commands.register("timings.measure", async () => {
    const runs = parity.settings.get<number>("timings.runs")

    await parity.ui.progress("Measuring routes…", async () => {
      for (const route of parity.nodes.ofType("route")) {
        const time = await measure(parity.navigate.pageUrl(route.ref), runs)

        await parity.facts.set(route.ref, [{ id: "load", label: "Load time", value: `${time} ms` }])
        parity.canvas.badge(route.ref, { text: `${time} ms`, tone: time > 500 ? "warning" : "neutral" })
        table.upsert(route.ref.key, [route.name, `${time} ms`])
      }
    })
  })
}
```

Parity draws the command in each route's menu in Layers and in Search actions, and the Timings tab in the right panel,
from the manifest alone. The code loads the first time the command runs.

### The manifest

| Field                   | What it holds                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `displayName`           | The name people see, also on its nodes when it isn't running ("From Route timings")         |
| `prefix`                | What every contributed id starts with: `timings.measure`, `timings.runs`                    |
| `icon`                  | Its logo (below)                                                                            |
| `activates`             | Activation events (Lifecycle)                                                               |
| `detect`, `watches`     | A small module that says whether its tool is there, and the files that mean detecting again |
| `permissions`           | What it may read, write, reach and change (Trust)                                           |
| `extensionDependencies` | Other extensions whose API it uses                                                          |
| `contributes`           | Every contribution, in the keys below                                                       |

| `contributes` key | What it adds, and where                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `commands`        | Each command's id, title, icon, and optional `note` and `starts` text shown before its code runs       |
| `menus`           | Where each command shows, by placement id (below), with `when` and `enablement`                        |
| `keybindings`     | A command's keys, with a `when`                                                                        |
| `tabs`            | A tab in the left, right or bottom panel, and the declarative view it holds                            |
| `sections`        | A section in the Design tab, for nodes of a type or a selection a `when` matches                       |
| `pages`           | A page in a tab at the top, such as a setup guide                                                      |
| `statusItems`     | Status bar items, drawn with their last value until the code updates them                              |
| `nodeTypes`       | Each type's name, icon and color, so its nodes draw and `onNodeType` works before the code loads       |
| `providers`       | Which jobs it does (`renderer`, `builder`, …), and a renderer's or builder's own entry modules (below) |
| `agentTools`      | Tools agents can call, each with a schema for its input                                                |
| `settings`        | Its settings, as JSON Schema (Settings)                                                                |

- **Placement ids** for `menus`: `layers` (a row in Layers), `canvas` (the canvas's right-click menu), `designTitle` (a
  design's title), `selectionHeading` (buttons in the Design tab's heading), `componentCard` (a card in the Components
  panel, its menu and buttons), `media` (a tile in Media), `search` (Search actions), and `appMenu/<menu>/<group>`.
- **Ids are the extension's.** Every contributed id, setting key and context key starts with the manifest's `prefix`.
  Parity refuses a manifest that breaks the rule, and when two extensions claim one prefix, the Extensions page names
  both and runs only the one that wins by where it was found (Lifecycle). Node types are scoped by their owner, as
  adapter-registrations.md sets out.
- **Icons:** an extension's logo is path data with a view box and a fill rule, as `AdapterIcon` is today, so it can't
  run script and takes the text's color in both themes. The build converts `icon.svg` to that and refuses one that won't
  convert. A contribution's icon is a name from the kit's icon set.
- **Titles can be translated later.** Every `title` may instead be `%key%`, looked up in the extension's
  `package.nls.json`, as VS Code does, so translations can come without changing manifests.

## Lifecycle

- **Found.** Extensions come built in, installed into the app by the person, or named in the project's `.par` file, as a
  package the project depends on or a folder in it. When one id is found in several places, the project's copy wins over
  the app's, which wins over the built-in one, and the Extensions page says which is running. One whose `engines.parity`
  doesn't fit this Parity is listed with the reason and doesn't run.
- **Detected.** Parity reads the main project file's `extensions` field first, for the settings detection uses, then
  runs each extension's `detect`, before choosing the renderer and builder. Without a `detect`, an extension is found
  when one of its peer dependencies is installed (below). Detection runs again when a file its `watches` names changes,
  or when the `extensions` field changes from outside, as after a git pull.
- **Activated** on what its manifest names:
  - `onDetect`: its tool is in the project.
  - `onCommand:id`: one of its commands runs.
  - `onView:id`: one of its tabs or pages opens.
  - `onNodeType:type`: a node of that type appears, once a window has the project open.
  - `onStartup`: always. It's discouraged, and the Extensions page says when one uses it.
- **Running.** Everything it registers or subscribes to returns a `Disposable`. Those it adds to `parity.subscriptions`
  go when it does.
- **Deactivated** when its tool is no longer detected, the project closes, or it's reloaded during development. Its
  contributions, facts, nodes, overlays, servers and processes go with it.

## The Extensions page

Settings becomes paged, with Parity's own sections as pages and an Extensions page beside them, also reachable from
Search actions. Each extension shows its logo, what it adds, what detection found ("Storybook 9.1, config in
`.storybook`"), whether it's running, its permissions, its activation time and memory, and its settings.

- **No switch.** Every extension today is Parity's own and gives the basic support for a language, framework or builder,
  so each runs whenever its tool is detected and can't be turned off. A switch comes with third-party extensions.
- **When one stops running,** because its tool is no longer detected or it crashed, its contributions disappear from
  every panel and menu, its servers and processes stop, and its canvas files close. Nodes of its types in saved designs
  stay in the file and show "From Route timings", so nothing is lost.
- **Not installed.** A project whose `.par` names an extension the person doesn't have says so once, with Install. Its
  nodes show the package name the `.par` saved with them.
- **Uninstalling** removes the extension's app state, app settings and secrets, and leaves what it saved in projects.

## Settings

An extension declares its settings in its manifest as JSON Schema, as [extensions.md](extensions.md) proposes. Parity
draws the form on the extension's page with the kit's own controls, marks each setting as this project's or every
project's, and Search actions finds each setting by its title.

```jsonc
"settings": {
  "storybook.configDir": { "type": "string", "default": ".storybook", "scope": "project", "title": "Config folder" },
  "storybook.openIn": {
    "type": "string",
    "enum": ["browser", "parity"],
    "enumTitles": ["Your browser", "Parity's browser"],
    "default": "browser",
    "scope": "app",
    "title": "Open stories in"
  },
  "storybook.chromaticToken": { "type": "string", "scope": "secret", "title": "Chromatic token" }
}
```

| Scope     | Whose, and where it's kept                                                                     |
| --------- | ---------------------------------------------------------------------------------------------- |
| `app`     | The person's, for every project, saved with the app's state                                    |
| `project` | Everyone's who opens the project, written where the tool keeps it, or in the main project file |
| `secret`  | The person's, in the system keychain, never in the project or the app's state                  |

- **No team scope.** A team shares a setting by putting it in the project, where it's committed with the code.
- **Project settings live in the main project file,** the `.par` that already keeps what the person chose for the whole
  project: its modes, where they corrected detection, and which source each lens reads (inside `canvas` when that file
  is a `.lib.par`). An `extensions` field in other `.par` files, and in a dependency's `.lib.par`, is ignored. A project
  with no `.par` yet gets its main file when a project setting is first changed, as with a first edit.
- **The field.** `extensions` is one new optional field, keyed by extension id, holding each one's settings as an
  unchecked record that the extension's own schema checks when it loads. So settings of an extension that isn't
  installed are kept as they are, and after this one change to the file format, a new setting never changes it. Whether
  adding the field raises `formatVersion`, which today rejects every older file, is decided when it's built.
- **Saving and undo.** Changing a project setting is one undo step and marks the file unsaved, as a modes change does,
  and Save writes it. The window sends the field to the project service whenever it changes, so extensions see values
  before they're saved.
- **The tool's own config wins** for what it keeps there: Storybook's port stays in its `storybook dev` script, written
  by the extension, so there's one place to change it. Every other project setting goes in the main project file.
- **The app's state.** How the app saves its state is being worked out separately. `app` settings need only a place
  keyed by extension and setting that survives updates and can be migrated when a setting is renamed.
- **The API:** `parity.settings.get(key)`, `onChange(key, listener)` and `update(key, value)`, which writes where the
  setting's scope says. A project setting's update goes through the window's history. A value that doesn't fit its
  schema falls back to the default, with a note on the extension's page.
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
- **The first peer dependency installed carries the tool's version,** so the main package goes first, as
  `ToolVersions.packages` orders them today.
- **The default detector.** An extension is found when any of its peer dependencies is installed, so most need no
  `detect` of their own.
- **One source of truth.** npm warns at install when the project depends on the extension and its tool is out of range.
  For an extension installed into the app or built in, which npm never checks against the project, Parity's own check
  does it. The author widens the range when they've tested a new major, so the two-year rule becomes the author's policy
  and Parity no longer carries release dates.
- **What peer dependencies can't say** stays in the manifest: `scope` for tools whose packages share a scope
  (`@storybook/`), `distributions` for packages that ship the tool under another name, and `prefix` for how its majors
  are written (`v4`). `ToolVersions` shrinks to those three fields.

## The API

`activate` gets one `Parity` object. Each area below is a namespace on it. Reads come from copies the host keeps, so
they're synchronous; anything that changes something is asynchronous (Speed and isolation).

### The project and its files

- `parity.project`: its root, name, package manifest, package manager, and what the extension's `detect` found.
- `parity.files.read(path)`, `find(glob)` and `watch(glob, listener)`, limited to the paths its permissions name.
- `parity.files.edit(label, changes)`: writes project files through the project service's one queued write, which checks
  nothing changed underneath, can be undone under the extension's name, and isn't read back as an outside edit. Limited
  to the write paths its permissions name. Parity refuses writes to `.par` files whatever they name.
- `parity.servers.serve(server)` and `parity.processes.run(command)`: ask the project service's process manager to find
  or start a tool's server or run a command. Each is listed with the project's processes under the extension, its output
  goes to the extension's tab in the bottom panel, and the service stops it when the extension stops or its host
  crashes.

### Providers

Providers are declared in the manifest's `providers` and given behaviour in `activate` with
`parity.providers.register(kind, provider)`.

- **Plain data across the process boundary.** Every provider call is asynchronous and takes and returns data, never
  functions or listeners. A renderer reads components a batch of files at a time; a router's routes are an async read; a
  styles provider's printing is a call Parity caches by its input; a builder's code changes arrive as events.
- **Renderers and builders have code that runs elsewhere.** A builder's work runs in the builder process, and a
  renderer's guest module runs in the canvas frames, compiled into the project's own build. So each names its entry
  modules in the manifest (`providers.builder`, `providers.guest`), which Parity loads there. A guest module runs with
  the project's trust, not in the extension host. Parity passes the renderer's runtime packages, imports and guest path,
  which are data, to whichever builder is active, so the two can come from different extensions.
- **Entities providers keep the round trip.** Import gives screens and their code; export writes an edited screen back
  to its file on Save, as stories work today. Parity makes the canvas file and its nodes from what import returns, so no
  call adds a canvas file directly.
- **Connectors** search an outside library and return results with pictures, credits and links. Each one an extension
  registers shows in the Library browser, Media's Add from library, and Find references.

### Nodes, node types and facts

From [adapter-registrations.md](adapter-registrations.md#querying-nodes):

- `parity.nodes`: `get`, `ofType`, `query`, `children`, `parent`, `watch` and `subscribe`, over every node by its
  `NodeRef`, read from the host's copy of the node types it uses.
- `parity.nodes.add` and `remove`: nodes under the extension's own owner, of the types its manifest declares.
- `parity.nodeTypes.register(type, behaviour)`: what the manifest can't say: the fields the inspector shows (as JSON
  Schema), the links a type has to other types, and the events it sends (`route:visited`).
- `parity.facts.set(ref, facts)`: facts about any node, shown on its card and in the inspector.

### Changing designs

- `parity.edits.transact(label, change)`: changes designs through the same edits people make, as one undo step named
  after the extension and `label` ("Route timings: Add load badges"). An extension that declares the `edits` permission
  can do it from a command or on its own, as a linter fixing what it finds or a sync bringing in tokens would.
- **The same path as an agent's call.** The change goes to the window, which applies it as it applies an agent's
  changes, and rejects it with the designs that conflicted when someone changed them meanwhile. With no window open, it
  waits for one.
- **The same verbs as the app:** insert, move, delete, set props, set style, wrap, make component. Extensions never
  write `.par` files directly, so collaboration, recovery and undo keep working.
- **Code changes,** such as a story's args or a test, go through `parity.files.edit`.

### Selection, navigation and commands

This is how an extension works with Parity's UX rather than beside it.

- **Selection:** `parity.selection.get()`, `set(refs)` and `onChange(listener)`, by `NodeRef`.
  `parity.selection.highlight(refs)` outlines nodes without selecting them, as pointing at a layer in Layers does. Today
  a selection holds designs, layers, a mode or state, a note or a reference; it grows to hold any `NodeRef`, so
  selecting a route or a story is one call. Selecting an extension's node shows its type's inspector fields and the
  sections whose `when` matches.
- **Navigation:** `parity.navigate`:
  - `reveal(ref)` scrolls Layers and the canvas to a node;
  - `zoomTo(ref)` frames it;
  - `openDesign(key)` opens a design;
  - `setMode(mode)` and `setState(design, state)` switch what the canvas shows;
  - `showTab(id)` opens any tab, Parity's own or an extension's;
  - `openSettings(id)` opens an extension's page;
  - `pageUrl(ref)` gives the URL the canvas draws a route at, with its params filled in.
- **Commands:** `parity.commands.execute(id, args)` runs any of Parity's own commands, the ones in the keymap and the
  menus (`zoomToSelection`, `duplicate`, `wrap`). `register(id, handler)` gives behaviour to one the manifest declares.
  A handler gets the `NodeRef` it was run for (a card, a layer, a route), or the selection when it's run from Search
  actions.
- **When and enablement:** a placement shows only when its `when` holds, as `node.type == route`, `selection.count > 1`,
  `tool == select`, `project.uses(storybook)` or `fact.load > 500`. One whose `when` holds but whose `enablement`
  doesn't shows greyed with the reason the extension gives, as Open in Storybook shows "No story found" today. An
  extension can set context keys of its own (`timings.measured`).
- **Keys:** Parity's own keymap wins a clash with an extension's key, two extensions on one key are both named on the
  Extensions page, and the Keyboard shortcuts dialog lists extension keys under each extension's name.

### Views and overlays

- `parity.views.table|tree|list|form|keyValue(id, options)`: fills a tab, section or page the manifest declares, and
  returns a view with `upsert`, `remove`, toolbar actions and row actions (Drawing UI).
- `parity.canvas.badge|label|outline|line|region(ref, options)`: an overlay attached to a node, returning a `Disposable`
  (Where the UI can be extended).
- `parity.status.item(id)`: a status bar item the manifest declares, as a handle the extension sets a value, tooltip and
  icon on. Its click names a command or a tab. Parity adds the untested-version note, and the logo when it has no icon.

### Talking to the person

- `parity.ui.notify(message, actions)`: a toast, with buttons.
- `parity.ui.progress(title, task)`: progress in a toast or the status bar, which can be cancelled.
- `parity.ui.pick(items)`, `input(prompt)` and `confirm(message)`: Search's picker, a field and a dialog, in Parity's
  own look.
- `parity.ui.open(url, { in: "parity" | "browser" })`: a page in Parity's built-in browser or the person's own.
- `parity.log`: lines in the extension's own tab in the bottom panel, with errors linked to the line that threw them.
  The Console stays the designs' messages, as agents read them with `parity console`.

### State and secrets

- `parity.state.app` and `parity.state.project`: small values an extension keeps for itself, saved with the app's state
  for the person. They aren't settings and aren't shared.
- `parity.secrets`, and `secret` settings, share the keychain and need the `secrets` permission. Only the main process
  can use the keychain, so it keeps them with Electron's safeStorage and gives a host only its own extension's secrets,
  on request through the service. When the keychain can't keep them safely, as with Linux's `basic_text`, the
  extension's page says so. Secret values are scrubbed from telemetry as `.env` values are.

### Working with other extensions and agents

- **An extension's API for others.** What `activate` returns is its API, which another extension gets with
  `parity.extensions.get(id).api` after naming it in `extensionDependencies`. A Storybook accessibility extension builds
  on the Storybook extension's this way.
- **Agents.** Every command, node type and fact is open to agents through the agent API while its extension is running,
  and an extension can add agent tools with a schema for their input, so the same feature works by hand or by asking. An
  agent's change through an extension is one undo step named after both.
- **Nobody to ask.** When an agent runs a command, `ui.pick`, `input` and `confirm` take their answers from the
  command's input schema when it has one, and otherwise fail with an error the extension can handle.

## Where the UI can be extended

| Area              | In it today                                                                      | What an extension adds                                                      |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Left panel        | Tabs: Layers, Components, Icons, Media, Tokens                                   | A tab with its own icon, such as Tests or Analytics                         |
| Layers            | Groups: Screens, Components, Frames, Routes, Stories                             | A group for its canvas file, with folders, as Stories and Routes are        |
| Right panel       | Tabs: Design, Modes, Accessibility                                               | A tab, such as Timings                                                      |
| Design tab        | Sections for the selection, and buttons in its heading                           | A section for nodes of a type or a `when`, and heading buttons              |
| Bottom panel      | The Console, alone                                                               | Its own tab for its log and processes; tabs such as test results            |
| Status bar        | Tool items, component and token counts, processes                                | Items                                                                       |
| App menu          | File, Edit, View, Object, Arrange, Help                                          | Items in a group of one of them                                             |
| Right-click menus | Layers, the canvas, a design's title, component cards, Media tiles               | Items, by placement id and `when`, greyed by `enablement`                   |
| Search actions    | Parity's commands, insert options, projects, designs, layers, components, tokens | Commands, and results of its own, such as routes by URL                     |
| Insert (`/`)      | Basic layers, components, icons                                                  | Options of its own, such as blocks, or an icon set that also shows in Icons |
| Library browser   | Mobbin, Unsplash, Pixabay, from Media and Find references                        | A connector of its own                                                      |
| Canvas toolbar    | Tools, Insert, Find references, Search actions, review tools                     | Later: a tool of its own, such as a ruler                                   |
| Canvas            | Designs, the stories and pages files, route lines                                | Overlays on nodes, node types, canvas files through entities providers      |
| Frames            | Decorators from the project's preview file                                       | Decorators, such as a mock or a provider ([decorators.md](decorators.md))   |
| Components panel  | Cards, their menu and buttons                                                    | Facts, and actions on cards                                                 |
| Settings          | Appearance, Saving, Canvas, Code, Export, Updates, Privacy                       | Its own page on the Extensions page, drawn from its schema                  |
| Tabs at the top   | Projects, Home, a new tab                                                        | A page of its own, such as a setup guide                                    |

- **The bottom panel becomes tabbed.** The Console is the only thing there today; it becomes the first of its tabs, and
  each running extension with output gets one beside it.
- **A panel of its own.** Each panel's tab icons work as VS Code's activity bar does, so an extension with a whole area
  of its own adds a tab with its icon to the left or right panel, and its tab can hold several views stacked, each
  collapsible.
- **Canvas overlays** are data: badges, labels, outlines, lines between two nodes and shaded regions, each attached to a
  `NodeRef`. Parity draws them in the canvas's own styles, keeps them on their nodes while zooming and panning, and
  hides them while the person drags. An overlay can run a command when clicked.
- **Search results of its own** come from a `search` provider the manifest declares, asked with what the person typed.
- **Canvas tools come later.** A tool needs pointer events in canvas coordinates and the node under the pointer, which a
  later release adds as `parity.canvas.tool(id, handlers)` with a `tools` contribution.

## Drawing UI: three levels

1. **Contributions.** A menu item, a status item, a fact, an overlay or a settings form needs no UI code at all.
2. **Declarative views.** A tab, section or page can be a tree, a list, a table, a form, key-value pairs or an empty
   state, with toolbar actions and row actions. The extension sends its data, and updates it (`view.upsert`,
   `view.remove`); Parity draws it with its own kit, so it has the editor's spacing, keyboard use, themes and accessible
   names without the extension doing anything. Routes, stories, test results, settings and a setup guide need nothing
   more.
3. **Web views, in a later release.** When a view needs its own drawing, such as a chart, a flame graph or a dashboard,
   it's a web view: a sandboxed frame in a tab, section, dialog or page, which can be built with React or anything else.
   It talks to the extension through a typed message channel, gets Parity's theme as CSS variables with a small
   stylesheet so it looks native, can't reach Node or the network beyond its permissions, and keeps its state while
   hidden if it asks. The first release has levels 1 and 2, so the declarative views are tried before the escape hatch.

Extensions don't put React components into Parity's window. That would tie them to Parity's React and kit versions, let
one freeze the editor, and give their code the window's access. A web view gives the same freedom without those.

## Developer experience

- **Scaffold:** `npm create parity-extension` asks what to start with: a provider, a command, a tab or a node type. It
  writes a working extension with a test.
- **Run:** `parity dev` opens Parity with a project and the extension loaded, and reloads the extension when a file
  changes. Its log, activation time and errors show in its tab in the bottom panel.
- **Debug:** the extension's host takes a debugger, as Node does, and an error names the extension, the command and the
  line.
- **Test:** `@parity-app/extension-test` runs an extension against a fixture project without Electron, with nodes,
  selection, settings and a fake person who picks and confirms. Tests check what it contributed and what it changed, as
  [packages.md](packages.md) asks of Parity's own packages. Declarative views can be previewed in Storybook with a
  stand-in host.
- **Learn:** an API reference generated from `@parity-app/extension-api`, with an example for every call; recipes for
  the common jobs; Parity's own extensions as samples.
- **Publish:** an npm package with the `parity-extension` keyword and `engines.parity`; later a registry with verified
  publishers ([extensions.md](extensions.md#packaging-and-discovery)).
- **Install and update:** the Extensions page installs one into the app from npm by name, and updates it when a newer
  version fits `engines.parity`. An update that asks for more permissions waits until the person allows them.
- **Stay compatible:** the API follows semver. A deprecated call warns while developing and keeps working for a major
  version.

## Speed and isolation

- **A host for each extension, per open project.** The project service starts each active extension's host as a forked
  Node child, through the same child lifecycle as its other processes, with the service's key-free environment, so main
  ends it if the service crashes. One host per extension per project keeps `parity.project` to one project. VS Code
  instead runs all of a window's extensions in one host, so one that blocks or crashes stalls the rest until the host
  restarts; here a stuck or crashed extension is the only one affected.
- **Stuck and crashed.** A host that doesn't answer a ping in time is named, with Restart. A crashed one is restarted,
  and after a few crashes in a row left stopped with the reason and Restart. For a renderer or builder, the canvas shows
  its error with Restart. Using a contribution whose host is down or still starting shows a toast that names the
  extension, with Restart.
- **The cost is memory and start time,** a Node process for each, which activation events keep down: only extensions
  something has used are running. The Extensions page shows each one's activation time and memory.
- **Heavy work in processes of the extension's own,** as VS Code's language servers are, started through
  `parity.processes`.
- **Where the data is.** Designs, undo, selection and the node index live in the window. The service relays between a
  host and the window: a host gets a snapshot of the node types it reads when it activates, then differences, and reads
  from that copy; changes go back as messages. Things that need designs wait for a window, since the service opens
  projects before one asks. With several windows on a project, the one that has it in front answers.
- **Changes cross as differences,** once an edit settles, so a drag isn't sent on every frame. That needs the index to
  be incremental rather than rebuilt after a pause (adapter-registrations.md, step 4).
- **Providers batch and cache.** Renderer reads go a batch of files at a time and styles printing is cached by input, so
  a host per extension stays fast.

## Trust

As [extensions.md](extensions.md#trust) sets out, an extension asks for what it needs in its manifest: paths to read and
write, network hosts, processes, secrets, and `edits` for changing designs.

- **Asked once, for an extension installed into the app,** before it first runs, and again when an update asks for more.
  A project's own extensions are trusted with the project, and built-in ones run with what they declare.
- **Taken back one at a time.** The Extensions page can withdraw a permission, such as `edits` or `network`, while the
  extension keeps running; calls that need it then fail with an error the extension can handle.
- **Held to in the host.** Each host runs under Node's permission model, with file reads and writes limited to the
  declared paths, no child processes outside `parity.processes`, and network limited to the declared hosts. Until that
  holds, the Extensions page says plainly that permissions are shown but not enforced, and that installing an extension
  trusts it fully.

## Moving Parity's own over

Storybook goes first, because it already uses most of what's here:

1. A manifest with Open in Storybook and its placements, greyed with "No story found" by `enablement`, and its
   stories-count fact.
2. Its settings (config folder, where stories open) and peer-dependency detection, as those land.
3. An entities provider whose import gives the stories canvas file and story nodes, and whose export writes edited
   stories back on Save. Then `findStorybook` and `info.storybook` go.

TanStack Router follows, with its router provider, the route node type and its Routes group in Layers. Then Tailwind,
with the styles provider and the tokens it reads; then React and Vite, with the renderer and builder providers and their
entry modules; then the connectors. Then `packages/adapters` goes.

## Order of work

1. **An incremental node index,** sending differences as edits settle rather than rebuilding after a pause.
2. **The extension host, `@parity-app/extension-api` and the manifest,** with `parity.ui`, state, secrets and the bottom
   panel's tabs, and Storybook's command and fact moved onto them.
3. **Settings,** with Settings paged, the `extensions` field in the main project file, and the app's state once it has a
   place for them.
4. **Versions from peer dependencies.**
5. **Selection of any node, navigation, running Parity's commands, when and enablement, and keys.**
6. **Changing designs and files,** with `parity.edits` and `parity.files.edit` and their undo labels.
7. **Declarative views** in the left, right and bottom panels, the Design tab and pages.
8. **Canvas overlays, node types and providers,** with TanStack Router, Tailwind, React, Vite and the connectors moving
   onto them, and `packages/adapters` removed.
9. **Extension APIs and agent tools.**
10. **The scaffold, `parity dev`, the test harness and the reference.**
11. **Third-party extensions** named in the project's `.par` and installed into the app, with permission prompts and
    their enforcement, then a registry.
12. **Later:** web views and canvas tools.

## Decided

- **"Extension" is the only word** for what a developer builds. The jobs adapters do today are providers it registers.
- **Extensions can change designs** with the `edits` permission, from a command or on their own, each change one undo
  step named after the extension.
- **Settings are the app's or the project's,** plus secrets. A team shares settings through the project, and the
  project's are kept in its main `.par` file.
- **The manifest is required.** Every contribution is listed in `package.json` with where it shows, so Parity draws it
  before the code loads. Behaviour (what a command does, a provider, facts, overlays) is code.
- **A host for each extension,** so one that blocks or crashes affects only itself.
- **Web views come in a later release,** after declarative views.
- **Extensions can't be turned off, for now.** Every extension today is Parity's own and gives the basic support for a
  language, framework or builder, so each runs whenever its tool is detected. A switch comes when third-party ones do.
- **No `parity.config.ts`.** [extensions.md](extensions.md) planned it for a project's extensions and settings, and both
  are in the `.par` now. Code a project needs, such as decorators, stays in its preview file.

## Decisions needed

- **Raising `formatVersion` for `extensions`.** Raising it lets an older Parity say the file is newer rather than
  failing on an unknown field, but rejects every file saved before it.
