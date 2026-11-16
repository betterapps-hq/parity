import type { ProjectConfig } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { guestModule, type GuestModuleOptions } from "./guest-module.ts"

const config: ProjectConfig = { components: {}, styles: [], documents: [], libraries: [] }
const options: GuestModuleOptions = { renderer: "renderer", projectPath: (path) => `/@root/${path}`, styles: "inline" }

describe("the guest module with the project's preview file (PAR-100)", () => {
  it("imports the file and gives it to the guest with the decorators, as an error if it fails to load", () => {
    const made = guestModule({ ...config, preview: ".parity/preview.tsx" }, options)
    const index = made.imports.indexOf("/@root/.parity/preview.tsx")

    expect(index).toBeGreaterThan(-1)
    expect(made.optional.has("/@root/.parity/preview.tsx")).toBe(true)
    expect(made.source).toContain(`    project: modules[${index}]\n  },`)
  })

  it("gives the guest no preview when the project has none", () => {
    const made = guestModule(config, options)

    expect(made.imports).toEqual(["renderer"])
    expect(made.source).not.toContain("project:")
  })
})

describe("the guest module with a router's page decorators (PAR-1205)", () => {
  const routeTree = { $import: "./src/routeTree.gen.ts", export: "routeTree" }

  const decorator = {
    wrap: {
      import: "@tanstack/react-router",
      component: "RouterProvider",
      props: { router: { $call: { import: "@tanstack/react-router", export: "createRouter" }, args: [{ routeTree }] } }
    }
  }

  const paged: ProjectConfig = {
    ...config,
    pageDecorators: [{ extension: "tanstack-router", decorator }],
    pageLoadHides: ["__TSR_ROUTER__"]
  }

  it("loads their modules when a page is first drawn, a project file by its path from the root", () => {
    const made = guestModule(paged, options)

    expect(made.imports).toEqual(["renderer"])
    expect(made.source).toContain(`      list: ${JSON.stringify([{ library: "tanstack-router", decorator }])},`)
    expect(made.source).toContain(`"./src/routeTree.gen.ts": () => import("/@root/src/routeTree.gen.ts").catch(`)
    expect(made.source).toContain(`"@tanstack/react-router": () => import("@tanstack/react-router").catch(`)
    expect(made.source).toContain(`      hides: ["__TSR_ROUTER__"]`)
  })

  it("gives the guest no pages without them", () => {
    expect(guestModule(config, options).source).not.toContain("pages:")
  })
})
