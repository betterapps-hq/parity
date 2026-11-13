import { type FrameGeometry, type RenderNode, type ResolvedMode, withClasses } from "@parity-app/core"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { renderJobMode } from "../shared/render-job.ts"
import { reportFrameFailures } from "./failures-store.ts"
import { frameClasses } from "./frame-classes.ts"
import { blurFrame, type MountedFrame, mountFrame } from "./frame-host.ts"
import type { FrameMode } from "./frame-setup.ts"
import { registerFrame, setFrameViewport } from "./frame.ts"
import type { LoadedGuest } from "./guest.ts"

interface ModeViewProps {
  /** The project, by id, whose console lists the frame's failing layers. */
  project: string
  loaded: LoadedGuest
  tree: RenderNode[]
  mode: ResolvedMode
  /**
   * The frame's size in CSS pixels and the window it stands for, from core's `frameGeometry`, as the offscreen renderer
   * gets them too. A fixed height clips the frame; without one it's as tall as its content.
   */
  frame: FrameGeometry
  /** Drawn size relative to the frame's. Layout inside always happens at the full size. */
  scale?: number
  /** Identify the frame, so selection, outlines and agents can find it. */
  design: string
  state: string
  primary?: boolean
  /** Changes when interacting with the canvas stops, to start the frame afresh from the design. */
  interactions?: number
  /**
   * Whether the design takes the pointer and keys, as in Interact. Otherwise the frame is inert: Tab, focus and a
   * component's own focus calls never reach its inputs or buttons, so the canvas keeps its keys. Measuring it for
   * selection, hover and outlines goes by layout boxes, which inert leaves alone.
   */
  interactive?: boolean
  /**
   * The frame draws nothing, keeping its size and its host, which selection, outlines and agents still find (see
   * canvas/frame-sleep.ts). Its design is mounted again when it wakes.
   */
  asleep?: boolean
  /**
   * What the frame's design renders, as the canvas keys it (`drawn` in canvas/frame-bitmaps.ts): when it changes, the
   * design is drawn again in place, as when the guest's code changed under the same tree. Without it, the tree and the
   * mode key it.
   */
  shows?: string
  /**
   * Hears when the frame has drawn its design, with the element it's drawn in, each time it's mounted. What it gives
   * back is called when the frame is taken apart.
   */
  onDrawn?: (drawn: HTMLElement) => (() => void) | undefined
}

/** What the canvas and tldraw would otherwise act on too, when the pointer or keys are the design's. */
const designEvents = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "contextmenu",
  "keydown",
  "keyup"
]

/**
 * Renders one resolved design in one mode inside its own shadow root, exactly as wide as its frame. Scaling uses CSS
 * `zoom`, which shrinks the drawing without changing the width the content lays out in.
 */
export function ModeView({
  project,
  loaded,
  tree,
  mode,
  frame,
  scale = 1,
  design,
  state,
  primary = false,
  interactions = 0,
  interactive = false,
  asleep = false,
  shows,
  onDrawn
}: ModeViewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef<MountedFrame>(undefined)
  const { width, height } = frame
  // The window the frame stands for, which the project's viewport units and window size checks measure.
  const { width: viewportWidth, height: viewportHeight } = frame.viewport
  const viewportRef = useRef({ width: viewportWidth, height: viewportHeight })
  // A whole screen's tree, so it's written out only when it's a different one.
  const treeKey = useMemo(() => JSON.stringify(tree), [tree])
  // The mode as the offscreen page gets it too, less its size, which resizes the frame without building it again.
  const { classNames, attributes, globals, touch } = renderJobMode(mode, frame)
  const environmentKey = JSON.stringify({ classNames, attributes, globals, touch })
  const renderKey = shows ?? `${environmentKey}|${treeKey}`
  // In a project whose styling framework writes classes, a layer is drawn with them once they're written (PAR-942).
  const classes = useMemo(() => frameClasses(project, loaded), [project, loaded])
  const written = useSyncExternalStore(classes.subscribe, classes.revision)
  // Errors belong to the render that raised them, so a changed design starts clean.
  const [error, setError] = useState<{ key: string; message: string }>()

  const currentKey = useRef(renderKey)
  const onDrawnRef = useRef(onDrawn)
  useLayoutEffect(() => {
    onDrawnRef.current = onDrawn
  }, [onDrawn])

  // The frame's failing layers show in the console and mark Layers. Asleep, it keeps the ones it last drew with; gone, it
  // takes them back.
  const [failuresKey] = useState(() => ({}))
  const placeRef = useRef({ project, design, state, mode: mode.id })
  useLayoutEffect(() => {
    placeRef.current = { project, design, state, mode: mode.id }
  }, [project, design, state, mode.id])
  useEffect(
    () => () => reportFrameFailures(project, design, failuresKey, { state, mode: mode.id }, []),
    [project, design, state, mode.id, failuresKey]
  )

  // Selecting, outlining and agents find a design's frames from an index, not by searching the canvas. It's a layout
  // effect, so the frame is in it as soon as it's on the page.
  useLayoutEffect(() => registerFrame(hostRef.current!, design), [design])

  // Clicks and keys that reach a design are its own. They stop at the frame, so the canvas doesn't select, drag or run a
  // shortcut as well. An Escape the design has no use for steps out of it, so the next one reaches the canvas.
  useEffect(() => {
    const host = hostRef.current!

    const stop = (event: Event) => {
      event.stopPropagation()

      if (
        event instanceof KeyboardEvent &&
        event.type === "keydown" &&
        event.key === "Escape" &&
        !event.defaultPrevented
      ) {
        blurFrame(host)
      }
    }

    for (const type of designEvents) {
      host.addEventListener(type, stop)
    }

    return () => {
      for (const type of designEvents) {
        host.removeEventListener(type, stop)
      }
    }
  }, [])

  // A frame that stops taking keys lets go of focus at once, rather than whenever the browser gets round to it.
  useEffect(() => {
    if (!interactive) {
      blurFrame(hostRef.current!)
    }
  }, [interactive])

  // A resized frame keeps its components and their state, as a resized browser window does. This comes before the frame
  // is built, so one rebuilt at the same time starts at the new size.
  useEffect(() => {
    const viewport = { width: viewportWidth, height: viewportHeight }
    viewportRef.current = viewport

    if (mountedRef.current) {
      mountedRef.current.resize(viewport)
    } else {
      setFrameViewport(hostRef.current!, viewport)
    }
  }, [viewportWidth, viewportHeight])

  // The frame is rebuilt when its environment changes, and after interacting, which leaves components in states the
  // design doesn't have; a changed design updates in place, keeping component state. Asleep, it's taken apart.
  useEffect(() => {
    if (asleep) {
      return undefined
    }

    // SAFETY: `environmentKey` is the mode less its viewport as JSON, made above.
    const environment = JSON.parse(environmentKey) as Omit<FrameMode, "viewport">
    const host = hostRef.current!

    const mounted = mountFrame(host, {
      loaded,
      mode: { ...environment, viewport: viewportRef.current },
      sheets: [classes.sheet],
      // A component's boundary draws its own error in its place, and the layer is marked, so only an error that stopped
      // the frame drawing is shown over it.
      onError: (reason, layer) => {
        if (layer) {
          return
        }

        setError({ key: currentKey.current, message: reason instanceof Error ? reason.message : String(reason) })
      },
      onFailures: (failures) => {
        const place = placeRef.current
        reportFrameFailures(
          place.project,
          place.design,
          failuresKey,
          { state: place.state, mode: place.mode },
          failures
        )
      }
    })

    mountedRef.current = mounted
    let undraw: (() => void) | undefined

    const waiting = onDrawnRef.current
      ? mounted.whenDrawn((target) => (undraw = onDrawnRef.current?.(target)))
      : undefined

    // Until it's drawn again, the frame keeps the height it had, so its board doesn't shrink and grow back. The design
    // draws as it mounts, just after this, so by the next animation frame it has its own height.
    const outer = frameRef.current!
    const held = requestAnimationFrame(() => outer.style.removeProperty("min-height"))

    return () => {
      cancelAnimationFrame(held)
      waiting?.()
      undraw?.()

      // In a tab that isn't showing, nothing is laid out: the frame keeps the height it last had when drawn (see the
      // `contain-intrinsic-size` rule on `[data-frame]`), rather than holding none.
      if (outer.getClientRects().length > 0) {
        outer.style.minHeight = `${outer.offsetHeight}px`
      }

      mountedRef.current = undefined
      // The guest lets go just after, so never inside one of the canvas's commits, should the two share a React.
      mounted.unmount({ soon: true })
    }
  }, [loaded, classes, environmentKey, interactions, asleep, failuresKey])

  useEffect(() => {
    currentKey.current = renderKey
    // SAFETY: `treeKey` is the design's tree as JSON, made above.
    const resolved = JSON.parse(treeKey) as RenderNode[]
    // Each element with the classes written for its declarations; one still without them keeps its rule.
    const drawn = withClasses(resolved, classes.classesFor)

    // The frame's rules change in the same task as its elements, which the guest draws just after, before a paint.
    mountedRef.current?.update(drawn)
  }, [loaded, classes, written, environmentKey, treeKey, renderKey, interactions, asleep])

  const message = error?.key === renderKey ? error.message : undefined

  // A frame is a browser's viewport: square corners, and nothing cut off except below a device's height, where a browser
  // would scroll. A frame that grows with its content shows all of it, shadows and popups included.
  return (
    <div
      ref={frameRef}
      className={`mode-frame relative shadow-lg ring-1 ring-black/15 ${height === undefined ? "" : "overflow-hidden"}`}
      style={{
        width: Math.round(width * scale),
        height: height === undefined ? undefined : Math.round(height * scale)
      }}
    >
      <div
        ref={hostRef}
        data-frame=""
        data-design={design}
        data-mode={mode.id}
        data-state={state}
        data-primary={primary}
        data-viewport={mode.viewport}
        inert={!interactive}
        style={{ width, height, zoom: scale }}
      />
      {/* Across the top, so whatever the frame still drew, as when a decorator failed, stays in view below it. */}
      {message && (
        <div
          role="alert"
          className="mode-error absolute inset-x-0 top-0 max-h-1/2 overflow-auto bg-destructive/90 p-3 type-code font-mono whitespace-pre-wrap text-white"
        >
          {message}
        </div>
      )}
    </div>
  )
}
