import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useProject } from "./context.ts"
import { dropTarget, type InsertItem, insertItem, insertMime } from "./insert.ts"
import { kindColors } from "./kinds.tsx"

/**
 * Drops from the Assets panel onto the canvas: while dragging over a design, a line shows where the item lands among
 * the children of the layout under the pointer; dropping inserts it there as one undoable step.
 */
export function CanvasDrop() {
  const session = useProject()
  const rootRef = useRef<HTMLDivElement>(null)
  const [line, setLine] = useState<{ x: number; y: number; w: number; h: number }>()

  useEffect(() => {
    const area = rootRef.current?.parentElement
    if (!area) return undefined
    const carrying = (event: DragEvent) => event.dataTransfer?.types.includes(insertMime) ?? false
    const relative = (rect: { x: number; y: number; w: number; h: number }) => {
      const box = area.getBoundingClientRect()
      return { ...rect, x: rect.x - box.left, y: rect.y - box.top }
    }

    const onDragOver = (event: DragEvent) => {
      if (!carrying(event)) return
      event.preventDefault()
      const target = dropTarget(area, session.store, { x: event.clientX, y: event.clientY })
      if (event.dataTransfer) event.dataTransfer.dropEffect = target ? "copy" : "none"
      setLine(target ? relative(target.line) : undefined)
    }
    const onDragLeave = (event: DragEvent) => {
      if (!area.contains(event.relatedTarget as Node | null)) setLine(undefined)
    }
    const onDrop = (event: DragEvent) => {
      if (!carrying(event)) return
      event.preventDefault()
      setLine(undefined)
      const target = dropTarget(area, session.store, { x: event.clientX, y: event.clientY })
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
      area.removeEventListener("dragover", onDragOver)
      area.removeEventListener("dragleave", onDragLeave)
      area.removeEventListener("drop", onDrop)
    }
  }, [session])

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[350] overflow-hidden">
      {line && (
        <div
          className="absolute rounded-full"
          style={{ left: line.x, top: line.y, width: line.w, height: line.h, background: kindColors.component }}
        />
      )}
    </div>
  )
}
