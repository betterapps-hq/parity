import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react"

/*
 * What a control points at on the canvas while it's hovered or focused, as Penpot's track rows and gap fields light
 * up what they change: a grid's column or row, or the gaps. The preview draws it over the layer.
 */

export type Highlight = { kind: "column" | "row"; index: number } | { kind: "gap" } | undefined

const HighlightContext = createContext<{ highlight: Highlight; setHighlight: (highlight: Highlight) => void }>({
  highlight: undefined,
  setHighlight: () => undefined
})

/** Holds what's highlighted for a story's control and preview. */
export function HighlightProvider({ children }: { children: ReactNode }) {
  const [highlight, setHighlight] = useState<Highlight>()

  return <HighlightContext value={{ highlight, setHighlight }}>{children}</HighlightContext>
}

export const useHighlight = () => useContext(HighlightContext)

/**
 * Props that highlight something while the element is hovered or focused, and clear it after. Spread onto the
 * element, or the wrapper of a field.
 */
export function useHighlights(target: Highlight) {
  const { setHighlight } = useHighlight()
  const on = () => setHighlight(target)
  const off = () => setHighlight(undefined)

  return { onPointerEnter: on, onPointerLeave: off, onFocus: on, onBlur: off }
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** A resolved track list, as `getComputedStyle` gives it: `200px 93.5px 187px`. */
const sizesOf = (template: string) =>
  template
    .split(/\s+/)
    .map((size) => Number.parseFloat(size))
    .filter((size) => Number.isFinite(size))

/** The boxes to draw for what's highlighted in a layout, in its own coordinates, from what the browser laid out. */
function measure(layout: HTMLElement, highlight: Highlight): Box[] {
  if (highlight === undefined) {
    return []
  }

  const style = getComputedStyle(layout)
  // Drawn absolutely, so from the layout's padding edge, inside its border.
  const padLeft = Number.parseFloat(style.paddingLeft)
  const padTop = Number.parseFloat(style.paddingTop)
  const borderLeft = Number.parseFloat(style.borderLeftWidth)
  const borderTop = Number.parseFloat(style.borderTopWidth)
  const columnGap = Number.parseFloat(style.columnGap) || 0
  const rowGap = Number.parseFloat(style.rowGap) || 0

  if (style.display === "grid") {
    const columns = sizesOf(style.gridTemplateColumns)
    const rows = sizesOf(style.gridTemplateRows)

    const starts = (sizes: number[], gap: number, from: number) =>
      sizes.map((_, index) => from + sizes.slice(0, index).reduce((sum, size) => sum + size, 0) + index * gap)

    const columnStarts = starts(columns, columnGap, padLeft)
    const rowStarts = starts(rows, rowGap, padTop)
    const width = columns.reduce((sum, size) => sum + size, 0) + columnGap * (columns.length - 1)
    const height = rows.reduce((sum, size) => sum + size, 0) + rowGap * (rows.length - 1)

    if (highlight.kind === "column") {
      const index = highlight.index

      if (columns[index] === undefined) {
        return []
      }

      return [{ left: columnStarts[index]!, top: padTop, width: columns[index]!, height }]
    }

    if (highlight.kind === "row") {
      const index = highlight.index

      if (rows[index] === undefined) {
        return []
      }

      return [{ left: padLeft, top: rowStarts[index]!, width, height: rows[index]! }]
    }

    return [
      ...columnStarts.slice(1).map((start) => ({ left: start - columnGap, top: padTop, width: columnGap, height })),
      ...rowStarts.slice(1).map((start) => ({ left: padLeft, top: start - rowGap, width, height: rowGap }))
    ]
  }

  if (highlight.kind !== "gap") {
    return []
  }

  // A flex layout's gaps: between each child and the next on its line.
  const outer = layout.getBoundingClientRect()
  const frame = { left: outer.left + borderLeft, top: outer.top + borderTop }
  const across = style.flexDirection.startsWith("row")

  const boxes = [...layout.children].flatMap((child) =>
    child.hasAttribute("data-highlight") ? [] : [child.getBoundingClientRect()]
  )

  const gaps: Box[] = []

  for (let index = 0; index + 1 < boxes.length; index++) {
    const [one, next] = [boxes[index]!, boxes[index + 1]!]
    const inOrder = across ? one.left <= next.left : one.top <= next.top
    const [first, second] = inOrder ? [one, next] : [next, one]

    if (across && second.left - first.right > 0.5 && second.top < first.bottom && second.bottom > first.top) {
      const top = Math.min(first.top, second.top)
      gaps.push({
        left: first.right - frame.left,
        top: top - frame.top,
        width: second.left - first.right,
        height: Math.max(first.bottom, second.bottom) - top
      })
    }

    if (!across && second.top - first.bottom > 0.5) {
      const left = Math.min(first.left, second.left)
      gaps.push({
        left: left - frame.left,
        top: first.bottom - frame.top,
        width: Math.max(first.right, second.right) - left,
        height: second.top - first.bottom
      })
    }
  }

  return gaps
}

/**
 * What a control is pointing at, drawn over the layout in the layer's color, as the canvas would: a track while its
 * segment is hovered, the gaps while Gap is. It's measured from what the browser laid out, so it's where things are.
 */
export function HighlightOverlay({ layout, color }: { layout: HTMLElement | null; color: string }) {
  const { highlight } = useHighlight()
  const [boxes, setBoxes] = useState<Box[]>([])
  useLayoutEffect(() => {
    if (!layout) {
      return
    }

    const draw = () => setBoxes(measure(layout, highlight))
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(layout)

    return () => observer.disconnect()
  }, [layout, highlight])

  if (highlight === undefined) {
    return null
  }

  return (
    <>
      {boxes.map((box, index) => (
        <span
          key={index}
          aria-hidden
          data-highlight
          className="pointer-events-none absolute rounded-sm"
          style={{
            ...box,
            position: "absolute",
            background: `color-mix(in oklab, ${color} 22%, transparent)`,
            outline: `1px dashed ${color}`
          }}
        />
      ))}
    </>
  )
}
