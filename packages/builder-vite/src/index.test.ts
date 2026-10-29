import { describe, expect, it } from "vitest"
import { guestModuleSource } from "./index.ts"

describe("guestModuleSource", () => {
  it("imports the renderer, styles and components in order", () => {
    const source = guestModuleSource({
      styles: ["src/index.css"],
      components: { Button: { path: "./src/components/ui/button.tsx", export: "Button" } },
      documents: [],
      libraries: []
    })
    expect(source).toContain(
      'Promise.all([import("virtual:canvas/renderer"), import("/src/index.css?inline"), import("/src/components/ui/button.tsx").catch('
    )
    expect(source).toContain('css: [modules[1].default].join("\\n")')
    expect(source).toContain('"Button": modules[2].loadError ? failed(modules[2].loadError) : modules[2]["Button"]')
  })

  it("keeps a project module that fails to load to its own components", async () => {
    const source = guestModuleSource({
      styles: [],
      components: {
        Broken: { path: "src/broken.tsx", export: "default" },
        Fine: { path: "src/fine.tsx", export: "Fine" }
      },
      documents: [],
      libraries: []
    })
    const modules: Record<string, unknown> = {
      "virtual:canvas/renderer": { createGuest: (init: unknown) => init },
      "/src/fine.tsx": { Fine: "fine" }
    }
    // Runs the module with `load` standing in for the dev server, which fails on the broken file as on a syntax error.
    const body = source.replace("export default ", "return ").replaceAll("import(", "load(")
    const run = new Function("load", `return (async () => { ${body} })()`) as (
      load: (id: string) => Promise<unknown>
    ) => Promise<{ components: Record<string, unknown> }>
    const guest = await run(async (id) => {
      if (id in modules) return modules[id]
      throw new Error(`Failed to parse ${id}`)
    })
    expect(guest.components.Fine).toBe("fine")
    expect(() => (guest.components.Broken as () => unknown)()).toThrow(
      "its module didn't load: Failed to parse /src/broken.tsx"
    )
  })

  it("loads the rest of the app's components when they're first drawn", () => {
    const source = guestModuleSource({
      styles: [],
      components: { OrdersPage: { path: "src/app/orders/page.tsx", export: "default", lazy: true } },
      documents: [],
      libraries: []
    })
    expect(source).not.toContain('import("/src/app/orders/page.tsx").catch(')
    expect(source).toContain(
      '"OrdersPage": () => import("/src/app/orders/page.tsx").then((module) => module["default"], (error) => failed('
    )
  })

  it("imports a workspace package by its name, keeping a failed load to its own components", () => {
    const source = guestModuleSource({
      styles: [],
      components: { "ui/Button": { path: "@acme/ui", export: "Button", library: "ui" } },
      documents: [],
      libraries: [
        {
          id: "ui",
          name: "@acme/ui",
          package: "@acme/ui",
          importName: "@acme/ui",
          stylesImported: true,
          workspace: "../../packages/ui"
        }
      ]
    })
    expect(source).toContain('import("@acme/ui").catch(')
    expect(source).toContain('"ui/Button": modules[1].loadError ? failed(modules[1].loadError) : modules[1]["Button"]')
  })
})

describe("guestModuleSource with libraries", () => {
  it("imports icon renderers and decorator modules, loading the decorators' optionally", () => {
    const source = guestModuleSource({
      styles: [],
      components: { "baseui/Dialog.Root": { path: "@base-ui/react", export: "Dialog.Root", library: "baseui" } },
      documents: [],
      libraries: [
        {
          id: "hugeicons",
          name: "Hugeicons",
          kind: "icons",
          package: "@hugeicons/core-free-icons",
          importName: "@hugeicons/core-free-icons",
          stylesImported: true,
          icons: { render: { import: "@hugeicons/react", component: "HugeiconsIcon", prop: "icon" }, match: "Icon$" }
        },
        {
          id: "mui",
          name: "Material UI",
          package: "@mui/material",
          importName: "@mui/material",
          stylesImported: true,
          decorators: [{ wrap: { import: "@mui/material/styles", component: "ThemeProvider" } }]
        }
      ]
    })
    expect(source).toContain('"baseui/Dialog.Root": modules[1]["Dialog"]?.["Root"]')
    expect(source).toContain('renderer: { component: modules[3]["HugeiconsIcon"], prop: "icon" }')
    expect(source).toContain('import("@mui/material/styles").catch(')
    expect(source).toContain('"@mui/material/styles": modules[4]')
  })
})

describe("guestModuleSource with values a package makes", () => {
  it("loads the modules its components' samples call, for the guest to make them", () => {
    const source = guestModuleSource({
      styles: [],
      components: {
        "chakra/TreeView.Root": {
          path: "@chakra-ui/react",
          export: "TreeView.Root",
          library: "chakra",
          sample: {
            props: {
              collection: {
                $call: { import: "@chakra-ui/react/collection", export: "createTreeCollection" },
                args: [{}]
              }
            }
          }
        }
      },
      documents: [],
      libraries: []
    })
    expect(source).toContain('import("@chakra-ui/react/collection")')
    expect(source).toMatch(/modules: \{ "@chakra-ui\/react\/collection": modules\[\d+\] \}/)
  })
})

describe("guestModuleSource with package stylesheets", () => {
  it("draws them before the project's styles, apart, so they aren't read for tokens", () => {
    const source = guestModuleSource({
      styles: ["src/index.css"],
      packageStyles: ["@mantine/core/styles.css"],
      components: {},
      documents: [],
      libraries: []
    })
    expect(source).toContain('import("@mantine/core/styles.css?inline")')
    expect(source).toContain("  css: [modules[2].default].join")
    expect(source).toContain("  packageCss: [modules[1].default].join")
  })
})
