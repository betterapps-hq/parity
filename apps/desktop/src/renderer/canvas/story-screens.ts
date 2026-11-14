import { addDesigns, type CanvasDocument, type ImportedScreen } from "@parity-app/core"
import type { ProjectInfo } from "@parity-app/project"
import { componentBoardsTop } from "./component-boards.ts"

/**
 * Where the screens the project's tools describe are kept among its designs, as its Storybook stories: a design file of
 * their own that's never saved, since they're read from the tool's files each time the project opens.
 */
export const storyScreensFile = "(stories)"

/** The layer of a story's screen that draws the story, as `storybook-adapter` names it. */
export const storyLayer = "story"

/**
 * How the imported screens are laid out: a row for each group, left of the boards and pages, on a grid as component
 * boards are, since a story's board hugs the story and is only as wide as it.
 */
const layout = { column: 440, row: 440, beside: 800 }

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
  const left = -layout.beside - columns * layout.column
  const top = componentBoardsTop(info)

  const screens = groups.flatMap((row, at) =>
    row.map((each, column) => ({
      ...each.screen,
      name: `${groupLeaf(each)} / ${each.screen.name}`,
      position: { x: left + column * layout.column, y: top + at * layout.row }
    }))
  )

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
