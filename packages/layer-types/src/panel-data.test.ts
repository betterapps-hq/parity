import { describe, expect, it } from "vite-plus/test"
import { panelAttributes, panelData } from "./panel-data.ts"

describe("panelData", () => {
  it("reads a link's href and target into its Link section", () => {
    expect(panelData({ tag: "a", attributes: { href: "/pricing", target: "_blank", class: "x" } })).toEqual([
      {
        section: "link",
        title: "Link",
        fields: [
          { attribute: "href", label: "Link to", value: "/pricing" },
          { attribute: "target", label: "Opens in", value: "_blank" }
        ]
      }
    ])
  })

  it("calls an input's section by its type, and shows an on-or-off attribute as Yes", () => {
    expect(panelData({ tag: "input", attributes: { type: "checkbox", name: "terms", checked: "" } })).toEqual([
      {
        section: "input",
        title: "Checkbox",
        fields: [
          { attribute: "type", label: "Type", value: "checkbox" },
          { attribute: "name", label: "Name", value: "terms" },
          { attribute: "checked", label: "Checked", value: "Yes" }
        ]
      }
    ])
  })

  it("shows one field when two attributes say the same thing", () => {
    const [group] = panelData({ tag: "button", attributes: { role: "switch", "aria-checked": "true", checked: "" } })

    expect(group?.title).toBe("Switch")
    expect(group?.fields).toEqual([{ attribute: "checked", label: "Checked", value: "Yes" }])
  })

  it("reads a video's source and playback", () => {
    expect(
      panelData({ tag: "video", attributes: { src: "/a.mp4", muted: "", loop: "" } }).map((group) => [
        group.title,
        group.fields.map((field) => field.label)
      ])
    ).toEqual([
      ["Source", ["Source"]],
      ["Playback", ["Loop", "Muted"]]
    ])
  })

  it("leaves out a section with nothing set, and an element whose type has none", () => {
    expect(panelData({ tag: "nav" })).toEqual([])
    expect(panelData({ tag: "div", attributes: { href: "/x" } })).toEqual([])
  })

  it("lists each attribute it reads once", () => {
    expect(new Set(panelAttributes).size).toBe(panelAttributes.length)
    expect(panelAttributes).toContain("aria-checked")
  })
})
