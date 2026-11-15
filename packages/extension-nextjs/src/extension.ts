import type { CommandTarget, NodeRef, Parity, Route } from "@parity-app/extension-api"
import { pickFolders, readRoutes, routerFolders, sourceFiles } from "./routes.ts"

/*
 * Next.js's routes as an extension (PAR-1162), using only Parity's public API. Its router provider lists the files
 * under `app/` and `pages/`, or their `src/` folders, and turns Next.js's conventions into Parity's routes, so the
 * canvas draws each page once a builder serves the app, and Layers lists them under Routes. Both routers can be in one
 * project. Open in browser is offered on each page, and the status bar counts the pages.
 */

export function activate(parity: Parity): void {
  const count = parity.status.item("nextjs.routes")
  parity.subscriptions.push(count)

  parity.subscriptions.push(
    parity.providers.register("router", {
      async routes() {
        const routes = await projectRoutes(parity)
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
    parity.commands.register("nextjs.showRoutes", () => parity.navigate.showTab("layers")),
    parity.commands.register("nextjs.open", async (target) => {
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

/** The project's routes, from the files in each folder Next.js reads routes from. */
async function projectRoutes(parity: Parity): Promise<Route[]> {
  const listed = await Promise.all(
    [...routerFolders.app, ...routerFolders.pages].map((folder) => parity.files.list(folder))
  )

  const files = listed.flat()
  const folders = pickFolders(files)

  const texts = Object.fromEntries(
    await Promise.all(
      sourceFiles(files, folders).map(async (file) => {
        // A file that can't be read, as one removed since the listing, says nothing of its route.
        const text = await parity.files.read(file).catch(() => undefined)

        return [file, text ?? ""] as const
      })
    )
  )

  return readRoutes(files, folders, texts)
}

/** Whether a route is a page the canvas draws: a page outside a parallel route's slot that intercepts nothing. */
export function isPage(route: Route): boolean {
  return route.kind === "page" && route.slot === undefined && route.intercepts === undefined
}

/** The route a command was run for: its page, or from Search actions, the page selected. */
export function routeOf(target: CommandTarget | undefined, selected: NodeRef[]): NodeRef | undefined {
  if (target?.type === "route") {
    return { owner: "nextjs", type: "route", key: target.key }
  }

  return target ? undefined : selected.findLast((ref) => ref.type === "route")
}
