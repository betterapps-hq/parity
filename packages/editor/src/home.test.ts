import {
  type CanvasDocument,
  type ComponentSource,
  defaultModeSettings,
  type ModeSettings,
  parseCanvasDocument
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { homeComponent, homeScreen, openingDesigns } from "./home.ts"

const viteApp: Record<string, ComponentSource> = {
  Button: { path: "src/components/ui/button.tsx", export: "Button" },
  Card: { path: "src/components/Card.tsx", export: "Card", lazy: true, as: "function" },
  App: { path: "src/App.tsx", export: "App", lazy: true, as: "function" }
}

describe("the designs a project opens with", () => {
  it("puts a Home screen in the main file when the project has no file yet", () => {
    const designs = openingDesigns([], "shop.par", viteApp, defaultModeSettings)
    expect(designs).toHaveLength(1)
    expect(designs[0]?.path).toBe("shop.par")
    expect(designs[0]?.document.containers.map((design) => design.name)).toEqual(["Home"])
    expect(parseCanvasDocument(designs[0]!.document)).toEqual(designs[0]!.document)
  })

  it("opens a project's own files as they are, and none of them broken ones", () => {
    const document: CanvasDocument = { version: 3, containers: [] }

    const files = [
      { path: "shop.par", document },
      { path: "flows/broken.par", error: "Unexpected token" }
    ]

    expect(openingDesigns(files, "shop.par", viteApp, defaultModeSettings)).toEqual([{ path: "shop.par", document }])
  })

  it("adds no Home screen beside a file that couldn't be read, so it's never written over", () => {
    const files = [{ path: "shop.par", error: "Unexpected token" }]
    expect(openingDesigns(files, "shop.par", viteApp, defaultModeSettings)).toEqual([])
  })
})

describe("the Home screen", () => {
  it("draws the app's root component on a page, in desktop with mobile beside it", () => {
    const screen = homeScreen(viteApp, defaultModeSettings)
    expect(screen).toMatchObject({
      id: "home",
      name: "Home",
      kind: "screen",
      position: { x: 0, y: 0 },
      root: {
        type: "layout",
        name: "Page",
        style: { background: "background", foreground: "foreground" },
        children: [{ type: "component", component: "App" }]
      },
      states: [{ id: "default", name: "Default" }],
      view: { modes: ["mobile-light"] }
    })
    const [child] = screen.root.type === "layout" ? screen.root.children : []
    expect(child?.id).not.toBe(screen.root.id)
  })

  it("is a padded page headed Home when nothing renders the app's `/`", () => {
    const screen = homeScreen({ Button: viteApp.Button! }, defaultModeSettings)
    expect(screen.root).toMatchObject({
      style: { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
      children: [{ type: "text", tag: "h1", text: "Home", style: { size: "text-2xl", weight: 600 } }]
    })
  })

  it("shows the phone mode that shares the primary mode's theme", () => {
    const modes: ModeSettings = {
      ...defaultModeSettings,
      modes: [
        { id: "desktop-light", name: "Desktop Light", values: { viewport: "desktop", theme: "light" } },
        { id: "tablet-light", name: "Tablet Light", values: { viewport: "tablet", theme: "light" } },
        { id: "mobile-dark", name: "Mobile Dark", values: { viewport: "mobile", theme: "dark" } },
        { id: "mobile-light", name: "Mobile Light", values: { viewport: "mobile", theme: "light" } }
      ]
    }

    expect(homeScreen(viteApp, modes).view).toEqual({ modes: ["mobile-light"] })
  })

  it("shows a laptop's mode beside a primary mode on a phone", () => {
    const modes: ModeSettings = {
      ...defaultModeSettings,
      modes: [
        { id: "mobile-light", name: "Mobile Light", values: { viewport: "mobile", theme: "light" } },
        { id: "tablet-light", name: "Tablet Light", values: { viewport: "tablet", theme: "light" } },
        { id: "desktop-light", name: "Desktop Light", values: { viewport: "desktop", theme: "light" } }
      ]
    }

    expect(homeScreen(viteApp, modes).view).toEqual({ modes: ["desktop-light"] })
  })

  it("shows the primary mode alone when no other mode is on another kind of device", () => {
    const modes: ModeSettings = {
      ...defaultModeSettings,
      modes: [
        { id: "desktop-light", name: "Desktop Light", values: { viewport: "desktop", theme: "light" } },
        { id: "desktop-dark", name: "Desktop Dark", values: { viewport: "desktop", theme: "dark" } }
      ]
    }

    expect(homeScreen(viteApp, modes)).not.toHaveProperty("view")
  })
})

describe("what renders the app's `/`", () => {
  it("is the page for `/` by its router's file names, over App", () => {
    const next = {
      ...viteApp,
      RootLayout: { path: "src/app/layout.tsx", export: "default" },
      HomePage: { path: "src/app/page.tsx", export: "default" },
      OrdersPage: { path: "src/app/orders/page.tsx", export: "default" }
    }

    expect(homeComponent(next)).toBe("HomePage")
    expect(homeComponent({ ...viteApp, Index: { path: "src/pages/index.tsx", export: "default" } })).toBe("Index")
    expect(homeComponent({ ...viteApp, Home: { path: "src/routes/index.tsx", export: "Home" } })).toBe("Home")
  })

  it("finds Next's page for `/` inside a route group", () => {
    const grouped = { Landing: { path: "app/(marketing)/page.tsx", export: "default" } }
    expect(homeComponent(grouped)).toBe("Landing")
  })

  it("takes a route file's default export over its other parts", () => {
    const remix = {
      ErrorBoundary: { path: "app/routes/index.tsx", export: "ErrorBoundary" },
      Index: { path: "app/routes/index.tsx", export: "default" }
    }

    expect(homeComponent(remix)).toBe("Index")
  })

  it("is App, by its export or its file, the one nearest the root", () => {
    expect(homeComponent({ App: { path: "src/App.tsx", export: "default" } })).toBe("App")

    const two = {
      "admin/App": { path: "src/admin/App.tsx", export: "App" },
      App: { path: "src/App.tsx", export: "App" }
    }

    expect(homeComponent(two)).toBe("App")
  })

  it("is never a library's component", () => {
    expect(homeComponent({ App: { path: "@acme/ui", export: "App", library: "acme" } })).toBeUndefined()
  })

  it("is nothing when the app has neither", () => {
    expect(homeComponent({ Button: viteApp.Button! })).toBeUndefined()
  })
})
