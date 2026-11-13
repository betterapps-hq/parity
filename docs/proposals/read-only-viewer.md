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

Each source answers something no other one can. Settled on 2026-11-13:

| Source             | Gives                                                                                   | Without it                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Router adapter     | The routes: each URL pattern, how routes nest, and their params                         | Components only, no pages                                                                                  |
| TypeScript checker | Which components exist, their props and the props' types                                | Only components something already draws show up, with no props panel and nothing to make sample props from |
| Vite plugin        | Draws the frames, says which files changed, adds the source tags, installs React's hook | Nothing draws                                                                                              |
| React's tree       | The elements and instances each component owns, and the DOM nodes each one draws        | Layers are bare elements, with no component boundaries                                                     |
| The DOM            | Computed CSS, attributes, the accessibility tree and axe findings                       | No Design panel values and no accessibility checks                                                         |
| Theme reader       | Tailwind classes and theme tokens, to name the DOM's values                             | The panel shows `16px` and hex values instead of `p-4` and `primary`                                       |

The source tags are the file, line and column that wrote each element, so a layer can open its code, and writing back
knows where to go. Source maps could take their place: in development React 19 keeps a stack trace for each element it
creates (`_debugStack`), and Vite's source maps turn that into the original file and line, for component instances and
packages too, which the tags don't reach. A spike decides between them: how long resolving a page's elements takes, and
whether React keeps a stack for every element.

Why the overlap doesn't make any of them optional:

- **Source tags don't replace React's tree.** They're only on elements the project's own files write, so the parts of a
  component from `node_modules` have none, and they say where an element is written, not which instance drew it or with
  what props.
- **React's tree doesn't replace the source tags.** React 19 dropped `_debugSource`, so a fiber no longer says where it
  was written. Its `_debugStack` does, as a stack trace that needs source maps to read, which is slower and less
  reliable than a tag.
- **The DOM doesn't replace React's tree.** It has the elements and their CSS, but not the components around them.

### React's tree, through DevTools' hook

The hook isn't another source: it's a better way into React's tree than the root walk Parity does today. Code read
before it runs can't say which instance drew a DOM node: how many cards a list draws, which branch of a condition drew,
or where `children` ended up all settle only when the component runs.

React looks for `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` when it loads. The Vite plugin installs Parity's own hook in a
module the frame imports before the project's React. The guest never loads the project's `index.html`, so Fast Refresh
is off there and nothing else claims the hook; in a page drawn from the app's own entry, Parity's hook goes first and
Fast Refresh attaches to it. React then calls `inject` with its renderer and `onCommitFiberRoot` after every commit.
Compared with walking from the root, as `drawn-nodes.ts` does today, the hook:

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

### Stopping at the instance

The viewer opens up one component at a time. In development React 19 gives each element an owner, the component whose
code created it, so one rule covers every view: show what the component owns.

- **A component:** its own elements are layers, and each component instance it renders is a leaf.
- **A page:** the same, with the route's component as the owner. Its instances are leaves, and nothing inside them is
  opened.

So the viewer never walks inside a package's components, and needs neither their source nor their props' values.

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
| Route     | A route the page draws, from the router adapter and React's tree                                            |

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

Vite knows the entry points, but a React app usually has one: `index.html` loads `main.tsx`, and every URL goes through
it. Which component draws `/pricing` is decided inside the router's config, along with how routes nest, their params,
their data and their guards.

- **The app draws its own pages.** A page's frame loads the app's own entry at the page's URL, so its router draws the
  page as the browser would, inside the app's real providers.
- **The adapter only lists the routes:** each URL pattern, how routes nest and their params. TanStack Router comes
  first, as [app-lenses.md](app-lenses.md) decided, read from the generated `routeTree.gen.ts`.
- **Following links** is the fallback for routers without an adapter: draw `/`, follow every `<a href>` on it, and
  repeat. It misses pages nothing links to and can't fill in a param like `$id` alone.

The example project needs a router to build this against.

### Route layers

A page's layers start with its routes. `/settings/billing` draws the root route, then the settings route, then the
billing route, each inside the one before at its outlet, so Layers shows a Route layer for each, nested as they draw:

```text
Route /                    root layout
  header, nav …
  Route /settings          settings layout
    aside …
    Route /settings/billing
      h1, Plan card instance …
```

Each Route layer is opened, since together they are the page, and the owner rule applies inside each: its own elements
are layers and its instances are leaves. A Route layer's panel shows its path, its params, its file and its component,
and whether it loads data or guards the page.

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

Pages come first, so the viewer starts by drawing the app as people use it. Logic goes in packages, with tests that run
without Electron, and the app wires it up.

| Step                                                                                         | Sources it adds                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1. The example project gains TanStack Router and a few pages                                 |                                                     |
| 2. The router adapter lists the routes                                                       | Router adapter                                      |
| 3. Each route a board: the app's own entry drawn at its URL, with sample params              | Vite plugin: drawing from the app's entry           |
| 4. What the page owns: a Route layer for each route, their elements, and instances as leaves | Vite plugin installs the hook; React's tree         |
| 5. The element table: each tag's layer kind                                                  |                                                     |
| 6. Layers, read-only                                                                         |                                                     |
| 7. The Design panel, read-only, from the selected element's computed CSS and attributes      | The DOM; theme reader (exists)                      |
| 8. Every component on disk, each a board drawn with sample props from its types              | TypeScript checker (exists)                         |
| 9. A layer's View code                                                                       | Source tags (exist) or source maps, after the spike |
| 10. Accessibility findings for each board                                                    | The DOM: axe (exists, for agents today)             |
| 11. Mock data for pages that fetch                                                           | MSW                                                 |
| 12. Writing back                                                                             |                                                     |

## Decisions needed

1. **The hook:** Parity's own, or React DevTools' backend as a dependency. Recommendation: Parity's own.
2. **The example project:** add TanStack Router as a dependency, so routes have something to be built against.
3. **Children passed into an instance on a page:** in `<Card><p>Hi</p></Card>` the page owns the `p`, drawn inside the
   Card. It shows either as a layer inside the Card's instance, like a slot's content, or stays hidden until the Card is
   opened.
