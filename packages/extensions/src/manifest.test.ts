import type { JsonValue, Manifest } from "@parity-app/extension-api"
import { describe, expect, it } from "vite-plus/test"
import { readExtension } from "./manifest.ts"

const icon = { viewBox: "0 0 24 24", path: "M12 2L2 22h20z" }

/** What the manifest contributes unless a test changes it. */
const contributes = {
  commands: [{ id: "timings.measure", title: "Measure route timings", icon: "timer" }],
  menus: { layers: [{ command: "timings.measure" }], search: [{ command: "timings.measure" }] },
  tabs: [{ id: "timings.table", area: "right", title: "Timings", icon: "timer", view: "table" }],
  settings: { "timings.runs": { type: "number", default: 3, scope: "project", title: "Runs per route" } }
}

/** A package.json with a manifest, and whatever a test changes in it. */
function packageJson(parity: Partial<Manifest> | Record<string, JsonValue> = {}) {
  return {
    name: "parity-route-timings",
    version: "1.0.0",
    main: "dist/extension.js",
    engines: { parity: "^1.0.0" },
    parity: {
      displayName: "Route timings",
      prefix: "timings",
      icon,
      activates: ["onDetect", "onCommand:timings.measure"],
      contributes,
      ...parity
    }
  }
}

describe("readExtension", () => {
  it("reads the package's id, version, entry module, engine and manifest", () => {
    const found = readExtension(packageJson())

    expect(found).toMatchObject({ id: "parity-route-timings", version: "1.0.0", main: "dist/extension.js" })
    expect(found.engine).toBe("^1.0.0")
    expect(found.manifest.contributes.commands?.[0]?.title).toBe("Measure route timings")
  })

  it("refuses a package without a manifest", () => {
    const { parity: _, ...plain } = packageJson()

    expect(() => readExtension(plain)).toThrow("/parity:")
  })

  it("refuses a command whose id doesn't start with the prefix", () => {
    const contributes = { commands: [{ id: "measure", title: "Measure" }] }

    expect(() => readExtension(packageJson({ activates: ["onDetect"], contributes }))).toThrow(
      '/parity/contributes/commands/0/id: must start with "timings."'
    )
  })

  it("refuses a setting, tab or status item named outside the prefix", () => {
    const settings = { runs: { type: "number", scope: "project", title: "Runs" } }

    expect(() => readExtension(packageJson({ activates: [], contributes: { settings } }))).toThrow(
      "/parity/contributes/settings/runs"
    )
    expect(() =>
      readExtension(packageJson({ activates: [], contributes: { statusItems: [{ id: "other.count", title: "N" }] } }))
    ).toThrow("/parity/contributes/statusItems/0/id")
  })

  it("refuses a menu, key or activation event naming a command it doesn't declare", () => {
    const menus = { layers: [{ command: "timings.missing" }] }

    expect(() => readExtension(packageJson({ contributes: { ...contributes, menus } }))).toThrow(
      "names a command the manifest doesn't declare: timings.missing"
    )
    expect(() => readExtension(packageJson({ activates: ["onCommand:timings.other"] }))).toThrow("/parity/activates/0")
    expect(() => readExtension(packageJson({ activates: ["onView:timings.nothing"] }))).toThrow(
      "names a tab or page the manifest doesn't declare"
    )
  })

  it("refuses a context key outside the prefix", () => {
    const menus = { layers: [{ command: "timings.measure", enablement: "storybook.hasStories" }] }

    expect(() => readExtension(packageJson({ contributes: { ...contributes, menus } }))).toThrow(
      "/parity/contributes/menus/layers/0/enablement"
    )
  })

  it("refuses an unknown activation event, placement or contributes key", () => {
    expect(() => readExtension(packageJson({ activates: ["onOpen"] }))).toThrow("/parity/activates/0")
    expect(() =>
      readExtension(packageJson({ contributes: { menus: { toolbar: [{ command: "timings.measure" }] } } }))
    ).toThrow("/parity/contributes/menus")
    expect(() => readExtension(packageJson({ contributes: { widgets: [] } }))).toThrow("/parity/contributes")
  })

  it("takes the logo only as path data", () => {
    expect(() => readExtension(packageJson({ icon: "icon.svg" }))).toThrow("/parity/icon")
    expect(() =>
      readExtension(packageJson({ icon: { viewBox: "0 0 24 24", path: "M0 0<script>alert(1)</script>" } }))
    ).toThrow("/parity/icon/path: expected path data")
    expect(() => readExtension(packageJson({ icon: { viewBox: "24", path: "M0 0h1" } }))).toThrow(
      "/parity/icon/viewBox"
    )
  })

  it("takes a contribution's icon only as a kit icon's name", () => {
    const commands = [{ id: "timings.measure", title: "Measure", icon: "<svg/>" }]

    expect(() => readExtension(packageJson({ contributes: { commands } }))).toThrow(
      "/parity/contributes/commands/0/icon"
    )
  })
})
