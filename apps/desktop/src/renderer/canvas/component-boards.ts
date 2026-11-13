import { addDesigns, type CanvasDocument, type ComponentInfo, type PropValues } from "@parity-app/core"
import { type BoardLayout, boardsHeight, componentBoards } from "@parity-app/editor"
import type { ProjectInfo } from "@parity-app/project"

/**
 * Where the boards of the project's own components are kept among its designs: a design file of their own that's never
 * saved, since they're drawn from the project's code each time it opens.
 */
export const componentBoardsFile = "(components)"

type BoardsInfo = Pick<ProjectInfo, "id" | "sources" | "documents"> & Partial<Pick<ProjectInfo, "entities">>

/** Each open project's component boards: the component and file of each, by design id. */
const boardPlaces = new Map<string, ReadonlyMap<string, { component: string; file: string }>>()

/** A row of boards for each group of components, the rows above the project's own designs. */
function boardLayout(info: BoardsInfo): BoardLayout {
  const ys = info.documents.flatMap((entry) => entry.document.containers.map((container) => container.position.y))
  const spacing = { x: 0, column: 400, row: 260 }

  return { ...spacing, y: Math.min(0, ...ys) - 400 - boardsHeight(info.sources, { ...spacing, y: 0 }) }
}

/** Where the boards' top is, which the app's pages go above. */
export function componentBoardsTop(info: BoardsInfo): number {
  return boardLayout(info).y
}

/**
 * The project's own components as a design file, each on a board of its own, or none without any. `components` says
 * what each takes, which comes after the project opens, so they first draw without samples. `parents` holds the
 * parents each part has been found to need (`searchBoardParents`).
 */
export function componentBoardsDocument(
  info: BoardsInfo,
  components: Readonly<Record<string, ComponentInfo>> = {},
  parents: Readonly<Record<string, readonly string[]>> = {}
): { path: string; document: CanvasDocument }[] {
  const boards = componentBoards(info.sources, components, boardLayout(info), parents, screenSamples(info))

  boardPlaces.set(info.id, new Map(boards.map(({ board, component, file }) => [board.id, { component, file }])))

  return boards.length === 0
    ? []
    : [
        {
          path: componentBoardsFile,
          document: addDesigns(
            undefined,
            boards.map(({ board }) => board)
          )
        }
      ]
}

/**
 * Props for the components the project's tools draw on their screens, as a story's args: the first screen's for each
 * component it draws at its top, so a component's board draws as its first story does rather than without what it
 * needs, as a plan card without its features.
 */
function screenSamples(info: BoardsInfo) {
  const samples: Record<string, PropValues> = {}

  for (const { screen } of info.entities?.screens ?? []) {
    const drawn = screen.root.type === "layout" ? screen.root.children : []

    for (const node of drawn) {
      if (node.type === "component" && node.props && !(node.component in samples)) {
        samples[node.component] = node.props
      }
    }
  }

  return samples
}

/** The component a board draws, or undefined for a design. */
export function boardComponent(project: string, design: string): string | undefined {
  return boardPlaces.get(project)?.get(design)?.component
}

/** The file a board's component is defined in, or undefined for a design. */
export function boardFile(project: string, design: string): string | undefined {
  return boardPlaces.get(project)?.get(design)?.file
}

/** A component's board's key among the project's designs, or undefined when it has none. */
export function boardKeyOf(project: string, component: string): string | undefined {
  for (const [id, place] of boardPlaces.get(project) ?? []) {
    if (place.component === component) {
      return `${componentBoardsFile}#${id}`
    }
  }

  return undefined
}
