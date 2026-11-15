import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { isPage, routeOf } from "./extension.ts"

describe("the TanStack Router extension", () => {
  it("has a manifest Parity accepts, and gives its supported versions by its peer dependency", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers).toEqual({ router: {} })
    expect(found.manifest.contributes.nodeTypes?.map((type) => type.id)).toEqual(["route"])
    expect(found.versions).toEqual({ packages: ["@tanstack/react-router"], range: "^1.0.0" })
  })

  it("offers Open in browser only for routes", () => {
    const { menus } = readExtension(packageJson).manifest.contributes

    for (const items of Object.values(menus ?? {})) {
      expect(items).toEqual([{ command: "tanstack-router.open", when: "node.type == route" }])
    }
  })
})

describe("isPage", () => {
  const route = { file: "src/routes/x.tsx", index: false, loads: false, guards: false }

  it("counts every route but the root, which only holds the others", () => {
    expect(isPage({ ...route, id: "__root__", kind: "root", segments: [], path: "/" })).toBe(false)

    expect(
      isPage({
        ...route,
        id: "/projects/$projectId",
        kind: "page",
        segments: [
          { type: "static", value: "projects" },
          { type: "param", name: "projectId" }
        ],
        path: "/projects/$projectId",
        parent: "__root__"
      })
    ).toBe(true)
  })
})

describe("routeOf", () => {
  const page = { owner: "tanstack-router", type: "route", key: "/settings" }

  it("opens the page it was run for", () => {
    expect(routeOf({ type: "route", key: "/settings" }, [])).toEqual(page)
  })

  it("opens the page selected when it's run from Search actions", () => {
    expect(routeOf(undefined, [{ owner: "design", type: "design", key: "app.par#home" }, page])).toEqual(page)
  })

  it("opens nothing for a component or a layer", () => {
    expect(routeOf({ type: "component", key: "Button" }, [page])).toBeUndefined()
  })
})
