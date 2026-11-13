# Proposal: Parity as a read-only viewer of the project's code (PAR-1071)

Draft, 2026-11-13.

Today a design lives in a `.par` file as Parity's own document format, and only the code components inside it are the
project's code. This page proposes that every component on the canvas comes from disk. Parity reads the project's
components, the elements they draw and its routes, and shows them read-only: layers, a Design panel from each element's
CSS and attributes, accessibility findings and live changes. Writing back to the code comes once all of that works.

## What's assumed

- **One stack, behind adapters.** React 19, TypeScript and Vite 8 or later, one adapter each, keeping the boundaries
  [support.md](../support.md) sets out so other tools can follow. React 18 and earlier, Vite 7 and earlier, and other
  frameworks aren't built for. No particular TypeScript version is required.
- **No Storybook for now.** Sample props come from each component's types. Stories can supply them later.
- **Read-only first.** Nothing on the canvas writes to the project until the read-only view, accessibility checks and
  change detection all work.

## What already exists

- **Finding components and their props:** component detection ([component-detection.md](component-detection.md)) and the
  TypeScript checker, which reads each component's props and their types.
- **Drawing from disk:** each component renders through the project's own Vite, with decorators supplying routers, query
  clients and other providers.
- **Change detection on save:** saving a `.tsx` redraws the canvas in under a second (PAR-165).
- **Each element linked to its code:** in development, every element the project's JSX writes carries
  `data-parity-source` with its file, line and column (PAR-167, `packages/code/src/element-sources.ts`).
- **React's tree:** `packages/renderer-react/src/drawn-nodes.ts` walks the fiber tree from the root to find what each
  layer draws.
- **Accessibility checks:** axe runs on frames for agents.

## The sources it needs

Five sources, each answering something no other one can. Four exist today; the router is new.

| Source             | Gives                                                                | Without it                                                                                                 |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| TypeScript checker | Which components exist, their props and the props' types             | Only components something already draws show up, with no props panel and nothing to make sample props from |
| Source tags        | The file, line and column that wrote each element                    | No link from a layer to its code, so nothing to open, and nowhere to write back to later                   |
| React's tree       | Component instances, where each starts and ends, their props' values | Layers are bare elements: no component boundaries, and nothing for a library component's parts             |
| The DOM            | Computed CSS, attributes, the accessibility tree and axe findings    | No Design panel values and no accessibility checks                                                         |
| The router         | The routes, so pages can be grouped and drawn                        | Components only, no pages                                                                                  |

Vite isn't a source but the host for three of them: it draws the frames, runs the transform that adds the source tags,
and says which files changed.

Why the overlap doesn't make any of them optional:

- **Source tags don't replace React's tree.** They're only on elements the project's own files write, so the parts of a
  component from `node_modules` have none, and they say where an element is written, not which instance drew it or with
  what props.
- **React's tree doesn't replace the source tags.** React 19 dropped `_debugSource`, so a fiber no longer says where it
  was written. Its `_debugStack` does, as a stack trace that needs source maps to read, which is slower and less
  reliable than a tag.
- **The DOM doesn't replace React's tree.** It has the elements and their CSS, but not the components around them.

### React's tree: the root walk or DevTools' hook

The hook isn't another source: it's a better way into React's tree than the root walk Parity does today.

React looks for `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` when it loads. Parity controls the frame's script order, so it
can install its own hook before the project's React. React then calls `inject` with its renderer and `onCommitFiberRoot`
after every commit. Compared with walking from the root, as `drawn-nodes.ts` does today, the hook:

- **finds every root**, including ones a library creates;
- **reports every commit**, so a state change, a timer or a fetch that redraws the canvas is seen, not only a saved
  file;
- **tells written from passed:** each element's owner says which component's JSX wrote it, so a card's children read as
  the page's, not the card's.

It's still React's internals, but the most stable part of them, since DevTools itself depends on it. Two ways to build
it:

1. **Parity's own small hook** that reads fibers, as `drawn-nodes.ts` does now. No new dependency.
2. **React DevTools' own backend** (`react-devtools-core` or `react-devtools-inline`), which serializes the tree and
   inspects props for DevTools' UI. More complete, but a large dependency built for a different interface.

Recommendation: Parity's own hook, growing from `drawn-nodes.ts`.

### React Compiler: not needed

React Compiler is an optimizer: a Babel plugin that adds memoization to components that follow the Rules of React, and
skips the ones that don't. It doesn't describe components, and its internal representation isn't a public API, so the
viewer can't build on it. What the idea points at is right, though: a compile-time pass over the project's code. Parity
already has one in the source tags, and that pass can carry more facts as the viewer needs them, such as which props
reach which element, or a `className` built from conditions.

## Elements become layers

Every HTML element maps to a layer kind, and the kind decides the panel. A first cut:

| Kind      | Elements                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Layout    | `div`, `section`, `article`, `aside`, `header`, `footer`, `main`, `nav`, `form`, `ul`, `ol`, `li`, `figure` |
| Text      | `span`, `p`, `h1` to `h6`, `strong`, `em`, `small`, `label`, `code`, `blockquote`                           |
| Link      | `a`                                                                                                         |
| Control   | `button`, `input`, `select`, `textarea`                                                                     |
| Image     | `img`, `picture`                                                                                            |
| Video     | `video`                                                                                                     |
| Graphic   | `svg`, `canvas`                                                                                             |
| Table     | `table` and its parts                                                                                       |
| Embed     | `iframe`, `object`                                                                                          |
| Component | A component's instance, from React's tree                                                                   |

The full table, every element in the HTML standard, is part of the work. The panel shows each layer's tag, and a tag
that can't change shows greyed out.

A component's instance takes the panel of the element it ends up as, so an instance whose outermost element is a `div`
gets a layout's panel, with its props above.

## The Design panel, read-only

- **Values come from the element:** its computed CSS, read in the frame, and its attributes.
- **Set, not inherited:** a value shows as set only when it differs from what the same tag has by default and from what
  it inherits, so the panel isn't full of `display: block`.
- **Classes and tokens:** Tailwind classes on the element are matched to the theme, so the panel shows `p-4` and
  `primary` rather than `16px` and a hex value.
- **Sections from the tag:** a tag-to-options table next to the element table decides which sections and attributes each
  tag gets: a `div` gets Layout and the box options, a `span` gets Typography and no Layout, an `img` gets its fit and
  alt text.

## Routes and pages

The router adapter reads the routes and groups the canvas by page. TanStack Router comes first, as
[app-lenses.md](app-lenses.md) decided: its route tree comes from the generated `routeTree.gen.ts`, and the router draws
any route in a frame from memory history. The example project needs a router to build this against.

Pages that fetch data need mock data, through MSW, and pages behind a sign-in need a signed-in user. Mock data is the
largest piece of work here.

## Later: writing back

Once the read-only view works, edits write the project's code. Making a component wraps the layer in a component that
renders through `ParityComponent`, which draws the outermost element, takes that element's props, merges the caller's
`className` and `style` with its own (the caller's win) and passes `ref` on as a prop, as React 19 does. A component
Parity didn't make, that takes no `className` or `style`, is wrapped in an adapter that takes them.

## What changes in what's built

- **`.par` screens and component designs** stay, read-only, beside the components from disk: they open and draw as they
  do now, but can't be edited, and no new ones are made. Decided on 2026-11-13.
- **Editing features** (inserting, Make component, the agent's design-editing calls) pause until writing back.
- **The Design panels** become read-only views, built from the element table, so PAR-1059 to PAR-1064 wait on this.

## Order of work

1. The element table and the tag-to-options table, as data in a package, with tests that run without Electron.
2. The layer tree from React DevTools' hook and the source tags.
3. Read-only Design panels from computed CSS and attributes.
4. The canvas from disk: each component a board, drawn with props from its types.
5. Change detection on commits as well as saves, and accessibility findings for each board.
6. Routes: TanStack Router, with the example project gaining a router, then pages grouped on the canvas.
7. Mock data for pages.
8. Writing back.

## Decisions needed

1. **The hook:** Parity's own, or React DevTools' backend as a dependency. Recommendation: Parity's own.
2. **The example project:** add TanStack Router, so routes have something to be built against.
