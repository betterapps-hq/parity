import { type CanvasDocument, defaultModeSettings, parseCanvasDocument, type ReferenceSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { mergeAgentChanges } from "./design-changes.ts"
import type { DesignSnapshot } from "./history.ts"
import {
  addReferences,
  changeReference,
  moreFromApp,
  nearestBox,
  referenceExpired,
  referenceFrom,
  referenceRow,
  referenceSearch,
  referenceSize
} from "./references.ts"
import { noTokenEdits } from "./token-edits.ts"

function snapshot(document: CanvasDocument): DesignSnapshot {
  return { documents: new Map([["app.par", document]]), modes: defaultModeSettings, tokens: noTokenEdits }
}

function reference(id: string, change: Partial<ReferenceSpec> = {}): ReferenceSpec {
  return {
    id,
    connector: "mobbin",
    sourceId: `screen-${id}`,
    app: "Ledgerly",
    platform: "web",
    link: "https://mobbin.com/screens/1",
    image: { url: "https://images.example/1.png", width: 768, height: 480 },
    position: { x: 0, y: 0 },
    query: "pricing page",
    ...change
  }
}

const empty: CanvasDocument = { version: 4, containers: [] }

describe("references in a project file", () => {
  it("are kept beside notes and read back from the file", () => {
    const added = addReferences(snapshot(empty), "app.par", [reference("a"), reference("b", { by: "Claude" })])
    const document = added.documents.get("app.par")!

    expect(document.references?.map((each) => each.id)).toEqual(["a", "b"])
    expect(parseCanvasDocument(structuredClone(document))).toEqual(document)
  })

  it("start a file that doesn't exist yet", () => {
    const added = addReferences({ documents: new Map(), modes: defaultModeSettings, tokens: noTokenEdits }, "new.par", [
      reference("a")
    ])

    expect(added.documents.get("new.par")).toEqual({ version: 4, containers: [], references: [reference("a")] })
  })

  it("change a note or a place, and go when the change takes them out", () => {
    const added = addReferences(snapshot(empty), "app.par", [reference("a")])
    const ref = { path: "app.par", id: "a" }

    const noted = changeReference(added, ref, (current) => ({ ...current, note: "Yearly is picked first" }))

    expect(noted.documents.get("app.par")?.references?.[0]?.note).toBe("Yearly is picked first")
    expect(changeReference(added, ref, (current) => current)).toBe(added)
    expect(changeReference(added, { path: "app.par", id: "missing" }, () => undefined)).toBe(added)
    expect(changeReference(added, ref, () => undefined).documents.get("app.par")).toEqual(empty)
  })

  it("come in with an agent's call, even when its designs are all as they were", () => {
    const merged = mergeAgentChanges(
      snapshot(empty),
      [],
      undefined,
      [],
      [{ path: "app.par", reference: reference("a", { by: "Claude", note: "Two plans only" }) }]
    )

    expect(merged.conflicts).toEqual([])
    expect(merged.snapshot.documents.get("app.par")?.references?.[0]).toMatchObject({ by: "Claude" })
  })
})

describe("a reference on the canvas", () => {
  it("is a laptop's width for the web and a phone's for iOS, as tall as its picture", () => {
    expect(referenceSize(reference("a"))).toEqual({ width: 1280, height: 800 })
    expect(referenceSize(reference("a", { platform: "ios", image: { url: "x", width: 390, height: 1200 } }))).toEqual({
      width: 390,
      height: 1200
    })
    expect(referenceSize(reference("a", { image: { url: "x" } }))).toEqual({ width: 1280, height: 800 })
  })

  it("shows its app's name once its picture's link has stopped working", () => {
    const expiring = reference("a", { image: { url: "x", expiresAt: 1000 } })

    expect(referenceExpired(expiring, 999)).toBe(false)
    expect(referenceExpired(expiring, 1000)).toBe(true)
    expect(referenceExpired(reference("a"), Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})

describe("where placed references land", () => {
  const design = { minX: 0, minY: 100, maxX: 1000, maxY: 900 }

  const sizes = [
    { width: 1280, height: 800 },
    { width: 390, height: 844 }
  ]

  it("is a row beside the design, top-aligned with it", () => {
    expect(referenceRow({ beside: design }, sizes, [])).toEqual([
      { x: 1160, y: 100 },
      { x: 2488, y: 100 }
    ])
  })

  it("is a new row under the last batch beside it", () => {
    const first = { minX: 1160, minY: 100, maxX: 2440, maxY: 900 }

    expect(referenceRow({ beside: design }, sizes, [first])[0]).toEqual({ x: 1160, y: 1060 })
  })

  it("leaves out references somewhere else on the canvas", () => {
    const elsewhere = { minX: -3000, minY: 100, maxX: -1000, maxY: 900 }

    expect(referenceRow({ beside: design }, sizes, [elsewhere])[0]).toEqual({ x: 1160, y: 100 })
  })

  it("moves right past another design in the way", () => {
    const neighbor = { minX: 1500, minY: 0, maxX: 2500, maxY: 600 }

    expect(referenceRow({ beside: design }, sizes, [], [design, neighbor])[0]).toEqual({ x: 2660, y: 100 })
  })

  it("is centered on the view with no design to sit beside", () => {
    expect(referenceRow({ around: { x: 0, y: 0 } }, sizes, [])).toEqual([
      { x: -859, y: -422 },
      { x: 469, y: -422 }
    ])
  })
})

describe("the search Find references opens on", () => {
  it("is the design's name, on the web for a desktop preview and on iOS for a phone's", () => {
    expect(referenceSearch("Pricing", 1280)).toEqual({ query: "pricing page", filters: { platform: "web" } })
    expect(referenceSearch(" Paywall ", 390)).toEqual({ query: "paywall screen", filters: { platform: "ios" } })
  })

  it("is the app's name for more of its screens, on the reference's platform", () => {
    expect(moreFromApp(reference("a", { platform: "ios" }))).toEqual({
      query: "Ledgerly",
      filters: { platform: "ios" }
    })
  })
})

describe("a screen a search found, as a reference", () => {
  const screen = {
    connector: "mobbin",
    id: "screen-1",
    title: "Ledgerly",
    platform: "web" as const,
    link: "https://mobbin.com/screens/1",
    image: { url: "https://images.example/1.png", width: 768, height: 480, expiresAt: 5000 }
  }

  it("keeps its source, app, platform, link, picture and how it was found", () => {
    const origin = { query: "pricing page", by: "Claude", note: " ", design: "pricing" }

    expect(referenceFrom(screen, "a", { x: 10, y: 20 }, origin)).toEqual({
      id: "a",
      connector: "mobbin",
      sourceId: "screen-1",
      app: "Ledgerly",
      platform: "web",
      link: "https://mobbin.com/screens/1",
      image: { url: "https://images.example/1.png", width: 768, height: 480, expiresAt: 5000 },
      position: { x: 10, y: 20 },
      query: "pricing page",
      by: "Claude",
      design: "pricing"
    })
  })
})

describe("the design a reference is for, when none was recorded", () => {
  const pricing = { name: "Pricing", minX: 0, minY: 0, maxX: 1280, maxY: 900 }
  const checkout = { name: "Checkout", minX: 3000, minY: 0, maxX: 4280, maxY: 900 }

  it("is the one whose edge is nearest", () => {
    const reference = { minX: 1440, minY: 0, maxX: 2720, maxY: 800 }

    expect(nearestBox(reference, [checkout, pricing])?.name).toBe("Pricing")
  })

  it("is the one it overlaps, and nothing when there are no designs", () => {
    const reference = { minX: 3500, minY: 500, maxX: 4780, maxY: 1300 }

    expect(nearestBox(reference, [pricing, checkout])?.name).toBe("Checkout")
    expect(nearestBox(reference, [])).toBeUndefined()
  })

  it("is nothing when every design is further than the distance given", () => {
    const reference = { minX: 1440, minY: 0, maxX: 2720, maxY: 800 }

    expect(nearestBox(reference, [pricing], 160)?.name).toBe("Pricing")
    expect(nearestBox(reference, [pricing], 159)).toBeUndefined()
  })
})
