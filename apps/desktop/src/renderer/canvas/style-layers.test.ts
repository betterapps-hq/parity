import { describe, expect, it } from "vite-plus/test"
import { leaveLayer, type Styled, takeLayer, writeLayer } from "./style-layers.ts"

/** An element's inline style, as a map. */
function element(own: Record<string, string> = {}): Styled & { values: Map<string, string> } {
  const values = new Map(Object.entries(own))

  return {
    values,
    style: {
      getPropertyValue: (name) => values.get(name) ?? "",
      setProperty: (name, value) => {
        values.set(name, value ?? "")
      },
      removeProperty: (name) => {
        const was = values.get(name) ?? ""
        values.delete(name)

        return was
      }
    }
  }
}

describe("style layers", () => {
  it("puts back what was there once the only preview takes its value back", () => {
    const card = element({ width: "100px" })
    writeLayer(card, "width", "local", "120px")
    expect(card.values.get("width")).toBe("120px")
    takeLayer(card, "width", "local")
    expect(card.values.get("width")).toBe("100px")
  })

  it("keeps another preview's value when one takes its own back, whichever goes first", () => {
    const card = element({ width: "100px" })
    writeLayer(card, "width", "local", "120px")
    writeLayer(card, "width", "preview-1", "140px")
    takeLayer(card, "width", "local")
    expect(card.values.get("width")).toBe("140px")
    writeLayer(card, "width", "local", "130px")
    takeLayer(card, "width", "preview-1")
    expect(card.values.get("width")).toBe("130px")
    takeLayer(card, "width", "local")
    expect(card.values.get("width")).toBe("100px")
  })

  it("removes a property for an empty value, and one that wasn't there stays away", () => {
    const card = element({ padding: "8px" })
    writeLayer(card, "padding", "local", "")
    expect(card.values.has("padding")).toBe(false)
    writeLayer(card, "margin", "local", "4px")
    takeLayer(card, "margin", "local")
    takeLayer(card, "padding", "local")
    expect(card.values.has("margin")).toBe(false)
    expect(card.values.get("padding")).toBe("8px")
  })

  it("comes back to a value handed to its change, not to what was there before, when another preview goes", () => {
    const card = element({ width: "100px" })
    writeLayer(card, "width", "local", "120px")
    writeLayer(card, "width", "preview-1", "140px")
    leaveLayer(card, "width", "local")
    takeLayer(card, "width", "preview-1")
    expect(card.values.get("width")).toBe("120px")
  })

  it("leaves what's shown when a preview hands it to the change that makes it", () => {
    const card = element({ width: "100px" })
    writeLayer(card, "width", "local", "120px")
    leaveLayer(card, "width", "local")
    expect(card.values.get("width")).toBe("120px")
    // Nothing is left to take back.
    takeLayer(card, "width", "local")
    expect(card.values.get("width")).toBe("120px")
  })
})
