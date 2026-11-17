import {
  addDesigns,
  type CanvasDocument,
  type ContainerSpec,
  type DesignNode,
  type NodeRef,
  type RouteSegment,
  routeParams as paramsOf
} from "@parity-app/core"
import { routeTree, samplePath, type Selection, withCopyLayers } from "@parity-app/editor"
import { type ContainerEntry, containerEntry, type ProjectDoc } from "@parity-app/multiplayer"
import type { ProjectInfo } from "@parity-app/project"
import { type Store, windowStore } from "../store.ts"
import { componentBoardsTop } from "./component-boards.ts"

/**
 * Where the app's pages are kept among a project's designs (PAR-1076): a design file of their own that's never saved,
 * since they're drawn from the routes each time the project opens.
 */
export const routePagesFile = "(pages)"

/**
 * A page screen's URL, which its frames draw, its route's path, which its title shows under its name, and its route's
 * URL part by part, which a page's params fill in.
 */
interface PagePlace {
  url: string
  path: string
  segments: RouteSegment[]
  route: string
}

/** Each open project's page screens, by design id. */
const pagePlaces = new Map<string, ReadonlyMap<string, PagePlace>>()

/** A line from a page to a page under it in the app's tree, by their designs' keys. */
export interface PageLink {
  from: string
  to: string
}

/** Each open project's lines between its pages. */
const pageLinks = new Map<string, readonly PageLink[]>()

/**
 * A layout with no page of its own, drawn as a group around its pages (PAR-1076): its key, which lines to it name, its
 * layout route's id, its name and path, the keys of the screens and groups inside it, and the page its index redirects
 * to.
 */
export interface PageGroupPlace {
  key: string
  route: string
  name: string
  path: string
  members: string[]
  redirect?: { key: string; name: string }
}

/** Each open project's layout groups, in the tree's order: a group before the groups inside it. */
const pageGroups = new Map<string, readonly PageGroupPlace[]>()

/**
 * A route as the project's selection holds it (PAR-1092): by `NodeRef`, owned by the router that read it. A layout group
 * is selected this way, as it isn't a design.
 */
export function routeRef(info: Pick<ProjectInfo, "router">, route: string): NodeRef {
  return { owner: info.router?.id ?? "router", type: "route", key: route }
}

/** The layout group selected, by its key: the group drawn for the route the selection holds, when it has no page. */
export function selectedPageGroup(project: string, selection: Selection): string | undefined {
  const last = selection.refs?.length === 1 ? selection.refs[0] : undefined

  return last?.type === "route" ? routePageGroup(project, last.key)?.key : undefined
}

/**
 * Where each page landed instead of its own path, by its design's key, as its frames say (`page.ready` and `page.moved`): a
 * route that redirects or guards sends its page elsewhere. Layers shows it on the page's row.
 */
export const pageLandings = windowStore<ReadonlyMap<string, string>>(() => new Map())

/**
 * What a page's board and its row in Layers say of where it landed: a path on the app's own origin, or, for an address
 * off it, which main stopped the live page going to, the host it tried to open.
 */
export function landingLabel(landed: string): string {
  return URL.canParse(landed) ? `Tried to open ${new URL(landed).host}` : `Lands on ${landed}`
}

/** Notes where a page landed, or that it landed on its own path. */
export function setPageLanding(design: string, path: string | undefined): void {
  const now = pageLandings.get()

  if (now.get(design) === path) {
    return
  }

  const next = new Map(now)

  if (path === undefined) {
    next.delete(design)
  } else {
    next.set(design, path)
  }

  pageLandings.set(next)
}

/** What each page's frozen copy draws, by its design's key, for each open project's document. */
export interface CopyLayers {
  readonly byDoc: WeakMap<ProjectDoc, ReadonlyMap<string, readonly DesignNode[]>>
}

/**
 * What each page's frozen copy draws, as layers, by its project's document and its design's key (PAR-1262): made again
 * with each freeze, from the board's main frame, and kept in the window, never in the project's document, so another
 * project's page with the same route never shows them, and they go with the project. Layers shows them inside the route
 * that draws the page (`withCopyLayers`).
 */
export const copyLayers: Store<CopyLayers> = windowStore<CopyLayers>(() => ({ byDoc: new WeakMap() }))

const noCopies: ReadonlyMap<string, readonly DesignNode[]> = new Map()

/** What the pages' copies in one project draw. */
export function copiesOf(copies: CopyLayers, doc: ProjectDoc): ReadonlyMap<string, readonly DesignNode[]> {
  return copies.byDoc.get(doc) ?? noCopies
}

/** Keeps what a page's copy draws as its layers. */
export function setCopyLayers(doc: ProjectDoc, design: string, layers: readonly DesignNode[]): void {
  const { byDoc } = copyLayers.get()
  const now = byDoc.get(doc) ?? noCopies

  if (JSON.stringify(now.get(design)) === JSON.stringify(layers)) {
    return
  }

  byDoc.set(doc, new Map(now).set(design, layers))
  copyLayers.set({ byDoc })
}

/** Page designs with what each one's frozen copy draws inside the route that draws it, for Layers. */
export function withCopyEntries<Entry extends { key: string; path: string; container: ContainerSpec }>(
  entries: readonly Entry[],
  copies: ReadonlyMap<string, readonly DesignNode[]>
): readonly Entry[] {
  if (copies.size === 0) {
    return entries
  }

  return entries.map((entry) => {
    const inside = entry.path === routePagesFile ? copies.get(entry.key) : undefined

    return inside
      ? { ...entry, container: { ...entry.container, root: withCopyLayers(entry.container.root, [...inside]) } }
      : entry
  })
}

/** A design as the window shows it, a page's with what its frozen copy draws (see `withCopyEntries`). */
export function shownEntry(doc: ProjectDoc, key: string): ContainerEntry | undefined {
  const entry = containerEntry(doc, key)

  return entry && withCopyEntries([entry], copiesOf(copyLayers.get(), doc))[0]
}

/**
 * The app's pages as a design file, above the project's components and designs, or none without routes. Remembers each
 * page's URL for its frames to draw, the lines between pages, and the groups of layouts without pages. A page or group
 * inside a group has no line to it: the group holds it.
 */
export function routePages(info: Pick<ProjectInfo, "id" | "routes" | "guestUrl" | "documents" | "modes" | "sources">): {
  path: string
  document: CanvasDocument
}[] {
  const { screens, groups } = routeTree(info.routes, {
    origin: new URL(info.guestUrl).origin,
    x: 0,
    bottom: componentBoardsTop(info) - 600,
    width: 1280,
    height: 800,
    gap: 160,
    levelGap: 1100
  })

  pagePlaces.set(
    info.id,
    new Map(screens.map(({ screen, url, path, segments, route }) => [screen.id, { url, path, segments, route }]))
  )
  const grouped = new Set(groups.map((group) => group.id))
  const hung = [...screens.map(({ screen, parent }) => ({ id: screen.id, parent })), ...groups]

  pageLinks.set(
    info.id,
    hung.flatMap(({ id, parent }) =>
      parent === undefined || grouped.has(parent) ? [] : [{ from: designKey(parent), to: designKey(id) }]
    )
  )
  pageGroups.set(
    info.id,
    groups.map(({ id, name, path, route, redirect }) => {
      const place: PageGroupPlace = {
        key: designKey(id),
        route,
        name,
        path,
        members: hung.flatMap((member) => (member.parent === id ? [designKey(member.id)] : []))
      }

      const target = redirect && screens.find(({ screen }) => screen.id === redirect.screen)

      if (target) {
        place.redirect = { key: designKey(target.screen.id), name: target.screen.name }
      }

      return place
    })
  )

  return screens.length === 0
    ? []
    : [
        {
          path: routePagesFile,
          document: addDesigns(
            undefined,
            screens.map(({ screen }) => screen)
          )
        }
      ]
}

/**
 * The URL a page screen's frames draw, with the values its view gives its route's path params (see `samplePath`), or
 * undefined for a design.
 */
export function routePageUrl(
  project: string,
  design: string,
  params: Readonly<Record<string, string>> = {}
): string | undefined {
  const place = pagePlaces.get(project)?.get(design)

  return place && new URL(samplePath(place, params), place.url).href
}

/** One of the app's pages a command is offered for: its route's id, and the URL the canvas draws it at, its params filled. */
export interface PageTarget {
  route: string
  url: string
}

/**
 * A page screen as a command is offered for it: its route, and the URL its frames draw, with the values its view gives
 * its params. Undefined for a design.
 */
export function routePageTarget(project: string, design: ContainerSpec): PageTarget | undefined {
  const route = routePageRoute(project, design.id)
  const url = routePageUrl(project, design.id, design.view?.params)

  return route === undefined || url === undefined ? undefined : { route, url }
}

/** The id of the route a page screen draws, or undefined for a design. */
export function routePageRoute(project: string, design: string): string | undefined {
  return pagePlaces.get(project)?.get(design)?.route
}

/** The key of the design that draws a route's page, by the route's id, or undefined for a route without a page. */
export function routePageDesign(project: string, route: string): string | undefined {
  for (const [design, place] of pagePlaces.get(project) ?? []) {
    if (place.route === route) {
      return designKey(design)
    }
  }

  return undefined
}

/** The layout group the canvas draws for a route without a page of its own, by the route's id. */
export function routePageGroup(project: string, route: string): PageGroupPlace | undefined {
  return routePageGroups(project).find((group) => group.route === route)
}

/** The path of a page screen's route, as its router writes it, or undefined for a design. */
export function routePagePath(project: string, design: string): string | undefined {
  return pagePlaces.get(project)?.get(design)?.path
}

/** The lines between a project's pages, parent to child, a line to a group ending at the group. */
export function routePageLinks(project: string): readonly PageLink[] {
  return pageLinks.get(project) ?? []
}

/** A project's layout groups, in the tree's order. */
export function routePageGroups(project: string): readonly PageGroupPlace[] {
  return pageGroups.get(project) ?? []
}

/** A page or a layout group as Layers lists it among the routes: its key, how deep it is in the tree, and the group. */
export interface RouteListing {
  key: string
  level: number
  /** The group it's in, by key, when it's in one. */
  parent?: string
  group?: PageGroupPlace
}

/**
 * A project's pages and layout groups in the tree's order, each before what's under it, with how deep each is: App at
 * the top, its pages and Settings' group under it, and Billing and Profile in the group.
 */
export function routeListing(project: string): RouteListing[] {
  const links = routePageLinks(project)
  const groups = routePageGroups(project)

  const keys = [
    ...new Set([...links.flatMap(({ from, to }) => [from, to]), ...groups.flatMap((g) => [g.key, ...g.members])])
  ]

  const parentOf = new Map<string, string>([
    ...links.map(({ from, to }): [string, string] => [to, from]),
    ...groups.flatMap((group) => group.members.map((member): [string, string] => [member, group.key]))
  ])

  const listed: RouteListing[] = []

  const visit = (key: string, level: number) => {
    const group = groups.find((each) => each.key === key)
    const parent = parentOf.get(key)
    const item: RouteListing = { key, level }

    if (parent !== undefined && groups.some((each) => each.key === parent)) {
      item.parent = parent
    }

    if (group) {
      item.group = group
    }

    listed.push(item)

    for (const child of keys.filter((other) => parentOf.get(other) === key)) {
      visit(child, level + 1)
    }
  }

  for (const top of keys.filter((key) => !parentOf.has(key))) {
    visit(top, 0)
  }

  return listed
}

/** A page screen's key among the project's designs: its file and its id. */
function designKey(id: string): string {
  return `${routePagesFile}#${id}`
}

/** The names of the params a page screen's route takes, or undefined for a design. */
export function routeParams(info: Pick<ProjectInfo, "id" | "routes">, design: string): string[] | undefined {
  const route = routePageRoute(info.id, design)

  const found = route === undefined ? undefined : info.routes.find((each) => each.id === route)

  return found && paramsOf(found)
}
