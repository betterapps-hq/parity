import { resolveMode, type ResolvedMode } from "@parity-app/core"
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { useModeSettings } from "../../design-store.ts"
import {
  type BoardData,
  type OwnValues,
  resetValues,
  routeBoards,
  type StateItem,
  storyBoards,
  unsavedKeys,
  type ValueKey,
  withValue
} from "./model.ts"

/*
 * What the exploration's canvas and Design tab share: how each design is shown, each preview's own values as they are
 * and as last saved, and what's selected. A preview is a state in a mode, a story's row in a mode's column, and its
 * values are its own. The modes are the project's own, so editing them on the Modes tab redraws the canvas.
 */

/** How a design is shown: its states and its modes in order and which show, and its previews' own values. */
export interface BoardView {
  /** The design's states in its order, by id, and which show: a Storybook file's stories. */
  stateOrder: string[]
  statesShown: string[]
  /** The project's modes in the design's order, by id, and which show. */
  order: string[]
  shown: string[]
  /** Each preview's own values as they are now, by its key (`previewKey`). */
  own: Record<string, OwnValues>
  /** As last saved: what a reset puts back. */
  saved: Record<string, OwnValues>
  /** Previews being resized keep the scale they started at, by key, so the edge dragged follows the pointer. */
  holding?: Record<string, number> | undefined
}

/**
 * A design, or some of its previews, by key (`previewKey`). Shift+click adds a preview or takes it away, and the last
 * picked holds their settings in its header.
 */
export interface SketchSelection {
  board?: string | undefined
  previews?: string[] | undefined
}

export interface SketchSetup {
  /** Which designs the canvas holds: the router's pages, the Storybook stories, or both. */
  show: "routes" | "stories" | "both"
  selected?: SketchSelection
  /** The modes a design shows, in order, by design: the project's first mode alone for one not named. */
  modes?: Record<string, string[]>
  /** The states a design shows, in order, by design: its first alone for one not named. */
  states?: Record<string, string[]>
  /** Values changed but not saved yet, by design and preview key. */
  unsaved?: Record<string, Record<string, OwnValues>>
}

interface Sketch {
  boards: BoardData[]
  /** The project's modes, in its order. */
  modes: ResolvedMode[]
  views: Record<string, BoardView>
  selection: SketchSelection
  select: (selection: SketchSelection) => void
  setView: (board: string, change: (view: BoardView) => Partial<BoardView>) => void
  /** Sets a preview's own value, by the preview's key, or leaves it to its mode with `undefined`. */
  setValue: (board: string, preview: string, key: ValueKey, value: number | string | undefined) => void
  /** Puts a preview's values back as last saved: those given, or every one. */
  reset: (board: string, preview: string, keys?: ValueKey[]) => void
  /** Whether anything changed since the last save. */
  dirty: boolean
  save: () => void
  param: string
  setParam: (value: string) => void
}

const SketchContext = createContext<Sketch | undefined>(undefined)

export function useSketch(): Sketch {
  const sketch = useContext(SketchContext)

  if (!sketch) {
    throw new Error("useSketch needs a SketchProvider")
  }

  return sketch
}

/** The modes a design shows, in its order: the project's, with any added since in project order after them. */
export function shownModes(view: BoardView, modes: ResolvedMode[]): ResolvedMode[] {
  return orderedModes(view, modes).filter((mode) => view.shown.includes(mode.id))
}

/** Every mode of the project in the design's order. */
export function orderedModes(view: BoardView, modes: ResolvedMode[]): ResolvedMode[] {
  const known = view.order.flatMap((id) => modes.find((mode) => mode.id === id) ?? [])

  return [...known, ...modes.filter((mode) => !view.order.includes(mode.id))]
}

/** The states a design shows, in its order. */
export function shownStates(board: BoardData, view: BoardView): StateItem[] {
  return orderedStates(board, view).filter((state) => view.statesShown.includes(state.id))
}

/** Every state of a design in its order: its own, with any it has gained since after them. */
export function orderedStates(board: BoardData, view: BoardView): StateItem[] {
  const known = view.stateOrder.flatMap((id) => board.states.find((state) => state.id === id) ?? [])

  return [...known, ...board.states.filter((state) => !view.stateOrder.includes(state.id))]
}

export function SketchProvider({ setup, children }: { setup: SketchSetup; children: ReactNode }) {
  const { store } = useProject()
  const settings = useModeSettings(store)
  const modes = useMemo(() => settings.modes.map((mode) => resolveMode(settings, mode)), [settings])

  const boards = useMemo(
    () => [...(setup.show === "stories" ? [] : routeBoards), ...(setup.show === "routes" ? [] : storyBoards())],
    [setup.show]
  )

  const [views, setViews] = useState<Record<string, BoardView>>(() => {
    return Object.fromEntries(
      boards.map((board) => {
        const shown = setup.modes?.[board.id] ?? [modes[0]!.id]
        const statesShown = setup.states?.[board.id] ?? [board.states[0]!.id]

        return [
          board.id,
          {
            stateOrder: [
              ...statesShown,
              ...board.states.map((state) => state.id).filter((id) => !statesShown.includes(id))
            ],
            statesShown,
            order: [...shown, ...modes.map((mode) => mode.id).filter((id) => !shown.includes(id))],
            shown,
            own: structuredClone(setup.unsaved?.[board.id] ?? {}),
            saved: {}
          }
        ]
      })
    )
  })

  const [selection, select] = useState<SketchSelection>(setup.selected ?? {})
  const [param, setParam] = useState("atlas")

  const setView = (board: string, change: (view: BoardView) => Partial<BoardView>) =>
    setViews((all) => ({ ...all, [board]: { ...all[board]!, ...change(all[board]!) } }))

  // From the newest view, so a drag's many changes between draws each build on the last.
  const changeOwn = (
    board: string,
    preview: string,
    change: (own: OwnValues | undefined, saved: OwnValues | undefined) => OwnValues
  ) => setView(board, (view) => ({ own: { ...view.own, [preview]: change(view.own[preview], view.saved[preview]) } }))

  const dirty = Object.values(views).some((view) =>
    Object.keys({ ...view.own, ...view.saved }).some((key) => unsavedKeys(view.own[key], view.saved[key]).length > 0)
  )

  const save = () =>
    setViews((all) =>
      Object.fromEntries(Object.entries(all).map(([id, view]) => [id, { ...view, saved: structuredClone(view.own) }]))
    )

  // Ctrl+S saves, as it does in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        setViews((all) =>
          Object.fromEntries(
            Object.entries(all).map(([id, view]) => [id, { ...view, saved: structuredClone(view.own) }])
          )
        )
      }
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const sketch: Sketch = {
    boards,
    modes,
    views,
    selection,
    select,
    setView,
    setValue: (board, preview, key, value) => changeOwn(board, preview, (own) => withValue(own, key, value)),
    reset: (board, preview, keys) => changeOwn(board, preview, (own, saved) => resetValues(own, saved, keys)),
    dirty,
    save,
    param,
    setParam
  }

  return <SketchContext value={sketch}>{children}</SketchContext>
}
