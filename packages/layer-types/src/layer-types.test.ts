import { describe, expect, it } from "vite-plus/test"
import {
  describeElement,
  elementFamilies,
  elementType,
  elementTypeFamilies,
  elementTypeRoles,
  elementTypes,
  elementTypeTags
} from "./layer-types.ts"

describe("elementType", () => {
  it.each([
    ["span", "text"],
    ["div", "layout"],
    ["nav", "region"],
    ["a", "link"],
    ["button", "input"],
    ["select", "input"],
    ["img", "image"],
    ["svg", "vector"],
    ["video", "video"],
    ["audio", "audio"],
    ["iframe", "embed"],
    ["td", "table"],
    ["li", "list"],
    ["hr", "divider"],
    ["dialog", "overlay"],
    ["my-widget", "layout"],
    ["SPAN", "text"]
  ] as const)("shows a %s as %s", (tag, type) => {
    expect(elementType(tag)).toBe(type)
  })

  it("goes by the tag alone, whatever is inside", () => {
    expect(elementType("span")).toBe(elementType("span", {}))
  })

  it("takes a role in place of the tag, the first a type lists", () => {
    expect(elementType("div", { role: "button" })).toBe("input")
    expect(elementType("div", { role: "switch" })).toBe("input")
    expect(elementType("div", { role: "navigation" })).toBe("region")
    expect(elementType("div", { role: "made-up separator" })).toBe("divider")
    expect(elementType("span", { role: "made-up" })).toBe("text")
  })

  it("shows an element with popover as an Overlay", () => {
    expect(elementType("div", { popover: "" })).toBe("overlay")
  })
})

describe("the mapping", () => {
  it("puts each tag and each role in one type", () => {
    const tags = elementTypes.flatMap((type) => elementTypeTags[type])
    const roles = elementTypes.flatMap((type) => elementTypeRoles[type])

    expect(new Set(tags).size).toBe(tags.length)
    expect(new Set(roles).size).toBe(roles.length)
  })

  it("puts every family to use, Video and Audio in one", () => {
    expect(new Set(Object.values(elementTypeFamilies))).toEqual(new Set(elementFamilies))
    expect(elementTypeFamilies.video).toBe(elementTypeFamilies.audio)
  })
})

describe("describeElement", () => {
  it("says how an element shows: its type, family, name, icon and sections", () => {
    expect(describeElement({ tag: "nav" })).toEqual({
      type: "region",
      family: "structure",
      name: "Region",
      detail: "nav",
      icon: "panels-top-left",
      sections: ["landmark", "layout", "size", "fill", "stroke", "appearance"]
    })
  })

  it("says what an input is within its type: its role, else its type, else its tag", () => {
    expect(describeElement({ tag: "input", attributes: { type: "checkbox" } }).detail).toBe("checkbox")
    expect(describeElement({ tag: "input" }).detail).toBe("text")
    expect(describeElement({ tag: "button" }).detail).toBe("button")
    expect(describeElement({ tag: "div", attributes: { role: "switch" } })).toMatchObject({
      type: "input",
      detail: "switch"
    })
  })
})
