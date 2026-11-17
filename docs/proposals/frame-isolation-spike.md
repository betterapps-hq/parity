# Spike: one live frame, frozen frames for the rest

Status: spike results (PAR-1217), 2026-11-16. Nothing here is built.

## The question

A project's code runs in Parity's own window. Wrapping page APIs one at a time to keep it from reaching Parity
(PAR-1207, taken out in PAR-1216) fakes isolation, and each gap turns up only when a project hits it. A hidden iframe
per project would keep the code away from Parity, but every frame of that project would still share one window and one
copy of each module. A real window per frame isolates fully, but an app with hundreds of routes can't keep hundreds of
them live.

So the idea under test: one live frame, frozen frames near the viewport, pictures further out.

- **Live:** the frame someone is using runs in its own iframe, a real copy of the app.
- **Frozen:** frames near the viewport show a frozen copy of what the route drew: its DOM without scripts, with its CSS,
  in a shadow root, so selecting, inspecting and style edits still work.
- **Pictures:** frames further out show a bitmap.

This spike measured how fast a frame becomes live, what freezing costs, and what a live frame weighs.

## How it was measured

- **App:** copacker, a TanStack Start app on Vite with Cloudflare's plugin, on its own dev server. A page load requests
  about 250 modules.
- **Parity's side:** a page on one site, with copacker's routes in iframes on another, as Parity's route frames are
  today (`ContainerView.tsx`). It ran in headless Chrome driven by Playwright, on one Windows machine.
- **Routes:** the public ones (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`), each about
  150 to 180 elements. Screens behind sign-in weren't reachable.
- **Timing:** from the moment the iframe was added. First paint is the frame's own `first-contentful-paint`. Settled is
  its last DOM change before 500 ms without one.

## Results

| How the frame starts                                                                           | First paint | Settled                  |
| ---------------------------------------------------------------------------------------------- | ----------- | ------------------------ |
| Server cold: the dev server's first render of a route                                          | —           | 6.4 s for the HTML alone |
| New iframe, browser cache cold                                                                 | 0.9 s       | 1.4 s                    |
| New iframe, browser cache warm                                                                 | 0.17–0.8 s  | 0.7–1.4 s                |
| From a pool: a frame already loaded at another route, sent to this one by the app's own router | —           | 90–270 ms                |

- **A pool gets activation to a fraction of a second.** Most of a new frame's time goes to loading and running the app's
  modules again. A frame that already has them only renders the route. Hidden frames, which Chrome doesn't paint,
  settled in 35–80 ms, so most of the pooled time is the route's first paint.
- **Freezing is cheap.** Copying a route's DOM without scripts took 7–11 ms in the frame: about 23 KB of HTML for 150
  elements. Rebuilding it in a shadow root in Parity's page took 8–16 ms, and 13–55 ms with layout. The CSS is 406 KB,
  but it's the same for every route, so all frozen frames can share one sheet.
- **Freezing in the background costs about 200 ms a route.** One pooled frame visiting route after route and freezing
  each took 700 ms a route, 500 of which were the wait for the page to settle. Freezing every route of a large app on
  open is therefore tens of seconds of background work, kept per route and redone when its code changes.
- **A live frame weighs about 80 MB in dev.** Frames of one site share a renderer process, and each copy of the app in
  it added about 80 MB: 214 MB with one, 604 MB with six. A pool of two plus the live frame is a few hundred MB.
- **The shared window doesn't scale today.** With copacker open in `pnpm dev`, Parity's renderer used 2.3 GB and more
  than one core for over 15 minutes. It didn't answer DevTools long enough to be measured there, which is why this spike
  ran on its own page.

## What breaks when freezing

A frozen copy taken naively looks close, but not the same. Fonts fall back to serif, borders on inputs and buttons are
missing, and gradient text is gone. `@font-face` and `@property` apply only in a document's own scope, and the page's
root and body rules don't match inside a shadow root. Parity's frame stylesheet pipeline (`prepareCanvasCss`) already
deals with all of these for frames today: it moves fonts and registered properties to the document and maps `:root`,
`html` and `body` to the frame's stand-ins. Frozen frames would go through it too.

Other things a frozen copy doesn't keep:

- Form values typed in, canvas drawings and video frames, which aren't in the DOM.
- Scroll positions inside the page.
- What only shows on hover or focus.

## Recommendation

How to build it into Parity, with the contracts and steps, is in [route-frames.md](route-frames.md) (PAR-1249).

Build it, in this order:

1. **Live frames from a pool.** Keep one or two hidden iframes of the app's page, loaded at a neutral route. On click,
   take one, have the app's router go to the route, and swap it in once it settles, with the frozen copy shown until
   then. Use each pooled frame once, so routes don't share state, and load a new one behind it. Going to a route needs
   each router's own call (`router.navigate` for TanStack Router). It belongs in the router extensions that already wrap
   each frame's router (PAR-1152).
2. **Frozen frames.** The frame copies its body and stylesheets and posts them to Parity, since it's on another site.
   Parity rebuilds them through the frame stylesheet pipeline. Keep each route's copy until its code changes.
3. **Pictures at a distance**, from the frozen copies, so a zoomed-out canvas of hundreds of routes doesn't hold
   hundreds of DOM trees.

## Still open

- Screens behind sign-in: frames need the app's session, and a pooled frame has to land there signed in.
- Component frames, which the guest mounts today rather than the app's page, need the same split: live in an iframe,
  frozen otherwise.
- Editing a live frame, and how a structure edit freezes it again.
- A production build, and Electron rather than Chrome. Both should be faster than dev, but weren't measured.
