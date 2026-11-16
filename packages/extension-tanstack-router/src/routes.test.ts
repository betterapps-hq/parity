import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { readRoutes } from "./routes.ts"

/** Reads files from a folder by their path from it, as the project service reads a project's. */
function folderReader(root: string) {
  return (path: string) => {
    try {
      return readFileSync(join(root, path), "utf8")
    } catch {
      return undefined
    }
  }
}

/** Reads files from a record of their texts by path. */
function recordReader(files: Record<string, string>) {
  return (path: string) => files[path]
}

describe("readRoutes", () => {
  it("reads the example project's routes, each parent before its children", () => {
    const routes = readRoutes(folderReader(join(import.meta.dirname, "../../../examples/shadcn-vite")))

    expect(routes).toEqual([
      {
        id: "__root__",
        kind: "root",
        segments: [],
        path: "/",
        file: "src/routes/__root.tsx",
        index: false,
        component: "RootLayout",
        loads: false,
        guards: false
      },
      {
        id: "/",
        kind: "page",
        segments: [],
        path: "/",
        parent: "__root__",
        file: "src/routes/index.tsx",
        index: true,
        component: "App",
        loads: false,
        guards: false
      },
      {
        id: "/dashboard",
        kind: "page",
        segments: [{ type: "static", value: "dashboard" }],
        path: "/dashboard",
        parent: "__root__",
        file: "src/routes/dashboard.tsx",
        index: false,
        component: "Dashboard",
        loads: false,
        guards: true
      },
      {
        id: "/login",
        kind: "page",
        segments: [{ type: "static", value: "login" }],
        path: "/login",
        parent: "__root__",
        file: "src/routes/login.tsx",
        index: false,
        component: "Login",
        loads: false,
        guards: false
      },
      {
        id: "/pricing",
        kind: "page",
        segments: [{ type: "static", value: "pricing" }],
        path: "/pricing",
        parent: "__root__",
        file: "src/routes/pricing.tsx",
        index: false,
        component: "Pricing",
        loads: false,
        guards: false
      },
      {
        id: "/settings",
        kind: "layout",
        segments: [{ type: "static", value: "settings" }],
        path: "/settings",
        parent: "__root__",
        file: "src/routes/settings.tsx",
        index: false,
        component: "SettingsLayout",
        loads: false,
        guards: false
      },
      {
        id: "/settings/",
        kind: "page",
        segments: [{ type: "static", value: "settings" }],
        path: "/settings",
        parent: "/settings",
        file: "src/routes/settings.index.tsx",
        index: true,
        loads: false,
        guards: true,
        redirect: "/settings/profile"
      },
      {
        id: "/settings/billing",
        kind: "page",
        segments: [
          { type: "static", value: "settings" },
          { type: "static", value: "billing" }
        ],
        path: "/settings/billing",
        parent: "/settings",
        file: "src/routes/settings.billing.tsx",
        index: false,
        component: "Billing",
        loads: false,
        guards: false
      },
      {
        id: "/settings/profile",
        kind: "page",
        segments: [
          { type: "static", value: "settings" },
          { type: "static", value: "profile" }
        ],
        path: "/settings/profile",
        parent: "/settings",
        file: "src/routes/settings.profile.tsx",
        index: false,
        component: "Profile",
        loads: false,
        guards: false
      },
      {
        id: "/projects/",
        kind: "page",
        segments: [{ type: "static", value: "projects" }],
        path: "/projects",
        parent: "__root__",
        file: "src/routes/projects.index.tsx",
        index: true,
        component: "Projects",
        loads: false,
        guards: false
      },
      {
        id: "/projects/$projectId",
        kind: "page",
        segments: [
          { type: "static", value: "projects" },
          { type: "param", name: "projectId" }
        ],
        path: "/projects/$projectId",
        parent: "__root__",
        file: "src/routes/projects.$projectId.tsx",
        index: false,
        component: "ProjectDetail",
        loads: true,
        guards: false
      }
    ])
  })

  it("reads a layout without a path of its own, a splat, and a lazy route, from where tsr.config.json says", () => {
    const routes = readRoutes(
      recordReader({
        "tsr.config.json": JSON.stringify({ generatedRouteTree: "./app/routeTree.gen.ts" }),
        "app/routeTree.gen.ts": `
          import { Route as rootRouteImport } from './routes/__root'
          import { Route as AuthRouteImport } from './routes/_auth'
          import { Route as AuthTeamRouteImport } from './routes/_auth.team.$teamId'
          import { Route as FilesSplatRouteImport } from './routes/files.$'

          const AuthRoute = AuthRouteImport.update({ id: '/_auth', getParentRoute: () => rootRouteImport } as any)
          const AuthTeamRoute = AuthTeamRouteImport.update({
            id: '/team/$teamId',
            path: '/team/$teamId',
            getParentRoute: () => AuthRoute,
          } as any).lazy(() => import('./routes/_auth.team.$teamId.lazy').then((d) => d.Route))
          const FilesSplatRoute = FilesSplatRouteImport.update({
            id: '/files/$',
            path: '/files/$',
            getParentRoute: () => rootRouteImport,
          } as any)
        `,
        "app/routes/_auth.tsx": `export const Route = createFileRoute("/_auth")({ beforeLoad: requireUser, component: AuthLayout })`
      })
    )

    expect(
      routes.map(({ id, kind, segments, path, parent, file, guards }) => ({
        id,
        kind,
        segments,
        path,
        parent,
        file,
        guards
      }))
    ).toEqual([
      {
        id: "__root__",
        kind: "root",
        segments: [],
        path: "/",
        parent: undefined,
        file: "app/routes/__root.tsx",
        guards: false
      },
      {
        id: "/_auth",
        kind: "group",
        segments: [],
        path: "/",
        parent: "__root__",
        file: "app/routes/_auth.tsx",
        guards: true
      },
      {
        id: "/_auth/team/$teamId",
        kind: "page",
        segments: [
          { type: "static", value: "team" },
          { type: "param", name: "teamId" }
        ],
        path: "/team/$teamId",
        parent: "/_auth",
        file: "app/routes/_auth.team.$teamId.tsx",
        guards: false
      },
      {
        id: "/files/$",
        kind: "page",
        segments: [
          { type: "static", value: "files" },
          { type: "catchAll", name: "_splat" }
        ],
        path: "/files/$",
        parent: "__root__",
        file: "app/routes/files.$.tsx",
        guards: false
      }
    ])
  })

  it("leaves out server routes, but keeps one with a component, a lazy part, or pages inside it (PAR-1173)", () => {
    const routes = readRoutes(
      recordReader({
        "src/routeTree.gen.ts": `
          import { Route as rootRouteImport } from './routes/__root'
          import { Route as IndexRouteImport } from './routes/index'
          import { Route as ApiActionRouteImport } from './routes/api.action'
          import { Route as LogoutRouteImport } from './routes/logout'
          import { Route as ExportRouteImport } from './routes/export'
          import { Route as TeamRouteImport } from './routes/team'
          import { Route as AccountRouteImport } from './routes/account'
          import { Route as AccountProfileRouteImport } from './routes/account.profile'
          import { Route as HooksRouteImport } from './routes/hooks'
          import { Route as HooksStripeRouteImport } from './routes/hooks.stripe'
          import { Route as PingRouteImport } from './routes/ping'
          import { Route as FeedRouteImport } from './routes/feed'

          const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
          const ApiActionRoute = ApiActionRouteImport.update({ id: '/api/action', path: '/api/action', getParentRoute: () => rootRouteImport } as any)
          const LogoutRoute = LogoutRouteImport.update({ id: '/logout', path: '/logout', getParentRoute: () => rootRouteImport } as any)
          const ExportRoute = ExportRouteImport.update({ id: '/export', path: '/export', getParentRoute: () => rootRouteImport } as any)
          const TeamRoute = TeamRouteImport.update({ id: '/team', path: '/team', getParentRoute: () => rootRouteImport } as any).lazy(() => import('./routes/team.lazy').then((d) => d.Route))
          const AccountRoute = AccountRouteImport.update({ id: '/account', path: '/account', getParentRoute: () => rootRouteImport } as any)
          const AccountProfileRoute = AccountProfileRouteImport.update({ id: '/profile', path: '/profile', getParentRoute: () => AccountRoute } as any)
          const HooksRoute = HooksRouteImport.update({ id: '/hooks', path: '/hooks', getParentRoute: () => rootRouteImport } as any)
          const HooksStripeRoute = HooksStripeRouteImport.update({ id: '/stripe', path: '/stripe', getParentRoute: () => HooksRoute } as any)
          const PingRoute = PingRouteImport.update({ id: '/ping', path: '/ping', getParentRoute: () => rootRouteImport } as any)
          const FeedRoute = FeedRouteImport.update({ id: '/feed', path: '/feed', getParentRoute: () => rootRouteImport } as any)
        `,
        "src/routes/index.tsx": `export const Route = createFileRoute("/")({ component: Home })`,
        "src/routes/api.action.ts": `export const Route = createFileRoute("/api/action")({ server: { handlers: { POST } } })`,
        "src/routes/logout.ts": `export const Route = createFileRoute("/logout")({ server: { handlers: apiHandlers(handlers) } })`,
        "src/routes/export.tsx": `export const Route = createFileRoute("/export")({ server: { handlers: { GET } }, component: Export })`,
        "src/routes/team.tsx": `export const Route = createFileRoute("/team")({ server: { handlers: { GET } } })`,
        "src/routes/account.ts": `export const Route = createFileRoute("/account")({ server: { handlers: { GET } } })`,
        "src/routes/account.profile.tsx": `export const Route = createFileRoute("/account/profile")({ component: Profile })`,
        "src/routes/hooks.ts": `export const Route = createFileRoute("/hooks")({ server: { handlers: { GET } } })`,
        "src/routes/hooks.stripe.ts": `export const Route = createFileRoute("/hooks/stripe")({ server: { handlers: { POST } } })`,
        "src/routes/ping.ts": `const options = { server: { handlers: { GET } } }
export const Route = createFileRoute("/ping")(options)`,
        "src/routes/feed.ts": `export const Route = createFileRoute("/feed")(serverRoute({ GET }))`
      })
    )

    // A server route with only server routes inside goes with them; one with a page inside stays, as a layout still. Options
    // named in the file are read, and options a function makes may draw, so that route stays.
    expect(routes.map(({ id, kind }) => [id, kind])).toEqual([
      ["__root__", "root"],
      ["/", "page"],
      ["/export", "page"],
      ["/team", "page"],
      ["/account", "layout"],
      ["/account/profile", "page"],
      ["/feed", "page"]
    ])
  })

  it("reads where a route always redirects, but not a redirect that runs only sometimes", () => {
    const route = (options: string) =>
      readRoutes(
        recordReader({
          "src/routeTree.gen.ts": `
            import { Route as rootRouteImport } from './routes/__root'
            import { Route as AccountRouteImport } from './routes/account'
            const AccountRoute = AccountRouteImport.update({ id: '/account', path: '/account', getParentRoute: () => rootRouteImport } as any)
          `,
          "src/routes/account.tsx": `export const Route = createFileRoute("/account")(${options})`
        })
      )[1]?.redirect

    expect(route(`{ beforeLoad: () => { throw redirect({ to: "/account/profile" }) } }`)).toBe("/account/profile")
    expect(route(`{ beforeLoad() { throw redirect({ to: "/account/profile" }) } }`)).toBe("/account/profile")
    expect(route(`{ loader: async () => { throw redirect({ to: "/account/profile" }) } }`)).toBe("/account/profile")
    expect(
      route(`{ beforeLoad: ({ context }) => { if (!context.user) { throw redirect({ to: "/sign-in" }) } } }`)
    ).toBeUndefined()
    expect(route(`{ beforeLoad: () => { return; throw redirect({ to: "/x" }) } }`)).toBeUndefined()
    expect(route(`{ component: Account }`)).toBeUndefined()
  })

  it("lists nothing before the router's tooling writes the route tree", () => {
    expect(readRoutes(recordReader({ "src/routes/__root.tsx": "export const Route = createRootRoute({})" }))).toEqual(
      []
    )
  })
})

/** A route's options naming the root route as its parent and `report` as its path, for the server routes' cases. */
const parent = `getParentRoute: () => rootRoute, path: "report"`

describe("readRoutes with code-based routes (PAR-1156)", () => {
  it("reads app H's routes from its entry, in the files their components come from", () => {
    const routes = readRoutes(folderReader(join(import.meta.dirname, "../../../examples/rsbuild-chakra")))

    expect(routes).toEqual([
      {
        id: "__root__",
        kind: "root",
        segments: [],
        path: "/",
        file: "src/components/AppShell.tsx",
        index: false,
        component: "AppShell",
        loads: false,
        guards: false
      },
      {
        id: "/",
        kind: "page",
        segments: [],
        path: "/",
        parent: "__root__",
        file: "src/routes/Home.tsx",
        index: true,
        component: "Home",
        loads: false,
        guards: false
      },
      {
        id: "/settings",
        kind: "page",
        segments: [{ type: "static", value: "settings" }],
        path: "/settings",
        parent: "__root__",
        file: "src/routes/Settings.tsx",
        index: false,
        component: "Settings",
        loads: false,
        guards: false
      }
    ])
  })

  it("follows parents across files, in the order the files are read, through layouts with and without a path, index routes, params and lazy routes", () => {
    const routes = readRoutes(
      recordReader({
        "index.html": `<script type="module" src="/src/main.tsx"></script>`,
        "src/main.tsx": `import { router } from "./router"\nimport "./extra"`,
        "src/root.tsx": `export const rootRoute = createRootRouteWithContext<{ user: string }>()({ component: Shell })`,
        "src/router.tsx": `
          import { rootRoute } from "./root"
          import { projectsRoute, projectRoute } from "./projects"
          const authRoute = createRoute({ getParentRoute: () => rootRoute, id: "_auth", beforeLoad: guard })
          export const dashboardRoute = createRoute({ getParentRoute: () => authRoute, path: "dashboard", loader: load })
          export const router = createRouter({ routeTree: rootRoute.addChildren([authRoute, projectsRoute]) })`,
        "src/projects.tsx": `
          import { rootRoute as parent } from "./root"
          import { ProjectList } from "./pages/ProjectList"
          export const projectsRoute = createRoute({ getParentRoute: () => parent, path: "/projects" })
          export const projectsIndex = createRoute({ getParentRoute: () => projectsRoute, path: "/", component: ProjectList })
          export const projectRoute = createRoute({ getParentRoute: () => projectsRoute, path: "$projectId" }).lazy(
            () => import("./project.lazy").then((d) => d.Route)
          )`,
        "src/pages/ProjectList.tsx": "export function ProjectList() {}",
        "src/extra.ts": `
          import { rootRoute } from "./root"
          const notFound = createRoute({ getParentRoute: () => rootRoute, path: "$", component: Missing })`
      })
    )

    expect(routes.map(({ id, kind, path, parent, file, index }) => [id, kind, path, parent, file, index])).toEqual([
      ["__root__", "root", "/", undefined, "src/root.tsx", false],
      ["/_auth", "group", "/", "__root__", "src/router.tsx", false],
      ["/dashboard", "page", "/dashboard", "/_auth", "src/router.tsx", false],
      ["/$", "page", "/$", "__root__", "src/extra.ts", false],
      ["/projects", "layout", "/projects", "__root__", "src/projects.tsx", false],
      ["/projects/", "page", "/projects", "/projects", "src/pages/ProjectList.tsx", true],
      ["/projects/$projectId", "page", "/projects/$projectId", "/projects", "src/projects.tsx", false]
    ])
    expect(routes.find((route) => route.id === "/_auth")?.guards).toBe(true)
    expect(routes.find((route) => route.id === "/dashboard")?.loads).toBe(true)
    expect(routes.find((route) => route.id === "/$")?.segments).toEqual([{ type: "catchAll", name: "_splat" }])
  })

  it("leaves out server routes declared in code, but keeps one with pages inside (PAR-1173)", () => {
    const routes = readRoutes(
      recordReader({
        "src/main.tsx": `
          const rootRoute = createRootRoute({ component: Shell })
          const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
          const healthRoute = createRoute({ getParentRoute: () => rootRoute, path: "health", server: { handlers: { GET } } })
          const apiRoute = createRoute({ getParentRoute: () => rootRoute, path: "api", server: { handlers } })
          const docsRoute = createRoute({ getParentRoute: () => apiRoute, path: "docs", component: Docs })
        `
      })
    )

    expect(routes.map(({ id, kind }) => [id, kind])).toEqual([
      ["__root__", "root"],
      ["/", "page"],
      ["/api", "layout"],
      ["/api/docs", "page"]
    ])
  })

  it.each([
    [
      "a component given by an update",
      `createRoute({ ${parent}, server: { handlers } }).update({ component: Report })`
    ],
    [
      "a lazy part",
      `createRoute({ ${parent}, server: { handlers } }).lazy(() => import("./report.lazy").then((d) => d.Route))`
    ],
    ["any other method after", `createRoute({ ${parent}, server: { handlers } }).withOptions(more)`],
    [
      "a spread of the file's options with a component",
      `createRoute({ ...pageOptions, ${parent}, server: { handlers } })`
    ],
    ["a spread of imported options", `createRoute({ ...shared, ${parent}, server: { handlers } })`],
    ["a spread made by a function", `createRoute({ ...makeOptions(), ${parent}, server: { handlers } })`],
    ["a spread of options that can change later", `createRoute({ ...loose, ${parent} })`],
    ["a computed option", `createRoute({ [key]: Report, ${parent}, server: { handlers } })`],
    ["an update with options it can't read", `createRoute({ ${parent}, server: { handlers } }).update(shared)`]
  ])("keeps a server route with %s, which may draw (PAR-1173)", (_, made) => {
    const routes = readRoutes(
      recordReader({
        "src/main.tsx": `
          import { shared } from "@app/shared"
          const pageOptions = { component: Report }
          let loose = { server: { handlers } }
          const rootRoute = createRootRoute({ component: Shell })
          const reportRoute = ${made}
        `
      })
    )

    expect(routes.map(({ id }) => id)).toEqual(["__root__", "/report"])
  })

  it.each([
    ["server options spread from the file", `createRoute({ ...serverOptions, ${parent} })`],
    ["server options given by an update", `createRoute({ ${parent} }).update({ server: { handlers } })`],
    [
      "an update that changes nothing that draws",
      `createRoute({ ${parent}, server: { handlers } }).update({ ssr: false })`
    ],
    ["a spread of spread options", `createRoute({ ...nested, ${parent} })`]
  ])("leaves out a server route with %s (PAR-1173)", (_, made) => {
    const routes = readRoutes(
      recordReader({
        "src/main.tsx": `
          const serverOptions = { server: { handlers: { GET } } } satisfies Partial<RouteOptions>
          const nested = { ...serverOptions, ssr: false }
          const rootRoute = createRootRoute({ component: Shell })
          const reportRoute = ${made}
        `
      })
    )

    expect(routes.map(({ id }) => id)).toEqual(["__root__"])
  })

  it("lists nothing when the app makes no root route", () => {
    expect(
      readRoutes(recordReader({ "src/main.tsx": `const homeRoute = createRoute({ getParentRoute: () => rootRoute })` }))
    ).toEqual([])
  })
})
