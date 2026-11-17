import {
  CanvasLayerContext,
  type CanvasLayerContextValue,
  createFrameLoop,
  type FrameLoop
} from "@parity-app/canvas-layer"
import type {
  CoreCanvas,
  CorePreviewOptions,
  LayerRequest,
  WindowCanvasPort
} from "@parity-app/extension-host/window-canvas"
import type { LayerOptions } from "@parity-app/extension/internal"
import {
  Activity,
  Component,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from "react"
import { react } from "tldraw"
import { holds } from "./canvas/board-holds.ts"
import { ProjectContext } from "./canvas/context.ts"
import { preview, type PreviewOptions } from "./canvas/drag-preview.ts"
import { agentColors, personColors } from "./canvas/surface/colors.ts"
import { surfaceOf } from "./canvas/surface/index.ts"
import { type ProjectPart, projectPart } from "./project-part.ts"
import { createStore, type Store, useStore } from "./store.ts"
import type { ProjectSession } from "./workspace.ts"

/*
 * Internal extensions' layers on a project tab's canvas (`parity.canvas.layer`), and the tab's core canvas services as
 * `windowCanvas` takes them (docs/proposals/extensions-in-the-window.md). Each layer is drawn by a host in the canvas
 * area, in the tab's own React tree, so Parity's theme, kit and portals reach it. Page layers move with the camera;
 * edge layers sit in a corner of the screen, clear of the toolbar and zoom controls. Each has its own error boundary,
 * and pauses while its tab is hidden.
 */

type Order = LayerOptions["order"]

/** A layer as its host keeps it. */
interface Drawn extends LayerRequest {
  key: number
}

/** A tab's layers, which its hosts draw, and its frames, kept with its session and stopped as it closes. */
interface TabLayers extends ProjectPart {
  drawn: Store<readonly Drawn[]>
  /** The tab's frames, for `useFrame`, paused while it's hidden. */
  frames: FrameLoop
  add(layer: LayerRequest): () => void
}

const layersOf = projectPart<Pick<ProjectSession, "untilClosed">, TabLayers>(() => {
  const drawn = createStore<readonly Drawn[]>(() => [])
  const frames = createFrameLoop()
  let next = 0

  return {
    drawn,
    frames,
    add(layer) {
      next += 1
      const added: Drawn = { ...layer, key: next }
      drawn.update((now) => [...now, added])

      return () => drawn.update((now) => now.filter((each) => each !== added))
    },
    dispose: () => frames.dispose()
  }
})

/** The tab's canvas services, for its window modules' `parity.canvas`, `parity.camera` and `parity.colors`. */
export function windowCanvasPort(session: ProjectSession, tab: string): WindowCanvasPort {
  const canvas = (): CoreCanvas | undefined => {
    const { editor } = session
    const surface = editor && surfaceOf(editor)

    return editor && surface
      ? {
          camera: surface.camera,
          measure: surface,
          zoom: () => editor.getZoomLevel()
        }
      : undefined
  }

  return {
    canvas,
    onCanvas(listener) {
      let editor = session.editor

      // The canvas's surface starts as it mounts, before the tab is given its editor, and stops before it's taken.
      return session.subscribe(() => {
        if (session.editor !== editor) {
          editor = session.editor
          listener()
        }
      })
    },
    addLayer: (layer) => layersOf(session).add(layer),
    preview(items, options) {
      const { editor } = session

      if (!editor) {
        throw new Error("canvas.preview needs the tab's canvas, which hasn't mounted yet")
      }

      const area = editor.getContainer().closest<HTMLElement>(".canvas-area") ?? editor.getContainer()
      const surface = { tab, area, editor, doc: session.doc, writes: session.doc }
      const shown = preview(surface, items, { ...options, drop: dropOf(session, options.drop) })

      return {
        // A drop is changed only when the update gives one, so changing a color or label keeps where it would land.
        update(next, given) {
          if (!given) {
            shown.update(next)

            return
          }

          const { drop, ...rest } = given
          shown.update(next, "drop" in given ? { ...rest, drop: dropOf(session, drop) } : rest)
        },
        settleOnWrite: () => shown.settleOnWrite(),
        cancel: () => shown.cancel(),
        onEnd: (listener) => ({ dispose: shown.onEnd(listener) }),
        [Symbol.dispose]: () => shown[Symbol.dispose]()
      }
    },
    hold: (design, at, extension) => holds.hold(tab, design, at, extension),
    colors: { people: personColors, agents: agentColors },
    isDesign: (key) => session.doc.design(key) !== undefined
  }
}

/** Where dragged layers would land, as a core preview takes it: a drop into a design itself lands in its root layer. */
function dropOf(session: ProjectSession, drop: CorePreviewOptions["drop"]): PreviewOptions["drop"] {
  const parent = drop && (drop.parent.node ?? session.doc.design(drop.parent.design)?.root.id)

  return drop && parent !== undefined ? { ...drop, design: drop.parent.design, parent } : undefined
}

/** Whether the canvas's tab is the one shown, which its layers pause without. */
export const CanvasShown = createContext(true)

/** Draws the tab's layers of one order: put once in the canvas area for each. */
export function WindowLayers({ order }: { order: Order }) {
  const session = useContext(ProjectContext)
  const shown = useContext(CanvasShown)

  if (!session) {
    return null
  }

  return <TabLayersOf session={session} order={order} shown={shown} />
}

function TabLayersOf({ session, order, shown }: { session: ProjectSession; order: Order; shown: boolean }) {
  const layers = layersOf(session)
  const all = useStore(layers.drawn)
  const editing = useSyncExternalStore(session.selection.subscribe, () => session.selection.getEditing() !== undefined)

  useEffect(() => layers.frames.setVisible(shown), [layers, shown])

  const drawn = all.filter((layer) => layer.options.order === order)

  if (drawn.length === 0) {
    return null
  }

  const mode = shown ? "visible" : "hidden"

  if (order === "edge") {
    return (
      <div className="pointer-events-none absolute inset-0 z-[380] overflow-hidden [&_[data-canvas-interactive]]:pointer-events-auto">
        {drawn.map((layer) => (
          <div key={layer.key} className={`absolute ${placements[placementOf(layer.options)]}`}>
            <Activity mode={mode}>
              <Layer layer={layer} frames={layers.frames} />
            </Activity>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden [&_[data-canvas-interactive]]:pointer-events-auto ${pageOrders[order]}`}
    >
      <OnThePage session={session}>
        {drawn.map((layer) => (
          <Activity
            key={layer.key}
            mode={layer.options.space === "page" && layer.options.hideWhileEditing && editing ? "hidden" : mode}
          >
            <Layer layer={layer} frames={layers.frames} />
          </Activity>
        ))}
      </OnThePage>
    </div>
  )
}

/** Where each page order sits among the canvas area's own layers. */
const pageOrders: Record<Exclude<Order, "edge">, string> = {
  // Behind tldraw's shapes: drawn inside its background (see `CanvasEditor`'s `Background`).
  underDesigns: "",
  // Over the boards and their frames, under the outlines and handles (`CanvasOverlay`, z-300).
  overDesigns: "z-[250]",
  // Over the outlines and handles, under the toolbar and zoom controls (z-400).
  overSelection: "z-[350]"
}

type Placement = Extract<LayerOptions, { space: "screen" }>["placement"]

/** Where each edge placement sits: clear of the zoom controls at the top right and the toolbar along the bottom. */
const placements: Record<Placement, string> = {
  topLeft: "top-3 left-3",
  topRight: "top-14 right-3",
  bottomLeft: "bottom-3 left-3",
  bottomRight: "bottom-3 right-3",
  bottom: "bottom-20 left-1/2 -translate-x-1/2"
}

function placementOf(options: LayerOptions): Placement {
  return options.space === "screen" ? options.placement : "topLeft"
}

/** Children placed in page coordinates, moved with the camera without drawing them again. */
function OnThePage({ session, children }: { session: ProjectSession; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null)
  const editor = useSyncExternalStore(session.subscribe, () => session.editor)

  useEffect(() => {
    const element = page.current

    if (!editor || !element) {
      return
    }

    // The page's point (x, y) is drawn at ((x + camera.x) * zoom, (y + camera.y) * zoom) on the screen, as tldraw's.
    return react("window layers camera", () => {
      const { x, y, z } = editor.getCamera()
      element.style.transform = `scale(${z}) translate(${x}px, ${y}px)`
    })
  }, [editor])

  return (
    <div ref={page} className="absolute top-0 left-0 origin-top-left">
      {children}
    </div>
  )
}

/** One layer: its context for the hooks, and its own error boundary, counted against its extension. */
function Layer({ layer, frames }: { layer: Drawn; frames: FrameLoop }) {
  const context = useMemo<CanvasLayerContextValue>(
    () => ({ ...layer.reads, frame: (frame) => frames.add(frame, layer.failed) }),
    [layer, frames]
  )

  // SAFETY: what an extension draws is what React renders; `LayerChildren` types it without React.
  const children = layer.children as ReactNode

  return (
    <LayerBoundary failed={layer.failed}>
      <CanvasLayerContext value={context}>{children}</CanvasLayerContext>
    </LayerBoundary>
  )
}

/** A layer's render that throws draws nothing, and counts as its extension's failure. */
class LayerBoundary extends Component<{ failed: (error: Error) => void; children: ReactNode }, { broken: boolean }> {
  override state = { broken: false }

  static getDerivedStateFromError() {
    return { broken: true }
  }

  override componentDidCatch(error: Error): void {
    this.props.failed(error)
  }

  override render(): ReactNode {
    return this.state.broken ? null : this.props.children
  }
}
