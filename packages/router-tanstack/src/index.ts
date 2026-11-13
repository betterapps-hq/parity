import type { PackageManifest, RouterAdapter } from "@parity-app/core"
import { readRoutes } from "./routes.ts"

/** Whether a project depends on TanStack Router for React. */
function detect(pkg: PackageManifest): boolean {
  return Boolean(pkg.dependencies?.["@tanstack/react-router"] ?? pkg.devDependencies?.["@tanstack/react-router"])
}

/** TanStack Router (PAR-1073): its routes, read from the route tree its tooling generates and each route's file. */
export const tanstackRouter: RouterAdapter = {
  id: "tanstack-router",
  name: "TanStack Router",
  detect,
  readRoutes
}
