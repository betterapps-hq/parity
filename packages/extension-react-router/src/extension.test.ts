import type { Route } from "@parity-app/extension"
import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { isPage, routeOf, statusOf } from "./extension.ts"

describe("the React Router extension", () => {
  it("has a manifest Parity accepts, and gives its supported versions by its peer dependency", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    // A router around every frame, so components with a link draw on their own (PAR-1152).
    expect(found.manifest.contributes.providers?.router?.decorators?.map(({ wrap }) => wrap.component)).toEqual([
      "MemoryRouter"
    ])
    expect(found.manifest.contributes.nodeTypes?.map((type) => type.id)).toEqual(["route"])
    expect(found.manifest.permissions?.read).toEqual(["**"])
    // `react-router-dom` stops at 7: React Router 8 has none (PAR-1299).
    expect(found.versions).toEqual({
      packages: ["react-router", "react-router-dom"],
      range: "^7.0.0 || ^8.0.0",
      ranges: { "react-router-dom": "^7.0.0" }
    })
  })

  it("offers Open in browser only for routes", () => {
    const { menus } = readExtension(packageJson).manifest.contributes

    for (const items of Object.values(menus ?? {})) {
      expect(items).toEqual([{ command: "react-router.open", when: "node.type == route" }])
    }
  })
})

const route: Omit<Route, "id" | "path"> = {
  kind: "page",
  segments: [],
  file: "app/routes/x.tsx",
  index: false,
  loads: false,
  guards: false
}

describe("isPage", () => {
  it("counts every route but the root, which only holds the others, and an API route, which draws nothing", () => {
    expect(isPage({ ...route, kind: "root", id: "root", path: "/" })).toBe(false)
    expect(isPage({ ...route, kind: "api", id: "routes/report", path: "/report", parent: "root" })).toBe(false)
    expect(isPage({ ...route, kind: "group", id: "settings/_secure", path: "/settings", parent: "root" })).toBe(true)
    expect(isPage({ ...route, id: "routes/project", path: "/projects/:projectId", parent: "root" })).toBe(true)
  })
})

describe("statusOf", () => {
  const routes: Route[] = [
    { ...route, kind: "root", id: "root", path: "/" },
    { ...route, id: "routes/home", path: "/", parent: "root", index: true }
  ]

  it("counts the pages, without the root", () => {
    expect(statusOf({ routes, mode: "framework", unread: [] })).toEqual({
      value: "1 route",
      tooltip: "Click to show them"
    })
  })

  it("names what couldn't be read", () => {
    expect(statusOf({ routes, mode: "framework", unread: ["app/routes.ts builds routes with load()"] }).tooltip).toBe(
      "Some routes aren't supported yet: app/routes.ts builds routes with load()"
    )
  })

  it("says routes made while the app runs aren't supported yet", () => {
    expect(statusOf({ routes: [], mode: "none", unread: [] })).toEqual({
      value: "0 routes",
      tooltip: "Routes made while the app runs aren't supported yet. Declare them in app/routes.ts or a route array."
    })
  })
})

describe("routeOf", () => {
  const page = { owner: "react-router", type: "route", key: "routes/pricing" }

  it("opens the page it was run for", () => {
    expect(routeOf({ type: "route", key: "routes/pricing" }, [])).toEqual(page)
  })

  it("opens the page selected when it's run from Search actions", () => {
    expect(routeOf(undefined, [{ owner: "design", type: "design", key: "app.par#home" }, page])).toEqual(page)
  })

  it("opens nothing for a component or a layer", () => {
    expect(routeOf({ type: "component", key: "Button" }, [page])).toBeUndefined()
  })
})
