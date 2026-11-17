import { describe, expect, it } from "vite-plus/test"
import { projectFileText } from "./file-order.ts"
import type { JsonValue } from "./schema.ts"

const text = (value: JsonValue) => `${JSON.stringify(value, null, 2)}\n`

describe("projectFileText", () => {
  it("writes two-space JSON ending in a newline, in the value's order without a file on disk", () => {
    expect(projectFileText({ b: 1, a: [1, 2] })).toBe(text({ b: 1, a: [1, 2] }))
  })

  it("keeps each object's keys in the order the file on disk has them", () => {
    const onDisk = text({ version: 4, props: { children: "Save", variant: "outline" } })

    expect(projectFileText({ props: { variant: "ghost", children: "Save" }, version: 4 }, onDisk)).toBe(
      text({ version: 4, props: { children: "Save", variant: "ghost" } })
    )
  })

  it("puts a key the file doesn't have after the key it follows in the value", () => {
    const onDisk = text({ id: "a", name: "A", root: {} })

    expect(projectFileText({ id: "a", name: "A", frames: {}, root: {} }, onDisk)).toBe(
      text({ id: "a", name: "A", frames: {}, root: {} })
    )
    expect(projectFileText({ first: 1, id: "a", root: {} }, onDisk)).toBe(text({ first: 1, id: "a", root: {} }))
  })

  it("leaves out keys the value no longer has", () => {
    expect(projectFileText({ b: 2 }, text({ a: 1, b: 1 }))).toBe(text({ b: 2 }))
  })

  it("orders an array's items like the item with the same id on disk, wherever it moved", () => {
    const onDisk = text({
      items: [
        { id: "x", b: 1, a: 1 },
        { id: "y", d: 1, c: 1 }
      ]
    })

    expect(
      projectFileText(
        {
          items: [
            { c: 2, d: 2, id: "y" },
            { a: 2, id: "x", b: 2 }
          ]
        },
        onDisk
      )
    ).toBe(
      text({
        items: [
          { id: "y", d: 2, c: 2 },
          { id: "x", b: 2, a: 2 }
        ]
      })
    )
  })

  it("orders items without an id like the item in their place", () => {
    expect(projectFileText({ list: [{ b: 2, a: 2 }] }, text({ list: [{ a: 1, b: 1 }] }))).toBe(
      text({ list: [{ a: 2, b: 2 }] })
    )
  })

  it("keeps the value's order when the file on disk isn't JSON", () => {
    expect(projectFileText({ b: 1, a: 1 }, "{ not json")).toBe(text({ b: 1, a: 1 }))
  })
})
