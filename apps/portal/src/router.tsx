import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen.ts"

/** The app's router, which Start asks for by this name. */
export function getRouter() {
  return createRouter({ routeTree })
}
