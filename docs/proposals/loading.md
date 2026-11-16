# Proposal: load a project lazily (PAR-1197)

Status: draft for discussion, 2026-11-16. Nothing here is built. It comes from profiling Copacker
(`D:\ecommerce\apps\copacker`): 43 routes, 394 of its own components and 664 from libraries, on Vite 8 with the
Cloudflare plugin, TanStack Router and Tailwind 4.

## In one line

Opening a project draws everything at once: 433 frames, 41 copies of the whole app in page frames, and every library
component in the Assets tab, in one pass that holds the window for 14 to 35 seconds and leaves it janky for minutes.
Draw only what's in view, from kept bitmaps first, and make the rest cheap enough to do in the background.

## What was measured

`pnpm dev` and `pnpm dev:prod` from a worktree on their own ports, with Copacker as the only open project, read over the
DevTools protocol. A probe evaluated a small expression in the window every 2 seconds: how long it took to answer is how
long the window's main thread was busy. CPU profiles were sampled in the window, and memory read per process. Another
Parity copy, on a different project, was running on the same machine for part of it. The window was behind other windows
for most runs, so `requestAnimationFrame` didn't run and frame rate while panning wasn't measured; the probe's stalls
stand in for it.

Three launches:

- **First launch after other Parity copies had Copacker open**, with the window on React's development build.
- **The same again straight after,** the daily case: caches warm, nothing changed.
- **Twice more on React's production build,** as the installed app runs it.

## Measurements

| Step                                   | Development build                               | Production build                 |
| -------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Builder's first answer, first launch   | 32 s, after re-optimizing dependencies for 20 s | not run                          |
| Builder's first answer, warm launch    | 27 s                                            | 24 s                             |
| Component detection and props          | from the cache, 0 s                             | from the cache, 0 s              |
| Window blocked while the canvas mounts | 35.5 s                                          | 14 to 35.5 s                     |
| Frames mounted at once                 | 433 (390 shadow roots, 41 page iframes)         | the same                         |
| Probe stalls after mounting            | 1 to 4.6 s each, through minute 3               | 0.1 to 1.7 s, quiet after ~6 min |
| Window's JS heap                       | 650 to 1,050 MB, swinging; 909 MB settled       | up to 1.45 GB; 360 MB settled    |
| Window renderer's private memory       | 1.6 to 1.7 GB                                   | 1.7 GB                           |
| DOM nodes in the window                | ~20,000, of which 10,659 in the left panel      | ~16,800                          |
| Page iframes                           | 41, all in one renderer process                 | the same                         |
| Module scripts each page iframe loads  | 247, about 10,100 for all of them               | the same                         |
| Page iframes loaded                    | median 25.6 s after the window, last at 28.8 s  | not read                         |
| Builder process                        | 1.2 to 4.3 GB private                           | the same                         |
| Mid-load reload, first launch          | at ~275 s, for one dependency found late        | not run                          |
| Window busy, first launch              | from ~40 s to ~490 s; page iframes trickled in  | not run                          |

The first launch is what Andrew saw: a dependency re-optimization, the window's main thread busy for seven minutes, and
page iframes appearing one by one (8 at 60 s, 26 at 270 s, 41 at 480 s) while Vite reloaded them all at 275 s.

### Where the window's time goes

In the production mount profile (63 s, from just before the canvas mounted), Copacker's own code took 0.9 s. Parity took
30 s and garbage collection 11 s. The largest of Parity's:

| Cost                                            | Time  | Where                                                              |
| ----------------------------------------------- | ----- | ------------------------------------------------------------------ |
| React and the UI kit rendering the window       | 16 s  | Parity's chrome and frame tiles, all at once                       |
| `keepOutInherited`, once per frame              | 5.5 s | `apps/desktop/src/renderer/frame.ts`                               |
| `useFitToContent` measuring each frame          | 3 s   | `apps/desktop/src/renderer/canvas/ContainerView.tsx`               |
| A project-doc transaction for each frame's size | 2.3 s | `packages/multiplayer/src/project-doc.ts`, `callers.ts`            |
| Assets tab entries                              | 1.7 s | `AssetEntry` in `apps/desktop/src/renderer/chrome/AssetsPanel.tsx` |
| Command offers worked out for each entry        | 0.8 s | `componentOffers` in `chrome/command-offers.ts`                    |

`keepOutInherited` reads `getComputedStyle` on the frame's parent and walks every property. Each frame mounted before it
has changed the document, so every call recalculates style for the whole page: 390 recalculations of a page of ~18,000
nodes.

After the mount, the window keeps rendering the Assets tab again: once for each project-doc change and each preview that
arrives. On the development build each pass took 1.4 to 2 seconds in `AssetEntry` and its children, with garbage
collection at 25 to 33% of the window's time.

### The Assets tab

The tab draws every library entry: Base UI's 228, Shadcn Vega's 363 and Recharts' 56, with about 1,950 buttons, each
with its own hover card, hint and context menu. That's 10,659 of the window's ~20,000 nodes. Only the icons grid is
virtualized (`useVirtualizer` in `AssetsPanel.tsx`); `SourceSection` renders every `AssetEntry`.

### Page frames

Each route's frame is an iframe that boots the whole app from `index.html` (`PageFrame` in `ContainerView.tsx`, URL from
`routePageUrl` in `canvas/route-pages.ts`). They're never put to sleep, never swapped for bitmaps and have no limit; the
bitmap, skeleton and placeholder handling is all skipped for a page. All 41 run in one renderer process, on one main
thread, each loading 247 unbundled modules from the builder. The ones sampled had landed on the sign-in page, which the
app's routes redirect to.

On the first launch, Vite discovered `nuqs/adapters/tanstack-router` only once pages ran. It bundled it and reloaded
every page, about 275 s in.

### The builder

On a warm launch the builder is silent for 18 s before it answers. That's where `warmGuestGraph`
(`packages/extension-vite/src/warmup.ts`) walks the guest's import graph, one transform at a time, and then calls
`moduleGraph.invalidateAll()`, so the browser asks for every module again. The split between the walk and the Cloudflare
plugin's own start wasn't measured.

On the first launch Vite said "Re-optimizing dependencies because vite config has changed", for SSR and then for the
client, about 20 s. A straight relaunch didn't. The cache is the project's own `node_modules/.vite-parity`, shared by
every Parity copy, so a copy with different plugins or `optimizeDeps` invalidates it for the next. Which part of the
config differs between copies wasn't found.

The app's server printed 2,521 React key warnings while pages loaded, about 10,000 lines through the service.

### The service

Detection and props came from the cache on every launch here ("components and props as the type checker found them last
time"). Cold, the props pass took 16 s for 834 components in a worker that reached about 1 GB (PAR-1184). Previews wait
until the canvas has no bitmaps waiting and are made one at a time; Copacker has 4,436 frame bitmaps and 5,902 preview
files kept on disk.

## The proposal

Ranked by how much of the wait each change removes. Change 6 has since been moved up, ahead of 1.

### 1. Page frames from kept bitmaps, live only near the view (PAR-1200)

A page frame shows its kept bitmap, as a design's frame does, and mounts its iframe only when it's in view and large
enough to read, with a cap on how many are live (say four). One that leaves the view goes back to its bitmap. Pages get
captured like frames, in the offscreen render windows, and kept on disk with the same trace.

Removes: 41 app boots on open, about 10,100 module loads, 25 s of one renderer's main thread, about 230 MB of heap, and
the reload of every page when a dependency changes. Code: `PageFrame` and the `page ?` switch in `ContainerView.tsx`,
`canvas/frame-bitmaps.ts`, `canvas/frame-sleep.ts`, `main/render-pool.ts`.

### 2. Mount frames cheaply, in slices, with a cap (PAR-1201)

- Read the inherited custom properties once per batch of mounts, or when the page's stylesheets change, not once per
  frame (`keepOutInherited`). Saves 5.5 s.
- Measure frames for `useFitToContent` together, in one read pass, and write all their sizes in one project-doc
  transaction. Saves most of 5.3 s.
- Mount frames in slices that yield to input, nearest the view first, as waking already does (`wakeSoon` in
  `frame-sleep.ts`), and cap how many draw live at once. Today there's no cap: every frame near the view, or on the
  selected board, draws live.

Removes most of the 14 to 35 s block. Code: `frame.ts`, `frame-host.ts`, `ModeView.tsx`, `ContainerView.tsx`,
`frame-sleep.ts`.

### 3. Virtualize the Assets tab and keep its rows still (PAR-1202)

Virtualize each source's list as the icons grid is, work out a row's command offers when its menu opens, and keep rows
memoized so a preview or a doc change renders only the rows it touches.

Removes: about 10,500 nodes, half the window's; 1.7 s at mount; 1.4 to 2 s for each pass after it, which is most of the
jank in the first minutes. Code: `SourceSection` and `AssetEntry` in `chrome/AssetsPanel.tsx`,
`chrome/command-offers.ts`.

### 4. Keep Vite's dependency bundle stable (PAR-1203)

- Find what makes `.vite-parity`'s config hash differ between Parity copies, and give the cache a name per Parity build
  if it can't be made the same.
- Put the route modules in `optimizeDeps.entries` too, so dependencies only pages import are found before any page loads
  (`bundleFor` in `packages/extension-vite/src/builder.ts`).
- Walk the guest graph in parallel, and keep its transforms unless the optimizer's hashes changed during the walk
  (`warmGuestGraph`).

Removes: about 20 s of re-optimizing on a launch after another copy, the reload at 275 s, and part of the 18 s warm-up.

### 5. Previews ranked by the canvas

Previews already persist across launches. Rank the ones still to make by what's in view on the canvas as well as in the
panel, and make them without blocking input (`nextPreview` in `packages/processes/src/preview-order.ts`). This removes
little from opening; it shortens how long previews keep the window re-rendering afterwards.

### 6. Pages drawn by the project's one instance (PAR-1204)

Moved up on 2026-11-16, and set out in [shared-app-instance.md](shared-app-instance.md): each page drawn as a frame by
the guest, with the app's real route tree in a memory router at its URL, so pages need no boot of their own and get
sleep and bitmaps as frames do. Change 1 then covers only the pages that keep an iframe.

## Not measured

- Frame rate while panning: the window was behind others, so animation frames didn't run.
- The installed app. The production-build runs stand in for it.
- Two projects open at once, which is how the service ran out of memory (PAR-1184).
