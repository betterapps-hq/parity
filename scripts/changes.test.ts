import { describe, expect, it } from "vite-plus/test"
import { bundledBy, onlyVersionChanged, releasesFor, versionedRelease, type WorkspacePackage } from "./changes.ts"

const workspace: WorkspacePackage[] = [
  {
    name: "@parity-app/desktop",
    dir: "apps/desktop",
    private: false,
    dependencies: ["@parity-app/core", "@parity-app/libgen"]
  },
  { name: "@parity-app/cli", dir: "packages/cli", private: false, dependencies: ["@parity-app/libgen"] },
  { name: "@parity-app/libgen", dir: "packages/libgen", private: true, dependencies: ["@parity-app/core"] },
  { name: "@parity-app/core", dir: "packages/core", private: true, dependencies: [] },
  { name: "@parity-app/fixtures", dir: "packages/fixtures", private: true, dependencies: ["@parity-app/core"] }
]
const ignored = ["**/*.test.ts", "**/*.md"]

describe("versionedRelease", () => {
  const manifest = (version: string) => JSON.stringify({ name: "@parity-app/desktop", version })
  const log = (version: string, name = "@parity-app/desktop") => JSON.stringify({ name, entries: [{ version }] })
  it("accepts a consumed release with a newer version and matching generated changelog", () => {
    expect(versionedRelease(manifest("0.3.0"), manifest("0.4.0"), log("0.4.0"))).toBe("@parity-app/desktop")
    expect(versionedRelease(manifest("0.3.9"), manifest("0.3.10"), log("0.3.10"))).toBe("@parity-app/desktop")
  })
  it.each(["0.3.0", "0.2.9", "0.03.1", "0.3.1-beta.1", "invalid"])(
    "rejects unchanged, older or invalid versions (%s)",
    (version) => {
      expect(versionedRelease(manifest("0.3.0"), manifest(version), log(version))).toBeUndefined()
    }
  )
  it("rejects stale, absent and other-package changelog entries", () => {
    for (const changelog of [
      log("0.3.0"),
      log("0.4.0", "@parity-app/cli"),
      "{}",
      "null",
      '{"name":"@parity-app/desktop","entries":[]}'
    ])
      expect(versionedRelease(manifest("0.3.0"), manifest("0.4.0"), changelog)).toBeUndefined()
  })
})

describe("bundledBy", () => {
  it("finds every released package that bundles a private one, through other private packages", () => {
    const bundlers = bundledBy(workspace)
    expect(bundlers.get("@parity-app/core")).toEqual(["@parity-app/desktop", "@parity-app/cli"])
    expect(bundlers.get("@parity-app/libgen")).toEqual(["@parity-app/desktop", "@parity-app/cli"])
  })

  it("leaves out a private package nothing released depends on", () => {
    expect(bundledBy(workspace).has("@parity-app/fixtures")).toBe(false)
  })
})

describe("releasesFor", () => {
  it("asks for the released package a file is in", () => {
    expect(releasesFor(workspace, ["apps/desktop/src/main/index.ts"], ignored)).toEqual(["@parity-app/desktop"])
  })

  it("asks for every released package that bundles a changed private package", () => {
    expect(releasesFor(workspace, ["packages/core/src/index.ts"], ignored)).toEqual([
      "@parity-app/cli",
      "@parity-app/desktop"
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
