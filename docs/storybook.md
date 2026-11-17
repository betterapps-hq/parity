# Storybook and Parity

How Parity and a project's Storybook connect today, what's planned, and the rules that keep the two from getting tightly
coupled. You asked for this because you expect the coupling to grow.

## In one line

Storybook is a tool Parity reads and starts, never one it runs on: every feature works without it, Parity touches only
its public formats, and everything Storybook-specific sits in one adapter.

## What Parity uses today

Parity's runtime touches a project's Storybook in four ways:

1. It checks that Storybook's `main` config file exists.
2. It reads `*.stories.*` source files.
3. It starts the project's own `storybook` command.
4. It fetches the dev server's `index.json`.

All four are optional, and none needs a Storybook package inside Parity.

### Detection

Everything about the project's Storybook is read by its extension (PAR-1131); Parity's core doesn't name it.

- **Finding it.** Parity finds the tool as it finds any entities provider's, from the extension's manifest
  (`extensionEntities`): the project declares one of its peer dependencies or a `@storybook/*` package, and its config
  is the first of the `.storybook/main` files its provider watches.
- **The config.** The extension reads its config folder from its `storybook.configDir` setting when it's changed from
  `.storybook`, else from the first `package.json` script that runs `storybook dev` (`-c`/`--config-dir`), else
  `.storybook`, and the port from that script's `-p`/`--port` (`projectStorybook` in
  [storybook.ts](../packages/extension-storybook/src/storybook.ts)). A change to the setting is read again at once,
  without opening the project again.
- **The story files.** Each import lists the project's `*.stories.{js,jsx,ts,tsx,mjs,cjs,mts,cts}` files through its
  entities source. The `stories` globs in `main` aren't read, and `.mdx` files aren't looked at.
- **Stories to components.** The extension's CSF reader finds each file's meta: its `title`, its `component` and every
  story it exports. Parity follows the component's import to a project component, by relative path or tsconfig alias, or
  to a library component, by package and export name (`componentFor` in
  [component-for.ts](../packages/project/src/component-for.ts)).
- **The result** is kept by the extension: the config folder, the port and the story files per component id. Its log
  says "Found Storybook's config in `.storybook`, with stories for N components".
- **Story files aren't components.** Component detection, and libgen's `describeApp`, skip `.stories`, `.test` and
  `.spec` files by name.

### Version detection

[detect.ts](../packages/project/src/detect.ts) lists Storybook with the other tools.

- **Using Storybook** means any dependency named `storybook` or `@storybook/*`.
- **The version** comes from the installed `storybook` package, or before Storybook 7 from `@storybook/react` or
  `@storybook/react-vite`: the extension's peer dependencies, in that order.
- **The support policy applies,** as for every tool (see [support.md](support.md)), through the range in the extension's
  `peerDependencies`, `^9.0.0 || ^10.0.0`: Storybook 10 and 9 are supported, and 8 and earlier are dropped. 9 leaves the
  range in May 2027. Dropped means untested, never blocked: it's one quiet line in the status bar's tooltips and
  `detection` in the agent API, and every Storybook feature stays on.

### Opening stories

Storybook is Parity's first extension ([extensions.md](extensions.md)):
[packages/extension-storybook](../packages/extension-storybook), which runs in a host of its own for each open project.
Its manifest declares `storybook.open`, Open in Storybook, which shows wherever a code component offers what adapters
and extensions do (its layer's header, its right-click menus in Layers, on the canvas and in the Components panel, its
row's button and card, and Search actions), and which the Storybook item in the status bar runs. Its code
([extension.ts](../packages/extension-storybook/src/extension.ts)) sets which components have stories, each one's story
count on its card, and the status item's count. Parity finds it where its entities detection finds the project's
Storybook (`"detect": { "entities": true }`, PAR-1128), and the extension reads the rest itself each time Parity imports
the stories: which components have stories, from the story files its entities provider reads, its config folder (the
Config folder setting when it's changed from `.storybook`, else the `storybook dev` script's `-c`, else `.storybook`)
and the port the script asks for. The service passes it nothing about Storybook.

- **Reusing a server.** The extension asks `parity.processes.find` about the script's port or 6006, and, when the
  project has stories, the discovery providers too, as the Portless extension's routes. It fetches each one's
  `index.json` with a 3-second timeout, and keeps those where one of the index's `importPath`s is one of the project's
  mapped story files, or every one when no stories are mapped. When two serve the same stories, as two worktrees can,
  the one serving this checkout's files is the project's. It adopts that one, so it's listed with the project's
  processes, but Parity never stops it.
- **Starting one.** Otherwise it starts the project's own Storybook with `parity.processes.start`, which its manifest
  allows with `"permissions": { "processes": ["bin:storybook"] }`:
  - on the wanted port when it's free, else on one the system picks;
  - by resolving `storybook/package.json` from the project and running its `bin`, with Electron's Node
    (`ELECTRON_RUN_AS_NODE`), in the project's folder;
  - with `dev --port <n> --no-open --ci --config-dir <dir>`.

  It doesn't run the project's npm script or its package manager. Parity waits until `index.json` answers, and shows the
  end of Storybook's output when starting fails. The server outlives the extension's host: when the host starts again,
  `parity.processes.get` gives it back.

- **Which page opens.** The index entries for the component's story files are found, and Parity opens the docs page if
  there is one, else the first story. Both open through Storybook's manager (`/?path=/docs/<id>` or
  `/?path=/story/<id>`), never `iframe.html`. With nothing matched, Storybook's home opens.
- **Where it opens.** Settings > Extensions > Storybook > Open stories in, the person's for every project: their
  browser, through Electron's window-open handler, or a window of Parity's own (PAR-1090).
- **Its config folder** is the project's setting, Config folder, kept in the main `.par`. Detection reads it before the
  extension's code loads, and finds `.storybook` when it's unset.
- **Stopping it.** When the project's tab closes, or the service exits, Parity stops the Storybook it started and every
  process that Storybook started. When main quits or replaces the service, it ends the service's whole process tree,
  Storybook included (PAR-980). A service that crashes can't stop anything, and its children can't be found from it once
  it's gone, so the service tells main the ids of the processes it's running as each starts and ends, and main ends
  their trees when the service exits by itself (PAR-1019).
- **Performance stats leave it out,** because it runs outside the app.

### Views

The extension draws three declarative views ([extensions.md](extensions.md#views),
[views.ts](../packages/extension-storybook/src/views.ts)):

- **The Stories tab** in the left panel: a tree of the components with stories, by name, each with its story count,
  opening to its stories, named as Storybook names them (`PrimaryLarge` as Primary Large). With more than one story
  file, each story says which file it's in. Open in Storybook is on every row.
- **A Stories section** in the Design tab for a component's board when it has stories, listing them with Open in
  Storybook.
- **The Storybook setup page,** which Show Storybook setup opens from Search actions: whether Parity found the config
  and stories, and whether Storybook is running and where, each a step that's done or says what's missing, with Open in
  Storybook above them.

### What reaches the UI

`ProjectInfo.storybook` carries the detection result to the service, which gives it to the extension's host as what
detection found. The extension starts only for a project with a Storybook, and sets the context key
`storybook.hasStories` to the components with stories, so the UI offers Open in Storybook only for them and greys it
with "No story found" elsewhere. The agent API returns the version entry in `detection`, but not the story mapping, and
none of the MCP tools in [packages/cli](../packages/cli) touch Storybook.

### Parity's own Storybook

[apps/desktop/.storybook](../apps/desktop/.storybook) is a separate development tool for Parity's own interface, on port
6007, with about 60 story files. It isn't part of the product:

- Its stories use `storybook/test` for play functions, and a stand-in Storybook extension whose Open in Storybook
  returns a fixed URL.
- Its `example-project` plugin runs the real project discovery on `examples/shadcn-vite`, Storybook info included, but
  opens its own designs file, `.storybook/example.par`, in place of the example's: only the fourteen designs stories
  use, so stories stay quick while the example grows as a stress test.
- Which Storybook it runs on decides nothing about which Storybook versions projects can use.

The example project, `examples/shadcn-vite`, runs Storybook 10 on port 6006 with the docs add-on and `autodocs`, so its
components open on their docs page.

## What Parity doesn't do

- **Storybook is imported only to compose its preview.** With no `.parity/preview.*`, the React guest imports
  `setProjectAnnotations` and `composeStory` from the project's own `@storybook/react`, or the React framework that
  re-exports it, to apply `.storybook/preview.*` to frames. Storybook's extension names the files and packages in its
  manifest (`contributes.providers.preview`), so nothing outside it names Storybook's files (PAR-98, see
  [editor.md](editor.md)). Nothing else of Storybook's is imported.
- **Nothing renders through Storybook.** Frames render through Parity's own guest, built by the project's Vite, with
  library decorators written as data in `.lib.par`.
- **No Storybook files are written.** The test fixtures in [packages/fixtures](../packages/fixtures) set up Storybook
  for validation projects, but the product writes none.
- **Nothing in `.par` depends on Storybook.** Removing Storybook from a project loses the buttons, not any design.

## What's planned

- **The rest of the project's preview on the canvas.** Parity composes `.storybook/preview.*` with Storybook's portable
  stories API now (PAR-98). `definePreview` previews compose too (PAR-97). Still to come: its global types as mode
  variables (PAR-105), a stories file's decorators (PAR-99) and add-ons' annotations (PAR-112). Panel-only add-ons are
  ignored. See [decorators.md](proposals/decorators.md).
- **`.parity/preview.tsx` for projects without Storybook,** built in PAR-100 (see [editor.md](editor.md)). It has the
  same exports as Storybook's preview, runs on a small runtime of Parity's own, and moves to `.storybook/preview.tsx`
  unchanged. With no Parity file, Storybook's preview is used as it is (PAR-98). When both exist, Parity's file wins and
  replaces Storybook's on the canvas; it can import `.storybook/preview` and spread its decorators to build on them. A
  project's extensions and their settings go in its `.par` file instead, as
  [developer-api.md](proposals/developer-api.md) sets out.
- **Stories from component designs.** A component design's states become stories, written next to the component file
  Parity writes for it. See [components.md](proposals/components.md).
- **One process manager.** Storybook starts and stops through it now (PAR-20), and dev servers and `wrangler dev` are to
  follow. It starts, times and stops each server through the same child lifecycle as builders, installs and the type
  checker's worker (PAR-987). See [web-and-backend.md](proposals/web-and-backend.md).
- **Mock data in stories.** MSW handlers built from the OpenAPI document are served to Storybook as well as to rendered
  routes. See [web-and-backend.md](proposals/web-and-backend.md).
- **Stories as tests, later.** Running stories through Storybook's Vitest add-on, once the core works. See
  [web-and-backend.md](proposals/web-and-backend.md) and [support.md](support.md).
- **Open:** whether tests recorded in interact mode replay against a design's story or the running app. See PAR-320 in
  Linear.

## The boundary

These rules keep Storybook optional and replaceable. A change that breaks one needs your agreement first.

1. **Storybook is optional.** Every feature works without it. Where Storybook adds something, such as a project's
   decorators, Parity has its own way to get the same thing: `.parity/preview.tsx`, `.lib.par` decorators, modes. And
   where Parity's file and Storybook's both exist, Parity's decides what the canvas uses, so Storybook never has the
   last word on how a frame renders.
2. **Parity reads only Storybook's public, documented surfaces:**
   - CSF files, read as source;
   - the dev server's `index.json` and manager URLs;
   - the preview's exports, through the portable stories API;
   - the documented flags of `storybook dev`.

   It never reads Storybook's internal modules, its cache, the manager's state, or `iframe.html`.

3. **Everything Storybook-specific lives in one adapter,** behind an interface Parity owns. Detecting it, importing
   stories, writing args back and opening it are in its extension,
   [packages/extension-storybook](../packages/extension-storybook), and Parity finds the tool from its manifest. The
   canvas, `.par`, the agent API and the UI talk to the interface, never to Storybook.
4. **Parity's models are Parity's.** `.par`, modes, decorators, parameters and states are shaped so they translate to
   and from Storybook's (a mode value is a global, a state can be a story), but they're defined by Parity and never
   imported from Storybook's types.
5. **Storybook versions follow the support policy,** like any other tool: versions released more than two years ago are
   dropped, the newest major never is, and dropped means untested, never blocked.
6. **What Parity writes is plain CSF the project owns.** Generated stories are ordinary story files a developer could
   have written, in the project's style, with no Parity runtime import. Deleting Parity leaves them working.
7. **Starting Storybook is a process like any other,** owned by the
   [process manager](../apps/desktop/src/utility/process-manager.ts), with the same ports, logs and stopping rules as a
   dev server.

### The adapter

A sketch of the interface. The names are Parity's, and Storybook is its first and only implementation.

```ts
/** A tool that keeps stories for a project's components. Storybook is the only one so far. */
export interface StoryAdapter {
  id: string
  /** Finds the tool from the project's files, without running it. */
  detect(project: ProjectFiles): Promise<StoryTool | undefined>
  /** Which components have stories, by component id. */
  stories(tool: StoryTool, components: ComponentMap): Promise<Record<string, StoryRef[]>>
  /** Reuses or starts the tool's server through the process manager. */
  serve(tool: StoryTool, processes: ProcessManager): Promise<StoryServer>
  /** The project's preview as Parity's own decorators, loaders, parameters and globals. Planned. */
  preview?(tool: StoryTool, frame: FrameContext): Promise<PreviewAnnotations>
  /** Story files for a component design, as plain files in the project's style. Planned. */
  writeStories?(design: ComponentDesign, style: ProjectStyle): Promise<FileChange[]>
}

export interface StoryServer {
  url: string
  /** The manager URL for a story or docs page, never `iframe.html`. */
  pageFor(story: StoryRef): string
  /** Stops the server only when Parity started it. */
  stop(): void
}
```

`PreviewAnnotations` is the same type `.parity/preview.tsx` produces, so the guest renders decorators without knowing
whether Storybook supplied them. Ladle, Histoire or a future Storybook format would be another adapter, not a change to
the canvas.

## Coupling risks, and their fixes

1. **`index.json` and manager URLs.** Parity relies on `entries[*].id`, `type` (`story` or `docs`) and `importPath` with
   a leading `./`, and on `/?path=/story/<id>`. If those change, reuse fails, starting waits the full 3 minutes before
   erroring, or the home page opens. **Fix:** parse the index in one place in the adapter, check its shape, fail fast
   with a clear message on one Parity doesn't know, and test against saved indexes from Storybook 9 and 10.
2. **Starting the command line.** `require.resolve("storybook/package.json")` depends on Storybook's `exports`, which
   version detection avoids by finding packages the way Node does. Parity also relies on the `bin` shape and four flags,
   and only `-c` and `-p` are read from the project's script, so its other flags, environment variables and package
   manager are lost. Yarn Plug'n'Play has no fixture. Storybook's minimum Node version must fit Electron's. **Fix:**
   find the package as detection does, keep to the four documented flags, compare Storybook's `engines.node` with
   Electron's Node before starting, and add a Plug'n'Play fixture.
3. **Reusing a server is a guess.** Only `localhost` on one port is checked. With no stories mapped, any Storybook on
   that port is accepted, even another project's. A Storybook on another port isn't found, so a second one starts, and
   so it does when a large project takes more than 3 seconds to answer. **Fix:** always match the index against the
   project's story files, check the ports the process manager knows and the script's, and treat a slow answer as "still
   starting" rather than "not there".
4. **Reading CSF with regular expressions, and ignoring `main`'s `stories` globs.** The first `component:` and `title:`
   anywhere in the file win, and only `export const` stories count. Stories with no `component`, MDX docs, stories
   covering several components, names like `*.story.tsx`, stories in dot folders, and a Storybook in another package of
   a monorepo are missed. Files Storybook doesn't index still get a button, which then opens the home page. **Fix:**
   parse story files with the TypeScript parser component detection already uses, read the `stories` globs through the
   config loader, and when a server is running, take the mapping from its index.
5. **The story map goes stale.** It's read only when a project opens. New or deleted stories, or Storybook removed while
   the project is open, show only after reopening. **Fix:** watch story files and `main`, as component files are
   watched.
6. **Decorator order and context.** When the project's own decorators join, Parity's order and context must match
   Storybook's exactly, or a decorator that works in Storybook breaks on the canvas. See the next section. **Fix:**
   compile everything into Storybook's order, pass the full context, and test with a decorator that depends on both.
7. **Stopping on macOS and Linux.** Only the direct child process is signalled, so Storybook's own child processes can
   be left running. **Fix:** start it in its own process group and stop the group, as Windows stops the tree.
8. **The demo hides a path.** The example's `autodocs` means "no docs page, open the first story" never happens there.
   **Fix:** a validation project, or one example component, with stories and no docs page.
9. **Version entries are added by hand.** Each new Storybook major needs a line in detect.ts. That's the support policy
   working as intended, not a coupling bug: nothing switches off when a version is dropped.

## Where the docs and the code disagree

- **The decorator order.** Storybook nests decorators from the story outwards: the list is
  `[...story, ...component, ...project]`, and each decorator wraps everything before it. So in one list, **the first
  decorator is innermost and the last outermost**, and the project's wrap the component's, which wrap the story's. This
  was checked in Storybook 10.6.5's `prepareStory` and `defaultDecorateStory`; the decorators page in Storybook's docs
  gives the levels but doesn't spell out the order within a list.
  - [decorators.md](proposals/decorators.md) says "the last decorator wraps the ones before it". That's right.
  - [library.ts](../packages/core/src/library.ts) says "Decorators follow Storybook's order: the first wraps outermost",
    and the guest nests `.lib.par` decorators that way with `reduceRight`. That's the opposite of Storybook.
  - **Fix:** keep `.lib.par` lists outermost first, since that reads like the JSX it makes, but call it Parity's
    manifest order, not Storybook's. Reverse it when compiling into the decorator list, before any project decorators
    join, so a project's decorators nest exactly as in Storybook.
  - The guest now nests `.parity/preview.tsx`'s decorators in Storybook's order, inside the libraries' (PAR-100).
- **The decorator context.** decorators.md says a decorator gets `args`, `globals`, `parameters` and `loaded`. The guest
  passes them, with `argTypes`, `canvasElement`, and `viewMode` as `"story"`, since Storybook decorators sometimes read
  it (PAR-100). `args` and `argTypes` are empty, and `id` isn't passed yet.

## Tests

**Covered,** all in `vp run test`:

- Mapping stories to components in [project/src/index.test.ts](../packages/project/src/index.test.ts): a custom port and
  config folder, aliased and renamed imports, a stray story file, a story with only a title, and no config at all.
- Version detection in [detect.test.ts](../packages/project/src/detect.test.ts): Storybook 8 and 6 dropped, 9 and 10
  supported by the range, 11 newer. The range itself in
  [storybook.test.ts](../packages/extension-storybook/src/storybook.test.ts).
- Snapshot detection of the fixtures in [packages/fixtures](../packages/fixtures): `react-aria` on Storybook 9,
  `too-old` on 8, and `vite7-js` and `mantine` without one. The fixtures must be installed first.

Parity's own Storybook has play functions for the UI's Storybook states (opening, opened, failed, no Storybook) in the
status bar and the Components panel. They run against the stand-in service and aren't part of `vp run test`. The layer
panel's button has no story.

Covered too, in [storybook.test.ts](../packages/extension-storybook/src/storybook.test.ts): the manifest passes Parity's
checks, reading what detection found, leaving out index entries of unknown kinds, telling the project's Storybook from
another's, and which page opens. [views.test.ts](../packages/extension-storybook/src/views.test.ts) covers story names,
the Stories tab's tree, the Design tab's section and the setup guide's steps.

**Not covered:** in [extension.ts](../packages/extension-storybook/src/extension.ts), reusing a server, starting one,
choosing a port, restarting a stopped one and stopping it have no tests. A fake `index.json` server and a fake `bin`
would cover most of it in unit tests, and one fixture test could start `react-aria`'s real Storybook 9.
