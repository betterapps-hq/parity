import { addDesigns, type CanvasDocument, type ImportedScreen } from "@parity-app/core"
import { moveDesign, type PackedBox, packRows, titleRoom } from "@parity-app/editor"
import type { ProjectInfo } from "@parity-app/project"
import type { Editor } from "tldraw"
import type { ContainerEntry, DesignStore } from "../design-store.ts"
import { componentBoardsTop } from "./component-boards.ts"
import { createCanvasId } from "./tldraw-names.ts"

/**
 * Where the screens the project's tools describe are kept among its designs, as its Storybook stories: a design file of
 * their own that's never saved, since they're read from the tool's files each time the project opens.
 */
export const storyScreensFile = "(stories)"

/** The layer of a story's screen that draws the story, as `storybook-adapter` names it. */
export const storyLayer = "story"

/**
 * How the imported screens are laid out: a row for each group, left of the boards and pages, as far apart as story
 * boards are, which hug their stories. Before a story is measured it's taken to be `guess` in size.
 */
const layout = { guess: { width: 320, height: 240 }, gaps: { column: 120, row: 200 }, beside: 800 }

/**
 * The project's imported screens as a design file, or none without any: a row for each group, as a story file's
 * stories, left of everything else on the canvas, each named for its group's last part and its own name, as
 * `Button / Outline`.
 */
export function storyScreensDocument(info: Pick<ProjectInfo, "id" | "entities" | "documents" | "sources">): {
  path: string
  document: CanvasDocument
}[] {
  const imported = info.entities.screens ?? []

  if (imported.length === 0) {
    return []
  }

  const groups = [...Map.groupBy(imported, (screen) => screen.group).values()]
  const columns = Math.max(...groups.map((screens) => screens.length))
  const left = -layout.beside - columns * (layout.guess.width + layout.gaps.column)
  const rows = groups.map((row) => row.map((each): PackedBox => ({ key: each.screen.id, ...layout.guess })))
  const placed = packRows(rows, { x: left, y: componentBoardsTop(info) }, layout.gaps)

  const screens = groups.flat().map((each) => ({
    ...each.screen,
    name: `${groupLeaf(each)} / ${each.screen.name}`,
    position: placed.get(each.screen.id) ?? { x: left, y: 0 }
  }))

  return [{ path: storyScreensFile, document: addDesigns(undefined, screens) }]
}

/** A group's last part, as `Button` for `UI/Button`. */
function groupLeaf(screen: ImportedScreen): string {
  return screen.group.split("/").at(-1)?.trim() ?? screen.group
}

/** Where a story is listed in Layers: the folders its adapter puts it in, as `UI` then `Button`, and its name. */
export interface StoryPlace {
  folders: string[]
  name: string
}

/** Each imported screen's place in Layers, by its design's id, as Storybook's sidebar lists the stories. */
export function storyPlaces(info: Pick<ProjectInfo, "entities">): ReadonlyMap<string, StoryPlace> {
  return new Map(
    (info.entities.screens ?? []).map((each) => [
      each.screen.id,
      {
        folders: each.folders ?? [],
        name: each.screen.name
      }
    ])
  )
}

/**
 * Where each story goes once the canvas has measured it: its row, as the stories were first laid out, packed left to
 * right by the stories' sizes, so a badge's row is as narrow as its badges. Each takes at least the room its title
 * needs (`titleWidth`, in screen pixels, through `titleRoom`), so a narrow story's name reads in full zoomed out. The
 * rows start from the stories' top, and the widest ends `layout.beside` left of the boards and pages.
 */
export function storyPositions(
  entries: readonly ContainerEntry[],
  sizeOf: (entry: ContainerEntry) => { width: number; height: number } | undefined,
  titleWidth: (entry: ContainerEntry) => number = () => 0
): Map<string, { x: number; y: number }> {
  const stories = entries.filter((entry) => entry.path === storyScreensFile)

  if (stories.length === 0) {
    return new Map()
  }

  const rows = [...Map.groupBy(stories, (entry) => entry.container.position.y)]
    .toSorted(([a], [b]) => a - b)
    .map(([, row]) =>
      row
        .toSorted((a, b) => a.container.position.x - b.container.position.x)
        .map((entry): PackedBox => {
          const size = sizeOf(entry) ?? layout.guess

          return { key: entry.key, ...size, width: Math.max(size.width, titleRoom(titleWidth(entry))) }
        })
    )

  const widest = Math.max(
    ...rows.map((row) => row.reduce((width, box) => width + box.width, 0) + (row.length - 1) * layout.gaps.column)
  )

  const origin = {
    x: -layout.beside - widest,
    y: Math.min(...stories.map((entry) => entry.container.position.y))
  }

  return packRows(rows, origin, layout.gaps)
}

/** What a board's title has besides its name, in screen pixels: its padding, its icon and the gap after it. */
const titleChrome = 4 + 16 + 6 + 4

let measure: CanvasRenderingContext2D | null | undefined

/**
 * How wide a board's title is at screen size, in screen pixels: its name in the title's font, a medium 14px, and
 * `titleChrome`.
 */
function titleWidth(name: string): number {
  measure ??= document.createElement("canvas").getContext("2d")

  if (!measure) {
    return 0
  }

  measure.font = `500 14px ${getComputedStyle(document.body).fontFamily}`

  return measure.measureText(name).width + titleChrome
}

/**
 * Lays the stories out again each time one's board changes size, as it does once its story draws, so they sit as far
 * apart as their boards rather than as their first guess. The positions aren't saved, as nothing of a story is.
 */
export function followStoryLayout(editor: Editor, store: DesignStore): () => void {
  let frame: number | undefined

  const sizeOf = (entry: ContainerEntry) => {
    const board = editor.getShape(createCanvasId(encodeURIComponent(entry.key)))

    return board?.type === "canvas-container" && board.props.w > 0
      ? { width: board.props.w, height: board.props.h }
      : undefined
  }

  const layOut = () => {
    frame = undefined
    const entries = store.getEntries()
    const placed = storyPositions(entries, sizeOf, (entry) => titleWidth(entry.container.name))

    const moved = entries.filter((entry) => {
      const to = placed.get(entry.key)

      return (
        to && (Math.abs(to.x - entry.container.position.x) >= 1 || Math.abs(to.y - entry.container.position.y) >= 1)
      )
    })

    if (moved.length > 0) {
      store.updateContainers(
        moved.map((entry) => entry.key),
        "Lay out stories",
        (containers) => containers.map((container, at) => moveDesign(container, placed.get(moved[at]!.key)!)),
        { history: false, persist: false }
      )
    }
  }

  const stop = editor.sideEffects.registerAfterChangeHandler("shape", (previous, next) => {
    if (
      previous.type === "canvas-container" &&
      next.type === "canvas-container" &&
      next.props.key.startsWith(`${storyScreensFile}#`) &&
      (previous.props.w !== next.props.w || previous.props.h !== next.props.h)
    ) {
      frame ??= requestAnimationFrame(layOut)
    }
  })

  frame = requestAnimationFrame(layOut)

  return () => {
    stop()

    if (frame !== undefined) {
      cancelAnimationFrame(frame)
    }
  }
}
