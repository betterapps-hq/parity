import {
  boardTarget,
  type ContainerSpec,
  editNode,
  findNode,
  locateNode,
  type NodeStyle,
  topmostNodes
} from "@parity-app/core"
import {
  absoluteDrag,
  boardReader,
  moveLayersAcross,
  moveLayersWithin,
  type MoveTarget,
  layersSelection,
  selectedNodes
} from "@parity-app/editor"
import {
  type ContainerEntry,
  containerEntry,
  designKey,
  editFrame,
  updateContainer,
  updateContainers
} from "@parity-app/multiplayer"
import {
  adoptFrameSheet,
  dropFrameSheet,
  findFrames,
  findNodeElement,
  findNodeElements,
  frameRuleSheets,
  nodeBox
} from "../frame.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { carriedPicture, type Spot } from "./carried.ts"
import { dropPreviewSheet, markPreviewCopy } from "./drop-preview-rules.ts"
import { type DropAt, DragLayouts, dropInFrame } from "./drop-target.ts"
import { type ElementLift, liftElements, reducedMotion, styleElements } from "./element-lift.ts"
import { areaSpace, frameGeometry } from "./frame-geometry.ts"
import { type Drag, followPress, gestures } from "./gesture.ts"
import { hideLayers } from "./hide-layers.ts"
import { frameAt, type Point } from "./hit.ts"
import { kindColors } from "./kinds.tsx"
import { drawLandingEdge } from "./landing-edge.ts"
import { insetSteps } from "./layer-measure.ts"
import { layerPicture } from "./layer-picture.ts"
import { LayerSnapping } from "./layer-snap.ts"
import { endSlides, slideElements } from "./make-room.ts"
import { type Drop, inFrame, layerRef, type Started, telling } from "./presence-gestures.ts"
import { StylePreview } from "./style-preview.ts"

/**
 * Moving layers by dragging them, on the canvas or in the Layers panel. In a layout they go wherever they're dropped,
 * between other layers or into another layout, in the same design or another. A layer placed absolutely moves live by
 * its insets instead, snapping to its siblings and its parent. Where they land and how they move are
 * `@parity-app/editor`'s (`dropTargetAt`, `moveLayersWithin`, `moveLayersAcross`, `absoluteDrag`); this follows the
 * pointer, measures the frames, shows the
 * preview and applies the move to the document and the selection.
 *
 * They move as everything dragged on the canvas does (`drag-motion.ts`, the `Parity/Canvas/Dragging` stories). From a
 * layout, a picture of the layers is carried, lifted (`carriedPicture`, drawn by the overlay's `CarriedPicture`), while
 * an empty dashed outline of them shows where they'd land (`DropPreview`); dropped, the picture flies into where they
 * landed, which keeps the outline until it gets there; cancelled, it flies back to where they are, which stays empty
 * until then. An
 * absolutely placed layer lifts itself, follows the pointer and settles where it's dropped, or flies back
 * (`liftElements`).
 */

export type { MoveTarget } from "@parity-app/editor"

/**
 * What the canvas draws while layers are dragged. Carried out of a layout (`carried`), they're hidden where they were
 * until their picture lands, so they have no outline; `line` marks where they'd go when their copy can't be shown. An
 * absolutely placed layer moves itself, so it has neither.
 */
export interface DragView {
  carried?: true
  line?: { x: number; y: number; w: number; h: number }
}

let view: DragView | undefined

/** Counts drags, so a picture landing after another drag began leaves that drag's view alone. */
let drags = 0

export function getDragView(): DragView | undefined {
  return view
}

/**
 * Follows a press on selected layers. It becomes a drag once the pointer moves; released before that, `onClick` runs
 * instead. Escape cancels a drag, and so does the pointer being cancelled or the window losing focus: in a layout
 * nothing has moved yet, and an absolutely placed layer goes back (see `gestures.layerDrag` and
 * `gestures.absoluteDrag`).
 */
export function pressLayers(
  session: ProjectDesigns & Pick<ProjectSession, "editor" | "info" | "loaded" | "tokens">,
  area: HTMLElement,
  start: PointerEvent,
  onClick: () => void
): void {
  const current = session.selection.get()
  const entry = current.design ? containerEntry(session.doc, current.design) : undefined

  if (!entry) {
    return
  }

  const ids = topmostNodes(entry.container.root, selectedNodes(current))
    .map((node) => node.id)
    .filter((id) => id !== entry.container.root.id)

  if (ids.length === 0) {
    return
  }

  const host = findFrames(area, entry.key, { mode: current.mode, state: current.state })[0]
  // Everything each layer draws at its top level, so a component returning a fragment moves whole.
  const elements = host ? ids.flatMap((id) => findNodeElements(host, id)) : []

  if (!host || elements.length === 0) {
    return
  }

  const rects = ids.flatMap((id) => nodeBox(host, id) ?? [])

  const union = {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  }

  const edited = editFrame(session.doc, current)

  if (!edited) {
    return
  }

  const { state, viewport } = edited
  const primary = findNode(entry.container.root, ids.at(-1)!)

  const absolute =
    ids.length === 1 &&
    primary &&
    boardReader(entry.container, { state, viewport })(primary).style?.position === "absolute"

  const space = areaSpace(area)
  let target: MoveTarget | undefined

  let preview: DropPreview | undefined
  // Targets are found in the layouts as they were when the drag began, not as the preview reflows them.
  const layouts = new DragLayouts()
  let placed: ReturnType<typeof followAbsolute>
  let lifted: ElementLift | undefined
  // The frame the layers would land in, last.
  let landing: HTMLElement | undefined
  // Which drag this is, once the press becomes one.
  let drag = 0
  // Dropped into another design, the layers change that one too.
  const moves = { designs: [entry.key], layers: ids }

  // What others see of this drag (`parity.presence`): each layer from the pointer, and where they'd land.
  const pressed = new Map(ids.map((id) => [id, nodeBox(host, id)]))

  const describe = (): Started | undefined => {
    const { editor } = session

    if (!editor) {
      return undefined
    }

    const pointer = editor.screenToPage({ x: start.clientX, y: start.clientY })
    const frame = inFrame(state?.id, current.mode)

    return {
      kind: "move",
      targets: ids.flatMap((id) => {
        const rect = pressed.get(id)

        if (!rect) {
          return []
        }

        const from = editor.screenToPage({ x: rect.left, y: rect.top })
        const to = editor.screenToPage({ x: rect.right, y: rect.bottom })
        const offset = { x: from.x - pointer.x, y: from.y - pointer.y }

        return [
          {
            ...frame,
            ref: layerRef(session.doc, entry.key, id),
            offset,
            size: { width: to.x - from.x, height: to.y - from.y }
          }
        ]
      })
    }
  }

  const landingOf = (): Drop | undefined =>
    absolute || !target
      ? undefined
      : {
          ...inFrame(state?.id, current.mode),
          parent: layerRef(session.doc, target.design, target.parent),
          index: target.index
        }

  followPress(
    absolute ? gestures.absoluteDrag : gestures.layerDrag,
    session.doc,
    start,
    telling(
      session,
      {
        design: absolute ? entry.key : undefined,
        moves,
        cursor: "grabbing",
        start(gesture) {
          drag = ++drags
          const { scale } = frameGeometry(host)

          if (absolute) {
            placed = followAbsolute(session, entry, ids[0]!, host, gesture)
            lifted = liftElements(elements, { origin: { x: start.clientX, y: start.clientY }, scale })

            return
          }

          // A picture still flying from the last drag lands first, so layers it kept hidden until then are drawn again
          // before they're pictured: grabbed again on their way back, they'd otherwise be carried unseen.
          carriedPicture.finish()
          layouts.measure(host, entry.container.root)
          // The picture is taken before the layers are hidden, of the box it's carried by.
          const picture = layerPicture(host, elements, scale, union)

          if (picture) {
            carriedPicture.pickUp({
              area,
              picture,
              at: space.point({ x: union.left, y: union.top }),
              grab: { x: start.clientX - union.left, y: start.clientY - union.top }
            })
          }

          preview = new DropPreview(host, elements, landingColor(area), reducedMotion())
          view = { carried: true }
        },
        move(event) {
          const delta = { x: event.clientX - start.clientX, y: event.clientY - start.clientY }

          if (absolute) {
            placed?.move(delta, event)
            view = {}

            return
          }

          carriedPicture.carry(space.point({ x: union.left + delta.x, y: union.top + delta.y }))
          const found = moveTarget(area, session, { x: event.clientX, y: event.clientY }, entry, ids, layouts)
          target = found?.target
          landing = found?.host
          // The layouts reflow around a copy of the layers where they'd land; the line is only for when they can't.
          const shown = found ? preview!.show(found.host, found.target, found.siblings) : (preview!.clear(), false)
          view = { carried: true }

          if (found && !shown) {
            view.line = { ...found.line, ...space.point(found.line) }
          }
        },
        // Dropped, layers in a layout move, and so does an absolutely placed layer, which was previewed as it moved.
        end(kept, gesture) {
          if (absolute) {
            view = undefined

            if (kept) {
              placed?.end(true)
              lifted?.drop()
            } else {
              lifted?.cancel(() => placed?.end(false))
            }

            return
          }

          const copies = preview?.spot(space)
          // Called off, the row closes around where the layers come back; dropped, the move lays it out as it's shown.
          preview?.end(!kept || !target)
          const reduced = reducedMotion()

          // Once the picture has landed, the layers' outlines come back, unless another drag has begun.
          const landed = (put: () => void) => () => {
            put()

            if (drags === drag) {
              view = undefined
            }
          }

          if (!kept || !target) {
            // Back where they were, they stay empty until the picture gets there.
            const back = styleElements(elements, { opacity: "0" })
            const home = corner(ids.flatMap((id) => nodeBox(host, id) ?? [])) ?? { x: union.left, y: union.top }
            carriedPicture.letGo("cancelling", space.point(home), reduced, landed(back))

            return
          }

          if (moveLayers(session, entry, ids, target, gesture.gesture) && target.design !== entry.key) {
            moves.designs.push(target.design)
          }

          // Where they landed stays an outline, drawn over the canvas, until the picture gets there.
          let unmark: (() => void) | undefined
          let gone = false
          const to = copies ?? carriedPicture.store.get()?.at

          carriedPicture.letGo(
            "dropping",
            to ?? space.point({ x: union.left, y: union.top }),
            reduced,
            landed(() => {
              gone = true
              unmark?.()
            }),
            copies
          )

          if (!gone && landing) {
            markLanded(session, landing, (put) => {
              if (gone) {
                put()
              } else {
                unmark = put
              }
            })
          }
        },
        click: onClick
      },
      describe,
      landingOf
    )
  )
}

/** The top-left corner of boxes, or nothing without any. */
export function corner(boxes: readonly DOMRect[]): Point | undefined {
  if (boxes.length === 0) {
    return undefined
  }

  return { x: Math.min(...boxes.map((box) => box.left)), y: Math.min(...boxes.map((box) => box.top)) }
}

/**
 * Leaves where the selected layers landed in a frame empty, as their place was while they were carried, once the frame
 * draws them there, which may take an animation frame or two; `marked` gets what shows them.
 */
function markLanded(session: ProjectDesigns, host: HTMLElement, marked: (unmark: () => void) => void, tries = 2): void {
  window.requestAnimationFrame(() => {
    const elements = selectedNodes(session.selection.get()).flatMap((id) => findNodeElements(host, id))

    if (elements.length > 0) {
      marked(hideLayers(elements))
    } else if (tries > 1) {
      markLanded(session, host, marked, tries - 1)
    }
  })
}

/**
 * The layer color as the canvas `area` draws it, for the outline of where layers land, which goes inside frames: a frame
 * sets the custom properties Parity's page gives it back to `initial`, so the color's `var()` means nothing there.
 */
function landingColor(area: Element): string {
  const name = /^var\((--[\w-]+)\)$/.exec(kindColors.layer)?.[1]

  return name ? getComputedStyle(area).getPropertyValue(name).trim() : kindColors.layer
}

/**
 * Where layers dropped at a point would go: in the frame under it, the layout and the slot under the point, by the
 * layouts as they were when the drag began (see `dropTargetAt`). The line to draw is in client coordinates.
 */
export function moveTarget(
  area: ParentNode,
  session: Pick<ProjectSession, "editor" | "doc">,
  point: Point,
  source: ContainerEntry,
  ids: readonly string[],
  layouts: DragLayouts
): DropAt | undefined {
  const frame = frameAt(area, session.doc, point, session.editor)

  return frame && dropInFrame(layouts, frame.entry, frame.host, point, source.key, ids)
}

/**
 * Shows where dragged layers would land, before anything changes: the layers are hidden where they are, and copies
 * of them go where they'd be dropped, so every layout around them reflows exactly as it will. The copies aren't
 * drawn, only a dashed outline round each, as `LandingSpot` draws it (`drawLandingEdge`), so the layers read as moved
 * rather than copied. They're plain DOM, outside React, and gone before the move is made. As the copies move, they and
 * the layers around them slide to their new places (`slideElements`), rather than jumping there. Each drag has its own,
 * the local one's and each preview's of someone else's (`drag-preview.ts`), with its own copies and rules.
 */
export class DropPreview {
  private readonly templates: HTMLElement[]
  /** Each layer's corners, in its own pixels, which its outline follows. */
  private readonly radii: number[]
  /** Which layers clip what overflows them, so their outline is drawn inside, where it's seen. */
  private readonly clips: boolean[]
  private copies: HTMLElement[] = []
  /** Each copy's landing outline. */
  private edges: HTMLElement[] = []
  private hidden = false
  private at = ""

  /** The frame's rules about the layers, for their copies (`dropPreviewSheet`), and the frame showing them. */
  private readonly rules: CSSStyleSheet
  private ruled: Element | undefined

  constructor(
    source: Element,
    private readonly originals: HTMLElement[],
    private readonly color: string,
    private readonly reduced: boolean
  ) {
    this.rules = dropPreviewSheet(frameRuleSheets(source))
    this.radii = originals.map((original) => parseFloat(getComputedStyle(original).borderTopLeftRadius) || 0)
    this.clips = originals.map((original) => {
      const style = getComputedStyle(original)

      return style.overflowX !== "visible" || style.overflowY !== "visible"
    })
    this.templates = originals.map((original) => {
      // SAFETY: a deep clone of an element is an element of the same kind.
      const copy = original.cloneNode(true) as HTMLElement

      // Copies aren't layers: hit testing and outlines must not find them. They're drawn by the preview's rules.
      markPreviewCopy(copy)

      copy.dataset.dropPreview = ""
      // It holds the layers' place, unseen, under its outline, which shows itself.
      hideLayers([copy], [original])
      copy.style.pointerEvents = "none"

      if (getComputedStyle(original).position === "static") {
        copy.style.position = "relative"
      }

      return copy
    })
  }

  /**
   * Hides the layers where they are, the first time the copies are put somewhere, inside what's measured, so what's
   * beside them is measured with them still there and slides only as far as the copies move it.
   */
  private hide(): void {
    if (this.hidden) {
      return
    }

    this.hidden = true

    for (const original of this.originals) {
      hideOriginal(original)
    }
  }

  /** What's beside the layers where they are, until they're hidden there. */
  private home(): Element[] {
    return this.hidden ? [] : this.beside(this.originals)
  }

  /** What's in the layouts elements are in: them and what's beside them. */
  private beside(elements: readonly Element[]): Element[] {
    return [...new Set(elements.map((element) => element.parentElement))].flatMap((parent) => [
      ...(parent?.children ?? [])
    ])
  }

  /** Puts the copies at a target. Returns false when the layout isn't in the frame, so nothing could be shown. */
  show(host: HTMLElement, target: MoveTarget, siblings: readonly string[]): boolean {
    const key = `${host.dataset.design}:${host.dataset.mode}:${host.dataset.state}:${target.parent}:${target.index}`

    if (key === this.at) {
      return true
    }

    const parent = findNodeElement(host, target.parent)

    if (!parent) {
      this.clear()

      return false
    }

    const before = siblings
      .slice(target.index)
      .map((id) => findNodeElement(host, id))
      .find((element) => element && element.parentElement === parent && !this.originals.includes(element))

    // The copies move from where they were, so they slide along with what makes room for them.
    slideElements(
      [...this.beside(this.copies), ...this.home(), ...parent.children],
      () => {
        this.hide()

        // The copies are drawn by their layers' rules in whichever frame they're shown in.
        if (this.ruled !== host) {
          this.unrule()
          adoptFrameSheet(host, this.rules)
          this.ruled = host
        }

        // SAFETY: a deep clone of an element is an element of the same kind.
        const copies =
          this.copies.length > 0 ? this.copies : this.templates.map((t) => t.cloneNode(true) as HTMLElement)

        if (copies !== this.copies) {
          this.edges = copies.map(() => document.createElement("span"))
        }

        // The outline is drawn in the frame's pixels, so it's redrawn for the frame's scale.
        const { scale } = frameGeometry(host)

        copies.forEach((copy, index) => {
          parent.insertBefore(copy, before ?? null)
          drawLandingEdge(copy, this.edges[index]!, {
            color: this.color,
            scale,
            radius: this.radii[index]!,
            clips: this.clips[index]!
          })
        })

        this.copies = copies
      },
      this.reduced
    )

    this.at = key

    return true
  }

  /**
   * Where the copies are laid out, in the overlay's pixels, and how round, for their outline: where the layers will be
   * put, so a copy still sliding there is measured as it'll end. Nothing when none is shown.
   */
  spot(space: ReturnType<typeof areaSpace>): Spot | undefined {
    endSlides(this.copies)
    const at = corner(this.copies.map((copy) => copy.getBoundingClientRect()))
    const first = this.copies[0]

    if (!at || !first) {
      return undefined
    }

    const right = Math.max(...this.copies.map((copy) => copy.getBoundingClientRect().right))
    const bottom = Math.max(...this.copies.map((copy) => copy.getBoundingClientRect().bottom))
    const size = first.offsetWidth
    const scale = size > 0 ? first.getBoundingClientRect().width / size : 1

    return { ...space.point(at), w: right - at.x, h: bottom - at.y, radius: this.radii[0]! * scale }
  }

  /** Takes the copies away, and what was beside them slides back together. */
  clear(): void {
    slideElements(
      [...this.beside(this.copies), ...this.home()],
      () => {
        this.hide()
        this.remove()
      },
      this.reduced
    )
  }

  /**
   * Takes the copies away and shows the layers again. `close` slides what's around them to where they leave it, as when
   * the drag is called off; dropped, the move lays it out just as the copies did, so nothing slides.
   */
  end(close: boolean): void {
    const show = () => {
      this.remove()

      if (this.hidden) {
        this.hidden = false
        this.originals.forEach(showOriginal)
      }
    }

    if (close) {
      slideElements([...this.beside(this.copies), ...this.beside(this.originals)], show, this.reduced)
    } else {
      show()
    }
  }

  private unrule(): void {
    if (this.ruled) {
      dropFrameSheet(this.ruled, this.rules)
      this.ruled = undefined
    }
  }

  private remove(): void {
    for (const element of [...this.copies, ...this.edges]) {
      element.remove()
    }

    this.copies = []
    this.edges = []
    this.unrule()
    this.at = ""
  }
}

/** Layers hidden by drop previews, by how many hide each, and the `display` each had before the first did. */
const hiddenOriginals = new WeakMap<HTMLElement, { display: string; by: number }>()

/** Hides a layer for a drop preview; several previews can hide one, and it shows again once the last lets go. */
function hideOriginal(original: HTMLElement): void {
  const hidden = hiddenOriginals.get(original) ?? { display: original.style.getPropertyValue("display"), by: 0 }
  hidden.by++
  hiddenOriginals.set(original, hidden)
  original.style.setProperty("display", "none", "important")
}

/** Lets go of a layer one drop preview hid: the last to let go puts back the `display` it had. */
function showOriginal(original: HTMLElement): void {
  const hidden = hiddenOriginals.get(original)

  if (!hidden || --hidden.by > 0) {
    return
  }

  hiddenOriginals.delete(original)

  if (hidden.display) {
    original.style.setProperty("display", hidden.display)
  } else {
    original.style.removeProperty("display")
  }
}

/**
 * Draws layers other drop previews hid as they are, for a moment, so another preview can measure and picture them;
 * what it gives back hides them again.
 */
export function showHidden(elements: readonly HTMLElement[]): () => void {
  const hidden = elements.flatMap((element) => {
    const was = hiddenOriginals.get(element)

    return was ? [{ element, display: was.display }] : []
  })

  for (const { element, display } of hidden) {
    if (display) {
      element.style.setProperty("display", display)
    } else {
      element.style.removeProperty("display")
    }
  }

  return () => {
    for (const { element } of hidden) {
      element.style.setProperty("display", "none", "important")
    }
  }
}

/**
 * Moves layers to a target as one undo step, in the drag's gesture when given. Within a design they keep their ids,
 * and every state's changes to them; into another design they go as they're shown, with fresh ids. Returns whether
 * they moved.
 */
export function moveLayers(
  session: ProjectDesigns,
  source: ContainerEntry,
  ids: readonly string[],
  target: MoveTarget,
  gesture?: string
): boolean {
  const { doc, selection } = session
  const frame = { mode: selection.get().mode, state: selection.get().state }
  const label = ids.length === 1 ? "Move layer" : `Move ${ids.length} layers`

  if (target.design === source.key) {
    if (moveLayersWithin(source.container, ids, target) === source.container) {
      return false
    }

    updateContainer(doc, source.key, label, (container) => moveLayersWithin(container, ids, target), { gesture })
    selection.set(layersSelection(source.key, [...ids], frame))

    return true
  }

  const destination = containerEntry(doc, target.design)

  if (!destination) {
    return false
  }

  const edited = editFrame(doc, { design: source.key, ...frame })

  if (!edited) {
    return false
  }

  const { state, viewport } = edited
  let copies: string[] = []
  updateContainers(
    doc,
    [source.key, destination.key],
    label,
    ([from, to]) => {
      const moved = moveLayersAcross(from!, to!, ids, target, state, viewport)
      copies = moved.copies

      return [moved.source, moved.destination]
    },
    { gesture }
  )

  if (copies.length === 0) {
    return false
  }

  selection.set(layersSelection(designKey(destination.path, destination.container.id), copies))

  return true
}

/**
 * Moves an absolutely placed layer as the pointer moves, by the insets `@parity-app/editor`'s `absoluteDrag` gives,
 * snapping to its siblings and its parent as `LayerSnapping` measured them. While it's dragged the move is previewed
 * on the frames' elements (`StylePreview`), and the design is written once, when it's dropped (PAR-551): one undo
 * step, and nothing to undo when it ends where it began or Escape calls it off. A component that doesn't draw the
 * styles it's given on its root can't be previewed (CAN-45), so it's written as it moves instead, in the drag's
 * gesture, which Escape takes back.
 */
function followAbsolute(
  session: ProjectDesigns & Pick<ProjectSession, "editor" | "info" | "loaded" | "tokens">,
  entry: ContainerEntry,
  id: string,
  host: HTMLElement,
  drag: Drag
): { move(delta: Point, held: { ctrlKey: boolean; metaKey: boolean }): void; end(kept: boolean): void } | undefined {
  const { doc, editor } = session
  const current = session.selection.get()
  const unit = spacingUnit(session.tokens.get())
  const edited = editFrame(doc, current)
  const location = locateNode(entry.container.root, id)

  if (!location || !edited) {
    return undefined
  }

  const { state, viewport } = edited
  // The scale, where the layer's sides are drawn and what it snaps to, all read from the frame as it's drawn now.
  const frame = frameGeometry(host)
  const { scale } = frame
  const insets = frame.node(id)?.insets
  const snapping = LayerSnapping.measure(editor, frame, entry.container, id)

  const follow = absoluteDrag({
    style: boardReader(entry.container, { state, viewport })(location.node).style ?? {},
    // Where its sides are drawn, for those set by a token or not at all.
    drawn: insets && insetSteps(insets, unit),
    unit,
    scale,
    snapping
  })

  const moved = (style: NodeStyle) => (container: ContainerSpec) =>
    editNode(container, boardTarget(container, state.id), id, { style })

  const write = (style: NodeStyle) =>
    updateContainer(doc, entry.key, "Move layer", moved(style), { gesture: drag.gesture })

  const preview = new StylePreview(session, entry.key)
  // Whether the move is written as it goes, for a layer the preview can't show.
  let live = false
  let shown: NodeStyle = {}

  return {
    move(delta, held) {
      const { change, snapped } = follow({ dx: delta.x, dy: delta.y, snaps: snapping?.snaps(held) ?? false })
      snapping?.show(snapped)

      if (JSON.stringify(change) === JSON.stringify(shown)) {
        return
      }

      const moving = Object.keys(change).length > 0

      if (live) {
        // A side moved back to where it began goes back to what was written, which only the drag's checkpoint has.
        if (Object.keys(shown).some((side) => !(side in change))) {
          drag.revert()
        }

        if (moving) {
          write(change)
        }
      } else {
        preview.show(moving ? moved(change) : (container) => container)
        live = moving && !preview.active

        if (live) {
          write(change)
        }
      }

      shown = change
    },
    end(kept) {
      snapping?.clear()
      const moving = Object.keys(shown).length > 0

      if (live || !kept || !moving) {
        preview.cancel()

        return
      }

      // The frames already show the move, so they're left as they are while the design draws it.
      preview.settle(moved(shown))
      write(shown)
    }
  }
}
