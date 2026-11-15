import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { CommandTarget, NodeRef, Parity, Route } from "@parity-app/extension-api"
import { readRoutes } from "./routes.ts"

/*
 * TanStack Router as an extension (PAR-1095), using only Parity's public API. Its router provider reads the app's
 * routes from the route tree the router's tooling generates, which Parity asks for while the project opens, so the
 * canvas draws each page and Layers lists them under Routes. Open in browser is offered on each page, and the status
 * bar counts the pages. Its peer dependency says which versions Parity supports, and finds the router in a project.
 */

export function activate(parity: Parity): void {
  const { root } = parity.project
  const count = parity.status.item("tanstack-router.routes")
  parity.subscriptions.push(count)

  parity.subscriptions.push(
    parity.providers.register("router", {
      async routes() {
        const routes = readRoutes((path) => {
          try {
            return readFileSync(join(root, path), "utf8")
          } catch {
            // A file that can't be read counts as missing, as the router's tooling may not have written it yet.
            return undefined
          }
        })

        const pages = routes.filter(isPage)
        count.set({
          value: `${pages.length.toLocaleString()} ${pages.length === 1 ? "route" : "routes"}`,
          tooltip: "Click to show them"
        })

        return routes
      }
    })
  )

  parity.subscriptions.push(
    parity.commands.register("tanstack-router.showRoutes", () => parity.navigate.showTab("layers")),
    parity.commands.register("tanstack-router.open", async (target) => {
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

/** Whether a route draws a page: every route but the root, which only holds the others. */
export function isPage(route: Route): boolean {
  return route.kind !== "root"
}

/** The route a command was run for: its page, or from Search actions, the page selected. */
export function routeOf(target: CommandTarget | undefined, selected: NodeRef[]): NodeRef | undefined {
  if (target?.type === "route") {
    return { owner: "tanstack-router", type: "route", key: target.key }
  }

  return target ? undefined : selected.findLast((ref) => ref.type === "route")
}
