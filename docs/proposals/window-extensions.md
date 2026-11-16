# Window modules, canvas overlays, presence and sync for extensions

Status: draft for review. Follows PAR-1179 (the live room in development) and builds on
[developer-api.md](developer-api.md), whose `parity.canvas` overlays this makes concrete and whose "no React in the
window" rule this replaces.

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

A **window module** is a second entry point an extension can ship. It's an ES module that Parity loads into the
project's window, beside the editor. It gets a `WindowParity` object, as the Node half gets `Parity`.

**What it's for:**
- **Its own React,** drawn in the window: on the canvas, in a tab, a section, a page or a dialog. It can use any
  component library it installs, and Parity's own shadcn kit, shared rather than copied (see "Extension UI").
- **Speed.** A call between the editor and the window module is a function call. Cursors go 60 times a second in both
  directions. A Node-only extension's messages would hop window → service → extension process and back, on each copy
  of the app.
- **The document's bytes stay short-haul.** The shared document lives in the window. Its updates go from the editor to
  the window module and out to the network, instead of through two other processes.
- **The browser's network:** `fetch`, `WebSocket` and `EventSource`.

**What it costs:** it runs on the window's main thread, with the window's access. That's the price of using any React
library and the real kit.
- A slow render can make the editor stutter, and its code could read what the window can.
- So window modules are for built-in extensions, and later for signed ones. Parity watches each one's time on the main
  thread (see "Trust and limits").
- Heavy work belongs in a Web Worker the window module starts itself, or in its Node half.

This replaces developer-api.md's rule that extensions don't put React into the window. That rule was made to protect
the editor. The limits under "Trust and limits" do that job now.

**The two halves.** An extension can have a Node half, a window half, or both. They talk through `parity.window` and
`parity.host` (see "The two halves talk"). The multiplayer extension uses both:
- the window half holds the room, the cursors and the document's updates
- the Node half runs the room's relay server

**The alternative** is to put all of this in the Node half and send cursors through the service. It's simpler, since
there's no new kind of code. But it's slower, and every extension that draws live would pay for it. Window modules are
worth the cost when something has to follow a pointer.

## Where an extension draws on the canvas

There are two kinds of thing an extension puts on the canvas:
- **Overlays** for what has to move at 60 frames a second, follow a node, or look the same for every extension:
  pointers, outlines, drag previews, marquees. Parity draws these itself.
- **The extension's own React**, for everything else: the avatar stack, a person's card, a comment thread.

There are three ways to place either, so it stays put as the person pans and zooms.

```
┌────────────────────────────────────── canvas ──────────────────────────────────────┐
│                                                     ┌──────────────────────────┐   │
│                                                     │ (A)(M)(+2)    ← corner   │   │  3. On the canvas's edge:
│   ┌──────── Dashboard ─────────┐                    └──────────────────────────┘   │     stays put while panning.
│   │ ┌────────┐   ╔═══════════╗ │ ← outline on a node, in Mia's color               │     The avatar stack, a
│   │ │        │   ║  Card     ║ │   with "Mia" on it                                │     banner.
│   │ └────────┘   ╚═══════════╝ │                                                   │
│   └────────────────────────────┘     ▲ Andrew      ← a pointer at a point          │  1. On a node: moves with
│                                       ┌────┐                                       │     it. Outline, badge,
│                                       │Card│ ← the card Andrew drags, really       │     label, line, region.
│                                       └────┘   moving, held at its offset          │
│                                                from his pointer: a preview         │  2. At a point on the page:
│                     ┏ ━ ━ ━ ━ ━ ┓  ← Mia's marquee, a rect                         │     moves with the page.
│                     ┗ ━ ━ ━ ━ ━ ┛                                                  │     Pointer, rect, preview.
└────────────────────────────────────────────────────────────────────────────────────┘
```

1. **On a node** (`NodeRef`): it follows the node through moves, resizes and zoom. Some are kept at a size you can
   read, like a badge. Others scale with the node, like an outline. developer-api.md already planned these.
2. **At a point on the page**, in page coordinates: a pointer, a rect, a preview of nodes being dragged.
   - Something can be **attached to another overlay**, so it moves with it. That's how the boards and layers another
     person drags really move with their pointer in your view, with only the pointer being sent.
3. **On the canvas's edge**, in a corner or along the bottom: it stays put while the person pans. It holds the
   extension's React, such as the avatar stack, whose faces open a card with Follow and Go to.

### Colors for people and agents

People and agents share one set of colors, so they look like one system and work in both themes. There are only 12 of
the agents' palettes today, and a room with a few people each running agents runs out fast. So two changes:

- **Extensions don't pick colors; they name whose color it is.** Every API takes a `ColorKey`, a stable id such as a
  person's id or an agent's. Parity hands out colors across everyone on the canvas at once, people and agents together,
  as `agent-colors.ts`'s `claim` does for agents today:
  - two keys never share a color while there's a free one
  - a key keeps its color for the session
  - the same person gets the same color in every copy of the room, because the first choice comes from a hash of the key
- **More palettes.** The set grows from 12 to 24. The new ones fill the gaps in hue between today's, with a lighter and a
  deeper step where hues are far apart. They're designed in Storybook first (`Parity/Multiplayer/Colors`), each with a
  contrast check for its badge text in both themes.
  - Past 24 people and agents on one canvas, colors repeat, and names on the badges tell them apart.
- **Using a color in its own React.** An extension reads one with `parity.colors.get(key)`, or uses `PersonAvatar` and
  `ColorDot` from the kit, which take a `ColorKey`.

```ts
/** Whose color something is: a person's id, an agent's id. Parity gives each key a color of its own. */
export type ColorKey = string

export interface Colors {
  /** The palette Parity gave `key`, claiming one when it has none. */
  get(key: ColorKey): Palette
  /** Gives `key`'s color back, when its person or agent has gone. */
  release(key: ColorKey): void
}

/** A palette: a gradient for pointers, a solid color for outlines, and the ink that reads on it. */
export interface Palette {
  name: string
  stops: [string, string, string]
  color: string
  ink: string
}
```

## Manifest changes

```ts
interface Manifest {
  // …as today…

  /**
   * The package export of its window module, as `./window`, whose module exports `activateWindow`. Parity loads it in
   * the window of each project the extension is active for.
   */
  window?: string
}

interface Permissions {
  // …as today…

  /** Whether it may read this person's pointer, gestures and camera, and show other people on the canvas. */
  presence?: boolean
  /** Whether it may share the project's document: open it from elsewhere, and send and take in its changes. */
  sync?: boolean
  /** Whether it may watch what agents do in the project, step by step. */
  agentActivity?: boolean
}

/**
 * New: starts the extension when one of its boolean settings is on, and stops it when it's turned off. Multiplayer
 * starts with `onSetting:multiplayer.liveRoom`, so people who never turn it on never run it.
 */
type ActivationEvent = /* …as today… */ `onSetting:${string}` | "onAgentActivity"
// `onAgentActivity`: new, starts the extension when an agent first works in the project. Agent presence starts so.

interface Contributions {
  // …as today…
  /**
   * Places on the canvas's edge that its window module renders into. Declared so Parity can lay them out, and
   * show the extension as starting, before its code loads.
   */
  canvasWidgets?: CanvasWidgetContribution[]
}

/** A place on the canvas's edge. Parity lays out several extensions' widgets in one corner side by side. */
interface CanvasWidgetContribution {
  id: string
  /** What screen readers call it. */
  title: string
  placement: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "bottom"
  /** The most room it takes, in pixels, so a widget can't cover the canvas. Up to 480 × 320. */
  maxSize?: { width: number; height: number }
}

/**
 * The view kinds, with `react` for the extension's own components. A tab, section or page of that kind is rendered by
 * its window module with `parity.render`. The declarative kinds stay for extensions without a window module.
 */
type ViewKind = "table" | "tree" | "list" | "form" | "keyValue" | "react"
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
    "canvasWidgets": [{ "id": "multiplayer.people", "title": "People here", "placement": "topRight" }],
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
  readonly views: Views
  /** Renders its React into a place: see "Extension UI". */
  readonly render: Render
  readonly canvas: Canvas
  readonly colors: Colors
  readonly camera: Camera
  /** Needs the `presence` permission. */
  readonly presence: Presence
  /** Needs the `sync` permission. */
  readonly sync: Sync
  /** Needs the `agentActivity` permission. */
  readonly agents: Agents
  /** Its own Node half, when it has one. */
  readonly host: HalfChannel
  /** The window halves of the extensions it names in `extensionDependencies`, with what their `activateWindow` returned. */
  readonly extensions: Extensions
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

/** Something drawn on the canvas. `update` changes what's given and leaves the rest; `dispose` takes it away. */
export interface Overlay<Options> extends Disposable {
  update(changes: Partial<Options>): void
}

/**
 * Where a point overlay is: a point on the page, a spot on a node (following it as the canvas moves, in whichever
 * frame shows the given state and mode), or held at an offset from another overlay, moving with it.
 */
export type Anchor =
  | Point
  | { node: NodeRef; state?: string; mode?: string; spot?: "center" | "topLeft" | "top" | "bottomRight"; offset?: Point }
  | { attachedTo: Overlay<unknown>; offset: Point }

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
  pointer(options: PointerOptions): PointerOverlay
  /** A rectangle on the page, as another person's marquee. */
  rect(options: RectOptions): Overlay<RectOptions>
  /**
   * Shows nodes really moving or resizing, as their owner sees them during a drag, before anything is written. Each
   * item follows its anchor (usually attached to the dragging person's pointer) or takes its `rect`.
   * - A board moves itself.
   * - A layer in a layout lifts out of it, drawn as itself, and follows. The layout makes room at `drop`, as it does
   *   for the person dragging.
   * - An absolutely placed layer moves or resizes through a style preview.
   * Only this copy sees it, and nothing is saved or put in undo. Disposing it, or the drop's write arriving, settles
   * every node where the document says. The moving nodes get an outline in `color` with the person's name.
   */
  preview(items: PreviewItem[], options: PreviewOptions): Overlay<PreviewOptions>
  /**
   * The beam agents sweep over what they read: it covers the node, holds, and fades over `ms`. Scans of one node by
   * different keys mix their colors. It resolves when the beam has covered the node, so a pointer can move on.
   */
  scan(ref: NodeRef, options: { color: ColorKey; ms: number }): Promise<void>
}

export interface OutlineOptions {
  color: ColorKey
  label?: string
  dashed?: boolean
}

export interface BadgeOptions {
  text: string
  tone?: Tone
  color?: ColorKey
  command?: string
}

export interface LabelOptions {
  text: string
  side?: "top" | "right" | "bottom" | "left"
}

export interface LineOptions {
  color?: ColorKey
  dashed?: boolean
  label?: string
}

export interface RegionOptions {
  color: ColorKey
  label?: string
}

export interface RectOptions {
  rect: Rect
  color: ColorKey
  filled?: boolean
}

export interface PointerOptions {
  at: Anchor
  name: string
  color: ColorKey
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
   * How it gets from one `at` to the next:
   * - `glide`, the default, eases over a time that grows with the distance, from 80 ms for a step to 400 ms across the
   *   screen, so updates a few frames apart look smooth. It's for people.
   * - `travel` takes a curved path over `ms`, as agents' pointers do, settling on the target. The overlay's `arrived`
   *   promise resolves when it's there.
   * - `jump` doesn't animate.
   * Parity animates every frame itself, so the extension sends only where to go.
   */
  motion?: "glide" | "jump" | { travel: "arc" | "curve"; ms: number; easing?: "inOut" | "settle" }
  /** Pulses gently while the pointer waits, as an agent's does while it thinks. */
  breathing?: boolean
  /** A small icon on the badge for what it's doing: reading, writing, measuring. */
  action?: IconName
}

export interface PointerOverlay extends Overlay<PointerOptions> {
  /** Resolves when a `travel` reaches its `at`. */
  arrived(): Promise<void>
}

/** A node in a preview: moved to follow `at`, keeping its size, or set to `rect`, as in a resize. */
export type PreviewItem = { ref: NodeRef; at: Anchor } | { ref: NodeRef; rect: Rect }

export interface PreviewOptions {
  color: ColorKey
  /** The name on the outline round the moving nodes. */
  label?: string
  /** Where dragged layers would land: before the parent's child at `index`. The layout makes room there. */
  drop?: { parent: NodeRef; index: number }
}
```

**What Parity does with overlays:**
- It keeps them on their nodes and points while the person pans and zooms.
- It draws them above designs and below Parity's own selection and handles. They don't take clicks, except a badge
  with a command.
- An overlay on a node that goes away goes away too.
- Updates in one frame are drawn together, once.

### Extension UI: React, any library, and Parity's components

Extensions write ordinary React. A window module can use any component library it installs: a chart library,
drag-and-drop, a code editor. For the components Parity itself is made of, it uses the same ones, so a button in an
extension is Parity's button.

**The coupling risk, and how this avoids it.** The obvious way to share the kit is to hand extensions Parity's copy of
`@buildkitgg/shadcn-baseui-kit` at runtime. That would make the kit's every prop and export part of the extension API:
- The kit is at 0.5, so every minor version can break.
- Parity couldn't upgrade it, restyle a component, or swap Base UI for something else, without breaking extensions.
- Extensions would come to depend on internals Parity never meant to promise.

So extensions share three things, each with a contract Parity can keep:

| Shared                        | How                                                                                                                                       | Why it's safe                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `react`, `react-dom`          | Parity's own copy, by major version. The extension's build leaves them out.                                                               | React's majors are rare and well signposted. One copy is needed anyway for context and portals to work.        |
| `@parity-app/ui`              | A package Parity owns and versions with the extension API. It re-exports the components Parity commits to, under props Parity chooses. | Parity can change what's behind it: upgrade the kit, restyle, replace Base UI. Extensions see the same API. |
| Theme tokens                  | CSS variables (`--background`, `--muted-foreground`, `--radius`, the palettes) and a Tailwind preset that maps to them.                   | Variable names are a small, stable contract. Values change with the theme, and extensions follow.             |

Everything else an extension installs, it bundles. That includes other shadcn components it copies in itself, styled
with the same tokens.

**`@parity-app/ui`:**
- It starts as the kit components Parity uses most: `Button`, `Avatar`, `Badge`, `Card`, `Popover`, `Tooltip`,
  `DropdownMenu`, `ContextMenu`, `Dialog`, `Tabs`, `Input`, `Textarea`, `Select`, `Combobox`, `Switch`, `Checkbox`,
  `Slider`, `Table`, `Empty`, `Item`, `Kbd`, `Spinner`, `Separator`, `ScrollArea` and `Skeleton`.
- It adds Parity's own pieces: `PersonAvatar` and `ColorDot` (taking a `ColorKey`), `AgentPointer`, `AgentBadge`, and
  the icon set.
- More get added on request. Each one added is a promise, so the list grows on purpose.
- Its props are a curated subset. For example, `Button` takes `variant`, `size`, `disabled`, `onClick` and `children`,
  but no Base UI `render` prop. Escape hatches stay out, so the internals can change.
- **Major versions run side by side.** When Parity changes a component in a breaking way, it ships `@parity-app/ui@2`
  and keeps `@1` working through an adapter for a deprecation period. Each extension gets the major its manifest asks
  for.
- Its types are what extensions compile against. A Storybook section, `Parity/Extension UI`, shows every component.

**How sharing works at runtime.**
- The extension's build is `parity-extension build`, with Vite in library mode underneath. It marks `react`,
  `react-dom`, `react/jsx-runtime` and `@parity-app/ui` as external.
- Before loading a window module, Parity gives the window an import map that points those names at small modules
  re-exporting its own instances, for the major versions the extension asks for.
- The build checks those versions against `engines.parity` and warns about a mismatch before the extension ships.

**Styling:**
- An extension's own `className`s compile with Parity's Tailwind preset into its own stylesheet.
- Parity loads that stylesheet scoped to the extension's places with CSS `@scope`, so it can't restyle Parity.
  `@parity-app/ui` components already have Parity's styles.

**Where it's drawn:**

```ts
import type { ReactNode } from "react"

/** Where an extension's React is drawn. */
export type Place =
  /** A widget on the canvas's edge, as the manifest's `canvasWidgets` declares it. */
  | { widget: string }
  /** A tab, Design tab section or page whose manifest `view` is `react`. */
  | { view: string }
  /**
   * On the canvas, anchored to a node, a point on the page, or an overlay, as a comment's pin or a card beside a
   * person's pointer. It stays the same size on screen as the person zooms, unless `scale` is `page`.
   */
  | { anchor: NodeRef | Anchor; offset?: Point; scale?: "screen" | "page" }
  /** A dialog, titled and sized by Parity. It closes when the person presses Esc, and its Disposable says so. */
  | { dialog: { title: string; width?: "small" | "medium" | "large" } }

export interface Render {
  /**
   * Draws `children` in `place`, in a React root of the extension's own inside Parity's tree. That root is wrapped in
   * an error boundary, and Parity's theme and portals reach it. Disposing takes it away.
   */
  (place: Place, children: ReactNode): Disposable
}
```

- Popovers, tooltips and menus from `@parity-app/ui` open in Parity's own layer, so they aren't clipped by a widget's
  box.
- A widget on the canvas's edge keeps to its `maxSize`. Canvas places stay below Parity's own selection and handles.

**What the extension writes:**

```tsx
import { Avatar, AvatarFallback, Button, PersonAvatar, Popover, PopoverContent, PopoverTrigger } from "@parity-app/ui"

function People({ people, following, onFollow, onGoTo }: PeopleProps) {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, 4).map((person) => (
        <Popover key={person.id}>
          <PopoverTrigger>
            <PersonAvatar color={person.id} name={person.name} src={person.avatar} ring={following === person.id} />
          </PopoverTrigger>
          <PopoverContent className="w-56">
            <p className="text-sm font-medium">{person.name}</p>
            <p className="text-muted-foreground text-xs">{person.viewing}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => onFollow(person.id)}>Follow</Button>
              <Button size="sm" variant="ghost" onClick={() => onGoTo(person.id)}>Go to</Button>
            </div>
          </PopoverContent>
        </Popover>
      ))}
      {people.length > 4 && <Avatar size="sm"><AvatarFallback>+{people.length - 4}</AvatarFallback></Avatar>}
    </div>
  )
}
```

**What core still draws:** pointers, outlines, drag previews, scans and marquees stay overlays (above). They move every frame
and follow nodes through the canvas's own transforms, and they should look the same whoever draws them. An extension
that wants a pointer of its own design can still anchor its React to a point.

**Where the coupling still is**, honestly:
- **React's major.** When Parity moves to React 20, extensions built for 19 keep working only while Parity can still
  load them. Parity serves the old major's runtime for a while, but two Reacts can't share context.
- **`@parity-app/ui` is a real maintenance cost.** It's an API to keep stable, with adapters across majors. That's
  the price of extensions looking native. It's much smaller than promising the whole kit.
- **Tokens.** Renaming a CSS variable becomes a breaking change, so the tokens extensions use are listed and versioned
  with `@parity-app/ui`.

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
   * color with "Following Mia · Esc to stop". It ends when the person presses Esc, pans or zooms themself, opens
   * another design, or the extension disposes it. Following someone else ends this.
   */
  follow(leader: { name: string; color: ColorKey }, view: CameraView): Following
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
}

/**
 * A gesture, as its targets and their offsets from the pointer when it starts. With the pointer sent on its own, the
 * other copy can show a drag in progress (a preview attached to that person's pointer) without positions per frame.
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

```

### `parity.agents`: what this copy's agents do

The agent API (`parity run`, MCP) stays core. What's new is that an extension can watch it, with the `agentActivity`
permission.

```ts
export interface Agents {
  /** Told each step of every agent working in this project in this copy, as the agent API runs it. */
  onActivity(listener: (steps: AgentStep[]) => void): Disposable
}

/** One step of an agent's work, by node rather than by tab: what it reads, measures, writes or moves. */
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

## Agent presence as its own extension

Agents' pointers on the canvas are built into the app today: the queue in `renderer/agent/presence.ts` and the
choreography in `AgentPresence.tsx`. They can be an extension too, `@parity-app/extension-agent-presence`, built on the
same overlays as people's pointers.

**The split:**
- **Core keeps the agent API** and reports what agents do, through `parity.agents.onActivity`.
- **Core keeps the drawing primitives:**
  - `pointer`, with `travel` motion and `breathing`
  - `scan`
  - `label`, for measurements
  - `outline`, for boards an agent holds
  - colors through `parity.colors`, shared with people
- **The extension keeps the choreography:**
  - the queue and pacing
  - where a pointer goes for each step: glancing, focusing, travelling between targets
  - when it lingers and fades
  - which state and mode's frame to look at

**Why it's worth it:**
- It's the hardest test the overlay API will get. If agent presence can be built on it, comments, review links and
  multiplayer can too. Building it first finds what's missing before other extensions depend on the API.
- Multiplayer stops needing anything agent-specific. It uses agent presence's API, like any extension that depends on
  another.
- Someone who wants agents' pointers off can turn the extension off.

**What it costs:** the choreography is polished today, and moving it risks regressions. The existing stories
(`AgentPresence.stories.tsx`, `Agents.stories.tsx`) become the check that it looks the same before and after.

**Its API, for other extensions:**

```ts
/** What agent presence's `activateWindow` returns. */
export interface AgentPresenceApi {
  /** Plays another copy's agent's steps here, as this copy's own agents are played, with `from` keeping them apart. */
  play(steps: AgentStep[], options: { from: string }): void
}
```

## How the multiplayer extension uses it

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
  parity.camera.onChange((camera) => room.send({ camera }))
  parity.presence.onViewing((viewing) => room.send({ viewing }))
  parity.agents.onActivity((steps) => room.send({ agents: steps }))

  // Everyone else's pointer, selection and drags.
  room.onPerson((person) => {
    const pointer = (person.pointerOverlay ??= parity.canvas.pointer({ at: person.pointer.at, name: person.name, color: person.id }))
    pointer.update({ at: person.pointer.at, away: !person.pointer.over, detail: person.typing ? "Typing…" : undefined })
    person.syncOutlines((ref) => parity.canvas.outline(ref, { color: person.id, label: person.name }))
    person.syncPreview((gesture) =>
      parity.canvas.preview(
        gesture.targets.map(({ ref, offset }) => ({ ref, at: { attachedTo: pointer, offset } })),
        { color: person.id, label: person.name, drop: gesture.drop }
      )
    )
    if (following?.leader === person.id) following.update(person.camera)
  })
  room.onLeave((person) => parity.colors.release(person.id))
  room.onAgentSteps((steps, from) => agentPresence.play(steps, { from }))

  // Following.
  let following: (Following & { leader: string }) | undefined
  const follow = (id: string) => {
    const person = room.person(id)
    following = Object.assign(parity.camera.follow({ name: person.name, color: id }, person.camera), { leader: id })
    following.onEnd(() => (following = undefined))
  }
  const goTo = (id: string) => parity.camera.show(room.person(id).camera)

  // The avatar stack, as the extension's own React, with Parity's components.
  parity.subscriptions.push(
    parity.render({ widget: "multiplayer.people" }, <PeopleWidget room={room} onFollow={follow} onGoTo={goTo} />)
  )
}

// extension.ts: the Node half runs the relay, so the first copy on a machine serves the others.
export function activate(parity: Parity) {
  return { ensureRelay: (port: number) => startRelay(port) }
}
```

`PeopleWidget` subscribes to the room and renders `People` from "Extension UI".

## Speed

- **Function calls, not messages.** The window module calls Parity directly. Parity still checks what it's given at
  the API's edge, so a bad call fails with a clear error.
- **Batched per frame.** Overlay updates are drawn together once a frame. Events to the extension are coalesced per
  frame, keeping only the latest pointer and camera.
- **Animation is Parity's.** Pointers glide and travel, and previews follow their anchors, at the display's frame
  rate. The extension sends only where things go, a few times a second if it likes.
- **Bytes aren't copied.** Document bytes are handed over as they are.

## Trust and limits

- **Built-in extensions only** to start. Third-party window modules come with signing. Until then, third-party
  extensions get web views, which are sandboxed.
- **Watched on the main thread.** Parity counts each window module's long tasks (`long-tasks.ts` already finds them)
  and its render time:
  - Past a budget it says so: "Multiplayer is slowing the editor", with Disable.
  - Each place's React root has an error boundary. A crash shows "Multiplayer stopped working here" with Reload, and
    the rest of the window carries on.
- **Shown on install.** `presence`, `sync` and `agentActivity` are listed with what they allow: "See where your pointer
  is and what you're doing on the canvas", "Share this project's changes with other copies of Parity", "See what agents
  do in this project".
- **Places can't cover Parity's own UI.** Widgets stay in their places with their `maxSize`, overlays draw below
  Parity's selection and handles, and an extension's stylesheet is scoped to its own places.
- **Stopping an extension** removes its overlays, places and previews. If it brought the room, its project reopens from
  files.

## Open questions

1. **Avatar stack: top-right of the canvas or the title bar?** This draft puts it on the canvas (`canvasWidgets`). The
   title bar would need a place of its own.
2. **Which components go in `@parity-app/ui` first?** This draft lists about 25. Each one is a promise to keep, so the
   first list should be what extensions need now, not the whole kit.
3. **Order of work.** Moving agent presence onto the overlay API first proves the API before multiplayer builds on it,
   but it delays multiplayer by that move.
4. **More than one window per project.** A project opens in one window today, so `parity.window` is one half. If a
   project can open in two, it becomes a list.
