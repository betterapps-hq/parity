import {
  type ContainerSpec,
  type DesignNode,
  drawnRoute,
  lastStaticSegment,
  type ModeSettings,
  type ProjectRoute,
  type ResolvedMode,
  type RouteSegment,
  sameSegments
} from "@parity-app/core"
import type { PageMode } from "@parity-app/frames"
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

/** How much room a page's board takes on the canvas. */
export interface PageSize {
  width: number
  height: number
}

/** Where the tree goes and how big each page is. */
export interface PageLayout {
  /** The app's origin, as `http://127.0.0.1:5173`. */
  origin: string
  /** The top left of the tree. */
  x: number
  y: number
  /** A page's size when `size` doesn't give one: its board showing one mode. */
  width: number
  height: number
  /** Between pages side by side, and between a page and the pages under it. */
  gap: number
  levelGap: number
  /**
   * How much room a page's board takes, as when it shows more modes side by side (PAR-1317), so the pages beside it and
   * the levels under it make room. Without it, each page is `width` by `height`.
   */
  size?: (route: ProjectRoute) => PageSize
}

/**
 * The app's pages as a tree, or several when the root has no page of its own; empty without routes. A parallel route's
 * slot and an intercepting route aren't drawn yet, so they and the routes inside them are left out.
 */
export function pageTree(routes: readonly ProjectRoute[]): PageNode[] {
  const children = Map.groupBy(
    routes.filter((route) => route.parent !== undefined && drawnRoute(route)),
    (route) => route.parent ?? ""
  )

  // A route with routes inside it is drawn by its index, holding its other pages; one without is a page of its own.
  const standIn = (route: ProjectRoute): PageNode[] => {
    const inside = children.get(route.id)

    if (!inside) {
      return [{ route, children: [] }]
    }

    // Its own index is drawn at its own URL; an index of a deeper path, as `/projects/` under the root, is a page.
    const index = inside.find((child) => child.index && sameSegments(child, route))

    const pages = inside
      .filter((child) => child !== index)
      .toSorted((a, b) => a.path.localeCompare(b.path))
      .flatMap(standIn)

    // An index that draws nothing and only redirects isn't a page.
    if (index && !(index.component === undefined && index.redirect !== undefined)) {
      return [{ route: index, children: pages }]
    }

    // The root's pages are the tree's tops; any other layout without a page is a group around its pages.
    if (route.kind === "root") {
      return pages
    }

    const group: PageGroup = {}

    if (index?.redirect !== undefined) {
      group.redirect = index.redirect
    }

    return [{ route, children: pages, group }]
  }

  const root = routes.find((route) => route.kind === "root")

  return root ? standIn(root).filter((node) => node.route !== root) : []
}

/**
 * The tree laid out top down: each page centered over the pages under it, which sit side by side a level below, and
 * the trees of a forest side by side. A group's pages sit side by side inside it, on the group's own level. Each page
 * takes the room its board does (`layout.size`), and each level is as tall as its tallest page.
 */
export function placePages(tree: readonly PageNode[], layout: PageLayout): PlacedPage[] {
  const placed: PlacedPage[] = []
  const sizeOf = (route: ProjectRoute) => layout.size?.(route) ?? { width: layout.width, height: layout.height }
  const levels = levelTops(tree, layout, sizeOf)

  const row = (nodes: readonly PageNode[]): number =>
    nodes.reduce((total, node, index) => total + span(node) + (index > 0 ? layout.gap : 0), 0)

  const span = (node: PageNode): number =>
    node.group ? row(node.children) + groupInset * 2 : Math.max(sizeOf(node.route).width, row(node.children))

  const place = (node: PageNode, left: number, depth: number, parent?: string) => {
    const width = span(node)
    const y = levels[depth] ?? layout.y

    if (node.group) {
      const group: PlacedPage = {
        route: node.route,
        url: new URL(samplePath(node.route), layout.origin).href,
        x: left,
        y,
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
      x: left + (width - sizeOf(node.route).width) / 2,
      y
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

/** The top of each level of the tree: the first at `layout.y`, each next one `levelGap` below the tallest page above. */
function levelTops(
  tree: readonly PageNode[],
  layout: Pick<PageLayout, "y" | "height" | "levelGap">,
  sizeOf: (route: ProjectRoute) => { height: number }
): number[] {
  const tallest: number[] = []

  const visit = (node: PageNode, depth: number) => {
    if (!node.group) {
      tallest[depth] = Math.max(tallest[depth] ?? layout.height, sizeOf(node.route).height)
    }

    for (const child of node.children) {
      visit(child, node.group ? depth : depth + 1)
    }
  }

  for (const node of tree) {
    visit(node, 0)
  }

  const tops = [layout.y]

  for (const height of tallest) {
    tops.push(tops.at(-1)! + (height ?? layout.height) + layout.levelGap)
  }

  return tops
}

/** How tall a tree's levels are together, each with the gap under it: `treeDepth` levels as `placePages` lays them. */
function treeHeight(tree: readonly PageNode[], layout: Pick<PageLayout, "height" | "levelGap" | "size">): number {
  const sizeOf = (route: ProjectRoute) => layout.size?.(route) ?? { height: layout.height }

  return levelTops(tree, { ...layout, y: 0 }, sizeOf)[treeDepth(tree)] ?? 0
}

/** How many levels a tree has. A group's pages are on its own level. */
export function treeDepth(tree: readonly PageNode[]): number {
  return Math.max(0, ...tree.map((node) => (node.group ? 0 : 1) + treeDepth(node.children)))
}

/**
 * A route's URL with a value for each param: the one `values` gives it, by the param's name, or else its name, and
 * nothing for a catch-all unless `values` gives one. Values are written as a URL writes them, so one with a slash or a
 * space stays one segment.
 */
export function samplePath(
  route: Pick<ProjectRoute, "segments">,
  values: Readonly<Record<string, string>> = {}
): string {
  return `/${route.segments.map((segment) => sampleSegment(segment, values)).join("/")}`
}

/** A param's value, its name without one, nothing for a catch-all without one, and a fixed part as it is. */
function sampleSegment(segment: RouteSegment, values: Readonly<Record<string, string>>): string {
  if (segment.type === "static") {
    return segment.value
  }

  const value = values[segment.name]

  if (value !== undefined && value !== "") {
    return encodeURIComponent(value)
  }

  return segment.type === "param" ? segment.name : ""
}

/**
 * A page as a screen on the canvas (PAR-1076), the URL its frames draw, its path, and the screen or group it hangs
 * from, by id.
 */
export interface RouteScreen {
  screen: ContainerSpec
  url: string
  /** Its route's URL as the router writes it, which its title shows. */
  path: string
  /** Its route's URL, part by part, which its frames' URL fills in. */
  segments: RouteSegment[]
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
 * What a page is called: its component in words, as `ProjectDetail` is "Project detail", else its URL's last fixed
 * part, as `/settings` is "Settings", else Home.
 */
export function pageName(route: Pick<ProjectRoute, "component" | "segments">): string {
  const words = route.component ?? lastStaticSegment(route)

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

/**
 * A page's layers with what its frozen copy drew inside the route that draws the page (PAR-1262): `inside` as the
 * innermost route layer's children. They're made again with each freeze and kept in the window, never saved.
 */
export function withCopyLayers(root: DesignNode, inside: DesignNode[]): DesignNode {
  if (root.type !== "route") {
    return root
  }

  const [only, ...rest] = root.children ?? []

  if (only?.type === "route" && rest.length === 0) {
    return { ...root, children: [withCopyLayers(only, inside)] }
  }

  return { ...root, children: inside }
}

/** The id of the screen a route is drawn in, which says it's a page rather than a design. */
export function routeScreenId(route: Pick<ProjectRoute, "id">): string {
  return `route:${route.id}`
}

/**
 * The app's pages as screens (PAR-1076), laid out as a tree (see `pageTree`) whose bottom is at `bottom`, each named
 * as `pageName` says. Its layers are the routes that draw it (see `routeLayers`); its frames show the app itself at
 * `url`, each as wide as its viewport, with no height of its own, so it's as tall as the page says (`page.height`).
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
  const tall = treeHeight(tree, layout)
  const placed = placePages(tree, { ...layout, y: layout.bottom - tall })
  const groups: RouteGroup[] = []
  const byId = new Map(routes.map((route) => [route.id, route]))
  const parentOf = (page: PlacedPage) => byId.get(page.route.parent ?? "")

  const screens = placed.flatMap((page) => {
    const id = routeScreenId(page.route)

    if (page.group) {
      // Named for its path, as its pages are what it holds; one without a path of its own, for its component.
      const parent = parentOf(page)
      const ownPath = lastStaticSegment(page.route) !== undefined && !(parent && sameSegments(page.route, parent))
      const named = ownPath ? { segments: page.route.segments } : page.route

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

      const target = placed.find((other) => !other.group && samplePath(other.route) === page.group?.redirect)

      if (target) {
        group.redirect = { screen: routeScreenId(target.route), path: target.route.path }
      }

      groups.push(group)

      return []
    }

    const drawn: RouteScreen = {
      url: page.url,
      path: page.route.path,
      segments: page.route.segments,
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
  const { start, c1, c2, curveEnd, end } = linkCurve(above, below, zoom, untitled)
  const drop = end ? ` L ${end.x} ${end.y}` : ""

  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${curveEnd.x} ${curveEnd.y}${drop}`
}

interface Point {
  x: number
  y: number
}

/** The cubic of a line in the page tree, and the drop after it when there is one (see `pageLinkLine`). */
function linkCurve(above: BoardBox, below: BoardBox, zoom: number, untitled: boolean) {
  const [x1, y1] = [above.x + above.w / 2, above.y + above.h]
  const x2 = below.x + below.w / 2
  const turn = untitled ? below.y : titleTop(below, zoom) - linkClearance / zoom
  const dropping = turn > y1 && !untitled
  const curveEnd = dropping ? turn : below.y
  const bend = (curveEnd - y1) / 2

  return {
    start: { x: x1, y: y1 },
    c1: { x: x1, y: y1 + bend },
    c2: { x: x2, y: curveEnd - bend },
    curveEnd: { x: x2, y: curveEnd },
    end: dropping ? { x: x2, y: below.y } : undefined
  }
}

/** A dash and the gap after it in the page tree's lines, in screen pixels. */
export const pageLinkDash = 6

/** How long each piece of a line in the page tree is at most, in screen pixels: a whole number of dashes and gaps. */
const linkPieceLength = 200 * 2 * pageLinkDash

/**
 * The line from a page down to a page under it, as `pageLinkLine` draws it, in pieces for drawing dashed (PAR-1322).
 * Each piece starts a whole number of dashes and gaps along the line, so every piece starts on a dash and one dash
 * offset flows them all; and a piece off screen isn't drawn, where one long dashed line had every dash along it worked
 * out on every frame, on screen or not. The curve is flattened to within half a screen pixel. Each piece comes with
 * the box round it on the canvas.
 */
export function pageLinkPieces(
  above: BoardBox,
  below: BoardBox,
  zoom: number,
  untitled = false
): { path: string; box: BoardBox }[] {
  const { start, c1, c2, curveEnd, end } = linkCurve(above, below, zoom, untitled)
  const points = [start]
  flatten(start, c1, c2, curveEnd, 0.5 / zoom, points, 0)

  if (end) {
    points.push(end)
  }

  return cut(points, linkPieceLength / zoom).map((piece) => {
    const xs = piece.map(({ x }) => x)
    const ys = piece.map(({ y }) => y)
    const [left, top] = [Math.min(...xs), Math.min(...ys)]

    return {
      path: `M ${piece.map(({ x, y }) => `${round(x)} ${round(y)}`).join(" L ")}`,
      box: { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top }
    }
  })
}

const round = (value: number) => Math.round(value * 100) / 100

/** Adds a cubic's points after its start to `points`, halving it until each part is flat within `tolerance`. */
function flatten(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number, points: Point[], depth: number) {
  if (depth >= 16 || (offChord(p1, p0, p3) <= tolerance && offChord(p2, p0, p3) <= tolerance)) {
    points.push(p3)

    return
  }

  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const [a, b, c] = [mid(p0, p1), mid(p1, p2), mid(p2, p3)]
  const [d, e] = [mid(a, b), mid(b, c)]
  const centre = mid(d, e)
  flatten(p0, a, d, centre, tolerance, points, depth + 1)
  flatten(centre, e, c, p3, tolerance, points, depth + 1)
}

/** How far a point is from the line through a chord's ends. */
function offChord(point: Point, from: Point, to: Point) {
  const [dx, dy] = [to.x - from.x, to.y - from.y]
  const length = Math.hypot(dx, dy)

  return length === 0
    ? Math.hypot(point.x - from.x, point.y - from.y)
    : Math.abs(dy * (point.x - from.x) - dx * (point.y - from.y)) / length
}

/** A polyline cut into polylines `length` long, the last shorter, each starting where the one before ends. */
function cut(points: readonly Point[], length: number): Point[][] {
  const pieces: Point[][] = []
  let piece = [points[0]]
  let left = length

  for (let i = 1; i < points.length; i++) {
    let from = points[i - 1]
    const to = points[i]
    let span = Math.hypot(to.x - from.x, to.y - from.y)

    while (span > left) {
      const share = left / span
      const at = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
      piece.push(at)
      pieces.push(piece)
      piece = [at]
      from = at
      span -= left
      left = length
    }

    piece.push(to)
    left -= span
  }

  if (piece.length > 1) {
    pieces.push(piece)
  }

  return pieces
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
 * The path a page landed on, when it isn't the one its URL asked for, as a route that redirects sends it elsewhere. A
 * trailing slash makes no difference.
 */
export function landedElsewhere(url: string, landed: string): string | undefined {
  const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path)

  return trim(new URL(url).pathname) === trim(landed) ? undefined : landed
}

/** A mode as the app's own page draws in it: its classes and attributes, and its scheme from its theme option's id or class. */
export function pageMode(mode: Pick<ResolvedMode, "classNames" | "attributes" | "options">): PageMode {
  const theme = mode.options.find(({ variable }) => variable.kind === "theme")?.option
  const said = [theme?.id, theme?.className].join(" ")
  const page: PageMode = { classes: mode.classNames, attributes: mode.attributes }

  if (/\bdark\b/.test(said)) {
    page.scheme = "dark"
  } else if (/\blight\b/.test(said)) {
    page.scheme = "light"
  }

  return page
}

/**
 * The URL a page's frame loads (PAR-1260): the page's URL on its builder's port, under a name of the project's own,
 * `http://<project>.localhost:<port>`. Chromium reaches every `*.localhost` name on the loopback address without asking
 * DNS, and gives each name a process of its own, so one project's pages never share a process with another's. Site
 * isolation ignores the port, so on `127.0.0.1` every open project's pages would share one.
 */
export function pageFrameUrl(url: string, project: string): string {
  const framed = new URL(url)
  framed.hostname = `${projectHost(project)}.localhost`

  return framed.href
}

/** A project's name under `.localhost`: `p` and a hash of its id, which is its absolute root, as a DNS label takes it. */
export function projectHost(project: string): string {
  return `p${hashHex(project, 0x811c9dc5)}${hashHex(project, 0x01000193)}`
}

/** FNV-1a over a string's UTF-16 code units from `seed`, as eight hex digits. */
function hashHex(text: string, seed: number): string {
  let hash = seed

  for (let index = 0; index < text.length; index++) {
    // oxlint-disable-next-line no-bitwise -- a hash: FNV-1a mixes each code unit in by XOR
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
  }

  // oxlint-disable-next-line no-bitwise -- a hash: read as an unsigned 32-bit number
  return (hash >>> 0).toString(16).padStart(8, "0")
}
