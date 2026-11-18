# Extensions in the window

Status: built, 2026-11-17 (PAR-1233). Every phase under [Tasks](#tasks) has landed: multiplayer and agent presence are
internal extensions, and how they work now is in [extensions.md](../extensions.md#internal-extensions-and-window-modules)
and [editor.md](../editor.md). External extensions' part, canvas overlays and web views (PAR-1099) and installing them
(PAR-1098), is still backlogged. It followed PAR-1179 (the live room in development), and changes
[developer-api.md](developer-api.md)'s "Drawing UI" for Parity's own extensions.

Multiplayer should be an extension, `@parity-app/extension-multiplayer`, rather than code in the app. So should agents'
pointers on the canvas, `@parity-app/extension-agent-presence`. Today's API can't carry either:

- An extension can't draw on the canvas.
- It can't see the camera or the pointer.
- It doesn't get the document's changes.
- It has no say in how a project opens.

**What this proposal is for: the foundation.** It's about getting multiplayer's hooks into core correctly, so features
can be built on them. Some things are out of scope for now:

- how people find and join a room
- when a project uses multiplayer
- where a room's work is saved

Those come later. For now, two copies on one machine joining a local room (as PAR-1179 does) is enough to build and test
against.

## Two tiers

|                      | **Internal extensions**: Parity's own, shipped in the app's build                                                     | **External extensions**: everyone else's                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Where code runs      | A **window module** in the project's tab, and optionally a Node half                                                  | A Node half, as today                                                                                       |
| UI                   | Their own React, drawn directly: on the canvas, in panels, pages and dialogs                                          | Places Parity draws: declarative views, canvas overlays, status items; web views in tabs, pages and dialogs |
| Components           | Parity's own: the kit (`@buildkitgg/shadcn-baseui-kit`), React, and Parity's workspace packages, shared, never copied | Whatever they bundle into a web view, themed by Parity's CSS variables                                      |
| The canvas           | Drawn on directly, in layers, with the camera and nodes' positions                                                    | Overlays attached to nodes, which Parity draws                                                              |
| What Parity promises | Nothing beyond the build they ship in: the API changes with the app, and they change with it                          | A versioned API with deprecation                                                                            |
| Trust                | The same as the app's own code                                                                                        | Sandboxed: their own process, and web views in frames                                                       |

**Why internal extensions can share everything.** They're built and released with the app, so they can't drift from the
kit, React or the canvas. That's how VS Code's Explorer and Source Control use its internal widgets.

**Why that still decouples.** A feature stops being code inside the canvas. It talks to the canvas only through
`WindowParity`:

- Its pointers, cards and frames are its own components in its own package.
- It can be turned off, replaced or rewritten without touching the canvas.
- Core keeps a smaller surface: layers, the camera, where nodes are, colors, previews, holds, presence events, the sync
  seam and agent activity.

**Why external extensions don't get the same.** Sharing the kit or React with code Parity doesn't ship would make every
prop of every component a promise. The kit is at 0.5, so every minor version can break. External extensions fill places
Parity draws, and draw anything else in sandboxed web views, bound to Parity only by its CSS variable names. They can't
be installed yet, so their part (overlays, web views, PAR-1099) is backlogged.

## Internal extensions: window modules

A **window module** is an entry point an internal extension ships. It's an ES module that Parity loads into each project
tab the extension is active for, on the main thread. It gets a `WindowParity` object, as the Node half gets `Parity`.

```ts
interface Manifest {
  // …as today…

  /** Marks one of Parity's own extensions. Refused unless the extension is in Parity's built-in list. */
  internal?: boolean
  /** The package export of its window module, as `./window`, whose module exports `activateWindow`. Internal only. */
  window?: string
  /**
   * What its window module may use, beyond the basics every window module gets. Internal only, and checked when the
   * manifest is read. See "Capabilities".
   */
  capabilities?: Capability[]
}
```

- **One list.** The built-in extensions are listed once, in `built-in-extensions.ts`. Both the Node host's list
  (`builtIns()`) and the window modules the app's Vite build compiles are generated from it, with a test that they
  match.
- **Shared, not bundled.** The app's build compiles window modules with the app, so they get one React, one kit and one
  theme. Each module is its own chunk, so its time on the main thread can be attributed to it.
- **The main thread, on purpose.** A window module renders real React into Parity's tree, with real popovers and focus,
  and reads the camera and node positions every frame without messages. Heavy work goes in a Web Worker it starts
  itself, or in its Node half.
- **Optional Node half.** An internal extension may have only a window module. Agent presence has only a window module.
  Multiplayer has both: the Node half runs the development relay.
- **`@internal` API.** What only internal extensions may use is marked `@internal` and exported from
  `@parity-app/extension-api/internal`. That entry point isn't in the published package.

### When a window module starts

How multiplayer gets turned on matters less for now than getting the order right, so features that build on it can count
on it.

**For each project tab:**

1. Internal extensions are found without detection. Only internal extensions may declare `detect: { always: true }`.
2. The tab reads the extensions' **app** settings, which don't need the project open.
3. The tab activates the window modules whose activation holds, and waits for each `activateWindow`. A module that
   brings the room registers `sync.onOpen` here.
4. If a module registered `onOpen`, core opens the project on the Loro provider and waits for the handler (see
   `parity.sync`). Otherwise it opens on the local provider, as today.
5. The document opens. Calls a module made to `sync` before this point (`receive`, `snapshot`) wait until it's open.
   Changes and requests from the room are buffered in the meantime.

**Activation events,** added to `ActivationEvent` and evaluated in the window:

- `onSetting:<key>`: active while one of its boolean app settings is on. Multiplayer uses
  `onSetting:multiplayer.liveRoom` for now, an app setting so it's known before the project opens. Turning it on or off
  reopens the project.
- `onStartup`: active in every project tab. Agent presence used this until it gained its switch (PAR-1274); it now uses
  `onSetting:agentPresence.show`, an app setting that starts on, so it's still listening before the first agent step.
  It's cheap until an agent works.

**Who brings the room.** A manifest that brings the room says so with `"contributes": { "sync": true }`. Two enabled
extensions that both say so are refused when the manifests are read, so there's never a second `onOpen`.

**One window, several projects.** A window holds a tab for each open project, and hidden tabs stay mounted (`App.tsx`
mounts a `ProjectView` per tab). So:

- each activation, and each `WindowParity`, belongs to one project tab
- a window module keeps no state at module level
- layers and `useFrame` pause while their tab is hidden
- colors are claimed per tab

### Capabilities

Window modules declare what they use, as external extensions declare permissions. Internal extensions are trusted, so
this isn't for security. It's so Parity:

- skips work nobody uses, such as collecting pointer events when no module listens
- refuses a second room
- shows on the Extensions page what each built-in extension does

It's lower priority than the rest, and can land after the APIs.

```ts
/**
 * - `canvas`: layers, boxes, hits and previews.
 * - `camera`: reading and moving the camera, and following.
 * - `presence`: this person's pointer, gestures and what they're viewing.
 * - `sync`: bringing the room; requires `contributes.sync`.
 * - `agents`: watching agents' activity, and passing on other copies'.
 * - `hold`: holding boards while an agent moves them.
 */
type Capability = "canvas" | "camera" | "presence" | "sync" | "agents" | "hold"
```

Every window module gets `render`, `colors`, `settings`, `log`, `commands`, `selection` and `navigate` without asking. A
module that calls something it didn't declare gets a clear error naming the missing capability.

## The window module and its Node half

An internal extension's two halves are one extension. They activate together, stop together, and call each other through
typed APIs.

### The contract

```ts
/** What a window module exports. */
export interface WindowModule<WindowApi extends object = object, ForNode extends ExtensionApi = ExtensionApi> {
  /**
   * Called once per project tab. What it returns:
   * - `window`: called directly by other window modules in the same tab, with any values, including functions.
   * - `node`: called by its own Node half, across processes, so JSON in and JSON out.
   */
  activateWindow(parity: WindowParity): Activated<WindowApi, ForNode> | Promise<Activated<WindowApi, ForNode>>
  /** Called before it stops, after everything in `parity.subscriptions` has been disposed. */
  deactivateWindow?(): void | Promise<void>
}

export interface Activated<WindowApi extends object, ForNode extends ExtensionApi> {
  window?: WindowApi
  node?: ForNode
}

/** In the window module: its own Node half. */
export interface HostLink {
  /** What the Node half's `activate` returned, typed by the caller. Calls go across processes. */
  api<Api extends ExtensionApi>(): RemoteApi<Api>
  /** The Node half's state now, and as it changes. */
  readonly state: HalfState
  onStateChange(listener: (state: HalfState) => void): Disposable
}

/** @internal In the Node half's `Parity`, as `parity.window`: its window module in each project tab. */
export interface WindowLink {
  /** What each tab's window module returned as `node`, by tab. A project is open in at most one tab. */
  api<Api extends ExtensionApi>(): RemoteApi<Api> | undefined
  readonly state: HalfState
  onStateChange(listener: (state: HalfState) => void): Disposable
}

/** Where the other half is. */
export type HalfState = "starting" | "ready" | "restarting" | "stopped"

/** A call to the other half while it isn't `ready`. */
export class HalfUnavailableError extends Error {
  readonly state: Exclude<HalfState, "ready">
}

/** Another internal extension's window module in the same tab, by `extensionDependencies`. */
export interface OtherWindowModule<Api extends object> {
  id: string
  /** Undefined while that extension is off. Window dependencies are optional: see below. */
  readonly api: Api | undefined
  onAvailable(listener: (api: Api) => void): Disposable
  onGone(listener: () => void): Disposable
}
```

### How the halves live together

| What happens                     | Window module                                                                                                     | Node half                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The extension activates in a tab | Loads and runs `activateWindow`. `host.state` is `starting` until the Node half is ready                          | Starts if it isn't running, and runs `activate` once for the project                                                 |
| Both are ready                   | `host.state` becomes `ready`                                                                                      | `window.state` becomes `ready`                                                                                       |
| The Node half crashes            | `host.state` becomes `restarting`, and calls reject with `HalfUnavailableError`. It keeps working on its own      | Restarts, as a Node host does today. After three crashes in a row it stops, and the window module is deactivated too |
| The window module throws         | Counted (see "Trust and limits"). After five failures it's stopped with "Multiplayer stopped working in this tab" | `window.state` becomes `stopped`, and calls reject                                                                   |
| The tab closes                   | `deactivateWindow` runs                                                                                           | `window.state` becomes `stopped`. It keeps running for other tabs                                                    |
| The extension is turned off      | Deactivated in every tab                                                                                          | Deactivated and stopped                                                                                              |

- **Calls to a half that isn't ready reject at once.** They aren't queued, because a queued call can arrive long after
  it makes sense.
- **The Node half sees a window module's API only through `node`**, JSON across processes, as `extensionDependencies`
  APIs work today.
- **Window modules call each other directly**, through `window`, with any values. That's only possible because they run
  in the same tab.

### Window dependencies are optional

An extension that names another in `extensionDependencies` gets it through `parity.extensions.get(id)`, an
`OtherWindowModule`:

- It doesn't force the other on, and it isn't stopped when the other is off.
- It reacts when the other comes and goes.

That keeps features independent. Neither of this proposal's two extensions depends on the other at all (see "Agents in a
room").

### An example

```ts
// window.tsx
export const activateWindow: WindowModule<{}, MultiplayerForNode>["activateWindow"] = (parity) => {
  parity.host.onStateChange((state) => parity.log.info(`relay host: ${state}`))

  const relay = async () => {
    try {
      return await parity.host.api<RelayApi>().ensureRelay(parity.settings.get<number>("multiplayer.port"))
    } catch (error) {
      if (error instanceof HalfUnavailableError) return undefined
      throw error
    }
  }

  // …
  return { node: { status: () => ({ peers: room.peers.length }) } }
}

// extension.ts, the Node half
export function activate(parity: Parity): RelayApi {
  return { ensureRelay: (port: number) => startRelay(port) }
}

interface RelayApi extends ExtensionApi {
  ensureRelay(port: number): Promise<"started" | "shared">
}

interface MultiplayerForNode extends ExtensionApi {
  status(): { peers: number }
}
```

## `WindowParity`

```ts
/**
 * What a window module gets, for one project tab. It has the Node half's reads (selection, settings, navigation) and
 * what only makes sense in the window. Files, processes, providers and edits stay in the Node half.
 */
export interface WindowParity {
  readonly extension: ExtensionInfo
  readonly project: Project
  /** The project tab it runs in. */
  readonly tab: string
  readonly subscriptions: Disposable[]
  readonly commands: Commands
  readonly selection: Selection
  readonly navigate: Navigate
  readonly settings: Settings
  readonly log: Log
  readonly render: Render
  readonly colors: Colors
  /** `canvas` capability; `camera` for `canvas.camera`; `hold` for `canvas.hold`. */
  readonly canvas: CanvasSurface
  /** `presence` capability. */
  readonly presence: Presence
  /** `sync` capability. */
  readonly sync: Sync
  /** `agents` capability. */
  readonly agents: Agents
  readonly host: HostLink
  readonly extensions: { get<Api extends object>(id: string): OtherWindowModule<Api> }
}
```

## `parity.canvas`: drawing on the canvas

The canvas gives an internal extension **layers**: React subtrees laid over the canvas that Parity keeps in step with
the camera. The extension draws anything there with its own components.

```
                 ┌─────────────────────────────── canvas ────────────────────────────────┐
  edge           │                                                  ┌──────────────┐     │
  (screen)  ─────┼──────────────────────────────────────────────────│ (A)(M)(+2)   │     │  the avatar stack,
                 │                                                  └──────────────┘     │  the follow frame
  overSelection  │   ┌──────── Dashboard ─────────┐                                      │
  (page)    ─────┼───│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │ ─ ─ ─  ▲ Andrew                      │  pointers, badges
                 │   │              ╔═══════════╗ │                                      │
  overDesigns    │   │              ║  Card  Mia║ │        Parity's selection and        │  other people's
  (page)    ─────┼───│──────────────╚═══════════╝ │        handles sit between these     │  outlines, scans
                 │   └────────────────────────────┘                                      │
  underDesigns   │                                                                       │  shading behind
  (page)    ─────┼───────────────────────────────────────────────────────────────────────│  boards
                 └───────────────────────────────────────────────────────────────────────┘
```

**Where each layer lives.** Layers are React portals inside the project tab's own subtree, so Parity's theme, kit
providers and portals reach them. Each has an error boundary of its own.

| Order           | DOM host                                                                | Moves with                                                    |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `underDesigns`  | tldraw's background slot, under the shapes                              | The page: Parity applies the camera's transform               |
| `overDesigns`   | `OnTheCanvas`, above the shapes and frames, below Parity's own overlays | The page                                                      |
| `overSelection` | Above Parity's selection, hover outlines and handles                    | The page                                                      |
| `edge`          | The canvas area's in-front layer, kept clear of the toolbar and panels  | Nothing: screen space, placed in a corner or along the bottom |

```ts
import type { ReactNode } from "react"

export interface CanvasSurface {
  /**
   * Draws `children` in a layer over the canvas. In `page` space, children are placed in page coordinates; to keep
   * something the same size on screen, scale it by `1 / zoom`. Layers don't take the pointer unless an element inside
   * asks with `data-canvas-interactive`. Parity's own selection and handles always stay usable.
   */
  layer(options: LayerOptions, children: ReactNode): Disposable

  /** `camera` capability. */
  readonly camera: Camera

  /** Where something is on the page, or why it isn't there. See `BoxOf`. */
  box(ref: NodeRef, options?: BoxOptions): BoxResult
  /** Told when that box changes: moved, resized, redrawn, gone to sleep or woken. Not for panning: boxes are on the page. */
  onBoxChange(ref: NodeRef, listener: (box: BoxResult) => void, options?: BoxOptions): Disposable
  /** What's under a point on the page: the design, and the deepest node of it there. */
  hit(at: Point): { design: string; node?: string } | undefined

  pageToScreen(at: Point): Point
  screenToPage(at: Point): Point

  /** Shows nodes another person is dragging, moving as they do, without writing anything. See "Previews". */
  preview(items: PreviewItem[], options?: PreviewOptions): Preview

  /** `hold` capability. Holds a board where it is while an agent moves it. See "Holds". */
  hold(design: string, at: Point): Held
}

/** A layer: on the page, in one of three orders, or on the screen at the canvas's edge. */
export type LayerOptions =
  | { id: string; space: "page"; order: "underDesigns" | "overDesigns" | "overSelection"; hideWhileEditing?: boolean }
  | {
      id: string
      space: "screen"
      order: "edge"
      placement: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "bottom"
    }

export interface Point {
  x: number
  y: number
}
export interface Rect extends Point {
  width: number
  height: number
}

export interface BoxOptions {
  /** What to measure: the board around a design, the frame a state and mode draws in, or a node in that frame. */
  in?: "board" | "frame" | "node"
  /** Which frame. When none matches both, a frame in `mode` is used, then the primary frame, as the agent presence does today. */
  state?: string
  mode?: string
}

export type BoxResult =
  /** Drawn: its box on the page, its corner radius in page units, and its laid-out size in design pixels. */
  | { kind: "drawn"; box: Rect; radius: number; size: { width: number; height: number } }
  /** Its frame is asleep (scrolled far away or culled): the frame's box, so something can still point at it. */
  | { kind: "asleep"; frame: Rect }
  /** Not on the canvas. */
  | { kind: "missing" }
```

**Hooks for what's drawn in a layer** come from `@parity-app/canvas-layer` and read the layer's context:

```ts
/** The camera now: `zoom`, and what's in view. Re-renders at most once a frame. */
export function useCamera(): { zoom: number; view: Rect }
/** A box, re-rendering as it changes. */
export function useBox(ref: NodeRef, options?: BoxOptions): BoxResult
/** A color, by key, claimed for this tab while mounted. */
export function useColor(key: ColorKey): Palette
/**
 * Runs once per animation frame while mounted and the tab is visible, inside the canvas's overlay scheduler: `measure`
 * reads layout first, then `draw` writes. For anything that moves every frame, write a transform in `draw` instead of
 * re-rendering.
 */
export function useFrame(frame: { measure?: () => void; draw: (dt: number) => void }): void
```

### Previews

A preview shows nodes another person is dragging, moving with their pointer, as close to what they see as Parity can
draw. Nothing is saved or put in undo.

```ts
/** A node in a preview: following a point on the page, keeping its size, or set to a rect, as in a resize. */
export type PreviewItem =
  | { ref: NodeRef; at: Point; state?: string; mode?: string }
  | { ref: NodeRef; rect: Rect; state?: string; mode?: string }

export interface PreviewOptions {
  /** Where dragged layers would land: before the parent's child at `index`, in the frame of `state` and `mode`. */
  drop?: { parent: NodeRef; index: number; state?: string; mode?: string }
  /** The person dragging, for the outline round the moving nodes. */
  color: ColorKey
  label?: string
}

export interface Preview extends Disposable {
  /** Moves the items, at most once a frame. */
  update(items: PreviewItem[], options?: Partial<PreviewOptions>): void
  /**
   * Settles when the covering write arrives: the document change whose origin is the person's drop. If none comes
   * within 2 s, it's disposed anyway.
   */
  settleOnWrite(): void
}
```

**What each kind of node does.** Local drags already have the look a preview reuses: the lift, carry and settle from
PAR-1199 (#741), drawn by `DragLift`, `CarriedPicture` / `DragPicture` and `LandingSpot`, with the timing in
`drag-motion.ts`. A preview draws the same pieces from another copy's gesture, in that person's color:

| Node                       | The person dragging sees                                                                                                                                           | Another copy's preview shows                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A board                    | It lifts and moves; the drag writes its position each frame in a gesture (`CanvasEditor`'s translate handler)                                                      | It lifts and moves with their pointer. The board's tldraw shape is moved locally with history ignored, as `ContainerUtil`'s title drag places it, and doesn't write to the document |
| A layer in a layout        | It lifts; the spot it left shows an empty dashed outline, a `LandingSpot` marks where it would land, and its picture is carried with the pointer (`layer-drag.ts`) | The same: the empty outline where it was, a landing spot at `drop`, and its picture carried with their pointer                                                                      |
| An absolutely placed layer | It lifts and moves through a style preview, and the drag writes as it goes                                                                                         | Its picture is carried with their pointer. The receiver never writes; the sender's writes arrive through the document                                                               |

When the drop's write arrives, the preview settles with the same motion a local drop uses, so both copies see one
landing.

**Several at once.** Today there's one carried picture, one preview stylesheet and one record of what a style preview
wrote, because only one person drags at a time. Previews need one of each per preview, keyed by the preview, so two
people can drag at once and a person can drag while seeing someone else's. That's new work in `layer-drag.ts`,
`carried.ts`, `getDragView` and `StylePreview`, and it's budgeted in the tasks.

### Holds

When an agent moves a board, the agent presence holds the board where it was, then glides it to where the agent put it,
so it doesn't jump. Today `held-boards.ts` does this, and `CanvasEditor` reads it in three places. It stays in core as
`canvas.hold`, because:

- the agent's write arrives before the animation can start
- core's write from shapes to the document has to skip held boards

```ts
export interface Held extends Disposable {
  /** Moves the held board, at most once a frame. */
  update(at: Point): void
  /** Lets go: the board shows where the document says. Disposing does the same. */
  release(): void
}
```

- **Before the write.** Agent activity is delivered before the write it describes is applied (see the event tables), so
  a hold starts first and the board never flashes in its new place.
- **Skipped.** Core doesn't write a held or previewed board's shape back to the document.
- **Let go.** A hold is let go after 10 s whatever happens. If the person grabs a held board, the hold is let go and the
  person's drag wins.

### `parity.canvas.camera`

```ts
/** What the canvas shows: the part of the page in view. Windows differ in size, so it's a rect, not a zoom. */
export type CameraView = Rect

export interface Camera {
  get(): CameraView
  onChange(listener: (view: CameraView) => void): Disposable
  /** Brings `view` into view, fitting it to this window, within the canvas's zoom limits. Animates unless `animate` is false. */
  show(view: CameraView, options?: { animate?: boolean }): Promise<void>
  /**
   * Keeps showing what `update` gives, until it ends. The person's own input ends it: Esc, a wheel or trackpad pan or
   * zoom, a drag on empty canvas, or opening another design. Following's own camera moves are tagged, so they never
   * end it. Parity draws nothing for it; the extension draws its own frame and banner.
   */
  follow(view: CameraView): Following
}

export interface Following extends Disposable {
  update(view: CameraView): void
  onEnd(listener: (why: "escape" | "panned" | "zoomed" | "navigated" | "replaced" | "disposed") => void): Disposable
}
```

### `parity.render`: panels, pages and dialogs

```ts
/** Where an internal extension's React goes outside the canvas. */
export type Place =
  /** A tab, Design tab section or page whose manifest `view` is `react`. */
  | { view: string }
  /** A dialog, titled and sized by Parity. */
  | { dialog: { title: string; width?: "small" | "medium" | "large" } }

export interface Render {
  (place: Place, children: ReactNode): Placed
}

export interface Placed extends Disposable {
  /** Told when the person closes it, as a dialog with Esc. */
  onClose(listener: () => void): Disposable
}
```

`ViewKind` gains `"react"`, for internal extensions only.

## `parity.colors`: colors for people and agents

People and agents share one set of colors, so they look like one system and work in both themes. There are only 12
palettes today, which a room with a few people each running agents uses up fast. Colors must never run out, so the set
is a list that goes on as far as it's asked to:

- **Hand-tuned first.** The first palettes are designed by hand: today's 12, plus about 12 more filling the gaps in hue
  between them, with a lighter and a deeper step where hues are far apart.
- **Generated after.** Past the hand-tuned ones, `palette(n)` makes palette `n` when it's first asked for:
  - its hue comes from a golden-angle sequence in OKLCH, skipping hues too close to the hand-tuned ones, at a fixed
    lightness and chroma per theme
  - its gradient stops sit either side of that hue, as the hand-tuned ones do
  - its ink is whichever of dark or light passes the contrast check against it
- **The same everywhere.** Generation is a pure function of `n`, so every copy makes the same palette for the same
  number, and the room only has to send numbers.
- **Further apart is better.** Colors handed out later are closer to ones already in use. Names on badges tell people
  apart once there are many.
- **Designed first.** Both the hand-tuned set and the generator are designed in Storybook before they're built
  (`Parity/Multiplayer/Colors`), each palette with a contrast check for its badge text in both themes.

**Keys, not colors.** Extensions pass a `ColorKey`, never a color. Keys must be unique across copies of a room: a person
by their peer id, an agent as `${peer}:${agentId}`.

**Within one copy,** `claim` gives a key the lowest-numbered palette no other key in the tab holds. There's always one,
so a claim never fails. A key keeps its color while it's claimed, and a released number is handed out again first.

**Across copies,** the same person should be the same color for everyone. Claiming in each copy can't promise that,
since each copy claims in its own order. So the room decides:

- The extension that brings the room numbers its members and their agents, and sends the numbers with presence.
- Each copy applies them with `colors.assign(key, n)`.
- `claim` respects assigned numbers and gives other keys the lowest free one.
- Without a room, `claim` is all there is.

```ts
/** Whose color something is: a person's peer id, or `${peer}:${agentId}` for an agent. */
export type ColorKey = string

export interface Colors {
  /** The palette for `key`: its assigned one, or the lowest-numbered one no other key in this tab holds. Never fails. */
  claim(key: ColorKey): Palette
  /** Gives `key`'s color back, when its person or agent has gone. */
  release(key: ColorKey): void
  /** Sets `key`'s palette by number, as the room decided. It wins over a claim. */
  assign(key: ColorKey, n: number): void
  /** Palette `n`: hand-tuned below `tuned`, generated from `n` above it. The same in every copy. */
  palette(n: number): Palette
  /** How many palettes are hand-tuned. */
  readonly tuned: number
}

/** A gradient for pointers, a solid color for outlines, and the ink that reads on it. */
export interface Palette {
  /** Its number in the list. */
  n: number
  /** A hand-tuned palette's name, as `Ember`; a generated one's is its hue, as `Hue 137`. */
  name: string
  stops: [string, string, string]
  color: string
  ink: string
}
```

Claims are counted per extension and released when it stops. `@parity-app/presence-ui`'s components take a resolved
`Palette`, so where a color comes from stays visible: in a layer, `useColor(key)`.

## `parity.presence`: what this person is doing

Only about this person. Showing other people is the extension's job, in its layers.

```ts
export interface Presence {
  /** The person signed in, as others should see them. */
  readonly self: { name: string; avatar?: string }
  onPointer(listener: (pointer: { at: Point; over: boolean }) => void): Disposable
  onGesture(listener: (gesture: Gesture) => void): Disposable
  onViewing(listener: (viewing: Viewing) => void): Disposable
}

/** Where a gesture's nodes are drawn: which design's frame, by state and mode. */
export interface InFrame {
  state?: string
  mode?: string
}

export type Gesture =
  | {
      kind: "move"
      phase: "start" | "drop" | "end" | "cancel"
      /** What moves, where each is from the pointer, and which frame it's in. */
      targets: (InFrame & { ref: NodeRef; offset: Point; size: { width: number; height: number } })[]
      /** Only for layers in a layout: where they'd land. A `drop` event comes each time this changes. */
      drop?: InFrame & { parent: NodeRef; index: number }
    }
  | {
      kind: "resize"
      phase: "start" | "end" | "cancel"
      ref: NodeRef
      frame?: InFrame
      /** The handle, and the box when the gesture started. The rest follows the pointer. */
      handle: "top" | "right" | "bottom" | "left" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
      from: Rect
    }
  | { kind: "marquee"; phase: "start" | "end" | "cancel"; from: Point }
  | {
      kind: "text"
      phase: "start" | "caret" | "end"
      ref: NodeRef
      frame?: InFrame
      caret?: { anchor: number; focus: number }
    }

export interface Viewing {
  design?: string
  state?: string
  mode?: string
}
```

A gesture says what it's doing and where it started. How it goes on is worked out from the pointer: a resize's box, a
marquee's rect, a moved node's place. So nothing in a gesture is sent every frame except the pointer itself.

## `parity.sync`: sharing the document

The document stays in core: Loro, `ProjectDoc`, undo and saving. The extension brings the room. It decides how the
document opens, carries its changes, and says whether this copy writes files.

```ts
export interface Sync {
  /** The format of the bytes it carries, as `loro/1`. The extension passes them on without reading them. */
  readonly format: string

  /**
   * Says how the project opens, before it does. Core waits up to 30 s, showing "Joining the live room…".
   * - `{ from: "files" }` opens the project's files and starts a new document, with a new lineage. This copy writes
   *   files.
   * - `{ from: "snapshot" }` opens on another copy's document, keeping its lineage. This copy doesn't write files until
   *   told to.
   * If the handler rejects or takes too long, the project opens from files, alone: sync is detached until `reopen()`.
   */
  onOpen(handler: () => Promise<OpenFrom>): Disposable

  /** The document's lineage: an id every copy that shares it has. */
  readonly lineage: string

  /**
   * Told the bytes of every change committed here, in order, none dropped: the person's, an agent's, an extension's,
   * repairs, and files reloaded from disk.
   */
  onLocalChanges(listener: (bytes: Uint8Array) => void): Disposable

  /**
   * Takes in another copy's changes. Calls apply in the order made. `pending` is true when some of the bytes need
   * changes this copy hasn't got yet; it keeps them and applies them when the gap is filled (`changesSince`).
   * Rejects with `LineageError` for bytes from another lineage.
   */
  receive(bytes: Uint8Array): Promise<{ pending: boolean }>

  /** This copy's version: what it has of the document, to compare with another copy's. */
  version(): Uint8Array
  /** The changes another copy at `version` is missing. */
  changesSince(version: Uint8Array): Uint8Array
  /** The whole document, for a copy that's joining. */
  snapshot(): Promise<Uint8Array>

  /** Whether this copy writes the project's files. See "Saving in a room". */
  setWritesFiles(writes: boolean): Promise<void>
  readonly writesFiles: boolean

  /** Closes the project and opens it again through `onOpen`. */
  reopen(): Promise<void>
}

export type OpenFrom = { from: "files" } | { from: "snapshot"; snapshot: Uint8Array; lineage: string }

export class LineageError extends Error {}
```

**Catching up.** A copy that reconnects, or whose `receive` reports `pending`, sends its `version()` to another copy.
That copy answers with `changesSince(version)`. The multiplayer example does this on reconnect.

### Saving in a room

Today a change from another copy is marked as not to be written (`persist: false`, because `notWritten` holds `"remote"`
in `project-doc.ts`). The saver then treats it as already in the files (`saver.ts`'s `take`). In a room that means:

- the copy that writes files never writes other people's edits
- a copy that doesn't write files still records them as saved, so a copy that takes over writing has nothing to save

**The fix, in core:**

1. **Two kinds of "not ours to write".** A change records where its content already is:
   - `written: "files"` for changes read from disk (`file`, `code`)
   - `written: "no"` for changes from another copy The saver records a file as saved only after it has actually written
     it, or after the change came from disk.
2. **The copy that writes files** treats changes from other copies like its own. They're unsaved until it writes them,
   and autosave writes them on its usual delay.
3. **A copy that doesn't write files** never records anything as saved. Its "unsaved" state shows "Saved by the room"
   instead of a count, and its own Save does nothing but say so.
4. **Taking over.** `setWritesFiles(true)` compares every file with what this copy last knows was written. It writes
   each that differs, then resolves. It also writes the stylesheet if tokens differ.
5. **Letting go.** `setWritesFiles(false)` waits for writes in flight to finish, then stops.
6. **Who writes, while there's no real room.** The copy that started the room writes, and when it leaves, the copy that
   takes over as host does. Where a room's work should be saved in the end is a later decision.

**Files changed on disk.** Only the copy that writes files takes in files changed on disk: it reloads them, and the
reload goes to the room as a change like any other. Other copies ignore changes on their own disk while in a room, since
the room's document is the truth, and say so once.

**Tokens.** Token edits go through the provider today only locally: `ProjectDoc` leaves `setTokens` out of what it
sends, and the Loro backend has no tokens. They move into a Loro container, so they sync. Only the copy that writes
files writes the stylesheet.

**State and mode are shared.** Which state and mode a design shows is a `view` field on the design, saved in the file.
In a room it syncs like any other edit: picking a state or turning a mode on shows it in every copy, and the copy that
writes files saves it (PAR-1231, #770). Removing a mode takes it off every board in every copy. A person who wants to
look at another state without changing it for everyone does so through presence (`InFrame` on their gesture and
`onViewing`), not by changing `view`.

**Live text.** Typing writes as it's typed:

- one undo step per pause, rather than one per key
- the caret is moved through other copies' changes before the next local write, so it stays where the person is typing
- the `text` gesture carries the caret, so others can see where someone is typing

### When the room goes away

Stopping or crashing the extension that brings the room doesn't lose anything:

- The document stays open, in memory, with its undo history.
- Core moves the project to the local provider and makes this copy write files (`setWritesFiles(true)`), saving
  everything that differs.
- A toast says "Left the live room. Your copy has every change and is saved."
- The project doesn't reopen from files, since that would throw away edits the host hadn't written yet.

## `parity.agents`: agents' activity

The agent API (`parity run`, MCP) stays in core. Core reports what agents do, and takes in what agents in other copies
do.

```ts
export interface Agents {
  /**
   * Told each step of every agent working in this project: this copy's (no `from`), and other copies' passed in with
   * `receive` (their `from`). This copy's steps come before the write they describe is applied.
   */
  onActivity(listener: (steps: AgentStep[], from?: string) => void): Disposable
  /** Passes on another copy's agent steps, from the copy `from`. Core reports them through `onActivity`. */
  receive(steps: AgentStep[], options: { from: string }): void
}

/** One step of an agent's work. */
export interface AgentStep {
  kind:
    | "read"
    | "write"
    | "move"
    | "screenshot"
    | "measure"
    | "accessibility"
    | "problems"
    | "console"
    | "board"
    | "start"
    | "end"
  /** The agent's id, unique in its copy. With `from`, it's unique in the room. */
  agentId: string
  agent?: string
  label?: string
  /** What it works on: a design (`owner: "design"`, its key) for a board, or a layer (`designKey/layerId`). */
  ref?: NodeRef
  state?: string
  mode?: string
  from?: Point
  to?: Point
  error?: string
}
```

Today's `PresenceEvent` maps across like this:

- `design` and `node` become `ref`
- `tab` goes, because a window module already belongs to its tab
- `agentId` is required

### Agents in a room

Agent presence and multiplayer are separate extensions, and neither needs the other. They meet only through
`parity.agents` in core:

- **Agent presence** listens to `onActivity` and draws every agent it hears of, from this copy or another.
- **Multiplayer** sends this copy's steps (those without `from`) to the room, and hands steps from the room to
  `receive`.

| Enabled             | What happens                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Both                | An agent working in any copy is drawn in every copy, each agent with the color the room assigned it                         |
| Agent presence only | This copy's agents are drawn, as today                                                                                      |
| Multiplayer only    | The room works without agent pointers. This copy's steps still go to the room, so copies that have agent presence draw them |
| Neither             | Agents work, as with any extension off, without being drawn                                                                 |

**No echo.** `onActivity` reports received steps with their `from`, and multiplayer sends only steps without one, so a
step is never sent back to the room.

## The event and call tables

How often things happen, in what order, and what's dropped.

### Events Parity sends to window modules

| Event                 | When                                                          | Rate                          | Order and loss                                                     |
| --------------------- | ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `presence.onPointer`  | The pointer moves over the canvas, or leaves it               | At most once a frame          | The latest per frame; leaving (`over: false`) is never dropped     |
| `presence.onGesture`  | A gesture starts, its drop target changes, it ends or cancels | On each of those              | Every one, in order                                                |
| `presence.onViewing`  | The design, state or mode this person sees changes            | On each change                | Every one, in order                                                |
| `selection.onChange`  | The selection changes                                         | On each change                | Every one, in order                                                |
| `camera.onChange`     | The camera moves                                              | At most once a frame          | The latest per frame                                               |
| `canvas.onBoxChange`  | A node moves, resizes, redraws, sleeps or wakes               | At most once a frame per node | The latest per frame                                               |
| `sync.onLocalChanges` | A change is committed here                                    | On each commit                | Every one, in order, none dropped                                  |
| `agents.onActivity`   | An agent takes a step, here or passed in                      | On each step                  | Every one, in order. A step here comes before its write is applied |
| `settings.onChange`   | A setting changes                                             | On each change                | Every one                                                          |
| `host.onStateChange`  | The Node half's state changes                                 | On each change                | Every one                                                          |
| `Following.onEnd`     | Following ends                                                | Once                          | —                                                                  |

A move's drop always reaches `onLocalChanges` before the gesture's `end` is reported. So a copy that sends both on one
ordered channel delivers the write before the end, and the preview can settle on it.

### Calls window modules make

| Call                                                | Returns                    | Rate                       | Notes                                                             |
| --------------------------------------------------- | -------------------------- | -------------------------- | ----------------------------------------------------------------- |
| `canvas.layer`                                      | `Disposable` at once       | Once per layer             | Its children re-render as React does                              |
| `canvas.box`, `hit`, `pageToScreen`, `screenToPage` | A value at once            | Any; cheap                 | Read in the scheduler's measure phase when called from `useFrame` |
| `Preview.update`, `Held.update`                     | Nothing                    | Drawn at most once a frame | Later calls in a frame replace earlier ones                       |
| `camera.show`                                       | A promise, when it arrives | Any                        | A later call replaces an earlier one                              |
| `Following.update`                                  | Nothing                    | Drawn at most once a frame | The latest wins                                                   |
| `colors.claim`, `assign`, `release`                 | At once                    | Any                        |                                                                   |
| `sync.receive`                                      | A promise of `{ pending }` | As changes arrive          | Applied in the order called. Waits until the document is open     |
| `sync.version`, `changesSince`                      | At once                    | On reconnect or `pending`  |                                                                   |
| `sync.snapshot`                                     | A promise                  | Once per joining copy      | Can take a moment for a large project                             |
| `sync.setWritesFiles`                               | A promise, once settled    | On host changes            | `true` resolves after the files that differ are written           |
| `agents.receive`                                    | Nothing                    | As steps arrive            | Reported through `onActivity` in the order received               |
| `host.api<Api>().method(…)`                         | A promise                  | Any                        | Rejects with `HalfUnavailableError` unless the Node half is ready |

### What the multiplayer extension sends between copies

This is the multiplayer extension's own protocol, not core's. It's here to show the rates work.

| Message                                   | Sent                                                           | Rate                       | Order                                          |
| ----------------------------------------- | -------------------------------------------------------------- | -------------------------- | ---------------------------------------------- |
| `changes`                                 | Each `onLocalChanges`                                          | As edits happen            | One ordered channel with the next three        |
| `gesture`                                 | Each `onGesture`                                               | A few per drag             | After the `changes` it follows                 |
| `agents`                                  | Each `onActivity` without `from`                               | As agents work             | After the `changes` of earlier steps           |
| `presence`                                | The pointer, selection, camera and viewing, the latest of each | Batched, about 30 a second | Only the latest is kept while one is in flight |
| `colors`                                  | The host's assignment when someone joins or leaves             | Rarely                     |                                                |
| `hello`, `snapshot`, `version`, `missing` | Joining and catching up                                        | Once per join or reconnect |                                                |

## What moves out of core

| Today, in the app                                                                      | Moves to                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `renderer/agent/presence.ts`, `AgentPresence.tsx`, `motion.ts`, `scanner.ts`           | `@parity-app/extension-agent-presence`: the queue, choreography, scans and pointers, drawn in its own layers |
| `AgentPointer.tsx`, `AgentBadge`, the palettes' look                                   | `@parity-app/presence-ui`, a workspace package both extensions import, so people and agents look alike       |
| `renderer/live-room.ts`, `canvas/RoomCursor.tsx`, `scripts/dev-room.ts`, `PARITY_ROOM` | `@parity-app/extension-multiplayer`                                                                          |

**What stays in core:**

- the agent API, and its activity in and out
- layers, the camera and following, boxes and hits
- previews and holds, since core draws the nodes they move
- colors
- presence events
- the document, saving, and the sync seam

### Agent presence

- **Its window module** listens to `parity.agents.onActivity`. It queues and paces steps as `presence.ts` does now, and
  draws each agent's pointer, badge, scans and measure labels in an `overDesigns` and an `overSelection` layer.
- **Positions.** It finds where to look with `canvas.box(ref, { in, state, mode })`, instead of reaching into frames. An
  `asleep` frame still gives a place to point at, and `size` gives measure labels their numbers.
- **Moved boards** are held with `canvas.hold`.
- **The check.** The existing stories (`AgentPresence.stories.tsx`, `Agents.stories.tsx`) are the before-and-after check
  that it looks the same.
- **It goes first.** It's the hardest test the canvas API will get. Building it first finds what's missing before
  multiplayer depends on the API.

### The multiplayer extension

```tsx
// window.tsx
export const activateWindow: WindowModule["activateWindow"] = async (parity) => {
  await parity.host
    .api<RelayApi>()
    .ensureRelay(parity.settings.get<number>("multiplayer.port"))
    .catch(() => undefined)
  const room = joinRoom(`http://localhost:${parity.settings.get<number>("multiplayer.port")}`, parity.project.root)

  // The document.
  parity.subscriptions.push(
    parity.sync.onOpen(async () => {
      if (room.host === room.peer) return { from: "files" }
      const { snapshot, lineage } = await room.askSnapshot()
      return { from: "snapshot", snapshot, lineage }
    }),
    parity.sync.onLocalChanges((bytes) => room.send({ kind: "changes", bytes, lineage: parity.sync.lineage }))
  )
  room.on("changes", async ({ bytes }) => {
    try {
      const { pending } = await parity.sync.receive(bytes)
      if (pending) room.askMissing(parity.sync.version())
    } catch (error) {
      if (error instanceof LineageError) room.leaveWith("This copy holds a different version of the project")
      else parity.log.error(error instanceof Error ? error : String(error))
    }
  })
  room.on("reconnected", () => room.askMissing(parity.sync.version()))
  room.on("missing", ({ version, to }) =>
    room.sendTo(to, { kind: "changes", bytes: parity.sync.changesSince(version) })
  )
  room.on("snapshotAsked", async ({ to }) =>
    room.sendTo(to, { kind: "snapshot", snapshot: await parity.sync.snapshot(), lineage: parity.sync.lineage })
  )
  room.on("host", () => void parity.sync.setWritesFiles(room.host === room.peer))

  // Colors: the host assigns, everyone applies.
  room.on("colors", ({ assigned }) => assigned.forEach(([key, n]) => parity.colors.assign(key, n)))
  room.on("left", ({ peer }) => parity.colors.release(peer))

  // What I'm doing, and what my agents are doing.
  parity.subscriptions.push(
    parity.presence.onPointer((pointer) => room.presence({ pointer })),
    parity.presence.onGesture((gesture) => room.send({ kind: "gesture", gesture })),
    parity.presence.onViewing((viewing) => room.presence({ viewing })),
    parity.selection.onChange((selection) => room.presence({ selection })),
    parity.canvas.camera.onChange((camera) => room.presence({ camera })),
    parity.agents.onActivity((steps, from) => {
      if (from === undefined) room.send({ kind: "agents", steps })
    })
  )
  room.on("agents", ({ steps, from }) => parity.agents.receive(steps, { from }))

  // Everyone else, with our own components.
  parity.subscriptions.push(
    parity.canvas.layer(
      { id: "multiplayer.selections", space: "page", order: "overDesigns" },
      <Selections room={room} />
    ),
    parity.canvas.layer(
      { id: "multiplayer.pointers", space: "page", order: "overSelection" },
      <Pointers room={room} canvas={parity.canvas} />
    ),
    parity.canvas.layer(
      { id: "multiplayer.people", space: "screen", order: "edge", placement: "topRight" },
      <People room={room} camera={parity.canvas.camera} />
    ),
    { dispose: () => room.leave() }
  )

  return {}
}
```

```tsx
// Pointers.tsx: a pointer glides, stays where it was when its person leaves the canvas, and drags what they drag.
import { useBox, useCamera, useColor, useFrame } from "@parity-app/canvas-layer"
import { PersonPointer } from "@parity-app/presence-ui"

function RemotePointer({ person, canvas }: { person: RoomPerson; canvas: CanvasSurface }) {
  const ref = useRef<HTMLDivElement>(null)
  const { zoom } = useCamera()
  const palette = useColor(person.peer)
  const glide = useGlide(person.pointer.at) // eases toward each new point, for longer the further it is
  const preview = useRef<Preview>()

  useEffect(() => {
    const gesture = person.gesture
    if (gesture?.kind !== "move") return
    preview.current = canvas.preview([], { color: person.peer, label: person.name, drop: gesture.drop })
    return () => preview.current?.settleOnWrite()
  }, [person.gesture, canvas, person.peer, person.name])

  useFrame({
    draw: () => {
      const at = glide.step()
      ref.current!.style.transform = `translate(${at.x}px, ${at.y}px) scale(${1 / zoom})`
      const gesture = person.gesture
      if (gesture?.kind === "move") {
        preview.current?.update(
          gesture.targets.map(({ ref: node, offset, state, mode }) => ({
            ref: node,
            at: { x: at.x + offset.x, y: at.y + offset.y },
            state,
            mode
          })),
          { drop: gesture.drop }
        )
      }
    }
  })

  return (
    <div ref={ref} className="absolute top-0 left-0 origin-top-left">
      <PersonPointer
        palette={palette}
        name={person.name}
        away={!person.pointer.over}
        detail={person.typing ? "Typing…" : undefined}
      />
    </div>
  )
}
```

```tsx
// People.tsx: the avatar stack, with the kit's own Popover and Button.
import { Avatar, AvatarFallback, Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { useColor } from "@parity-app/canvas-layer"
import { PersonAvatar } from "@parity-app/presence-ui"

function Face({ person, following, onFollow, onGoTo }: FaceProps) {
  const palette = useColor(person.peer)

  return (
    <Popover>
      <PopoverTrigger>
        <PersonAvatar palette={palette} name={person.name} src={person.avatar} ring={following} />
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="text-sm font-medium">{person.name}</p>
        <p className="text-muted-foreground text-xs">{person.viewingLine}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onFollow}>
            Follow
          </Button>
          <Button size="sm" variant="ghost" onClick={onGoTo}>
            Go to
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function People({ room, camera }: { room: Room; camera: Camera }) {
  const people = useRoomPeople(room)
  const [following, setFollowing] = useState<{ peer: string; handle: Following }>()

  useEffect(() => {
    if (!following) return
    return room.onPerson(following.peer, (person) => following.handle.update(person.camera))
  }, [following, room])

  const follow = (person: RoomPerson) => {
    const handle = camera.follow(person.camera)
    handle.onEnd(() => setFollowing(undefined))
    setFollowing({ peer: person.peer, handle })
  }

  return (
    <>
      <div className="flex -space-x-2" data-canvas-interactive>
        {people.slice(0, 4).map((person) => (
          <Face
            key={person.peer}
            person={person}
            following={following?.peer === person.peer}
            onFollow={() => follow(person)}
            onGoTo={() => void camera.show(person.camera)}
          />
        ))}
        {people.length > 4 && (
          <Avatar size="sm">
            <AvatarFallback>+{people.length - 4}</AvatarFallback>
          </Avatar>
        )}
      </div>
      {following && <FollowFrame person={room.person(following.peer)} />}
    </>
  )
}
```

`joinRoom`, `useGlide`, `useRoomPeople` and `FollowFrame` are the extension's own.

## External extensions (backlogged)

External extensions can't be installed yet (PAR-1098), so this part waits. What's settled for when it comes:

- **Canvas overlays,** which Parity draws: `badge`, `label`, `outline`, `line` and `region`, attached to nodes and
  colored by `ColorKey` or `Tone`.
  - developer-api.md planned them, and PAR-1095 lists them, but they aren't in `@parity-app/extension-api` yet.
  - They go on `Parity` as `parity.canvas`.
  - A `node` command target is added so a badge's command knows what it was clicked on.
- **Web views (PAR-1099)** go in tabs, Design tab sections, pages and dialogs, not on the canvas. A frame's popovers
  clip at its edge, and a frame takes the pointer over its whole box.
  - They use any framework, and their own copy of shadcn if they like.
  - Parity's theme reaches them as CSS variables, whose names are listed and versioned with the extension API.
- **No runtime sharing** of Parity's kit or React.

## Telemetry and debugging

Extensions move code out of core, and that makes failures harder to place. A pointer that doesn't show could be agent
presence, a layer, `box()`, the room, or core's activity events. So every seam this proposal adds records what crosses
it. Extensions today record nothing of their own beyond `processes.*`.

**How events are defined.** They follow docs/telemetry.md:

- Each is a typed `defineEvent` in `@parity-app/telemetry`, in two new files: `extension-events.ts` and
  `sync-events.ts`. The multiplayer extension's own events go in its package, registered with the catalog.
- Each goes to the local copy, to Sentry as a structured log, and as a breadcrumb in the process that recorded it.
- Each is listed in docs/telemetry.md and docs/telemetry-coverage.md in the same commit that adds it.
- Window modules record through `parity.log` and the events below. They don't call Sentry themselves.

**What's never sent:** document bytes, people's names, an agent's labels, or what anyone typed. Peer ids, lineages and
agent ids are random, so they're sent as they are.

### Every error says which extension

- **Sentry tags.** Every error from a window module, a layer's error boundary, or a call core makes into an extension is
  tagged `extension` (its id), `extension_half` (`window` or `node`) and `tab`.
- **The issue's title** starts with the extension's display name, so issues group by extension.
- **`extensions.json`** is attached to every error from the editor window, beside `frames.json`. For each extension
  active in each tab, it lists:
  - its id, version, halves and their states
  - its capabilities
  - its layers, and how many previews and holds it has open
  - its recent failures
  - for the extension that brings the room: the lineage, whether it writes files, whether changes are pending, how big
    its version is, and how many peers it last reported

### Extensions' lifecycle

These cover internal and external extensions, both halves.

| Event                         | Level | Sent by           | When                                                                         | Attributes                                                                                                                   |
| ----------------------------- | ----- | ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `extension.activated`         | info  | renderer, service | A half's `activate` or `activateWindow` returns                              | `extension`, `version`, `half`, `internal`, `trigger` (the activation event), `durationMs`, `capabilities`                   |
| `extension.activateFailed`    | error | renderer, service | A half fails to load or its activation throws                                | `extension`, `half`, `phase` (`load`, `activate`), the error's message and stack                                             |
| `extension.deactivated`       | info  | renderer, service | A half stops                                                                 | `extension`, `half`, `why` (`turnedOff`, `tabClosed`, `setting`, `crashed`, `undetected`, `quit`), `uptimeMs`                |
| `extension.crashed`           | warn  | service           | A Node half's process ends by itself                                         | `extension`, `uptimeMs`, `crashesInRow`, `restarting`, `exitCode`, `signal`, its last 50 lines of output                     |
| `extension.callFailed`        | warn  | renderer          | A listener, handler, layer render or `activateWindow` throws, caught by core | `extension`, `api` (as `presence.onPointer` or `layer:multiplayer.pointers`), `failures` (in this tab), `stopped`, the error |
| `extension.stoppedInTab`      | error | renderer          | A window module reaches five failures and is stopped in a tab                | `extension`, `failures`, the last error                                                                                      |
| `extension.halfUnavailable`   | warn  | renderer, service | A call to the other half rejects with `HalfUnavailableError`                 | `extension`, `from` (`window`, `node`), `method`, `state`. Sampled to one in ten after the first per minute                  |
| `extension.manifestRefused`   | error | service           | A manifest breaks a rule when it's read                                      | `extension`, `rule` (as `internalOutsideBuiltIns`, `secondSync`, `capabilityWithoutContribution`)                            |
| `extension.capabilityMissing` | warn  | renderer          | A window module calls an API it didn't declare                               | `extension`, `capability`, `api`. Once per extension, API and session                                                        |

### Time on the main thread

| Event                  | Level | Sent by  | When                                                                                                          | Attributes                                                                                                                                                                        |
| ---------------------- | ----- | -------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extension.slow`       | warn  | renderer | A long animation frame's scripts are mostly a window module's chunk, or one callback into it takes over 16 ms | `extension`, `kind` (`frame`, `callback`), `api` (for a callback), `durationMs`, `blockingMs`. At most one per extension a minute; the rest are counted in `extension.mainThread` |
| `extension.mainThread` | info  | renderer | Once a minute while a window module is active in a visible tab                                                | `extension`, `callbacks`, `callbackMs` (total), `callbackP95Ms`, `longFrames`, `layers`, `layerRenders`                                                                           |

`extension.mainThread` is how a creeping cost shows up before anyone notices it, such as a layer re-rendering every
frame. `extension.slow` is the spike that makes someone notice.

### The canvas surface

| Event                 | Level | Sent by  | When                                                                     | Attributes                                                                                                                                                         |
| --------------------- | ----- | -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dragPreview.settled` | info  | renderer | A preview ends. Sampled to one in ten when it ends by its write          | `extension`, `kind` (`board`, `layout`, `absolute`), `items`, `how` (`write`, `timeout`, `cancel`, `disposed`), `durationMs`, `concurrent` (previews open at once) |
| `hold.released`       | info  | renderer | A hold ends                                                              | `extension`, `how` (`released`, `timeout`, `grabbed`, `disposed`), `heldMs`                                                                                        |
| `follow.ended`        | info  | renderer | Following ends                                                           | `extension`, `why`, `durationMs`                                                                                                                                   |
| `colors.generated`    | info  | renderer | A claim or assignment needs a generated palette, once per tab and number | `n`, `keys` (holding a color in the tab)                                                                                                                           |

- **A preview settled by `timeout`** means the write never arrived, or came after the gesture's end. That's the ordering
  the event tables promise, so it's the first sign the promise broke.
- **A hold let go by `timeout`** means an agent's write never came.

### Sync

Recorded by core, so they're there whichever extension brings the room.

| Event                 | Level | Sent by  | When                                                                                 | Attributes                                                                                          |
| --------------------- | ----- | -------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `sync.opened`         | info  | renderer | The project opens through `onOpen`                                                   | `extension`, `from` (`files`, `snapshot`), `waitMs`, `snapshotBytes`, `lineage`, `format`           |
| `sync.openFailed`     | warn  | renderer | `onOpen` rejects or takes over 30 s, so the project opens alone and sync is detached | `extension`, `reason` (`rejected`, `timeout`), `waitMs`, the error                                  |
| `sync.traffic`        | info  | renderer | Once a minute while synced                                                           | `changesOut`, `changesIn`, `bytesOut`, `bytesIn`, `pendingReceives`, `maxPendingMs`, `receiveP95Ms` |
| `sync.pending`        | warn  | renderer | Changes stay pending for over 5 s                                                    | `pendingMs`, `pendingBytes`                                                                         |
| `sync.caughtUp`       | info  | renderer | `changesSince` is answered or applied                                                | `role` (`asked`, `answered`), `bytes`, `durationMs`, `trigger` (`reconnect`, `pending`)             |
| `sync.diverged`       | error | renderer | After catching up, this copy's version still differs from the one it caught up from  | `lineage`, `localVersionBytes`, `remoteVersionBytes`                                                |
| `sync.receiveFailed`  | error | renderer | `receive` rejects for anything but another lineage                                   | `bytes`, the error                                                                                  |
| `sync.lineageRefused` | warn  | renderer | `receive` refuses bytes from another lineage                                         | `lineage`, `theirs`                                                                                 |
| `sync.writesFiles`    | info  | renderer | `setWritesFiles` settles                                                             | `writes`, `why` (`open`, `host`, `roomGone`), `filesWritten`, `stylesheetWritten`, `durationMs`     |
| `sync.detached`       | warn  | renderer | The room goes away and the project moves to the local provider                       | `why` (`stopped`, `crashed`, `openFailed`, `turnedOff`), `unsavedFiles`, `saved`                    |
| `sync.diskIgnored`    | info  | renderer | A copy that doesn't write files ignores a file changed on its disk, once per file    | `path`                                                                                              |

**Saving in a room** extends existing events instead of adding new ones:

- `document.saved` gains `fromOthers`, the number of other copies' changes the save included.
- `document.saveFailed` gains `inRoom` and `writesFiles`.
- `document.saved` with `fromOthers` above zero is how we see that the blocker is fixed in practice.

### Agents' activity

| Event                | Level | Sent by  | When                                          | Attributes                                                                                   |
| -------------------- | ----- | -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `agents.activity`    | info  | renderer | Once a minute while agents are working        | `stepsHere`, `stepsReceived`, `copies` (distinct `from`), `listeners` (extensions listening) |
| `agents.stepDropped` | warn  | renderer | A received step names a node that isn't there | `kind`, `from`. At most one a minute, the rest counted                                       |

`listeners: 0` with `stepsReceived` above zero shows that steps arrive but nothing draws them, as when agent presence is
turned off.

### The multiplayer extension's own

| Event               | Level | When                                                     | Attributes                                                                                               |
| ------------------- | ----- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `room.relayStarted` | info  | The Node half starts the development relay, or finds one | `result` (`started`, `shared`), `port`                                                                   |
| `room.joined`       | info  | This copy joins a room                                   | `host` (whether this copy hosts), `peers`, `waitMs`                                                      |
| `room.left`         | info  | This copy leaves                                         | `why` (`closed`, `turnedOff`, `lineage`, `relayGone`), `durationMs`                                      |
| `room.hostChanged`  | info  | The host changes                                         | `becameHost`, `peers`                                                                                    |
| `room.reconnected`  | warn  | The connection to the relay comes back                   | `downMs`                                                                                                 |
| `room.latency`      | info  | Once a minute while in a room                            | `rttP50Ms`, `rttP95Ms`, `rttMaxMs`, `presenceSent`, `presenceReceived`, `queueMax`, `batchesInFlightMax` |

`room.latency` keeps the numbers we measured by hand during PAR-1179: round trips of a few milliseconds with spikes of
150–560 ms from busy main threads. We'll see whether that holds outside one machine.

### Traces

Spans follow the existing tracing (docs/telemetry.md, "Traces"):

- `extension.activate` is a span under the tab's opening.
- `sync.open` is a span under `project.opening`, so a slow open shows whether the room or the files took the time.
- `sync.catchUp` is a span from asking to applying.
- `room.join` is a span in the multiplayer extension, from connecting to the snapshot arriving.
- A change carries no trace across copies. Changes are batched, and a trace per edit across machines would be noise.

### Debugging without Sentry

- **The extension's log tab.** Window modules write to the same tab in the bottom panel as their Node half, each line
  marked with its half and tab. Failures counted by `extension.callFailed` show there with their stacks.
- **`PARITY_EXTENSIONS_DEBUG=1`** (or `=multiplayer` for one extension) logs every call core makes into a window module
  and every call it makes back, with timing, to the log tab and the local copy. It's for development.
- **The Live room's status item.** The multiplayer extension's status item shows peers and whether this copy writes
  files. Its tooltip shows the lineage, pending changes and the latest round trip. It's what someone looks at first when
  two copies disagree.
- **For agents.** `parity extensions` (and MCP's `list_extensions`) gives each extension's halves, states, recent
  failures and, for the room, the sync state from `extensions.json`. An agent debugging a live room can see what the
  person sees.

## Trust and limits

- **Internal extensions are trusted like the app's code,** because they are the app's code, released with it.
- **Contained anyway:**
  - Every call core makes into a window module (listeners, handlers, `activateWindow`) is wrapped. An exception is
    logged against the extension and counted.
  - After five failures in a tab, the module is stopped there with "Multiplayer stopped working in this tab".
  - Each layer and place has an error boundary for rendering.
  - A synchronous hang can't be contained. It's attributed and reported.
- **Attributed.** Parity watches the main thread with `long-animation-frame` entries, whose script timings name the
  module's chunk, and times each callback into a window module. In development, past a budget, it says "Multiplayer is
  slowing the editor". Everywhere, it records `extension.slow` and `extension.mainThread` (see "Telemetry and
  debugging"). `long-tasks.ts` gains this, since `longtask` entries can't name a script.
- **Layers can't cover Parity's own UI.** `edge` layers are kept clear of the toolbar and panels, and layers don't take
  the pointer unless an element asks.
- **Stopping an extension** removes its layers, places, previews and holds, and releases its colors. If it brought the
  room, see "When the room goes away".

## Tasks

The phase table, with dependencies, is kept in Linear under "Multiplayer and agent presence as internal extensions". In
short:

**Phase 0, decide**

- approve this proposal
- the Storybook designs (done: PAR-1188, #732): the avatar stack and person card, the follow frame, other people's
  selections, a pointer going away and coming back, drag previews, the hand-tuned palettes and the generator. The local
  drag look they designed is in the app too (PAR-1199, #741)

**Phase 1, core fixes for sync**

- saving in a room
- tokens in Loro, with the stylesheet written only by the copy that writes files
- live text
- state and mode shared through the room, saved by the copy that writes files

**Phase 2, window modules**

- `internal`, `window` and the one built-in list
- the lifecycle and its activation events
- the link between the halves
- containment and attribution
- capabilities, at lower priority

**Phase 3, the canvas surface**

- layers and their hooks
- the camera and following
- boxes and hits
- several previews at once
- holds
- colors by key, with assignment and generated palettes past the hand-tuned ones

**Phase 4, agent presence**

- `presence-ui`
- `parity.agents` in both directions
- the extension, and removing its code from core

**Phase 5, multiplayer**

- presence events
- the sync seam, with lineage, catching up, and the room going away
- the extension: the development relay, the Live room setting replacing `PARITY_ROOM`, pointers, selections and previews
- the avatar stack and following, once designed

**Throughout:**

- docs/editor.md, docs/extensions.md and developer-api.md, kept current
- each task adds the telemetry events for its seam, with docs/telemetry.md and docs/telemetry-coverage.md updated in the
  same commit
- `extensions.json`, the Sentry tags and `PARITY_EXTENSIONS_DEBUG` land with window modules in phase 2

**Backlog:** canvas overlays, web views (PAR-1099), and third-party extensions (PAR-1098).

## Open questions

1. **Settled: the avatar stack is on the canvas,** in an `edge` layer, stacked beside the zoom controls (PAR-1293).
2. **Settled: state and mode are shared** in a room and saved like any other edit (PAR-1231).
