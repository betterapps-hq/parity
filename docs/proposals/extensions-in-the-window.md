# Extensions in the window: internal window modules, and places external extensions fill

Status: draft for review. Follows PAR-1179 (the live room in development). It changes
[developer-api.md](developer-api.md)'s "Drawing UI" for Parity's own extensions, and makes its canvas overlays and
web views (PAR-1099) concrete for everyone else.

Multiplayer should be an extension, `@parity-app/extension-multiplayer`, rather than code in the app. So should agents'
pointers on the canvas. Today's API can't carry either:

- An extension can't draw on the canvas.
- It can't see the camera or the pointer.
- It doesn't get the document's changes.
- It has no say in how a project opens.

This proposal adds what's missing in two tiers, the way VS Code separates its own workbench features from marketplace
extensions.

## Two tiers

|                       | **Internal extensions**: Parity's own, shipped in the app's build                                                                          | **External extensions**: everyone else's                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Where code runs       | A Node half, as today, and a **window module** in the project's window                                                                    | A Node half, as today                                                                                     |
| UI                    | Their own React, drawn directly: on the canvas, in panels, pages and dialogs                                                              | Places Parity draws: declarative views, canvas overlays, status items; web views in tabs, pages and dialogs |
| Components            | Parity's own: the kit (`@buildkitgg/shadcn-baseui-kit`), React, and Parity's workspace packages, shared, never copied                     | Whatever they bundle into a web view, themed by Parity's CSS variables                                    |
| The canvas            | **Draw on it directly**, in layers, with the camera and nodes' positions (`parity.canvas.layer`)                                          | Overlays attached to nodes, which Parity draws (`parity.canvas.badge`, `outline`, …)                      |
| What Parity promises  | Nothing beyond the build they ship in. The API changes with the app, and so do they                                                       | A versioned API with deprecation                                                                          |
| Trust                 | Same as the app's own code                                                                                                                | Sandboxed: their own process, and web views in frames                                                     |

**Why internal extensions can share everything.** They're in the app's own list of built-in extensions
(`utility/extensions.ts`), built and released with it. They can't drift from the kit, React or the canvas, because they
ship in the same build. That's how VS Code's Explorer, Search and Source Control use its internal widgets.

**Why that still decouples.** A feature like multiplayer or agent presence stops being code inside the canvas. It talks
to the canvas only through `WindowParity`:
- Its pointers, cards and frames are its own components in its own package.
- Core keeps a smaller surface: layers, the camera, where nodes are, colors, and previews of nodes moving.
- A feature can be turned off, replaced or rewritten without touching the canvas.

**Why external extensions don't get the same.** Sharing the kit or React with code Parity doesn't ship makes every
prop of every component a promise. The kit is at 0.5, so every minor version can break. Parity couldn't upgrade it,
restyle a component, or swap Base UI out without breaking someone. So, like VS Code's marketplace extensions,
external extensions:
- fill places that Parity draws
- draw anything else in sandboxed web views, with any framework, bound to Parity only by the names of its CSS
  variables

### How "internal" is enforced

A manifest says `"internal": true`. Parity honours it only for an extension in its built-in list, loaded from the
app's own resources. Anywhere else the field is refused, as `enabledApiProposals` is outside VS Code Insiders. Internal
extensions may use what's marked `@internal` in `@parity-app/extension-api`. External ones can't import it: it isn't in
the published package's types.

## Internal: window modules

A **window module** is a second entry point an internal extension ships beside its Node half. It's an ES module Parity
loads into the project's window, on the main thread. It gets a `WindowParity` object, as the Node half gets `Parity`.

```ts
interface Manifest {
  // …as today…

  /** Only honoured for Parity's built-in extensions. */
  internal?: boolean
  /**
   * The package export of its window module, as `./window`, whose module exports `activateWindow`. Only for an
   * internal extension. Parity loads it in the window of each project the extension is active for.
   */
  window?: string
}

/** What a window module exports. */
export interface WindowModule {
  /** What it returns, other extensions' window modules call through `parity.extensions`, and its Node half through `parity.window`. */
  activateWindow(parity: WindowParity): void | object | Promise<void | object>
  deactivateWindow?(): void | Promise<void>
}
```

**It imports what Parity imports.** React, the kit, `lucide-react` and Parity's workspace packages are shared by the
build, not bundled twice. The app's Vite build compiles built-in extensions' window modules with the app, so they get
one React, one kit and one theme.

**Why the main thread, not a worker.**
- It renders real React into Parity's tree, with real popovers and focus.
- It reads the camera and node positions every frame without messages.
- Heavy work can still go in a Web Worker it starts itself, or in its Node half.

**Activation.** Two new activation events:
- `onSetting:<key>` starts an extension while one of its boolean settings is on, and stops it when it's turned off.
  Multiplayer starts with `onSetting:multiplayer.liveRoom`.
- `onAgentActivity` starts an extension when an agent first works in the project. Agent presence starts so.

### `WindowParity`

```ts
/**
 * What a window module gets. It has the Node half's reads (selection, settings, navigation) and what only makes sense
 * in the window. Files, processes, providers and edits stay in the Node half.
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
  /** Its own React in panels, pages and dialogs. */
  readonly render: Render
  /** Drawing on the canvas, the camera, and where nodes are. */
  readonly canvas: CanvasSurface
  readonly colors: Colors
  readonly presence: Presence
  readonly sync: Sync
  readonly agents: Agents
  /** Its Node half: what that half's `activate` returned. */
  readonly host: { readonly api: RemoteApi<ExtensionApi> }
  /** Window modules of the extensions it names in `extensionDependencies`, with what their `activateWindow` returned. */
  readonly extensions: { get<Api extends object>(id: string): { api: Api } }
}
```

The Node half gets `parity.window.api`, what the window module's `activateWindow` returned, and `parity.window.onReady`.

### `parity.canvas`: drawing on the canvas directly

The canvas gives an internal extension **layers**: React roots laid over the canvas that Parity keeps in step with the
camera. The extension draws anything there with its own components. Parity's job shrinks to keeping layers aligned and
answering where things are.

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

```ts
import type { ReactNode } from "react"

export interface CanvasSurface {
  /**
   * Draws `children` in a layer over the canvas, in a React root of the extension's own with an error boundary.
   * - `page` layers move and zoom with the canvas: children are placed in page coordinates. Use `useCamera().zoom` to
   *   keep something the same size on screen.
   * - `screen` layers stay put. `edge` places their children in a corner or along the bottom, kept clear of Parity's
   *   toolbar.
   * Layers don't take the pointer unless an element inside asks with `data-canvas-interactive`. Parity's own selection
   * and handles always stay usable.
   */
  layer(options: LayerOptions, children: ReactNode): Disposable

  readonly camera: Camera

  /**
   * Where a node is on the page, in whichever frame shows `state` and `mode` (the primary frame otherwise), or nothing
   * while it isn't drawn. Its `radius` is its corner radius on screen.
   */
  box(ref: NodeRef, options?: { state?: string; mode?: string }): NodeBox | undefined
  /** Told when that box changes: the node moved or resized, or its frame redrew. Not for panning: boxes are on the page. */
  onBoxChange(ref: NodeRef, options: { state?: string; mode?: string }, listener: (box: NodeBox | undefined) => void): Disposable
  /** The design under a point on the page, and the deepest node of it there. */
  hit(at: Point): NodeRef | undefined

  pageToScreen(at: Point): Point
  screenToPage(at: Point): Point

  /**
   * Shows nodes really moving or resizing, as their owner sees them during a drag, before anything is written. It
   * needs core, because the nodes are core's to draw:
   * - A board moves itself.
   * - A layer in a layout lifts out of it, drawn as itself, and follows. The layout makes room at `drop`, as it does for
   *   the person dragging.
   * - An absolutely placed layer moves or resizes through a style preview.
   * Only this copy sees it, and nothing is saved or put in undo. Disposing it, or the drop's write arriving, settles
   * every node where the document says.
   */
  preview(items: PreviewItem[], options?: { drop?: { parent: NodeRef; index: number } }): Preview
}

export interface LayerOptions {
  /** Names it among the extension's layers, as `multiplayer.pointers`. */
  id: string
  space: "page" | "screen"
  /** Where it sits among the canvas's own: see the diagram. `edge` is for `screen` layers only. */
  order: "underDesigns" | "overDesigns" | "overSelection" | "edge"
  /** For `edge`: which corner, or along the bottom. */
  placement?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "bottom"
  /** Hidden while the person drags or resizes, as Parity's own overlays are. False by default. */
  hideWhileEditing?: boolean
}

export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface NodeBox extends Rect { radius: number }

/** A node in a preview: following a point on the page, keeping its size, or set to a rect, as in a resize. */
export type PreviewItem = { ref: NodeRef; at: Point } | { ref: NodeRef; rect: Rect }

export interface Preview extends Disposable {
  /** Moves the items, at most once a frame. A drag sends this each frame from where its pointer is drawn. */
  update(items: PreviewItem[], options?: { drop?: { parent: NodeRef; index: number } }): void
}
```

**Hooks for what's drawn in a layer.** They come from `@parity-app/canvas-layer`, a workspace package, and read the
layer's context:

```ts
/** The camera now, re-rendering as it moves: `zoom`, and what's in view. */
export function useCamera(): { zoom: number; view: Rect }
/** A node's box, re-rendering as it changes. */
export function useNodeBox(ref: NodeRef, options?: { state?: string; mode?: string }): NodeBox | undefined
/** Calls `frame` once per animation frame while mounted, with the time since the last. Stops while the window's hidden. */
export function useFrame(frame: (dt: number) => void): void
```

`useCamera` re-renders at most once a frame. For something that moves every frame, like a gliding pointer, components
write a transform in `useFrame` instead of re-rendering.

### `parity.canvas.camera`

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
   * Keeps showing what `update` gives, until the person presses Esc, pans or zooms themself, or opens another design,
   * or the extension disposes it. Starting another ends this one. Parity draws nothing for it: the extension draws its
   * own frame and banner in an `edge` layer.
   */
  follow(view: CameraView): Following
}

export interface Following extends Disposable {
  update(view: CameraView): void
  /** Told why it ended, once. */
  onEnd(listener: (why: "escape" | "panned" | "replaced" | "disposed") => void): Disposable
}
```

### `parity.render`: panels, pages and dialogs

```ts
/** Where an internal extension's React goes outside the canvas. */
export type Place =
  /** A tab, Design tab section or page whose manifest `view` is `react`. */
  | { view: string }
  /** A dialog, titled and sized by Parity. It closes when the person presses Esc, and its Disposable says so. */
  | { dialog: { title: string; width?: "small" | "medium" | "large" } }

export interface Render {
  (place: Place, children: ReactNode): Disposable
}
```

`ViewKind` gains `"react"`, only for internal extensions.

### `parity.colors`: colors for people and agents

People and agents share one set of colors, so they look like one system and work in both themes. There are only 12 of
the agents' palettes, and a room with a few people each running agents runs out fast. So:

- **Extensions name whose color it is, not which color.** They pass a `ColorKey`, a stable id such as a person's or an
  agent's. Parity hands out colors across everyone on the canvas at once, people and agents together, as
  `agent-colors.ts`'s `claim` does for agents today:
  - two keys never share a color while one's free
  - a key keeps its color for the session
  - a person gets the same color in every copy of the room, because the first pick comes from a hash of the key
- **More palettes.** The set grows from 12 to 24, filling the gaps in hue between today's, with a lighter and a deeper
  step where hues are far apart. They're designed in Storybook first (`Parity/Multiplayer/Colors`), each with a
  contrast check for its badge text in both themes. Past 24, colors repeat, and the names on badges tell people apart.
- **Core keeps this,** because two extensions (agent presence and multiplayer) must never hand out the same color.

```ts
/** Whose color something is: a person's id, an agent's id. */
export type ColorKey = string

export interface Colors {
  /** The palette given to `key`, claiming one when it has none. */
  get(key: ColorKey): Palette
  /** Gives `key`'s color back, when its person or agent has gone. */
  release(key: ColorKey): void
}

/** A gradient for pointers, a solid color for outlines, and the ink that reads on it. */
export interface Palette {
  name: string
  stops: [string, string, string]
  color: string
  ink: string
}
```

### `parity.presence`: what this person is doing

Only about *this* person. Showing other people is the extension's job, in its layers.

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
}

/**
 * A gesture, as its targets and their offsets from the pointer when it starts. With the pointer sent on its own,
 * another copy can show the drag (a preview following that person's pointer) without positions every frame.
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
  /** Typing in a text layer. The text arrives through the document, as it's typed. */
  | { kind: "text"; phase: "start" | "end"; ref: NodeRef }

export interface Viewing {
  design?: string
  state?: string
  mode?: string
}
```

### `parity.sync`: sharing the document

The document stays in core: Loro, `ProjectDoc`, undo and saving. The extension brings the room. It decides how the
document opens, carries its changes, and says whether this copy writes files.

```ts
export interface Sync {
  /** The format of the bytes it carries, as `loro/1`. The extension passes them on without reading them. */
  readonly format: string

  /**
   * Says how the project opens, before it does. Parity waits for the handler, up to 30 s, showing "Joining the live
   * room…". `{ from: "files" }` opens the files as if alone, so this copy starts the room; `{ from: "snapshot" }` opens
   * on another copy's. Rejecting opens from files with a warning. One handler per project.
   */
  onOpen(handler: () => Promise<{ from: "files" } | { from: "snapshot"; snapshot: Uint8Array }>): Disposable

  /** Told the bytes of each change made here, by the person, an agent or an extension, once it's committed. */
  onLocalChanges(listener: (bytes: Uint8Array) => void): Disposable

  /** Takes in another copy's change. Rejects for bytes the document can't take, changing nothing. */
  receive(bytes: Uint8Array): Promise<void>

  /** The whole document, for a copy that's joining. */
  snapshot(): Promise<Uint8Array>

  /** Whether this copy writes the project's files. Only one copy in a room should. True until set. */
  setWritesFiles(writes: boolean): void

  /** Closes the project and opens it again through `onOpen`, as when the Live room setting changes. */
  reopen(): Promise<void>
}
```

**What core changes to make sync whole,** whoever brings the room:
- token edits go through the provider
- typing writes as it's typed
- the state and mode each person sees stay their own (`onViewing` reports them; they're not synced)

### `parity.agents`: what this copy's agents do

The agent API (`parity run`, MCP) stays core. An internal extension can watch it.

```ts
export interface Agents {
  /** Told each step of every agent working in this project in this copy, as the agent API runs it. */
  onActivity(listener: (steps: AgentStep[]) => void): Disposable
}

/** One step of an agent's work, by node: what it reads, measures, writes or moves. */
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

## What moves out of core

| Today, in the app                                                                                   | Moves to                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `renderer/agent/presence.ts`, `AgentPresence.tsx`, `motion.ts`, `scanner.ts`, `held-boards.ts`      | `@parity-app/extension-agent-presence`: the queue, choreography, scans and pointers, drawn in its own layers |
| `AgentPointer.tsx`, `AgentBadge`, `agent-colors.ts`'s palettes                                      | `@parity-app/presence-ui`, a workspace package both extensions import, so people and agents look alike       |
| `renderer/live-room.ts`, `canvas/RoomCursor.tsx`, `scripts/dev-room.ts`, `PARITY_ROOM`               | `@parity-app/extension-multiplayer`                                                                          |

**What stays in core:**
- the agent API and its activity
- layers, the camera and follow, node boxes and hits
- previews of nodes moving
- colors
- presence events, and the document with its sync seam

### Agent presence as its own extension

- **Its window module** listens to `parity.agents.onActivity`, queues and paces steps as `presence.ts` does now, and
  draws each agent's pointer, badge, scans and measure labels in an `overDesigns` and an `overSelection` layer.
- **Positions:** it finds where to look with `canvas.box(ref, { state, mode })`, in place of reaching into frames.
- **The check:** the existing stories (`AgentPresence.stories.tsx`, `Agents.stories.tsx`) are the before-and-after
  check that it looks the same.
- **It's the hardest test the canvas API will get.** Building it first shows what's missing before multiplayer depends
  on the API.

**Its API, for other extensions:**

```ts
/** What agent presence's `activateWindow` returns. */
export interface AgentPresenceApi {
  /** Plays another copy's agent's steps here, as this copy's own are played, with `from` keeping them apart. */
  play(steps: AgentStep[], options: { from: string }): void
}
```

### How the multiplayer extension uses it

```tsx
// window.tsx: the room, in the project's window.
export function activateWindow(parity: WindowParity) {
  const room = joinRoom(parity.settings.get("multiplayer.server"), parity.project.root)
  const agentPresence = parity.extensions.get<AgentPresenceApi>("@parity-app/extension-agent-presence").api

  // The document.
  parity.sync.onOpen(async () =>
    room.host === room.peer ? { from: "files" } : { from: "snapshot", snapshot: await room.askSnapshot() }
  )
  parity.sync.onLocalChanges((bytes) => room.send({ updates: [bytes] }))
  room.onUpdates((bytes) => parity.sync.receive(bytes))
  room.onSnapshotAsked((to) => parity.sync.snapshot().then((snapshot) => room.sendTo(to, { snapshot })))
  room.onHostChange(() => parity.sync.setWritesFiles(room.host === room.peer))

  // What I'm doing, and what my agents are doing.
  parity.presence.onPointer((pointer) => room.send({ pointer }))
  parity.presence.onGesture((gesture) => room.send({ gesture }))
  parity.selection.onChange((selection) => room.send({ selection }))
  parity.canvas.camera.onChange((camera) => room.send({ camera }))
  parity.presence.onViewing((viewing) => room.send({ viewing }))
  parity.agents.onActivity((steps) => room.send({ agents: steps }))
  room.onAgentSteps((steps, from) => agentPresence.play(steps, { from }))
  room.onLeave((person) => parity.colors.release(person.id))

  // Everyone else, drawn with our own components.
  parity.subscriptions.push(
    parity.canvas.layer({ id: "multiplayer.selections", space: "page", order: "overDesigns" }, <Selections room={room} />),
    parity.canvas.layer({ id: "multiplayer.pointers", space: "page", order: "overSelection" }, <Pointers room={room} canvas={parity.canvas} />),
    parity.canvas.layer({ id: "multiplayer.people", space: "screen", order: "edge", placement: "topRight" }, <People room={room} camera={parity.canvas.camera} />)
  )
}
```

```tsx
// Pointers.tsx: a person's pointer glides, stays where it was when they leave the canvas, and drags what they drag.
import { useFrame, useCamera } from "@parity-app/canvas-layer"
import { PersonPointer } from "@parity-app/presence-ui"

function RemotePointer({ person, canvas }: { person: RoomPerson; canvas: CanvasSurface }) {
  const ref = useRef<HTMLDivElement>(null)
  const { zoom } = useCamera()
  const drawn = useGlide(person.pointer.at) // eases toward each new point; longer for a longer way
  const preview = usePreview(canvas, person.gesture) // canvas.preview while they drag

  useFrame(() => {
    const at = drawn.step()
    ref.current!.style.transform = `translate(${at.x}px, ${at.y}px) scale(${1 / zoom})`
    preview?.update(person.gesture.targets.map(({ ref, offset }) => ({ ref, at: { x: at.x + offset.x, y: at.y + offset.y } })))
  })

  return (
    <div ref={ref} className="absolute top-0 left-0 origin-top-left">
      <PersonPointer color={person.id} name={person.name} away={!person.pointer.over} detail={person.typing ? "Typing…" : undefined} />
    </div>
  )
}
```

```tsx
// People.tsx: the avatar stack, with the kit's own Popover and Button.
import { Avatar, AvatarFallback, Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { PersonAvatar } from "@parity-app/presence-ui"

function People({ room, camera }: { room: Room; camera: Camera }) {
  const people = useRoomPeople(room)
  const [following, setFollowing] = useState<{ id: string; handle: Following }>()

  const follow = (person: RoomPerson) => {
    const handle = camera.follow(person.camera)
    handle.onEnd(() => setFollowing(undefined))
    setFollowing({ id: person.id, handle })
  }

  return (
    <>
      <div className="flex -space-x-2" data-canvas-interactive>
        {people.slice(0, 4).map((person) => (
          <Popover key={person.id}>
            <PopoverTrigger>
              <PersonAvatar color={person.id} name={person.name} src={person.avatar} ring={following?.id === person.id} />
            </PopoverTrigger>
            <PopoverContent className="w-56">
              <p className="text-sm font-medium">{person.name}</p>
              <p className="text-muted-foreground text-xs">{person.viewingLine}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => follow(person)}>Follow</Button>
                <Button size="sm" variant="ghost" onClick={() => camera.show(person.camera)}>Go to</Button>
              </div>
            </PopoverContent>
          </Popover>
        ))}
        {people.length > 4 && <Avatar size="sm"><AvatarFallback>+{people.length - 4}</AvatarFallback></Avatar>}
      </div>
      {following && <FollowFrame person={room.person(following.id)} />}
    </>
  )
}
```

## External: places Parity draws

External extensions keep developer-api.md's model. Parity draws everything they show on the canvas. What this proposal
settles for them:

**Canvas overlays.** developer-api.md planned these, and PAR-1095 lists them, but they aren't in `@parity-app/extension-api`
yet. They're attached to nodes, drawn in Parity's own look, kept on their nodes as the canvas moves, hidden while the
person drags, and colored by `ColorKey` or `Tone`:

```ts
export interface CanvasOverlays {
  /** A small tag on a node's corner: a count, a time, a warning. It runs `command` on the node when clicked. */
  badge(ref: NodeRef, options: BadgeOptions): Overlay<BadgeOptions>
  /** Text beside a node. */
  label(ref: NodeRef, options: LabelOptions): Overlay<LabelOptions>
  outline(ref: NodeRef, options: OutlineOptions): Overlay<OutlineOptions>
  /** A line between two nodes. */
  line(from: NodeRef, to: NodeRef, options: LineOptions): Overlay<LineOptions>
  /** Shades a node's area. */
  region(ref: NodeRef, options: RegionOptions): Overlay<RegionOptions>
}

export interface BadgeOptions { text: string; tone?: Tone; color?: ColorKey; command?: string }
export interface LabelOptions { text: string; side?: "top" | "right" | "bottom" | "left" }
export interface OutlineOptions { color?: ColorKey; tone?: Tone; label?: string; dashed?: boolean }
export interface LineOptions { color?: ColorKey; dashed?: boolean; label?: string }
export interface RegionOptions { color?: ColorKey; tone?: Tone; label?: string }

/** `update` changes what's given and leaves the rest; `dispose` takes it away. */
export interface Overlay<Options> extends Disposable {
  update(changes: Partial<Options>): void
}
```

Internal extensions can use these too, when Parity's look is all they need.

**Web views (PAR-1099).** A sandboxed frame in a tab, a Design tab section, a page or a dialog:
- **Any framework.** It can use React, any library, and its own copy of shadcn.
- **Theme.** It gets Parity's theme as CSS variables (`--background`, `--muted-foreground`, `--radius`, the palettes),
  updated live when the theme changes. The variable names are the only thing it's bound to, so they're listed and
  versioned with the extension API.
- **Optional starter.** Parity can publish a small Tailwind preset mapping those variables, for a web view that wants
  to look native with little work. Extensions bundle it, so Parity's own kit stays free to change.
- **A typed channel** to its extension's Node half. It can't reach Node itself.
- **Not on the canvas.** A frame's popovers get clipped at its edge, and a frame takes the pointer over its whole box,
  so a web view over the canvas would get in the way of editing. On the canvas, external extensions use overlays.

**Canvas tools** stay in PAR-1099 as planned: a tool with pointer events in page coordinates and the node under the
pointer. They're declared, so Parity draws the tool's button and cursor.

## Speed

- **Function calls.** A window module calls Parity directly, and Parity calls it.
- **Batched per frame.** Events to extensions are coalesced per frame, keeping only the latest pointer and camera.
- **Smooth motion is the extension's, on the main thread.** It moves things in `useFrame` by writing transforms, not by
  re-rendering. Layers are composited separately, so a layer redrawing doesn't redraw the canvas.
- **Bytes aren't copied.** Document bytes are handed over as they are.

## Trust and limits

- **Internal extensions are trusted like the app's code,** because they are the app's code, released with it.
- **Watched anyway.** Parity counts each window module's long tasks (`long-tasks.ts` already finds them) and render
  time:
  - Past a budget it says so in development and in telemetry: "Multiplayer is slowing the editor".
  - Each layer and place has an error boundary. A crash shows "Multiplayer stopped working here", and the rest of the
    window carries on.
- **External extensions** stay in their own process, with web views in frames, and the permission prompts and limits
  of PAR-1098.
- **Layers can't cover Parity's own UI.** `edge` layers are kept clear of the toolbar and panels, and layers don't take
  the pointer unless an element asks.
- **Stopping an extension** removes its layers, places, overlays and previews. If it brought the room, its project
  reopens from files.

## Changes to Linear

- **PAR-1099**, "Add web views and canvas tools for extensions": add what's settled here for external extensions.
  - web views in tabs, sections, pages and dialogs, not on the canvas
  - the theme's CSS variables as a versioned contract
  - no runtime sharing of Parity's kit or React
- **Canvas overlays**, planned in developer-api.md and listed in PAR-1095, aren't built. They need a task of their own.
- **New tasks for the internal tier:**
  - window modules and `internal`
  - `parity.canvas` layers, camera, boxes and previews
  - colors by key, with 24 palettes
  - presence events
  - the sync seam
  - agent activity
- **Two extensions:** agent presence, then multiplayer.

## Open questions

1. **Avatar stack: top-right of the canvas or the title bar?** This draft puts it on the canvas in an `edge` layer. The
   title bar would need a place of its own.
2. **Order of work.** Moving agent presence first proves the canvas API before multiplayer builds on it, but delays
   multiplayer by that move.
3. **More than one window per project.** A project opens in one window today, so a window module runs once per
   project. If a project can open in two, it runs once per window.
