# Proposal: what a project's code can do to Parity's window

Status: draft for discussion. Only stylesheets are handled (PAR-1187); nothing else here is built.

## In one line

A project's code runs in Parity's own window. Parity, not each extension, should decide what that code can reach. This
lists what it can reach today, what the renderer can contain where it is, and what would need the project's code in a
document of its own.

## Why it runs there

Frames are shadow roots in Parity's page, so the canvas can lay out, measure, select and edit what a project draws as
part of its own document. The guest module a project's builder serves is imported into that page, and the project's
React renders into each frame's shadow root. An iframe per frame would isolate each one fully, but each would cost a
document, a copy of the project's code and a React. So one realm holds Parity's code and every open project's code.

## What a project's code can do there

Each of these has been seen, or follows from code that projects commonly run:

| Reach                       | Example                                                                                                                                                                                                       | Today                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Stylesheets in the document | Vite's client, a bundler's runtime, CSS-in-JS, a library's own styles                                                                                                                                         | Contained: switched off in the page and drawn in frames (`page-styles.ts`)      |
| Reloading the window        | The project's Vite client is imported by its modules for hot updates. It reconnects to its server and calls `location.reload()` after a restart or a full-reload update, which reloads Parity's whole window. | Not contained                                                                   |
| Parity's own `<html>`       | A theme toggle such as `next-themes` or shadcn's sets the `dark` class or a `data-theme` on `document.documentElement`. Parity's theme is the `dark` class on that same element (`theme.ts`).                 | Not contained                                                                   |
| Window and document events  | A command palette's `keydown` listener on `document` hears Parity's keys; a `resize` listener measures Parity's window.                                                                                       | Viewport size given to the guest through mount options; listeners not contained |
| History and the address     | A router outside the frame's own router calls `history.pushState`.                                                                                                                                            | Each frame has a router of its own (PAR-1152); direct calls not contained       |
| Portals into the page       | Dialogs, popovers and menus portal into `document.body`, outside the frame's styles.                                                                                                                          | Moved into the frame for component previews only (`inline-portals.ts`)          |
| Globals and prototypes      | Polyfills patch built-ins; `customElements.define` takes a tag name for the whole page; code sets `window` properties.                                                                                        | Not contained                                                                   |
| Errors                      | An unhandled rejection in the project's code reaches the window's `error` and `unhandledrejection` handlers.                                                                                                  | The guest reports render errors per frame; others reach Parity's handlers       |
| The main thread             | A loop in a component's effect freezes Parity's interface with it.                                                                                                                                            | Not contained, and can't be while they share a thread                           |

## Option 1: contain it where it runs

The stylesheet boundary shows how. The renderer wraps a page API once, tells callers apart by the origin of the code
that called it (the first frame of the stack with an address), and redirects what another origin's code does. No
extension takes part. In order of the harm seen:

1. **Reloads.** `location.reload` can't be wrapped, but in Electron a `beforeunload` handler that returns a value
   cancels the unload without a dialog. Parity marks its own reloads, and cancels any other, logging which project
   asked.
2. **`<html>` and `<body>` attributes.** Wrap `setAttribute`, `removeAttribute`, `toggleAttribute` and `DOMTokenList`'s
   methods where the element is Parity's root or body, and send another origin's change to the body of that project's
   frames instead, where its theme classes belong.
3. **Window and document listeners.** Wrap `addEventListener` on `window` and `document`, and pass another origin's
   listener only events whose target is in that project's frames, or, for keys, only while focus is in one of them.
4. **History.** Wrap `pushState` and `replaceState`, and send another origin's calls to the frame's router, or drop
   them.
5. **Errors.** Mark an error whose stack starts in another origin's code as that project's, for its console and not
   Parity's crash reports.

What it can't do: give the project's code a window of its own size, keep its globals apart, or stop a frozen thread.
Each new reach is found by a project breaking something first.

## Option 2: a document for each project's code

Give each open project a hidden iframe on Parity's own origin (`about:blank`), import its guest module there, and have
it render into the frames in Parity's page, which a same-origin iframe's code can do. That's one realm per project, not
per frame. Its `window`, `document`, `location` and `history` are the iframe's: a reload, a theme class, a listener, a
`pushState` or a stylesheet in its head stay there, and Parity reads the iframe's stylesheets for frames as it does the
page's today. The iframe could have the size of the frame's window.

What it costs:

- **Portals and lookups miss.** `document.body` and `document.getElementById` are the iframe's, so a dialog portals into
  a document nobody sees unless the guest redirects portals into the frame for every mount, not just previews.
- **`instanceof` crosses realms.** The frames' elements belong to Parity's document, so `element instanceof HTMLElement`
  in the project's code is false. Libraries that read `node.ownerDocument.defaultView` work; others don't.
- **Every guest changes.** Each renderer's guest, decorators and the canvas's calls into it (`mount`, lookups, events)
  have to work across the two realms, and the end-to-end suite has to run with it.

## Recommendation

Take Option 1's first two items now. Every Vite project's modules bring its client, which can reload Parity's window,
and most shadcn projects have a theme toggle that would change Parity's theme. Keep the rest as it's met. Prototype
Option 2 on one renderer, with the fixtures that portal and use positioning libraries, before deciding whether to move
every guest to it. Its costs fall on every library a project uses, so it shouldn't be decided from a design alone.
