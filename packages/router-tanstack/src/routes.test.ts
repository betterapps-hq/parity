import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { tanstackRouter } from "./index.ts"
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
        path: "/",
        file: "src/routes/__root.tsx",
        params: [],
        index: false,
        component: "RootLayout",
        loads: false,
        guards: false
      },
      {
        id: "/",
        path: "/",
        parent: "__root__",
        file: "src/routes/index.tsx",
        params: [],
        index: true,
        component: "App",
        loads: false,
        guards: false
      },
      {
        id: "/pricing",
        path: "/pricing",
        parent: "__root__",
        file: "src/routes/pricing.tsx",
        params: [],
        index: false,
        component: "Pricing",
        loads: false,
        guards: false
      },
      {
        id: "/settings",
        path: "/settings",
        parent: "__root__",
        file: "src/routes/settings.tsx",
        params: [],
        index: false,
        component: "SettingsLayout",
        loads: false,
        guards: false
      },
      {
        id: "/settings/",
        path: "/settings",
        parent: "/settings",
        file: "src/routes/settings.index.tsx",
        params: [],
        index: true,
        loads: false,
        guards: true
      },
      {
        id: "/settings/billing",
        path: "/settings/billing",
        parent: "/settings",
        file: "src/routes/settings.billing.tsx",
        params: [],
        index: false,
        component: "Billing",
        loads: false,
        guards: false
      },
      {
        id: "/settings/profile",
        path: "/settings/profile",
        parent: "/settings",
        file: "src/routes/settings.profile.tsx",
        params: [],
        index: false,
        component: "Profile",
        loads: false,
        guards: false
      },
      {
        id: "/projects/",
        path: "/projects",
        parent: "__root__",
        file: "src/routes/projects.index.tsx",
        params: [],
        index: true,
        component: "Projects",
        loads: false,
        guards: false
      },
      {
        id: "/projects/$projectId",
        path: "/projects/$projectId",
        parent: "__root__",
        file: "src/routes/projects.$projectId.tsx",
        params: ["projectId"],
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
      routes.map(({ id, path, parent, file, params, guards }) => ({ id, path, parent, file, params, guards }))
    ).toEqual([
      { id: "__root__", path: "/", parent: undefined, file: "app/routes/__root.tsx", params: [], guards: false },
      { id: "/_auth", path: "/", parent: "__root__", file: "app/routes/_auth.tsx", params: [], guards: true },
      {
        id: "/_auth/team/$teamId",
        path: "/team/$teamId",
        parent: "/_auth",
        file: "app/routes/_auth.team.$teamId.tsx",
        params: ["teamId"],
        guards: false
      },
      {
        id: "/files/$",
        path: "/files/$",
        parent: "__root__",
        file: "app/routes/files.$.tsx",
        params: ["_splat"],
        guards: false
      }
    ])
  })

  it("lists nothing before the router's tooling writes the route tree", () => {
    expect(readRoutes(recordReader({ "src/routes/__root.tsx": "export const Route = createRootRoute({})" }))).toEqual(
      []
    )
  })
})

describe("tanstackRouter.detect", () => {
  it("finds TanStack Router for React in either kind of dependency, and nothing else", () => {
    expect(tanstackRouter.detect({ dependencies: { "@tanstack/react-router": "^1.170.46" } })).toBe(true)
    expect(tanstackRouter.detect({ devDependencies: { "@tanstack/react-router": "^1.170.46" } })).toBe(true)
    expect(
      tanstackRouter.detect({ dependencies: { "react-router": "^7.0.0", "@tanstack/react-query": "^5.0.0" } })
    ).toBe(false)
  })
})
