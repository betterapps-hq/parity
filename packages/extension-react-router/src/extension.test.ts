import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { isPage, routeOf, statusOf } from "./extension.ts"

describe("the React Router extension", () => {
  it("has a manifest Parity accepts, and gives its supported versions by its peer dependency", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers).toEqual({ router: {} })
    expect(found.manifest.contributes.nodeTypes?.map((type) => type.id)).toEqual(["route"])
    expect(found.manifest.permissions?.read).toEqual(["**"])
    expect(found.versions).toEqual({ packages: ["react-router"], range: "^7.0.0 || ^8.0.0" })
  })

  it("offers Open in browser only for routes", () => {
    const { menus } = readExtension(packageJson).manifest.contributes

    for (const items of Object.values(menus ?? {})) {
      expect(items).toEqual([{ command: "react-router.open", when: "node.type == route" }])
    }
  })
})

const route = { file: "app/routes/x.tsx", params: [], index: false, loads: false, guards: false }

describe("isPage", () => {
  it("counts every route but framework mode's root, which only holds the others", () => {
    expect(isPage({ ...route, id: "root", path: "/" })).toBe(false)
    expect(isPage({ ...route, id: "routes/project", path: "/projects/:projectId", parent: "root" })).toBe(true)
  })

  it("counts library mode's routes at the top, which have no parent", () => {
    expect(isPage({ ...route, id: "0", path: "/" })).toBe(true)
  })
})

describe("statusOf", () => {
  const routes = [
    { ...route, id: "root", path: "/" },
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
