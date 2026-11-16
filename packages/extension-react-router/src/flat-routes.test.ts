import { describe, expect, it } from "vite-plus/test"
import type { ConfigRoute } from "./config.ts"
import { flatRoutes, routeSegments } from "./flat-routes.ts"

/** Files straight in the routes folder, by name. */
function filesNamed(...names: string[]) {
  return names.map((name) => ({ name, folder: false }))
}

/** Each route as `id path` with its children indented, to compare trees at a glance. */
function outline(routes: ConfigRoute[], depth = 0): string[] {
  return routes.flatMap((route) => [
    `${"  ".repeat(depth)}${route.id}${route.index ? " (index)" : ""}${route.path === undefined ? "" : ` ${route.path}`}`,
    ...outline(route.children, depth + 1)
  ])
}

describe("routeSegments", () => {
  it("splits at dots and slashes, turning $param, ($optional) and a lone $ into React Router's path", () => {
    expect(routeSegments("concerts.$city")).toEqual([
      ["concerts", ":city"],
      ["concerts", "$city"]
    ])
    expect(routeSegments("($lang).about")).toEqual([
      [":lang?", "about"],
      ["($lang)", "about"]
    ])
    expect(routeSegments("(beta).features")).toEqual([
      ["beta?", "features"],
      ["(beta)", "features"]
    ])
    expect(routeSegments("files.$")).toEqual([
      ["files", "*"],
      ["files", "$"]
    ])
  })

  it("keeps what's in brackets as it's written, dots included", () => {
    expect(routeSegments("sitemap[.]xml")).toEqual([["sitemap.xml"], ["sitemap[.]xml"]])
    expect(routeSegments("[_]private")).toEqual([["_private"], ["[_]private"]])
  })
})

describe("flatRoutes", () => {
  it("nests by dots, takes the parent's path off each child's, and leaves _layouts and _index without a path", () => {
    const routes = flatRoutes(
      filesNamed(
        "_index.tsx",
        "about.tsx",
        "concerts.tsx",
        "concerts.$city.tsx",
        "concerts._index.tsx",
        "concerts.trending.tsx",
        "_auth.tsx",
        "_auth.login.tsx",
        "_auth.register.tsx"
      ),
      "routes"
    )

    // Longest ids first, as React Router orders them.
    expect(outline(routes)).toEqual([
      "routes/concerts concerts",
      "  routes/concerts.trending trending",
      "  routes/concerts._index (index)",
      "  routes/concerts.$city :city",
      "routes/_index (index)",
      "routes/about about",
      "routes/_auth",
      "  routes/_auth.register register",
      "  routes/_auth.login login"
    ])
  })

  it("leaves a parent's layout with a trailing underscore", () => {
    const routes = flatRoutes(filesNamed("concerts.tsx", "concerts.$city.tsx", "concerts_.mine.tsx"), "routes")

    expect(outline(routes)).toEqual([
      "routes/concerts_.mine concerts/mine",
      "routes/concerts concerts",
      "  routes/concerts.$city :city"
    ])
  })

  it("reads optional segments and splats", () => {
    const routes = flatRoutes(filesNamed("($lang).about.tsx", "files.$.tsx", "$.tsx"), "routes")

    expect(outline(routes)).toEqual(["routes/($lang).about :lang?/about", "routes/files.$ files/*", "routes/$ *"])
  })

  it("takes a folder's route or index module, named for the folder, and leaves out other files and hidden ones", () => {
    const routes = flatRoutes(
      [
        { name: "app.projects", folder: true, files: ["route.tsx", "project-card.tsx"] },
        { name: "app.settings", folder: true, files: ["index.ts"] },
        { name: "app.empty", folder: true, files: ["helpers.ts"] },
        { name: ".DS_Store", folder: false },
        { name: "styles.css", folder: false },
        { name: "app.tsx", folder: false }
      ],
      "routes"
    )

    expect(routes).toEqual([
      {
        id: "routes/app",
        file: "routes/app.tsx",
        path: "app",
        index: false,
        children: [
          {
            id: "routes/app.projects",
            file: "routes/app.projects/route.tsx",
            path: "projects",
            index: false,
            children: []
          },
          {
            id: "routes/app.settings",
            file: "routes/app.settings/index.ts",
            path: "settings",
            index: false,
            children: []
          }
        ]
      }
    ])
  })
})
