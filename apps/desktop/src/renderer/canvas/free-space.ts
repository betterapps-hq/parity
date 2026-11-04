import { type Bounds, panToShow, viewMargin } from "@parity-app/editor"
import { type Atom, atom, type Editor, react, type TLShapeId } from "tldraw"

/** Everything on the canvas page, designs and notes, for copies of designs to keep clear of (`freeSpotBeside`). */
export function takenBounds(editor: Editor): Bounds[] {
  return editor.getCurrentPageShapes().flatMap((shape) => editor.getShapePageBounds(shape) ?? [])
}

/**
 * Pans the canvas, at the zoom it's at, so designs just placed at `target` (page coordinates) are seen, as a duplicate
 * or a pasted design that lands off screen is (PAR-204). Leaves the view alone when they're in it already.
 */
export function bringIntoView(editor: Editor, target: Bounds): void {
  const view = editor.getViewportPageBounds()
  const camera = editor.getCamera()
  const shift = panToShow(view, target, viewMargin / camera.z)
  if (!shift) return
  editor.setCamera({ x: camera.x - shift.x, y: camera.y - shift.y, z: camera.z }, { animation: { duration: 250 } })
}

/** Each canvas's boards that have taken the size their content draws at, which a board just made doesn't have yet. */
const sizedBoards = new WeakMap<Editor, Atom<ReadonlySet<TLShapeId>>>()

function sizedOn(editor: Editor): Atom<ReadonlySet<TLShapeId>> {
  let sized = sizedBoards.get(editor)
  if (!sized) {
    sized = atom("sized boards", new Set<TLShapeId>())
    sizedBoards.set(editor, sized)
  }
  return sized
}

/** Says whether a board's shape has the size its content draws at, as its board measures it (see ContainerContent). */
export function setBoardSized(editor: Editor, id: TLShapeId, sized: boolean): void {
  const boards = sizedOn(editor)
  if (boards.get().has(id) === sized) return
  const next = new Set(boards.get())
  if (sized) next.add(id)
  else next.delete(id)
  boards.set(next)
}

/** How long a board just made has to draw itself before it's no longer brought into view, so it can't pan later. */
const sizingPatience = 2000

/**
 * Brings boards just made into view, as `bringIntoView` does, once each has the size its content draws at: pasted from
 * another project, a design's size isn't known until its board draws it. One that isn't drawn by then, as in a tab
 * that isn't showing, leaves the view alone.
 */
export function bringIntoViewOnceSized(editor: Editor, ids: readonly TLShapeId[]): void {
  if (ids.length === 0) return
  let done = false
  // Once, and not from inside the reaction, which is still running, and may not have been returned yet, when it first
  // finds them sized.
  const finish = (target?: Bounds) => {
    if (done) return
    done = true
    clearTimeout(timer)
    queueMicrotask(() => {
      stop()
      if (target) bringIntoView(editor, target)
    })
  }
  const timer = setTimeout(finish, sizingPatience)
  const stop = react("boards sized to bring into view", () => {
    const sized = sizedOn(editor).get()
    if (done || !ids.every((id) => sized.has(id))) return
    const boxes = ids.flatMap((id) => editor.getShapePageBounds(id) ?? [])
    finish(
      boxes.length === 0
        ? undefined
        : {
            minX: Math.min(...boxes.map((box) => box.minX)),
            minY: Math.min(...boxes.map((box) => box.minY)),
            maxX: Math.max(...boxes.map((box) => box.maxX)),
            maxY: Math.max(...boxes.map((box) => box.maxY))
          }
    )
  })
}
