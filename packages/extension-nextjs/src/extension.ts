import type { CommandTarget, NodeRef, Parity, Route } from "@parity-app/extension-api"
import { pageExtensions, pickFolders, readRoutes, routerFolders, sourceFiles } from "./routes.ts"

/** Where Next.js looks for its config, in its order. */
const configFiles = ["next.config.js", "next.config.mjs", "next.config.ts", "next.config.mts", "next.config.cjs"]

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
    [...routerFolders.app, ...routerFolders.pages].map((folder) => filesUnder(parity, folder))
  )

  const files = listed.flat()
  const extensions = pageExtensions(await firstConfig(parity))
  const folders = pickFolders(files, extensions)

  const texts = Object.fromEntries(
    await Promise.all(
      sourceFiles(files, folders, extensions).map(async (file) => {
        // A file that can't be read, as one removed since the listing, says nothing of its route.
        const text = await parity.files.read(file).catch(() => undefined)

        return [file, text ?? ""] as const
      })
    )
  )

  return readRoutes(files, folders, texts, extensions)
}

/**
 * Every file in a folder and the folders inside it, by its path from the project's root, a level at a time. None when
 * the folder isn't there, as a project with only one of the routers.
 */
async function filesUnder(parity: Parity, folder: string): Promise<string[]> {
  const entries = await parity.files.list(folder).catch(() => [])

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${folder}/${entry.name}`

      if (!entry.folder) {
        return [path]
      }

      return entry.name === "node_modules" ? [] : filesUnder(parity, path)
    })
  )

  return nested.flat()
}

/** The text of the project's `next.config`, the first Next.js would load, or nothing without one. */
async function firstConfig(parity: Parity): Promise<string | undefined> {
  for (const file of configFiles) {
    const text = await parity.files.read(file).catch(() => undefined)

    if (text !== undefined) {
      return text
    }
  }

  return undefined
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
