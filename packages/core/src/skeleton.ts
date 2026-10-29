/**
 * A frame's skeleton: the shapes of what it draws, as plain boxes, to show in its place zoomed far out until its bitmap
 * is taken. The app measures the frame once it has drawn; this works out what's worth drawing and how, as a few paths,
 * so a board of skeletons costs a handful of elements where its frames cost thousands.
 */

/** Something a frame draws, measured in the frame's own CSS pixels from its top left. */
export interface DrawnBox {
  x: number
  y: number
  width: number
  height: number
  /** A line of text, an image or icon, or a box with a background or border, such as a card, field or button. */
  kind: "text" | "media" | "surface"
  /** A surface's background, or the color of text or an icon. */
  color?: string
  /** A surface's border color, when it has a border. */
  border?: string
  /** Corner radius in CSS pixels. */
  radius?: number
}

/** Boxes drawn alike, in one path. */
export interface SkeletonLayer {
  /** Rectangles, rounded where the boxes are, in the frame's CSS pixels. */
  path: string
  fill?: string
  stroke?: string
  opacity: number
}

export interface FrameSkeleton {
  width: number
  height: number
  /** The color behind everything, from a surface that covers the frame. */
  background?: string
  /** Back to front. */
  layers: SkeletonLayer[]
}

export interface SkeletonOptions {
  /** Boxes thinner than this, in CSS pixels, are left out: zoomed far enough out to show skeletons, they don't show. */
  smallest?: number
  /** At most this many boxes, the largest, so a long list doesn't make a skeleton as costly as its frame. */
  most?: number
}

/** How much of the frame a surface covers to count as its background. */
const coversFrame = 0.9
/** How much of a line of text its bar fills, top to bottom, as a skeleton draws text. */
const textBar = 0.6
/** How strongly text and media show, in their own color: about as dark as text is drawn this small. */
const textOpacity = 0.35
const mediaOpacity = 0.2

/** Turns what a frame draws, in the order it draws it, into its skeleton. */
export function frameSkeleton(
  frame: { width: number; height: number },
  drawn: DrawnBox[],
  { smallest = 3, most = 400 }: SkeletonOptions = {}
): FrameSkeleton {
  const area = frame.width * frame.height
  let background: string | undefined
  const shown: { box: Shape; style: Style; order: number }[] = []
  drawn.forEach((box, order) => {
    const clipped = clip(box, frame)
    if (!clipped || clipped.width < smallest || clipped.height < smallest) return
    if (box.kind === "surface" && box.color && (clipped.width * clipped.height) / area >= coversFrame) {
      background = box.color
      return
    }
    const drawnAs = draw(box, clipped)
    if (drawnAs) shown.push({ ...drawnAs, order })
  })
  const kept =
    shown.length <= most
      ? shown
      : [...shown]
          .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)
          .slice(0, most)
          .sort((a, b) => a.order - b.order)
  return { width: frame.width, height: frame.height, ...(background ? { background } : {}), layers: layer(kept) }
}

interface Shape {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

type Style = Omit<SkeletonLayer, "path">

/** How a box is drawn, or nothing for one that draws nothing. */
function draw(box: DrawnBox, shape: Shape): { box: Shape; style: Style } | undefined {
  if (box.kind === "text") {
    if (!box.color) return undefined
    const height = shape.height * textBar
    return {
      box: { ...shape, y: shape.y + (shape.height - height) / 2, height, radius: height / 2 },
      style: { fill: box.color, opacity: textOpacity }
    }
  }
  if (box.kind === "media") return { box: shape, style: { fill: box.color ?? "currentColor", opacity: mediaOpacity } }
  if (!box.color && !box.border) return undefined
  return {
    box: shape,
    style: { ...(box.color ? { fill: box.color } : {}), ...(box.border ? { stroke: box.border } : {}), opacity: 1 }
  }
}

/** The part of a box inside the frame, its corners no rounder than half its shorter side. */
function clip(box: DrawnBox, frame: { width: number; height: number }): Shape | undefined {
  const x = Math.max(0, box.x)
  const y = Math.max(0, box.y)
  const width = Math.min(frame.width, box.x + box.width) - x
  const height = Math.min(frame.height, box.y + box.height) - y
  if (width <= 0 || height <= 0) return undefined
  return { x, y, width, height, radius: Math.min(box.radius ?? 0, width / 2, height / 2) }
}

/**
 * Puts boxes drawn alike in one layer, keeping every box in front of the boxes it overlaps that were drawn before it:
 * a box joins the last layer drawn its way unless a layer after that one overlaps it.
 */
function layer(boxes: { box: Shape; style: Style }[]): SkeletonLayer[] {
  const layers: { style: Style; key: string; boxes: Shape[] }[] = []
  for (const { box, style } of boxes) {
    const key = `${style.fill}|${style.stroke}|${style.opacity}`
    let joined = false
    for (let index = layers.length - 1; index >= 0; index--) {
      const candidate = layers[index]!
      if (candidate.key === key) {
        candidate.boxes.push(box)
        joined = true
        break
      }
      if (candidate.boxes.some((other) => overlaps(box, other))) break
    }
    if (!joined) layers.push({ style, key, boxes: [box] })
  }
  return layers.map(({ style, boxes }) => ({ path: boxes.map(outline).join(""), ...style }))
}

function overlaps(a: Shape, b: Shape): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** A box as path commands, clockwise from its top left corner. */
function outline({ x, y, width, height, radius }: Shape): string {
  const n = (value: number) => String(Math.round(value * 10) / 10)
  if (radius < 0.5) return `M${n(x)} ${n(y)}h${n(width)}v${n(height)}h${n(-width)}Z`
  const r = n(radius)
  const arc = (dx: number, dy: number) => `a${r} ${r} 0 0 1 ${n(dx)} ${n(dy)}`
  return (
    `M${n(x + radius)} ${n(y)}h${n(width - 2 * radius)}${arc(radius, radius)}v${n(height - 2 * radius)}` +
    `${arc(-radius, radius)}h${n(-(width - 2 * radius))}${arc(-radius, -radius)}v${n(-(height - 2 * radius))}` +
    `${arc(radius, -radius)}Z`
  )
}
