import {
  type ContainerSpec,
  type DesignNode,
  type ModeSettings,
  type ProjectRoute,
  type ResolvedMode
} from "@parity-app/core"
import { z } from "zod"
import { type BoardBox, labelLook, titleTop } from "./canvas-labels.ts"

/**
 * A page of the app in its tree (PAR-1076): a route its router draws on its own, with the pages under it. A layout's
 * index that draws stands for the layout, so the layout's other pages hang from it: `/` holds `/pricing` and
 * `/settings`. A layout with no page of its own, because it has no index or its index only redirects, as `/settings`'s
 * does to `/settings/profile`, is a group around its pages instead (see `PageGroup`).
 */
export interface PageNode {
  route: ProjectRoute
  children: PageNode[]
  /** Set when the node is a layout's group rather than a page: the route is the layout's own. */
  group?: PageGroup
}

/** A layout with no page of its own, drawn as a group around the pages it wraps. */
export interface PageGroup {
  /** Where its index sends the browser, when its index only redirects: `/settings/profile`. */
  redirect?: string
}

/**
 * A page or a group placed in the tree, with the URL a page is drawn at and the route of what it hangs from. A group's
 * `x` is its left, its pages sitting inside it, `groupInset` from its sides; its `y` is its pages'.
 */
export interface PlacedPage {
  route: ProjectRoute
  url: string
  x: number
  y: number
  parent?: string
  group?: PageGroup & { width: number }
}

/** How far a group's pages sit inside its sides, on the canvas. */
export const groupInset = 48

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

/** The app's pages as a tree, or several when the root has no page of its own; empty without routes. */
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

    // An index that draws nothing and only redirects isn't a page.
    if (index && !(index.component === undefined && index.redirect !== undefined)) {
      return [{ route: index, children: pages }]
    }

    // The root's pages are the tree's tops; any other layout without a page is a group around its pages.
    if (route.parent === undefined) {
      return pages
    }

    const group: PageGroup = {}

    if (index?.redirect !== undefined) {
      group.redirect = index.redirect
    }

    return [{ route, children: pages, group }]
  }

  const root = routes.find((route) => route.parent === undefined)

  return root ? standIn(root).filter((node) => node.route !== root) : []
}

/**
 * The tree laid out top down: each page centered over the pages under it, which sit side by side a level below, and
 * the trees of a forest side by side. A group's pages sit side by side inside it, on the group's own level.
 */
export function placePages(tree: readonly PageNode[], layout: PageLayout): PlacedPage[] {
  const placed: PlacedPage[] = []

  const row = (nodes: readonly PageNode[]): number =>
    nodes.reduce((total, node, index) => total + span(node) + (index > 0 ? layout.gap : 0), 0)

  const span = (node: PageNode): number =>
    node.group ? row(node.children) + groupInset * 2 : Math.max(layout.width, row(node.children))

  const place = (node: PageNode, left: number, depth: number, parent?: string) => {
    const width = span(node)

    if (node.group) {
      const group: PlacedPage = {
        route: node.route,
        url: new URL(samplePath(node.route), layout.origin).href,
        x: left,
        y: layout.y + depth * (layout.height + layout.levelGap),
        group: { ...node.group, width }
      }

      if (parent !== undefined) {
        group.parent = parent
      }

      placed.push(group)
      let inside = left + groupInset

      for (const child of node.children) {
        place(child, inside, depth, node.route.id)
        inside += span(child) + layout.gap
      }

      return
    }

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

/** How many levels a tree has. A group's pages are on its own level. */
export function treeDepth(tree: readonly PageNode[]): number {
  return Math.max(0, ...tree.map((node) => (node.group ? 0 : 1) + treeDepth(node.children)))
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

/**
 * A page as a screen on the canvas (PAR-1076), the URL its frames draw, its path, and the screen or group it hangs
 * from, by id.
 */
export interface RouteScreen {
  screen: ContainerSpec
  url: string
  path: string
  /** The id of the route it draws. */
  route: string
  parent?: string
}

/**
 * A layout with no page of its own on the canvas (PAR-1076): a group around the screens of its pages, named as a page
 * would be, with the screen or group it hangs from, and the page its index redirects to.
 */
export interface RouteGroup {
  id: string
  name: string
  path: string
  /** The id of the layout's route. */
  route: string
  /** Where it was laid out: its left, its pages' top, and its width. */
  x: number
  y: number
  width: number
  parent?: string
  /** The screen of the page its index sends the browser to, by id, and that page's path. */
  redirect?: { screen: string; path: string }
}

/**
 * What a page is called: its component in words, as `ProjectDetail` is "Project detail", else its path's last part,
 * as `/settings` is "Settings", else Home.
 */
export function pageName(route: Pick<ProjectRoute, "component" | "path">): string {
  const words = route.component ?? route.path.split("/").findLast((part) => part !== "" && !part.startsWith("$"))

  if (!words) {
    return "Home"
  }

  const spaced = words
    .replaceAll(/[-_]+/g, " ")
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()

  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * A page's layers (PAR-1076): a layer for each route that draws it, from the root's in, each inside the one before as
 * it draws at that route's outlet, as the children passed to it. Each shows as the component its route draws, named for
 * it, else as the route, named for its path.
 */
export function routeLayers(routes: readonly ProjectRoute[], page: ProjectRoute): DesignNode {
  const byId = new Map(routes.map((route) => [route.id, route]))

  const layer = (route: ProjectRoute, children: DesignNode[]): DesignNode => {
    const drawn: DesignNode = {
      type: "route",
      // A layer's id has no slash, which a layer's path inside an instance uses.
      id: `route:${encodeURIComponent(route.id)}`,
      name: route.component ?? route.path,
      route: route.id,
      children
    }

    if (route.component !== undefined) {
      drawn.component = route.component
    }

    return drawn
  }

  let layers = layer(page, [])

  for (let route = byId.get(page.parent ?? ""); route; route = byId.get(route.parent ?? "")) {
    layers = layer(route, [layers])
  }

  return layers
}

/** The id of the screen a route is drawn in, which says it's a page rather than a design. */
export function routeScreenId(route: Pick<ProjectRoute, "id">): string {
  return `route:${route.id}`
}

/**
 * The app's pages as screens (PAR-1076), laid out as a tree (see `pageTree`) whose bottom is at `bottom`, each named
 * as `pageName` says. Its layers are the routes that draw it (see `routeLayers`); its frames show the app itself at
 * `url`, each as wide as its viewport, with no height of its own, so it's as tall as the page (see `pageHeightMessage`).
 * `_modes` sized the frames once and goes unused.
 */
export function routeScreens(
  routes: readonly ProjectRoute[],
  _modes: ModeSettings,
  layout: Omit<PageLayout, "y"> & { bottom: number }
): RouteScreen[] {
  return routeTree(routes, layout).screens
}

/** The app's pages as screens, and its layouts without pages as groups around them. */
export interface RouteTree {
  screens: RouteScreen[]
  groups: RouteGroup[]
}

/**
 * The app's pages as screens, and its layouts without pages as groups around them (PAR-1076), laid out as
 * `routeScreens` says.
 */
export function routeTree(
  routes: readonly ProjectRoute[],
  layout: Omit<PageLayout, "y"> & { bottom: number }
): RouteTree {
  const tree = pageTree(routes)
  const tall = treeDepth(tree) * (layout.height + layout.levelGap)
  const placed = placePages(tree, { ...layout, y: layout.bottom - tall })
  const groups: RouteGroup[] = []
  const byId = new Map(routes.map((route) => [route.id, route]))
  const parentPath = (page: PlacedPage) => byId.get(page.route.parent ?? "")?.path

  const screens = placed.flatMap((page) => {
    const id = routeScreenId(page.route)

    if (page.group) {
      // Named for its path, as its pages are what it holds; one without a path of its own, for its component.
      const ownPath = page.route.path.split("/").findLast((part) => part !== "" && !part.startsWith("$"))

      const named =
        ownPath !== undefined && page.route.path !== parentPath(page) ? { path: page.route.path } : page.route

      const group: RouteGroup = {
        id,
        name: pageName(named),
        path: page.route.path,
        route: page.route.id,
        x: Math.round(page.x),
        y: Math.round(page.y),
        width: Math.round(page.group.width)
      }

      if (page.parent !== undefined) {
        group.parent = routeScreenId({ id: page.parent })
      }

      const target = placed.find((other) => !other.group && other.route.path === page.group?.redirect)

      if (target) {
        group.redirect = { screen: routeScreenId(target.route), path: target.route.path }
      }

      groups.push(group)

      return []
    }

    const drawn: RouteScreen = {
      url: page.url,
      path: page.route.path,
      route: page.route.id,
      screen: {
        id,
        name: pageName(page.route),
        kind: "screen",
        position: { x: Math.round(page.x), y: Math.round(page.y) },
        root: routeLayers(routes, page.route)
      }
    }

    if (page.parent !== undefined) {
      drawn.parent = routeScreenId({ id: page.parent })
    }

    return [drawn]
  })

  return { screens, groups }
}

/** How tall a group's header is on screen, with the room below it before its pages' titles. */
const groupHeader = 56

/**
 * Where a layout's group is on the canvas at a zoom (PAR-1076): round what's inside it, the boards of its pages with
 * their titles above them, and the boxes of groups inside it, which have their names inside, `groupInset` from its
 * sides and bottom, with its header above, `groupHeader` tall on screen at the size `labelLook` draws a name. Nothing
 * inside it, no box.
 */
export function pageGroupBox(
  inside: readonly { box: BoardBox; titled: boolean }[],
  zoom: number
): BoardBox | undefined {
  if (inside.length === 0) {
    return undefined
  }

  const top = Math.min(...inside.map(({ box, titled }) => (titled ? titleTop(box, zoom) : box.y)))
  const left = Math.min(...inside.map(({ box }) => box.x))
  const right = Math.max(...inside.map(({ box }) => box.x + box.w))
  const bottom = Math.max(...inside.map(({ box }) => box.y + box.h))
  const y = top - (groupHeader * labelLook("name", zoom).scale) / zoom

  return { x: left - groupInset, y, w: right - left + groupInset * 2, h: bottom + groupInset - y }
}

/** The screen pixels above a page's title where a line in the page tree stops curving and drops straight down. */
const linkClearance = 8

/**
 * The SVG path of the line from a page's board down to the board of a page under it, at a zoom (PAR-1076). It runs from the middle of
 * the upper board's bottom edge to the middle of the lower board's top edge, curving across above the lower board's
 * title, `linkClearance` on screen short of it, and dropping straight down from there, behind the title, to the board.
 * Pages side by side share a level, so their titles' tops line up and a line only passes behind the title of the page
 * it leads to. A title takes more of the canvas the further out it's zoomed (see `titleTop`); once it reaches up to the
 * board above, the line curves all the way down. A layout's group has its name inside it, so a line to it, `untitled`,
 * curves all the way down to its top edge.
 */
export function pageLinkLine(above: BoardBox, below: BoardBox, zoom: number, untitled = false): string {
  const [x1, y1] = [above.x + above.w / 2, above.y + above.h]
  const x2 = below.x + below.w / 2
  const turn = untitled ? below.y : titleTop(below, zoom) - linkClearance / zoom
  const [curveEnd, drop] = turn > y1 && !untitled ? [turn, ` L ${x2} ${below.y}`] : [below.y, ""]
  const bend = (curveEnd - y1) / 2

  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${curveEnd - bend}, ${x2} ${curveEnd}${drop}`
}

/**
 * The lines of the app's page tree that a page brings forward when it's selected or hovered (PAR-1076): those on its way
 * up to the top of the tree, and those down to the pages right under it. Each line is a parent and a child, and it's
 * named here by its child, which has one parent. Lines are named by their pages' keys; a page in no line lights none.
 */
export function pageLinksLit(
  links: readonly { from: string; to: string }[],
  pages: readonly (string | undefined)[]
): Set<string> {
  const parentOf = new Map(links.map(({ from, to }) => [to, from]))
  const lit = new Set<string>()

  for (const page of pages) {
    if (page === undefined) {
      continue
    }

    for (const { from, to } of links) {
      if (from === page) {
        lit.add(to)
      }
    }

    for (let child = page; parentOf.has(child) && !lit.has(child); child = parentOf.get(child)!) {
      lit.add(child)
    }
  }

  return lit
}

/**
 * How tall the app's own page says it is, in a message its frame posts (PAR-1076): the script the builder's server puts
 * first in `index.html` posts `{ parity: "page-height", height }` with the document's height whenever it changes. The
 * height is rounded up to a whole pixel.
 */
export const pageHeightMessage = z
  .object({ parity: z.literal("page-height"), height: z.number().positive().finite() })
  .transform(({ height }) => Math.ceil(height))

/**
 * Where a page's frame says its page went (PAR-1076): the app's own page posts `{ parity: "page-landed", path }` with
 * the path it opened on, and again whenever its router moves it before anyone uses the page.
 */
export const pageLandedMessage = z
  .object({ parity: z.literal("page-landed"), path: z.string().startsWith("/") })
  .transform(({ path }) => path)

/**
 * The path a page landed on, when it isn't the one its URL asked for, as a route that redirects sends it elsewhere. A
 * trailing slash makes no difference.
 */
export function landedElsewhere(url: string, landed: string): string | undefined {
  const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path)

  return trim(new URL(url).pathname) === trim(landed) ? undefined : landed
}

/** The mode a page's frame draws in, as the app's own page reads it from the frame's name (PAR-1076). */
export interface PageMode {
  classes: string[]
  attributes: Record<string, string>
  /** What `prefers-color-scheme` answers: the mode's theme's, when it has one that's dark or light. */
  scheme?: "dark" | "light"
}

/**
 * The name a page's frame gives itself so the app's own page draws in its mode: `parity:` and the mode as JSON, its
 * classes and attributes, and its scheme from its theme option's id or class.
 */
export function pageFrameName(mode: Pick<ResolvedMode, "classNames" | "attributes" | "options">): string {
  const theme = mode.options.find(({ variable }) => variable.kind === "theme")?.option
  const said = [theme?.id, theme?.className].join(" ")
  const page: PageMode = { classes: mode.classNames, attributes: mode.attributes }

  if (/\bdark\b/.test(said)) {
    page.scheme = "dark"
  } else if (/\blight\b/.test(said)) {
    page.scheme = "light"
  }

  return `parity:${JSON.stringify(page)}`
}
