# Proposal: package boundaries

Status: draft. `@parity/code` exists (PKG-3, 2026-10-29); nothing else has moved yet. The rule and the first items are
in [decisions.md](../decisions.md) and in Linear's Package boundaries stream.

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

- **`@parity/core` is the `.par` model and the operations on it:** documents, edits, instances, render resolution,
  modes, tokens, CSS and the library manifest. It imports nothing from Node, Electron or React, and has 12 test files.
- **Framework-specific code sits behind adapter interfaces:** `@parity/renderer-react`, `@parity/builder-vite` and
  `@parity/styles-tailwind`.
- **The agent API calls core's edits** (`setContainer`, `insertNode`, `moveNode`, `applyChanges` and the rest) rather
  than reimplementing them.

## Where the lines are missing

1. **Editor rules live in the app.** These are model operations, mixed with views and the DOM:
   - [clipboard.ts](../../apps/desktop/src/renderer/canvas/clipboard.ts): the clipboard envelope, new ids on paste,
     placing pasted layers, copying and pasting style;
   - [layer-drag.ts](../../apps/desktop/src/renderer/canvas/layer-drag.ts): where a dragged layer can land;
   - [arrange.ts](../../apps/desktop/src/renderer/chrome/arrange.ts): deleting, duplicating, wrapping, unwrapping,
     aligning, distributing;
   - [insert.ts](../../apps/desktop/src/renderer/canvas/insert.ts),
     [components.ts](../../apps/desktop/src/renderer/chrome/components.ts) and
     [create.ts](../../apps/desktop/src/renderer/chrome/create.ts): inserting, Make component, where new designs go;
   - [snap.ts](../../apps/desktop/src/renderer/canvas/snap.ts): snapping;
   - [design-store.ts](../../apps/desktop/src/renderer/design-store.ts): undo, unsaved tracking and save state, inside a
     store that also holds React hooks.
2. **Code is read three times, by three packages.** `project/components.ts` parses files to list components,
   `libgen/components.ts` runs TypeScript's checker to find them, and `@parity/props` runs it again for props. (They are
   [listing.ts](../../packages/code/src/listing.ts), [checker.ts](../../packages/code/src/checker.ts) and
   [props.ts](../../packages/code/src/props.ts) in `@parity/code` now.) Reading an edited component back into its design
   would be a fourth. The checker held about 1.8 GB on copacker, so one program per project matters for memory too.
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
- **Readers read a project's files but never write them or start processes:** `@parity/code`, `@parity/project` and
  `@parity/registry`, since TypeScript's program and the project's discovery read the project as they go. A reader that
  needs a file changed returns a project edit for the service to apply. Readers use no React and depend only on pure
  packages and other readers.
- **The edge is where Node and React belong:** the CLI, `@parity/libgen`, the agent runtime, the adapters
  (`renderer-react`, the only package with React, `builder-vite` and `styles-tailwind`) and the fixtures.
- **Dependencies point one way:** the app uses packages, no package imports Electron, tldraw or the app, and core
  imports nothing.
- **Each package's tests run in Vitest without Electron.** They may use Node to set up files. A rule that changes gets a
  test where it lives.
- **The guard is mechanical.** pnpm already stops a package importing what its `package.json` doesn't declare, and
  `no-restricted-imports` overrides in the root `vite.config.ts` keep each kind of package to its imports, so
  `pnpm verify` fails on a breach. Naming a package a reader or part of the edge is a change to that file, reviewed like
  any other.

## The packages

| Package                             | What it owns                                                                                                                                                               | Comes from                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@parity/code`                      | One TypeScript program per project. Listing components, props, file ownership by hash, writing a component file from a design, reading an edited file back, drift, review. | `project/components.ts`, `libgen/components.ts`, `@parity/props`, and the CMP items not built yet. |
| Project edits, in `@parity/project` | File edits built as data, shown as a diff, applied together, undone together, remembered so the app ignores its own writes.                                                | The writes in `utility/projects.ts`, `utility/libraries.ts`, `utility/images.ts` and `cli/lib.ts`. |
| `@parity/editor`                    | Editor behaviour without the views: clipboard, drop rules, arranging, inserting, Make component, placement, snapping, selection, undo and unsaved tracking.                | The renderer files listed above.                                                                   |
| `@parity/models`, then one per lens | The lens schemas (PAR-15), then each lens's standards reader and model operations. Each adapter, such as Drizzle or TanStack Router, is a package of its own.              | New code.                                                                                          |
| `@parity/storybook`                 | Everything Storybook-specific, behind the `StoryAdapter` in [storybook.md](../storybook.md).                                                                               | `project/storybook.ts` and `utility/storybook.ts` (PAR-114).                                       |
| `@parity/tokens`, later             | Reading tokens (Tailwind, DTCG), editing them in stylesheets, and matching described tokens to custom properties.                                                          | `core/tokens.ts`, `core/tokens-dtcg.ts`, `core/css-source.ts`, the Tokens panel's matching.        |

### `@parity/code`: design and code, both ways

This is the one you expect to iterate on most, so it gets the clearest boundary.

- **One program per project** serves listing, checking and props, within the memory budget the detection proposal sets.
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
- **`@parity/libgen` keeps generating `.lib.par` files** and uses `@parity/code` to find components.

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
- **Token writes, library style imports and pasted images go through it.** Importing a library's styles says which file
  changed, with its diff and Undo. Token edits take their undo from the design's history, which PAR-164 is building, and
  a pasted image's file stays when its layer is undone, as before.
- **Still to move onto it:** `.lib.par` files from `cli/lib.ts`, `.par` saves, and then generated components and
  stories, `.parity/` files, and later migrations, handlers, route files and recipes.
- **This moves the diff-first part of PAR-293 into the foundations,** because components need it before any lens does.
  Writing back from the lenses (migrations, handlers, route files) keeps its place at the end of the order you set.

### `@parity/editor`

- **It depends on core only.** The app keeps React components, tldraw shapes and tools, DOM hit-testing and measuring,
  and the hooks that subscribe to the stores.
- **It moves one file at a time,** each with tests as it moves: arranging and the clipboard first (pure, with many
  rules), then inserting and Make component, then drop rules and snapping, then the store's history and unsaved
  tracking.

### Lenses and adapters

- **Core stays the `.par` model.** Lens models are JSON Schemas in `@parity/models`; each lens's reader and operations
  are a package, starting with `@parity/lens-data`; the lens's views live in the app.
- **Each adapter is a package,** implementing PAR-341's interface. That's also what lets code adapters run in their own
  process later (PAR-348).

## What stays in the app

- **Main:** windows, menus, the render window and process lifecycles.
- **The project service:** reading and watching files, applying project edits, starting processes and answering IPC. The
  logic it runs comes from packages.
- **The renderer:** views, tldraw wiring, hooks, and DOM measuring.

## Order

1. **The rule and its lint guard** (PAR-5).
2. **Project edits** (PAR-6), with tokens, library imports and images moved onto them.
3. **`@parity/code` from the three readers** (PKG-3), after FIND-1 and PROJ-5, which the Components Sync session has in
   progress on those files. It's the natural start of FIND-2, which already says to reuse libgen's finder. Generating
   files (PAR-85), the drift review (PAR-93) and reading back (PAR-90) are then built inside it.
4. **`@parity/editor`,** file by file (PAR-7, then PAR-32 to PAR-34).
5. **`@parity/models` with PAR-15,** then a package per lens and adapter as each starts.
6. **`@parity/storybook` with PAR-114.**
7. **`@parity/tokens`** (PAR-35) when token work picks up, and the agent API's 1,320-line workspace split by area when
   it next grows.

## Calls made here

These are in decisions.md as my calls. Change any of them.

- The rule above, and its lint guard.
- `@parity/props` merges into `@parity/code`, since both need the same program.
- Project edits come before the components work that needs them, so PAR-85 waits on PAR-6 and PKG-3.
- Lenses and adapters never go in core.
