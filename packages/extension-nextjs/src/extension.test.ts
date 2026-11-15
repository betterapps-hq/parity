import type { Route } from "@parity-app/extension-api"
import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { isPage, routeOf } from "./extension.ts"

describe("the Next.js extension", () => {
  it("has a manifest Parity accepts, and gives its supported versions by its peer dependency", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers).toEqual({ router: {} })
    expect(found.manifest.permissions?.read).toEqual([
      "app/**",
      "pages/**",
      "src/app/**",
      "src/pages/**",
      "next.config.*"
    ])
    expect(found.versions).toEqual({ packages: ["next"], range: "^16.0.0" })
  })

  it("offers Open in browser only for routes", () => {
    const { menus } = readExtension(packageJson).manifest.contributes

    for (const items of Object.values(menus ?? {})) {
      expect(items).toEqual([{ command: "nextjs.open", when: "node.type == route" }])
    }
  })
})

describe("isPage", () => {
  const route: Route = {
    id: "app/blog/[slug]/page",
    kind: "page",
    segments: [{ type: "static", value: "blog" }],
    path: "/blog/[slug]",
    parent: "app/layout",
    file: "app/blog/[slug]/page.tsx",
    index: false,
    loads: false,
    guards: false
  }

  it("counts the pages the canvas draws", () => {
    expect(isPage(route)).toBe(true)
    expect(isPage({ ...route, id: "app/layout", kind: "root", parent: undefined })).toBe(false)
    expect(isPage({ ...route, kind: "layout" })).toBe(false)
  })

  it("leaves out a parallel route's pages and intercepting ones, which the canvas doesn't draw yet", () => {
    expect(isPage({ ...route, slot: "modal" })).toBe(false)
    expect(isPage({ ...route, intercepts: "app/photo/[id]/page" })).toBe(false)
  })
})

describe("routeOf", () => {
  const page = { owner: "nextjs", type: "route", key: "app/about/page" }

  it("opens the page it was run for", () => {
    expect(routeOf({ type: "route", key: "app/about/page" }, [])).toEqual(page)
  })

  it("opens the page selected when it's run from Search actions", () => {
    expect(routeOf(undefined, [{ owner: "design", type: "design", key: "app.par#home" }, page])).toEqual(page)
  })

  it("opens nothing for a component or a layer", () => {
    expect(routeOf({ type: "component", key: "Button" }, [page])).toBeUndefined()
  })
})
