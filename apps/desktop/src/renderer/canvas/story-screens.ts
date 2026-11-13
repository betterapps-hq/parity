import { addDesigns, type CanvasDocument, type ImportedScreen } from "@parity-app/core"
import type { ProjectInfo } from "@parity-app/project"
import { componentBoardsTop } from "./component-boards.ts"

/**
 * Where the screens the project's tools describe are kept among its designs, as its Storybook stories: a design file of
 * their own that's never saved, since they're read from the tool's files each time the project opens.
 */
export const storyScreensFile = "(stories)"

/** How the imported screens are laid out: a row for each group, left of the boards and pages. */
const layout = { width: 1280, height: 800, gap: 160, rowGap: 1100, beside: 800 }

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

  const groups = Map.groupBy(imported, (screen) => screen.group)
  const columns = Math.max(...[...groups.values()].map((screens) => screens.length))
  const left = -layout.beside - columns * (layout.width + layout.gap)
  const top = componentBoardsTop(info)

  const screens = [...groups.values()].flatMap((row, at) =>
    row.map((each, column) => ({
      ...each.screen,
      name: `${groupLeaf(each)} / ${each.screen.name}`,
      position: { x: left + column * (layout.width + layout.gap), y: top + at * layout.rowGap }
    }))
  )

  return [{ path: storyScreensFile, document: addDesigns(undefined, screens) }]
}

/** A group's last part, as `Button` for `UI/Button`. */
function groupLeaf(screen: ImportedScreen): string {
  return screen.group.split("/").at(-1)?.trim() ?? screen.group
}
