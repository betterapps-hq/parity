import { frameViewport, type MountHandle, modeGlobals, type RenderNode, type ResolvedMode } from "@parity/core"
import { useEffect, useRef, useState } from "react"
import { prepareFrame, setFrameViewport } from "./frame.ts"
import type { LoadedGuest } from "./guest.ts"

interface ModeViewProps {
  loaded: LoadedGuest
  tree: RenderNode[]
  mode: ResolvedMode
  /** The frame's width in CSS pixels: the design's own for this viewport, else the viewport's. */
  width: number
  /** A fixed height; otherwise the frame is as tall as its content. */
  height?: number
  /** Drawn size relative to the frame's. Layout inside always happens at the full size. */
  scale?: number
  /** Identify the frame, so selection, outlines and agents can find it. */
  design: string
  state: string
  primary?: boolean
  /** Changes when interacting with the canvas stops, to start the frame afresh from the design. */
  interactions?: number
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
  width,
  height,
  scale = 1,
  design,
  state,
  primary = false,
  interactions = 0
}: ModeViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MountHandle>(undefined)
  // The window the frame stands for, which the project's viewport units and window size checks measure.
  const { height: viewportHeight } = frameViewport({ width, height }, mode)
  const viewportRef = useRef({ width, height: viewportHeight })
  const treeKey = JSON.stringify(tree)
  const environmentKey = JSON.stringify([mode.classNames, mode.attributes, modeGlobals(mode)])
  const renderKey = `${environmentKey}|${treeKey}`
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

  // A resized frame keeps its components and their state, as a resized browser window does. This comes before the frame
  // is built, so one rebuilt at the same time starts at the new size.
  useEffect(() => {
    const viewport = { width, height: viewportHeight }
    viewportRef.current = viewport
    setFrameViewport(hostRef.current!, viewport)
    handleRef.current?.resize?.(viewport)
  }, [width, viewportHeight])

  // The frame is rebuilt when its environment changes, and after interacting, which leaves components in states the
  // design doesn't have; a changed design updates in place, keeping component state.
  useEffect(() => {
    const [classNames, attributes, globals] = JSON.parse(environmentKey) as [
      string[],
      Record<string, string>,
      Record<string, string>
    ]
    const viewport = viewportRef.current
    const target = prepareFrame(hostRef.current!, loaded.sheet, { classNames, attributes, viewport })
    const handle = loaded.guest.mount(target, [], {
      globals,
      viewport,
      onError: (reason) =>
        setError({ key: currentKey.current, message: reason instanceof Error ? reason.message : String(reason) })
    })
    handleRef.current = handle
    return () => {
      handleRef.current = undefined
      handle.unmount()
    }
  }, [loaded, environmentKey, interactions])

  useEffect(() => {
    currentKey.current = renderKey
    handleRef.current?.update(JSON.parse(treeKey) as RenderNode[])
  }, [loaded, environmentKey, treeKey, renderKey, interactions])

  const message = error?.key === renderKey ? error.message : undefined

  // A frame is a browser's viewport: square corners, and nothing cut off except below a device's height, where a browser
  // would scroll. A frame that grows with its content shows all of it, shadows and popups included.
  return (
    <div
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
