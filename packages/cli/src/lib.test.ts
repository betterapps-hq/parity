import { covers } from "@parity/registry"
import { describe, expect, it } from "vitest"
import { keptRange, packageSpec } from "./lib.ts"

describe("packageSpec", () => {
  it("reads a name, and a version or tag after its @", () => {
    expect(packageSpec("lucide-react")).toEqual({ name: "lucide-react" })
    expect(packageSpec("lucide-react@1.63.0")).toEqual({ name: "lucide-react", version: "1.63.0" })
    expect(packageSpec("@tabler/icons-react")).toEqual({ name: "@tabler/icons-react" })
    expect(packageSpec("@tabler/icons-react@latest")).toEqual({ name: "@tabler/icons-react", version: "latest" })
  })
})

describe("keptRange", () => {
  const read = { name: "lucide-react", version: "1.63.0", range: "^1.0.0" }
  const covering = (versions: typeof read) =>
    covers({ package: versions } as Parameters<typeof covers>[0], read.version)

  it("keeps a file's range while it covers the version read", () => {
    expect(keptRange({ package: { range: ">=0.400.0 <2.0.0" } }, read, covering)).toBe(">=0.400.0 <2.0.0")
  })

  it("lets the new range stand for a version the old one doesn't cover, or a file without one", () => {
    expect(keptRange({ package: { range: ">=0.400.0 <1.0.0" } }, read, covering)).toBeUndefined()
    expect(keptRange({ package: { range: "^1.0.0" } }, read, covering)).toBeUndefined()
    expect(keptRange(undefined, read, covering)).toBeUndefined()
  })
})
