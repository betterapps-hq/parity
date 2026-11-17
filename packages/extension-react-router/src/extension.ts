import { type CommandTarget, defineExtension, type NodeRef, type Parity, type Route } from "@parity-app/extension"
import type { ProjectFiles } from "./config.ts"
import { type ReadRoutes, readRoutes } from "./routes.ts"

/*
 * React Router as an extension (PAR-1145), using only Parity's public API. Its router provider reads the app's routes from
 * framework mode's `app/routes.ts`, file-based routes included, or from library mode's route objects or `<Route>`
 * elements, so the canvas draws each page and Layers lists them under Routes. Open in browser is offered on each page,
 * and the status bar counts the pages, or says what couldn't be read. Its peer dependency says which versions Parity
 * supports, and finds the router in a project.
 */

export default defineExtension({ activate })

function activate(parity: Parity): void {
  const count = parity.status.item("react-router.routes")
  parity.subscriptions.push(count)

  // A file or folder that isn't there reads as missing, as a route module or the flat routes' folder may not be yet.
  const files: ProjectFiles = {
    read: (path) => parity.files.read(path).catch(() => undefined),
    list: (folder) => parity.files.list(folder).catch(() => [])
  }

  // What it read last, counted again as the person marks routes (PAR-1175, PAR-1176).
  let read: ReadRoutes | undefined
  const show = () => read && count.set(statusOf({ ...read, routes: parity.routes.marked(read.routes) }))

  parity.subscriptions.push(
    parity.routes.onChange(show),
    parity.providers.register("router", {
      async routes() {
        read = await readRoutes(files)
        show()

        return read.routes
      }
    })
  )

  parity.subscriptions.push(
    parity.commands.register("react-router.showRoutes", () => parity.navigate.showTab("routes")),
    parity.commands.register("react-router.open", async (target) => {
      const route = routeOf(target, parity.selection.get())

      if (!route) {
        throw new Error("Select a page to open it")
      }

      const url = await parity.navigate.pageUrl(route)

      if (!url) {
        throw new Error(`${route.key} has no page to open`)
      }

      await parity.ui.open(url)
      void parity.ui.notify("Opened in your browser", { detail: url, tone: "success" })
    })
  )
}

/** What the status item shows: the count, and a tooltip. */
interface RoutesStatus {
  value: string
  tooltip: string
}

/**
 * What the status bar says of the routes: how many pages, and in its tooltip what couldn't be read. Routes made only
 * when the app runs are named as not supported yet.
 */
export function statusOf(found: ReadRoutes): RoutesStatus {
  const pages = found.routes.filter(isPage)
  const value = `${pages.length.toLocaleString()} ${pages.length === 1 ? "route" : "routes"}`

  if (found.mode === "none") {
    return {
      value,
      tooltip: "Routes made while the app runs aren't supported yet. Declare them in app/routes.ts or a route array."
    }
  }

  if (found.unread.length > 0) {
    return { value, tooltip: `Some routes aren't supported yet: ${found.unread.join("; ")}` }
  }

  return { value, tooltip: "Click to show them" }
}

/** Whether a route draws a page: every route but the root, which only holds the others, and an API route (PAR-1174). */
export function isPage(route: Route): boolean {
  return route.kind !== "root" && route.kind !== "api"
}

/** The route a command was run for: its page, or from Search actions, the page selected. */
export function routeOf(target: CommandTarget | undefined, selected: NodeRef[]): NodeRef | undefined {
  if (target?.type === "route") {
    return { owner: "react-router", type: "route", key: target.key }
  }

  return target ? undefined : selected.findLast((ref) => ref.type === "route")
}
