import { type DrawnBox, type FrameSkeleton, frameSkeleton } from "@parity-app/core"
import { type RefObject, useEffect, useState } from "react"

/** How long a frame stays the same before it's measured, as long as before its bitmap is taken. */
const settleMs = 1000
/** How long until trying again to measure a frame that hasn't drawn yet, or is out of view. */
const retryMs = 2000
/** Skeletons kept, most recently asked for last. Each is a few paths. */
const kept = 400

/** Skeletons by what their frame shows, keyed as bitmaps are. */
const skeletons = new Map<string, FrameSkeleton>()

/** Elements drawn as media: their box shows, and what's inside them doesn't. */
const media = new Set(["IMG", "svg", "VIDEO", "CANVAS", "IFRAME", "PICTURE"])
const insideMedia = "svg, video, canvas, iframe, picture"

/**
 * The skeleton of a frame as it's drawn now, measured from it once it has stayed the same for a moment, to show zoomed
 * far out until its bitmap is taken (see frame-bitmaps.ts). `key` says what the frame shows; `measure` is false once
 * the frame has its bitmap, since its live frame then needn't be laid out again to be measured.
 */
export function useFrameSkeleton(
  key: string,
  tile: RefObject<HTMLElement | null>,
  width: number,
  measure: boolean
): FrameSkeleton | undefined {
  const [shown, setShown] = useState<{ key: string; skeleton: FrameSkeleton }>()
  const known = skeletons.get(key)

  useEffect(() => {
    if (known || !measure) return
    let idle: number | undefined
    const attempt = () => {
      idle = requestIdleCallback(
        () => {
          const host = tile.current?.querySelector<HTMLElement>("[data-frame]")
          // A frame out of view isn't laid out, so measuring it would lay it out just for this.
          const measured = host && !host.closest("[data-away]") ? measureFrame(host, width) : undefined
          if (!measured) {
            timer = setTimeout(attempt, retryMs)
            return
          }
          const skeleton = frameSkeleton({ width, height: measured.height }, measured.drawn)
          skeletons.set(key, skeleton)
          for (const old of skeletons.keys()) {
            if (skeletons.size <= kept) break
            skeletons.delete(old)
          }
          setShown({ key, skeleton })
        },
        { timeout: retryMs }
      )
    }
    let timer = setTimeout(attempt, settleMs)
    return () => {
      clearTimeout(timer)
      if (idle !== undefined) cancelIdleCallback(idle)
    }
  }, [key, known, measure, tile, width])

  if (known) {
    skeletons.delete(key)
    skeletons.set(key, known)
    return known
  }
  return shown?.key === key ? shown.skeleton : undefined
}

/**
 * What a frame draws, in its own CSS pixels and the order it draws it: each line of text, each image and icon, and each
 * box with a background or a border all round. Nothing for a frame that hasn't drawn its design yet.
 */
export function measureFrame(host: HTMLElement, width: number): { height: number; drawn: DrawnBox[] } | undefined {
  const root = host.shadowRoot
  if (!root?.querySelector("[data-canvas-node]")) return undefined
  const frame = host.getBoundingClientRect()
  // The frame is drawn scaled, by the canvas's zoom and its own; boxes are measured as drawn and scaled back.
  const ratio = frame.width / width
  if (!(ratio > 0)) return undefined
  const local = (rect: DOMRect) => ({
    x: (rect.left - frame.left) / ratio,
    y: (rect.top - frame.top) / ratio,
    width: rect.width / ratio,
    height: rect.height / ratio
  })
  const drawn: DrawnBox[] = []
  const range = document.createRange()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // What an icon or picture is made of is drawn as the one box.
      if (node.parentElement?.closest(insideMedia)) return NodeFilter.FILTER_REJECT
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT
      const style = getComputedStyle(node as Element)
      return style.display === "none" || style.visibility === "hidden" || style.opacity === "0"
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    }
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent?.trim() || !node.parentElement) continue
      const color = getComputedStyle(node.parentElement).color
      if (!shows(color)) continue
      range.selectNodeContents(node)
      for (const line of range.getClientRects()) drawn.push({ kind: "text", ...local(line), color })
      continue
    }
    const element = node as Element
    const style = getComputedStyle(element)
    const box = local(element.getBoundingClientRect())
    if (box.width === 0 || box.height === 0) continue
    if (media.has(element.tagName)) {
      drawn.push({ kind: "media", ...box, color: style.color, radius: radius(style, box) })
      continue
    }
    const background = shows(style.backgroundColor) ? style.backgroundColor : undefined
    const border = bordered(style) ? style.borderTopColor : undefined
    if (background || border) {
      drawn.push({
        kind: "surface",
        ...box,
        ...(background ? { color: background } : {}),
        ...(border ? { border } : {}),
        radius: radius(style, box)
      })
    } else if (style.backgroundImage !== "none") {
      drawn.push({ kind: "media", ...box, color: style.color, radius: radius(style, box) })
    }
  }
  return { height: frame.height / ratio, drawn }
}

/** Whether a color shows at all: not transparent, and not fully see-through. */
function shows(color: string): boolean {
  return color !== "transparent" && !/(?:,|\/)\s*0(?:\.0*)?\s*\)$/.test(color)
}

/** Whether an element has a border all round that shows. */
function bordered(style: CSSStyleDeclaration): boolean {
  return (["Top", "Right", "Bottom", "Left"] as const).every(
    (side) =>
      parseFloat(style[`border${side}Width`]) > 0 &&
      style[`border${side}Style`] !== "none" &&
      shows(style[`border${side}Color`])
  )
}

function radius(style: CSSStyleDeclaration, box: { width: number; height: number }): number {
  const corner = style.borderTopLeftRadius.split(" ")[0] ?? "0"
  const value = parseFloat(corner) || 0
  return corner.endsWith("%") ? (Math.min(box.width, box.height) * value) / 100 : value
}
