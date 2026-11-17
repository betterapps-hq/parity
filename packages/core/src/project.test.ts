import { describe, expect, it } from "vite-plus/test"
import { componentInfoOf, iconSetPropsId } from "./project.ts"

describe("a component's props", () => {
  const components = { "nova/Button": "Button's", [iconSetPropsId("lucide")]: "Lucide's" }

  it("are its own when they were read", () => {
    expect(componentInfoOf(components, "nova/Button")).toBe("Button's")
  })

  it("are its icon set's for an icon, which its icons share", () => {
    expect(componentInfoOf(components, "lucide/Check")).toBe("Lucide's")
  })

  it("aren't known for a component nothing was read for", () => {
    expect(componentInfoOf(components, "nova/Card")).toBeUndefined()
    expect(componentInfoOf(components, "Card")).toBeUndefined()
  })
})
