# Window modules, canvas overlays, presence and sync for extensions

Status: draft for review. Follows PAR-1179 (the live room in development) and builds on
[developer-api.md](developer-api.md), whose `parity.canvas` overlays and canvas widgets this makes concrete.

Multiplayer should be an extension, `@parity-app/extension-multiplayer`, rather than code in the app. Today's API can't
carry it:

- An extension can't draw on the canvas.
- It can't see the camera or the pointer.
- It doesn't get the document's changes.
- It has no say in how a project opens.

This proposal adds what's missing as general capabilities. Comments, review links and agents can use the same ones
later.

## What a window module is

Today an extension's code runs in one place: a Node process of its own for each open project, started by the project
service. Everything it does reaches the window by messages, through the service.

A **window module** is a second entry point an extension can ship. It runs inside the project's window as a
[Web Worker](https://developer.mozilla.org/docs/Web/API/Web_Worker_API): a thread of its own beside the editor, with no
access to the page.

**Why an extension would want one:**
- **Speed.** A message between the editor and the worker stays in one process, under a millisecond. Cursors are sent
  60 times a second in both directions. A Node-only extension's messages would hop window → service → extension
  process and back, on each copy of the app.
- **The document's bytes stay short-haul.** The shared document lives in the window. Its updates go from the editor to
  the worker and out to the network, instead of through two other processes.
- **The browser's network.** It has `fetch`, `WebSocket` and `EventSource`.

**What it can't do, by design:**
- Touch the page, or put components into it.
- Read the window's globals, or reach Node.
- Freeze the editor, because it runs on its own thread.

Everything it shows is still data that Parity draws with its own kit. That keeps developer-api.md's rule that
extensions don't put React into the window.

**The two halves.** An extension can have a Node half, a window half, or both. They talk through `parity.window` and
`parity.host` (see "The two halves talk"). The multiplayer extension uses both:
- the window half holds the room, the cursors and the document's updates
- the Node half runs the room's relay server

**The alternative** is to put all of this in the Node half and send cursors through the service. It's simpler, since
there's no new kind of code. But it's slower, and every extension that draws live would pay for it. Window modules are
worth the cost when something has to follow a pointer.

## Where an extension draws on the canvas

Parity draws everything. The extension says what to draw and where. There are three ways to place something, so it
stays put as the person pans and zooms.

```
┌────────────────────────────────────── canvas ──────────────────────────────────────┐
│                                                     ┌──────────────────────────┐   │
│                                                     │ (A)(M)(+2)    ← corner   │   │  3. On the canvas's edge:
│   ┌──────── Dashboard ─────────┐                    └──────────────────────────┘   │     stays put while panning.
│   │ ┌────────┐   ╔═══════════╗ │ ← outline on a node, in Mia's color               │     The avatar stack, a
│   │ │        │   ║  Card     ║ │   with "Mia" on it                                │     banner.
│   │ └────────┘   ╚═══════════╝ │                                                   │
│   └────────────────────────────┘     ▲ Andrew      ← a pointer at a point          │  1. On a node: moves with
│                                       ┊┄┄┄┄┐                                       │     it. Outline, badge,
│                                       ┊ ghost of what Andrew drags, held at its    │     label, line, region.
│                                       └┄┄┄┄┘  offset from his pointer              │
│                                                                                    │  2. At a point on the page:
│                     ┏ ━ ━ ━ ━ ━ ┓  ← Mia's marquee, a rect                         │     moves with the page.
│                     ┗ ━ ━ ━ ━ ━ ┛                                                  │     Pointer, rect, ghost.
└────────────────────────────────────────────────────────────────────────────────────┘
```

1. **On a node** (`NodeRef`): it follows the node through moves, resizes and zoom. Some are kept at a size you can
   read, like a badge. Others scale with the node, like an outline. developer-api.md already planned these.
2. **At a point on the page**, in page coordinates: a pointer, a rect, a ghost.
   - Something can be **attached to another overlay**, so it moves with it. That's how a dragged ghost follows the
     dragging person's pointer, with only the pointer being sent.
3. **On the canvas's edge**, in a corner or along the bottom: it stays put while the person pans. It holds a
   declarative view, such as the avatar stack.
   - Its items run the extension's commands, as rows in a tab do. Clicking an avatar opens a small card with Follow and
     Go to.

Every overlay takes its color as one of the **palettes** agents use (Ember, Sky, Mint, …). People and agents then look
like one system, and the colors work in both themes. An extension can't give a raw color.

## Manifest changes

```ts
interface Manifest {
  // …as today…

  /**
   * The package export of its window module, as `./window`, whose module exports `activateWindow`. It runs as a Web
   * Worker in the window of each project the extension is active for.
   */
  window?: string
}

interface Permissions {
  // …as today…

  /** Whether it may read this person's pointer, gestures and camera, and show other people on the canvas. */
  presence?: boolean
  /** Whether it may share the project's document: open it from elsewhere, and send and take in its changes. */
  sync?: boolean
}

/**
 * New: starts the extension when one of its boolean settings is on, and stops it when it's turned off. Multiplayer
 * starts with `onSetting:multiplayer.liveRoom`, so people who never turn it on never run it.
 */
type ActivationEvent = /* …as today… */ `onSetting:${string}`

interface Contributions {
  // …as today…
  /** Places on the canvas's edge that its window module fills with a view. */
  canvasWidgets?: CanvasWidgetContribution[]
}

/** A place on the canvas's edge. Parity lays out several extensions' widgets in one corner side by side. */
interface CanvasWidgetContribution {
  id: string
  /** What screen readers call it. */
  title: string
  placement: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "bottom"
  view: "avatars"
}

/** The declarative views, with one new kind for people. */
type ViewKind = "table" | "tree" | "list" | "form" | "keyValue" | "avatars"
```

The multiplayer extension's manifest:

```jsonc
"parity": {
  "displayName": "Multiplayer",
  "prefix": "multiplayer",
  "main": "./dist/extension.js",
  "window": "./dist/window.js",
  "activates": ["onSetting:multiplayer.liveRoom"],
  "permissions": { "presence": true, "sync": true, "network": ["localhost"] },
  "contributes": {
    "settings": {
      "multiplayer.liveRoom": { "type": "boolean", "default": false, "scope": "app", "title": "Live room" },
      "multiplayer.server": { "type": "string", "default": "http://localhost:5390", "scope": "app", "title": "Room server" }
    },
    "canvasWidgets": [{ "id": "multiplayer.people", "title": "People here", "placement": "topRight", "view": "avatars" }],
    "commands": [
      { "id": "multiplayer.follow", "title": "Follow", "icon": "eye" },
      { "id": "multiplayer.goTo", "title": "Go to", "icon": "locate" }
    ]
  }
}
```

## The window module's API

```ts
/** What a window module exports. */
export interface WindowModule {
  /** What it returns is what its Node half calls through `parity.window.api`. */
  activateWindow(parity: WindowParity): void | ExtensionApi | Promise<void | ExtensionApi>
  deactivateWindow?(): void | Promise<void>
}

/**
 * What a window module gets. It has the Node half's reads (selection, settings) and things that only make sense in
 * the window: the canvas, the camera, presence and sync. Files, processes, providers and edits stay in the Node half.
 */
export interface WindowParity {
  readonly extension: ExtensionInfo
  readonly project: Project
  readonly subscriptions: Disposable[]
  readonly commands: Commands
  readonly selection: Selection
  readonly navigate: Navigate
  readonly settings: Settings
  readonly log: Log
  readonly views: Views & { avatars(id: string, options?: ViewOptions): View<AvatarItem> }
  readonly canvas: Canvas
  readonly camera: Camera
  /** Needs the `presence` permission. */
  readonly presence: Presence
  /** Needs the `sync` permission. */
  readonly sync: Sync
  /** Its own Node half, when it has one. */
  readonly host: HalfChannel
}
```

### `parity.canvas`: overlays

```ts
/** A point on the page, in page coordinates: what stays put as the person pans and zooms. */
export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  width: number
  height: number
}

/** One of the agents' palettes, by name. */
export type PaletteName =
  | "Ember" | "Sunset" | "Gold" | "Citrus" | "Mint" | "Lagoon"
  | "Sky" | "Aurora" | "Indigo" | "Orchid" | "Magenta" | "Rose"

/** Something drawn on the canvas. `update` changes what's given and leaves the rest; `dispose` takes it away. */
export interface Overlay<Options> extends Disposable {
  update(changes: Partial<Options>): void
}

/** Where a point overlay is: a point on the page, or held at an offset from another overlay, moving with it. */
export type Anchor = Point | { attachedTo: Overlay<unknown>; offset: Point }

export interface Canvas {
  // 1. On a node (developer-api.md's overlays).

  /** Outlines a node, with an optional name tag on its corner, as another person's selection. */
  outline(ref: NodeRef, options: OutlineOptions): Overlay<OutlineOptions>
  /** A small tag on a node's corner: a count, a time, a warning. It runs `command` on the node when clicked. */
  badge(ref: NodeRef, options: BadgeOptions): Overlay<BadgeOptions>
  /** Text beside a node. */
  label(ref: NodeRef, options: LabelOptions): Overlay<LabelOptions>
  /** A line between two nodes. */
  line(from: NodeRef, to: NodeRef, options: LineOptions): Overlay<LineOptions>
  /** Shades a node's area. */
  region(ref: NodeRef, options: RegionOptions): Overlay<RegionOptions>

  // 2. At a point on the page.

  /** A pointer with a name badge, drawn as agents' pointers are. */
  pointer(options: PointerOptions): Overlay<PointerOptions>
  /** A rectangle on the page, as another person's marquee. */
  rect(options: RectOptions): Overlay<RectOptions>
  /**
   * Faint copies of nodes, drawn as their outlines with their names, each at its own anchor: another person's drag in
   * progress, before the drop is written. `drop` draws where a layer would land in a layout. `dimSource` fades the
   * nodes where they are now.
   */
  ghost(items: { ref: NodeRef; at: Anchor }[], options: GhostOptions): Overlay<GhostOptions>
}

export interface OutlineOptions {
  palette: PaletteName
  label?: string
  dashed?: boolean
}

export interface BadgeOptions {
  text: string
  tone?: Tone
  palette?: PaletteName
  command?: string
}

export interface LabelOptions {
  text: string
  side?: "top" | "right" | "bottom" | "left"
}

export interface LineOptions {
  palette?: PaletteName
  dashed?: boolean
  label?: string
}

export interface RegionOptions {
  palette: PaletteName
  label?: string
}

export interface RectOptions {
  rect: Rect
  palette: PaletteName
  filled?: boolean
}

export interface PointerOptions {
  at: Anchor
  name: string
  palette: PaletteName
  /** A line under the name, as "Typing…" or "Viewing Dashboard". */
  detail?: string
  /** An image URL for the badge, as a person's avatar. Initials otherwise. */
  avatar?: string
  /**
   * When the person's pointer has left the canvas: the pointer stays where it was last, faded. When `away` goes back
   * to false with a new `at`, it glides there instead of jumping.
   */
  away?: boolean
  /**
   * How it gets from one `at` to the next. `glide` (the default) eases over a time that grows with the distance, from
   * 80 ms for a step to 400 ms across the screen, so updates a few frames apart look smooth. `jump` doesn't animate.
   */
  motion?: "glide" | "jump"
}

export interface GhostOptions {
  palette: PaletteName
  dimSource?: boolean
  /** Where a dragged layer would land: before the parent's child at `index`, drawn as the drop line Layers draws. */
  drop?: { parent: NodeRef; index: number }
}
```

**What Parity does with overlays:**
- It keeps them on their nodes and points while the person pans and zooms.
- It draws them above designs and below Parity's own selection and handles. They don't take clicks, except a badge
  with a command and the edge widgets.
- An overlay on a node that goes away goes away too.
- Updates in one frame are drawn together, once.

### Canvas widgets: the avatar stack

```ts
/** A person in an `avatars` view. */
export interface AvatarItem {
  key: string
  name: string
  palette: PaletteName
  avatar?: string
  /** A line under the name on their card, as "Viewing Dashboard · Dark mode". */
  detail?: string
  /** A mark on the avatar: away (faded), or a ring for the person you're following. */
  status?: "active" | "away" | "followed"
}
```

- Filled with `parity.views.avatars("multiplayer.people", { itemActions: [...] })`, as any view is.
- It shows up to four faces, then "+N".
- Clicking a face opens a card: their name and `detail`, then the `itemActions` as buttons. Each runs its command with
  `{ type: "item", view: "multiplayer.people", key }`.
- It's keyboard-reachable, and screen readers call it by its title.

### `parity.camera`

```ts
/** What the canvas shows: the part of the page in view. Windows differ in size, so it's a rect, not a zoom. */
export type CameraView = Rect

export interface Camera {
  get(): CameraView
  /** Told what's in view as it changes, at most once a frame. */
  onChange(listener: (view: CameraView) => void): Disposable
  /** Brings `view` into view, fitting it to this window. Animates unless `animate` is false. */
  show(view: CameraView, options?: { animate?: boolean }): Promise<void>
  /**
   * Follows someone: the canvas keeps showing what `update` gives. Parity draws a frame round the canvas in their
   * palette with "Following Mia · Esc to stop". It ends when the person presses Esc, pans or zooms themself, opens
   * another design, or the extension disposes it. Following someone else ends this.
   */
  follow(leader: { name: string; palette: PaletteName }, view: CameraView): Following
}

export interface Following extends Disposable {
  update(view: CameraView): void
  /** Told why it ended, once. */
  onEnd(listener: (why: "escape" | "panned" | "replaced" | "disposed") => void): Disposable
}
```

### `parity.presence`: what this person is doing

Presence is only about *this* person. Showing other people is the canvas overlays above. The extension decides what to
send and how. Core doesn't know about rooms.

```ts
export interface Presence {
  /** The person signed in, as others should see them. */
  readonly self: { name: string; avatar?: string }

  /**
   * Where the pointer is on the page, at most once a frame, with `over: false` once it leaves the canvas (its last
   * point is kept). Nothing while it's still.
   */
  onPointer(listener: (pointer: { at: Point; over: boolean }) => void): Disposable

  /** Told when a gesture starts, when what it would do changes, and when it ends. Not every frame: see `Gesture`. */
  onGesture(listener: (gesture: Gesture) => void): Disposable

  /** What this person is looking at: the design, and the state and mode it shows them. */
  onViewing(listener: (viewing: Viewing) => void): Disposable

  /** This copy's agents, as they work: each step the agent presence plays. */
  readonly agents: {
    onStep(listener: (steps: AgentStep[]) => void): Disposable
    /** Plays another copy's agent's steps here, with its pointer and badge, as this copy's agents are played. */
    play(steps: AgentStep[]): void
  }
}

/**
 * A gesture, as its targets and their offsets from the pointer when it starts. With the pointer sent on its own, the
 * other copy can draw a drag in progress (a ghost attached to that person's pointer) without positions per frame.
 */
export type Gesture =
  | {
      kind: "move"
      phase: "start" | "update" | "end" | "cancel"
      /** What moves, and where each is from the pointer: boards dragged by their title, or layers. */
      targets: { ref: NodeRef; offset: Point; size: { width: number; height: number } }[]
      /** Only for layers in a layout: where they'd land. An `update` comes when this changes. */
      drop?: { parent: NodeRef; index: number }
    }
  | { kind: "resize"; phase: "start" | "update" | "end" | "cancel"; ref: NodeRef; rect: Rect }
  | { kind: "marquee"; phase: "start" | "update" | "end" | "cancel"; rect: Rect }
  /** Typing in a text layer. The text itself arrives through the document, as it's typed. */
  | { kind: "text"; phase: "start" | "end"; ref: NodeRef }

export interface Viewing {
  design?: string
  state?: string
  mode?: string
}

/** One step of an agent's work, as the agent presence plays it, by node rather than by tab. */
export interface AgentStep {
  kind: "read" | "write" | "move" | "screenshot" | "measure" | "accessibility" | "problems" | "console" | "board" | "start" | "end"
  agent?: string
  agentId?: string
  label?: string
  ref?: NodeRef
  state?: string
  mode?: string
  from?: Point
  to?: Point
  error?: string
}
```

### `parity.sync`: sharing the document

The document stays in core: Loro, `ProjectDoc`, undo and saving. The extension is the room. It decides how the
document opens, carries its changes, and says whether this copy writes files.

```ts
export interface Sync {
  /** The format of the bytes it carries, as `loro/1`. The extension passes them on without reading them. */
  readonly format: string

  /**
   * Says how the project opens, before it does. Parity waits for the handler, up to 30 s, showing "Joining the live
   * room…", before opening the project's files. `{ from: "files" }` opens them as alone, so this copy starts the room;
   * `{ from: "snapshot" }` opens on another copy's. Rejecting opens from files with a warning. One handler per project.
   */
  onOpen(handler: () => Promise<{ from: "files" } | { from: "snapshot"; snapshot: Uint8Array }>): Disposable

  /** Told the bytes of each change made here, by the person, an agent or an extension, once it's committed. */
  onLocalChanges(listener: (bytes: Uint8Array) => void): Disposable

  /** Takes in another copy's change. Rejects for bytes the document can't take, changing nothing. */
  receive(bytes: Uint8Array): Promise<void>

  /** The whole document, for a copy that's joining. */
  snapshot(): Promise<Uint8Array>

  /**
   * Whether this copy writes the project's files. Only one copy in a room should: the one that started it, or the one
   * that takes over when it leaves. True until set.
   */
  setWritesFiles(writes: boolean): void

  /** Closes the project and opens it again through `onOpen`, as when the Live room setting changes. */
  reopen(): Promise<void>
}
```

**What core changes to make sync whole.** These are core's job whoever brings the room:
- token edits go through the provider
- typing writes as it's typed
- the state and mode each person sees stay their own (`onViewing` reports them; they're not synced)

### The two halves talk

```ts
/** In the window module: its Node half. */
export interface HalfChannel {
  /** What the Node half's `activate` returned. */
  readonly api: RemoteApi<ExtensionApi>
}

/** New in the Node half's `Parity`, as `parity.window`: its window half in the project's window. */
export interface WindowChannel {
  /** What the window half's `activateWindow` returned, once it has. */
  readonly api: RemoteApi<ExtensionApi> | undefined
  onReady(listener: () => void): Disposable
}
```

They call each other's API as `extensionDependencies` calls work today: JSON in, a promise of JSON out.

## How the multiplayer extension uses it

```ts
// window.ts: the room, in the project's window.
export function activateWindow(parity: WindowParity) {
  const room = joinRoom(parity.settings.get("multiplayer.server"), parity.project.root)
  const me = { name: parity.presence.self.name, palette: room.palette }

  // The document.
  parity.sync.onOpen(async () => (room.host === room.peer ? { from: "files" } : { from: "snapshot", snapshot: await room.askSnapshot() }))
  parity.sync.onLocalChanges((bytes) => room.send({ updates: [bytes] }))
  room.onUpdates((bytes) => parity.sync.receive(bytes))
  room.onSnapshotAsked((to) => parity.sync.snapshot().then((snapshot) => room.sendTo(to, { snapshot })))
  room.onHostChange(() => parity.sync.setWritesFiles(room.host === room.peer))

  // What I'm doing.
  parity.presence.onPointer((pointer) => room.send({ pointer }))
  parity.presence.onGesture((gesture) => room.send({ gesture }))
  parity.selection.onChange((selection) => room.send({ selection }))
  parity.camera.onChange((camera) => room.send({ camera }))
  parity.presence.onViewing((viewing) => room.send({ viewing }))
  parity.presence.agents.onStep((steps) => room.send({ agents: steps }))

  // Everyone else.
  const people = parity.views.avatars("multiplayer.people", {
    itemActions: [{ command: "multiplayer.follow" }, { command: "multiplayer.goTo" }]
  })

  room.onPerson((person) => {
    const pointer = person.overlays.pointer ??= parity.canvas.pointer({ at: person.pointer.at, name: person.name, palette: person.palette })
    pointer.update({ at: person.pointer.at, away: !person.pointer.over, detail: person.typing ? "Typing…" : undefined })
    person.syncOutlines((ref) => parity.canvas.outline(ref, { palette: person.palette, label: person.name }))
    person.syncGhost((gesture) =>
      parity.canvas.ghost(
        gesture.targets.map(({ ref, offset }) => ({ ref, at: { attachedTo: pointer, offset } })),
        { palette: person.palette, drop: gesture.drop }
      )
    )
    people.upsert({ key: person.id, name: person.name, palette: person.palette, detail: person.viewingLine })
    following?.leader === person.id && following.update(person.camera)
  })
  room.onAgentSteps((steps) => parity.presence.agents.play(steps))

  let following: (Following & { leader: string }) | undefined
  parity.commands.register("multiplayer.follow", (target) => {
    const person = room.person(target)
    following = Object.assign(parity.camera.follow(person, person.camera), { leader: person.id })
  })
  parity.commands.register("multiplayer.goTo", (target) => parity.camera.show(room.person(target).camera))
}

// extension.ts: the Node half runs the relay, so the first copy on a machine serves the others.
export function activate(parity: Parity) {
  return { ensureRelay: (port: number) => startRelay(port) }
}
```

## Messages and speed

- **One channel per worker.** Parity gives each window module one `MessagePort`. Every call and event on it is checked
  with zod at the boundary, as `protocol.ts` is.
- **Batched per frame.** Overlay updates from the worker are batched once a frame. Events to the worker are coalesced
  per frame, keeping only the latest pointer and camera.
- **Bytes move without copying.** Document bytes go as transferable `ArrayBuffer`s.
- **A budget.** A worker that sends more than a frame's worth of overlay updates has the extra dropped, oldest first.
  One that stops answering `onOpen` in time is warned about on the Extensions page, and the project opens from files.

## Trust and limits

- **Built-in extensions only** to start, as with providers today. Third-party window modules come with signing.
- **Shown on install.** `presence` and `sync` are listed with what they allow: "See where your pointer is and what
  you're doing on the canvas" and "Share this project's changes with other copies of Parity".
- **No overlay can cover Parity's own UI.** Widgets stay in their places on the canvas's edge, and each extension's
  overlays draw in a layer of its own.
- **Stopping an extension** removes its overlays and widgets. If it brought the room, its project reopens from files.

## Open questions

1. **Avatar stack: top-right of the canvas or the title bar?** This draft puts it on the canvas (`canvasWidgets`). The
   title bar would need a contribution of its own.
2. **Should people's pointers be core's?** Drawing every person the same way, with an `onPointer` stream and a
   `people.set` call, would need less from extensions. This draft keeps core's part to overlays, so comments and
   review links can use pointers and outlines too.
3. **Ghost fidelity.** This draft draws dragged boards and layers as outlines with their names. A live picture of the
   board moving would need the canvas to draw a node twice. That could come later.
4. **More than one window per project.** A project opens in one window today, so `parity.window` is one half. If a
   project can open in two, it becomes a list.
