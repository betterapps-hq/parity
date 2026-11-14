import { describe, expect, it } from "vite-plus/test"
import { type ComponentLoader, componentRegistry, sourceAddress } from "./component-registry.ts"

/** The address each loader `loadFrom` made was made for, for the tests to read back. */
const addresses = new Map<ComponentLoader, string>()

const loadFrom = (address: string, name: string): ComponentLoader => {
  const loader = async () => name
  addresses.set(loader, address)

  return loader
}

const addressOf = (loader: ComponentLoader | undefined) => (loader ? addresses.get(loader) : undefined)

describe("sourceAddress", () => {
  it("serves a project file from the dev server's root, and a new version at a new address", () => {
    expect(sourceAddress({ path: "src/badge.tsx", export: "Badge" })).toEqual({
      address: "/src/badge.tsx",
      from: "/src/badge.tsx#Badge"
    })
    expect(sourceAddress({ path: "./src/badge.tsx", export: "Badge", version: 3 })).toEqual({
      address: "/src/badge.tsx?t=3",
      from: "/src/badge.tsx?t=3#Badge"
    })
  })
})

describe("componentRegistry", () => {
  const card = () => "card"
  const lazyChart: ComponentLoader = async () => "chart"

  it("lists what the guest loaded with, drawn at once first, then on demand", () => {
    const registry = componentRegistry({ Card: card }, { Chart: lazyChart })

    expect(registry.names).toEqual(["Card", "Chart"])
    expect(registry.component("Card")).toBe(card)
    expect(registry.loader("Chart")).toBe(lazyChart)
    expect(registry.component("Chart")).toBeUndefined()
    expect(registry.moves("Card")).toBe(0)
  })

  it("loads an added component from its file, and draws one it had from its new file from then on", () => {
    const registry = componentRegistry({ Card: card })

    expect(
      registry.add(
        { Badge: { path: "src/badge.tsx", export: "Badge" }, Card: { path: "src/ui/card.tsx", export: "Card" } },
        loadFrom
      )
    ).toEqual(["Badge", "Card"])
    expect(registry.names).toEqual(["Card", "Badge"])
    expect(addressOf(registry.loader("Badge"))).toBe("/src/badge.tsx")
    expect(registry.component("Card")).toBeUndefined()
    expect(addressOf(registry.loader("Card"))).toBe("/src/ui/card.tsx")
    expect(registry.moves("Card")).toBe(1)
  })

  it("changes nothing for a component given the file it already comes from", () => {
    const registry = componentRegistry({})
    registry.add({ Badge: { path: "src/badge.tsx", export: "Badge" } }, loadFrom)
    const loader = registry.loader("Badge")

    expect(registry.add({ Badge: { path: "src/badge.tsx", export: "Badge" } }, loadFrom)).toEqual([])
    expect(registry.loader("Badge")).toBe(loader)
    expect(registry.moves("Badge")).toBe(1)
    // Its code changed in the same file (PAR-165).
    expect(registry.add({ Badge: { path: "src/badge.tsx", export: "Badge", version: 1 } }, loadFrom)).toEqual(["Badge"])
    expect(registry.moves("Badge")).toBe(2)
  })

  it("puts back what the guest loaded with when an added source goes, and forgets one it was only given", () => {
    const registry = componentRegistry({ Card: card }, { Chart: lazyChart })
    const source = (path: string, name: string) => ({ path, export: name })
    registry.add(
      { Card: source("a.tsx", "Card"), Chart: source("b.tsx", "Chart"), Badge: source("c.tsx", "Badge") },
      loadFrom
    )

    expect(registry.remove(["Card", "Chart", "Badge", "Unknown"])).toEqual(["Card", "Chart", "Badge"])
    expect(registry.component("Card")).toBe(card)
    expect(registry.loader("Card")).toBeUndefined()
    expect(registry.loader("Chart")).toBe(lazyChart)
    expect(registry.loader("Badge")).toBeUndefined()
    expect(registry.names).toEqual(["Card", "Chart"])
    expect(registry.moves("Card")).toBe(2)
    // Taken back once, it's not taken back again.
    expect(registry.remove(["Card"])).toEqual([])
  })

  it("goes up a revision once for each change, heard by those subscribed until they stop", () => {
    const registry = componentRegistry({ Card: card })
    let heard = 0
    const stop = registry.revision.subscribe(() => heard++)

    registry.add({ Badge: { path: "b.tsx", export: "Badge" }, Tag: { path: "t.tsx", export: "Tag" } }, loadFrom)
    registry.add({}, loadFrom)
    registry.remove(["Nothing"])
    expect(registry.revision.get()).toBe(1)
    expect(heard).toBe(1)

    stop()
    registry.remove(["Badge"])
    expect(registry.revision.get()).toBe(2)
    expect(heard).toBe(1)
  })
})
