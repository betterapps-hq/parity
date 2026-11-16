import { describe, expect, it } from "vite-plus/test"
import type { JsonValue, Manifest } from "../index.ts"
import { type ExtensionPackage, ManifestRefused, readExtension, refuseSecondSync } from "./manifest.ts"

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

  it("reads its tool's versions from its peer dependencies, the main one first, with what the manifest adds", () => {
    const found = readExtension({
      ...packageJson({ versions: { scope: "@tanstack/" } }),
      peerDependencies: { "@tanstack/react-router": "^1.0.0", "@tanstack/router-plugin": "^1.0.0" }
    })

    expect(found.versions).toEqual({
      packages: ["@tanstack/react-router", "@tanstack/router-plugin"],
      range: "^1.0.0",
      scope: "@tanstack/"
    })
    expect(readExtension(packageJson()).versions).toBeUndefined()
    expect(() => readExtension(packageJson({ versions: { majors: [] } }))).toThrow("/parity/versions")
  })

  it("takes a process permission only as a kind of run, then what it names", () => {
    expect(
      readExtension(packageJson({ permissions: { processes: ["exec:cloudflared"] } })).manifest.permissions
    ).toEqual({
      processes: ["exec:cloudflared"]
    })
    expect(() => readExtension(packageJson({ permissions: { processes: ["cloudflared"] } }))).toThrow(
      "/parity/permissions/processes/0"
    )
    expect(() => readExtension(packageJson({ permissions: { processes: ["exec:"] } }))).toThrow(
      "/parity/permissions/processes/0"
    )
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

  it("takes when expressions over Parity's keys and its own, and keys it can read (PAR-1092)", () => {
    const menus = {
      layers: [
        {
          command: "timings.measure",
          when: "node.type == route && (selection.count > 1 || !timings.measured)",
          enablement: "project.uses(storybook) && fact.load > 500",
          disabledReason: "Measure it first"
        }
      ]
    }

    const keybindings = [{ command: "timings.measure", key: "mod+shift+m", when: "tool == select" }]

    expect(
      readExtension(packageJson({ contributes: { ...contributes, menus, keybindings } })).manifest.contributes
    ).toMatchObject({ menus, keybindings })
  })

  it("takes a command in a process's menu, over Parity's process keys (PAR-1127)", () => {
    const menus = {
      process: [
        { command: "timings.measure", when: "process.isMine && process.isServer", enablement: "process.isRunning" }
      ]
    }

    expect(readExtension(packageJson({ contributes: { ...contributes, menus } })).manifest.contributes).toMatchObject({
      menus
    })
  })

  it("refuses a when that doesn't read, a key outside the prefix in one, and keys it can't read", () => {
    const broken = { layers: [{ command: "timings.measure", when: "node.type ==" }] }
    const outside = { layers: [{ command: "timings.measure", when: "node.type == route && storybook.hasStories" }] }

    expect(() => readExtension(packageJson({ contributes: { ...contributes, menus: broken } }))).toThrow(
      'expected a value after "=="'
    )
    expect(() => readExtension(packageJson({ contributes: { ...contributes, menus: outside } }))).toThrow(
      "/parity/contributes/menus/layers/0/when"
    )
    expect(() =>
      readExtension(
        packageJson({ contributes: { ...contributes, keybindings: [{ command: "timings.measure", key: "hyper+m" }] } })
      )
    ).toThrow("hyper isn't a modifier")
  })

  it("takes detection rules, and refuses paths its read permission doesn't name or entities without a provider (PAR-1128)", () => {
    const read = ["~/.timings/**", "$TIMINGS_HOME/**"]
    const detect = { paths: ["$TIMINGS_HOME", "~/.timings"] }

    expect(readExtension(packageJson({ detect, permissions: { read } })).manifest.detect).toEqual(detect)
    expect(() => readExtension(packageJson({ detect, permissions: { read: ["~/.timings/**"] } }))).toThrow(
      "/parity/detect/paths/0"
    )
    expect(() => readExtension(packageJson({ detect: { paths: ["/etc/timings"] } }))).toThrow("/parity/detect/paths/0")
    expect(() => readExtension(packageJson({ detect: { entities: true } }))).toThrow("/parity/detect/entities")
  })

  it("takes a router's frame decorators as data, and refuses a value form that doesn't read (PAR-1152)", () => {
    const router = (decorators: JsonValue) =>
      packageJson({ contributes: { ...contributes, providers: { router: { decorators } } } })

    const wrap = { import: "react-router", component: "MemoryRouter", props: { initialEntries: [{ $frame: "url" }] } }

    expect(readExtension(router([{ wrap }])).manifest.contributes.providers?.router?.decorators).toEqual([{ wrap }])
    expect(() =>
      readExtension(router([{ wrap: { ...wrap, props: { initialEntries: [{ $frame: "window" }] } } }]))
    ).toThrow("/parity/contributes/providers/router/decorators/0")
    expect(() => readExtension(router([{ wrap: { import: "react-router" } }]))).toThrow(
      "/parity/contributes/providers/router/decorators/0/wrap/component"
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

  it("takes the logo's brand color only as a hex for each theme", () => {
    const color = { light: "#FF4785", dark: "#ff6b9c" }
    expect(readExtension(packageJson({ icon: { ...icon, color } })).manifest.icon.color).toEqual(color)
    expect(() => readExtension(packageJson({ icon: { ...icon, color: "#FF4785" } }))).toThrow("/parity/icon/color")
    expect(() =>
      readExtension(packageJson({ icon: { ...icon, color: { light: "red;background:url(x)", dark: "#000000" } } }))
    ).toThrow("/parity/icon/color/light: expected a six-digit hex color")
  })

  it("takes a contribution's icon only as a kit icon's name", () => {
    const commands = [{ id: "timings.measure", title: "Measure", icon: "<svg/>" }]

    expect(() => readExtension(packageJson({ contributes: { commands } }))).toThrow(
      "/parity/contributes/commands/0/icon"
    )
  })

  it("refuses a setting whose choices, their titles or its default can't hold", () => {
    const read = (setting: Record<string, JsonValue>) =>
      readExtension(
        packageJson({
          activates: [],
          contributes: { settings: { "timings.where": { scope: "app", title: "Where", ...setting } } }
        })
      )

    expect(() => read({ type: "number", enum: ["1"] })).toThrow("only a string setting can have choices")
    expect(() => read({ type: "string", enum: ["a", "b"], enumTitles: ["A"] })).toThrow("enumTitles must name each")
    expect(() => read({ type: "string", enum: ["a", "b"], default: "c" })).toThrow(`its default, "c", doesn't fit`)
    expect(() => read({ type: "boolean", default: "yes" })).toThrow("doesn't fit its type")
    expect(
      read({ type: "string", enum: ["a", "b"], enumTitles: ["A", "B"], default: "b" }).manifest.contributes.settings
    ).toBeDefined()
  })
})

describe("internal extensions (extensions-in-the-window.md)", () => {
  /** An internal extension's manifest, with a window module that starts while its setting is on. */
  const internal = {
    internal: true,
    window: "./window",
    capabilities: ["canvas"],
    detect: { always: true },
    activates: ["onSetting:timings.live"],
    contributes: {
      ...contributes,
      settings: { "timings.live": { type: "boolean", default: false, scope: "app", title: "Live" } }
    }
  }

  /** The rule a manifest is refused under. */
  const ruleOf = (read: () => ExtensionPackage) => {
    try {
      read()
    } catch (error) {
      return error instanceof ManifestRefused ? error.rule : "other"
    }

    return undefined
  }

  it("reads one in Parity's built-in list, with its window module, capabilities and detection", () => {
    const { manifest } = readExtension(packageJson(internal), { builtIn: true })

    expect(manifest).toMatchObject({ internal: true, window: "./window", capabilities: ["canvas"] })
    expect(manifest.detect?.always).toBe(true)
  })

  it("refuses one outside the built-in list", () => {
    expect(ruleOf(() => readExtension(packageJson(internal)))).toBe("internalOutsideBuiltIns")
    expect(() => readExtension(packageJson(internal))).toThrow("/parity/internal")
  })

  it("refuses a window module, capabilities, detect.always, contributes.sync or onSetting on one that isn't internal", () => {
    const { internal: _internal, ...external } = internal

    expect(ruleOf(() => readExtension(packageJson({ window: "./window" }), { builtIn: true }))).toBe("internalOnly")
    expect(ruleOf(() => readExtension(packageJson({ capabilities: ["camera"] }), { builtIn: true }))).toBe(
      "internalOnly"
    )
    expect(ruleOf(() => readExtension(packageJson({ detect: { always: true } }), { builtIn: true }))).toBe(
      "internalOnly"
    )
    expect(
      ruleOf(() => readExtension(packageJson({ contributes: { ...contributes, sync: true } }), { builtIn: true }))
    ).toBe("internalOnly")
    expect(ruleOf(() => readExtension(packageJson(external), { builtIn: true }))).toBe("internalOnly")
  })

  it("refuses the sync capability without contributes.sync", () => {
    const sync = { ...internal, capabilities: ["sync"] }

    expect(ruleOf(() => readExtension(packageJson(sync), { builtIn: true }))).toBe("capabilityWithoutContribution")
    expect(
      readExtension(packageJson({ ...sync, contributes: { ...internal.contributes, sync: true } }), { builtIn: true })
        .manifest.contributes.sync
    ).toBe(true)
  })

  it("refuses onSetting without a window module, or naming what isn't a boolean app setting", () => {
    const { window: _window, ...noWindow } = internal

    expect(ruleOf(() => readExtension(packageJson(noWindow), { builtIn: true }))).toBe("windowEventWithoutWindow")
    expect(
      ruleOf(() =>
        readExtension(packageJson({ ...internal, activates: ["onSetting:timings.runs"] }), { builtIn: true })
      )
    ).toBe("windowEventWithoutWindow")
  })

  it("takes a window module without a Node half, and refuses neither", () => {
    const { main: _main, ...noMain } = packageJson(internal)

    expect(readExtension(noMain, { builtIn: true }).main).toBeUndefined()
    expect(
      ruleOf(() =>
        readExtension(
          { ...noMain, parity: { ...noMain.parity, window: undefined, activates: ["onStartup"] } },
          { builtIn: true }
        )
      )
    ).toBe("noCode")
  })

  it("refuses every extension that brings the room when two do", () => {
    const bringing = (name: string) =>
      readExtension(
        { ...packageJson({ ...internal, contributes: { ...internal.contributes, sync: true } }), name },
        { builtIn: true }
      )

    const plain = readExtension(packageJson())

    expect(refuseSecondSync([bringing("one"), plain]).refused).toEqual([])

    const { kept, refused } = refuseSecondSync([bringing("one"), bringing("two"), plain])

    expect(kept).toEqual([plain])
    expect(refused.map((each) => [each.extension, each.rule])).toEqual([
      ["one", "secondSync"],
      ["two", "secondSync"]
    ])
  })
})
