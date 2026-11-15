import type { ProjectConfig } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { componentModuleSource, guestModuleSource } from "./browser-modules.ts"
import { guestEntrySource, loadablePaths } from "./guest-entry.ts"
import { watchIgnored } from "./session.ts"

const config: ProjectConfig = {
  components: {
    Button: { path: "./src/button.tsx", export: "Button" },
    Card: { path: "src/card.tsx", export: "Card", lazy: true },
    Icon: { path: "fake-ui", export: "Icon", library: "fake-ui" }
  },
  styles: ["src/index.css"],
  documents: [],
  libraries: []
}

const options = { root: "/app", renderer: "/parity/renderer/guest.js", key: "parity_guest_4000" }

describe("guestEntrySource", () => {
  const source = guestEntrySource(config, options)

  it("imports the renderer and the project's files by absolute path, and no stylesheets", () => {
    expect(source).toContain('import("/parity/renderer/guest.js")')
    expect(source).toContain('import("/app/src/button.tsx")')
    expect(source).toContain('import("fake-ui")')
    expect(source).not.toContain("index.css")
  })

  it("gives what makes the guest, for the guest module to make it with the extracted CSS", () => {
    expect(source).toContain("export async function guestParts() {")
    expect(source).toContain("    libraryCss: ")
    expect(source).toContain("    createGuest: modules[0].createGuest")
  })

  it("accepts hot updates for the modules it imports and for itself, and registers its loaders", () => {
    expect(source).toContain(
      'import.meta.webpackHot.accept(["/parity/renderer/guest.js", "/app/src/button.tsx", "fake-ui", "/app/src/card.tsx"], () => {})'
    )
    expect(source).toContain("import.meta.webpackHot.accept()")
    expect(source).toContain('"src/button.tsx": () => import("/app/src/button.tsx")')
    expect(source).toContain('globalThis.__parityGuests["parity_guest_4000"] = ')
  })

  it("can load a component found since the guest loaded", () => {
    expect(guestEntrySource(config, { ...options, extra: ["./src/new.tsx"] })).toContain(
      '"src/new.tsx": () => import("/app/src/new.tsx")'
    )
  })
})

describe("loadablePaths", () => {
  it("lists the project's own component files once each, without libraries'", () => {
    expect(loadablePaths(config, ["src/button.tsx"])).toEqual(["src/button.tsx", "src/card.tsx"])
  })
})

describe("guestModuleSource", () => {
  it("loads the runtime and the entry once per page, and makes a guest with the extracted CSS", () => {
    const source = guestModuleSource("parity_guest_4000")

    expect(source).toContain('globalThis.__parityBundles["parity_guest_4000"] ??= load("runtime.js")')
    expect(source).toContain('text("styles.css"), text("package-styles.css"), text("component-styles.css")')
    expect(source).toContain("export default createGuest({")
  })
})

describe("componentModuleSource", () => {
  it("exports a component module's names from its module as the latest build wrote it", () => {
    const source = componentModuleSource("parity_guest_4000", "src/button.tsx", ["Button", "default", "Button"])

    expect(source).toBe(
      [
        'const module = await globalThis.__parityGuests["parity_guest_4000"].load("src/button.tsx")',
        'const export0 = module["Button"]\nexport { export0 as "Button" }',
        "export default module.default",
        ""
      ].join("\n")
    )
  })
})

describe("watchIgnored", () => {
  it("leaves out Git's folder and packages, but watches the guest's entry in the builder's cache folder", () => {
    expect(watchIgnored.test("/app/node_modules/react/index.js")).toBe(true)
    expect(watchIgnored.test(String.raw`C:\app\.git\HEAD`)).toBe(true)
    expect(watchIgnored.test("/app/node_modules/.cache/parity-rspack/out/main.js")).toBe(true)
    expect(watchIgnored.test("/app/node_modules/.cache/parity-rspack/guest-entry.js")).toBe(false)
    expect(watchIgnored.test(String.raw`C:\app\node_modules\.cache\parity-rsbuild\guest-entry.js`)).toBe(false)
    expect(watchIgnored.test("/app/src/button.tsx")).toBe(false)
  })
})
