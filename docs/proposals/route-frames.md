# Proposal: route frames, one live frame and frozen copies for the rest (PAR-1249)

Status: built, 2026-11-17. Every build step has merged; each one's "Built:" note says where it differs from the plan. It
turned the spike in [frame-isolation-spike.md](frame-isolation-spike.md) (PAR-1217) and the copacker demo that followed
it into a plan for Parity's route boards: what becomes a package, what goes into the router, renderer and builder
extensions, what the desktop app keeps, and the contracts between them. Revised twice the same day after independent
reviews: the live board's input, invalidation, the sanitizer, selection on copies, pictures at full height and failure
of the page process are specified. Step 1's checks were run in Electron on 2026-11-17 (PAR-1259); their results are
under Evidence, and the sections they changed say so. A content security policy for Parity's window is left to PAR-1255.
The built app was measured on copacker against the demo on 2026-11-18 (PAR-1302), also under Evidence.

## In one line

A route board shows a picture when it's small, a frozen copy of its page when it's near and readable, and the real page
only while someone works in it. The real page comes from a small pool of the app's own pages, already loaded and moved
to the route by the app's router, so going live takes 20 to 660 ms when a spare is ready, instead of a full page load.

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

| State   | Shows                                              | Moves to                                                                                                    |
| ------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Picture | Its kept bitmap, or a placeholder until it has one | Frozen when near and wider than 440 px                                                                      |
| Frozen  | Its frozen copy                                    | Picture when narrower than 360 px or no longer near; Ready on hover and Live on pointer down, with Interact |
| Ready   | Its frozen copy, with a spare waiting on it        | Live on pointer down with Interact; Frozen when the pointer moves to another board                          |
| Live    | The app's page over its copy                       | Frozen when it ends (below); Picture straight away if it's out of view by then                              |

Hovering or clicking a Picture board with Interact makes it Frozen first, then Ready or Live once its copy shows. While
the window isn't drawn, `useFrameView` reports nothing and boards keep their state.

### Input on a live board

A live page on another origin takes every pointer, wheel and key event that reaches it, and Parity's document never sees
them. So a live page takes events only once someone has clicked into it, and gives them back when they leave.

- **Live only with Interact.** Outside Interact a copy is `inert`, and a click selects, in the board or inside its copy,
  as it does in a design's frame. With Interact, pointer down on a board makes it live and engaged. That press can't be
  passed into the page, so it only does that; the next press lands on the page. A Ready board goes live in 20 to 160 ms.
- **Hovering never takes the wheel.** A live frame has `pointer-events: none` until it's engaged, so the wheel, pinch
  and hover over it stay the canvas's, and zooming over a live board works as over any other.
- **Engaged, the page has the pointer and keys,** as a page in a browser does: the wheel scrolls it, and keys go to it.
  The runtime passes back what's Parity's: pinch and Ctrl or Cmd with the wheel (canvas zoom) through `page.zoom`, and
  Escape and Parity's Ctrl or Cmd shortcuts through `page.key`, when the page didn't handle them itself.
- **Disengaging** happens on a press outside the frame, on Escape the page didn't handle, and on switching away from
  Interact. The frame goes back to `pointer-events: none` and stays live, so clicking into it again engages it at once.
  Parity also takes focus back into its own document, since the page keeps receiving keys while it has focus, even with
  `pointer-events: none`.
- **The live window.** The live frame is one mode window tall. Disengaged, it sits over the part of its board in view,
  and the page scrolls to the same offset (`page.scroll`), so panning down a tall board shows the live page at that
  point with the copy around it. Engaged, the page's own scrolling moves the window down its board (`page.scrolled`).
  Viewport units always measure one window. While live, the copy hides its elements whose computed position is fixed or
  sticky, so a fixed header shows once, in the live window.
- **Live ends** when another board goes live, or when the board's box has been outside the camera's view for 10 s, from
  tldraw's camera rather than `useFrameView`'s margin.
- **A link that moves the page** to another route of the app doesn't change the board. The board says where the page
  went, as a redirect does today. A navigation off the builder's origin, such as an external link or a sign-in provider,
  is stopped in main (`will-frame-navigate`), and the board says where it tried to go. Signing in is
  [impersonation.md](impersonation.md)'s.

When live ends, the frame is closed. If it's still on the board's route and nobody used it, its snapshot stands in for
the copy until the freezer's replaces it. A menu left open or a typed value never becomes the copy.

### Going live

1. **Hover warms.** With Interact, after the pointer rests on a board for 80 ms, a spare frame is sent to its route and
   mode, and the board shows Ready once the page has landed.
2. **Pointer down takes the quickest frame:** the warming one; else a spare already parked on the route, which only
   changes mode; else any spare, sent by the app's router; else a spare still loading; else a new frame loaded at the
   route.
3. **Live on first paint.** The frame goes live once its router has landed and the page has painted twice, with at most
   250 ms waiting for those paints. It doesn't wait for the page to go quiet: an entrance animation plays out live.
4. **The frame it replaces** ends as above. Its stand-in snapshot waits for that page to go quiet (150 ms without a
   change, at most 3 s).
5. **The pool refills 1.5 s later,** once the new live frame has settled, and spares re-park 250 ms after the view stops
   moving.

### The pool

- **Two spare frames per project and window**, loaded at the app's root path. A frame is the app's page in an iframe on
  the builder's origin, with the page runtime in it. A window that isn't focused closes its spares; the setting
  `routeFrameSpares` (Settings › Diagnostics › Spare route frames) changes the count from 0 to 4, and 0 turns spares
  off. On a machine with less than 8 GB of memory a window keeps one at most, whatever the setting asks for.
- **Spares wait on the routes in view,** nearest the middle first. A spare already on one of those routes stays.
- **A parked spare stays drawn:** at its mode's full size, inside the window's view, scaled to 1%
  (`transform: scale(0.01)`) with `pointer-events: none`. Chromium stops rendering a cross-origin frame that's
  off-screen, clipped away, at opacity 0, hidden or behind an opaque layer: off-screen and clipped frames run no
  animation frames, and the others run them but no `ResizeObserver`, so a spare parked that way would go live half laid
  out.
- **One freezer frame per project** makes every copy. For each route that needs one, nearest the view first, it loads
  the route fresh, then takes a snapshot in each of the route's modes, waiting for quiet in each. A fresh load per route
  keeps a copy from depending on which routes came before it. The freezer pauses while a live page is in use (a pointer
  or key event in the last 2 s, from `page.used`) and while the pool refills, since a project's pages share one renderer
  process (below).
- **A frame navigates only after the app has hydrated.** Before that, the server's page stays and the new route renders
  beside it.
- **A live frame is never reused.** Spares move through routes, so app-wide state one route sets, such as a query cache
  or a store, is there for the next when one goes live, as it is in a browser tab. A frame that has been live, and so
  may hold what someone typed or opened, is closed when live ends.

### Frozen copies

- **The snapshot is plain data,** made in the page: the body's tree with its URLs made absolute, the root's classes and
  attributes, the stylesheets by content hash, the page's height in the mode's window, and where it landed. Parity
  parses it with its schema, passes it through the sanitizer, and builds it with `createElementNS` and `setAttribute`,
  never `innerHTML`.
- **It's styled as a design frame is.** `prepareFrame` makes the shadow root, and each stylesheet goes through
  `prepareCanvasCss` once per content hash and is shared by every copy. Media queries, viewport units, fonts,
  `@property` and root rules then measure the mode's window.
- **Classes go where `prepareCanvasCss` maps their element.** `<html>`'s classes and attributes, such as font variables,
  go on the host, which `html` and `:root` rules map to; `<body>`'s go on the body stand-in; and the mode's go where
  `frameAttributes` puts a design frame's.
- **Stylesheets on other hosts are fetched by main.** A page can't read the rules of a `<link>` on another origin, such
  as a web font's stylesheet, so the snapshot lists those by address, and main fetches them, as Parity's own requests
  aren't held to the page's CORS. They're sanitized like the page's own.
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
- **Elements get ids from their place,** their path from the body (`0.3.1`). Ids hold while the markup holds; a copy
  with new markup has new ids, and the selection falls back to the board, as it does when a design's layer goes.
- **Hit-testing reads the copy's `DrawnNodes`.** `buildCopy` returns one with the copy's elements, and the app passes it
  to `setDrawnNodes`, which `nodesAt`, `nodeOfElement` and `nodeParent` already read. `setInnerNodes` maps the same ids
  for `nodeBox`.
- **Copies' layers stay in the window.** They come from the app's code and are made again with each freeze, so they're
  kept in a window store, never written to the project document, which design frames' inner layers go into
  (`board-internals.ts`).
- **Styles are read when they're shown.** `elementLayers` takes an `ElementSnapshot` with a required `style`, built for
  the whole tree at once. It changes to take `style` as optional, and the Layers and Design panels ask for an element's
  computed style when its row or its inspector shows.
- **Source links survive.** The builder's `elementSourceAttribute` is on the sanitizer's allowlist, so a copy's element
  says where it's written.

### Pictures

- **A picture is a capture of the copy,** not of the page. The render pool (`main/render-pool.ts`) builds the frozen
  copy in `render.html` with the same `buildCopy` and `prepareFrame` as the canvas, at the mode's width and the page's
  full height, and captures it with today's tall-frame capture and its retry (PAR-880). Viewport units in a copy measure
  the mode's window, so a `900svh` section can't grow, which a page-tall iframe would make it do. No page loads in a
  render window, and `pageGuard` keeps them on `render.html` as now.
- **A picture needs a copy first.** The freezer makes copies for boards out of view too, nearest first, and a board
  shows its placeholder until its copy and picture exist. Capturing takes about 40 ms and scaling 16 ms.
- **`RenderJob` becomes a union.** It's one zod schema today (`shared/service-params.ts`), keyed on a design tree. A
  page variant, `{ kind: "page", projectId, copy, mode, state, scale }`, where `copy` names a snapshot the service
  keeps, means `frameKeys`, `bitmapName`, `previewName` and the render path in `renderer/render.ts` each handle both.
- **A page bitmap's name** hashes the project, the route's path, the resolved mode (its width, height, classes and
  attributes), the state and the scale, so editing a mode changes it.
- **Bitmaps are kept on disk with a trace,** as design frames' are (PAR-994), so a kept bitmap is current when Parity
  opens while its trace holds, and stands in, stale, until it's captured again otherwise.

### A page's trace

What a copy and its picture were made from, by builder:

| Builder            | The trace's files                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite               | `loadedFiles` of the route's file and its parents' files, from `Route.file` and `Route.parent`                                                                                                                                              |
| webpack-compatible | The same, from its `loadedFiles`                                                                                                                                                                                                            |
| Next.js            | No `loadedFiles`: every file under the route's folder and its parents' layouts, and the project's shared source                                                                                                                             |
| Any, server code   | Loaders and server functions import files the client never loads, such as a data module: the route file's imports in the server's module graph where the builder has one (Vite's SSR environment), and the whole project's source otherwise |

With the lockfile, as design traces have. A builder that can't say for a route gives that route a trace of the whole
project's source, so any change makes it stale: slower, never wrong.

### Code changes and previews

- **The project's watcher reports every change.** `codeChanges` reports only component files, and nothing when a route,
  loader or layout changes (`gatherChanges`, `code-changes.ts`). The project service already watches the whole root
  (`utility/projects.ts`) and tells extensions with `files.changed`. It tells the window too, with the changed paths,
  batched as its other changes are, so builders need nothing new.
- **A page's trace says what's stale.** Each copy and picture keeps the trace it was made from. A change to a file in a
  trace marks that copy and picture stale, and they're redone nearest the view first, the live board's route before the
  rest.
- **Frames are started again where pages don't update themselves.** Under Vite (`hmr: false`) and the webpack-compatible
  builders, a page keeps the modules it loaded, so after a change the pool's frames are replaced, and the live frame is
  swapped for a fresh one at its route once that one has painted. The webpack builders stop polling and reloading pages
  that Parity starts again itself. Next's pages update in place with its hot updates and are kept.
- **A page that reloads anyway** says hello again with the same frame id. Parity replaces that frame's channel, treats
  it as loading until it's ready, and drops any snapshot it was taking. An app that writes `window.name` loses the id on
  its next load; its frame never says hello, misses its deadline and is replaced.
- **A style preview reaches every mode at once.** The preview's rules go into one shared sheet that every copy of the
  route adopts, and to the live page through `preview.set`, so a preview never makes a copy stale. The demo measured 11
  to 56 ms across 102 boards.

### When the page process fails

A project's pages share one renderer process, so its failure takes that project's live frame, spares and freezer with
it, and no other project's.

- **Seen as a closed port, or by main.** Chromium closes a frame's `MessagePort` when its process goes, which `domPort`
  reports, and main sees the process go and tells the window the project's host. A request past its deadline counts as a
  hang. However many frames report it, it's one failure.
- **Started again with a pause.** Parity opens new frames after 1 s, then 5 s, then 30 s. After three failures in two
  minutes, it stops: boards keep their copies and pictures, and live boards say the app's page stopped, with a button to
  try again.
- **Nothing is lost but the live page.** Copies and pictures are in Parity's window and on disk.

### Telemetry

Through `@parity-app/telemetry`, with no route paths or page content in any event:

| Event                 | Says                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `route-frame.live`    | how it went live (warming, parked, sent, loading, new) and how long it took |
| `route-frame.miss`    | going live found no spare                                                   |
| `route-frame.refused` | a snapshot refused, and why: a cap, the schema or a deadline                |
| `route-frame.removed` | how many elements and attributes the sanitizer took out of a snapshot       |
| `route-frame.process` | the page process went or hung, and whether Parity stopped trying            |

## What goes where

| Piece                                                                        | Home                                                                         | Runs in                    |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| Snapshot model, its schemas, `PageMode`, the sanitizers, building a copy     | `@parity-app/frames` (new)                                                   | Parity's window, tests     |
| Tiers, the pool's plan, parking, markup groups, stale copies, ids, deadlines | `@parity-app/frames`                                                         | Parity's window, tests     |
| The page runtime: channel, mode, scrolling, snapshots, previews              | `@parity-app/page-runtime` (new)                                             | The project's page         |
| The page contracts (`PageRouter`, `PageHydration`) and their types           | `@parity-app/extension/page` (new entry)                                     | The project's page         |
| TanStack Router's, React Router's and Next's page routers                    | each router extension's `/page` entry                                        | The project's page         |
| React's hydration signal                                                     | `@parity-app/extension-react/page`                                           | The project's page         |
| Putting the runtime and the page modules into the page                       | Vite, webpack-compatible and Next builders                                   | The builder                |
| Telling the window which files changed                                       | `apps/desktop/src/utility/projects.ts`                                       | The project service        |
| The route board view, the pool and freezer, placing the live frame           | `apps/desktop/src/renderer/canvas/`                                          | Parity's window            |
| Page jobs in the render pool, page bitmap names and traces                   | `apps/desktop/src/main/`, `shared/service-params.ts`, `shared/render-job.ts` | Main and offscreen windows |
| Stopping frames leaving the builder's origin, fetching other hosts' sheets   | `apps/desktop/src/main/`                                                     | Main                       |

`@parity-app/frames` takes data and returns data. Its tests run in Vitest, with happy-dom (already in the catalog) for
the functions that take a `Document`. It's named for frames, not routes, so stories and components can use the same
tiers later (see Beyond routes). `PageMode` moves into it from `route-boards.ts`.

`@parity-app/page-runtime` replaces `appPageModeScript` in all three builders. As built (PAR-1260) it's a module entry
each builder serves, not one inline script, so it can import the channel and the page modules, and React's hook is
installed before React loads. Its unit tests run in happy-dom. Hydration and navigation are checked against the
fixtures' real apps in the end-to-end suite in CI, since happy-dom can't run a Start or Next app's hydration.

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
  /** The page's stylesheets in document order, so the cascade holds: a readable sheet by content hash, which Parity
   * asks for if it hasn't got it, or a sheet on another origin, whose rules the page can't read, by address, for main
   * to fetch. */
  sheets: ({ hash: string } | { href: string })[]
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

/** `<html>`'s classes, attributes and inline style with only what may go on the copy's host in Parity's document. */
export function sanitizeRoot(root: PageRoot, policy: SanitizePolicy): { root: PageRoot; removed: number }

export interface SanitizePolicy {
  /** The builder's origin, which a copy may load anything from. */
  pageOrigin: string
}

/** A copy's elements, made in `document` with `createElementNS` and `setAttribute` only, under a body stand-in marked
 * `inert`, and the `DrawnNodes` that maps their ids to them. Every element is created in `registry`, the copy's shadow
 * root's own, so none is upgraded by a definition in Parity's window. */
export function buildCopy(
  document: Document,
  body: FrozenElement,
  registry: CustomElementRegistry
): { fragment: DocumentFragment; drawn: DrawnNodes }
```

The sanitizer keeps what's on its allowlists and drops the rest:

- **Elements:** HTML's, SVG's and MathML's elements that draw or hold content. `script` in any namespace, `iframe`,
  `frame`, `frameset`, `object`, `embed`, `portal`, `base`, `meta`, `link`, `noscript`, `template` and `style` (the
  sheets are collected apart) aren't on it, and neither are SVG's `animate`, `set`, `animateMotion` and
  `animateTransform`, which can set an `href`. A dropped element becomes an empty `parity-removed`, so the layout keeps
  its place.
- **Custom elements** keep their tag so the page's CSS still matches them. The copy's shadow root uses a custom element
  registry of its own (`attachShadow({ customElementRegistry })`), so the guest's definitions in Parity's window don't
  upgrade them. Electron 45's Chromium 156 has scoped registries. An element made with a plain `document.createElement`
  still upgrades to the guest's definition, so `buildCopy` passes the registry to `createElementNS`.
- **Attributes:** global and per-element attributes that describe content, `data-*` and `aria-*`. Not on it: every
  `on*`, `autofocus`, `autoplay`, `is`, `popover`, `popovertarget`, `action`, `formaction`, `form`, `ping`, `srcdoc` and
  `http-equiv`.
- **URLs** in `href`, `src`, `srcset`, `poster`, `xlink:href`, `style` and sheets' `url()` are parsed, and kept when
  they're on `pageOrigin`, `https:` on any host for images, fonts and media (CDNs and web fonts), or a `data:` URL of an
  image or a font. Everything else goes. The page made them absolute, so nothing resolves against Parity's address.
- **Copies are `inert`.** Their links and forms can't be followed or sent, and nothing in them takes focus.

The demo checked that a hostile `onerror` and a `javascript:` link are stripped and nothing runs in the top window. Step
3 adds tests for every element, attribute and URL rule above. A content security policy for Parity's window would be a
second layer; it's PAR-1255, in the backlog.

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
  /** Someone pressed a key or the pointer in the page. Sent at most once a second while they do. */
  "page.used": { params: Record<string, never>; result: null }
  /** The engaged page scrolled itself, so its live window moves down its board. */
  "page.scrolled": { params: { top: number }; result: null }
  /** A pinch, or the wheel with Ctrl or Cmd, over the engaged page: the canvas's zoom, at a point in the page. */
  "page.zoom": { params: { deltaY: number; x: number; y: number }; result: null }
  /** Escape, or one of Parity's Ctrl or Cmd shortcuts, that the page didn't handle. */
  "page.key": { params: { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }; result: null }
}
```

The runtime listens for those keys and the zoom wheel on `window` in the bubbling phase, so the page handles them first,
and passes on only what it didn't `preventDefault`. It stops the zoom wheel's default, so the page itself doesn't zoom.

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
root commit. Under Next, where the runtime may come after React, it reads Next's own signal instead.

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

**With no page router,** a frame can't be moved, since a changed URL doesn't show that anything rendered: an app that
doesn't listen for `popstate` keeps the old page under the new address. So spares for that project are loaded at the
route they're for and parked there, and going live anywhere else is a full load. **With no hydration module,** the app
counts as hydrated once the document has loaded and the DOM has been quiet for 150 ms.

**Next runs `instrumentation-client` before the app's React.** Every client entry of Next 16.4 requires it before the
module that loads `react-dom/client`: the App and Pages Routers, under webpack and Turbopack, in dev and production. So
React's `PageHydration` works under Next as elsewhere, and Next needs no signal of its own. The hook resolves only on a
commit to the app's root (`document` for the App Router, `#__next` for the Pages Router), since Next's dev overlay
brings its own React, which can load after the hook under Turbopack and render into a root of its own.

Where each page router finds its router:

| Router                     | Where its router is in the page                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| TanStack Router            | `window.__TSR_ROUTER__`, which `router-core` sets for every client router since about 1.121, not only TanStack Start     |
| React Router, framework    | `window.__reactRouterDataRouter`, which `HydratedRouter` sets, in v7 and v8                                              |
| React Router, data library | No global: the builder serves `createBrowserRouter` and `createHashRouter` through a module that hands their router over |
| React Router, declarative  | `<BrowserRouter>` makes no router object, so there's no page router, and spares are parked                               |
| Next.js                    | `window.next.router`, in the App and Pages Routers                                                                       |

### Keys

```ts
/** What a copy or a picture is of. With its trace, it says whether a kept one is current. */
export interface CopyKey {
  route: string // the path with sample params, from routePageUrl
  mode: string // the resolved mode's id
  state: string // the board's state id
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

| Surface                                   | Today                           | Change                                                            |
| ----------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| `RouterContribution` (`manifest.ts`)      | `decorators`                    | Add `page`, the page router's module                              |
| `RendererContribution` (`manifest.ts`)    | `guest` and its packages        | Add `page`, the hydration module                                  |
| `@parity-app/extension/page`              | doesn't exist                   | New entry: `PageRouter`, `PageHydration`, `PageLocation`          |
| `BuilderSession` (`core/src/adapters.ts`) | `codeChanges`, `loadedFiles`    | No change; `loadedFiles` makes page traces where a builder has it |
| `RouterProvider` (`providers.ts`)         | `routes()`                      | No change                                                         |
| `Navigate.pageUrl` (`api.ts`)             | the URL a route's page draws at | No change; it stays the URL a frame is sent to                    |
| Builders' page script                     | `appPageModeScript`             | The page runtime and the page modules                             |
| `pageHeightMessage`, `pageLandedMessage`  | in `route-boards.ts`            | Removed, replaced by `ParityMethods`                              |

Extensions stay private (docs/extensions.md), so this changes the API in place, as the conventions' fix-forward rule
says. The handshake's `protocol` is checked from the first version, so a page served by a builder from another Parity
copy is refused, not misread.

## What the desktop app changes

- **`PageFrame` and the `page ?` switch in `ContainerView.tsx` go.** A route board draws through a `RouteBoard` view:
  the picture as an `<img>`, or the copy in a shadow root from `prepareFrame`, which stays beneath the live frame while
  it's live.
- **The live and spare frames live in one layer over the canvas,** not inside tiles. The live frame is placed over its
  board as "The live window" says, scaled with the camera, with `pointer-events: none` until it's engaged. Spares are
  parked in the same layer, as "The pool" says.
- **Page tiles stop asking for design-frame bitmaps.** They run `useFrameShows` and `useFrameBitmap` today on a tree
  that resolves to nothing.
- **Every wait on a page has a timeout.** A hidden or minimized window runs no animation frames.
- **A second window of the same project,** as a lens moved out (PAR-1247), has its own live frame and spares and shares
  the project's freezer, copies and bitmaps.

## Isolation

- **Each project's pages run in a renderer process of their own.** `parity://app` and the builder are different sites,
  so pages never share Parity's process. Site isolation ignores the port, so on `http://127.0.0.1` every open project's
  pages share one process and its main thread, as step 1 saw. Frames load from `http://<project-id>.localhost:<port>`
  instead, which Chromium resolves to the loopback address without DNS, and each such host is a site of its own: step 1
  saw a process per host. A project's live frame, spares and freezer still share one, which is why its freezer and
  refills pause while its live page is in use. Vite accepts `*.localhost` hosts by default; webpack-dev-server's and
  Next's host checks are confirmed in step 2.
- **The sanitizer is the copy's only guard in Parity's window** until the window has a content security policy
  (PAR-1255).

- **Every frame shares the window's session** (`persist:copy-N`), so a project's frames share cookies and storage, as
  tabs of one browser do. Cookies and storage are kept per host, so one project's don't reach another's. Closing a live
  frame after use keeps the app's memory apart, not its storage. Signing in is [impersonation.md](impersonation.md)'s
  and PAR-1229's.

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

The demo didn't cover code changes, copies' selection or pictures captured from copies, and it ran same-origin, so the
channel and the sanitizer on real cross-site snapshots are untried. Step 1 covered input, processes and parking.

### Step 1's checks

Run in Electron 45.2.1 (Chromium 156) on 2026-11-17 (PAR-1259), with Parity's window on `parity://app` and small pages
on builders' loopback ports. Input went through Chromium's input router (`Input.dispatchMouseEvent` and
`Input.dispatchKeyEvent`). Next's and the routers' answers come from their published sources.

| Check                                                                            | Answer                                                                                                               | What it changed                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Pages' process, two projects on `127.0.0.1`                                      | One process for every project's pages, apart from Parity's; a process per `*.localhost` host                         | Frames load from `<project-id>.localhost` (Isolation)          |
| A spare off-screen or clipped                                                    | No animation frames, `ResizeObserver` or lazy images                                                                 | Spares park in view, scaled to 1% (The pool)                   |
| A spare at opacity 0, hidden or behind the canvas                                | Animation frames but no `ResizeObserver`; lazy images only at opacity 0 and behind                                   | The same                                                       |
| A spare in view scaled to 1%, or at opacity 0.01                                 | Drawn in full, like a visible frame                                                                                  | The same                                                       |
| Wheel, Ctrl and wheel, and a press over a live frame with `pointer-events: none` | All reach the canvas; the page gets none                                                                             | None                                                           |
| The same once it's engaged                                                       | The page gets them all and scrolls; the canvas gets none; the window doesn't zoom when the page stops Ctrl and wheel | None                                                           |
| Keys after going back to `pointer-events: none`                                  | Still the page's while it has focus                                                                                  | Disengaging takes focus back (Input on a live board)           |
| Scoped custom element registries                                                 | Yes. Elements made with the registry don't upgrade; a plain `document.createElement` does                            | `buildCopy` takes the registry; the renaming fallback goes     |
| React loaded when Next runs `instrumentation-client`                             | No, in every Next 16.4 entry                                                                                         | React's hydration hook serves Next (The page modules)          |
| A plain TanStack app's router                                                    | `window.__TSR_ROUTER__`, since about 1.121                                                                           | Every TanStack app has a page router                           |
| React Router library mode's router                                               | No global; framework mode has `__reactRouterDataRouter`                                                              | The builder wraps `createBrowserRouter` and `createHashRouter` |

### In the app, on copacker (PAR-1302)

Measured on 2026-11-18 in `pnpm dev:prod`, with the window shown on screen at 1440×900. Copacker has 41 routes and 4
modes (Desktop Light and Dark at 1280, Tablet Light at 768, Mobile Light at 390): 41 boards with one mode each, 164 with
all four. Frame times are each animation frame's interval while the camera moves every frame for 4 s, as `pnpm perf`
moves it. Hover and press went through Chromium's input, timed from the event to the board's `data-ready` or
`data-live`.

Copacker drew no copy at first. TanStack Start renders its pages on the server, and that HTML never went through Vite's
`transformIndexHtml`, so the page runtime wasn't in it: boards kept placeholders and spares were never ready. Vite's
builder now puts the runtime in server-rendered pages too (`serverPageEntry`, PR #855).

| What                                                      | In the app                                                                                           | The demo                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| Pages shown in a new window, 41 boards                    | every board's kept picture in 3.9 s                                                                  | none                           |
| Three more modes turned on, 105 new boards                | each with a copy and a picture in 66 s, about 0.6 s a board; 6 s once their pictures are kept        | 36 pairs frozen in 7–26 s      |
| Hover to Ready, with Interact                             | 93–253 ms, the 80 ms rest included; 540 ms for a portal route that redirects                         | none                           |
| Press to Live, from Ready                                 | 22–52 ms                                                                                             | parked 20–157, sent 222–486 ms |
| Copies drawn at once                                      | 2 to 4: only boards wider than 440 px near the view; pictures elsewhere                              | all 102                        |
| Pan, 164 boards, at fit, 20%, 45% and 60%                 | 60 fps, no long tasks                                                                                | none                           |
| Zoom, 164 boards, at fit                                  | 56–59 fps                                                                                            | none                           |
| Zoom, 164 boards, at 20%                                  | 39–47 fps, no long tasks                                                                             | none                           |
| Zoom, 164 boards, at 45–60%                               | 21–28 fps; 40–47 fps with out-of-view boards' contents skipped                                       | none                           |
| Memory, 164 boards                                        | window 650–900 MB, pages' process 170–250 MB with freezer, spares and live frame, builder 710–770 MB | about 80 MB a frame            |
| For comparison: Components, 390 boards drawn by the guest | pan 20–30 fps, zoom 14–34 fps, 28–60 long tasks in 4 s; window 1.3–1.5 GB                            | none                           |

What it found:

1. **Route frames do what the demo did, or better.** Going live from Ready takes about 30 ms, since hover already moved
   a spare to the route. Panning never drops a frame, and a canvas of pictures with a few copies needs far less of the
   window than the demo's 102 copies, or than Components' 390 frames drawn by the guest.
2. **Zooming is slower, and route frames aren't why.** Hiding every picture, every copy or every board's content left
   zoom at 25 fps at 60%; hiding whole boards gave 59 fps. Each zoom frame restyles every board's labels and gutters,
   about 900 elements across 41 routes, 37 of them out of view. Skipping out-of-view boards' contents with
   `content-visibility` took 60% from 25 to 47 fps and 20% from 44 to 57 fps, but the measuring service reads frames in
   those boards too (PAR-1314).
3. **Session Replay builds up over a long session.** After about an hour, zooming spent about 1.8 s of every 4 s in
   JavaScript, with Replay's mutation handling at the top though it was held for the zoom; a fresh Replay spent 1.0 s
   (PAR-1315).
4. **A copy plays the page's entrance animations each time it mounts.** Copacker's login form fades in over 0.5 s
   whenever its board turns from picture to copy (PAR-1316).
5. **Copies are kept only in the window.** After a reload, boards show their kept pictures, and each turns into a copy
   once the freezer has frozen its route again, nearest the view first.
6. **Turning on more modes on Pages draws a route's boards on top of each other** (PAR-1317). It doesn't change the
   counts or tiers above.

## Risks

- **Each frame is a whole copy of the app,** about 80 MB in dev. Per project and window, the live frame, two spares and
  the freezer come to about 320 MB. With three projects open that's about 1 GB, which is why unfocused windows close
  their spares, the count is a setting, and a machine with less than 8 GB keeps one spare per project and window. Render
  windows build copies, not pages, so they add no copies of the app.
- **Spares run the app's code for real:** polling, websockets, analytics and the route's loaders, including any that
  write to a backend. `window.parityFrame` lets an app hold back what it doesn't want run on Parity's behalf, except in
  `<head>` scripts under Next.
- **A copy can't hold** what isn't in the DOM, such as video frames, a closed shadow root's content, or what shows only
  on hover or focus.
- **Pages that change on their own,** such as clocks, random content or data from a server, differ between modes and
  between freezes, so they fall out of markup groups and refreeze more.
- **The first visit to a route pays the builder's compile,** up to 37 s on Copacker. Spares and the freezer hide it from
  going live, but freezing every route when a project opens leans on the builder.
- **Every router's landed signal is its own,** and only TanStack's was tried. React Router's declarative
  `<BrowserRouter>` has no router object, so its apps get no page router, their spares can't be moved, and only parked
  spares are fast.
- **The router globals aren't public API.** `__TSR_ROUTER__`, `__reactRouterDataRouter` and `next.router` can change in
  a minor release; each page router checks what it finds and falls back to parking when it's missing.

## Beyond routes

The tiers, the snapshot and the channel don't depend on routes. A story's page, or a component's case page from
[visual-tests.md](visual-tests.md), is a page that draws something at a URL, and could be live, frozen or a picture the
same way, with a page module that changes the story instead of the route. Components and stories keep the guest until
that's tried. [frozen-copies-beyond-routes.md](frozen-copies-beyond-routes.md) proposes it for stories and then
components, from what the app measured on copacker.

## Build steps

Each is an issue, in this order.

1. **Checks before building** (PAR-1259), done: see Step 1's checks under Evidence. Nothing stopped the plan; parking,
   processes, disengaging, `buildCopy` and the page modules changed.
2. **The page runtime, its channel and the page modules** (PAR-1260). `@parity-app/page-runtime` replaces
   `appPageModeScript` in the Vite, webpack-compatible and Next builders, with the handshake, `mode.set` without a
   reload, `page.height` in the mode's window and no scrollbar. Frames load from `<project-id>.localhost`, with each
   builder's host check confirmed. TanStack Router's page router, React's hydration module, and the fallbacks.
   `PageFrame` uses it, so a board's mode changes without reloading. Built: the frame name also carries the frame's
   role, mode and viewport, `mode.set` carries the viewport, `page.ready`'s router is `null` without a page router, and
   the port arrives as `{parity: "port", frame}`.
3. **`@parity-app/frames`** (PAR-1261), done: the snapshot's schemas and caps, both sanitizers with a test for every
   element, attribute and URL rule, `buildCopy`, ids, keys and the planners. It added `sanitizeRoot`, since `<html>`'s
   attributes go on the copy's host in Parity's document and need the same allowlist as the body's. `PageMode` is only
   in `@parity-app/frames` now, and its `PageLocation` is `@parity-app/extension/page`'s.
4. **Frozen copies** (PAR-1262), done: `snapshot.take` and `sheets.get` in the runtime, other hosts' sheets fetched by
   main, the freezer frame and its queue, and the `RouteBoard` view that shows copies through `prepareFrame`, registered
   as frames, with hit-testing, layers in a window store, styles read when shown, and the redirect warning. Boards show
   copies instead of iframes. Handling the page process's failure, and telemetry. Built: with the Interact tool a board
   still loads its page in an iframe, until step 5's live frames replace it. A copy is kept by its project, URL, mode
   and window, not yet by `CopyKey`, and each route is frozen in every mode it's drawn in, since markup groups are step
   7's. The freezer has no live page to pause for yet. Main hears the page process go (PAR-1300): Electron's
   `render-process-gone` is only the window's own process, and a cross-site frame's has no event, so main notes each
   page frame's process on `did-frame-navigate` and looks twice a second, while any is open, for one that ended under a
   frame still in the window (`PageProcesses`). The window keeps one record of failures per project (`processFailed`),
   so the live frame, spares and freezer close together and wait out the same pause. Live boards don't say the page
   stopped yet, and there's no button to try again. The events are `routeFrame.refused`, `routeFrame.removed` and
   `routeFrame.process`, as the telemetry registry names events in camel case. `prepareFrame` takes the copy's registry,
   `elementLayers` takes `style` as optional, and copies' layers reach Layers, the Design panel and hit-testing through
   the window's entries (`withCopyEntries`), never the document.
5. **Live frames from the pool** (PAR-1263), done: spares, hover, parking, Interact, engaging and disengaging, the zoom
   wheel and keys passed back, the live window, fixed elements hidden in the copy, frames stopped leaving the builder's
   origin, and when live ends. With the Interact tool a board goes live instead of loading its page in an iframe. Built:
   spares wait only while the Interact tool is on, two of them by default; `routeFrameSpares` (PAR-1303) sets the count,
   as "The pool" says. The runtime takes `role.set`, so a spare that goes live says so in `window.parityFrame`.
   `page.key` passes back Ctrl or Cmd keys except the ones that edit or move through text, which stay the page's. The
   live frame is placed over its board from the board's box each animation frame while it's live, in a layer in tldraw's
   page space, and `page.zoom` reaches the canvas as tldraw's own wheel event. A navigation off the builder's origin is
   stopped on `will-frame-navigate` and `will-redirect`, and the board says "Tried to open" with the host. When live
   ends the board's frozen copy stays: the live page's snapshot doesn't stand in for it yet, since nothing makes copies
   stale before step 7. The freezer waits 2 s after each `page.used` and 1.5 s after a board goes live or spares open or
   move. The events are `routeFrame.live` and `routeFrame.miss`.
6. **Pictures** (PAR-1200), done: page jobs in the render pool built from copies, `RenderJob` as a union, page bitmap
   names, traces by builder, and tiers by size on screen. Built: the page job is
   `{ kind: "page", projectId, route, path, state, mode, scale }`, with `route` the route's id for its trace and `path`
   its path and query. It carries the copy itself, its body, root and sheets' text, only when it's captured; asking for
   a kept picture names the page without it, so the service keeps no copies. The render window sanitizes the copy again
   and builds it with the board's own `mountCopy` and `copySheets`, moved out of `RouteBoard.tsx` and `freezer.ts` for
   it. Pictures are kept beside frames' bitmaps as `page-<hash>.webp`, with the trace's files and digest inside. A trace
   is `pageTraceFiles`'s choice (`@parity-app/project`): the builder's `loadedFiles` of the route's chain where it has
   them, every file under the route's folder and those directly in each folder above it for Next, else the whole
   project, each with the chain, Parity's scan of its imports, what mounts the app and its imports outside the routes
   (`appEntries`), the stylesheets, the shared config and the `public` folder. A kept trace also stops holding when a
   file it would now list is added, and a board checks its kept picture again with each new copy. A page that
   redirected, or drew its not-found or error page, takes the whole project, since its chain doesn't lead to what it
   drew. A copy notes when its page started loading, and a picture whose traced files changed after that is kept without
   a trace. Server code is the scan's, since no builder's server graph is read yet. A stale picture is only found when
   its board asks for it. Copies take the same trace since PAR-1298 (step 7). Boards choose their tier with `boardTier`
   from the camera's zoom, `useFrameView`'s `near`, the live frame and the pointer with Interact, and route boards ask
   for no design bitmaps. A capture that fails is tried again after 2 s, doubling up to 16 s, as frames' are.
7. **Code changes and previews** (PAR-1264), done: the watcher's changes reaching the window, stale copies by trace,
   starting frames again where pages don't update themselves, the second hello, markup groups, and style previews in
   copies and the live page. Built: the window hears `project.filesChanged`, the app's changed files 250 ms after the
   last, leaving out hidden folders, installed packages, builders' output and `.par` files. Copies are kept by
   `CopyKey`, with the mode's id, and remember the mode as drawn, so an edited mode is frozen again; two states of a
   route share a copy. Since PAR-1298 a copy's trace is its picture's (`pageTrace`), asked of the project service after
   each snapshot (`pages.trace`), so a change refreezes only the copies whose traces list it. Where routes are named by
   folder, the trace keeps the folders `folderRouteFiles` reads, and a file added there or in `public` counts too; a
   whole-project trace is `"all"`, so an added file counts anywhere. It reads the project's files as they are now. A
   copy whose files changed while its page loaded is frozen again at once. A refreeze takes one snapshot per markup
   group (`groupLeaders`), which stands in for the group's other modes until each is checked once nothing is missing.
   The freezer takes a second hello as a reload: it waits for `page.ready` and asks again, three times at most. Until
   step 5's live frame, the page drawn with the Interact tool is what's started again, unless its `page.ready` named
   Next's router (`updatesItself`), and the webpack-compatible builders' polling reload is gone. The style preview that
   exists today is token values edited and not saved, which go into one sheet per project every copy adopts and to the
   page through `preview.set`, into a sheet snapshots never list. A copy's layer previews a style field's value while
   it's typed or scrubbed, in every copy of the page, and never saves it.
8. **React Router's and Next's page routers** (PAR-1265), with the wrapped `createBrowserRouter` and `createHashRouter`
   for library mode. Built: React Router's reads `__reactRouterDataRouter`, or in library mode `__parityDataRouter`,
   which Parity's `react-router` sets. A manifest's `pageWraps` names the packages a router serves in place of the
   app's, which Vite and the webpack-compatible builders serve to the app's own modules alone, resolving the wrapper's
   own import from the app. `react-router` and `react-router-dom` 7 are both wrapped (PAR-1299), and an app that lists
   only `react-router-dom` is React Router's too; React Router 8 has no `react-router-dom`. React Router's move is done
   when React commits the new location in the `RouterProvider` given the app's router, heard on
   `__REACT_DEVTOOLS_GLOBAL_HOOK__`, since `RouterProvider` renders in a transition. Next's reads `window.next.router`:
   the App Router's move is done when it writes the address with the new tree it commits, and the Pages Router's when
   `push` resolves. Not-found comes from React Router's 404, the App Router's development marker and the Pages Router's
   `/404`.

Each step updates the page-screens section of [editor.md](../editor.md) and its tests, and [support.md](../support.md)'s
rows for routes.

## Open questions

- **Hot updates in pages.** Under Vite, a code change starts every page again. Pages are documents of their own, so
  turning hot updates on for them alone would keep the live page's state, if the builder can tell its pages from the
  guest.
- **Selecting inside the live page.** It's on another origin, so its elements aren't in Parity's document. Selection and
  layers show the copy beneath it, which is the page as it was when live began.
- **The Pages lens** (PAR-1244). It owns the route boards once it exists; nothing here depends on which canvas draws
  them.
