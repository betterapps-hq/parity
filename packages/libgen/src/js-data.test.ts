import { describe, expect, it } from "vite-plus/test"
import { moduleData } from "./js-data.ts"

describe("moduleData", () => {
  it("reads a published icon list with compiled enums, without running it", () => {
    const text = `var t = /* @__PURE__ */ ((i) => (i.REGULAR = "regular", i.BOLD = "bold", i))(t || {}), e = /* @__PURE__ */ ((i) => (i.FINANCE = "finances", i.NATURE = "nature", i))(e || {});
const n = [
  { name: "acorn", pascal_name: "Acorn", categories: [e.FINANCE, e.NATURE], tags: ["*new*", "nut"], codepoint: 60314, published_in: 2.1 },
  { name: "gear", pascal_name: "Gear", categories: [e.NATURE], tags: ["settings"], weight: -1 }
];
globalThis.ran = true;
export { n as icons, t as IconStyle };`
    const data = moduleData(text)
    expect(data.get("e")).toEqual({ FINANCE: "finances", NATURE: "nature" })
    expect(data.get("n")).toEqual([
      {
        name: "acorn",
        pascal_name: "Acorn",
        categories: ["finances", "nature"],
        tags: ["*new*", "nut"],
        codepoint: 60314,
        published_in: 2.1
      },
      { name: "gear", pascal_name: "Gear", categories: ["nature"], tags: ["settings"], weight: -1 }
    ])
    expect("ran" in globalThis).toBe(false)
  })

  it("leaves out what isn't data", () => {
    const data = moduleData(`const a = fetch("x"), b = { c: () => 1, d: "kept" }`)
    expect(data.has("a")).toBe(false)
    expect(data.get("b")).toEqual({ c: undefined, d: "kept" })
  })
})
