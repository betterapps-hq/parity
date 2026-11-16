import { describe, expect, it } from "vite-plus/test"
import { editsRefusal, type ReadPlace, readablePath, writeRefusal } from "./permissions.ts"

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

describe("readablePath", () => {
  const place: ReadPlace = {
    root: "/projects/shop",
    home: "/home/ada",
    variables: { PORTLESS_STATE_DIR: "/var/portless" },
    platform: "linux"
  }

  const permissions = { read: ["src/**", "~/.portless/**", "$PORTLESS_STATE_DIR/**", "$UNSET/**"] }

  it("reads paths in the project its globs name, from the root or absolute", () => {
    expect(readablePath("src/stories/Button.tsx", permissions, place)).toBe("/projects/shop/src/stories/Button.tsx")
    expect(readablePath("/projects/shop/src/a.ts", permissions, place)).toBe("/projects/shop/src/a.ts")
    expect(readablePath("package.json", permissions, place)).toBeUndefined()
    expect(readablePath("src/../package.json", permissions, place)).toBeUndefined()
  })

  it("reads outside the project under the home folder or a variable's folder, and nothing for an unset variable", () => {
    expect(readablePath("/home/ada/.portless/routes.json", permissions, place)).toBe("/home/ada/.portless/routes.json")
    expect(readablePath("/var/portless/proxy.port", permissions, place)).toBe("/var/portless/proxy.port")
    expect(readablePath("/home/ada/.ssh/id_rsa", permissions, place)).toBeUndefined()
    expect(readablePath("/home/ada/.portless/../.ssh/id_rsa", permissions, place)).toBeUndefined()
  })

  it("compares Windows paths without case, whichever way their slashes go", () => {
    const windows: ReadPlace = { root: "C:\\Projects\\Shop", home: "C:\\Users\\Ada", variables: {}, platform: "win32" }

    expect(readablePath("c:\\users\\ada\\.portless\\routes.json", permissions, windows)).toBe(
      "c:/users/ada/.portless/routes.json"
    )
    expect(readablePath("SRC/a.ts", permissions, windows)).toBe("C:/Projects/Shop/SRC/a.ts")
  })
})
