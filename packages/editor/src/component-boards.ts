import {
  type ComponentInfo,
  type ComponentSource,
  type ContainerSpec,
  componentNode,
  componentRole,
  groupComponents
} from "@parity-app/core"
import { hiddenReason } from "./insert-search.ts"
import { componentLabel } from "./insert.ts"
import { landedStyle } from "./new-screen.ts"

/** A board of one of the project's own components (step 8 of the read-only viewer), and what it draws. */
export interface ComponentBoard {
  board: ContainerSpec
  /** The component's key among the project's sources. */
  component: string
  /** The file it's defined in, which its title shows under its name. */
  file: string
}

/** Boards are at least this many spacing steps wide (320px at 4px a step), so their titles have room for a name and a file. */
const boardSteps = 80

/** Where the boards go and how far apart. */
export interface BoardLayout {
  /** The top left of the first row. */
  x: number
  y: number
  /** From one board's left to the next's, and from one row's top to the next's. */
  column: number
  row: number
}

/**
 * The project's own components, not its libraries' or its pages, which its routes draw: each that draws something and
 * isn't a part the Components panel hides, in its groups there, the UI kit's by file and the rest by folder.
 */
export function boardGroups(sources: Readonly<Record<string, ComponentSource>>): { name: string; ids: string[] }[] {
  const shown = Object.entries(sources).filter(
    ([key, source]) =>
      source.visual !== false &&
      hiddenReason(key, { internal: source.internal }) === undefined &&
      componentRole(source) !== undefined &&
      componentRole(source) !== "page"
  )

  const kit = shown.filter(([, source]) => componentRole(source) === "kit")
  const app = shown.filter(([, source]) => componentRole(source) === "app")

  return [...groupComponents(kit, "file"), ...groupComponents(app, "folder")]
}

/** The id of a component's board, which says it's a component's rather than a design. */
export function componentBoardId(component: string): string {
  return `component:${component}`
}

/**
 * A board for each of the project's own components (see `boardGroups`), a row for each group, with its top left at the
 * layout's. Each holds the component as inserting it would place it, with a sample for each required prop and its name
 * as the children it takes, once `components` says what it takes. It hugs the component, at least `boardSteps` wide.
 */
export function componentBoards(
  sources: Readonly<Record<string, ComponentSource>>,
  components: Readonly<Record<string, ComponentInfo>>,
  layout: BoardLayout
): ComponentBoard[] {
  return boardGroups(sources).flatMap((group, row) =>
    group.ids.map((component, column) => {
      const id = componentBoardId(component)
      const node = componentNode(component, components[component], new Set(["root"]))

      return {
        component,
        file: sources[component]?.path ?? "",
        board: {
          id,
          name: componentLabel(component),
          kind: "frame",
          position: { x: layout.x + column * layout.column, y: layout.y + row * layout.row },
          root: {
            type: "layout",
            id: "root",
            style: { ...landedStyle, minWidth: { step: boardSteps } },
            children: [node]
          }
        }
      }
    })
  )
}

/** How tall the boards' rows are together. */
export function boardsHeight(sources: Readonly<Record<string, ComponentSource>>, layout: BoardLayout): number {
  return boardGroups(sources).length * layout.row
}
