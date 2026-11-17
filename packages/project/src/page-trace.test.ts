import { describe, expect, it } from "vite-plus/test"
import { type PageTraceInput, pageTraceFiles, routeChain } from "./page-trace.ts"

const routes = [
  { id: "__root__", file: "src/routes/__root.tsx" },
  { id: "/projects", file: "src/routes/projects.tsx", parent: "__root__" },
  { id: "/projects/$id", file: "src/routes/projects.$id.tsx", parent: "/projects" }
]

const project: PageTraceInput = {
  route: "/projects/$id",
  landed: true,
  routes,
  folderRoutes: false,
  loaded: undefined,
  scanned: ["src/data/projects.ts"],
  styles: ["src/styles.css"],
  shared: ["package.json", "pnpm-lock.yaml"],
  files: [
    "package.json",
    "pnpm-lock.yaml",
    "src/data/projects.ts",
    "src/other.ts",
    "src/routes/__root.tsx",
    "src/routes/projects.$id.tsx",
    "src/routes/projects.tsx",
    "src/styles.css"
  ]
}

describe("routeChain", () => {
  it("lists a route's file and its parents' files, its own first", () => {
    expect(routeChain("/projects/$id", routes)).toEqual([
      "src/routes/projects.$id.tsx",
      "src/routes/projects.tsx",
      "src/routes/__root.tsx"
    ])
  })

  it("is empty for a route that isn't known, and stops at a loop", () => {
    expect(routeChain("/gone", routes)).toEqual([])
    expect(
      routeChain("a", [
        { id: "a", file: "a.tsx", parent: "b" },
        { id: "b", file: "b.tsx", parent: "a" }
      ])
    ).toEqual(["a.tsx", "b.tsx"])
  })
})

describe("pageTraceFiles", () => {
  it("takes what the builder says the route's files load, with their scan, styles and shared files", () => {
    expect(pageTraceFiles({ ...project, loaded: ["src/components/card.tsx"] })).toEqual([
      "package.json",
      "pnpm-lock.yaml",
      "src/components/card.tsx",
      "src/data/projects.ts",
      "src/routes/__root.tsx",
      "src/routes/projects.$id.tsx",
      "src/routes/projects.tsx",
      "src/styles.css"
    ])
  })

  it("takes every file under the route's folder where routes are named by folder", () => {
    const next: PageTraceInput = {
      ...project,
      route: "/blog/[slug]",
      routes: [
        { id: "/", file: "app/layout.tsx" },
        { id: "/blog/[slug]", file: "app/blog/[slug]/page.tsx", parent: "/" }
      ],
      folderRoutes: true,
      scanned: [],
      files: [
        "app/blog/[slug]/page.tsx",
        "app/blog/[slug]/comments.tsx",
        "app/blog/[slug]/og/route.ts",
        "app/blog/index/page.tsx",
        "app/layout.tsx",
        "package.json",
        "pnpm-lock.yaml"
      ]
    }

    expect(pageTraceFiles(next)).toEqual([
      "app/blog/[slug]/comments.tsx",
      "app/blog/[slug]/og/route.ts",
      "app/blog/[slug]/page.tsx",
      "app/layout.tsx",
      "package.json",
      "pnpm-lock.yaml",
      "src/styles.css"
    ])
  })

  it("takes the whole project where the builder can't say, or the route isn't known", () => {
    expect(pageTraceFiles(project)).toEqual(project.files)
    expect(pageTraceFiles({ ...project, route: "/gone", loaded: [] })).toEqual(project.files)
  })

  it("takes the whole project for a page that redirected, or drew its not-found or error page", () => {
    expect(pageTraceFiles({ ...project, loaded: [], landed: false })).toEqual(project.files)
  })
})
