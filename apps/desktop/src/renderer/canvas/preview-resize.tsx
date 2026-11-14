import {
  breakpointAt,
  type ContainerSpec,
  type PreviewBreakpoint,
  previewGeometry,
  snapToBreakpoint,
  withoutPreviewValues,
  withPreviewValues
} from "@parity-app/core"
import { labelLook, pickPreviews } from "@parity-app/editor"
import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useMemo, useRef } from "react"
import { stopEventPropagation, useEditor, useValue } from "tldraw"
import { Hint } from "../chrome/Hint.tsx"
import { viewportPresets } from "../chrome/viewports.tsx"
import { useTokenList } from "../tokens-store.ts"
import { useGutterStyle } from "./board-gutter.ts"
import { useProject } from "./context.ts"
import { kindColors } from "./kinds.tsx"
import type { PreviewTarget } from "./preview-parts.tsx"
import { useZoomStyle } from "./zoom-style.ts"

/** The widest a preview can be dragged. */
const widest = 1920

/** How near a breakpoint, on screen, a page dragged lands on it. */
const snapReach = 6

/** The grip in the handle: 4 screen pixels wide and up to 40 tall, never more than half the preview. */
function gripStyle(style: CSSStyleDeclaration, zoom: number) {
  style.width = `${4 / zoom}px`
  style.height = `${40 / zoom}px`
}

/**
 * The widths the app's styles respond at, from its breakpoint tokens and its libraries' breakpoints, narrowest first,
 * each named as it's written (`sm`, `md`), which a page's preview lands on as it's resized.
 */
export function useBreakpoints(): readonly PreviewBreakpoint[] {
  const { info, tokens: tokenStore } = useProject()
  const tokens = useTokenList(tokenStore)

  return useMemo(() => {
    const presets = viewportPresets(tokens, info.libraries).flatMap((group) => group.presets)
    const widths = new Map<number, PreviewBreakpoint>()

    for (const preset of presets) {
      if (preset.breakpoint && !widths.has(preset.width)) {
        // A preset's key ends in the breakpoint's own name: `token:breakpoint-sm`, or a library's `nova:sm`.
        const name = preset.key.slice(preset.key.lastIndexOf(":") + 1).replace(/^breakpoint-/, "")
        widths.set(preset.width, { name, width: preset.width })
      }
    }

    return [...widths.values()].toSorted((a, b) => a.width - b.width)
  }, [tokens, info.libraries])
}

/**
 * The handle in the gutter after a preview, while its design is hovered or selected (PAR-1071). Dragging it sets the
 * preview's width, and every other selected preview's where it's one of them; a page lands on the app's breakpoints
 * within a few screen pixels, unless Alt is held, and shows them under it while it's resized. Double-clicking puts the
 * width back to its mode's, and Left and Right nudge it, by 10 with Shift.
 */
export function PreviewResize({
  design,
  designKey,
  self,
  changing,
  width,
  scale,
  narrowest,
  breakpoints,
  tabbable,
  resizing,
  onResizing
}: {
  design: ContainerSpec
  designKey: string
  /** The preview it resizes, by key, with its mode. */
  self: PreviewTarget
  /** The previews a resize changes: the selected ones where this is one of them, or this alone. */
  changing: readonly PreviewTarget[]
  /** The preview's width now, in its own pixels. */
  width: number
  /** How much the preview is shrunk on the board, so the edge follows the pointer. */
  scale: number
  narrowest: number
  /** The app's breakpoints, for a page; none for a story or a component. */
  breakpoints: readonly PreviewBreakpoint[] | undefined
  tabbable: boolean
  resizing: boolean
  /** Says when a resize starts and ends, so the board keeps the handle while it's dragged. */
  onResizing: (resizing: boolean) => void
}) {
  const editor = useEditor()
  const { store, selection } = useProject()
  const gutter = useRef<HTMLDivElement>(null)
  const grip = useRef<HTMLSpanElement>(null)
  useGutterStyle(gutter, "resizeHandle")
  useZoomStyle(grip, gripStyle)

  const start = () => {
    onResizing(true)

    if (changing.length === 1) {
      selection.set(pickPreviews(selection.get(), designKey, [self.key], false))
    }
  }

  const resizeTo = (next: number, snap: boolean) => {
    const clamped = Math.round(Math.min(widest, Math.max(narrowest, next)))
    const reach = snapReach / (editor.getZoomLevel() * scale)
    const landed = breakpoints && snap ? snapToBreakpoint(breakpoints, clamped, reach) : clamped

    store.updateView(designKey, "Resize preview", (view) =>
      changing.reduce(
        (each, preview) =>
          withPreviewValues(each, preview.key, {
            // At its mode's own width, it sets none of its own.
            width: landed === previewGeometry(design, preview.mode, undefined).width ? undefined : landed
          }),
        view
      )
    )
  }

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (event.button !== 0) {
      return
    }

    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    start()
    const from = event.clientX
    const zoom = editor.getZoomLevel()

    const moved = (move: PointerEvent) => resizeTo(width + (move.clientX - from) / (zoom * scale), !move.altKey)

    const up = () => {
      target.removeEventListener("pointermove", moved)
      target.removeEventListener("pointerup", up)
      onResizing(false)
    }

    target.addEventListener("pointermove", moved)
    target.addEventListener("pointerup", up)
  }

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    start()
    resizeTo(width + (event.shiftKey ? 10 : 1) * (event.key === "ArrowLeft" ? -1 : 1), false)
  }

  const reset = () =>
    store.updateView(designKey, "Reset preview width", (view) =>
      changing.reduce((each, preview) => withoutPreviewValues(each, preview.key, ["width"]), view)
    )

  return (
    <>
      <Hint label="Drag to resize this preview" detail="Double-click to reset" wait>
        <div
          ref={gutter}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a resize handle is a focusable separator with a value, which an hr can't be
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${self.mode.name}`}
          aria-valuenow={width}
          aria-valuemin={narrowest}
          aria-valuemax={widest}
          tabIndex={tabbable ? 0 : -1}
          data-canvas-control
          onPointerDown={drag}
          // The press is the handle's alone: letting its end through to the canvas would select the board instead.
          onPointerUp={stopEventPropagation}
          onClick={stopEventPropagation}
          onDoubleClick={(event) => {
            event.stopPropagation()
            reset()
          }}
          onKeyDown={nudge}
          onKeyUp={() => onResizing(false)}
          onBlur={() => onResizing(false)}
          className="group/edge pointer-events-auto absolute top-0 left-full h-full cursor-ew-resize outline-none"
        >
          <span
            ref={grip}
            className="absolute top-1/2 left-1/2 max-h-1/2 -translate-1/2 rounded-full bg-muted-foreground/40 transition-colors group-hover/edge:bg-(--canvas-mode) group-focus-visible/edge:bg-(--canvas-mode) group-active/edge:bg-(--canvas-mode)"
          />
        </div>
      </Hint>
      {resizing && breakpoints && breakpoints.length > 0 && (
        <BreakpointRuler breakpoints={breakpoints} width={width} scale={scale} />
      )}
    </>
  )
}

/**
 * The app's breakpoints under a page's preview while it's resized, each where the preview's edge meets it, the one it's
 * at lit from there to the next, so it's plain where the page changes. It sits in the gap below, clear of the page.
 */
function BreakpointRuler({
  breakpoints,
  width,
  scale
}: {
  breakpoints: readonly PreviewBreakpoint[]
  width: number
  scale: number
}) {
  const editor = useEditor()
  const zoom = useValue("zoom", () => editor.getZoomLevel(), [editor])
  const at = breakpointAt(breakpoints, width)
  const next = breakpoints.find((each) => each.width > width)
  const from = at?.width ?? 0
  const to = next?.width ?? Math.min(widest, width + 160)
  const shown = breakpoints.filter((each) => each.width <= width || each === next)
  const { opacity } = labelLook("detail", zoom)
  const color = kindColors.mode
  const faint = "color-mix(in oklab, currentColor 30%, transparent)"

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 text-foreground"
      style={{ top: `calc(100% + ${10 / zoom}px)`, width: to * scale, height: 24 / zoom }}
    >
      <div className="absolute inset-x-0 top-0" style={{ height: 1 / zoom, background: faint }} />
      <div
        className="absolute top-0 rounded-full"
        style={{
          left: from * scale,
          width: (to - from) * scale,
          height: 3 / zoom,
          background: `color-mix(in oklab, ${color} 55%, transparent)`
        }}
      />
      {shown.map((each) => {
        const lit = each.name === at?.name

        return (
          <div key={each.name} className="absolute top-0" style={{ left: each.width * scale }}>
            <div style={{ width: 1 / zoom, height: 7 / zoom, background: lit ? color : faint }} />
            <div
              className={`absolute left-0 origin-top-left text-xs leading-none font-medium whitespace-nowrap ${lit ? "" : "text-muted-foreground"}`}
              style={{
                top: 10 / zoom,
                transform: `scale(${1 / zoom}) translateX(-50%)`,
                opacity,
                color: lit ? color : undefined
              }}
            >
              {each.name}
            </div>
          </div>
        )
      })}
    </div>
  )
}
