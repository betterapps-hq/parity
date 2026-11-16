import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { AppShell } from "./components/AppShell.tsx"
import { Home } from "./routes/Home.tsx"
import { NotFound } from "./routes/NotFound.tsx"
import { Settings } from "./routes/Settings.tsx"
import { TicketList } from "./routes/TicketList.tsx"
import { TicketPage } from "./routes/TicketPage.tsx"
import { TicketsLayout } from "./routes/TicketsLayout.tsx"

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFound })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })

const ticketsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/tickets", component: TicketsLayout })

const ticketListRoute = createRoute({ getParentRoute: () => ticketsRoute, path: "/", component: TicketList })

const ticketRoute = createRoute({ getParentRoute: () => ticketsRoute, path: "$ticketId", component: TicketPage })

const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: Settings })

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, ticketsRoute.addChildren([ticketListRoute, ticketRoute]), settingsRoute])
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
