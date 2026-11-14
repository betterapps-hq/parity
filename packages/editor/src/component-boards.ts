import {
  type ComponentInfo,
  type ComponentSource,
  type ContainerSpec,
  type DesignNode,
  type NodeStyle,
  type PropValues,
  componentNode,
  componentRole,
  groupComponents
} from "@parity-app/core"
import { hiddenReason } from "./insert-search.ts"
import { componentLabel } from "./insert.ts"

/** A board of one of the project's own components (step 8 of the read-only viewer), and what it draws. */
export interface ComponentBoard {
  board: ContainerSpec
  /** The component's key among the project's sources. */
  component: string
  /** The file it's defined in, which its title shows under its name. */
  file: string
}

/** A board's own style: hugging the component, 2px around it, with no fill of its own. */
const boardStyle = {
  width: { size: "hug" },
  padding: { step: 0.5 },
  color: { token: "foreground" }
} as const satisfies NodeStyle

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
 * The project's own components, from its own files: not its libraries' or its dependencies', which stay in the
 * Components panel, and not its pages, which its routes draw. Each that draws something and isn't a part the Components
 * panel hides, in its groups there, the UI kit's by file and the rest by folder.
 */
export function boardGroups(sources: Readonly<Record<string, ComponentSource>>): { name: string; ids: string[] }[] {
  const shown = Object.entries(sources).filter(
    ([key, source]) =>
      source.visual !== false &&
      !source.library &&
      !/(?:^|\/)node_modules\//.test(source.path) &&
      hiddenReason(key, { internal: source.internal }) === undefined &&
      componentRole(source) !== undefined &&
      componentRole(source) !== "page"
  )

  const kit = shown.filter(([, source]) => componentRole(source) === "kit")
  const app = shown.filter(([, source]) => componentRole(source) === "app")

  return [...groupComponents(kit, "file"), ...groupComponents(app, "folder")]
}

const boardIdPrefix = "component:"

/** The id of a component's board, which says it's a component's rather than a design. */
export function componentBoardId(component: string): string {
  return `${boardIdPrefix}${component}`
}

/**
 * A board for each of the project's own components (see `boardGroups`), a row for each group, with its top left at the
 * layout's. Each holds the component as inserting it would place it, with the props `samples` gives it, as a story's
 * args, then a sample for each other required prop and its name as the children it takes, once `components` says what
 * it takes, inside the `parents` it needs, outermost first, when it's found it needs some (`nextBoardParents`). The
 * board hugs what it draws, 2px around it, and is clear.
 */
export function componentBoards(
  sources: Readonly<Record<string, ComponentSource>>,
  components: Readonly<Record<string, ComponentInfo>>,
  layout: BoardLayout,
  parents: Readonly<Record<string, readonly string[]>> = {},
  samples: Readonly<Record<string, PropValues>> = {}
): ComponentBoard[] {
  return boardGroups(sources).flatMap((group, row) =>
    group.ids.map((component, column) => {
      const id = componentBoardId(component)
      const chain = parents[component] ?? []
      const nodeId = (role: string) => boardNodeId(role, chain)

      // Each parent holds the one inside it as its only child, in place of the sample text it'd hold alone.
      const node = chain.reduceRight<DesignNode>(
        (inner, parent, index) => {
          const outer = { ...componentNode(parent, components[parent], new Set()), id: nodeId(`around-${index}`) }

          return outer.type === "component" ? { ...outer, slots: { children: [inner] } } : inner
        },
        { ...componentNode(component, components[component], new Set(), samples[component]), id: nodeId("part") }
      )

      return {
        component,
        file: sources[component]?.path ?? "",
        board: {
          id,
          name: componentLabel(component),
          kind: "frame",
          position: { x: layout.x + column * layout.column, y: layout.y + row * layout.row },
          // The component alone, 2px in from the board's edges so nothing it draws at its edges is cut off, on nothing
          // but the canvas.
          root: { type: "layout", id: "root", style: boardStyle, children: [node] }
        }
      }
    })
  )
}

/**
 * The id of a layer on a board: the same each time the board's drawn inside the same parents, so drawing it again
 * changes nothing and its frame keeps what it drew, and different inside other parents, so what the canvas said about
 * the layers it had before isn't taken for news about these.
 */
function boardNodeId(role: string, chain: readonly string[]): string {
  return chain.length === 0 ? role : `${role}-in-${chain.join("-")}`
}

/**
 * The boards drawn again (`componentBoards`) as they're to go on the canvas: each drawn as it was last time (`before`)
 * stays as it is now (`current`), with what's been read inside it and the size it's been fitted to, so it draws nothing
 * again. One drawn differently keeps the size it had, so it doesn't jump while it's fitted again.
 */
export function redrawnBoards(
  drawn: readonly ContainerSpec[],
  before: ReadonlyMap<string, ContainerSpec>,
  current: ReadonlyMap<string, ContainerSpec>
): ContainerSpec[] {
  return drawn.map((board) => {
    const now = current.get(board.id)
    const last = before.get(board.id)

    if (!now) {
      return board
    }

    if (last && JSON.stringify(last) === JSON.stringify(board)) {
      return now
    }

    return now.size ? { ...board, size: now.size } : board
  })
}

/** How tall the boards' rows are together. */
export function boardsHeight(sources: Readonly<Record<string, ComponentSource>>, layout: BoardLayout): number {
  return boardGroups(sources).length * layout.row
}

/**
 * A board with what its component draws inside as its component's layers (see `elementLayers`), or the board as it is
 * when they're the same, so reading them again changes nothing.
 */
export function boardWithInternals(board: ContainerSpec, internals: DesignNode[]): ContainerSpec {
  const root = board.root
  const component = boardComponentNode(board)
  const [outer, ...rest] = root.type === "layout" ? root.children : []

  if (
    root.type !== "layout" ||
    !outer ||
    !component ||
    JSON.stringify(component.internals ?? []) === JSON.stringify(internals)
  ) {
    return board
  }

  return {
    ...board,
    root: { ...root, children: [withPart(outer, component.id, { ...component, internals }), ...rest] }
  }
}

/** A node with the layer `id` in its chain of only children replaced by `part`. */
function withPart(node: DesignNode, id: string, part: ComponentLayer): DesignNode {
  if (node.id === id) {
    return part
  }

  const [inner] = node.type === "component" ? (node.slots?.children ?? []) : []

  return node.type === "component" && inner ? { ...node, slots: { children: [withPart(inner, id, part)] } } : node
}

type ComponentLayer = Extract<DesignNode, { type: "component" }>

/**
 * The component a board draws, inside its padding and any parents it needs: the layer whose elements are read, and
 * whose layers Layers shows under the board, since the board is the component.
 */
export function boardComponentNode(board: ContainerSpec): ComponentLayer | undefined {
  const component = board.id.startsWith(boardIdPrefix) ? board.id.slice(boardIdPrefix.length) : undefined
  let node: DesignNode | undefined = board.root.type === "layout" ? board.root.children[0] : undefined

  while (node?.type === "component" && node.component !== component) {
    node = node.slots?.children?.[0]
  }

  return node?.type === "component" ? node : undefined
}

/** The component layer on a board, whose id finds what it draws. */
export function boardComponentLayer(board: ContainerSpec): string | undefined {
  return boardComponentNode(board)?.id
}
