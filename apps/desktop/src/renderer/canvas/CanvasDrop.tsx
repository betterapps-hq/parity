import { dropHint, mayBeImage } from "@parity-app/editor"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useProject } from "./context.ts"
import { carriesFiles, draggedTypes, dropFiles, type FileDrop, fileDropAt } from "./drop-files.ts"
import type { Point } from "./hit.ts"
import { dropTarget, type InsertItem, insertItem, insertMime } from "./insert.ts"
import { kindColors } from "./kinds.tsx"

type Box = { x: number; y: number; w: number; h: number }

/** What the canvas shows while something is dragged over it, relative to the canvas area. */
interface Indicator {
  /** Where among a layout's children it lands. */
  line?: Box
  /** The layout it goes into. */
  outline?: Box
  /** The top left corner of what it makes at the pointer: a new design, or images in an absolutely placed layout. */
  corner?: { at: Point; color: string }
  /** What a drop there does, beside the pointer. */
  hint?: { text: string; at: Point }
}

/**
 * Drops onto the canvas, from the Assets panel and from the system's files. While dragging over a design, a line shows
 * where the item lands among the children of the layout under the pointer; dropping inserts it there as one undoable
 * step. Image files from Explorer or Finder also show the layout they go into and say what a drop does, and on the empty
 * canvas mark where the new design they make starts (see drop-files.ts).
 */
export function CanvasDrop() {
  const session = useProject()
  const rootRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<Indicator>()

  useEffect(() => {
    const area = rootRef.current?.parentElement
    if (!area) return undefined
    const carrying = (event: DragEvent) => event.dataTransfer?.types.includes(insertMime) ?? false
    const relative = (rect: Box): Box => {
      const box = area.getBoundingClientRect()
      return { ...rect, x: rect.x - box.left, y: rect.y - box.top }
    }
    const pointOf = (event: DragEvent): Point => ({ x: event.clientX, y: event.clientY })
    // A drag goes on sending dragover while it's over the canvas, even with the pointer still; a drag called off can
    // end without a dragleave, so what's shown goes once they stop.
    let idle: ReturnType<typeof setTimeout> | undefined
    const show = (indicator: Indicator | undefined) => {
      clearTimeout(idle)
      setShown(indicator)
      if (indicator) idle = setTimeout(() => setShown(undefined), 1000)
    }
    // In Interact a design takes what's dropped on it, as a file field in it would.
    const toDesign = (event: DragEvent) =>
      session.selection.getTool() === "interact" &&
      event.composedPath().some((target) => target instanceof HTMLElement && target.hasAttribute("data-frame"))
    const fileIndicator = (drop: FileDrop, types: string[], point: Point): Indicator => {
      const count = types.filter(mayBeImage).length
      const hint = { text: dropHint(count, drop.kind), at: relative({ ...point, w: 0, h: 0 }) }
      if (count === 0 || drop.kind === "none") return { hint }
      if (drop.kind === "canvas") return { hint, corner: { at: hint.at, color: kindColors.screen } }
      const { box } = drop.here
      return {
        hint,
        outline: relative({ x: box.left, y: box.top, w: box.right - box.left, h: box.bottom - box.top }),
        ...(drop.line ? { line: relative(drop.line) } : { corner: { at: hint.at, color: kindColors.layer } })
      }
    }

    const onDragOver = (event: DragEvent) => {
      if (carriesFiles(event)) {
        // tldraw, below, would otherwise add the files as pictures of its own.
        event.stopPropagation()
        if (toDesign(event)) {
          show(undefined)
          // Unless the design takes it, a file dropped there doesn't open in the window either.
          if (!event.defaultPrevented) {
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = "none"
          }
          return
        }
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
        const point = pointOf(event)
        show(fileIndicator(fileDropAt(session, area, point), draggedTypes(event), point))
        return
      }
      if (!carrying(event)) return
      event.preventDefault()
      const target = dropTarget(area, session.store, pointOf(event))
      if (event.dataTransfer) event.dataTransfer.dropEffect = target ? "copy" : "none"
      show(target ? { line: relative(target.line) } : undefined)
    }
    const onDragLeave = (event: DragEvent) => {
      if (!area.contains(event.relatedTarget as Node | null)) show(undefined)
    }
    const onDrop = (event: DragEvent) => {
      if (carriesFiles(event)) {
        event.stopPropagation()
        show(undefined)
        if (toDesign(event)) {
          if (!event.defaultPrevented) event.preventDefault()
          return
        }
        event.preventDefault()
        const point = pointOf(event)
        void dropFiles(session, fileDropAt(session, area, point), [...(event.dataTransfer?.files ?? [])])
        return
      }
      if (!carrying(event)) return
      event.preventDefault()
      show(undefined)
      const target = dropTarget(area, session.store, pointOf(event))
      if (!target) {
        toast.info("Drop it inside a design, onto one of its layouts")
        return
      }
      const item = JSON.parse(event.dataTransfer!.getData(insertMime)) as InsertItem
      insertItem(session, target, item)
    }

    area.addEventListener("dragover", onDragOver)
    area.addEventListener("dragleave", onDragLeave)
    area.addEventListener("drop", onDrop)
    return () => {
      clearTimeout(idle)
      area.removeEventListener("dragover", onDragOver)
      area.removeEventListener("dragleave", onDragLeave)
      area.removeEventListener("drop", onDrop)
    }
  }, [session])

  const { line, outline, corner, hint } = shown ?? {}
  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[350] overflow-hidden">
      {outline && (
        <div
          data-drop-outline=""
          className="absolute rounded-[2px]"
          style={{
            left: outline.x,
            top: outline.y,
            width: outline.w,
            height: outline.h,
            outline: `1.5px dashed ${kindColors.layer}`
          }}
        />
      )}
      {line && (
        <div
          data-drop-line=""
          className="absolute rounded-full"
          style={{
            left: line.x,
            top: line.y,
            width: line.w,
            height: line.h,
            background: hint ? kindColors.layer : kindColors.component
          }}
        />
      )}
      {corner && (
        <div
          data-drop-corner=""
          className="absolute size-3"
          style={{
            left: corner.at.x,
            top: corner.at.y,
            borderLeft: `2px solid ${corner.color}`,
            borderTop: `2px solid ${corner.color}`
          }}
        />
      )}
      {hint && (
        <output
          data-drop-hint=""
          className="absolute rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={{ left: hint.at.x + 14, top: hint.at.y + 18 }}
        >
          {hint.text}
        </output>
      )}
    </div>
  )
}
