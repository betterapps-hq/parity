import { declares, type RouterAdapter } from "@parity-app/core"
import { tanstackLogo } from "./logo.ts"
import { readRoutes } from "./routes.ts"

/** TanStack Router (PAR-1073): its routes, read from the route tree its tooling generates and each route's file. */
export const tanstackRouter: RouterAdapter = {
  id: "tanstack-router",
  name: "TanStack Router",
  icon: tanstackLogo,
  async detect({ pkg }) {
    const found = declares(pkg, ["@tanstack/react-router"]) !== undefined

    return {
      found,
      summary: found ? "@tanstack/react-router in package.json" : "No @tanstack/react-router in package.json"
    }
  },
  versions: { packages: ["@tanstack/react-router"], majors: [[1, "2023-12-23"]] },
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
