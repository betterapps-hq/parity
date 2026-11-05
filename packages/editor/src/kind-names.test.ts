import { describe, expect, it } from "vite-plus/test"
import { kindName, kindsName, kindTitle } from "./kind-names.ts"

describe("what labels call screens and components", () => {
  it("names one by its kind, and one with no kind a screen", () => {
    expect(kindName("component")).toBe("component")
    expect(kindName(undefined)).toBe("screen")
    expect(kindTitle("component")).toBe("Component")
    expect(kindTitle(undefined)).toBe("Screen")
  })

  it("counts several, by kind when they're all one kind", () => {
    expect(kindsName(["screen"])).toBe("screen")
    expect(kindsName(["component", "component"])).toBe("2 components")
    expect(kindsName([undefined, "screen", "screen"])).toBe("3 screens")
  })

  it("names each kind in a mix, screens first", () => {
    expect(kindsName(["component", "screen", "component"])).toBe("3 screens and components")
  })
})
