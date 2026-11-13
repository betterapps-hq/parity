# Proposal: package boundaries

Status: draft. `@parity-app/code` exists (PKG-3), project edits are in `@parity-app/project` (PAR-6), and
`@parity-app/editor` has arranging and the clipboard (PAR-7), all on 2026-10-29. `@parity-app/tokens` holds reading,
editing and matching tokens (PAR-35), and `@parity-app/editor` inserting, Make component and placement (PAR-32), drop
rules and snapping (PAR-33) and the design store's history (PAR-34), on 2026-10-30. `@parity-app/models` holds the lens
models (PAR-15), `@parity-app/editor` moving, resizing and nudging (PAR-577) and the selection model and edit target
(PAR-570), and `@parity-app/project` the one reader of installed packages (PAR-573), on 2026-11-05.
`@parity-app/account` holds signing in with WorkOS (PAR-613), and `@parity-app/telemetry` telemetry's event model
(PAR-618), on 2026-11-05. `@parity-app/style-schema` holds the stored style and its CSS declarations (PAR-939), and the
ledger of CSS properties and `validate` (PAR-940), and the adapter contract that `@parity-app/styles-tailwind` prints
and reads classes through (PAR-943), on 2026-11-11. `@parity-app/processes` holds what the desktop app's processes
decide, moved out of core (PAR-989), and the one lifecycle every child process and worker goes through (PAR-987), on
2026-11-12. Core's last files that weren't the model moved to the packages that use them, and its unused names went
(PAR-1044), the same day. The first items are in Linear's Package boundaries stream.

## In one line

Business logic lives in packages that take data and return data, each with tests that run without Electron. The desktop
app keeps the views and the wiring. The parts we'll change most (design and code in both directions, editor behaviour,
writing into projects, and each lens) each get one home that's easy to find, replace and test.

## Why now

You expect design-to-code and code-to-design to be "a much bigger effort than I realized", with a lot of iteration, and
other areas to be like it. Iteration is cheap when the logic sits behind a small interface with fast tests, and costly
when it's spread through UI code. Today:

- **The desktop app holds most of the code.** It has about 22,400 lines in 127 files, with 4 test files. The packages
  together have about 12,600 lines, with 26 test files.
- **Nothing for design-and-code sync exists yet,** so it can start in the right place instead of being moved later.

## What's clean today

- **`@parity-app/core` is the `.par` model and the operations on it:** documents, edits, instances, render resolution,
  modes, CSS and the library manifest, with the token types its contracts name. It imports nothing from Node, Electron
  or React, and has 12 test files. Its `values/` module checks and evaluates decorator and sample values (PAR-572); the
  guest imports its evaluator and `icon-names.ts` alone, as `@parity-app/core/values/evaluate` and
  `@parity-app/core/icon-names`, since they import nothing at runtime.
- **What isn't the model lives with what uses it** (PAR-1044): frame skeletons and the style changes an edit previews in
  `@parity-app/editor`; detection's types, package.json scripts, stylesheet extensions and gathered code changes in
  `@parity-app/project`; and the JSONC parser in `@parity-app/registry`, since `project` depends on `registry` and both
  read config files with it.
- **Core and editor name what other packages may use** in `src/index.ts`, one `export { … }` per module, and a name
  nothing outside uses stays inside (PAR-989). Their `package.json` `exports` allow nothing else, apart from core
  modules that load on their own: `errors`, `fixtures`, `icon-names`, `props`, `schema` and `values/evaluate`.
- **Framework-specific code sits behind adapter interfaces:** `@parity-app/renderer-react`, `@parity-app/builder-vite`
  and `@parity-app/styles-tailwind`.
- **The agent API calls core's edits** (`setContainer`, `insertNode`, `moveNode`, `applyChanges` and the rest) rather
  than reimplementing them.

## Where the lines are missing

1. **Editor rules live in the app.** These are model operations, mixed with views and the DOM:
   - [clipboard.ts](../../apps/desktop/src/renderer/canvas/clipboard.ts): the clipboard envelope, new ids on paste,
     placing pasted layers, copying and pasting style (in `@parity-app/editor` since PAR-7);
   - [layer-drag.ts](../../apps/desktop/src/renderer/canvas/layer-drag.ts): where a dragged layer can land (in
     `@parity-app/editor` since PAR-33);
   - [arrange.ts](../../apps/desktop/src/renderer/chrome/arrange.ts): deleting, duplicating, wrapping, unwrapping,
     aligning, distributing (in `@parity-app/editor` since PAR-7);
   - [insert.ts](../../apps/desktop/src/renderer/canvas/insert.ts),
     [components.ts](../../apps/desktop/src/renderer/chrome/components.ts) and
     [create.ts](../../apps/desktop/src/renderer/chrome/create.ts): inserting, Make component, where new designs go (in
     `@parity-app/editor` since PAR-32);
   - [snap.ts](../../apps/desktop/src/renderer/canvas/snap.ts): snapping (in `@parity-app/editor` since PAR-33);
   - [design-store.ts](../../apps/desktop/src/renderer/design-store.ts): undo, unsaved tracking and save state, inside a
     store that also holds React hooks (in `@parity-app/editor` since PAR-34);
   - [selection.ts](../../apps/desktop/src/renderer/selection.ts) and `editingState` in `LayerPanel.tsx`, with copies in
     the canvas menu and nudging: the selection model, and which design, state and viewport an edit lands on (in
     `@parity-app/editor` since PAR-570, as `selection.ts` and `edit-frame.ts`; the app keeps the store and its hooks).
2. **Code is read three times, by three packages.** `project/components.ts` parses files to list components,
   `libgen/components.ts` runs TypeScript's checker to find them, and `@parity/props` runs it again for props. (They are
   [listing.ts](../../packages/code/src/listing.ts), [checker.ts](../../packages/code/src/checker.ts) and
   [props.ts](../../packages/code/src/props.ts) in `@parity-app/code` now.) Reading an edited component back into its
   design would be a fourth. The checker held about 1.8 GB on copacker, so one program per project matters for memory
   too.
3. **Writing into a project has no shared layer.** Token edits go into the stylesheet from
   [utility/projects.ts](../../apps/desktop/src/utility/projects.ts), library style imports from
   [utility/libraries.ts](../../apps/desktop/src/utility/libraries.ts), images from
   [utility/images.ts](../../apps/desktop/src/utility/images.ts), and `.lib.par` files from
   [cli/lib.ts](../../packages/cli/src/lib.ts). Each writes its own way. Generated components and stories, the drift
   review, mock handlers, migrations, route files and recipes all need the same thing: a change shown as a diff, applied
   together, undone together.
4. **Lenses have nowhere to go but core.** Without a rule, the data, API, routes, mocks and telemetry lenses would grow
   core into a grab bag.

## The rule

- **Logic packages take data and return data.** No Node, React, tldraw or Electron in them, and they depend only on
  other pure packages. Files, IPC and processes stay in the app's main and service processes, which call the packages. A
  package is pure unless it's named as a reader or at the edge, so a new package starts pure.
- **Readers read a project's files but never write them or start processes:** `@parity-app/code`, `@parity-app/project`
  and `@parity-app/registry`, since TypeScript's program and the project's discovery read the project as they go. A
  reader that needs a file changed returns a project edit for the service to apply. Readers use no React and depend only
  on pure packages and other readers.
- **The edge is where Node and React belong:** the CLI, `@parity-app/libgen`, the agent runtime, the adapters
  (`renderer-react`, `builder-vite` and `styles-tailwind`), `@parity-app/media-player` and the fixtures.
  `renderer-react` and the media player are the packages with React.
- **Dependencies point one way:** the app uses packages, no package imports Electron, tldraw or the app, and core
  imports nothing but zod, which checks the data Parity didn't make (PAR-588), and `@parity-app/style-schema`, which a
  document's styles are held in and drawn through (PAR-939). `@parity-app/style-schema` imports nothing but zod and
  css-tree, which matches a value against a property's grammar (PAR-940).
- **Each package's tests run in Vitest without Electron.** They may use Node to set up files. A rule that changes gets a
  test where it lives.
- **The guard is mechanical.** pnpm already stops a package importing what its `package.json` doesn't declare, and
  `no-restricted-imports` overrides in the root `vite.config.ts` keep each kind of package to its imports, so
  `pnpm verify` fails on a breach. Naming a package a reader or part of the edge is a change to that file, reviewed like
  any other.

## The packages

| Package                                 | What it owns                                                                                                                                                                                                                                                               | Comes from                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@parity-app/code`                      | One TypeScript program per project. Listing components, props, file ownership by hash, writing a component file from a design, reading an edited file back, drift, review.                                                                                                 | `project/components.ts`, `libgen/components.ts`, `@parity/props`, and the CMP items not built yet.                                                                                                                                                |
| Project edits, in `@parity-app/project` | File edits built as data, shown as a diff, applied together, undone together, remembered so the app ignores its own writes.                                                                                                                                                | The writes in `utility/projects.ts`, `utility/libraries.ts`, `utility/images.ts` and `cli/lib.ts`.                                                                                                                                                |
| `@parity-app/editor`                    | Editor behaviour without the views: clipboard, drop rules, arranging, inserting, Make component, placement, snapping, moving, resizing and nudging, style editing, selection, undo and unsaved tracking.                                                                   | The renderer files listed above.                                                                                                                                                                                                                  |
| `@parity-app/models`, then one per lens | The lens schemas (PAR-15), then each lens's standards reader and model operations. Each adapter, such as Drizzle or TanStack Router, is a package of its own.                                                                                                              | New code.                                                                                                                                                                                                                                         |
| `@parity-app/storybook`                 | Everything Storybook-specific, behind the `StoryAdapter` in [storybook.md](../storybook.md).                                                                                                                                                                               | `project/storybook.ts` and `utility/storybook.ts` (PAR-114).                                                                                                                                                                                      |
| `@parity-app/account`                   | Signing in with WorkOS without the views: the authorize URL and PKCE, the link the browser hands back, the code exchange and refresh, the token's claims, and when to refresh.                                                                                             | New code, from [sign-in.md](sign-in.md) (PAR-613).                                                                                                                                                                                                |
| `@parity-app/tokens`                    | Reading tokens (Tailwind, DTCG), editing them in stylesheets, matching described tokens to custom properties, and checking what a token edit may write (PAR-569).                                                                                                          | `core/tokens.ts`, `core/tokens-dtcg.ts`, `core/css-source.ts`, the Tokens panel's matching.                                                                                                                                                       |
| `@parity-app/channel`                   | Requests and replies over any port: request ids, waiting for a port, failing on close, coded details both ways, unknown methods and checked params.                                                                                                                        | The preload script, `utility/index.ts`, `render.ts`, `console.ts`, `worker-client.ts` and main (PAR-565).                                                                                                                                         |
| `@parity-app/telemetry`                 | Telemetry's event model without Sentry: the envelope, registered events with zod schemas, spans with W3C trace IDs, sinks, a test sink and the last 500 events.                                                                                                            | New code, from [product-telemetry.md](product-telemetry.md) (PAR-618).                                                                                                                                                                            |
| `@parity-app/media-player`              | Playing video with the app's own controls, at the edge since it's React: the player, a tile's preview and its length, and what the player's keys do.                                                                                                                       | New code, approved in Storybook (PAR-891).                                                                                                                                                                                                        |
| `@parity-app/style-schema`              | What a layer's style means: the stored style, its CSS declarations both ways, the ledger of CSS properties, validation, and the contract each styling framework's adapter implements ([style-package.md](style-package.md)).                                               | `nodeStyle` in `core/document.ts` and the style-to-CSS in `core/render.ts` (PAR-939); the rest is PAR-940 to PAR-944.                                                                                                                             |
| `@parity-app/processes`                 | What the app's processes decide: the child lifecycle (start, exit, deadlines and the output tail), the builder process's methods, service restarts, the render queue and preview order, turns, the bitmap cache, WebP text, the CLI's launchers, code editors and updates. | Nine files from core used only by the app, such as `builder-process.ts` and `service-restarts.ts` (PAR-989), and `lifecycle.ts`, from the four copies in Storybook's process manager, builders, installs and the type checker's worker (PAR-987). |

### `@parity-app/code`: design and code, both ways

This is the one you expect to iterate on most, so it gets the clearest boundary.

- **One program per project** serves listing, checking and props, within the memory budget the detection proposal sets.
  `programCache` in [program-cache.ts](../../packages/code/src/program-cache.ts) keeps it: it takes the root, the files
  to read and the lockfiles, and answers the check and props through a `ComponentFinder`. It builds the program again
  when a file it read changes, makes it afresh when a config input changes, keeps two projects' programs, and builds
  none below a gigabyte of free memory. The app's worker, `utility/props-worker.ts`, only takes requests and replies
  (PAR-603).
- **The component list is worked out in one step.** `nextComponentList` in
  [component-list.ts](../../packages/code/src/component-list.ts) takes an open project's list and what happened: the
  project opened, a saved detection was found, the type checker read files, the parse read changed files (every file,
  after a config change), or the person changed their corrections. It returns the next list with the exports the checker
  left out, which components need props, what a guest is given and takes back, and which files to read next. The project
  service keeps one list per project and does the reading (PAR-566).
- **Pure functions over text and designs:** `generate(design) → files`, `readBack(file, design) → changes`,
  `drift(design, file, hash) → changes`. Files come in and go out as data; the service reads and writes them.
- **The review model is data:** each change has a direction (design to code, or code to design), what it touches, and
  whether Parity can apply it or has to ask (freeze or overwrite). The drift indicator and the review menu are views of
  it.
- **Golden-file tests** are where iteration happens safely: a design in and a `.tsx` out; an edited `.tsx` in and design
  changes out; a pair that has drifted in and a list of changes out. Changing how JSX is written or read is a change to
  fixtures, reviewed like any other.
- **React first, behind an interface:** `ComponentFinder` in [finder.ts](../../packages/code/src/finder.ts) (FIND-15),
  with `reactFinder` for React, so Vue or Svelte later is another adapter.
- **`@parity-app/libgen` keeps generating `.lib.par` files** and uses `@parity-app/code` to find components.

### Project edits

Built in PAR-6 (2026-10-29). They were called changesets until then, which read as the versioning tool; Parity versions
itself with Beachball.

- **A project edit is a list of file edits:** create, replace, patch or delete, each with what it expects to find, so a
  file changed since the edit was built is left alone rather than overwritten. Planning one against what the files hold,
  diffing it and reversing it are pure, in [edits.ts](../../packages/project/src/edits.ts).
- **The service applies it through one function,** `applyProjectEdit` in
  [utility/edits.ts](../../apps/desktop/src/utility/edits.ts): it checks every file first, writes them all, puts back
  the ones written if a write fails, and records what it wrote so the watcher ignores it, as `.par` saves do. It keeps a
  project's latest 50 edits to undo by id, through `project.undoEdit`, as long as their files still hold what was
  written.
- **Each file is written whole** by `writeProjectFile` in
  [utility/project-files.ts](../../apps/desktop/src/utility/project-files.ts), beside the file and renamed over it.
  Whether a path is inside the project is `insideProject` in
  [inside-project.ts](../../packages/project/src/inside-project.ts) (PAR-973). Edits and `.par` saves both use them.
- **Token writes, library style imports and pasted images go through it.** Importing a library's styles says which file
  changed, with its diff and Undo. Token edits take their undo from the design's history, which PAR-164 is building, and
  a pasted image's file stays when its layer is undone, as before.
- **Still to move onto it:** `.lib.par` files from `cli/lib.ts` and `.par` saves (PAR-423), and then generated
  components and stories, `.parity/` files, and later migrations, handlers, route files and recipes.
- **This moves the diff-first part of PAR-293 into the foundations,** because components need it before any lens does.
  Writing back from the lenses (migrations, handlers, route files) keeps its place at the end of the order you set.

### Installed packages, in `@parity-app/project` and `@parity-app/registry`

Built in PAR-573 (2026-11-05). Finding an installed package and the files it leads to was written three to five ways,
and the copies disagreed.

- **One reader in [packages.ts](../../packages/project/src/packages.ts)** finds a package as Node does, reads its
  manifest through core's `packageManifest`, picks an entry point's file for types, the module Node imports, source or a
  stylesheet, traces a built file back to its source and follows both kinds of re-export. Its test is one temporary
  folder holding every shape of package it reads.
- **Discovery, detection, workspace packages, libgen and the Tailwind adapter use it.** libgen's loader keeps Node's own
  `createRequire` for CommonJS, and its icon types keep TypeScript's own resolver.
- **The registry owns hand edits and which file is newest:** `withEdits` and `readLibraryEdits` read a library file's
  edits, which discovery, libgen and `parity lib check` share, and `newestEntries` gives each package's newest file by
  semver, with its edits applied, for the library catalog and `parity lib check`.

### `@parity-app/editor`

- **It depends on core only.** The app keeps React components, tldraw shapes and tools, DOM hit-testing and measuring,
  and the hooks that subscribe to the stores.
- **It moves one file at a time,** each with tests as it moves: arranging and the clipboard first (pure, with many
  rules), then inserting and Make component, then drop rules and snapping, then the store's history and unsaved
  tracking.
- **Moving, resizing and nudging are one module,** [move-resize.ts](../../packages/editor/src/move-resize.ts) (PAR-577).
  The canvas measures a layer or a frame when a gesture begins, and the module gives the style or size for each pointer
  move or arrow press: steps or fill, insets, snapped edges, `grow`, a frame's snap-back and smallest size, and
  reordering. The app keeps the measuring (`frameDrawn`, `LayerSnapping`), the gesture lifecycle and the writes.
- **Style editing for a selection is one module,** [style-editing.ts](../../packages/editor/src/style-editing.ts)
  (PAR-567), next to `withTextSizing`. It takes the design, the selected ids and the state they were picked in, and
  gives where edits go, the style the layers share, what differs and what the state changes, the layout they sit in, and
  each row's edit and reset across the layers. Each row's keys are listed once, in `styleRows`. The app keeps the rows'
  views, measuring, previewing and the store (`chrome/style-editor.ts`).

### Agent calls, in `@parity-app/agent`

Built in PAR-564 (2026-11-05). The app's half of every agent call was 527 lines of `utility/agent.ts` that ran only in
Electron, with no tests.

- **`dispatch` in [dispatch.ts](../../packages/agent/src/dispatch.ts) answers each RPC method:** its defaults, the
  caller's cursor starting and ending, the state report, counting a check's frames, the answer's shape, and a coded
  error for a method the app doesn't have. The window's Export and accessibility check use its `exportPictures` and
  `accessibility`.
- **What only the desktop can do comes through an `AgentHost`:** the editor window's tabs and snapshot, applying
  changes, presence, the offscreen renderer, the console and saving screenshots. The app's `desktopHost` is one host,
  and `dispatch.test.ts`'s fixture tab is another.
- **The method map is `AgentMethods` in [contracts.ts](../../packages/agent/src/contracts.ts),** from PAR-590's schemas.
  The CLI client asks by it and `dispatch` answers by it, so a shape that drifts fails to compile on either side.

### Lenses and adapters

- **Core stays the `.par` model.** Lens models are JSON Schemas in `@parity-app/models`; each lens's reader and
  operations are a package, starting with `@parity-app/lens-data`; the lens's views live in the app.
- **Each adapter is a package,** implementing PAR-341's interface. That's also what lets code adapters run in their own
  process later (PAR-348).

## What stays in the app

- **Main:** windows, menus, the render window and process lifecycles.
- **The project service:** reading and watching files, applying project edits, starting processes and answering IPC. The
  logic it runs comes from packages. The open projects are `openProjects(adapters)` in `utility/projects.ts` (PAR-576),
  made in `utility/index.ts` with the builder link, the type checker, the detection cache, the ports, the windows'
  listeners and the folder watcher, and reading the environment then. What it decides from data is
  `@parity-app/project`'s `open-project.ts` (the main project file, reading designs, where a save may go, what a watched
  change means, and the `ProjectInfo` the windows are told) and `@parity-app/code`'s `typeCheckSummary`. Component
  previews are `componentPreviews(projects)` in `utility/previews.ts`, and the image, library and Storybook handlers
  take the open project they act on.
- **The ports, through `@parity-app/channel`** (PAR-565). Each process connects its port with an adapter and answers its
  method map: the preload script the window's `MessagePort`, the service each window's `MessagePortMain` and its
  `parentPort`, main the service's `UtilityProcess`, and the type checker's client its `Worker`. The method maps and the
  service's param checks are in `shared/`, and the `canvas:*` IPC names in `shared/channels.ts`. Each service method's
  params are its zod schema's type, from `shared/service-params.ts`, so the type and the check can't drift (PAR-992).
- **What a window asks main over IPC** (PAR-965). `shared/host-methods.ts` declares each method with its params' schema,
  its answer and who may ask. `main/host-methods.ts` checks each request against it and `main/host-handlers.ts` answers,
  both without Electron; `main/index.ts` passes them what they need of the app.
- **Agent calls' desktop half** (PAR-564): `utility/agent.ts` is the HTTP endpoint and `desktopHost`, which reaches the
  window, the offscreen renderer and the console, and writes PNG files. Which method does what is `@parity-app/agent`'s.
- **The renderer:** views, tldraw wiring, hooks, and DOM measuring.

## Order

1. **The rule and its lint guard** (PAR-5).
2. **Project edits** (PAR-6), with tokens, library imports and images moved onto them.
3. **`@parity-app/code` from the three readers** (PKG-3), after FIND-1 and PROJ-5, which the Components Sync session has
   in progress on those files. It's the natural start of FIND-2, which already says to reuse libgen's finder. Generating
   files (PAR-85), the drift review (PAR-93) and reading back (PAR-90) are then built inside it.
4. **`@parity-app/editor`,** file by file (PAR-7, then PAR-32 to PAR-34).
5. **`@parity-app/models` with PAR-15,** then a package per lens and adapter as each starts.
6. **`@parity-app/storybook` with PAR-114.**
7. **`@parity-app/tokens`** (PAR-35, done on 2026-10-30; it depends on core, which keeps the token types its own
   contracts name; the token detail's value checks followed on 2026-11-05, PAR-569), and the agent API's workspace split
   by area (PAR-574, 2026-11-05): lint (`lint.ts`), board geometry (`boards.ts`) and frame reading (`frames.ts`) take
   data and return data, and the working copy, lookup, reads, edits and presence stay together in `workspace.ts`.

## Calls made here

These are my calls. Change any of them.

- The rule above, and its lint guard.
- `@parity/props` merges into `@parity-app/code`, since both need the same program.
- Project edits come before the components work that needs them, so PAR-85 waits on PAR-6 and PKG-3.
- Lenses and adapters never go in core.
