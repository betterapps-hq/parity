import type { Disposable, NodeRef } from "@parity-app/extension"
import type {
  BoxOptions,
  BoxResult,
  Camera,
  CameraView,
  CanvasSurface,
  ColorKey,
  Colors,
  FollowEnd,
  Held,
  LayerChildren,
  LayerOptions,
  Palette,
  Point,
  Preview,
  PreviewItem,
  PreviewOptions,
  Rect,
  WindowColors
} from "@parity-app/extension/internal"
import type { SurfaceContext, WindowSurface } from "./window-modules.ts"

/*
 * What a window module draws on the canvas with (docs/proposals/extensions-in-the-window.md): `parity.canvas`,
 * `parity.camera` and `parity.colors`, for one project tab. Each extension gets its own, over the tab's core services,
 * which the window gives as a port: the camera and following, measuring, previews, holds and colors. What an extension
 * opens here (layers, followings, previews, holds, color claims, listeners) is its own, and goes when it stops in the
 * tab. The canvas mounts after the window modules start, and again when the project reopens, so what's listened to is
 * kept across mounts.
 */

/** A design on the canvas, or a node in it, as the core services name them. */
export interface CanvasTarget {
  design: string
  node?: string
}

/** The tab's camera service, as `@parity-app/editor`'s `createCamera` makes it. */
export interface CoreCamera {
  get(): CameraView
  onChange(listener: (view: CameraView) => void): Disposable
  show(view: CameraView, options?: { animate?: boolean }): Promise<void>
  follow(view: CameraView, options?: { owner?: string }): CoreFollowing
}

export interface CoreFollowing extends Disposable {
  update(view: CameraView): void
  onEnd(listener: (why: FollowEnd) => void): Disposable
  readonly active: boolean
}

/** The tab's measuring service, as `@parity-app/editor`'s `createMeasure` makes it. */
export interface CoreMeasure {
  box(target: CanvasTarget, options?: BoxOptions): BoxResult
  onBoxChange(target: CanvasTarget, listener: (box: BoxResult) => void, options?: BoxOptions): Disposable
  hit(at: Point): { design: string; node?: string } | undefined
  pageToScreen(at: Point): Point
  screenToPage(at: Point): Point
}

/** The tab's canvas while it's mounted. */
export interface CoreCanvas {
  camera: CoreCamera
  measure: CoreMeasure
  /** Screen pixels to a page unit. */
  zoom(): number
}

/** A node in a core preview. */
export interface CorePreviewItem {
  target: CanvasTarget
  at: Point
  state?: string
  mode?: string
}

export interface CorePreviewOptions {
  drop?: { parent: CanvasTarget; index: number; state?: string; mode?: string }
  color: Palette
  label?: string
  /** What shows it, for `dragPreview.settled`. */
  extension: string
}

/** A core preview, as `canvas/drag-preview.ts` makes it. */
export interface CorePreview {
  update(items: CorePreviewItem[], options?: Partial<CorePreviewOptions>): void
  settleOnWrite(): void
  cancel(): void
  /** Hears it end, however it does: settled by its write or its timeout, called off, or disposed. */
  onEnd(listener: () => void): Disposable
  [Symbol.dispose](): void
}

/** A core hold, as `canvas/board-holds.ts` makes it. */
export interface CoreHeld {
  update(at: Point): void
  release(): void
  [Symbol.dispose](): void
}

/** One list of the window's colors, as `@parity-app/presence-colors`'s `createColors` makes it. */
export interface CoreColors {
  claim(key: ColorKey, owner?: string): Palette
  release(key: ColorKey, owner?: string): void
  releaseAll(owner: string): void
  assign(key: ColorKey, n: number): void
  palette(n: number): Palette
  readonly tuned: number
}

/** What a layer's hooks read (`@parity-app/canvas-layer`): the camera, boxes and colors, as its extension's. */
export interface LayerReads {
  /** The camera now, and its zoom. An empty view at zoom 1 before the canvas has mounted. */
  view(): { zoom: number; view: Rect }
  /** Told when the camera changes, at most once a frame, across the canvas mounting again. */
  onView(listener: () => void): Disposable
  box(ref: NodeRef, options?: BoxOptions): BoxResult
  onBoxChange(ref: NodeRef, listener: (box: BoxResult) => void, options?: BoxOptions): Disposable
  colors: WindowColors
  /** The palette `key` holds now, or would be given, without claiming it. */
  color(key: ColorKey, list: "people" | "agents"): Palette
  /** Told when a key is assigned a number, which can move what any key holds. */
  onColors(listener: () => void): Disposable
}

/** A layer for the window to draw. */
export interface LayerRequest {
  id: string
  extension: string
  options: LayerOptions
  children: LayerChildren
  reads: LayerReads
  /** Its render threw, caught by its error boundary. */
  failed: (error: Error) => void
}

/** The tab's canvas services, as the window gives them. */
export interface WindowCanvasPort {
  /** Whether `key` is a design's, to tell a design's key holding a slash from a layer's. */
  isDesign?: (key: string) => boolean
  /** The tab's canvas, while it's mounted. */
  canvas(): CoreCanvas | undefined
  /** Told each time the tab's canvas mounts or unmounts. Returns what stops it. */
  onCanvas(listener: () => void): () => void
  /** Draws a layer until the function it gives is called. */
  addLayer(layer: LayerRequest): () => void
  preview(items: CorePreviewItem[], options: CorePreviewOptions): CorePreview
  hold(design: string, at: Point, extension: string): CoreHeld
  colors: { people: CoreColors; agents: CoreColors }
}

const emptyView: CameraView = { x: 0, y: 0, width: 0, height: 0 }

/**
 * Where a `NodeRef` is on the canvas: a design's board, or a layer in it. A design's key can hold a slash, so a layer's
 * `designKey/layerId` is split at the first slash that leaves a design's key, when `isDesign` says which are.
 */
export function targetOf(ref: NodeRef, isDesign?: (key: string) => boolean): CanvasTarget {
  if (ref.owner !== "design") {
    throw new Error(`${ref.owner}'s ${ref.type} isn't on the canvas: only designs and their layers are`)
  }

  if (ref.type === "design") {
    return { design: ref.key }
  }

  const first = ref.key.indexOf("/")

  if (first <= 0 || first === ref.key.length - 1) {
    throw new Error(`A layer's key is designKey/layerId, not ${ref.key}`)
  }

  for (let at = first; isDesign && at !== -1 && at < ref.key.length - 1; at = ref.key.indexOf("/", at + 1)) {
    if (isDesign(ref.key.slice(0, at))) {
      return { design: ref.key.slice(0, at), node: ref.key.slice(at + 1) }
    }
  }

  return { design: ref.key.slice(0, first), node: ref.key.slice(first + 1) }
}

/**
 * The surfaces a tab's window modules draw on the canvas with, by their names on `WindowParity`, for
 * `windowModules`'s `surfaces`.
 */
export function windowCanvas(port: WindowCanvasPort): Record<"canvas" | "camera" | "colors", WindowSurface> {
  /** Layers in this tab, by id, across every extension. */
  const layers = new Set<string>()
  /** Each extension's own, made once per run whichever surface it reads first. */
  const made = new WeakMap<SurfaceContext, Own>()

  const own = (context: SurfaceContext) => {
    const found = made.get(context) ?? ownFor(port, context, layers)
    made.set(context, found)

    return found
  }

  return {
    canvas: { capability: "canvas", make: (context) => own(context).canvas },
    camera: { capability: "camera", make: (context) => own(context).camera },
    colors: { make: (context) => own(context).colors }
  }
}

interface Own {
  canvas: CanvasSurface
  camera: Camera
  colors: WindowColors
}

function ownFor(port: WindowCanvasPort, context: SurfaceContext, layers: Set<string>): Own {
  const { extension } = context
  /** What it has open: layers, listeners, followings, previews and holds, each closed when it stops in the tab. */
  const open = new Set<Disposable>()
  let ended = false

  context.onEnd(() => {
    ended = true

    for (const each of [...open].toReversed()) {
      each.dispose()
    }
  })

  /** Something it opened, closed when it stops in the tab unless it's closed first. */
  const keep = (dispose: () => void): Disposable => {
    const handle = once(() => {
      open.delete(handle)
      dispose()
    })

    // Opened after it stopped, as an activation that resumes late can: closed at once.
    if (ended) {
      handle.dispose()
    } else {
      open.add(handle)
    }

    return handle
  }

  /**
   * Calls `attach` with the canvas now, if it's mounted, and again each time it mounts, disposing what it gave as the
   * canvas goes. `again` runs after a mount that isn't the first.
   */
  const whileMounted = (attach: (canvas: CoreCanvas) => Disposable, again?: () => void): Disposable => {
    let attached = port.canvas()
    let current = attached && attach(attached)
    let ended = false

    const stop = port.onCanvas(() => {
      const canvas = port.canvas()

      if (canvas === attached || ended) {
        return
      }

      current?.dispose()
      attached = canvas
      current = canvas && attach(canvas)

      if (canvas) {
        again?.()
      }
    })

    return keep(() => {
      ended = true
      stop()
      current?.dispose()
    })
  }

  const mounted = (api: string) => {
    const canvas = port.canvas()

    if (!canvas) {
      throw new Error(`${api} needs the tab's canvas, which hasn't mounted yet`)
    }

    return canvas
  }

  const colors = colorsFor(port, context)

  const camera: Camera = {
    get: () => port.canvas()?.camera.get() ?? emptyView,
    onChange(listener) {
      const heard = context.listener("camera.onChange", listener)

      return whileMounted(
        (canvas) => canvas.camera.onChange(heard),
        () => heard(port.canvas()?.camera.get() ?? emptyView)
      )
    },
    show: async (view, options) => mounted("camera.show").camera.show(view, options),
    follow(view) {
      const following = mounted("camera.follow").camera.follow(view, { owner: extension })
      const kept = keep(() => following.dispose())

      return {
        update: (next) => following.update(next),
        onEnd: (listener) => following.onEnd(context.listener("Following.onEnd", listener)),
        dispose: () => kept.dispose()
      }
    }
  }

  const reads: LayerReads = {
    view: () => {
      const canvas = port.canvas()

      return canvas ? { zoom: canvas.zoom(), view: canvas.camera.get() } : { zoom: 1, view: emptyView }
    },
    onView: (listener) =>
      whileMounted(
        (canvas) => canvas.camera.onChange(() => listener()),
        () => listener()
      ),
    box: (ref, options) => port.canvas()?.measure.box(targetOf(ref, port.isDesign), options) ?? { kind: "missing" },
    onBoxChange: (ref, listener, options) => {
      const target = targetOf(ref, port.isDesign)

      return whileMounted(
        (canvas) => canvas.measure.onBoxChange(target, listener, options),
        () => listener(port.canvas()?.measure.box(target, options) ?? { kind: "missing" })
      )
    },
    colors,
    color: (key, list) => peek(list === "agents" ? port.colors.agents : port.colors.people, key),
    onColors(listener) {
      const stopPeople = onAssigned(port.colors.people, listener)
      const stopAgents = onAssigned(port.colors.agents, listener)

      return keep(() => {
        stopPeople()
        stopAgents()
      })
    }
  }

  const canvas: CanvasSurface = {
    layer(options, children) {
      if (layers.has(options.id)) {
        throw new Error(`A layer called ${options.id} is drawn in this tab already`)
      }

      layers.add(options.id)

      const remove = port.addLayer({
        id: options.id,
        extension,
        options,
        children,
        reads,
        failed: (error) => context.failed(`layer:${options.id}`, error)
      })

      return keep(() => {
        layers.delete(options.id)
        remove()
      })
    },
    get camera() {
      context.need("camera", "parity.canvas.camera")

      return camera
    },
    box: (ref, options) => reads.box(ref, options),
    onBoxChange: (ref, listener, options) =>
      reads.onBoxChange(ref, context.listener("canvas.onBoxChange", listener), options),
    hit: (at) => port.canvas()?.measure.hit(at),
    pageToScreen: (at) => mounted("canvas.pageToScreen").measure.pageToScreen(at),
    screenToPage: (at) => mounted("canvas.screenToPage").measure.screenToPage(at),
    preview: (items, options) => previewFor(port, context, colors, keep, items, options),
    hold(design, at) {
      context.need("hold", "parity.canvas.hold")
      const held = port.hold(design, at, extension)
      const kept = keep(() => held[Symbol.dispose]())

      const handle: Held = {
        update: (next) => held.update(next),
        release: () => {
          held.release()
          kept.dispose()
        },
        dispose: () => kept.dispose()
      }

      return handle
    }
  }

  return { canvas, camera, colors }
}

/** Who hears of each list's assignments. The window's lists are shared by its tabs, so this is too. */
const assignedListeners = new WeakMap<CoreColors, Set<() => void>>()

function onAssigned(core: CoreColors, listener: () => void): () => void {
  const listeners = assignedListeners.get(core) ?? new Set()
  assignedListeners.set(core, listeners)
  listeners.add(listener)

  return () => listeners.delete(listener)
}

function tellAssigned(core: CoreColors): void {
  for (const listener of Array.from(assignedListeners.get(core) ?? [])) {
    listener()
  }
}

/**
 * An extension's colors in this tab: its claims are counted, so a key it claims twice keeps its color until it has
 * released it twice, and all of them are given back when it stops here.
 */
function colorsFor(port: WindowCanvasPort, context: SurfaceContext): WindowColors {
  const list = (core: CoreColors): Colors => {
    // The window's colors are shared by its tabs, so an extension's claims are its own in each tab.
    const owner = `${context.extension}\n${context.tab}`
    const counts = new Map<ColorKey, number>()
    let ended = false

    // Only what this run claimed is given back: a run started since in the tab shares the owner, and keeps its claims.
    context.onEnd(() => {
      ended = true

      for (const key of counts.keys()) {
        core.release(key, owner)
      }

      counts.clear()
    })

    return {
      claim(key) {
        // Claimed after it stopped, as an activation that resumes late can: the palette, under an owner of its own, so
        // a run started since keeps its claims.
        if (ended) {
          return peek(core, key)
        }

        counts.set(key, (counts.get(key) ?? 0) + 1)

        return core.claim(key, owner)
      },
      release(key) {
        const count = counts.get(key) ?? 0

        if (count > 1) {
          counts.set(key, count - 1)

          return
        }

        if (count === 1) {
          counts.delete(key)
          core.release(key, owner)
        }
      },
      assign(key, n) {
        core.assign(key, n)
        tellAssigned(core)
      },
      palette: (n) => core.palette(n),
      get tuned() {
        return core.tuned
      }
    }
  }

  const people = list(port.colors.people)

  return Object.assign(people, { agents: list(port.colors.agents) })
}

/** A preview of someone's drag, with their color claimed while it lasts. */
function previewFor(
  port: WindowCanvasPort,
  context: SurfaceContext,
  colors: Colors,
  keep: (dispose: () => void) => Disposable,
  items: PreviewItem[],
  options: PreviewOptions
): Preview {
  let color = options.color
  /** Shown, settling once `settleOnWrite` is called, then ended. */
  let phase: "shown" | "settling" | "ended" = "shown"

  const itemsOf = (given: PreviewItem[]): CorePreviewItem[] =>
    given.map(({ ref, at, state, mode }) => {
      const item: CorePreviewItem = { target: targetOf(ref, port.isDesign), at }

      if (state !== undefined) {
        item.state = state
      }

      if (mode !== undefined) {
        item.mode = mode
      }

      return item
    })

  const optionsOf = (given: Partial<PreviewOptions>): Partial<CorePreviewOptions> => {
    const mapped: Partial<CorePreviewOptions> = {}

    if (given.color !== undefined) {
      mapped.color = colors.claim(given.color)
    }

    if (given.label !== undefined) {
      mapped.label = given.label
    }

    if (given.drop !== undefined) {
      const { parent, index, state, mode } = given.drop
      const drop: NonNullable<CorePreviewOptions["drop"]> = { parent: targetOf(parent, port.isDesign), index }

      if (state !== undefined) {
        drop.state = state
      }

      if (mode !== undefined) {
        drop.mode = mode
      }

      mapped.drop = drop
    }

    return mapped
  }

  const first = optionsOf(options)

  const core = port.preview(itemsOf(items), {
    ...first,
    color: first.color ?? colors.claim(color),
    extension: context.extension
  })

  /** What the extension stopping in the tab closes, until it ends: kept once `preview` is made. */
  const kept: Disposable[] = []

  // It ends when the core preview does: at once when called off or disposed, and once settled when it settles, so
  // its color is held and the extension stopping still closes it while it waits for its write.
  const stopEnd = core.onEnd(() => {
    if (phase === "ended") {
      return
    }

    phase = "ended"
    stopEnd.dispose()
    colors.release(color)

    for (const each of kept) {
      each.dispose()
    }
  })

  const preview: Preview = {
    update(next, given) {
      if (phase !== "shown") {
        return
      }

      const before = color
      const mapped = given ? optionsOf(given) : undefined

      if (given?.color !== undefined) {
        color = given.color
      }

      core.update(itemsOf(next), mapped)

      if (given?.color !== undefined) {
        colors.release(before)
      }
    },
    settleOnWrite() {
      if (phase === "shown") {
        phase = "settling"
        core.settleOnWrite()
      }
    },
    cancel() {
      if (phase !== "ended") {
        core.cancel()
      }
    },
    dispose() {
      if (phase !== "ended") {
        core[Symbol.dispose]()
      }
    }
  }

  // Kept only now, since a module that has stopped already has it closed at once.
  kept.push(keep(() => preview.dispose()))

  return preview
}

/**
 * The palette `key` holds now, or would be given: claimed and given back at once under an owner of its own, which
 * leaves every other claim as it was.
 */
function peek(colors: CoreColors, key: ColorKey): Palette {
  const palette = colors.claim(key, peeking)
  colors.release(key, peeking)

  return palette
}

const peeking = "parity:peek"

function once(dispose: () => void): Disposable {
  let done = false

  return {
    dispose() {
      if (!done) {
        done = true
        dispose()
      }
    }
  }
}
