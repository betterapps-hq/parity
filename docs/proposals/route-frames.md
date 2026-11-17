# Proposal: route frames, one live frame and frozen copies for the rest (PAR-1249)

Status: draft for discussion, 2026-11-17. Nothing here is built. It turns the spike in
[frame-isolation-spike.md](frame-isolation-spike.md) (PAR-1217) and the copacker demo that followed it into a plan for
Parity's route boards: what becomes a package, what goes into the router and builder extensions, what the desktop app
keeps, and the contracts between them.

## In one line

A route board shows a picture when it's small, a frozen copy of its page when it's near and readable, and the real page
only when someone uses it. The real page comes from a small pool of the app's own pages, already loaded and moved to the
route by the app's router, so going live takes 20 to 660 ms instead of a full page load.

## The decision this needs

**Pages follow this proposal, not the in-window drawing in [shared-app-instance.md](shared-app-instance.md).** That
proposal (PAR-1204) draws every page as a frame of the one guest instance in Parity's window, with the app's route tree
in a memory router; PAR-1205 is its first step. This proposal keeps the app in its own document and copies what it drew.
The reasons:

- **The project's code stays out of Parity's window.** A page's code reaches the window more than a component's: auth
  guards set `location`, loaders read it, analytics start at import
  ([project-code-boundary.md](project-code-boundary.md)). Wrapping page APIs one at a time was tried and taken out
  (PAR-1207, PAR-1216).
- **Every router works the same way.** The in-window plan keeps an iframe for the Next.js App Router, for TanStack
  Start's server functions (Copacker's) and React Router framework mode's server loaders, and for apps with no router
  extension. Here the app always runs as it would in a tab, so there's one path, not two.
- **Frozen copies are in Parity's document.** Selection, layers, source links and style previews work on them as they do
  on design frames, which an iframe on another origin can't offer.

If this is accepted, PAR-1205 is canceled, PAR-1200 (pages from bitmaps, iframes near the view) is folded into the build
steps below, and shared-app-instance.md keeps its part about components and stories.

## Today

- Each page board, in each mode and state, is a `PageFrame` (`ContainerView.tsx`): a cross-origin iframe that boots the
  app's `index.html` at the route's URL from `routePageUrl` (`canvas/route-pages.ts`). There's no pool, cap, sleep or
  bitmap. Opening Copacker boots 41 of them ([loading.md](loading.md)).
- The mode reaches the page through the iframe's `name` (`pageFrameName` in `packages/editor/src/route-boards.ts`).
  Changing mode changes the name, which reloads the iframe.
- One script runs in the page: `appPageModeScript` (`packages/project/src/app-page.ts`), put first in `<head>` by the
  Vite, webpack-compatible and Next builders. It applies the mode's classes, attributes and color scheme, and posts
  `page-height` and `page-landed` to `"*"`. Parity checks only `event.source`.
- The iframe grows to the page's height, measured at the first window height. A section sized in `svh` then grows with
  the frame.
- Page boards never call `registerFrame`, so selection, outlines, style previews and agents don't see them.

## How a route board draws

```text
route board
├── picture   small on screen or far away     a bitmap from the render pool, kept on disk
├── frozen    near the view and readable      the page's DOM without scripts, in a shadow root, through prepareCanvasCss
└── live      the board being used            the app's own page in an iframe, taken from the pool
```

### A board's states

| State   | Shows                                             | Becomes                                                                   |
| ------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Picture | Its kept bitmap                                   | Frozen when it's near the view and at least 400 px wide on screen         |
| Frozen  | Its frozen copy                                   | Picture when it's under 400 px wide on screen or far away; Ready on hover |
| Ready   | Its frozen copy, with a spare frame waiting on it | Live on click; Frozen when the pointer leaves for another board           |
| Live    | The app's page over the top of the board          | Frozen when another board goes live                                       |

Before a board has a copy or a bitmap, it shows a placeholder the size of its mode's window.

### Going live

1. **Hover warms.** After the pointer rests on a board for 80 ms, a spare frame is sent to its route and mode, and the
   board shows Ready once the page has landed.
2. **Click takes the quickest frame:** the warming one; else a spare already parked on the route, which only changes
   mode; else any spare, sent by the app's router; else a spare still loading; else a new frame loaded at the route.
3. **Live on first paint.** The frame goes live once the router has landed and the page has painted twice, capped at 250
   ms. It doesn't wait for the page to go quiet: an entrance animation plays out live.
4. **The live frame is the mode's window.** It sits at the top of its board, as wide and tall as the mode's window, with
   no scrollbar. The frozen copy beneath shows the rest of the page.
5. **The frame it replaces is frozen, then closed.** Parity waits for that page to go quiet (150 ms without a change, at
   most 3 s), takes its snapshot, updates its copies, and closes the frame. Each frame is live once, so routes don't
   share the app's in-memory state.
6. **The pool refills 1.5 s later,** once the new live frame has settled, and spares re-park 250 ms after the view stops
   moving.

### The pool

- **Two spare frames per project**, loaded at the app's root path. A frame is the app's page in an iframe, on the
  builder's origin, with the page runtime in it.
- **Spares wait on the routes in view,** nearest the middle first. A spare already on one of those routes stays.
- **One freezer frame** visits each route and mode that needs a copy, nearest the view first, waits for quiet and takes
  the snapshot. It works only while no board is going live.
- **A frame navigates only after the app has hydrated.** Before that, the server's page stays and the new route renders
  beside it.

### Frozen copies

- **The snapshot is plain data,** made in the page: the body's tree, the root's classes and attributes, the stylesheets
  by content hash, the page's height in the mode's window, and where it landed. Parity checks it against its schema,
  passes it through the sanitizer, and builds it with `createElementNS` and `setAttribute`, never `innerHTML`.
- **It's styled as a design frame is.** `prepareFrame` makes the shadow root, and each stylesheet goes through
  `prepareCanvasCss` once per content hash and is shared by every copy. Media queries, viewport units, fonts,
  `@property` and root rules then measure the mode's window.
- **The theme's class goes on the body stand-in**, with the root's other classes, such as font variables, kept from the
  page.
- **A copy is the whole page.** Its board is as tall as `pageHeight`, measured in the mode's window, and viewport units
  still measure the window, so a `900svh` section stays nine windows tall.
- **The same markup is shared across modes.** All six of Copacker's public routes drew the same markup in all six of the
  demo's modes. Modes whose trees hashed the same at the last freeze form a markup group, and one new snapshot updates
  every copy in it. A refreeze in the background then checks each mode.

### Pictures

- **The render pool takes them** (`main/render-pool.ts`), as it does for design frames. A page job opens `render.html`,
  which holds the page in an iframe and talks to it over the same channel as the canvas. So `pageGuard` keeps the window
  on Parity's page.
- **Each window keeps its page between jobs** and moves it with the router, as a spare does. Capturing takes about 40 ms
  and scaling 16 ms; moving to the next route or mode is most of a job.
- **Bitmaps are kept on disk** under a key that adds the route's path and the code version to today's `bitmapName`.

### Code changes and previews

- **A code change starts the pages again.** The builder runs with `hmr: false`, so a page holds the modules it loaded.
  When the builder reports a change, the pool's frames are replaced with fresh ones, the live frame is swapped for a
  fresh one at its route once that one has painted, and every copy and picture is marked stale and redone, the live
  board's route first.
- **A style preview reaches every mode at once.** The preview's rules go into one shared sheet that every copy of the
  route adopts, and to the live page as text it puts in a `<style>` it owns. The demo measured 11 to 56 ms across 102
  boards.

## What goes where

| Piece                                                              | Home                                             | Runs in                    |
| ------------------------------------------------------------------ | ------------------------------------------------ | -------------------------- |
| Snapshot model, its schemas, the sanitizer, building a copy        | `@parity-app/frames` (new)                       | Parity's window, tests     |
| Tiers, the pool's plan, parking, markup groups, stale copies, keys | `@parity-app/frames`                             | Parity's window, tests     |
| The page runtime: channel, mode, readiness, snapshots, previews    | `@parity-app/page-runtime` (new)                 | The project's page         |
| The page router contract (`PageRouter`) and its types              | `@parity-app/extension/page` (new entry)         | The project's page         |
| TanStack Router's page router                                      | `@parity-app/extension-tanstack-router/page`     | The project's page         |
| React Router's and Next's page routers                             | their extensions' `/page` entries                | The project's page         |
| Putting the runtime and the page router into the page              | Vite, webpack-compatible and Next builders       | The builder                |
| The route board view, the pool and freezer, placing the live frame | `apps/desktop/src/renderer/canvas/`              | Parity's window            |
| Page jobs in the render pool, bitmap keys                          | `apps/desktop/src/main/`, `shared/render-job.ts` | Main and offscreen windows |
| The content security policy for `parity://app`                     | `apps/desktop/src/main/`                         | Main                       |

`@parity-app/frames` takes data and returns data. Its tests run in Vitest, with happy-dom for the two functions that
take a `Document`. It's named for frames, not routes, so stories and components can use the same tiers later (see Beyond
routes). `@parity-app/page-runtime` is built to one script, as `appPageModeScript` is today, and replaces it in all
three builders. Its tests run in happy-dom with a real router from each extension's fixtures.

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
  /** `<body>` and everything in it. */
  body: FrozenElement
  /** The page's stylesheets in document order, by content hash. */
  sheets: string[]
  /** The stylesheets this channel hasn't sent before. */
  newSheets: PageSheet[]
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
  /** The rules as written, from `<style>`, `<link>` and adopted sheets alike. */
  text: string
  /** What its relative `url()`s are relative to. */
  baseUrl: string
}

export interface PageLocation {
  path: string
  search: string
  hash: string
  /** How the router ended: on the route, sent elsewhere, on its not-found route, or on its error boundary. */
  outcome: "landed" | "redirected" | "not-found" | "error"
}
```

What the page puts into a snapshot, beyond its DOM:

- an input's typed value, a checkbox's state and the selected option, as attributes;
- a `<canvas>` as an `<img>` of itself, when the page can read it;
- lazy images, switched to eager and given up to 500 ms to decode first, so a full-height copy isn't blank below the
  first window.

### The sanitizer and building a copy

```ts
/** The tree with everything that could run, load a document or leave the page taken out. */
export function sanitizePage(body: FrozenElement, policy: SanitizePolicy): { body: FrozenElement; removed: number }

export interface SanitizePolicy {
  /** The builder's origin, the one origin a copy's URLs may load from besides data images. */
  pageOrigin: string
}

/** A copy's elements, made in `document` with `createElementNS` and `setAttribute` only. */
export function buildCopy(document: Document, body: FrozenElement): DocumentFragment
```

It removes:

- `script`, `iframe`, `frame`, `frameset`, `object`, `embed`, `portal`, `base`, `meta`, `link` and `noscript`, each
  replaced by an empty `parity-removed` element so the layout keeps its place;
- every attribute that starts with `on`, and `srcdoc`, `action`, `formaction` and `ping`;
- URLs in `href`, `src`, `srcset`, `poster`, `xlink:href` and `style` that aren't on `pageOrigin`, relative, or a
  `data:image/` URL.

The demo checked that a hostile `onerror` and a `javascript:` link are stripped and nothing runs in the top window. The
content security policy below is the second layer.

### The page runtime's channel

The runtime and Parity talk over `@parity-app/channel`, on a `MessagePort` handed over once:

1. Parity loads the frame with `name` set to `parity:` and JSON: `{ protocol: 1, frame, parent }`, where `frame` is the
   frame's id and `parent` is Parity's origin.
2. The runtime posts `{ parity: "hello", protocol: 1, frame }` to `window.parent`, to `parent` only, never `"*"`.
3. Parity checks `event.origin` against the builder's origin and `event.source` against the frame, then transfers a
   `MessagePort`. From then on, messages go over `domPort(port)`, and Parity reads each one with its `checks`.

Parity asks the page:

```ts
export interface PageMethods {
  /** Applies a mode: classes and attributes on `<html>`, its color scheme, and `prefers-color-scheme` answered with it.
   * The frame's size is Parity's to set. */
  "mode.set": { params: { mode: PageMode }; result: undefined }
  /** Moves the app to `to` with its own router and answers once the new page has painted (two frames, at most 250 ms). */
  "route.go": { params: { to: string }; result: PageLocation }
  /** Takes a snapshot, after the page has been quiet for `quiet.ms` (at most `quiet.max`), or at once. */
  "snapshot.take": { params: { quiet?: { ms: number; max: number } }; result: PageSnapshot }
  /** Puts a style preview's rules in the page, replacing the last; an empty string takes them out. */
  "preview.set": { params: { css: string }; result: undefined }
}

/** As `pageFrameName` builds it today, without the frame's name. */
export interface PageMode {
  classes: string[]
  attributes: Record<string, string>
  scheme?: "dark" | "light"
}
```

The page tells Parity:

```ts
export interface PageEvents {
  /** The app has hydrated and its router can move it. Sent once. */
  "page.ready": { location: PageLocation; router: string }
  /** The app moved by itself, from a link or a redirect, outside a `route.go`. */
  "page.moved": { location: PageLocation }
  /** The page's height in the mode's window changed. */
  "page.height": { height: number }
}
```

`page-height` and `page-landed` go, with `pageHeightMessage` and `pageLandedMessage`. A mode changes with `mode.set`,
without a reload, so the frame's `name` no longer carries it. The runtime hides the page's scrollbar, so the live page,
its copy and its picture lay out at the mode's full width.

### The page router

A router extension tells the runtime how to drive its router, in a module the builder serves into the page. In
`@parity-app/extension/page`, an entry that imports nothing at runtime:

```ts
/** How the page runtime drives the app's router, from inside the app's page. */
export interface PageRouter {
  /** The router's name, for `page.ready`, such as "tanstack-router". */
  id: string
  /** Whether this page's app uses this router, checked once the document has loaded. */
  found(): boolean
  /** Resolves once the app has hydrated and its router can navigate. */
  ready(signal: AbortSignal): Promise<void>
  /** Where the router is now. */
  location(): PageLocation
  /** Moves the app to `to`, and resolves once the router has resolved where it ended and the page holds the new route. */
  navigate(to: string, signal: AbortSignal): Promise<PageLocation>
  /** Calls `moved` after each navigation the app makes by itself. */
  watch(moved: (location: PageLocation) => void): () => void
}
```

`navigate` resolving only once the new route is in the page is the contract the demo needed most: TanStack Router said
it was idle while the old page was still in the DOM. TanStack's resolves when the router is idle and its resolved
location is where it ended.

The manifest names the module next to the router's decorators, in `RouterContribution` (`manifest.ts`):

```ts
export interface RouterContribution {
  decorators?: FrameDecorator[]
  /** The module that drives this router inside the app's page, and its export. */
  page?: { import: string; export: string }
}
```

The service collects `page` as it collects `frameDecorators` (`utility/projects.ts`) and puts it in the project's
config. Each builder serves it through the same virtual modules as the guest's runtime packages, so it doesn't have to
be in the project's dependencies.

**With no page router,** the runtime uses its own: ready once the document has loaded and the DOM has been quiet for 150
ms, and `navigate` by loading the URL. A frame then can't move between routes, so the pool loads each spare at the route
it's for, and going live takes a page load. Frozen copies and pictures work the same.

Where each page module finds its router, and how it knows the app has hydrated, is settled in its build step. What's
known so far:

| Router          | Where its router is in the page                                                  | Hydrated                                                        |
| --------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| TanStack Router | `window.__TSR_ROUTER__`, which TanStack Start sets; a plain TanStack app may not | Not found yet. Copacker sets `data-hydrated` on `<html>` itself |
| React Router    | Its data router, in library and framework mode                                   | Not found yet                                                   |
| Next.js         | `window.next.router`, in the App and Pages Routers                               | Not found yet                                                   |

### Keys and versions

```ts
/** What a copy or a picture was made from: change any part and it's stale. */
export interface CopyKey {
  route: string // the path with sample params, from routePageUrl
  mode: string // the resolved mode's id
  code: number // the builder's code version, raised on each change it reports
  preview: number // the style preview's version, raised on each preview
}
```

The planners, each a function of data:

```ts
/** A board's tier, from what's on screen and what it has. */
export function boardTier(board: BoardView): "picture" | "frozen" | "live"

/** Which spares to move where, which to open and which to close. */
export function planPool(pool: PoolView): PoolPlan

/** The modes a new snapshot of a route updates: its own, and the ones in its markup group. */
export function sharedMarkup(route: string, mode: string, groups: MarkupGroups): string[]

/** The copies and pictures a code change or a preview leaves stale, nearest the view first. */
export function staleCopies(change: CopyChange, copies: readonly CopyKey[], view: ViewOrder): CopyKey[]
```

## The extension API

| Surface                                   | Today                           | Change                                           |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `RouterContribution` (`manifest.ts`)      | `decorators`                    | Add `page`, the page router's module             |
| `@parity-app/extension/page`              | doesn't exist                   | New entry: `PageRouter`, `PageLocation`          |
| `RouterProvider` (`providers.ts`)         | `routes()`                      | No change                                        |
| `Navigate.pageUrl` (`api.ts`)             | the URL a route's page draws at | No change; it stays the URL a frame is sent to   |
| `BuilderSession` (`core/src/adapters.ts`) | `guestUrl`, `codeChanges`, …    | No change; `codeChanges` raises the code version |
| Builders' page script                     | `appPageModeScript`             | The page runtime and the project's page router   |
| `pageHeightMessage`, `pageLandedMessage`  | in `route-boards.ts`            | Removed, replaced by `PageEvents`                |

Extensions stay private (docs/extensions.md), so this changes the API in place, as the conventions' fix-forward rule
says. The handshake's `protocol` is checked from the first version, so a page served by a builder from another Parity
copy is refused, not misread.

## What the desktop app changes

- **`PageFrame` and the `page ?` switch in `ContainerView.tsx` go.** A route board draws through a `RouteBoard` view:
  the picture as an `<img>`, the copy in a shadow root from `prepareFrame`, and nothing of its own while it's live.
- **The live and spare frames live in one layer over the canvas,** not inside tiles. The live frame is placed over its
  board, scaled with the camera. Spares are parked out of sight, at their mode's size.
- **Copies register as frames.** `registerFrame`, `elementLayers` and `setInnerNodes` see a copy's elements, and the
  builder's `elementSourceAttribute` tags survive the sanitizer, so selection, layers and links to source work on
  copies.
- **Which boards are near** comes from `useFrameView`'s ranking and the existing sleep rules (`boardDormant`), not from
  an `IntersectionObserver`, which reports nothing while the window isn't drawn.
- **Page tiles stop asking for design-frame bitmaps.** They run `useFrameShows` and `useFrameBitmap` today on a tree
  that resolves to nothing.
- **Every wait on a page has a timeout.** A hidden or minimized window runs no animation frames.

## Isolation

- **Live and spare frames are on the builder's origin,** another site from `parity://app`. Whether Electron puts them in
  a renderer process of their own, apart from Parity's, is checked in the first build step (`webFrameMain.osProcessId`).
  If it does, a page's main thread can't stall Parity's.
- **Parity's window gets a content security policy** without `'unsafe-inline'` for scripts: `script-src 'self'` and the
  builders' origins, where the guest comes from (`http://127.0.0.1:*`, `http://localhost:*`), and under `pnpm dev` the
  window's own dev server. An inline handler the sanitizer missed then doesn't run. Copies' `style` attributes need
  `style-src-attr 'unsafe-inline'`.
- **Every frame shares the window's session** (`persist:copy-N`), so frames share cookies and storage, as tabs of one
  browser do. Using each frame once keeps the app's memory apart, not its storage. Signing in is
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

## Risks

- **Each frame is a whole copy of the app,** about 80 MB in dev. The live frame, two spares, the freezer and up to four
  render windows come to about 0.5 GB. The pool's size is a setting, and spares close while Parity's window is hidden.
- **Spares run the app's code for real:** polling, websockets, analytics and the route's loaders, including any that
  write to a backend. The runtime runs before the app's own code and sets
  `window.parityFrame = { role: "spare" | "live" | "freezer" | "picture" }`, so an app can hold back what it doesn't
  want run on Parity's behalf.
- **A copy can't hold** what isn't in the DOM, such as video frames, a closed shadow root's content, or what shows only
  on hover or focus.
- **Pages that change on their own,** such as clocks, random content or data from a server, differ between modes and
  between freezes, so they fall out of markup groups and refreeze more.
- **The first visit to a route pays the builder's compile.** Spares and the freezer hide it from going live, but
  freezing every route when a project opens leans on the builder; the freezer goes nearest the view first and yields to
  going live.
- **Every router's ready and landed signals are its own,** and only TanStack's were tried.

## Beyond routes

The tiers, the snapshot and the channel don't depend on routes. A story's page, or a component's case page from
[visual-tests.md](visual-tests.md), is a page that draws something at a URL, and could be live, frozen or a picture the
same way, with a page router that changes the story instead of the route. Components and stories keep the guest until
that's tried.

## Build steps

Each becomes an issue, in this order:

1. **The page runtime and its channel.** `@parity-app/page-runtime` replaces `appPageModeScript` in the Vite,
   webpack-compatible and Next builders: the handshake, `mode.set` without a reload, `page.height` in the mode's window
   and no scrollbar. `PageFrame` uses it, so a board's mode changes without reloading. Check which process the frames
   run in.
2. **TanStack Router's page router,** with the runtime's own for apps without one. Tested in happy-dom against the
   fixtures' TanStack apps, with redirects and a route that isn't found.
3. **`@parity-app/frames`:** the snapshot's schemas, the sanitizer, `buildCopy`, keys and the planners, with their
   tests.
4. **Frozen copies.** `snapshot.take` in the runtime, the freezer frame and its queue, and the `RouteBoard` view that
   shows copies through `prepareFrame`, registered as frames. Boards show copies instead of iframes.
5. **Live frames from the pool:** spares, hover, parking, going live and freezing the frame it replaces.
6. **Pictures.** Page jobs in the render pool through `render.html`, bitmap keys with the route and code version, and
   tiers by size on screen. This is where PAR-1200 lands.
7. **Code changes and previews:** starting the pages again on a code change, stale copies nearest first, markup groups,
   and style previews in copies and the live page.
8. **The content security policy** for `parity://app`.
9. **React Router's and Next's page routers.**

Each step updates the page-screens section of [editor.md](../editor.md) and its tests, and [support.md](../support.md)'s
rows for routes.

## Open questions

- **Hot updates in pages.** With `hmr: false`, a code change starts every page again. Pages are documents of their own,
  so turning hot updates on for them alone would keep the live page's state, if the builder can tell its pages from the
  guest.
- **Selecting inside the live page.** It's on another origin, so its elements aren't in Parity's document. Interact
  works there; selection and layers show the frozen copy beneath until the next freeze.
- **The pool's size,** and whether it shrinks on a machine short of memory.
- **The Pages lens** (PAR-1244). It owns the route boards once it exists; nothing here depends on which canvas draws
  them.
