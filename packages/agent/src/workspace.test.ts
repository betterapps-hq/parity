import {
  type ContainerSpec,
  defaultModeSettings,
  type DesignNode,
  type EffectiveTree,
  effectiveTree,
  type RenderNode,
  resolveDesign,
  spacing
} from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import { execute } from "./run.ts"
import type { AgentEvent, AgentHooks, AgentSnapshot } from "./types.ts"

const events: AgentEvent[] = []
const hooks: AgentHooks = {
  presence: (batch) => events.push(...batch),
  render: async ({ mode }) => ({ width: mode.width, height: 600, nodes: [], overflowsX: false, unknownComponents: [] })
}

function snapshot(containers: ContainerSpec[]): AgentSnapshot {
  return {
    tab: `tab-${Math.random()}`,
    components: [],
    tokens: [],
    theme: [],
    modes: defaultModeSettings,
    documents: [{ path: "app.par", document: { version: 3, containers } }],
    mainDocument: "app.par",
    libraryDesigns: [],
    tokenOverrides: [],
    props: {},
    selection: {},
    bounds: {}
  }
}

/** Runs a snippet whose last line prints JSON, and gives back what it printed. */
async function read(containers: ContainerSpec[], code: string): Promise<unknown> {
  const result = await execute({ label: "Read", code }, snapshot(containers), hooks)
  if (!result.ok) throw new Error(result.error)
  return JSON.parse(result.output.at(-1) ?? "null")
}

function isNode(value: unknown): value is DesignNode {
  return typeof value === "object" && value !== null && "type" in value && "id" in value
}

/** What a drawn node says that both the agent's reads and the renderer's tree carry. */
interface Outline {
  id: string
  direction?: string
  gap?: string
  text?: string
  weight?: string
  children: Outline[]
}

function renderOutline(node: RenderNode): Outline[] {
  if (node.kind === "text") return []
  if (node.kind === "component") {
    return [{ id: node.nodeId, children: Object.values(node.slots).flat().flatMap(renderOutline) }]
  }
  const text = node.children.find((child) => child.kind === "text")
  return [
    {
      id: node.nodeId,
      ...(node.tag === "div" ? { direction: node.style.flexDirection } : {}),
      ...(node.style.gap === undefined ? {} : { gap: node.style.gap }),
      ...(text?.kind === "text" ? { text: text.text } : {}),
      ...(node.style.fontWeight === undefined ? {} : { weight: node.style.fontWeight }),
      children: node.children.flatMap(renderOutline)
    }
  ]
}

/**
 * What the canvas draws of the layers the agent read, by path: hidden layers left out, and an instance drawn as its
 * component's root. `tree` only says which paths there are; every value comes from `reads`.
 */
function readOutline(tree: EffectiveTree, reads: Map<string, DesignNode>): Outline[] {
  const node = reads.get(tree.path)
  if (!node) throw new Error(`The agent didn't read ${tree.path}`)
  if (node.hidden) return []
  if (node.type === "instance") {
    return tree.children.flatMap((child) => readOutline(child, reads)).map((root) => ({ ...root, id: tree.path }))
  }
  const style = node.style ?? {}
  return [
    {
      id: tree.path,
      ...(node.type === "layout" ? { direction: style.direction ?? "column" } : {}),
      ...(style.gap === undefined ? {} : { gap: spacing(style.gap) }),
      ...(node.type === "text" ? { text: node.text } : {}),
      ...(style.weight === undefined ? {} : { weight: String(style.weight) }),
      children: tree.children.flatMap((child) => readOutline(child, reads))
    }
  ]
}

function paths(tree: EffectiveTree): string[] {
  return [tree.path, ...tree.children.flatMap(paths)]
}

/** A layer's own values, without what's inside it. */
function own(node: DesignNode): Record<string, unknown> {
  const { children: _children, slots: _slots, ...rest } = node as DesignNode & { children?: unknown; slots?: unknown }
  return rest
}

describe("Get in a state and mode", () => {
  const { designs, library, viewports, cases } = effectiveFixture
  for (const { name, design, state, variants } of cases) {
    for (const viewport of viewports) {
      it(`reads what resolveDesign draws: ${name}, ${viewport}`, async () => {
        const shown = { ...design, view: { ...design.view, ...(variants ? { variants } : {}) } }
        const containers = designs.map((candidate) => (candidate.id === design.id ? shown : candidate))
        const context = { state: state ?? design.states[0], variants, viewport, library }
        const tree = effectiveTree(design, design.root.id, context)
        if (!tree) throw new Error(`${design.id} has no root`)
        const options = JSON.stringify({ state: context.state?.id, mode: `${viewport}-light` })
        const layers = paths(tree)
        const result = await read(
          containers,
          `const options = ${options}
Print(JSON.stringify({ design: Get("${design.id}", options), layers: ${JSON.stringify(layers)}.map((path) => Get("${design.id}/" + path, options)) }))`
        )
        if (typeof result !== "object" || result === null || !("design" in result) || !("layers" in result)) {
          throw new Error("The snippet printed something else")
        }
        const reads = new Map<string, DesignNode>()
        for (const [index, layer] of (Array.isArray(result.layers) ? result.layers : []).entries()) {
          if (isNode(layer)) reads.set(layers[index]!, layer)
        }
        const drawn = resolveDesign(design.root, context.state, viewport, library, {
          params: design.params,
          choices: variants ?? design.view?.variants
        })
        expect(readOutline(tree, reads)).toEqual(drawn.flatMap(renderOutline))
        // The whole design read at once has the same layers as reading each one.
        const whole = result.design
        if (!isNode(whole)) throw new Error("Get returned no node")
        const walk = (node: DesignNode): [string, Record<string, unknown>][] => [
          [node.id, own(node)],
          ...(node.type === "layout" ? node.children.flatMap(walk) : [])
        ]
        for (const [id, values] of walk(whole)) expect(values).toEqual(own(reads.get(id)!))
      })
    }
  }

  const labelled: ContainerSpec = {
    id: "badge",
    name: "Badge",
    kind: "component",
    position: { x: 0, y: 0 },
    params: { label: { type: "text", default: "Bound label" } },
    root: {
      type: "layout",
      id: "frame",
      children: [{ type: "text", id: "label", text: "Raw label", bind: { text: "label" } }]
    },
    states: [
      { id: "base", name: "Base" },
      { id: "quiet", name: "Quiet", overrides: { frame: { style: { gap: 2 } } } }
    ]
  }

  it("shows a bound text's value, keeping the binding, and reads the stored text without a state", async () => {
    const result = await read(
      [labelled],
      `Print(JSON.stringify([Get("badge/label", { state: "base" }), Get("badge", { state: "quiet" }).children[0], Get("badge/label")]))`
    )
    expect(result).toEqual([
      { type: "text", id: "label", text: "Bound label", bind: { text: "label" } },
      { type: "text", id: "label", text: "Bound label", bind: { text: "label" } },
      { type: "text", id: "label", text: "Raw label", bind: { text: "label" } }
    ])
  })

  it("visits nodes as drawn, and stored without a state", async () => {
    const result = await read(
      [labelled],
      `const text = (node, at) => (node.type === "text" ? [at.path, node.text] : undefined)
Print(JSON.stringify([Get("badge", text, { state: "quiet" }), Get("badge", text)]))`
    )
    expect(result).toEqual([[["badge/label", "Bound label"]], [["badge/label", "Raw label"]]])
  })

  /** Components each placing the next one twice, so expanding the first draws 2^levels copies of the last. */
  function nesting(levels: number): ContainerSpec[] {
    return Array.from({ length: levels + 1 }, (_, level): ContainerSpec => {
      const next = (copy: number): DesignNode => ({ type: "instance", id: `copy${copy}`, design: `level${level + 1}` })
      return {
        id: `level${level}`,
        name: `Level ${level}`,
        kind: "component",
        position: { x: level * 400, y: 0 },
        root:
          level === levels
            ? { type: "text", id: "leaf", text: "Leaf" }
            : { type: "layout", id: "row", children: [next(1), next(2)] },
        states: [{ id: "base", name: "Base" }]
      }
    })
  }

  it("reads and visits instances without expanding what's inside them", async () => {
    // Expanding all 2^24 copies would take far longer than a snippet's 5 seconds, so these only finish if it's skipped.
    const started = performance.now()
    const result = await read(
      nesting(24),
      `const options = { state: "base" }
const ids = Get("level0", (node) => node.id, options)
Print(JSON.stringify([Get("level0", options).children.map((child) => child.design), Get("level0/copy1", options).design, Get("level0/copy1/row", options).children.length, ids]))`
    )
    expect(result).toEqual([["level1", "level1"], "level1", 2, ["row", "copy1", "copy2"]])
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it("reads inside an instance by its path, with the args a mode patches over it", async () => {
    const result = await read(
      effectiveFixture.designs,
      `const at = (path) => Get(path, { state: "selected", mode: "mobile-light" })
Print(JSON.stringify([at("profile/person").args, at("profile/person/title").text, at("profile/person/meta").hidden, Get("profile/person").args]))`
    )
    expect(result).toEqual([
      { title: "Ada Lovelace", layout: "stacked" },
      "Selected",
      true,
      { title: "Ada Lovelace", layout: "inline" }
    ])
  })
})
