import { flatRoutes } from "@react-router/fs-routes"
import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes"

// Each of React Router's ways to declare a route, so Parity's React Router extension reads them all.
export default [
  // A layout without a path of its own: the marketing pages share its header and footer.
  layout("layouts/marketing.tsx", [
    index("routes/home.tsx"),
    route("pricing", "routes/pricing.tsx"),
    // An optional segment: /about and /fr/about.
    route(":lang?/about", "routes/about.tsx"),
  ]),

  // A nested layout with its own path, drawing its children at its <Outlet>.
  route("projects", "layouts/projects.tsx", [
    index("routes/projects/index.tsx"),
    route(":projectId", "routes/projects/project.tsx"),
  ]),

  // Settings come from file names in app/settings, with React Router's flat-routes convention.
  route("settings", "layouts/settings.tsx", await flatRoutes({ rootDirectory: "settings" })),

  // A prefix, and a splat that takes the rest of the URL.
  ...prefix("docs", [route("*", "routes/docs.tsx")]),

  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig
