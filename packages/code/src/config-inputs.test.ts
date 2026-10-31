import { describe, expect, it } from "vite-plus/test"
import { configChange, configInputs } from "./config-inputs.ts"

describe("configInputs", () => {
  it("lists every tsconfig read and package.json as configs, and the lockfiles apart", () => {
    const tsconfig = { configs: [], read: ["tsconfig.json", "tsconfig.app.json", "../tsconfig.base.json"] }
    expect(configInputs(tsconfig, ["../pnpm-lock.yaml"])).toEqual({
      configs: ["../tsconfig.base.json", "package.json", "tsconfig.app.json", "tsconfig.json"],
      lockfiles: ["../pnpm-lock.yaml"]
    })
  })
})

describe("configChange", () => {
  const stamps = {
    configs: { "tsconfig.json": "120:1", "../tsconfig.base.json": "80:1", "package.json": "40:1" },
    lockfiles: { "pnpm-lock.yaml": "900:1" }
  }

  it("is none while every input stands as it did", () => {
    expect(configChange(stamps, structuredClone(stamps))).toBe("none")
  })

  it("is config when a tsconfig, an extends base or package.json changed, appeared or went", () => {
    expect(configChange(stamps, { ...stamps, configs: { ...stamps.configs, "tsconfig.json": "121:1" } })).toBe("config")
    expect(configChange(stamps, { ...stamps, configs: { ...stamps.configs, "../tsconfig.base.json": "-" } })).toBe(
      "config"
    )
    const { "../tsconfig.base.json": _dropped, ...rest } = stamps.configs
    expect(configChange(stamps, { ...stamps, configs: rest })).toBe("config")
    expect(configChange(stamps, { ...stamps, configs: { ...rest, "tsconfig.lib.json": "1:1" } })).toBe("config")
  })

  it("is dependencies when a lockfile changed, appeared or went, whatever else changed", () => {
    const configs = { ...stamps.configs, "tsconfig.json": "121:1" }
    expect(configChange(stamps, { configs, lockfiles: { "pnpm-lock.yaml": "901:2" } })).toBe("dependencies")
    expect(configChange(stamps, { ...stamps, lockfiles: {} })).toBe("dependencies")
    expect(configChange(stamps, { ...stamps, lockfiles: { ...stamps.lockfiles, "package-lock.json": "5:1" } })).toBe(
      "dependencies"
    )
  })
})
