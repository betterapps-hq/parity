import { findNode } from "@parity-app/core"
import { containerEntry, type DocChange } from "@parity-app/multiplayer"
import type { Palette } from "@parity-app/presence-colors"
import { findFrames, findNodeElements, nodeBox } from "../frame.ts"
import { type CarriedPictures, carriedPictureSet, type Dragger } from "./carried.ts"
import { type ElementLift, liftElements, reducedMotion } from "./element-lift.ts"
import { areaSpace, frameGeometry } from "./frame-geometry.ts"
import { corner, DropPreview } from "./layer-drag.ts"
import { layerPicture } from "./layer-picture.ts"
import { type Placement, placedBoards, type Point } from "./placed-boards.ts"
import { coversDesigns, lives, type PreviewEnd, type PreviewKind, type PreviewLife } from "./preview-life.ts"

/** What a preview item is: a board, by its design's key, or a layer in it, by id. */
export interface PreviewTarget {
  design: string
  node?: string
}

export interface Rect extends Point {
  width: number
  height: number
}

/** A node in a preview, following a point on the page (its top-left), or set to a rect there, as in a resize. */
export type PreviewItem =
  | { target: PreviewTarget; at: Point; state?: string; mode?: string }
  | { target: PreviewTarget; rect: Rect; state?: string; mode?: string }

export interface PreviewOptions {
  /** Where dragged layers would land: before the parent's child at `index`, in the frame of `state` and `mode`. */
  drop?: { design: string; parent: string; index: number; state?: string; mode?: string }
  /** The person dragging, for the outline round what moves. */
  color: Palette
  label?: string
  /** What shows it, for telemetry. */
  extension?: string
}

/** Someone else's drag, shown on this canvas (see `preview`). */
export interface Preview extends Disposable {
  /** Moves the items, at most once a frame. */
  update(items: PreviewItem[], options?: Partial<PreviewOptions>): void
  /**
   * Settles when the covering write arrives, someone else's change to the designs it moves, with the motion a local drop
   * has. If none comes within 2 s, it goes anyway, back to where the document has things.
   */
  settleOnWrite(): void
  /** Called off: what moved flies back to where it was, as a local drag Escape calls off. */
  cancel(): void
}

/** What a preview reads of a document change, to know when its write has come. */
export type PreviewChange = Pick<DocChange, "origin" | "designs" | "layers">

/**
 * The canvas a preview draws on: its tab, the canvas area, tldraw's editor, the project's document, for where layers
 * would land, and its changes, for the write that covers a drop. The document is both, in the app.
 */
export interface PreviewSurface {
  tab: string
  area: HTMLElement
  editor: { pageToScreen(point: Point): Point; getContainer(): Pick<HTMLElement, "querySelector"> }
  doc: Parameters<typeof containerEntry>[0]
  writes: { subscribe(listener: (change: PreviewChange) => void): () => void }
}

/** One part of a preview: what one kind of item does while it's carried and once it ends. */
interface Part {
  kind: PreviewKind
  move(items: PreviewItem[], options: PreviewOptions): void
  /** Ends: `dropped` by its write, `back` to where the document has it, or `gone` at once. */
  end(how: "dropped" | "back" | "gone"): void
}

let previews = 0

/** What each part does as a preview ends. */
const endings = { write: "dropped", disposed: "gone", timeout: "back", cancel: "back" } as const

/**
 * Shows someone else's drag on this canvas, as close to what they see as Parity draws it, without writing anything or
 * touching undo. It reuses the local drag's pieces (`drag-motion.ts`), in their color: a board lifts and moves with
 * their pointer, placed where the preview says (`placedBoards`) rather than where the document has it; layers in a
 * layout leave an empty outline where they were and show where they'd land at `drop`, while their picture is carried
 * (`DropPreview`, `carriedPictureSet`); an absolutely placed layer's picture is carried, since the dragger's writes move
 * the layer itself. Several previews, and the local drag, show at once: each has its own picture, copies and placements.
 */
export function preview(surface: PreviewSurface, items: PreviewItem[], options: PreviewOptions): Preview {
  const key = `preview-${++previews}`
  let current = { items, options }
  const designs = new Set(items.map((item) => item.target.design))
  const boards = items.filter((item) => !item.target.node)
  const layers = items.filter((item) => item.target.node)
  const parts: Part[] = []

  if (boards.length > 0) {
    parts.push(boardPart(surface, boards))
  }

  const layerPart = layers.length > 0 ? layersPart(surface, key, layers, options) : undefined

  if (layerPart) {
    parts.push(layerPart)
  }

  let frame = 0

  const life: PreviewLife = lives.start(
    parts[0]?.kind ?? "board",
    items.length,
    options.extension ?? "core",
    (how: PreviewEnd) => {
      window.cancelAnimationFrame(frame)
      stopWrites()
      const ending = endings[how]

      for (const part of parts) {
        part.end(ending)
      }
    }
  )

  const stopWrites = surface.writes.subscribe((change) => {
    if (coversDesigns(change, designs)) {
      life.wrote()
    }
  })

  const draw = () => {
    frame = 0

    for (const part of parts) {
      part.move(current.items, current.options)
    }
  }

  draw()

  return {
    update(next, changed) {
      if (life.ended || life.waiting) {
        return
      }

      current = { items: next, options: { ...current.options, ...changed } }
      frame ||= window.requestAnimationFrame(draw)
    },
    settleOnWrite() {
      if (frame) {
        window.cancelAnimationFrame(frame)
        draw()
      }

      life.awaitWrite()
    },
    cancel: () => life.end("cancel"),
    [Symbol.dispose]: () => life.end("disposed")
  }
}

/** Where an item's top-left is on the page. */
function topLeft(item: PreviewItem): Point {
  return "at" in item ? item.at : { x: item.rect.x, y: item.rect.y }
}

/** Boards move where the preview says, without writing, lifted as a board dragged by its name is. */
function boardPart(surface: PreviewSurface, boards: PreviewItem[]): Part {
  const placements = new Map<string, Placement>()
  let lifted: ElementLift | undefined

  const remove = () => {
    for (const placement of placements.values()) {
      placement.remove()
    }

    placements.clear()
  }

  return {
    kind: "board",
    move(items) {
      for (const item of items) {
        const { design } = item.target

        if (item.target.node || !boards.some((board) => board.target.design === design)) {
          continue
        }

        const placed = placements.get(design)

        if (placed) {
          placed.move(topLeft(item))
        } else {
          placements.set(design, placedBoards.place(surface.tab, design, topLeft(item)))
        }
      }

      lifted ??= liftElements(
        boards.flatMap(
          ({ target }) =>
            surface.editor
              .getContainer()
              .querySelector(`.container-view[data-design="${CSS.escape(target.design)}"]`) ?? []
        )
      )
    },
    end(how) {
      if (how === "back") {
        // They fly back to where the document has them.
        const flying = lifted

        if (flying) {
          flying.cancel(remove)
        } else {
          remove()
        }

        return
      }

      // Dropped, the document has them where they're shown; gone, they go back at once.
      remove()
      lifted?.drop()
    }
  }
}

/**
 * Layers carried by someone else: from a layout, the place they left is an empty outline and a landing spot shows
 * where they'd go; placed absolutely, only their picture is carried. The picture is taken once, as the preview starts.
 */
function layersPart(
  surface: PreviewSurface,
  key: string,
  layers: PreviewItem[],
  options: PreviewOptions
): Part | undefined {
  const first = layers[0]!
  const { design } = first.target
  const host = findFrames(surface.area, design, { mode: first.mode, state: first.state })[0]
  const ids = layers.flatMap(({ target }) => (target.design === design && target.node ? [target.node] : []))
  const elements = host ? ids.flatMap((id) => findNodeElements(host, id)) : []

  if (!host || elements.length === 0) {
    return undefined
  }

  const rects = ids.flatMap((id) => nodeBox(host, id) ?? [])

  const union = {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  }

  const absolute = elements.length === 1 && getComputedStyle(elements[0]!).position === "absolute"
  const { scale } = frameGeometry(host)
  const space = () => areaSpace(surface.area)
  const toArea = (page: Point) => space().point(surface.editor.pageToScreen(page))
  const reduced = reducedMotion()
  const by: Dragger = { palette: options.color, label: options.label }
  const pictures: CarriedPictures<HTMLElement> = carriedPictureSet.of(key)
  // The picture is taken before the layers are hidden.
  const picture = layerPicture(host, elements, scale, union)

  if (picture) {
    pictures.pickUp({
      area: surface.area,
      picture,
      at: space().point({ x: union.left, y: union.top }),
      grab: { x: 0, y: 0 },
      by
    })
  }

  const drop = absolute ? undefined : new DropPreview(host, elements, options.color.color, reduced)
  let at = ""

  return {
    kind: absolute ? "absolute" : "layout",
    move(items, next) {
      const item = items.find((candidate) => candidate.target.design === design && candidate.target.node === ids[0])

      if (item) {
        pictures.carry(toArea(topLeft(item)))
      }

      if (!drop) {
        return
      }

      const target = next.drop
      const where = target && `${target.design}:${target.parent}:${target.index}:${target.state}:${target.mode}`

      if (where === at) {
        return
      }

      at = where ?? ""
      const into = target && findFrames(surface.area, target.design, { mode: target.mode, state: target.state })[0]
      const parent = target && containerEntry(surface.doc, target.design)?.container.root
      const found = parent && findNode(parent, target.parent)
      const siblings = found && "children" in found ? found.children.map((child) => child.id) : []

      if (target && into) {
        drop.show(into, { design: target.design, parent: target.parent, index: target.index }, siblings)
      } else {
        drop.clear()
      }
    },
    end(how) {
      // The picture is forgotten once it's landed, so its flight isn't cut short.
      const forget = () => carriedPictureSet.forget(key)

      if (how === "gone") {
        drop?.end(true)
        forget()

        return
      }

      if (how === "dropped") {
        const spot = drop?.spot(space())
        drop?.end(false)
        const to = spot ?? pictures.store.get()?.at ?? space().point({ x: union.left, y: union.top })
        pictures.letGo("dropping", to, reduced, forget, spot)

        return
      }

      drop?.end(true)
      const home = corner(ids.flatMap((id) => nodeBox(host, id) ?? [])) ?? { x: union.left, y: union.top }
      pictures.letGo("cancelling", space().point(home), reduced, forget)
    }
  }
}
