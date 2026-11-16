# Proposal: pages drawn by the project's one instance (PAR-1204)

Status: draft for discussion, 2026-11-16. Nothing here is built. It follows
[loading.md](loading.md), where this was the last change, "later". Andrew moved it up. It answers his question: should
pages share one instance of the app with component and story frames, or have one of their own, given the visual tests
planned for components and stories?

## In one line

Every frame on a project's canvas, whether a component, a story or a page, draws from one instance of the project's code.
A page is a frame whose router holds the app's real route tree, in memory, at the page's URL. Visual tests keep a fresh
page for each case, so they don't decide how the live canvas shares its instance.

## Today

- **Components and stories** draw from the guest module, imported once into Parity's window. Each frame is a shadow
  root with its own React root. A router extension wraps every frame in its router, at the frame's URL, with an empty
  route tree (PAR-1152), so `Link` and router hooks work. The frame's mount can take a `url`, but no frame passes one.
- **Pages** are iframes, each loading the app's `index.html` at its URL (`PageFrame` in `ContainerView.tsx`). Opening
  Copacker boots 41 of them, each with 247 modules, about 10,100 module loads in all, in one renderer process, and they
  finish loading 25 to 29 seconds after the window appears. None sleeps or shows a bitmap.
- **Visual tests**, as planned, render each case as its own page on the project's dev server, in a headless browser,
  with a fresh page per case ([visual-tests.md](visual-tests.md), The case page; PAR-226).

## Shared or separate

Shared in the live canvas, separate in visual tests. The two have different jobs:

| Where                     | Job                                                            | Instances                         |
| ------------------------- | -------------------------------------------------------------- | --------------------------------- |
| The live canvas           | Show the whole app at once, editable, and keep it fast to open | One per project, for every frame  |
| Bitmaps and previews      | Stand in for frames out of view                                | One per offscreen window, reused  |
| Visual tests and baselines | The same pixels every run, whatever ran before                 | One per case, in a fresh page     |

Determinism is the visual tests' job, and they get it from a fresh page per case, so nothing on the canvas can change a
capture. Sharing on the canvas then only has to be right for working on the app. There it's what the app does in a
browser tab: one module graph, one React, one copy of each app-wide store. A page's sign-in or a query cache filled by
one page is seen by the others, as it would be by the next page in a tab.

A page drawn the same way everywhere keeps the three consistent. The case page for a page imports the guest and mounts
the page with its URL, as the canvas does. Pages get visual tests on the same terms as components and stories, with
their traces.

Separate instances on the canvas, one for pages and one for the rest, would cost a second copy of the code and React,
and keep page frames apart from Layers, selection and editing for no gain the visual tests need.

## How a page draws

1. **The router extension draws the app's real routes.** Each router extension declares a page decorator next to its
   frame decorator: the same router, made from the app's own route tree instead of an empty root route, with memory
   history at `{ "$frame": "url" }`. For TanStack Router that's the generated `routeTree`. For React Router, library
   mode's route objects in `createMemoryRouter`, and framework mode's `app/routes.ts` with client loaders.
2. **A page mounts as a frame.** `ModeView` draws it with the page's URL, from `routePageUrl`, instead of `PageFrame`.
   Layouts, loaders, `beforeLoad` and redirects run in the router as they would in a tab, and the page gets what frames
   already have: sleep, bitmaps, skeletons, placeholders, selection, and its layers down to what its components draw.
   Layers can show inside a page, which an iframe on another origin can't (editor.md, page layers).
3. **The router says where it landed.** The decorator reports the matched location after each navigation, which
   replaces the `page-landed` and `page-height` messages from the script put into `index.html`.
4. **The app's providers come from its root route,** where TanStack Router and React Router framework mode put them,
   and from the project's decorators otherwise, as for components. Providers set up only in the app's `main.tsx` need a
   decorator, as they do for components today.

### What keeps an iframe

A page whose router can't run in the window keeps today's frame, drawn from a bitmap until it's near the view
([loading.md](loading.md), change 1; PAR-1200):

- the Next.js App Router, whose server components and server actions run on the server;
- routes whose loaders run only on the server, such as TanStack Start's server functions, or React Router framework
  mode's server `loader`s without a `clientLoader`;
- routes the router extension can only know by running the app;
- a project with no router extension, as a Rsbuild or webpack app whose routes are written in code.

A page in an iframe and a page drawn by the instance look the same on the canvas. Only Interact and Layers can tell
them apart.

## What the project's code can reach

Page code reaches the window more than component code: auth guards that set `window.location`, loaders that read it,
analytics started at import. In Parity's window that's Parity's address and history
([project-code-boundary.md](project-code-boundary.md)). Two parts of that proposal become needed before pages move:

- **Contain reloads and navigation.** Cancel any unload Parity didn't start, and send another origin's `pushState`,
  `replaceState` and `location` assignments to the frame's router as a landing, or drop them.
- **Prototype a document for the project's code** (that proposal's option 2): one hidden same-origin iframe per project
  holding its instance and rendering into the frames. Its `location`, `history` and listeners are its own. It costs
  portals, `instanceof` across realms, and a change to every guest, so it's tried on the fixtures before deciding.

One instance shares one main thread with Parity either way, as component frames do today.

## What it changes

Expected, not measured, until a prototype opens Copacker:

| On opening Copacker           | Today                                    | Pages drawn by the instance                                |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| App boots for pages           | 41                                       | none                                                       |
| Module loads for pages        | about 10,100                             | the route modules not already in the guest                 |
| Pages out of view             | live, in iframes                         | asleep, showing their bitmaps                              |
| Bitmaps of pages              | none                                     | made in the offscreen windows, as for frames               |
| Each page's loaders           | run once per page                        | run once per page                                          |

## Steps

1. **A page decorator for TanStack Router,** the example's and Copacker's router, and page frames drawn by `ModeView`
   when the router extension has one. Measure Copacker's open against [loading.md](loading.md).
2. **Containment for page code:** unloads, `pushState`, `replaceState` and `location` from the project's code.
3. **React Router's page decorator,** library and framework mode, client loaders only.
4. **Pages that keep an iframe draw from bitmaps** until they're near the view (PAR-1200, now only for these).
5. **Visual tests for pages,** with the case page mounting the page by its URL.
6. **The project's code in a document of its own,** decided from the prototype.

## Open questions

- **Sign-in.** Copacker's pages all land on `/login` today, as they would in a fresh tab. Drawing them signed in is
  [impersonation.md](impersonation.md)'s, and works the same with either instance.
- **One loader run per page.** Forty pages that load the same data fetch it forty times, as the iframes do. A shared
  query cache would fetch it once, but only where the app's cache is a module singleton.
