import { describe, expect, it } from "vitest"
import { bundledBy, onlyVersionChanged, releasesFor, type WorkspacePackage } from "./changes.ts"

const workspace: WorkspacePackage[] = [
  { name: "@parity/desktop", dir: "apps/desktop", private: false, dependencies: ["@parity/core", "@parity/libgen"] },
  { name: "@parity-app/cli", dir: "packages/cli", private: false, dependencies: ["@parity/libgen"] },
  { name: "@parity/libgen", dir: "packages/libgen", private: true, dependencies: ["@parity/core"] },
  { name: "@parity/core", dir: "packages/core", private: true, dependencies: [] },
  { name: "@parity/fixtures", dir: "packages/fixtures", private: true, dependencies: ["@parity/core"] }
]
const ignored = ["**/*.test.ts", "**/*.md"]

describe("bundledBy", () => {
  it("finds every released package that bundles a private one, through other private packages", () => {
    const bundlers = bundledBy(workspace)
    expect(bundlers.get("@parity/core")).toEqual(["@parity/desktop", "@parity-app/cli"])
    expect(bundlers.get("@parity/libgen")).toEqual(["@parity/desktop", "@parity-app/cli"])
  })

  it("leaves out a private package nothing released depends on", () => {
    expect(bundledBy(workspace).has("@parity/fixtures")).toBe(false)
  })
})

describe("releasesFor", () => {
  it("asks for the released package a file is in", () => {
    expect(releasesFor(workspace, ["apps/desktop/src/main/index.ts"], ignored)).toEqual(["@parity/desktop"])
  })

  it("asks for every released package that bundles a changed private package", () => {
    expect(releasesFor(workspace, ["packages/core/src/index.ts"], ignored)).toEqual([
      "@parity-app/cli",
      "@parity/desktop"
    ])
  })

  it("asks for nothing when only ignored files change", () => {
    expect(releasesFor(workspace, ["packages/core/src/index.test.ts", "packages/core/README.md"], ignored)).toEqual([])
  })

  it("asks for nothing for a private package nothing released bundles, or a file outside every package", () => {
    expect(releasesFor(workspace, ["packages/fixtures/src/generate.ts", "vite.config.ts"], ignored)).toEqual([])
  })

  it("doesn't take a folder whose name starts the same for the package", () => {
    const files = ["packages/core-extra/src/index.ts"]
    expect(releasesFor(workspace, files, ignored)).toEqual([])
  })
})

describe("onlyVersionChanged", () => {
  const manifest = (version: string, dependencies: Record<string, string> = {}) =>
    JSON.stringify({ name: "@parity-app/cli", version, dependencies }, null, 2)

  it("takes a release's version bump for no change", () => {
    expect(onlyVersionChanged(manifest("0.1.0"), manifest("0.2.0"))).toBe(true)
  })

  it("counts any other change to the manifest", () => {
    expect(onlyVersionChanged(manifest("0.1.0"), manifest("0.2.0", { semver: "^7.8.5" }))).toBe(false)
  })
})
