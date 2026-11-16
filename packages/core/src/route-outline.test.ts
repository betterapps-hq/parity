import { describe, expect, it } from "vite-plus/test"
import { type RouteOutlineItem, routeOutline } from "./route-outline.ts"
import type { RouteSegment } from "./routes.ts"

/** A route from its path in Next.js's syntax, its segments read as its extension reads them. */
function route(path: string, id = path) {
  const segments = path
    .split("/")
    .filter((part) => part !== "")
    .map((part): RouteSegment => {
      const optional = /^\[\[\.\.\.(.+)\]\]$/.exec(part)?.[1]
      const rest = /^\[\.\.\.(.+)\]$/.exec(part)?.[1]
      const param = /^\[(.+)\]$/.exec(part)?.[1]

      if (optional) {
        return { type: "optionalCatchAll", name: optional }
      }

      if (rest) {
        return { type: "catchAll", name: rest }
      }

      return param ? { type: "param", name: param } : { type: "static", value: part }
    })

  return { id, path, segments }
}

/**
 * An outline as its labels, a folder's ending in a slash and a route's followed by its id where it isn't its path, and
 * what each holds.
 */
type Listing = string | [string, Listing[]]

function listed(items: RouteOutlineItem[]): Listing[] {
  return items.map((item) => {
    let name = `${item.label}/`

    if (item.route) {
      name = item.route.id === item.route.path ? item.label : `${item.label} (${item.route.id})`
    }

    return item.items.length === 0 ? name : [name, listed(item.items)]
  })
}

describe("routeOutline (PAR-1185)", () => {
  it("nests routes under folders for the URL parts they share, a route that starts another's holding it", () => {
    const outline = routeOutline(
      ["/api/users/[id]", "/api/users", "/api/posts", "/api/posts/[id]/likes", "/feed.xml"].map((path) => route(path))
    )

    expect(listed(outline)).toEqual([
      [
        "/api/",
        [
          ["posts", ["[id]/likes"]],
          ["users", ["[id]"]]
        ]
      ],
      "/feed.xml"
    ])
  })

  it("folds a folder that would hold one thing into it", () => {
    expect(listed(routeOutline([route("/api/v1/users/[id]")]))).toEqual(["/api/v1/users/[id]"])
    expect(listed(routeOutline([route("/api/v1/users"), route("/api/v1/users/[id]")]))).toEqual([
      ["/api/v1/users", ["[id]"]]
    ])
    expect(listed(routeOutline([route("/api/v1/users"), route("/api/v1/teams")]))).toEqual([
      ["/api/v1/", ["teams", "users"]]
    ])
  })

  it("keeps a folder for a param that routes share, and writes it as the router does", () => {
    expect(listed(routeOutline([route("/users/[id]/posts"), route("/users/[id]/likes")]))).toEqual([
      ["/users/[id]/", ["likes", "posts"]]
    ])

    const tanstack = [
      {
        id: "a",
        path: "/files/$",
        segments: [
          { type: "static", value: "files" },
          { type: "catchAll", name: "_splat" }
        ]
      },
      { id: "b", path: "/files", segments: [{ type: "static", value: "files" }] }
    ] satisfies { id: string; path: string; segments: RouteSegment[] }[]

    expect(listed(routeOutline(tanstack))).toEqual([["/files (b)", ["$ (a)"]]])
  })

  it("lists two routes at one URL as two items", () => {
    expect(listed(routeOutline([route("/api/hello", "app"), route("/api/hello", "pages")]))).toEqual([
      "/api/hello (app)",
      "/api/hello (pages)"
    ])
  })

  it("keys items by their URL parts, the same each time, so an item stays open or closed", () => {
    const [api] = routeOutline([route("/api/users"), route("/api/posts")])

    expect(api?.key).toBe("static:api")
    expect(api?.items.map((item) => item.key)).toEqual(["static:api/static:posts", "static:api/static:users"])
    expect(routeOutline([route("/api/posts"), route("/api/users")])[0]?.key).toBe("static:api")
  })

  it("writes URL parts from their segments where a path doesn't write one part for each", () => {
    const odd = {
      id: "odd",
      path: "/odd",
      segments: [
        { type: "static", value: "a" },
        { type: "param", name: "id" }
      ]
    } satisfies { id: string; path: string; segments: RouteSegment[] }

    expect(listed(routeOutline([odd]))).toEqual(["/a/:id (odd)"])
  })

  it("lists a route with no URL parts at the top by its path, and nothing for no routes", () => {
    expect(listed(routeOutline([{ id: "root", path: "/", segments: [] }]))).toEqual(["/ (root)"])
    expect(routeOutline([])).toEqual([])
  })
})
