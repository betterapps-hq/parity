# Proposal: route frames, one live frame and frozen copies for the rest (PAR-1249)

Status: draft for discussion, 2026-11-16. Nothing here is built. It turns the spike in
[frame-isolation-spike.md](frame-isolation-spike.md) (PAR-1217) and the copacker demo that followed it into a plan for
Parity's route boards: what becomes a package, what goes into the router, renderer and builder extensions, what the
desktop app keeps, and the contracts between them. Revised the same day after an independent review: the live board's
input, invalidation, the sanitizer, the content security policy and selection on copies are now specified, and what
isn't known yet is checked first, in step 1.

## In one line

A route board shows a picture when it's small, a frozen copy of its page when it's near and readable, and the real page
only while someone works in it. The real page comes from a small pool of the app's own pages, already loaded and moved
to the route by the app's router, so going live takes 20 to 660 ms instead of a full page load.

## The decision this needs

**Pages follow this proposal, not the in-window drawing in [shared-app-instance.md](shared-app-instance.md).** That
proposal (PAR-1204) draws every page as a frame of the one guest instance in Parity's window, with the app's route tree
in a memory router; PAR-1205 is its first step. This proposal keeps each page in a document of its own and copies what
it drew. The reasons:

- **A page's own code stays out of Parity's window.** A page reaches the window more than a component does: auth guards
  set `location`, loaders read it, analytics start at import ([project-code-boundary.md](project-code-boundary.md)).
  Wrapping page APIs one at a time was tried and taken out (PAR-1207, PAR-1216). The guest still runs in Parity's window
  for components and stories; this changes pages only.
- **Every router works the same way.** The in-window plan keeps an iframe for the Next.js App Router, for TanStack
  Start's server functions (Copacker's) and React Router framework mode's server loaders, and for apps with no router
  extension. Here the app always runs as it would in a tab, so there's one path, not two.
- **Frozen copies are in Parity's document.** Selection, layers, source links and style previews work on them as they do
  on design frames, which an iframe on another origin can't offer.

If this is accepted, PAR-1205 is canceled, PAR-1200 (pages from bitmaps, iframes near the view) is folded into the build
steps below, and shared-app-instance.md keeps its part about components and stories.

## Today

- **One iframe per board.** Each page board, in each mode and state, is a `PageFrame` (`ContainerView.tsx`): a
  cross-origin iframe that boots the app's `index.html` at the route's URL from `routePageUrl`
  (`canvas/route-pages.ts`). There's no pool, cap, sleep or bitmap. Opening Copacker boots 41 of them
  ([loading.md](loading.md)).
- **The mode is in the iframe's name.** `pageFrameName` (`packages/editor/src/route-boards.ts`) puts it there, and
  changing mode changes the name, which reloads the iframe.
- **One script runs in the page:** `appPageModeScript` (`packages/project/src/app-page.ts`). Vite and the
  webpack-compatible builders put it first in `<head>`. Next runs it from `instrumentation-client`, after the document
  has been parsed. It applies the mode's classes, attributes and color scheme, and posts `page-height` and `page-landed`
  to `"*"`. Parity checks only `event.source`.
- **Pages reload themselves differently per builder.** Vite serves with `hmr: false`, though its dependency optimizer
  still reloaded every page once in loading.md. webpack-compatible pages poll and reload after each build
  (`reloadScript`, `app-pages.ts`). Next runs in development mode with its own hot updates.
- **The iframe grows to the page's height,** measured at the first window height. A section sized in `svh` then grows
  with the frame.
- **A page takes the pointer only with the Interact tool.** Otherwise it's `inert`, as a design's frame is, and a click
  selects the board. Page boards never call `registerFrame`, so selection inside them, outlines, style previews and
  agents don't see them.
- **A redirect shows.** `page-landed` feeds `setPageLanding`, which shows where a route sends the browser on the board
  and in Layers.

## How a route board draws

```text
route board
├── picture   small on screen or out of view   a bitmap from the render pool, kept on disk with its trace
├── frozen    in or near the view, readable    the page's DOM without scripts, in a shadow root, through prepareCanvasCss
└── live      someone works in it              the app's own page in an iframe, taken from the pool, over the copy
```

### A board's states

Sizes are the board's width on screen. Near is within the margin `useFrameView` already watches around the view. The gap
between 360 and 440 px keeps a board from switching back and forth while zooming.

| State   | Shows                                              | Moves to                                                                           |
| ------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Picture | Its kept bitmap, or a placeholder until it has one | Frozen when near and wider than 440 px                                             |
| Frozen  | Its frozen copy                                    | Picture when narrower than 360 px or no longer near; Ready on hover with Interact  |
| Ready   | Its frozen copy, with a spare waiting on it        | Live on pointer down with Interact; Frozen when the pointer moves to another board |
| Live    | The app's page over its copy                       | Frozen when it ends (below); Picture straight away if it's out of view by then     |

Hovering or clicking a Picture board with Interact makes it Frozen first, and Ready once its copy shows. While the
window isn't drawn, `useFrameView` reports nothing and boards keep their state.

### Input on a live board

- **Live only with Interact.** Outside Interact a copy is `inert`, and a click selects, in the board or inside its copy,
  as it does in a design's frame. With Interact, pointer down on a board makes it live. That press can't be passed into
  a page on another origin, so it only makes the board live; everything after it goes to the page. A Ready board goes
  live in about 50 ms, so the next press lands on the page.
- **The wheel stays the canvas's.** Pinch and the wheel pan and zoom the canvas over a live board too, as over any
  other.
- **The live window follows the view.** The live frame is one mode window tall. It sits over the part of its board in
  view, and the page scrolls to the same offset (`page.scroll`). Panning down a tall board shows the live page at that
  point, with the copy around it. Viewport units still measure one window.
- **Live ends** on Escape, on switching away from Interact, when another board goes live, or when the board leaves the
  view for 10 s.
- **A link that moves the page** to another route doesn't change the board. The board says where the page went, as a
  redirect does today, and the frame isn't frozen into this route's copy when live ends.

When live ends, the frame is frozen into the board's copy only if it's still on the board's route and nobody pressed a
key or the pointer in it. Otherwise it's closed, and its copy is redone by the freezer if it's stale. A menu left open
or a typed value never becomes the copy.

### Going live

1. **Hover warms.** With Interact, after the pointer rests on a board for 80 ms, a spare frame is sent to its route and
   mode, and the board shows Ready once the page has landed.
2. **Pointer down takes the quickest frame:** the warming one; else a spare already parked on the route, which only
   changes mode; else any spare, sent by the app's router; else a spare still loading; else a new frame loaded at the
   route.
3. **Live on first paint.** The frame goes live once its router has landed and the page has painted twice, with at most
   250 ms waiting for those paints. It doesn't wait for the page to go quiet: an entrance animation plays out live.
4. **The frame it replaces** goes through "When live ends" above: frozen if unused and still on its route, otherwise
   closed. Freezing waits for that page to go quiet (150 ms without a change, at most 3 s).
5. **The pool refills 1.5 s later,** once the new live frame has settled, and spares re-park 250 ms after the view stops
   moving.

### The pool

- **Two spare frames per project and window**, loaded at the app's root path. A frame is the app's page in an iframe on
  the builder's origin, with the page runtime in it. A window that isn't focused closes its spares; the setting
  `routeFrames.spares` changes the count, and 0 turns spares off.
- **Spares wait on the routes in view,** nearest the middle first. A spare already on one of those routes stays.
- **One freezer frame per project** visits each route and mode that needs a copy, nearest the view first, waits for
  quiet and takes the snapshot. It pauses while a live frame has input and while the pool refills, since every project's
  pages share one renderer process (below).
- **A frame navigates only after the app has hydrated.** Before that, the server's page stays and the new route renders
  beside it.
- **A live frame is never reused.** Spares and the freezer move through routes, so app-wide state one route sets, such
  as a query cache or a store, is there for the next, as it is in a browser tab. A frame that has been live, and so may
  hold what someone typed or opened, is closed when live ends.

### Frozen copies

- **The snapshot is plain data,** made in the page: the body's tree with its URLs made absolute, the root's classes and
  attributes, the stylesheets by content hash, the page's height in the mode's window, and where it landed. Parity
  parses it with its schema, passes it through the sanitizer, and builds it with `createElementNS` and `setAttribute`,
  never `innerHTML`.
- **It's styled as a design frame is.** `prepareFrame` makes the shadow root, and each stylesheet goes through
  `prepareCanvasCss` once per content hash and is shared by every copy. Media queries, viewport units, fonts,
  `@property` and root rules then measure the mode's window.
- **The theme's class goes on the body stand-in,** with the root's other classes, such as font variables, kept from the
  page.
- **A copy is the whole page.** Its board is as tall as `pageHeight`, measured in the mode's window, unless the board
  has a height of its own, which clips it as `frame.height` does today. Viewport units still measure the window, so a
  `900svh` section stays nine windows tall.
- **The same markup is shared across modes.** All six of Copacker's public routes drew the same markup in all six of the
  demo's modes. Modes whose trees hashed the same at the last freeze form a markup group, and one new snapshot updates
  every copy in it. A refreeze in the background then checks each mode.
- **A redirect shows as it does now.** `snapshot.location.outcome` of `"redirected"`, with its path, feeds
  `setPageLanding`, which replaces `page-landed`.

### Selecting inside copies

- **A copy's host is a frame,** registered with `registerFrame` under the route's screen, with the `data-mode` and
  `data-state` that `findFrames` reads.
- **Elements get ids from their place:** `buildCopy` gives each element `data-canvas-copy` with its path from the body
  (`0.3.1`). Ids hold while the markup holds; a copy with new markup has new ids, and the selection falls back to the
  board, as it does when a design's layer goes.
- **Layers come from the built copy.** `elementLayers` takes an `ElementSnapshot`, which the app builds from the copy's
  elements, reading computed styles when a layer's row is shown, not for the whole tree. `setInnerNodes` maps those ids
  to elements.
- **Source links survive.** The builder's `elementSourceAttribute` is on the sanitizer's allowlist, so a copy's element
  says where it's written.

### Pictures

- **The render pool takes them** (`main/render-pool.ts`), as it does for design frames. A page job opens `render.html`,
  which holds the page in an iframe and talks to it over the same channel as the canvas, so `pageGuard` keeps the window
  on Parity's page. Whether a cross-origin iframe renders and captures in an `offscreen: true` window is checked in
  step 1. If it doesn't, a page job loads the page as the window's own document, with `pageGuard` letting that one
  window go to the builder's origin, and the channel runs over `executeJavaScript`.
- **A window keeps its page between jobs.** Page jobs go to a window that already holds the project's page, so moving to
  the next route or mode is a router call, not a load. Capturing takes about 40 ms and scaling 16 ms.
- **`RenderJob` gets a page variant:** `{ kind: "page", projectId, url, route, mode, state }`, beside today's design
  job. Its bitmap name is a hash of the route's path, the mode and the state, since a page has no design tree.
- **Bitmaps are kept on disk with a trace,** as design frames' are (PAR-994): the files the page loaded and a digest of
  their contents, from `BuilderSession.loadedFiles`. A kept bitmap whose trace still holds is current when Parity opens;
  one whose trace doesn't stands in, stale, until it's captured again.

### Code changes and previews

- **Builders report every change.** `codeChanges` reports only component files, and nothing when a route, loader or
  layout changes (`gatherChanges`, `code-changes.ts`), so pages need a signal of their own: `BuilderSession.fileChanges`
  tells Parity each project file that changed.
- **A page's trace says what's stale.** Each copy and picture keeps the trace it was made from. A change to a file in a
  trace marks that copy and picture stale, and they're redone nearest the view first, the live board's route before the
  rest.
- **Frames are started again where pages don't update themselves.** Under Vite (`hmr: false`) and the webpack-compatible
  builders, a page keeps the modules it loaded, so after a change the pool's frames are replaced, and the live frame is
  swapped for a fresh one at its route once that one has painted. The webpack builders stop polling and reloading pages
  that Parity starts again itself. Next's pages update in place with its hot updates and are kept.
- **A page that reloads anyway** says hello again with the same frame id. Parity replaces that frame's channel, treats
  it as loading until it's ready, and drops any snapshot it was taking.
- **A style preview reaches every mode at once.** The preview's rules go into one shared sheet that every copy of the
  route adopts, and to the live page through `preview.set`. The demo measured 11 to 56 ms across 102 boards.

## What goes where

| Piece                                                                        | Home                                             | Runs in                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------- |
| Snapshot model, its schemas, `PageMode`, the sanitizers, building a copy     | `@parity-app/frames` (new)                       | Parity's window, tests     |
| Tiers, the pool's plan, parking, markup groups, stale copies, ids, deadlines | `@parity-app/frames`                             | Parity's window, tests     |
| The page runtime: channel, mode, scrolling, snapshots, previews              | `@parity-app/page-runtime` (new)                 | The project's page         |
| The page contracts (`PageRouter`, `PageHydration`) and their types           | `@parity-app/extension/page` (new entry)         | The project's page         |
| TanStack Router's, React Router's and Next's page routers                    | each router extension's `/page` entry            | The project's page         |
| React's hydration signal                                                     | `@parity-app/extension-react/page`               | The project's page         |
| Putting the runtime and the page modules into the page, `fileChanges`        | Vite, webpack-compatible and Next builders       | The builder                |
| The route board view, the pool and freezer, placing the live frame           | `apps/desktop/src/renderer/canvas/`              | Parity's window            |
| Page jobs in the render pool, page bitmap names and traces                   | `apps/desktop/src/main/`, `shared/render-job.ts` | Main and offscreen windows |
| The content security policy for Parity's pages                               | `apps/desktop/src/main/`                         | Main                       |

`@parity-app/frames` takes data and returns data. Its tests run in Vitest, with happy-dom (already in the catalog) for
the functions that take a `Document`. It's named for frames, not routes, so stories and components can use the same
tiers later (see Beyond routes). `PageMode` moves into it from `route-boards.ts`.

`@parity-app/page-runtime` is built to one script, as `appPageModeScript` is today, and replaces it in all three
builders. Its unit tests run in happy-dom. Hydration and navigation are checked against the fixtures' real apps in the
end-to-end suite in CI, since happy-dom can't run a Start or Next app's hydration.

## Contracts

### The snapshot

In `@parity-app/frames`, with a zod schema for each, read by `parserFor`:

```ts
/** What a route's page drew in one mode, as plain data. */
export interface PageSnapshot {
  /** Where the page is: the route asked for, or where it redirected. */
  location: PageLocation
  /** The mode's window the page was laid out in. */
  viewport: { width: number; height: number }
  /** The page's whole height in that window, in CSS pixels, rounded up. */
  pageHeight: number
  /** `<html>`'s classes and attributes without the mode's, and its inline style. */
  root: { classes: string[]; attributes: [name: string, value: string][]; style: string }
  /** `<body>` and everything in it, with every URL made absolute against the page's address. */
  body: FrozenElement
  /** The page's stylesheets in document order, by content hash. Parity asks for the ones it hasn't got. */
  sheets: string[]
  /** A hash of `body`, which tells modes with the same markup apart from the rest. */
  markup: string
}

export type FrozenNode = FrozenElement | string

export interface FrozenElement {
  tag: string
  /** Set for `svg` and `math` and everything inside them. */
  namespace?: "svg" | "math"
  attributes: [name: string, value: string][]
  children: FrozenNode[]
}

export interface PageSheet {
  /** A hash of `text`. */
  id: string
  /** The rules as written, from `<style>`, `<link>` and adopted sheets alike, with `@import`s inlined and `url()`s
   * made absolute against the sheet's own address. */
  text: string
}

export interface PageLocation {
  path: string
  search: string
  hash: string
  /** How the router ended: on the route, sent elsewhere, on its not-found route, or on its error boundary. */
  outcome: "landed" | "redirected" | "not-found" | "error"
}
```

The schema caps a snapshot at 50,000 elements, a depth of 256 and 8 MB of text, and a sheet at 4 MB. A page past a cap
is refused, and its board stays a picture.

What the page puts into a snapshot, beyond its DOM:

- an input's typed value, a checkbox's state and the selected option, as attributes;
- a `<canvas>` as an `<img>` of itself, when the page can read it;
- lazy images, switched to eager and given up to 500 ms to decode first, so a full-height copy isn't blank below the
  first window.

### The sanitizers and building a copy

```ts
/** The tree with only allowed elements, attributes and URLs left. */
export function sanitizePage(body: FrozenElement, policy: SanitizePolicy): { body: FrozenElement; removed: number }

/** A sheet's text with every `url()` outside the policy taken out; `@import` is refused, as the page inlined them. */
export function sanitizeSheet(text: string, policy: SanitizePolicy): string

export interface SanitizePolicy {
  /** The builder's origin, the one origin a copy may load from, besides data images and data fonts. */
  pageOrigin: string
}

/** A copy's elements, made in `document` with `createElementNS` and `setAttribute` only, each with its
 * `data-canvas-copy` id, under a body stand-in marked `inert`. */
export function buildCopy(document: Document, body: FrozenElement): DocumentFragment
```

The sanitizer keeps what's on its allowlists and drops the rest:

- **Elements:** HTML's, SVG's and MathML's elements that draw or hold content. `script` in any namespace, `iframe`,
  `frame`, `frameset`, `object`, `embed`, `portal`, `base`, `meta`, `link`, `noscript`, `template` and `style` (the
  sheets are collected apart) aren't on it, and neither are SVG's `animate`, `set`, `animateMotion` and
  `animateTransform`, which can set an `href`. A dropped element becomes an empty `parity-removed`, so the layout keeps
  its place.
- **Custom elements** keep their tag so the page's CSS still matches them. The copy's shadow root uses a custom element
  registry of its own, so the guest's definitions in Parity's window don't upgrade them. Whether Electron's Chromium has
  scoped registries is checked in step 1. If it doesn't, they're renamed to `parity-element` with `data-tag`, and rules
  that name them stop matching.
- **Attributes:** global and per-element attributes that describe content, `data-*` and `aria-*`. Not on it: every
  `on*`, `autofocus`, `autoplay`, `is`, `popover`, `popovertarget`, `action`, `formaction`, `form`, `ping`, `srcdoc` and
  `http-equiv`.
- **URLs** in `href`, `src`, `srcset`, `poster`, `xlink:href` and `style` are parsed, and kept only when they're `http:`
  or `https:` on `pageOrigin`, or a `data:image/` URL. The page made them absolute, so nothing resolves against Parity's
  address.
- **Copies are `inert`.** Their links and forms can't be followed or sent, and nothing in them takes focus.

The demo checked that a hostile `onerror` and a `javascript:` link are stripped and nothing runs in the top window. Step
3 adds tests for every element and attribute above. The content security policy below is the second layer.

### The page runtime's channel

The runtime and Parity talk over `@parity-app/channel`, on a `MessagePort` handed over once:

1. Parity loads the frame with `name` set to `parity:` and JSON: `{ protocol: 1, frame, parent }`, where `frame` is the
   frame's id and `parent` is Parity's origin.
2. The runtime posts `{ parity: "hello", protocol: 1, frame }` to `window.parent`, to `parent` only, never `"*"`.
3. Parity checks `event.origin` against the builder's origin and `event.source` against the frame, then transfers a
   `MessagePort`. A second hello from the same frame, after a reload, replaces its port.

Each side serves the other's requests, with `checks` that parse their params. Results are parsed with `parserFor` where
they're asked for, since `checks` read only params. Each request has a deadline in the caller; past it, the request
fails, the frame is treated as stuck, and it's closed and replaced.

Parity asks the page:

```ts
export interface PageMethods {
  /** Applies a mode: classes and attributes on `<html>`, its color scheme, and `prefers-color-scheme` answered with it.
   * The frame's size is Parity's to set. */
  "mode.set": { params: { mode: PageMode }; result: null }
  /** Moves the app to `to` with its own router and answers once the new page has painted twice (at most 250 ms of
   * waiting for paints after the router lands). */
  "route.go": { params: { to: string }; result: PageLocation }
  /** Scrolls the page to `top`, for the live window over the part of its board in view. */
  "page.scroll": { params: { top: number }; result: null }
  /** Takes a snapshot, after the page has been quiet for `quiet.ms` (at most `quiet.max`), or at once. */
  "snapshot.take": { params: { quiet?: { ms: number; max: number } }; result: PageSnapshot }
  /** The stylesheets with these ids. */
  "sheets.get": { params: { ids: string[] }; result: PageSheet[] }
  /** Puts a style preview's rules in the page, replacing the last; an empty string takes them out. */
  "preview.set": { params: { css: string }; result: null }
}
```

| Request         | Deadline                                   |
| --------------- | ------------------------------------------ |
| `mode.set`      | 1 s                                        |
| `route.go`      | 15 s, since a route's first visit compiles |
| `page.scroll`   | 1 s                                        |
| `snapshot.take` | `quiet.max` plus 2 s                       |
| `sheets.get`    | 5 s                                        |
| `preview.set`   | 1 s                                        |

The page asks Parity, which answers each with `null`:

```ts
export interface ParityMethods {
  /** The app has hydrated and its router can move it. Sent once per load. */
  "page.ready": { params: { location: PageLocation; router: string }; result: null }
  /** The app moved by itself, from a link or a redirect, outside a `route.go`. */
  "page.moved": { params: { location: PageLocation }; result: null }
  /** The page's height in the mode's window changed. */
  "page.height": { params: { height: number }; result: null }
  /** Someone pressed a key or the pointer in the page. Sent once per live. */
  "page.used": { params: Record<string, never>; result: null }
}
```

`page-height` and `page-landed` go, with `pageHeightMessage` and `pageLandedMessage`. A mode changes with `mode.set`,
without a reload, so the frame's `name` no longer carries it. The runtime hides the page's scrollbar, so the live page,
its copy and its picture lay out at the mode's full width. It sets
`window.parityFrame = { role: "spare" | "live" | "freezer" | "picture" }` and updates it when the role changes. Under
Vite and the webpack-compatible builders it runs before the app's own scripts. Under Next it runs from
`instrumentation-client`, after inline scripts in `<head>`, so those see no `parityFrame`.

### The page modules

Two kinds of extension tell the runtime what only they know, each in a module the builder serves into the page. In
`@parity-app/extension/page`, an entry that imports nothing at runtime:

```ts
/** How the page runtime drives the app's router, from inside the app's page. A router extension provides it. */
export interface PageRouter {
  /** The router's name, for `page.ready`, such as "tanstack-router". */
  id: string
  /** Whether this page's app uses this router, checked once the app has hydrated. */
  found(): boolean
  /** Where the router is now. */
  location(): PageLocation
  /** Moves the app to `to`, and resolves once the router has resolved where it ended and the page holds the new route. */
  navigate(to: string, signal: AbortSignal): Promise<PageLocation>
  /** Calls `moved` after each navigation the app makes by itself. */
  watch(moved: (location: PageLocation) => void): () => void
}

/** When the app's page has hydrated. A renderer extension provides it. */
export interface PageHydration {
  /** Installed before the app's code runs, where the builder can manage it. */
  install(): void
  /** Resolves once the app's first render has committed in the page. */
  hydrated(signal: AbortSignal): Promise<void>
}
```

`navigate` resolving only once the new route is in the page is the contract the demo needed most: TanStack Router said
it was idle while the old page was still in the DOM. TanStack's resolves when the router is idle and its resolved
location is where it ended.

React's `PageHydration` installs a minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` before React loads and resolves on the first
root commit. Under Next, where the runtime comes after React, it reads Next's own signal instead, settled in step 2.

The manifest names each module beside the extension's other contributions (`manifest.ts`):

```ts
export interface RouterContribution {
  decorators?: FrameDecorator[]
  /** The module that drives this router inside the app's page, and its export. */
  page?: { import: string; export: string }
}

export interface RendererContribution {
  // … as today
  /** The module that says when the app's page has hydrated, and its export. */
  page?: { import: string; export: string }
}
```

Carrying `page` through takes, beside the types: the manifest reader's strict objects (`reader/manifest.ts`), the host's
`decorators` and its sibling for page modules (`extension-host/src/hosts.ts`), the window's extension list
(`utility/extensions.ts`), and the project config, collected as `frameDecorators` is (`utility/projects.ts`). Each
builder serves the modules through the same virtual modules as the guest's runtime packages, so they don't have to be in
the project's dependencies.

**With no page router,** the runtime uses its own: `navigate` calls `history.pushState` and dispatches `popstate`, which
TanStack Router's and React Router's browser histories listen to, and it lands once the location matches and the DOM has
been quiet for 100 ms. If the location doesn't change, the frame loads the URL instead, and spares for that project are
loaded at the route they're for. **With no hydration module,** the app counts as hydrated once the document has loaded
and the DOM has been quiet for 150 ms.

Where each page router finds its router, and how Next says it has hydrated, is settled in step 2. What's known so far:

| Router          | Where its router is in the page                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| TanStack Router | `window.__TSR_ROUTER__`, which TanStack Start sets; a plain TanStack app may not, and falls back to `pushState` |
| React Router    | No global in library mode, which falls back to `pushState`; framework mode's to be found                        |
| Next.js         | `window.next.router`, in the App and Pages Routers                                                              |

### Keys

```ts
/** What a copy or a picture is of. With its trace, it says whether a kept one is current. */
export interface CopyKey {
  route: string // the path with sample params, from routePageUrl
  mode: string // the resolved mode's id
  state: string // the board's state id
  preview: number // the style preview's version, raised on each preview
}
```

The planners, each a function of data:

```ts
/** A board's tier, from its size on screen, whether it's near, its last tier and what it has. */
export function boardTier(board: BoardView): "picture" | "frozen" | "live"

/** Which spares to move where, which to open and which to close. */
export function planPool(pool: PoolView): PoolPlan

/** The modes a new snapshot of a route updates: its own, and the ones in its markup group. */
export function sharedMarkup(route: string, mode: string, groups: MarkupGroups): string[]

/** The copies and pictures whose traces hold a changed file, nearest the view first. */
export function staleCopies(changed: readonly string[], copies: readonly TracedCopy[], view: ViewOrder): CopyKey[]
```

## The extension API

| Surface                                   | Today                           | Change                                                   |
| ----------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| `RouterContribution` (`manifest.ts`)      | `decorators`                    | Add `page`, the page router's module                     |
| `RendererContribution` (`manifest.ts`)    | `guest` and its packages        | Add `page`, the hydration module                         |
| `@parity-app/extension/page`              | doesn't exist                   | New entry: `PageRouter`, `PageHydration`, `PageLocation` |
| `BuilderSession` (`core/src/adapters.ts`) | `codeChanges` for components    | Add `fileChanges`, every project file that changed       |
| `RouterProvider` (`providers.ts`)         | `routes()`                      | No change                                                |
| `Navigate.pageUrl` (`api.ts`)             | the URL a route's page draws at | No change; it stays the URL a frame is sent to           |
| Builders' page script                     | `appPageModeScript`             | The page runtime and the page modules                    |
| `pageHeightMessage`, `pageLandedMessage`  | in `route-boards.ts`            | Removed, replaced by `ParityMethods`                     |

Extensions stay private (docs/extensions.md), so this changes the API in place, as the conventions' fix-forward rule
says. The handshake's `protocol` is checked from the first version, so a page served by a builder from another Parity
copy is refused, not misread.

## What the desktop app changes

- **`PageFrame` and the `page ?` switch in `ContainerView.tsx` go.** A route board draws through a `RouteBoard` view:
  the picture as an `<img>`, or the copy in a shadow root from `prepareFrame`, which stays beneath the live frame while
  it's live.
- **The live and spare frames live in one layer over the canvas,** not inside tiles. The live frame is placed over the
  part of its board in view, scaled with the camera. Where spares are parked depends on step 1's throttling check.
- **Page tiles stop asking for design-frame bitmaps.** They run `useFrameShows` and `useFrameBitmap` today on a tree
  that resolves to nothing.
- **Every wait on a page has a timeout.** A hidden or minimized window runs no animation frames.
- **A second window of the same project,** as a lens moved out (PAR-1247), has its own live frame and spares and shares
  the project's freezer, copies and bitmaps.

## Isolation

- **Pages run in a renderer process apart from Parity's,** since `parity://app` and the builder's `http://127.0.0.1` are
  different sites. Site isolation ignores the port, so every open project's pages, live, spare and freezer alike, share
  that one process and its main thread. That's why the freezer and refills pause while a live frame has input. Step 1
  confirms it with `webFrameMain.osProcessId`.
- **Parity's pages get a content security policy,** served with `parity://app`'s responses and by the window's dev
  server under `pnpm dev`, and the same for `render.html`. Packaged:

  ```text
  default-src 'self';
  script-src 'self' http://127.0.0.1:* http://localhost:*;
  style-src 'self' 'unsafe-inline' http://127.0.0.1:* http://localhost:*;
  img-src 'self' data: blob: parity-preview: http://127.0.0.1:* http://localhost:*;
  font-src 'self' data: http://127.0.0.1:* http://localhost:*;
  connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:* <Sentry's ingest host>;
  frame-src http://127.0.0.1:* http://localhost:*;
  worker-src 'self' blob:;
  object-src 'none'; base-uri 'none'; form-action 'none'
  ```

  Under `pnpm dev`, `script-src` and `connect-src` add the window's dev server, and the React plugin's inline preamble
  is allowed by its hash. There's no `'unsafe-inline'` or `'unsafe-eval'` for scripts, so an inline handler the
  sanitizer missed doesn't run. `style-src` keeps `'unsafe-inline'` for copies' `style` attributes and the guest's
  styles. The builders' script origins are still allowed, since the guest comes from them; the sanitizer's element
  allowlist is what keeps a copy from loading a script from there. Step 8 runs the end-to-end suite and the fixtures
  under it and loosens nothing without saying what a fixture needed and why.

- **Every frame shares the window's session** (`persist:copy-N`), so frames share cookies and storage, as tabs of one
  browser do. Closing a live frame after use keeps the app's memory apart, not its storage. Signing in is
  [impersonation.md](impersonation.md)'s and PAR-1229's.

## Evidence

From the copacker demo, 6 public routes in 6 modes (desktop 1280×800, tablet 834×1112, mobile 390×844, each light and
dark), 36 to 102 boards. Timings were taken in Electron 45 in a window shown off-screen, which renders at full rate, or
in the browser pane while it showed.

| What                                                           | Result                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Going live, spare already parked on the route                  | 20–157 ms                                                              |
| Going live, spare sent by the app's router                     | 222–486 ms; "/" 474–658 ms                                             |
| Going live, waiting for quiet instead of first paint           | "/" 1.1–1.4 s; other routes 0.46–0.52 s                                |
| A new frame loaded straight at a route the server hadn't built | /privacy hydrated after 37 s; /login after about 1 s                   |
| Style preview reaching every copy, 102 boards                  | 11–56 ms                                                               |
| Refreezing one route in 6 modes                                | 1.2 s                                                                  |
| Freezing 36 route-and-mode pairs in one frame                  | 7–26 s                                                                 |
| Relayout of the canvas, 102 boards                             | 37 ms with copies; 0.6 ms with pictures                                |
| 36 pictures with `capturePage`, 1, 2 and 4 windows             | 4.0–4.5 s, 2.8 s and 2.1 s                                             |
| A picture drawn from a copy as an SVG `foreignObject`          | about 135 ms each, on the main thread; no faster in parallel           |
| Detaching copies out of view                                   | no change to going live; `content-visibility: auto` already skips them |

What the demo found, each of which a contract above covers:

1. Navigating before hydration renders the new route beside the server's page.
2. The router reporting idle isn't the new page being in the DOM.
3. Waiting for quiet before going live cost "/" 600 ms for an entrance animation.
4. Animation frames run at 1 fps in a hidden Electron window and not at all in a hidden pane.
5. A copy without `prepareCanvasCss` loses fonts, `@property`, root rules, media queries and viewport units.
6. A frame as tall as its page makes `svh` sections grow without end.
7. A scrollbar takes width from the page's layout, so copy and page disagree.

The demo didn't cover input on a live board, code changes, copies' selection, or more than one project, and it ran
same-origin, so the channel, the sanitizer on real cross-site snapshots and the process placement are untried.

## Risks

- **Each frame is a whole copy of the app,** about 80 MB in dev. Per project and window, the live frame, two spares and
  the freezer come to about 320 MB, and render windows holding pages add up to four more. With three projects open
  that's over 1 GB, which is why unfocused windows close their spares and the count is a setting.
- **Spares run the app's code for real:** polling, websockets, analytics and the route's loaders, including any that
  write to a backend. `window.parityFrame` lets an app hold back what it doesn't want run on Parity's behalf, except in
  `<head>` scripts under Next.
- **A copy can't hold** what isn't in the DOM, such as video frames, a closed shadow root's content, or what shows only
  on hover or focus.
- **Pages that change on their own,** such as clocks, random content or data from a server, differ between modes and
  between freezes, so they fall out of markup groups and refreeze more.
- **The first visit to a route pays the builder's compile,** up to 37 s on Copacker. Spares and the freezer hide it from
  going live, but freezing every route when a project opens leans on the builder.
- **Every router's landed signal, and Next's hydration, are their own,** and only TanStack's were tried. Apps whose
  router has no global fall back to `pushState`, which works for browser history but not for a memory router.

## Beyond routes

The tiers, the snapshot and the channel don't depend on routes. A story's page, or a component's case page from
[visual-tests.md](visual-tests.md), is a page that draws something at a URL, and could be live, frozen or a picture the
same way, with a page module that changes the story instead of the route. Components and stories keep the guest until
that's tried.

## Build steps

Each becomes an issue, in this order. Step 1 decides whether the rest goes ahead as written.

1. **Checks before building,** each with a yes or no and what changes if it's no:
   - which process the frames run in (`webFrameMain.osProcessId`), with two projects open;
   - whether a cross-origin iframe parked out of sight, or at opacity 0 behind the canvas, is throttled: animation
     frames, `ResizeObserver`, lazy images;
   - whether a cross-origin iframe renders and captures inside an `offscreen: true` render window;
   - whether Electron's Chromium has scoped custom element registries for shadow roots;
   - whether the `pushState` fallback moves the fixtures' TanStack and React Router apps.
2. **The page runtime, its channel and the page modules.** `@parity-app/page-runtime` replaces `appPageModeScript` in
   the Vite, webpack-compatible and Next builders, with the handshake, `mode.set` without a reload, `page.height` in the
   mode's window and no scrollbar. TanStack Router's page router, React's hydration module, Next's hydration signal, and
   the fallbacks. `PageFrame` uses it, so a board's mode changes without reloading.
3. **`@parity-app/frames`:** the snapshot's schemas and caps, both sanitizers with a test for every element, attribute
   and URL rule, `buildCopy`, ids, keys and the planners.
4. **Frozen copies.** `snapshot.take` and `sheets.get` in the runtime, the freezer frame and its queue, and the
   `RouteBoard` view that shows copies through `prepareFrame`, registered as frames, with selection, layers and the
   redirect warning. Boards show copies instead of iframes.
5. **Live frames from the pool:** spares, hover, parking, Interact, the live window following the view, when live ends,
   and freezing only unused frames.
6. **Pictures.** Page jobs in the render pool, page bitmap names with traces, and tiers by size on screen. This is where
   PAR-1200 lands.
7. **Code changes and previews:** `fileChanges` in each builder, stale copies by trace, starting frames again where
   pages don't update themselves, the second hello, markup groups, and style previews in copies and the live page.
8. **The content security policy** for Parity's pages, packaged and under `pnpm dev`.
9. **React Router's and Next's page routers.**

Each step updates the page-screens section of [editor.md](../editor.md) and its tests, and [support.md](../support.md)'s
rows for routes.

## Open questions

- **Hot updates in pages.** Under Vite, a code change starts every page again. Pages are documents of their own, so
  turning hot updates on for them alone would keep the live page's state, if the builder can tell its pages from the
  guest.
- **Selecting inside the live page.** It's on another origin, so its elements aren't in Parity's document. Selection and
  layers show the copy beneath it, which is the page as it was when live began.
- **The pool's size** on a machine short of memory, beyond closing spares in unfocused windows.
- **The Pages lens** (PAR-1244). It owns the route boards once it exists; nothing here depends on which canvas draws
  them.
