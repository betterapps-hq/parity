import { describe, expect, it } from "vite-plus/test"
import { ledger, ledgerChromium, owned, setsForOthers, specProperties } from "./ledger.ts"
import { styleKeys } from "./model.ts"
import { placements } from "./placements.ts"

const placed = placements.flatMap(({ properties }) => properties)

describe("the ledger", () => {
  it("places every property the spec data lists, and nothing else", () => {
    const listed = new Set(specProperties)

    expect(specProperties.filter((property) => !placed.includes(property))).toEqual([])
    expect(placed.filter((property) => !listed.has(property))).toEqual([])
  })

  it("places each property once", () => {
    expect(placed.filter((property, index) => placed.indexOf(property) !== index)).toEqual([])
  })

  it("counts the properties Chromium draws", () => {
    expect(ledgerChromium).toBe(156)
    expect(ledger.size).toBe(572)
  })

  it("gives one owner to a property", () => {
    const claimed = Object.values(owned).flat()

    expect(claimed.filter((property, index) => claimed.indexOf(property) !== index)).toEqual([])
  })

  it("has an owned list for every key, of properties it holds", () => {
    expect(Object.keys(owned).toSorted()).toEqual([...styleKeys].toSorted())

    const unknown = [...Object.values(owned), ...Object.values(setsForOthers)]
      .flat()
      .filter((property) => !ledger.has(property))

    expect(unknown).toEqual([])
  })

  it("names the owning key on a property's entry, and none on the CSS map's", () => {
    expect(ledger.get("align-self")).toMatchObject({ key: "alignSelf", section: "size", where: "control" })
    expect(ledger.get("line-height")).toMatchObject({ key: "lineHeight", tokens: ["leading", "spacing"] })
    expect(ledger.get("mix-blend-mode")?.key).toBeUndefined()
  })

  it("carries each property's grammar and Baseline status from the spec data", () => {
    expect(ledger.get("gap")).toMatchObject({ syntax: "<'row-gap'> <'column-gap'>?", baseline: "widely" })
    expect(ledger.get("text-wrap-style")?.baseline).toBe("newly")
    expect(ledger.get("corner-shape")?.baseline).toBe("limited")
  })

  it("only lets a key set another's property when it doesn't own it", () => {
    for (const [key, properties] of Object.entries(setsForOthers)) {
      const own: readonly string[] = Object.entries(owned).find(([owner]) => owner === key)?.[1] ?? []

      expect(properties.filter((property) => own.includes(property))).toEqual([])
    }
  })
})
