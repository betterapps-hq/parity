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
