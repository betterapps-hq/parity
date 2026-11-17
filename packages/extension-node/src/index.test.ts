import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { findPackage, packageEntry } from "./index.ts"

describe("findPackage", () => {
  it("finds a package this one depends on, and the file its exports load", async () => {
    const found = await findPackage(join(import.meta.dirname, ".."), "@parity-app/project")

    expect(found?.manifest.name).toBe("@parity-app/project")
    expect(found && packageEntry(found, "runtime")).toBe(join(found?.dir ?? "", "src", "index.ts"))
  })

  it("finds nothing for a package that isn't installed", async () => {
    await expect(findPackage(import.meta.dirname, "@parity-app/not-a-package")).resolves.toBeUndefined()
  })
})
