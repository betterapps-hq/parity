import { describe, expect, it } from "vite-plus/test"
import { componentRole, describeEvidence, groupComponents, rendersRoot, routeFiles } from "./grouping.ts"
import type { ComponentSource } from "./project.ts"
import type { ProjectRoute } from "./routes.ts"

const own = (path: string, extra: Partial<ComponentSource> = {}): ComponentSource => ({
  path,
  export: "default",
  lazy: true,
  ...extra
})

/** A route as a router extension gives it, with what the tests don't care about filled in. */
const route = (route: Pick<ProjectRoute, "id" | "kind" | "path" | "file"> & Partial<ProjectRoute>): ProjectRoute => ({
  segments: [],
  index: false,
  loads: false,
  guards: false,
  ...route
})

/** An App Router app's routes, as the Next.js extension reads them. */
const routes = routeFiles([
  route({ id: "src/app/layout", kind: "root", path: "/", file: "src/app/layout.tsx" }),
  route({
    id: "src/app/page",
    kind: "page",
    path: "/",
    file: "src/app/page.tsx",
    parent: "src/app/layout",
    index: true
  }),
  route({
    id: "src/app/(portal)/layout",
    kind: "group",
    path: "/(portal)",
    file: "src/app/(portal)/layout.tsx",
    parent: "src/app/layout",
    stateFiles: { error: "src/app/(portal)/error.tsx" }
  }),
  route({
    id: "src/app/(portal)/orders/[id]/page",
    kind: "page",
    path: "/orders/[id]",
    segments: [
      { type: "static", value: "orders" },
      { type: "param", name: "id" }
    ],
    file: "src/app/(portal)/orders/[id]/page.tsx",
    parent: "src/app/(portal)/layout"
  })
])

describe("component roles", () => {
  it("lists the UI kit, the rest of the app, and pages apart", () => {
    expect(componentRole(own("src/components/ui/button.tsx", { lazy: undefined }))).toBe("kit")
    expect(componentRole(own("src/components/order-table.tsx"))).toBe("app")
    expect(componentRole({ path: "@acme/ui", export: "Button", library: "ui" })).toBeUndefined()
  })

  it("finds pages by their routes' files, state files among them, whatever the file's called", () => {
    const pages = [
      "src/app/page.tsx",
      "src/app/(portal)/orders/[id]/page.tsx",
      "src/app/layout.tsx",
      "src/app/(portal)/error.tsx"
    ]

    const notPages = [
      "src/app/(portal)/orders/order-table.tsx",
      "src/components/page.tsx",
      "src/pages/orders/index.tsx"
    ]

    expect(pages.filter((path) => componentRole(own(path), routes) !== "page")).toEqual([])
    expect(notPages.filter((path) => componentRole(own(path), routes) === "page")).toEqual([])
  })

  it("names no page without routes, as the CLI reads none", () => {
    expect(componentRole(own("src/app/page.tsx"))).toBe("app")
    expect(componentRole(own("src/routes/index.tsx", { lazy: undefined }))).toBe("kit")
  })

  it("knows the page for `/` from its route: a page at the root's URL, not its layout or a state file", () => {
    expect(rendersRoot(own("src/app/page.tsx"), routes)).toBe(true)
    expect(rendersRoot(own("src/app/layout.tsx"), routes)).toBe(false)
    expect(rendersRoot(own("src/app/(portal)/error.tsx"), routes)).toBe(false)
    expect(rendersRoot(own("src/app/(portal)/orders/[id]/page.tsx"), routes)).toBe(false)
  })

  it("knows the page for `/` when its file draws another route first, as a library-mode router's may", () => {
    const shared = routeFiles([
      route({
        id: "home",
        kind: "page",
        path: "/home",
        segments: [{ type: "static", value: "home" }],
        file: "src/pages/index.tsx"
      }),
      route({ id: "index", kind: "page", path: "/", file: "src/pages/index.tsx", index: true })
    ])

    expect(rendersRoot(own("src/pages/index.tsx"), shared)).toBe(true)
    expect(componentRole(own("src/pages/index.tsx"), shared)).toBe("page")
  })

  it("leaves a parallel route's slot at `/` out of the page for `/`", () => {
    const slotted = routeFiles([
      route({ id: "analytics", kind: "page", path: "/", file: "app/@analytics/page.tsx", slot: "analytics" }),
      route({ id: "home", kind: "page", path: "/", file: "app/(site)/page.tsx" })
    ])

    expect(rendersRoot(own("app/@analytics/page.tsx"), slotted)).toBe(false)
    expect(rendersRoot(own("app/(site)/page.tsx"), slotted)).toBe(true)
  })

  it("knows the page for `/` by the component its route names, not another its file exports", () => {
    const named = routeFiles([
      route({ id: "home", kind: "page", path: "/", file: "src/screens/Home.tsx", component: "Home" })
    ])

    expect(rendersRoot({ path: "src/screens/Home.tsx", export: "Home" }, named)).toBe(true)
    expect(rendersRoot({ path: "src/screens/Home.tsx", export: "default" }, named)).toBe(true)
    expect(rendersRoot({ path: "src/screens/Home.tsx", export: "ErrorBoundary" }, named)).toBe(false)
  })

  it("says in words why a component counts as one", () => {
    expect(describeEvidence("memo")).toBe("made with memo")
    expect(describeEvidence("exotic")).toMatch(/component object/)
  })
})

describe("grouping components", () => {
  it("groups by file, as shadcn's families", () => {
    const groups = groupComponents(
      [
        ["CardHeader", own("src/components/ui/card.tsx")],
        ["Button", own("src/components/ui/button.tsx")],
        ["Card", own("src/components/ui/card.tsx")]
      ],
      "file"
    )

    expect(groups).toEqual([
      { name: "button", ids: ["Button"] },
      { name: "card", ids: ["CardHeader", "Card"] }
    ])
  })

  it("groups by folder, less the folders they all share, keeping a file's components together", () => {
    const groups = groupComponents(
      [
        ["OrderTable", own("src/app/(portal)/orders/order-table.tsx")],
        ["StatCard", own("src/components/stat-card.tsx")],
        ["Overview", own("src/components/overview.tsx")],
        ["OverviewChart", own("src/components/overview.tsx")],
        ["Row", own("src/components/list/row.tsx")]
      ],
      "folder"
    )

    expect(groups).toEqual([
      { name: "app/(portal)/orders", ids: ["OrderTable"] },
      { name: "components", ids: ["Overview", "OverviewChart", "StatCard"] },
      { name: "components/list", ids: ["Row"] }
    ])
  })

  it("groups pages by their routes' paths, as their routers write them", () => {
    const groups = groupComponents(
      [
        ["OrderPage", own("src/app/(portal)/orders/[id]/page.tsx")],
        ["(portal)/ErrorPage", own("src/app/(portal)/error.tsx")],
        ["HomePage", own("src/app/page.tsx")]
      ],
      "route",
      routes
    )

    expect(groups).toEqual([
      { name: "/", ids: ["HomePage"] },
      { name: "/(portal)", ids: ["(portal)/ErrorPage"] },
      { name: "/orders/[id]", ids: ["OrderPage"] }
    ])
  })
})
