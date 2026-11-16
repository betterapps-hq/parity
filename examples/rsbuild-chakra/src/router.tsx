import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { AppShell } from "./components/AppShell"
import { Home } from "./routes/Home"
import { Settings } from "./routes/Settings"

const rootRoute = createRootRoute({ component: AppShell })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })

const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: Settings })

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, settingsRoute]) })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
