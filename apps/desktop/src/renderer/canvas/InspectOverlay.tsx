import { layersSelection } from "@parity-app/editor"
import { useEffect, useRef, useState } from "react"
import { allFrames, findFrames, findNodeElements, nodeOfElement } from "../frame.ts"
import { useSelection } from "../selection.ts"
import { useProject } from "./context.ts"
import { elementsWrittenAt, frameAt, type SourcedElement, shortSource, sourcedElementAt } from "./element-sources.ts"
import { getInspecting, pickElement, setPicking, useInspecting } from "./inspect.ts"
import { kindColors } from "./kinds.tsx"

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** What the overlay draws: boxes in the canvas area's coordinates, and the label of the one under the pointer. */
interface Marks {
  boxes: (Box & { dashed: boolean })[]
  label?: { box: Box; tag: string; where: string }
}

const color = kindColors.component
const none: Marks = { boxes: [] }

/**
 * The canvas's half of picking an element inside a component (PAR-167). While picking, the element a project file
 * wrote under the pointer is outlined with its tag, file and line, and a click picks it, selecting the layer it's in;
 * Escape stops. Otherwise the element picked in the Code section is outlined, and the one hovered in its list dashed,
 * in every frame of the selected layer that draws them.
 */
export function InspectOverlay() {
  const session = useProject()
  const inspecting = useInspecting()
  const selected = useSelection(session.selection)
  const rootRef = useRef<HTMLDivElement>(null)
  const [marks, setMarks] = useState<Marks>(none)
  const [pointed, setPointed] = useState<{ host: HTMLElement; element: SourcedElement }>()

  // While picking, the pointer's moves find the element under it, and a press picks it before the canvas sees it.
  useEffect(() => {
    if (!inspecting.picking) return undefined
    const area = rootRef.current?.parentElement
    if (!area) return undefined
    area.dataset.inspecting = ""
    const under = (event: PointerEvent) => {
      if (!area.contains(event.target as Node)) return undefined
      const host = frameAt(allFrames(area), event.clientX, event.clientY)
      const element = host && sourcedElementAt(host, event.clientX, event.clientY)
      return host && element ? { host, element } : undefined
    }
    const move = (event: PointerEvent) => setPointed(under(event))
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || !area.contains(event.target as Node)) return
      const found = under(event)
      event.preventDefault()
      event.stopPropagation()
      if (!found) return
      const { host, element } = found
      const design = host.dataset.design
      const node = nodeOfElement(host, element.element)
      if (!design || !node) return
      session.selection.set(layersSelection(design, [node], { mode: host.dataset.mode, state: host.dataset.state }))
      pickElement({ node, at: element.at })
      setPointed(undefined)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      setPicking(false)
    }
    window.addEventListener("pointermove", move, { capture: true })
    window.addEventListener("pointerdown", press, { capture: true })
    window.addEventListener("keydown", key, { capture: true })
    return () => {
      delete area.dataset.inspecting
      window.removeEventListener("pointermove", move, { capture: true })
      window.removeEventListener("pointerdown", press, { capture: true })
      window.removeEventListener("keydown", key, { capture: true })
      setPointed(undefined)
    }
  }, [inspecting.picking, session])

  // The boxes follow the camera, layout changes and animations, so they're measured every frame.
  useEffect(() => {
    let frame = 0
    let last = ""
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const area = rootRef.current?.parentElement
      if (!area || area.closest("[hidden]")) return
      const origin = area.getBoundingClientRect()
      const box = (element: Element): Box => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }
      }
      const next = measure(getInspecting(), selected, pointed, box)
      const serialized = JSON.stringify(next)
      if (serialized !== last) {
        last = serialized
        setMarks(next)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pointed, selected])

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-[306] overflow-hidden"
      data-inspect-overlay
      aria-hidden
    >
      {marks.boxes.map((box, index) => (
        <div
          key={index}
          className="absolute rounded-[1px]"
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            outline: `1px ${box.dashed ? "dashed" : "solid"} ${color}`,
            background: box.dashed ? undefined : `color-mix(in oklch, ${color} 10%, transparent)`
          }}
        />
      ))}
      {marks.label && (
        <div
          className="absolute flex -translate-y-full items-center gap-1.5 truncate rounded-t px-1.5 py-px font-mono text-[11px] text-white"
          style={{ left: marks.label.box.x - 1, top: marks.label.box.y - 1, background: color }}
        >
          <span className="font-semibold">{marks.label.tag}</span>
          <span className="opacity-80">{marks.label.where}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Where the marks go: under the pointer while picking; else the picked element of the selected layer, solid, and the
 * one hovered in the Code section, dashed, in each of the layer's frames, the first labelled.
 */
function measure(
  inspecting: ReturnType<typeof getInspecting>,
  selected: ReturnType<typeof useSelection>,
  pointed: { host: HTMLElement; element: SourcedElement } | undefined,
  box: (element: Element) => Box
): Marks {
  if (inspecting.picking) {
    if (!pointed) return none
    const at = box(pointed.element.element)
    return {
      boxes: [{ ...at, dashed: false }],
      label: { box: at, tag: pointed.element.tag, where: shortSource(pointed.element.source) }
    }
  }
  const node = selected.node
  if (!selected.design || !node) return none
  const marks: Marks = { boxes: [] }
  const shown = [
    { mark: inspecting.picked, dashed: false },
    { mark: inspecting.hovered, dashed: true }
  ].filter(({ mark }) => mark?.node === node && !(mark === inspecting.hovered && mark.at === inspecting.picked?.at))
  for (const host of findFrames(document, selected.design)) {
    const roots = findNodeElements(host, node)
    for (const { mark, dashed } of shown) {
      for (const element of elementsWrittenAt(roots, mark!.at)) {
        const at = box(element)
        if (at.width === 0 && at.height === 0) continue
        marks.boxes.push({ ...at, dashed })
      }
    }
  }
  return marks
}
