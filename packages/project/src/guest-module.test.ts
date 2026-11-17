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

  it("imports the package that composes a tool's preview beside it, either of which may fail to load (PAR-98)", () => {
    const previewComposer = {
      api: "portable-stories",
      module: "@storybook/react-vite",
      extension: "storybook"
    } as const

    const made = guestModule({ ...config, preview: ".storybook/preview.ts", previewComposer }, options)

    const preview = made.imports.indexOf("/@root/.storybook/preview.ts")
    const composer = made.imports.indexOf("@storybook/react-vite")

    expect(made.optional.has("@storybook/react-vite")).toBe(true)
    expect(made.source).toContain(`    project: modules[${preview}],\n    composer: modules[${composer}]\n  },`)
  })
})
