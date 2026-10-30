import { describe, expect, it } from "vite-plus/test"
import { componentNode, withLibraryContext } from "./library-insert.ts"
import type { ComponentInfo } from "./props.ts"

const takesChildren = { props: [{ name: "children", kind: "node" }] } as unknown as ComponentInfo

describe("inserting a library part", () => {
  it("gives a part with children its name as text, unless its sample says it has none", () => {
    const sources = {
      "acme/Button": { path: "@acme/ui", export: "Button", library: "acme", declaration: "" },
      "acme/Cascader": {
        path: "@acme/ui",
        export: "Cascader",
        library: "acme",
        declaration: "",
        sample: { props: { placeholder: "Pick one" }, children: [] }
      }
    }
    const taken = new Set<string>()
    const button = withLibraryContext(componentNode("acme/Button", takesChildren, taken), sources, [], taken)
    expect(button.type === "component" && button.props).toEqual({ children: "Button" })
    const cascader = withLibraryContext(componentNode("acme/Cascader", takesChildren, taken), sources, [], taken)
    expect(cascader.type === "component" && cascader.props).toEqual({ placeholder: "Pick one" })
    expect(cascader.type === "component" && cascader.slots).toBeUndefined()
  })
})
