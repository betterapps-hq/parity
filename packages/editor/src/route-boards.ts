import {
  type ContainerSpec,
  type FrameSize,
  type ModeSettings,
  type ProjectRoute,
  screenHeightForWidth
} from "@parity-app/core"

/**
 * A page of the app in its tree (PAR-1076): a route its router draws on its own, with the pages under it. A layout's
 * index stands for the layout, so the layout's other pages hang from it: `/` holds `/pricing` and `/settings`, and
 * `/settings` holds `/settings/billing`. A layout without an index adds no page, and its pages hang from the page above.
 */
export interface PageNode {
  route: ProjectRoute
  children: PageNode[]
}

/** A page placed in the tree, with the URL the app draws it at and the route of the page it hangs from. */
export interface PlacedPage {
  route: ProjectRoute
  url: string
  x: number
  y: number
  parent?: string
}

/** Where the tree goes and how big each page is. */
export interface PageLayout {
  /** The app's origin, as `http://127.0.0.1:5173`. */
  origin: string
  /** The top left of the tree. */
  x: number
  y: number
  width: number
  height: number
  /** Between pages side by side, and between a page and the pages under it. */
  gap: number
  levelGap: number
}

/** The app's pages as a tree, or several when the root has no index; empty without routes. */
export function pageTree(routes: readonly ProjectRoute[]): PageNode[] {
  const children = Map.groupBy(
    routes.filter((route) => route.parent !== undefined),
    (route) => route.parent ?? ""
  )

  // A route with routes inside it is drawn by its index, holding its other pages; one without is a page of its own.
  const standIn = (route: ProjectRoute): PageNode[] => {
    const inside = children.get(route.id)

    if (!inside) {
      return [{ route, children: [] }]
    }

    // Its own index is drawn at its own URL; an index of a deeper path, as `/projects/` under the root, is a page.
    const index = inside.find((child) => child.index && child.path === route.path)

    const pages = inside
      .filter((child) => child !== index)
      .toSorted((a, b) => a.path.localeCompare(b.path))
      .flatMap(standIn)

    return index ? [{ route: index, children: pages }] : pages
  }

  const root = routes.find((route) => route.parent === undefined)

  return root ? standIn(root).filter((node) => node.route !== root) : []
}

/**
 * The tree laid out top down: each page centered over the pages under it, which sit side by side a level below, and
 * the trees of a forest side by side.
 */
export function placePages(tree: readonly PageNode[], layout: PageLayout): PlacedPage[] {
  const placed: PlacedPage[] = []

  const row = (nodes: readonly PageNode[]): number =>
    nodes.reduce((total, node, index) => total + span(node) + (index > 0 ? layout.gap : 0), 0)

  const span = (node: PageNode): number => Math.max(layout.width, row(node.children))

  const place = (node: PageNode, left: number, depth: number, parent?: string) => {
    const width = span(node)

    const page: PlacedPage = {
      route: node.route,
      url: new URL(samplePath(node.route), layout.origin).href,
      x: left + (width - layout.width) / 2,
      y: layout.y + depth * (layout.height + layout.levelGap)
    }

    if (parent !== undefined) {
      page.parent = parent
    }

    placed.push(page)
    let next = left + (width - row(node.children)) / 2

    for (const child of node.children) {
      place(child, next, depth + 1, node.route.id)
      next += span(child) + layout.gap
    }
  }

  let left = layout.x

  for (const node of tree) {
    place(node, left, 0)
    left += span(node) + layout.gap
  }

  return placed
}

/** How many levels a tree has. */
export function treeDepth(tree: readonly PageNode[]): number {
  return Math.max(0, ...tree.map((node) => 1 + treeDepth(node.children)))
}

/** A route's URL with a sample for each param: its name for now, and nothing for a splat. */
export function samplePath(route: Pick<ProjectRoute, "path">): string {
  return route.path.split("/").map(sampleSegment).join("/")
}

/** A param's name for its value, nothing for a splat, and any other segment as it is. */
function sampleSegment(segment: string): string {
  if (segment === "$") {
    return ""
  }

  return segment.startsWith("$") ? segment.slice(1) : segment
}

/** A page as a screen on the canvas (PAR-1076), the URL its frames draw, and the screen it hangs from. */
export interface RouteScreen {
  screen: ContainerSpec
  url: string
  parent?: string
}

/** The id of the screen a route is drawn in, which says it's a page rather than a design. */
export function routeScreenId(route: Pick<ProjectRoute, "id">): string {
  return `route:${route.id}`
}

/**
 * The app's pages as screens (PAR-1076), laid out as a tree (see `pageTree`) whose bottom is at `bottom`, each named
 * for the component it draws, else its path. Its layers are an empty page: what its frames show is the app itself at
 * `url`, as tall as each viewport's screen.
 */
export function routeScreens(
  routes: readonly ProjectRoute[],
  modes: ModeSettings,
  layout: Omit<PageLayout, "y"> & { bottom: number }
): RouteScreen[] {
  const tree = pageTree(routes)
  const tall = treeDepth(tree) * (layout.height + layout.levelGap)
  const frames = pageFrames(modes)

  return placePages(tree, { ...layout, y: layout.bottom - tall }).map((page) => {
    const id = routeScreenId(page.route)

    const placed: RouteScreen = {
      url: page.url,
      screen: {
        id,
        name: page.route.component ?? page.route.path,
        kind: "screen",
        position: { x: Math.round(page.x), y: Math.round(page.y) },
        frames,
        root: { type: "layout", id: `${id}:page`, name: "Page", children: [] }
      }
    }

    if (page.parent !== undefined) {
      placed.parent = routeScreenId({ id: page.parent })
    }

    return placed
  })
}

/** Each viewport's frame as tall as its screen, so a page's frame is a window onto it rather than its whole length. */
function pageFrames(modes: ModeSettings): Record<string, FrameSize> {
  const viewport = modes.variables.find((variable) => variable.kind === "viewport")

  return Object.fromEntries(
    (viewport?.options ?? []).flatMap((option) =>
      option.width === undefined ? [] : [[option.id, { height: option.height ?? screenHeightForWidth(option.width) }]]
    )
  )
}
