import type { PackageManifest, RouterAdapter } from "@parity-app/core"
import { tanstackLogo } from "./logo.ts"
import { readRoutes } from "./routes.ts"

/** Whether a project depends on TanStack Router for React. */
function detect(pkg: PackageManifest): boolean {
  return Boolean(pkg.dependencies?.["@tanstack/react-router"] ?? pkg.devDependencies?.["@tanstack/react-router"])
}

/** TanStack Router (PAR-1073): its routes, read from the route tree its tooling generates and each route's file. */
export const tanstackRouter: RouterAdapter = {
  id: "tanstack-router",
  name: "TanStack Router",
  icon: tanstackLogo,
  detect,
  readRoutes,
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
