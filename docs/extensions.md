# Extensions

How Parity runs an extension: the manifest it reads first, the host each one runs in, and the `parity` object its code
gets (PAR-1089). Storybook is the first, and so far the only, extension. It's built in. Installing others comes later.

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

The types are in [`@parity-app/extension-api`](../packages/extension-api), a package of types only.

## The host

The project service starts one host per extension per open project: a Node process of its own
([`utility/extension-host.ts`](../apps/desktop/src/utility/extension-host.ts)), which loads the extension's entry module
and calls its `activate`. A crash, a loop or a leak in an extension's code stays in its host. The editor, the service
and other extensions carry on.

[`extensionHosts`](../packages/extensions/src/hosts.ts) keeps every host, and takes its processes, state store and
window as arguments, so its tests run without Electron:

- **Starting.** When a project opens, the extensions whose tool it has and which activate on detection start at once.
  The others start the first time one of their commands runs or one of their tabs opens.
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
- **`edits.transact(label, operations)`:** changes designs, with the `edits` permission (below).
- **`files.edit(label, files)`:** writes project files the `write` permission names (below).
- **`state.app` and `state.project`:** values that persist, for every project or for this one.
- **`log`:** lines in the extension's log, as `console` writes are too.
- **`subscriptions`:** disposables Parity disposes as the host stops.

The host checks each call against the manifest: a command, status item, setting or context key the manifest doesn't
declare is refused.

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

## Tests

- [manifest.test.ts](../packages/extensions/src/manifest.test.ts): ids outside the prefix, undeclared commands, tabs and
  activation events, context keys outside the prefix, unknown events, placements and keys, and icons that aren't path
  data or icon names.
- [hosts.test.ts](../packages/extensions/src/hosts.test.ts): starting on detection and on a command, what `activate`
  gets, a command nobody handles, status items drawn before the code loads, undeclared ids, state between runs, logs and
  `parity.ui`, restarting after a crash and stopping after 3, one extension's crash leaving another running, a failed
  activation, a stuck host, and stopping everything with the project. Hosts talk over in-memory ports there, and load
  modules without a prototype, as Node's are. Settings: each read from its own scope with an undeclared key refused,
  changes heard by the running code once each, a project setting's `update` sent to the window and an app setting's
  refused, and a value that doesn't fit listed with its note, with the activation time and permissions.
- [hosts.test.ts](../packages/extensions/src/hosts.test.ts) also: renaming a layer from a command as one labelled
  change, refusing design changes without the `edits` permission, and writing files while refusing a `.par`.
- [permissions.test.ts](../packages/extensions/src/permissions.test.ts): the `edits` permission, write globs, `.par`
  files and paths outside the project.
- [settings.test.ts](../packages/extensions/src/settings.test.ts): settings kept by the key after the prefix, read from
  their own scope, a value that doesn't fit at its default with a note, types and choices, defaults, and what changed.
  [manifest.test.ts](../packages/extensions/src/manifest.test.ts) also refuses choices on a number, titles that don't
  match and a default that doesn't fit.
- [storybook.test.ts](../packages/extension-storybook/src/storybook.test.ts): Storybook's manifest passes the checks,
  with its project and app settings.

Gaps: the forked process in `utility/extension-host.ts` and the window's toasts, tab and dialogs have no tests of their
own. They were tried in the running app on 2026-11-14, on `examples/shadcn-vite`: the status item, the component card's
facts and menu, Open in Storybook starting Storybook and opening it, the log tab, and killing the host 3 times, which
left it stopped with a toast whose Restart brought it back while the canvas carried on. Settings was tried there on
2026-11-14 too: Storybook's page drawn from its manifest in Settings' own view, Open stories in saved to
`settings.json`, the config folder an unsaved undo step, the editor page's attempt to change the app setting refused,
and a page opened in Parity's own window.
