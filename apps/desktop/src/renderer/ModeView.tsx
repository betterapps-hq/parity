import { type FrameGeometry, type MountHandle, modeGlobals, type RenderNode, type ResolvedMode } from "@parity-app/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { prepareFrame, setDrawnNodes, setFrameViewport } from "./frame.ts"
import type { LoadedGuest } from "./guest.ts"

interface ModeViewProps {
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
  shows
}: ModeViewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MountHandle>(undefined)
  const { width, height } = frame
  // The window the frame stands for, which the project's viewport units and window size checks measure.
  const { width: viewportWidth, height: viewportHeight } = frame.viewport
  const viewportRef = useRef({ width: viewportWidth, height: viewportHeight })
  // A whole screen's tree, so it's written out only when it's a different one.
  const treeKey = useMemo(() => JSON.stringify(tree), [tree])
  const environmentKey = JSON.stringify([mode.classNames, mode.attributes, modeGlobals(mode)])
  const renderKey = shows ?? `${environmentKey}|${treeKey}`
  // Errors belong to the render that raised them, so a changed design starts clean.
  const [error, setError] = useState<{ key: string; message: string }>()

  const currentKey = useRef(renderKey)

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
        const focused = host.shadowRoot?.activeElement
        if (focused instanceof HTMLElement) focused.blur()
      }
    }
    for (const type of designEvents) host.addEventListener(type, stop)
    return () => {
      for (const type of designEvents) host.removeEventListener(type, stop)
    }
  }, [])

  // A frame that stops taking keys lets go of focus at once, rather than whenever the browser gets round to it.
  useEffect(() => {
    const focused = hostRef.current!.shadowRoot?.activeElement
    if (!interactive && focused instanceof HTMLElement) focused.blur()
  }, [interactive])

  // A resized frame keeps its components and their state, as a resized browser window does. This comes before the frame
  // is built, so one rebuilt at the same time starts at the new size.
  useEffect(() => {
    const viewport = { width: viewportWidth, height: viewportHeight }
    viewportRef.current = viewport
    setFrameViewport(hostRef.current!, viewport)
    handleRef.current?.resize?.(viewport)
  }, [viewportWidth, viewportHeight])

  // The frame is rebuilt when its environment changes, and after interacting, which leaves components in states the
  // design doesn't have; a changed design updates in place, keeping component state. Asleep, it's taken apart.
  useEffect(() => {
    if (asleep) return undefined
    const [classNames, attributes, globals] = JSON.parse(environmentKey) as [
      string[],
      Record<string, string>,
      Record<string, string>
    ]
    const viewport = viewportRef.current
    const host = hostRef.current!
    const target = prepareFrame(host, loaded.sheet, { classNames, attributes, viewport })
    const handle = loaded.guest.mount(target, [], {
      globals,
      viewport,
      onError: (reason) =>
        setError({ key: currentKey.current, message: reason instanceof Error ? reason.message : String(reason) })
    })
    handleRef.current = handle
    // Selecting, outlining and measuring find the design's nodes through the guest, which reads them from React's tree.
    setDrawnNodes(host, handle.drawnNodes?.bind(handle))
    // Until it's drawn again, the frame keeps the height it had, so its board doesn't shrink and grow back. The design
    // draws as it mounts, just after this, so by the next animation frame it has its own height.
    const outer = frameRef.current!
    const held = requestAnimationFrame(() => outer.style.removeProperty("min-height"))
    return () => {
      cancelAnimationFrame(held)
      outer.style.minHeight = `${outer.offsetHeight}px`
      handleRef.current = undefined
      setDrawnNodes(host, undefined)
      host.shadowRoot?.replaceChildren()
      // Just after, as the guest renders, so never inside one of the canvas's commits, should the two share a React.
      queueMicrotask(() => handle.unmount())
    }
  }, [loaded, environmentKey, interactions, asleep])

  useEffect(() => {
    currentKey.current = renderKey
    handleRef.current?.update(JSON.parse(treeKey) as RenderNode[])
  }, [loaded, environmentKey, treeKey, renderKey, interactions, asleep])

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
        data-scale={scale}
        data-viewport={mode.viewport}
        inert={!interactive}
        style={{ width, height, zoom: scale }}
      />
      {message && (
        <div className="mode-error absolute inset-0 overflow-auto bg-destructive/90 p-3 font-mono text-xs whitespace-pre-wrap text-white">
          {message}
        </div>
      )}
    </div>
  )
}
