import { describe, expect, it } from "vite-plus/test"
import { componentRole, describeEvidence, groupComponents, pageRoute } from "./grouping.ts"
import type { ComponentSource } from "./project.ts"

const own = (path: string, extra: Partial<ComponentSource> = {}): ComponentSource => ({
  path,
  export: "default",
  lazy: true,
  ...extra
})

describe("component roles", () => {
  it("lists the UI kit, the rest of the app, and pages apart", () => {
    expect(componentRole(own("src/components/ui/button.tsx", { lazy: undefined }))).toBe("kit")
    expect(componentRole(own("src/components/order-table.tsx"))).toBe("app")
    expect(componentRole({ path: "@acme/ui", export: "Button", library: "ui" })).toBeUndefined()
  })

  it("finds pages by their router's file names", () => {
    const pages = [
      "src/app/page.tsx",
      "src/app/(portal)/orders/[id]/page.tsx",
      "app/settings/layout.tsx",
      "src/app/not-found.tsx",
      "src/pages/orders/index.tsx",
      "app/routes/orders.$id.tsx",
      "src/routes/settings/profile.tsx"
    ]
    const notPages = [
      "src/app/(portal)/orders/order-table.tsx",
      "src/components/page.tsx",
      "src/pages/_app.tsx",
      "src/pages/api/orders.ts",
      "src/routes/__root.tsx",
      "src/routes/-page-route.tsx",
      "src/routes/orders/-components/row.tsx"
    ]
    expect(pages.filter((path) => componentRole(own(path)) !== "page")).toEqual([])
    expect(notPages.filter((path) => componentRole(own(path)) === "page")).toEqual([])
  })

  it("names a page by its route", () => {
    expect(pageRoute("src/app/page.tsx")).toBe("/")
    expect(pageRoute("src/app/(portal)/orders/[id]/page.tsx")).toBe("/(portal)/orders/[id]")
    expect(pageRoute("src/pages/orders/index.tsx")).toBe("/orders")
    expect(pageRoute("app/routes/orders.$id.tsx")).toBe("/orders.$id")
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

  it("groups pages by route", () => {
    const groups = groupComponents(
      [
        ["OrderPage", own("src/app/(portal)/orders/[id]/page.tsx")],
        ["(portal)/ErrorPage", own("src/app/(portal)/error.tsx")],
        ["HomePage", own("src/app/page.tsx")]
      ],
      "route"
    )
    expect(groups).toEqual([
      { name: "/", ids: ["HomePage"] },
      { name: "/(portal)", ids: ["(portal)/ErrorPage"] },
      { name: "/(portal)/orders/[id]", ids: ["OrderPage"] }
    ])
  })
})
