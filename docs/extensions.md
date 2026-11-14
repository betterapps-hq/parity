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
  confirmation (`confirm`), and opening a page in the browser (`open`).
- **`state.app` and `state.project`:** values that persist, for every project or for this one.
- **`log`:** lines in the extension's log, as `console` writes are too.
- **`subscriptions`:** disposables Parity disposes as the host stops.

The host checks each call against the manifest: a command, status item or context key the manifest doesn't declare is
refused.

## Tests

- [manifest.test.ts](../packages/extensions/src/manifest.test.ts): ids outside the prefix, undeclared commands, tabs and
  activation events, context keys outside the prefix, unknown events, placements and keys, and icons that aren't path
  data or icon names.
- [hosts.test.ts](../packages/extensions/src/hosts.test.ts): starting on detection and on a command, what `activate`
  gets, a command nobody handles, status items drawn before the code loads, undeclared ids, state between runs, logs and
  `parity.ui`, restarting after a crash and stopping after 3, one extension's crash leaving another running, a failed
  activation, a stuck host, and stopping everything with the project. Hosts talk over in-memory ports there, and load
  modules without a prototype, as Node's are.
- [storybook.test.ts](../packages/extension-storybook/src/storybook.test.ts): Storybook's manifest passes the checks.

Gaps: the forked process in `utility/extension-host.ts` and the window's toasts, tab and dialogs have no tests of their
own. They were tried in the running app on 2026-11-14, on `examples/shadcn-vite`: the status item, the component card's
facts and menu, Open in Storybook starting Storybook and opening it, the log tab, and killing the host 3 times, which
left it stopped with a toast whose Restart brought it back while the canvas carried on.
