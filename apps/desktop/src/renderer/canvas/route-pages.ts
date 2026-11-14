import { addDesigns, type CanvasDocument } from "@parity-app/core"
import { routeTree, samplePath } from "@parity-app/editor"
import type { ProjectInfo } from "@parity-app/project"
import { windowStore } from "../store.ts"
import { componentBoardsTop } from "./component-boards.ts"

/**
 * Where the app's pages are kept among a project's designs (PAR-1076): a design file of their own that's never saved,
 * since they're drawn from the routes each time the project opens.
 */
export const routePagesFile = "(pages)"

/** A page screen's URL, which its frames draw, and its route's path, which its title shows under its name. */
interface PagePlace {
  url: string
  path: string
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
 * name and path, the keys of the screens and groups inside it, and the page its index redirects to.
 */
export interface PageGroupPlace {
  key: string
  name: string
  path: string
  members: string[]
  redirect?: { key: string; name: string }
}

/** Each open project's layout groups, in the tree's order: a group before the groups inside it. */
const pageGroups = new Map<string, readonly PageGroupPlace[]>()

/**
 * The layout group selected, by its key: a group isn't a design, so it's selected here rather than in the project's
 * selection, which holds nothing while it is.
 */
export const selectedPageGroup = windowStore<string | undefined>(() => undefined)

/**
 * Where each page landed instead of its own path, by its design's key, as its frames say (see `pageLandedMessage`): a
 * route that redirects or guards sends its page elsewhere. Layers shows it on the page's row.
 */
export const pageLandings = windowStore<ReadonlyMap<string, string>>(() => new Map())

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

  pagePlaces.set(info.id, new Map(screens.map(({ screen, url, path, route }) => [screen.id, { url, path, route }])))
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
    groups.map(({ id, name, path, redirect }) => {
      const place: PageGroupPlace = {
        key: designKey(id),
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

/** The id of the route a page screen draws, or undefined for a design. */
export function routePageRoute(project: string, design: string): string | undefined {
  return pagePlaces.get(project)?.get(design)?.route
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
