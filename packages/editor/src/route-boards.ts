import {
  type ContainerSpec,
  type FrameSize,
  type ModeSettings,
  type ProjectRoute,
  screenHeightForWidth
} from "@parity-app/core"

/** A page of the app on the canvas (PAR-1076): a route its router can draw on its own, at a URL it answers. */
export interface RouteBoard {
  route: ProjectRoute
  /** The URL the app draws it at, from the app's own origin, with a sample for each param. */
  url: string
  x: number
  y: number
  width: number
  height: number
}

/** The pages drawn inside one layout route, as a row: the root's own pages, or a layout's such as `/settings`. */
export interface RouteRow {
  /** The layout route's id. */
  layout: string
  /** What the row is called: `/` for the root, else the layout's id. */
  label: string
  x: number
  y: number
  boards: RouteBoard[]
}

/** Where the rows go and how big each page is. */
export interface RouteLayout {
  /** The app's origin, as `http://127.0.0.1:5173`. */
  origin: string
  /** The top left of the first row. */
  x: number
  y: number
  width: number
  height: number
  /** Between pages in a row, and between rows. */
  gap: number
  rowGap: number
}

/**
 * The app's pages as boards, one row for each layout route they're drawn in, in the order the router lists them. A page
 * is a route no other route draws inside: a layout such as `/settings` draws its index at its own URL, so it isn't a
 * page of its own. Within a row, an index comes first, then pages by path.
 */
export function routeRows(routes: readonly ProjectRoute[], layout: RouteLayout): RouteRow[] {
  const parents = new Set(routes.flatMap((route) => (route.parent ? [route.parent] : [])))
  const pages = routes.filter((route) => !parents.has(route.id) && route.parent !== undefined)
  const grouped = Map.groupBy(pages, (route) => route.parent ?? "")
  const rows: RouteRow[] = []

  for (const route of routes) {
    const inside = grouped.get(route.id)

    if (!inside) {
      continue
    }

    const y = layout.y + rows.length * (layout.height + layout.rowGap)

    const boards = inside.toSorted(byIndexThenPath).map((page, column) => ({
      route: page,
      url: new URL(samplePath(page), layout.origin).href,
      x: layout.x + column * (layout.width + layout.gap),
      y,
      width: layout.width,
      height: layout.height
    }))

    rows.push({ layout: route.id, label: rowLabel(route), x: layout.x, y, boards })
  }

  return rows
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

/** The root by its path, `/`; a layout by its id, which names a pathless one too, as `/_auth`. */
function rowLabel(route: ProjectRoute): string {
  return route.parent === undefined ? route.path : route.id
}

function byIndexThenPath(a: ProjectRoute, b: ProjectRoute): number {
  return Number(b.index) - Number(a.index) || a.path.localeCompare(b.path)
}

/** A page as a screen on the canvas (PAR-1076), and the URL its frames draw. */
export interface RouteScreen {
  screen: ContainerSpec
  url: string
}

/** The id of the screen a route is drawn in, which says it's a page rather than a design. */
export function routeScreenId(route: Pick<ProjectRoute, "id">): string {
  return `route:${route.id}`
}

/**
 * The app's pages as screens (PAR-1076), laid out as `routeRows` does, with the rows' bottom at `bottom`. Each is
 * locked, since it's drawn from code rather than designed, and named for the component it draws, else its path. Its
 * layers are an empty page: what its frames show is the app itself at `url`, as tall as each viewport's screen.
 */
export function routeScreens(
  routes: readonly ProjectRoute[],
  modes: ModeSettings,
  layout: Omit<RouteLayout, "y"> & { bottom: number }
): RouteScreen[] {
  const rows = routeRows(routes, { ...layout, y: 0 })
  const top = layout.bottom - rows.length * (layout.height + layout.rowGap)
  const frames = pageFrames(modes)

  return rows.flatMap((row) =>
    row.boards.map((board) => ({
      url: board.url,
      screen: {
        id: routeScreenId(board.route),
        name: board.route.component ?? board.route.path,
        kind: "screen",
        locked: true,
        position: { x: board.x, y: board.y + top },
        frames,
        root: { type: "layout", id: `${routeScreenId(board.route)}:page`, name: "Page", children: [] }
      }
    }))
  )
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
