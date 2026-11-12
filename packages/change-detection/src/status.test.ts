import type { RenderNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { combineChanges, compareTraces, frameChange, nodeChange } from "./status.ts"
import type { FrameTrace } from "./trace.ts"

const hash = (seed: string) => seed.repeat(16).slice(0, 16)

/** The digests given so far, by the files they stand for. */
const digests = new Map<string, string>()

/** A trace of `files`, by path and a one-letter seed for each hash, whose digest follows from them. */
function trace(files: Record<string, string>, components?: Record<string, string[]>): FrameTrace {
  const hashed = Object.fromEntries(Object.entries(files).map(([path, seed]) => [path, hash(seed)]))
  // One digest for each set of files: the same files give the same digest, as the service's SHA-256 does.
  const listed = JSON.stringify(Object.entries(hashed).sort(([x], [y]) => x.localeCompare(y, "en")))
  const digest = digests.get(listed) ?? String(digests.size).padStart(40, "0")
  digests.set(listed, digest)

  return components ? { files: hashed, digest, components } : { files: hashed, digest }
}

const component = (nodeId: string, id: string, children: RenderNode[] = []): RenderNode => ({
  kind: "component",
  nodeId,
  component: id,
  props: {},
  slots: { children }
})

const element = (nodeId: string, children: RenderNode[]): RenderNode => ({
  kind: "element",
  nodeId,
  tag: "div",
  declarations: [],
  children
})

// A card holding a badge, beside a box holding a button.
const tree = [component("card", "Card", [component("badge", "Badge")]), element("box", [component("button", "Button")])]

const reads = {
  Card: ["src/card.tsx"],
  Badge: ["src/badge.tsx", "src/lib/utils.ts"],
  Button: ["src/button.tsx", "src/lib/utils.ts"]
}

const files = { "src/card.tsx": "a", "src/badge.tsx": "b", "src/button.tsx": "c", "src/lib/utils.ts": "d" }
const shared = { ...files, "src/index.css": "e", "package.json": "f" }

describe("compareTraces (PAR-997)", () => {
  it("can't say without a baseline or a trace", () => {
    expect(compareTraces(undefined, trace(files))).toEqual({ state: "unknown" })
    expect(compareTraces(trace(files), undefined)).toEqual({ state: "unknown" })
  })

  it("is unchanged for the same digest, and lists the files that differ, came or went otherwise", () => {
    expect(compareTraces(trace(files), trace(files))).toEqual({ state: "unchanged" })
    expect(
      compareTraces(trace(files), trace({ ...files, "src/badge.tsx": "9", "src/new.ts": "1", "src/card.tsx": "a" }))
    ).toEqual({ state: "changed", files: ["src/badge.tsx", "src/new.ts"] })
  })
})

describe("combineChanges (PAR-997)", () => {
  it("is changed when any part is, with every part's files", () => {
    expect(
      combineChanges([
        { state: "unchanged" },
        { state: "changed", files: ["b.ts"] },
        { state: "unknown" },
        { state: "changed", files: ["a.ts", "b.ts"] }
      ])
    ).toEqual({ state: "changed", files: ["a.ts", "b.ts"] })
  })

  it("can't say when a part can't and none changed, or there are none; else is unchanged", () => {
    expect(combineChanges([{ state: "unchanged" }, { state: "unknown" }])).toEqual({ state: "unknown" })
    expect(combineChanges([])).toEqual({ state: "unknown" })
    expect(combineChanges([{ state: "unchanged" }, { state: "unchanged" }])).toEqual({ state: "unchanged" })
  })
})

describe("frameChange (PAR-997)", () => {
  it("marks the node whose component's file changed, and the nodes holding it, but not the rest", () => {
    const change = frameChange(tree, trace(shared, reads), trace({ ...shared, "src/badge.tsx": "9" }, reads))
    expect(change.status).toEqual({ state: "changed", files: ["src/badge.tsx"] })
    expect(nodeChange(change, "badge")).toEqual({ state: "changed", files: ["src/badge.tsx"] })
    expect(nodeChange(change, "card")).toEqual({ state: "changed", files: ["src/badge.tsx"] })
    expect(nodeChange(change, "box")).toEqual({ state: "unchanged" })
    expect(nodeChange(change, "button")).toEqual({ state: "unchanged" })
  })

  it("marks every component that reads a file they share", () => {
    const change = frameChange(tree, trace(shared, reads), trace({ ...shared, "src/lib/utils.ts": "9" }, reads))
    expect(Object.keys(change.nodes ?? {}).sort((a, b) => a.localeCompare(b, "en"))).toEqual([
      "badge",
      "box",
      "button",
      "card"
    ])
  })

  it("marks every node when a file no component reads changed, such as a stylesheet", () => {
    const change = frameChange(tree, trace(shared, reads), trace({ ...shared, "src/index.css": "9" }, reads))
    expect(Object.keys(change.nodes ?? {}).sort((a, b) => a.localeCompare(b, "en"))).toEqual([
      "badge",
      "box",
      "button",
      "card"
    ])
  })

  it("marks a component that started reading a file", () => {
    const now = { ...reads, Button: [...reads.Button, "src/icon.tsx"] }
    const change = frameChange(tree, trace(shared, reads), trace({ ...shared, "src/icon.tsx": "1" }, now))
    expect(nodeChange(change, "button")).toEqual({ state: "changed", files: ["src/icon.tsx"] })
    expect(nodeChange(change, "card")).toEqual({ state: "unchanged" })
  })

  it("gives every node the frame's status when it's unchanged, unknown, or traced without components", () => {
    expect(nodeChange(frameChange(tree, trace(shared, reads), trace(shared, reads)), "badge")).toEqual({
      state: "unchanged"
    })
    expect(nodeChange(frameChange(tree, undefined, trace(shared, reads)), "badge")).toEqual({ state: "unknown" })
    const old = frameChange(tree, trace(shared), trace({ ...shared, "src/badge.tsx": "9" }))
    expect(nodeChange(old, "button")).toEqual({ state: "changed", files: ["src/badge.tsx"] })
  })
})
