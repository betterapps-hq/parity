import { describe, expect, it } from "vite-plus/test"
import type { ConfigRoute } from "./config.ts"
import { readRoutesFile } from "./routes-file.ts"

const noFlatRoutes = () => Promise.resolve([])

function read(text: string, flatRoutesOf: (rootDirectory: string) => Promise<ConfigRoute[]> = noFlatRoutes) {
  return readRoutesFile(text, "app/routes.ts", flatRoutesOf)
}

describe("readRoutesFile", () => {
  it("reads route, index and layout, with ids from their files and paths as written", async () => {
    const { routes, unread } = await read(`
      import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

      export default [
        index("routes/home.tsx"),
        route("about", "routes/about.tsx"),
        layout("routes/auth/layout.tsx", [
          route("login", "routes/auth/login.tsx"),
          route("register", "./routes/auth/register.tsx", { id: "register" }),
        ]),
        route("concerts/:city", "routes/concerts/city.tsx", [index("routes/concerts/overview.tsx")]),
        route(null, "routes/pathless.tsx"),
      ] satisfies RouteConfig
    `)

    expect(unread).toEqual([])
    expect(routes).toEqual([
      { id: "routes/home", file: "routes/home.tsx", index: true, children: [] },
      { id: "routes/about", file: "routes/about.tsx", path: "about", index: false, children: [] },
      {
        id: "routes/auth/layout",
        file: "routes/auth/layout.tsx",
        index: false,
        children: [
          { id: "routes/auth/login", file: "routes/auth/login.tsx", path: "login", index: false, children: [] },
          { id: "register", file: "./routes/auth/register.tsx", path: "register", index: false, children: [] }
        ]
      },
      {
        id: "routes/concerts/city",
        file: "routes/concerts/city.tsx",
        path: "concerts/:city",
        index: false,
        children: [{ id: "routes/concerts/overview", file: "routes/concerts/overview.tsx", index: true, children: [] }]
      },
      { id: "routes/pathless", file: "routes/pathless.tsx", index: false, children: [] }
    ])
  })

  it("puts prefix's path before each route with one, and on its indexes, through layouts", async () => {
    const { routes } = await read(`
      import { index, layout, prefix, route } from "@react-router/dev/routes"

      export default [
        ...prefix("docs", [
          index("routes/docs/home.tsx"),
          route("*", "routes/docs/page.tsx"),
          layout("routes/docs/layout.tsx", [route("/guides/", "routes/docs/guides.tsx")]),
        ]),
      ]
    `)

    expect(
      routes.map(({ id, path, children }) => ({ id, path, children: children.map((child) => child.path) }))
    ).toEqual([
      { id: "routes/docs/home", path: "docs", children: [] },
      { id: "routes/docs/page", path: "docs/*", children: [] },
      { id: "routes/docs/layout", path: undefined, children: ["docs/guides/"] }
    ])
  })

  it("reads helpers renamed or through a namespace, and constants declared in the file", async () => {
    const { routes, unread } = await read(`
      import * as r from "@react-router/dev/routes"
      import { route as page } from "@react-router/dev/routes"

      const settings = [page("profile", "routes/profile.tsx")]
      const routes = [r.index("routes/home.tsx"), r.route("settings", "routes/settings.tsx", settings)]

      export default routes
    `)

    expect(unread).toEqual([])
    expect(routes.map((route) => [route.id, route.children.map((child) => child.id)])).toEqual([
      ["routes/home", []],
      ["routes/settings", ["routes/profile"]]
    ])
  })

  it("takes flatRoutes' routes, from the folder its rootDirectory names, under a route or a prefix", async () => {
    const asked: string[] = []

    const flat = (rootDirectory: string) => {
      asked.push(rootDirectory)

      return Promise.resolve([
        { id: `${rootDirectory}/_index`, file: `${rootDirectory}/_index.tsx`, index: true, children: [] },
        {
          id: `${rootDirectory}/profile`,
          file: `${rootDirectory}/profile.tsx`,
          path: "profile",
          index: false,
          children: []
        }
      ])
    }

    const { routes } = await read(
      `
      import { flatRoutes } from "@react-router/fs-routes"
      import { prefix, route } from "@react-router/dev/routes"

      export default [
        route("settings", "layouts/settings.tsx", await flatRoutes({ rootDirectory: "settings" })),
        ...prefix("blog", await flatRoutes({ rootDirectory: "blog" })),
      ]
    `,
      flat
    )

    expect(asked).toEqual(["settings", "blog"])
    expect(routes[0]?.children.map((child) => [child.id, child.path, child.index])).toEqual([
      ["settings/_index", undefined, true],
      ["settings/profile", "profile", false]
    ])
    expect(routes.slice(1).map((route) => [route.id, route.path, route.index])).toEqual([
      ["blog/_index", "blog", true],
      ["blog/profile", "blog/profile", false]
    ])
  })

  it("reads flatRoutes() as the whole default export, from the routes folder", async () => {
    const asked: string[] = []

    const { routes } = await read(
      `
      import { flatRoutes } from "@react-router/fs-routes"
      import type { RouteConfig } from "@react-router/dev/routes"

      export default flatRoutes() satisfies RouteConfig
    `,
      (rootDirectory) => {
        asked.push(rootDirectory)

        return Promise.resolve([{ id: "routes/_index", file: "routes/_index.tsx", index: true, children: [] }])
      }
    )

    expect(asked).toEqual(["routes"])
    expect(routes.map((route) => route.id)).toEqual(["routes/_index"])
  })

  it("names what it can't read without running it, and keeps the rest", async () => {
    const { routes, unread } = await read(`
      import { remixRoutesOptionAdapter } from "@react-router/remix-routes-option-adapter"
      import { index } from "@react-router/dev/routes"
      import { extra } from "./extra"

      export default [
        index("routes/home.tsx"),
        ...extra,
        ...(await remixRoutesOptionAdapter((defineRoutes) => defineRoutes(() => {}))),
      ]
    `)

    expect(routes.map((route) => route.id)).toEqual(["routes/home"])
    expect(unread).toEqual([
      "app/routes.ts uses extra, which isn't declared in it",
      "app/routes.ts builds routes with remixRoutesOptionAdapter"
    ])
  })

  it("says when there's no default export", async () => {
    expect(await read(`export const routes = []`)).toEqual({
      routes: [],
      unread: ["app/routes.ts has no default export of routes"]
    })
  })
})
