import { detectPeers, peerVersions, type RouterAdapter } from "@parity-app/core"
import routerExtension from "@parity-app/extension-tanstack-router/package.json" with { type: "json" }
import { tanstackLogo } from "./logo.ts"
import { readRoutes } from "./routes.ts"

const versions = peerVersions(routerExtension.peerDependencies)!

/** TanStack Router (PAR-1073): its routes, read from the route tree its tooling generates and each route's file. */
export const tanstackRouter: RouterAdapter = {
  id: "tanstack-router",
  name: "TanStack Router",
  icon: tanstackLogo,
  // Found by its extension's peer dependency, which also says which versions are supported.
  detect: async ({ pkg }) => detectPeers(pkg, versions),
  versions,
  readRoutes,
  actions: [
    {
      id: "open",
      name: "Open in browser",
      // Each page, which a browser can open; the root only holds the others.
      routes: ({ routes = [] }) => routes.filter((route) => route.parent !== undefined).map((route) => route.id),
      progress: "Opening the page…",
      failed: "Couldn't open the page"
    }
  ],
  run: async (action, { page }) => {
    if (action !== "open" || !page) {
      throw new Error(`TanStack Router has no action ${action} for this`)
    }

    return { open: page.url }
  },
  // The root route only holds the others, so it isn't counted.
  status: ({ version, routes = [] }) => {
    const count = routes.filter((route) => route.parent !== undefined).length

    return [
      {
        value: count.toLocaleString(),
        words: count === 1 ? " route" : " routes",
        hint: version ? `TanStack Router ${version}` : "TanStack Router",
        detail: "Click to show them",
        opens: { tab: "layers" }
      }
    ]
  }
}
