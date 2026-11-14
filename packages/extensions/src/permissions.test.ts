import { describe, expect, it } from "vite-plus/test"
import { editsRefusal, writeRefusal } from "./permissions.ts"

describe("editsRefusal", () => {
  it("lets only an extension with the edits permission change designs", () => {
    expect(editsRefusal("Tidy", { edits: true })).toBeUndefined()
    expect(editsRefusal("Tidy", {})).toContain('Its manifest needs "edits": true')
    expect(editsRefusal("Tidy", undefined)).toContain("Tidy can't change designs")
  })
})

describe("writeRefusal", () => {
  const permissions = { write: ["src/**/*.stories.tsx", "**/*.par", "**"] }

  it("lets an extension write the paths its write permission names", () => {
    expect(writeRefusal("Tidy", { write: ["src/**/*.stories.tsx"] }, "src/ui/Button.stories.tsx")).toBeUndefined()
    expect(writeRefusal("Tidy", { write: ["src/**/*.stories.tsx"] }, "src/ui/Button.tsx")).toContain(
      `"write" permission doesn't name it`
    )
    expect(writeRefusal("Tidy", undefined, "README.md")).toContain(`"write" permission doesn't name it`)
  })

  it("refuses a .par file whatever the permission names, and anything outside the project", () => {
    expect(writeRefusal("Tidy", permissions, "designs/app.par")).toContain("never .par files")
    expect(writeRefusal("Tidy", permissions, "Shop.PAR")).toContain("never .par files")
    expect(writeRefusal("Tidy", permissions, "src/../app.par")).toContain("never .par files")
    expect(writeRefusal("Tidy", permissions, "../other/file.ts")).toBe("../other/file.ts is outside the project")
    expect(writeRefusal("Tidy", permissions, "/etc/hosts")).toBe("/etc/hosts is outside the project")
    expect(writeRefusal("Tidy", permissions, "C:/Windows/win.ini")).toContain("outside the project")
  })
})
