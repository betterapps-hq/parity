import { describe, expect, it } from "vite-plus/test"
import { drawnRoute, lastStaticSegment, type RouteSegment, routeParams, sameSegments } from "./routes.ts"

const team: RouteSegment[] = [
  { type: "static", value: "team" },
  { type: "param", name: "teamId" },
  { type: "static", value: "files" },
  { type: "catchAll", name: "path" }
]

describe("routes (PAR-1132)", () => {
  it("names a route's params in order, a catch-all's among them", () => {
    expect(routeParams({ segments: team })).toEqual(["teamId", "path"])
    expect(routeParams({ segments: [{ type: "optionalCatchAll", name: "slug" }] })).toEqual(["slug"])
    expect(routeParams({ segments: [] })).toEqual([])
  })

  it("tells routes that match the same URLs from ones that don't", () => {
    expect(sameSegments({ segments: team }, { segments: [...team] })).toBe(true)
    expect(sameSegments({ segments: [] }, { segments: [] })).toBe(true)
    expect(sameSegments({ segments: team }, { segments: team.slice(0, 2) })).toBe(false)
    expect(
      sameSegments({ segments: [{ type: "param", name: "id" }] }, { segments: [{ type: "catchAll", name: "id" }] })
    ).toBe(false)
    expect(
      sameSegments({ segments: [{ type: "static", value: "id" }] }, { segments: [{ type: "param", name: "id" }] })
    ).toBe(false)
  })

  it("finds the last fixed part of a route's URL, if it has one", () => {
    expect(lastStaticSegment({ segments: team })).toBe("files")
    expect(lastStaticSegment({ segments: [{ type: "param", name: "id" }] })).toBeUndefined()
  })

  it("leaves a parallel route's slot and an intercepting route off the canvas", () => {
    expect(drawnRoute({})).toBe(true)
    expect(drawnRoute({ slot: "modal" })).toBe(false)
    expect(drawnRoute({ intercepts: "/photo/[id]" })).toBe(false)
  })
})
