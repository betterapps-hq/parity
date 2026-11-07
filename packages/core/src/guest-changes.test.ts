import { describe, expect, it } from "vite-plus/test"
import { codeChangeVersions, type GuestChanges, guestChanges, versionedSources } from "./guest-changes.ts"
import type { ComponentSource } from "./project.ts"

type Sources = Record<string, ComponentSource>

describe("guestChanges", () => {
  const badge = { path: "src/badge.tsx", export: "Badge" }
  const card = { path: "src/card.tsx", export: "Card" }
  const movedCard = { path: "src/cards/card.tsx", export: "Card" }

  it.each<{ name: string; before: Sources; after: Sources; expected: GuestChanges }>([
    {
      name: "gives one new to the list",
      before: { Badge: badge },
      after: { Badge: badge, Card: card },
      expected: { add: { Card: card }, drop: [] }
    },
    {
      name: "takes back one no longer listed",
      before: { Badge: badge, Card: card },
      after: { Card: card },
      expected: { add: {}, drop: ["Badge"] }
    },
    {
      name: "gives one again from the file it moved to",
      before: { Card: card },
      after: { Card: movedCard },
      expected: { add: { Card: movedCard }, drop: [] }
    },
    {
      name: "gives everything to a guest given nothing yet",
      before: {},
      after: { Badge: badge, Card: card },
      expected: { add: { Badge: badge, Card: card }, drop: [] }
    },
    {
      name: "changes nothing when every component stays where it was",
      before: { Badge: badge },
      after: { Badge: { ...badge } },
      expected: { add: {}, drop: [] }
    }
  ])("$name", ({ before, after, expected }) => {
    expect(guestChanges(before, after)).toEqual(expected)
  })

  it("compares only where a component comes from, not what else the list says about it", () => {
    const listed = { ...card, lazy: true }
    const confirmed = { ...card, lazy: true, as: "function" as const }
    expect(guestChanges({ Card: listed }, { Card: confirmed })).toEqual({ add: {}, drop: [] })
  })
})

describe("code changes (PAR-165)", () => {
  const sources = {
    Badge: { path: "src/badge.tsx", export: "Badge" },
    Card: { path: "./src/card.tsx", export: "Card" },
    CardTitle: { path: "src/card.tsx", export: "CardTitle" }
  }

  it("gives a component again when its code's version changes, and not while it stays", () => {
    const before = versionedSources(sources, { Card: 1 })
    expect(guestChanges(before, versionedSources(sources, { Card: 1 }))).toEqual({ add: {}, drop: [] })
    expect(guestChanges(before, versionedSources(sources, { Card: 2 })).add).toEqual({
      Card: { path: "./src/card.tsx", export: "Card", version: 2 }
    })
  })

  it("stamps every component in the files that changed, keeping the others' versions", () => {
    expect(codeChangeVersions(sources, ["src/card.tsx"], 5, { Badge: 3 })).toEqual({ Badge: 3, Card: 5, CardTitle: 5 })
    expect(codeChangeVersions(sources, ["src/other.tsx"], 6)).toEqual({})
  })

  it("leaves a component whose code hasn't changed without a version", () => {
    expect(versionedSources(sources, { Card: 5 }).Badge).toEqual({ path: "src/badge.tsx", export: "Badge" })
  })
})
