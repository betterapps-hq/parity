# Storybook and Parity

How Parity and a project's Storybook connect today, what's planned, and the rules that keep the two from getting tightly
coupled. You asked for this because you expect the coupling to grow. Calls made here are also in
[decisions.md](decisions.md).

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

[`findStorybook`](../packages/project/src/storybook.ts) runs when a project opens, after its components are found,
because it needs them to map stories.

- **The config.** `storybookConfig` takes the first `package.json` script that runs `storybook dev` and reads its
  `-c`/`--config-dir` and `-p`/`--port`. The folder defaults to `.storybook`. A `main` file must be there, with any
  extension Storybook accepts, found through the shared config search in
  [configs.ts](../packages/project/src/configs.ts). Without one, the project has no Storybook as far as Parity is
  concerned.
- **The story files.** Every `*.stories.{js,jsx,ts,tsx,mjs,cjs,mts,cts}` under the root, skipping `node_modules`, build
  folders, `storybook-static` and every dot folder. The `stories` globs in `main` aren't read, and `.mdx` files aren't
  looked at.
- **Stories to components.** `parseStoryFile` uses regular expressions to find the first `component: Name`, the first
  `title`, and every `export const`. The component's import is followed to a project component, by relative path or
  tsconfig alias, or to a library component, by package and export name.
- **The result** is `StorybookInfo` in [project.ts](../packages/core/src/project.ts): the config folder, its `main`
  file, the script and port, and the story files per component id. The project notes say "Storybook in `.storybook`,
  with stories for N components".
- **Story files aren't components.** Component detection, and libgen's `describeApp`, skip `.stories`, `.test` and
  `.spec` files by name.

### Version detection

[detect.ts](../packages/project/src/detect.ts) lists Storybook with the other tools.

- **Using Storybook** means any dependency named `storybook` or `@storybook/*`.
- **The version** comes from the installed `storybook` package, or before Storybook 7 from `@storybook/react`,
  `@storybook/react-vite` or `@storybook/core`.
- **The support policy applies,** as for every tool (see [support.md](support.md)). Storybook 10 is supported, 9 drops
  in May 2027, and 8 and earlier are dropped. Dropped means untested, never blocked: it's one quiet line in the status
  bar's tooltips and `detection` in the agent API, and every Storybook feature stays on.

### Opening stories

The book buttons in the Components panel and the layer panel, and the Storybook item in the status bar, call
`storybook.open` on the project service. That's [utility/storybook.ts](../apps/desktop/src/utility/storybook.ts).

- **Reusing a server.** Parity fetches `http://localhost:<port>/index.json`, using the script's port or 6006, with a
  3-second timeout. It reuses the server when one of the index's `importPath`s is one of the project's mapped story
  files, or when no stories are mapped at all. A reused server isn't Parity's, so Parity never stops it.
- **Starting one.** Otherwise Parity starts the project's own Storybook:
  - on the wanted port when it's free, else on one the system picks;
  - by resolving `storybook/package.json` from the project and running its `bin`, with Electron's Node
    (`ELECTRON_RUN_AS_NODE`), in the project's folder;
  - with `dev --port <n> --no-open --ci --config-dir <dir>`.

  It doesn't run the project's npm script or its package manager. It polls `index.json` every 750 ms for up to 3 minutes
  and shows the end of Storybook's output when starting fails.

- **Which page opens.** The index entries for the component's story files are found, and Parity opens the docs page if
  there is one, else the first story. Both open through Storybook's manager (`/?path=/docs/<id>` or
  `/?path=/story/<id>`), never `iframe.html`. With nothing matched, Storybook's home opens.
- **Where it opens.** The system browser, through Electron's window-open handler.
- **Stopping it.** When the project's tab closes, or the service exits, Parity stops the Storybook it started: the whole
  process tree on Windows, and the direct child process elsewhere.
- **Performance stats leave it out,** because it runs outside the app.

### What reaches the UI

`ProjectInfo.storybook` carries the detection result to the window. The UI shows Storybook buttons only for components
with stories, and the status bar item only when the project has a Storybook. The agent API returns the version entry in
`detection`, but not the story mapping, and none of the MCP tools in [packages/cli](../packages/cli) touch Storybook.

### Parity's own Storybook

[apps/desktop/.storybook](../apps/desktop/.storybook) is a separate development tool for Parity's own interface, on port
6007, with about 60 story files. It isn't part of the product:

- Its stories use `storybook/test` for play functions, and a stand-in `storybook.open` that returns a fixed URL.
- Its `example-project` plugin runs the real project discovery on `examples/shadcn-vite`, Storybook info included.
- Which Storybook it runs on decides nothing about which Storybook versions projects can use.

The example project, `examples/shadcn-vite`, runs Storybook 10 on port 6006 with the docs add-on and `autodocs`, so its
components open on their docs page.

## What Parity doesn't do

- **No Storybook package is imported at runtime.** Nothing imports `@storybook/*`, `storybook`, `composeStory` or
  `setProjectAnnotations`.
- **The project's preview isn't read or run.** `preview.*`, its decorators, loaders, parameters and global types are
  ignored on the canvas.
- **Nothing renders through Storybook.** Frames render through Parity's own guest, built by the project's Vite, with
  library decorators written as data in `.lib.par`.
- **No Storybook files are written.** The test fixtures in [packages/fixtures](../packages/fixtures) set up Storybook
  for validation projects, but the product writes none.
- **Nothing in `.par` depends on Storybook.** Removing Storybook from a project loses the buttons, not any design.

## What's planned

- **The project's preview on the canvas.** Parity composes `.storybook/preview.*` with Storybook's portable stories API
  (`setProjectAnnotations` and `composeStory`), the API that runs stories outside Storybook, as Vitest does. Its
  decorators, loaders, parameters and global types apply as Storybook applies them, and its global types become mode
  variables. Panel-only add-ons are ignored. Storybook's newer `definePreview` format still needs checking. See
  [decorators.md](proposals/decorators.md).
- **`.parity/preview.tsx` for projects without Storybook,** decided on 2026-10-28. It has the same exports as
  Storybook's preview, runs on a small runtime of Parity's own, and moves to `.storybook/preview.tsx` unchanged. With no
  Parity file, Storybook's preview is used as it is. When both exist, Parity's file wins and replaces Storybook's on the
  canvas; it can import `.storybook/preview` and spread its decorators to build on them. Adapters, plugins and settings
  go in `parity.config.ts` at the project root instead, which runs in Node, while the preview file runs in the frames.
- **Stories from component designs.** A component design's states become stories, written next to the component file
  Parity writes for it. See [components.md](proposals/components.md).
- **One process manager.** Starting and stopping Storybook becomes its first piece, alongside dev servers and
  `wrangler dev`. See [web-and-backend.md](proposals/web-and-backend.md).
- **Mock data in stories.** MSW handlers built from the OpenAPI document are served to Storybook as well as to rendered
  routes. See [web-and-backend.md](proposals/web-and-backend.md).
- **Stories as tests, later.** Running stories through Storybook's Vitest add-on, once the core works. See
  [web-and-backend.md](proposals/web-and-backend.md) and [support.md](support.md).
- **Open:** whether tests recorded in interact mode replay against a design's story or the running app. See
  [backlog.md](backlog.md).

## The boundary

These rules keep Storybook optional and replaceable. A change that breaks one needs a decision in
[decisions.md](decisions.md) first.

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

3. **Everything Storybook-specific lives in one adapter,** behind an interface Parity owns. Today it's split between
   [packages/project/src/storybook.ts](../packages/project/src/storybook.ts) and
   [apps/desktop/src/utility/storybook.ts](../apps/desktop/src/utility/storybook.ts), with `StorybookInfo` in core and a
   `storybook.open` call in the protocol. The canvas, `.par`, the agent API and the UI talk to the interface, never to
   Storybook.
4. **Parity's models are Parity's.** `.par`, modes, decorators, parameters and states are shaped so they translate to
   and from Storybook's (a mode value is a global, a state can be a story), but they're defined by Parity and never
   imported from Storybook's types.
5. **Storybook versions follow the support policy,** like any other tool: versions released more than two years ago are
   dropped, the newest major never is, and dropped means untested, never blocked.
6. **What Parity writes is plain CSF the project owns.** Generated stories are ordinary story files a developer could
   have written, in the project's style, with no Parity runtime import. Deleting Parity leaves them working.
7. **Starting Storybook is a process like any other,** owned by the process manager once it exists, with the same ports,
   logs and stopping rules as a dev server.

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

- **The detection rule.** [decisions.md](decisions.md) says a `.storybook/main.*` folder "or" a script that runs
  `storybook dev`. The code always needs the `main` file; the script only moves the folder and sets the port. The code
  is right, because Storybook can't run without `main`. decisions.md should say so.
- **The port.** decisions.md says Parity starts Storybook "on a free port". The code tries the script's port, or 6006,
  first, and picks a free one only when that's taken. The code is the better behaviour, since links people already use
  keep working. decisions.md should say so.
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
- **The decorator context.** decisions.md and decorators.md say a decorator gets `args`, `globals`, `parameters` and
  `loaded`. The guest passes only `globals`. That's enough for `.lib.par` decorators today, which read only the mode.
  Before a project's own decorators run, the guest must pass the rest, plus `id`, and `viewMode` as `"story"`, because
  Storybook decorators sometimes read it.

## Tests

**Covered,** all in `pnpm test`:

- Mapping stories to components in [project/src/index.test.ts](../packages/project/src/index.test.ts): a custom port and
  config folder, aliased and renamed imports, a stray story file, a story with only a title, and no config at all.
- Version detection in [detect.test.ts](../packages/project/src/detect.test.ts): Storybook 8 and 6 dropped, 9 supported
  until May 2027.
- Snapshot detection of the fixtures in [packages/fixtures](../packages/fixtures): `react-aria` on Storybook 9,
  `too-old` on 8, and `vite7-js` and `mantine` without one. The fixtures must be installed first.

Parity's own Storybook has play functions for the UI's Storybook states (opening, opened, failed, no Storybook) in the
status bar and the Components panel. They run against the stand-in service and aren't part of `pnpm test`. The layer
panel's button has no story.

**Not covered:** all of [utility/storybook.ts](../apps/desktop/src/utility/storybook.ts). Reusing a server, starting
one, choosing a port, matching index entries, building URLs, restarting a stopped one and stopping it have no tests. A
fake `index.json` server and a fake `bin` would cover most of it in unit tests, and one fixture test could start
`react-aria`'s real Storybook 9.
