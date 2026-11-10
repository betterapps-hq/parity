import type { CanvasDocument, ReferenceSpec } from "@parity-app/core"
import type { DesignRef } from "./arrange.ts"
import type { Point } from "./drop-slot.ts"
import type { DesignSnapshot } from "./history.ts"
import { type Bounds, designGap } from "./placement.ts"

/*
 * References on the canvas (PAR-840): screens from real apps, placed beside a design to look at, never in it. They're
 * kept in a project file's `references`, as notes are, and these are the changes to them and where they land.
 */

/** How wide a screen is drawn on the canvas, by its platform: a laptop's width for the web, and a phone's for iOS. */
const screenWidths = { web: 1280, ios: 390 } as const

/** How tall a screen is drawn when its picture's size isn't known. */
const screenHeights = { web: 800, ios: 844 } as const

/** Space between references in a row. */
const referenceGap = 48

/** Space between a batch's row and the one above it, which leaves room for the captions under the pictures. */
const rowGap = 160

/** Below this width, a design's main preview is a phone's, so its references are searched for on iOS. */
const phoneWidth = 600

/** A search for references, as the library browser opens on it: a description and the platform. */
export interface ReferenceSearch {
  query: string
  filters: { platform: "ios" | "web" }
}

/**
 * The search Find references opens on for a design: its name as the description, on the web when its main preview is
 * a desktop one and on iOS when it's a phone's.
 */
export function referenceSearch(name: string, previewWidth: number): ReferenceSearch {
  const described = name.trim().toLowerCase()

  return previewWidth < phoneWidth
    ? { query: `${described} screen`, filters: { platform: "ios" } }
    : { query: `${described} page`, filters: { platform: "web" } }
}

/** The search for an app's other screens, which a description naming an app keeps to that app. */
export function moreFromApp(reference: Pick<ReferenceSpec, "app" | "platform">): ReferenceSearch {
  return { query: reference.app, filters: { platform: reference.platform ?? "web" } }
}

/** How big something is on the canvas, in canvas pixels. */
export interface CanvasSize {
  width: number
  height: number
}

/** A reference's size on the canvas: its platform's width, and as tall as its picture's proportions make it. */
export function referenceSize(reference: Pick<ReferenceSpec, "platform" | "image">): CanvasSize {
  const platform = reference.platform ?? "web"
  const width = screenWidths[platform]
  const { width: pictureWidth, height: pictureHeight } = reference.image

  if (!pictureWidth || !pictureHeight) {
    return { width, height: screenHeights[platform] }
  }

  return { width, height: Math.round((width / pictureWidth) * pictureHeight) }
}

/** A reference's box on the canvas. */
export function referenceBounds(reference: Pick<ReferenceSpec, "platform" | "image" | "position">): Bounds {
  const { width, height } = referenceSize(reference)
  const { x, y } = reference.position

  return { minX: x, minY: y, maxX: x + width, maxY: y + height }
}

/** Whether a reference's picture link has stopped working, so it shows its app's name instead. */
export function referenceExpired(reference: Pick<ReferenceSpec, "image">, now: number): boolean {
  return reference.image.expiresAt !== undefined && reference.image.expiresAt <= now
}

/**
 * Where a batch of references goes: beside the design it was found for, around a point when there wasn't one, or after
 * a reference placed just before, to carry on its row.
 */
export type ReferenceAnchor = { beside: Bounds } | { around: Point } | { after: Bounds }

/**
 * Where each of a batch of references goes, in order: a row beside the design, top-aligned with it and `designGap`
 * past its right edge, or a row centered on a point. When references already lie where the row would go, it starts
 * under the lowest of them, so a later batch makes a new row under the last. When anything else on the canvas, as
 * another design, is in the way, the row moves right past it, as copies of designs do.
 */
export function referenceRow(
  anchor: ReferenceAnchor,
  sizes: readonly CanvasSize[],
  placed: readonly Bounds[],
  others: readonly Bounds[] = []
): Point[] {
  const width = sizes.reduce((total, size) => total + size.width, 0) + referenceGap * Math.max(0, sizes.length - 1)
  const height = Math.max(0, ...sizes.map((size) => size.height))

  let start: Point

  if ("beside" in anchor) {
    start = { x: anchor.beside.maxX + designGap, y: anchor.beside.minY }
  } else if ("around" in anchor) {
    start = { x: Math.round(anchor.around.x - width / 2), y: Math.round(anchor.around.y - height / 2) }
  } else {
    start = { x: anchor.after.maxX + referenceGap, y: anchor.after.minY }
  }

  // Carrying on a row stays in it; a new batch starts under any references where its row would go.
  const below =
    "after" in anchor
      ? []
      : placed.filter((box) => box.maxX > start.x && box.minX < start.x + width && box.maxY > start.y - rowGap)

  const y = below.length > 0 ? Math.max(...below.map((box) => box.maxY)) + rowGap : start.y
  const taken = [...placed, ...others]
  let x = start.x

  for (;;) {
    const blocking = taken.filter(
      (box) =>
        box.minX < x + width + referenceGap &&
        box.maxX + referenceGap > x &&
        box.minY < y + height + referenceGap &&
        box.maxY + referenceGap > y
    )

    if (blocking.length === 0) {
      break
    }

    x = Math.max(...blocking.map((box) => box.maxX)) + designGap
  }

  return sizes.map((size) => {
    const point = { x, y }
    x += size.width + referenceGap

    return point
  })
}

/**
 * The box nearest a reference, by the gap between their edges, as the design a reference without one recorded is for.
 * The first wins a tie.
 */
export function nearestBox<T extends Bounds>(reference: Bounds, boxes: readonly T[]): T | undefined {
  let nearest: T | undefined
  let shortest = Infinity

  for (const box of boxes) {
    const across = Math.max(0, box.minX - reference.maxX, reference.minX - box.maxX)
    const down = Math.max(0, box.minY - reference.maxY, reference.minY - box.maxY)
    const gap = Math.hypot(across, down)

    if (gap < shortest) {
      nearest = box
      shortest = gap
    }
  }

  return nearest
}

/** A screen a search found, as a connector gives it, with what a reference keeps of it. */
export interface FoundScreen {
  connector: string
  id: string
  /** The app's name. */
  title: string
  platform?: "ios" | "web"
  link: string
  image: { url: string; width?: number; height?: number; expiresAt?: number }
}

/**
 * How a reference came to be placed: the description that found it, why it's here, the agent that placed it, and the
 * design it's for, by id.
 */
export interface ReferenceOrigin {
  query?: string
  note?: string
  by?: string
  design?: string
}

/** A screen a search found, as the reference that keeps it at `position` on the canvas. */
export function referenceFrom(
  screen: FoundScreen,
  id: string,
  position: Point,
  origin: ReferenceOrigin = {}
): ReferenceSpec {
  const { url, width, height, expiresAt } = screen.image
  const image: ReferenceSpec["image"] = { url }

  if (width && height) {
    image.width = width
    image.height = height
  }

  if (expiresAt !== undefined) {
    image.expiresAt = expiresAt
  }

  const reference: ReferenceSpec = {
    id,
    connector: screen.connector,
    sourceId: screen.id,
    app: screen.title,
    link: screen.link,
    image,
    position
  }

  if (screen.platform) {
    reference.platform = screen.platform
  }

  for (const key of ["query", "note", "by", "design"] as const) {
    const value = origin[key]?.trim()

    if (value) {
      reference[key] = value
    }
  }

  return reference
}

/** References added to a file, which is created when it doesn't exist yet. */
export function addReferences(
  snapshot: DesignSnapshot,
  path: string,
  references: readonly ReferenceSpec[]
): DesignSnapshot {
  if (references.length === 0) {
    return snapshot
  }

  const document = snapshot.documents.get(path) ?? { version: 3, containers: [] }
  const next = { ...document, references: [...(document.references ?? []), ...references] }

  return { ...snapshot, documents: new Map(snapshot.documents).set(path, next) }
}

/** A reference changed by `update`, or taken out when it returns undefined. */
export function changeReference(
  snapshot: DesignSnapshot,
  ref: DesignRef,
  update: (reference: ReferenceSpec) => ReferenceSpec | undefined
): DesignSnapshot {
  const document = snapshot.documents.get(ref.path)
  const current = document?.references?.find((reference) => reference.id === ref.id)

  if (!document?.references || !current) {
    return snapshot
  }

  const next = update(current)

  if (next === current) {
    return snapshot
  }

  const references = next
    ? document.references.map((reference) => (reference === current ? next : reference))
    : document.references.filter((reference) => reference !== current)

  const updated: CanvasDocument = { ...document, references }

  if (references.length === 0) {
    delete updated.references
  }

  return { ...snapshot, documents: new Map(snapshot.documents).set(ref.path, updated) }
}
