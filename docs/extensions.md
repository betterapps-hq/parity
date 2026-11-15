# Extensions

How Parity runs an extension: the manifest it reads first, the host each one runs in, and the `parity` object its code
gets (PAR-1089). Storybook and TanStack Router are built in. Installing others comes later.

## The manifest

An extension is an npm package whose `package.json` has a `parity` field. Parity reads it before any of the extension's
code loads, so its commands, menu items and status bar items show straight away, and its code starts only when it's
needed. [`readExtension`](../packages/extensions/src/manifest.ts) checks it, and refuses a package whose manifest breaks
a rule, naming the field by its JSON pointer (`/parity/contributes/commands/0/id`):

- **`displayName`, `prefix` and `icon`.** The icon is path data and a `viewBox`, drawn in the text's color, never a file
  or markup.
- **`activates`:** `onDetect` (the project has the extension's tool), `onStartup`, `onCommand:<id>`, `onView:<id>` or
  `onNodeType:<type>`. An event naming a command, tab or page has to name one the manifest declares.
- **`contributes`:** `commands`, `menus`, `keybindings`, `tabs`, `sections`, `pages`, `statusItems`, `nodeTypes`,
  `providers`, `agentTools` and `settings`, and no other keys. Every id starts with the prefix and a dot
  (`storybook.open`), as do settings, agent tools and the context keys that `when` and `enablement` test. Menus, keys
  and status items name declared commands. A contribution's icon is the name of an icon in the kit's set, such as
  `book-open`.
- **`when` and `enablement`** (PAR-1092) are expressions: Parity's own keys, `node.type`, `node.owner`, `node.key`,
  `selection.count`, `tool` and `fact.<id>`, compared with `==`, `!=`, `>`, `>=`, `<` or `<=` to a word, a number or a
  quoted string; `project.uses(tool)`, true when the project has a tool by its extension's prefix or its adapter's id;
  and the extension's own context keys on their own, joined with `&&`, `||`, `!` and parentheses. A key on its own holds
  when it's true, or a list holding the key of what the command is shown for. One that doesn't read is refused, naming
  what's wrong, as is an extension key in one that doesn't start with the prefix
  ([`when.ts`](../packages/extensions/src/when.ts)).
- **`keybindings`** write keys as VS Code does, `mod+shift+t`, with `mod` meaning Ctrl, or Cmd on a Mac. Keys Parity
  can't read are refused. Parity's own keys win a clash, with the person's changes, and a key two extensions ask for
  goes to neither; Settings' Keyboard shortcuts page names who has it ([`keys.ts`](../packages/extensions/src/keys.ts)).

The types are in [`@parity-app/extension-api`](../packages/extension-api), a package of types only.

## The host

The project service starts one host per extension per open project: a Node process of its own
([`utility/extension-host.ts`](../apps/desktop/src/utility/extension-host.ts)), which loads the extension's entry module
and calls its `activate`. A crash, a loop or a leak in an extension's code stays in its host. The editor, the service
and other extensions carry on.

[`extensionHosts`](../packages/extensions/src/hosts.ts) keeps every host, and takes its processes, state store and
window as arguments, so its tests run without Electron:

- **Starting.** When a project opens, the extensions whose tool it has and which activate on detection start at once.
  The others start the first time one of their commands runs, one of their tabs opens or Parity asks their provider.
  Extensions found by their peer dependencies are found as soon as the project's package.json is read, before it has
  opened, so a router's host reads the routes while the builder starts (PAR-1095); the rest are found once it has.
- **Stopping.** Closing the project stops its hosts. A host disposes its subscriptions, newest first, then calls
  `deactivate`, and is ended if it hasn't finished within 2 seconds. Servers it started stop with it.
- **Crashing.** A host that ends by itself starts again. After 3 crashes within a minute of each other it's left
  stopped, its contributions are hidden, and a toast names it, with Restart.
- **Stuck.** The service pings each host every 5 seconds. One that hasn't answered for 10 seconds is named in a toast as
  not answering, with Restart, and is running again once it answers.
- **Activation that fails** leaves the host stopped, with the reason in its log.

Each host's log shows in a tab of the bottom panel, beside Console: what its code prints, its uncaught errors with their
stacks, and its starts, crashes and restarts. The tab shows once the extension logs something or runs into trouble.

## The `parity` object

`activate(parity)` gets one object, which the host builds
([`packages/extensions/src/host.ts`](../packages/extensions/src/host.ts)):

- **`project`:** its root, its name, and what detection found of the extension's tool.
- **`commands.register(id, handler)`:** handles a command the manifest declares. The handler gets what it was run on,
  such as a component.
- **`commands.execute(id)`** (PAR-1092): runs one of Parity's own commands, by its id in the keymap (`zoomToSelection`,
  `duplicate`, `wrap`), on what's selected in the project's tab, or any extension's command, which starts its extension
  first. One of Parity's that doesn't apply to what's selected fails, saying so.
- **`selection`** (PAR-1092): what's selected, by `NodeRef` (`get`, synchronous, from the copy the host keeps), told to
  `onChange` listeners each time it changes. `set(refs)` selects nodes and brings them into view: designs, a route's
  page among them, as designs; layers of one design as layers; a route without a page, which the canvas draws as a
  group, a story or a mix, by ref. `highlight(refs)` points at a design or a layer as hovering its row does.
- **`navigate`** (PAR-1092): `reveal(ref)` brings a node into view and `zoomTo(ref)` frames it; `openDesign(key)`;
  `setMode(mode)` shows the selected design in a mode and `setState(design, state)` a design in a state, each by id or
  name; `showTab(id)` opens a panel's tab, Parity's own (`layers`, `components`, `icons`, `media`, `tokens`, `design`,
  `modes`, `accessibility`), the console, an extension's log by its id, or a tab an extension declares;
  `openSettings(id?)` opens an extension's page in Settings; and `pageUrl(ref)` gives the URL the canvas draws a route's
  page at. Each waits for a window with the project open. `pageUrl` is asynchronous, unlike the proposal's, since only
  the window knows the pages.
- **`context.set(key, value)`:** sets a context key that menus' `when` and `enablement` test. A list of keys is true for
  the things it lists, such as the components that have stories.
- **`facts.set(target, facts)`:** what the extension knows about a component, shown on its card.
- **`status.item(id).set({ value, tooltip })`:** a declared status bar item's value. Parity keeps the last value and
  draws it next time before the code loads.
- **`servers`:** starts a dev server in the project's folder on a free port and waits until it answers (`serve`), takes
  over one already running (`adopt`), stops one (`stop`), or lists those Portless routes (`routed`). Each shows in the
  status bar's process list.
- **`ui`:** a toast (`notify`), progress with Cancel (`progress`), a choice from a list (`pick`), a field (`input`), a
  confirmation (`confirm`), and opening a page (`open`), in the person's browser or, with `where: "parity"`, in a window
  of Parity's own.
- **`settings`:** the extension's settings, by their manifest keys (below): `get(key)`, `onChange(key, listener)` and
  `update(key, value)`, which sets only a `project` setting.
- **`providers.register(kind, provider)`** (PAR-1095): gives behaviour to a provider the manifest's `providers`
  declares. Parity calls it with plain data and reads its answer through a schema, so an answer that isn't what the
  provider gives is refused and logged. So far there's `router`, whose `routes()` gives the app's routes, each parent
  before its children; Parity asks once as the project opens.
- **`edits.transact(label, operations)`:** changes designs, with the `edits` permission (below).
- **`files.edit(label, files)`:** writes project files the `write` permission names (below).
- **`state.app` and `state.project`:** values that persist, for every project or for this one.
- **`log`:** lines in the extension's log, as `console` writes are too.
- **`views`:** fills the tabs, sections and pages the manifest declares (below).
- **`subscriptions`:** disposables Parity disposes as the host stops.
- **`extensions.get(id)`** (PAR-1096): an extension the manifest names in `extensionDependencies`, with its API (below).
- **`agentTools.register(name, handler)`** (PAR-1096): handles an agent tool the manifest declares (below).

The host checks each call against the manifest: a command, status item, setting, context key or view the manifest
doesn't declare is refused. The service checks what the host sends, so a node that isn't one is refused too.

## Settings

An extension declares its settings in its manifest's `contributes.settings`, by key, each a small JSON Schema with a
`scope` (PAR-1090):

```jsonc
"settings": {
  "storybook.configDir": { "type": "string", "default": ".storybook", "scope": "project", "title": "Config folder" },
  "storybook.openIn": {
    "type": "string", "enum": ["browser", "parity"], "enumTitles": ["Your browser", "Parity's browser"],
    "default": "browser", "scope": "app", "title": "Open stories in"
  }
}
```

- **The manifest is checked:** each key starts with the prefix, only a string has choices, `enumTitles` names each
  choice, and the default fits.
- **`app` settings are the person's,** for every project, in `settings.json` under `extensions`, by prefix and then the
  key after it: `{ "extensions": { "storybook": { "openIn": "parity" } } }`. Only Settings changes them, since it's its
  own web contents, owned by main, that loads no project code. Main refuses the change from the editor window, where the
  project's code runs, and an extension's `update` of one is refused too.
- **`project` settings are everyone's who opens the project,** in the main `.par`'s `extensions` field, by prefix and
  then key: `{ "storybook": { "configDir": "docs/.storybook" } }`. Adding the field didn't raise `formatVersion`. Each
  change, from Settings or `update`, is one undo step on the main file, saved by Save. The window sends the field to the
  service as it changes, saved or not.
- **What an extension reads** is each setting from its own scope, or its default when it's unset or doesn't fit. One
  that doesn't fit is named on the extension's page. `onChange` hears a change from Settings, another copy of Parity,
  the project's file or `update`.
- **Settings draws them** on the extension's page with the kit's controls: a select for choices, a switch, a number or a
  text field, and finds them by title in its search.

The Extensions page also shows each extension's permissions as its manifest declares them, how long its code took to
activate, and the memory its host holds, which the host reports when the service pings it.

## Views

An extension's UI is data that Parity draws with its own kit (PAR-1094), so it has the editor's spacing, keyboard use,
themes and accessible names, and no extension code runs in the window. The manifest declares where each view goes, and
which kind it is:

- **`tabs`:** a tab in the left, right or bottom panel (`area`), after Parity's own, with its title and icon.
- **`sections`:** a section in the Design tab, for a node type (`nodeType`), where its `when` holds for what's selected.
  For now a section shows for a component's board, as `nodeType: "component"`; other node types come with `nodeTypes`.
- **`pages`:** a page in a tab at the top, after its project's tab, such as a setup guide. It closes with the project.

The code fills one with `parity.views.table`, `tree`, `list`, `keyValue` or `form`, given the id of one whose `view` is
that kind ([views.ts](../packages/extensions/src/views.ts)). A view holds items, or a form's fields, and options:

- **Items** have a `key`, a `label`, and optionally a `detail`, an `icon` with a `tone`, a table's `cells`, a tree's
  `parent`, a key-value pair's `value`, and a `target`, the component it's about.
- **Options:** a `description` above the items, what shows while there are none (`empty`), commands on a `toolbar`, and
  commands on each item (`itemActions`), each with a `when`. A table's options name its `columns`. Commands come from
  the manifest, with their titles and icons.
- **Changes:** `set` replaces every item, `upsert` adds or replaces items by key, `remove` takes them away, and `update`
  changes options. Changes made together go to the window as one. `reveal` opens the view's tab or page, and disposing
  of the view empties it.
- **Forms** hold text, number, boolean and select fields. `onChange` gets each change the person makes, which the form
  keeps.

Until the code fills a view, it says the extension is starting, or why it stopped, with Restart. Opening a tab or page
starts an extension that activates on it (`onView:<id>`). An item's actions run for its `target`, or for the item itself
(`{ type: "item", view, key }`), and the first one also runs on Enter or a double-click. In a section, only the items
about what's selected, and those about nothing, show.

## Changing designs and files

Extensions change designs and files through Parity, never by writing them, so undo, saving and recovery keep working
(PAR-1093). Each change is one undo step named after the extension and the label it gives, as "Tidy: Rename layer".

- **Designs:** `parity.edits.transact(label, operations)` takes operations on layers, by the design's key
  (`app.par#home`) and the layer's id: `insert` a layer before a sibling or last, `remove` one, `move` one within its
  design, and `set` a field (`["name"]`) or one key of `props`, `style` or `args` (`["props", "variant"]`), or take it
  away by leaving out `value`. The project service sends them to the window that has the project open, waiting for one,
  and the window applies them as it applies an agent's call: all of them or none. It refuses them when one names a
  design or layer that isn't there, as one someone deleted meanwhile, or when what they leave isn't a valid design. The
  operations are a subset of those in [proposals/multiplayer.md](proposals/multiplayer.md).
- **Files:** `parity.files.edit(label, files)` creates, replaces, patches or deletes files, each saying what it expects
  to find, through the project service's one queued write ([`utility/edits.ts`](../apps/desktop/src/utility/edits.ts)).
  A file that changed meanwhile is left alone and nothing is written. The window shows the change with its diff and
  Undo, and the watcher takes it as Parity's own.
- **Permissions.** The service refuses `edits.transact` unless the manifest's `permissions` has `"edits": true`, and a
  file write unless `permissions.write` has a glob matching its path (`**` for any folders, `*` for any name, `?` for
  one character). It refuses `.par` files whatever the globs say, and paths outside the project. Permissions keep what
  an extension does through Parity to what it declared. They aren't a sandbox: its code runs in Node of its own.
- **Commands for a layer.** A command placed at `layers` with `"when": "layer"` shows in the menu of any layer in
  Layers, and its handler gets `{ type: "layer", design, node }`. So an extension can rename the layer it was run on:

  ```ts
  parity.commands.register("tidy.rename", async (target) => {
    if (target?.type === "layer") {
      await parity.edits.transact("Rename layer", [
        { op: "set", design: target.design, node: target.node, path: ["name"], value: "Heading" }
      ])
    }
  })
  ```

## Working with other extensions and agents

An extension can offer an API to other extensions, and its commands and tools to agents (PAR-1096).

- **An API for other extensions.** What `activate` returns is its API: an object of functions that take and give JSON.
  Another extension names it in `extensionDependencies` and calls it through `parity.extensions.get(id).api`, where each
  function gives a promise, since it runs in the other extension's host. Parity starts the extensions one builds on
  before it, so their APIs are ready when it activates, and refuses a chain that leads back to itself. An extension
  whose dependency isn't in the project isn't found there. The Storybook extension's API, `StorybookApi`, gives the
  components with stories, a component's story files, and the page of its stories, starting Storybook when it isn't
  running.
- **The accessibility extension** ([`extension-storybook-a11y`](../packages/extension-storybook-a11y/src/extension.ts))
  builds on it, in projects with `@storybook/addon-a11y`. Check accessibility in Storybook shows wherever Open in
  Storybook does, greyed with "No story found" for a component without stories, and opens the component's first story
  with Storybook's accessibility panel open. Its agent tool, `a11y.page`, gives that page.
- **Agents** read a project's extensions with `get_extensions` (`parity extensions`): each one's commands, agent tools
  with their input schemas, node types, and facts about components. `run_extension` (`parity run`) runs a command by id,
  for a component when it names one, or an agent tool by name with its input, which Parity checks against the tool's
  schema first. Either starts the extension when it isn't running, and gives back what its handler returned: Open in
  Storybook gives `{ url }`. The agent API reaches the same hosts the person's clicks do.
- **One undo step named after both.** While an agent's call runs an extension, its changes are named after the agent and
  the extension, as "Claude Code via Tidy: Rename layer", and so are changes made through another extension's API during
  that call. Each agent's call has an id the host carries through the extension's code across its awaits, so two agents'
  calls that overlap keep their own names. An extension an agent's call starts activates as part of that call.
- **Nobody to ask.** While an agent's call runs it, an extension's `ui.pick`, `ui.input` and `ui.confirm` fail with an
  error it can handle. Its toasts, progress and opened pages still show to the person.
- **Agent tools** are declared in the manifest's `contributes.agentTools`, each named with the prefix, with a
  description and a JSON Schema for its input, and given behaviour with `parity.agentTools.register`:

  ```ts
  parity.agentTools.register("a11y.page", async ({ component }) => ({ url: await pageOf(String(component)) }))
  ```

## Tests

- [manifest.test.ts](../packages/extensions/src/manifest.test.ts): ids outside the prefix, undeclared commands, tabs and
  activation events, context keys outside the prefix, unknown events, placements and keys, icons that aren't path data
  or icon names, `when` expressions over Parity's keys and the extension's own, ones that don't read, and keys Parity
  can't read.
- [when.test.ts](../packages/extensions/src/when.test.ts): comparisons, `project.uses`, list keys, `&&`, `||`, `!` and
  parentheses, what's wrong with one that doesn't read, and the keys one looks up.
- [keys.test.ts](../packages/extensions/src/keys.test.ts): keys as the keymap writes them, keys it can't read, and
  Parity's keys winning a clash, with two extensions on one key both named.
- [hosts.test.ts](../packages/extensions/src/hosts.test.ts): starting on detection and on a command, what `activate`
  gets, a command nobody handles, status items drawn before the code loads, undeclared ids, state between runs, logs and
  `parity.ui`, restarting after a crash and stopping after 3, one extension's crash leaving another running, a failed
  activation, a stuck host, stopping everything with the project, and (PAR-1092) the selection from the start and as it
  changes, selecting, highlighting and navigating through the window, a route's page URL, Parity's commands run in the
  window and an extension's in its host, and a node that isn't one refused. Hosts talk over in-memory ports there, and
  load modules without a prototype, as Node's are. Settings: each read from its own scope with an undeclared key
  refused, changes heard by the running code once each, a project setting's `update` sent to the window and an app
  setting's refused, and a value that doesn't fit listed with its note, with the activation time and permissions.
- [hosts.test.ts](../packages/extensions/src/hosts.test.ts) also: renaming a layer from a command as one labelled
  change, refusing design changes without the `edits` permission, and writing files while refusing a `.par`; and
  (PAR-1095) a provider's host started the first time it's asked, with its answer read, nothing without one, an answer
  that isn't a provider's refused and logged, a provider the manifest doesn't declare refused, and opening a project
  again starting only the extensions found since.
- [extension.test.ts](../packages/extension-tanstack-router/src/extension.test.ts) and
  [routes.test.ts](../packages/extension-tanstack-router/src/routes.test.ts): TanStack Router's manifest, with its
  router provider, route node type and Open in browser placed only for routes; its pages counted without the root; the
  page a command was run for, or from Search, the page selected; and the routes it reads.
- [permissions.test.ts](../packages/extensions/src/permissions.test.ts): the `edits` permission, write globs, `.par`
  files and paths outside the project.
- [views.test.ts](../packages/extensions/src/views.test.ts): a view drawing nothing until the code fills it, a run of
  changes sent as one, disposing and restarting emptying views, undeclared views, kinds and actions refused, a form's
  changes, and `reveal`.
- [settings.test.ts](../packages/extensions/src/settings.test.ts): settings kept by the key after the prefix, read from
  their own scope, a value that doesn't fit at its default with a note, types and choices, defaults, and what changed.
  [manifest.test.ts](../packages/extensions/src/manifest.test.ts) also refuses choices on a number, titles that don't
  match and a default that doesn't fit.
- [storybook.test.ts](../packages/extension-storybook/src/storybook.test.ts): Storybook's manifest passes the checks,
  with its project and app settings, and a component's page is its docs first, or its first story when asked.
- [agents.test.ts](../packages/extensions/src/agents.test.ts) (PAR-1096): the extension one builds on activated first
  and its API called in its own host, one the manifest doesn't name refused, one whose dependency is missing left out, a
  command run for an agent giving back what it returned with its change named after both, two agents' overlapping calls
  each named after its own agent, an extension started by an agent's call activating as the agent's, the same through
  another extension's API, a tool's input checked against its schema, questions failing while an agent runs it, and what
  agents read of each extension.
- [extension-storybook-a11y's extension.test.ts](../packages/extension-storybook-a11y/src/extension.test.ts): its
  manifest, Check accessibility in Storybook opening the panel through the Storybook extension's API, and its agent
  tool.
- `packages/agent/src/dispatch.test.ts` "extensions" and `packages/cli/src/operations.test.ts`: `get_extensions` and
  `run_extension`, as `parity extensions` and `parity run`, with the caller named.

Gaps: the forked process in `utility/extension-host.ts` and the window's toasts, tab and dialogs have no tests of their
own. They were tried in the running app on 2026-11-14, on `examples/shadcn-vite`: the status item, the component card's
facts and menu, Open in Storybook starting Storybook and opening it, the log tab, and killing the host 3 times, which
left it stopped with a toast whose Restart brought it back while the canvas carried on. Settings was tried there on
2026-11-14 too: Storybook's page drawn from its manifest in Settings' own view, Open stories in saved to
`settings.json`, the config folder an unsaved undo step, the editor page's attempt to change the app setting refused,
and a page opened in Parity's own window.
