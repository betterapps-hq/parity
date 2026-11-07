import { type ContainerSpec, findNode, parseCanvasDocument } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  designsLocked,
  isLocked,
  layersLocked,
  lockSource,
  setDesignLocked,
  toggleLockedLayers,
  unlockedPath
} from "./locking.ts"

function pricing(): ContainerSpec {
  return {
    id: "pricing",
    name: "Pricing",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [
        {
          type: "layout",
          id: "header",
          children: [
            { type: "text", id: "title", text: "Pricing" },
            { type: "instance", id: "card", design: "plan-card" }
          ]
        },
        { type: "text", id: "footer", text: "Questions?" }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  }
}

describe("toggleLockedLayers", () => {
  it("locks the layers, then unlocks them once they're all locked", () => {
    const locked = toggleLockedLayers(pricing(), ["header", "footer"])
    expect(findNode(locked.root, "header")?.locked).toBe(true)
    expect(findNode(locked.root, "footer")?.locked).toBe(true)
    expect(layersLocked(locked, ["header", "footer"])).toBe(true)
    const unlocked = toggleLockedLayers(locked, ["header", "footer"])
    // Taken away rather than saved as false.
    expect(findNode(unlocked.root, "header")).not.toHaveProperty("locked")
    expect(layersLocked(unlocked, ["header"])).toBe(false)
  })

  it("locks them all when only some are locked", () => {
    const some = toggleLockedLayers(pricing(), ["header"])
    const all = toggleLockedLayers(some, ["header", "footer"])
    expect(layersLocked(all, ["header", "footer"])).toBe(true)
  })

  it("leaves the root, layers inside an instance and missing layers alone", () => {
    const container = pricing()
    expect(toggleLockedLayers(container, ["page", "card/price", "nowhere"])).toBe(container)
    expect(layersLocked(container, ["page"])).toBe(false)
  })

  it("keeps the lock in a saved project", () => {
    const locked = setDesignLocked(toggleLockedLayers(pricing(), ["header"]), true)
    const read = parseCanvasDocument({ version: 3, containers: [locked] })
    expect(read.containers[0]?.locked).toBe(true)
    expect(findNode(read.containers[0]!.root, "header")?.locked).toBe(true)
  })
})

describe("lockSource", () => {
  it("says what locks a layer: itself, a layer around it, or its design", () => {
    const locked = toggleLockedLayers(pricing(), ["header"])
    expect(lockSource(locked, "header")).toEqual({ by: "itself" })
    expect(lockSource(locked, "title")).toMatchObject({ by: "layer", layer: { id: "header" } })
    expect(lockSource(locked, "card/price")).toMatchObject({ by: "layer", layer: { id: "header" } })
    expect(lockSource(locked, "footer")).toBeUndefined()
    expect(lockSource(setDesignLocked(pricing(), true), "footer")).toEqual({ by: "design" })
  })

  it("locks a layer inside an instance by its instance", () => {
    const locked = toggleLockedLayers(pricing(), ["card"])
    expect(lockSource(locked, "card/price")).toMatchObject({ by: "layer", layer: { id: "card" } })
    expect(isLocked(locked, "title")).toBe(false)
  })
})

describe("unlockedPath", () => {
  it("keeps the layers under the pointer down to the first locked one", () => {
    const path = ["page", "header", "card", "card/price"]
    expect(unlockedPath(pricing(), path)).toBe(path)
    expect(unlockedPath(toggleLockedLayers(pricing(), ["card"]), path)).toEqual(["page", "header"])
    expect(unlockedPath(toggleLockedLayers(pricing(), ["header"]), path)).toEqual(["page"])
  })

  it("leaves the design's own lock to the canvas", () => {
    expect(unlockedPath(setDesignLocked(pricing(), true), ["page", "header"])).toEqual(["page", "header"])
  })
})

describe("designsLocked", () => {
  it("reads Unlock only when every design is locked", () => {
    const locked = setDesignLocked(pricing(), true)
    expect(designsLocked([locked])).toBe(true)
    expect(designsLocked([locked, pricing()])).toBe(false)
    expect(designsLocked([])).toBe(false)
    expect(setDesignLocked(setDesignLocked(pricing(), true), false)).not.toHaveProperty("locked")
  })
})
