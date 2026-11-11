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
import { jsonValue, type JsonValue } from "@parity-app/core/schema"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
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
async function read(containers: ContainerSpec[], code: string): Promise<JsonValue> {
  const result = await execute({ label: "Read", code }, snapshot(containers), hooks)

  if (!result.ok) {
    throw new Error(result.error)
  }

  return jsonValue.parse(JSON.parse(result.output.at(-1) ?? "null"))
}

/** A node as `Get` gives it: an object with a type and an id. */
const readNode = z.custom<DesignNode>(
  (value) => z.looseObject({ type: z.unknown(), id: z.unknown() }).safeParse(value).success
)

/** What the snippet below prints: the whole design, and each layer read on its own, or nothing where it isn't a node. */
const printedReads = z.object({ design: readNode, layers: z.array(readNode.optional().catch(undefined)) })

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
  if (node.kind === "text") {
    return []
  }

  if (node.kind === "component") {
    return [{ id: node.nodeId, children: Object.values(node.slots).flat().flatMap(renderOutline) }]
  }

  const text = node.children.find((child) => child.kind === "text")

  const outline: Outline = { id: node.nodeId, children: node.children.flatMap(renderOutline) }

  if (node.tag === "div") {
    outline.direction = node.style.flexDirection
  }

  if (node.style.gap !== undefined) {
    outline.gap = node.style.gap
  }

  if (text?.kind === "text") {
    outline.text = text.text
  }

  if (node.style.fontWeight !== undefined) {
    outline.weight = node.style.fontWeight
  }

  return [outline]
}

/**
 * What the canvas draws of the layers the agent read, by path: hidden layers left out, and an instance drawn as its
 * component's root. `tree` only says which paths there are; every value comes from `reads`.
 */
function readOutline(tree: EffectiveTree, reads: Map<string, DesignNode>): Outline[] {
  const node = reads.get(tree.path)

  if (!node) {
    throw new Error(`The agent didn't read ${tree.path}`)
  }

  if (node.hidden) {
    return []
  }

  if (node.type === "instance") {
    return tree.children.flatMap((child) => readOutline(child, reads)).map((root) => ({ ...root, id: tree.path }))
  }

  const style = node.style ?? {}

  const outline: Outline = { id: tree.path, children: tree.children.flatMap((child) => readOutline(child, reads)) }

  if (node.type === "layout") {
    outline.direction = style.direction ?? "column"
  }

  if (style.gap !== undefined) {
    outline.gap = spacing(style.gap)
  }

  if (node.type === "text") {
    outline.text = node.text
  }

  if (style.weight !== undefined) {
    outline.weight = String(style.weight)
  }

  return [outline]
}

function paths(tree: EffectiveTree): string[] {
  return [tree.path, ...tree.children.flatMap(paths)]
}

/** A layer's own values, without what's inside it. */
type OwnValues = Omit<DesignNode, "children" | "slots">

function own(node: DesignNode): OwnValues {
  if (node.type === "layout") {
    const { children: _children, ...rest } = node

    return rest
  }

  if (node.type === "component" || node.type === "instance") {
    const { slots: _slots, ...rest } = node

    return rest
  }

  return node
}

describe("Get in a state and mode", () => {
  const { designs, library, viewports, cases } = effectiveFixture

  for (const { name, design, state, variants } of cases) {
    for (const viewport of viewports) {
      it(`reads what resolveDesign draws: ${name}, ${viewport}`, async () => {
        const shown = { ...design, view: variants ? { ...design.view, variants } : { ...design.view } }
        const containers = designs.map((candidate) => (candidate.id === design.id ? shown : candidate))
        const context = { state: state ?? design.states[0], variants, viewport, library }
        const tree = effectiveTree(design, design.root.id, context)

        if (!tree) {
          throw new Error(`${design.id} has no root`)
        }

        const options = JSON.stringify({ state: context.state?.id, mode: `${viewport}-light` })
        const layers = paths(tree)

        const result = printedReads.parse(
          await read(
            containers,
            `const options = ${options}
Print(JSON.stringify({ design: Get("${design.id}", options), layers: ${JSON.stringify(layers)}.map((path) => Get("${design.id}/" + path, options)) }))`
          )
        )

        const reads = new Map<string, DesignNode>()

        for (const [index, layer] of result.layers.entries()) {
          if (layer) {
            reads.set(layers[index]!, layer)
          }
        }

        const drawn = resolveDesign(design.root, context.state, viewport, library, {
          params: design.params,
          choices: variants ?? design.view?.variants
        })

        expect(readOutline(tree, reads)).toEqual(drawn.flatMap(renderOutline))
        // The whole design read at once has the same layers as reading each one.
        const whole = result.design

        const walk = (node: DesignNode): [string, OwnValues][] => [
          [node.id, own(node)],
          ...(node.type === "layout" ? node.children.flatMap(walk) : [])
        ]

        for (const [id, values] of walk(whole)) {
          expect(values).toEqual(own(reads.get(id)!))
        }
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

describe("states changing what's inside an instance", () => {
  /** The fixture's profile screen, its instance named so a change can reach it by name. */
  function designs(): ContainerSpec[] {
    const copies = structuredClone(effectiveFixture.designs)
    const profile = copies.find((design) => design.id === "profile")!
    // SAFETY: the fixture's profile screen is a layout, its instance second.
    const page = profile.root as Extract<DesignNode, { type: "layout" }>
    page.children[1]!.name = "Person"
    const card = copies.find((design) => design.id === "card")!
    // SAFETY: the fixture's card is a layout, its avatar instance first.
    const body = card.root as Extract<DesignNode, { type: "layout" }>
    body.children[0]!.name = "Avatar"

    return copies
  }

  const shown = `const at = (path, state) => Get(path, { state })`

  it("adds a state that changes a layer inside an instance, by id or name, and leaves the base alone", async () => {
    const result = await read(
      designs(),
      `${shown}
const id = AddState("profile", { name: "Busy", changes: { "person/meta": { text: "Busy" }, "Person/Avatar/initials": { hidden: true } } })
Print(JSON.stringify([at("profile/person/meta", id).text, at("profile/person/avatar/initials", id).hidden, at("profile/person/meta", "base").text, at("profile/person/avatar/initials", "base").hidden ?? false, Designs().find((design) => design.id === "profile").states.length]))`
    )

    expect(result).toEqual(["Busy", true, "Joined 1843", false, 3])
  })

  it("gives a bound text's param a value on the instance in that state", async () => {
    const result = await read(
      designs(),
      `${shown}
const id = AddState("profile", { name: "Busy" })
UpdateState("profile", id, { changes: { "person/title": { text: "Grace Hopper" } } })
Print(JSON.stringify([at("profile/person/title", id).text, at("profile/person", id).args.title, at("profile/person/title", "base").text]))`
    )

    expect(result).toEqual(["Grace Hopper", "Grace Hopper", "Ada Lovelace"])
  })

  it("takes a state's change inside an instance back with null", async () => {
    const result = await read(
      designs(),
      `${shown}
UpdateState("profile", "selected", { changes: { "person/avatar/circle": null } })
Print(JSON.stringify([at("profile/person/avatar/circle", "selected").style.background, at("profile/person/title", "selected").text]))`
    )

    expect(result).toEqual(["primary", "Selected"])
  })

  it("updates a layer inside an instance in a state, or that copy alone in the base", async () => {
    const result = await read(
      designs(),
      `${shown}
Update("profile/person/meta", { text: "Picked" }, { state: "selected" })
Update("profile/Person/Avatar/initials", { style: { weight: 400 } })
Print(JSON.stringify([at("profile/person/meta", "selected").text, at("profile/person/meta", "base").text, Get("profile/person").overrides["avatar/initials"]]))`
    )

    expect(result).toEqual(["Picked", "Joined 1843", { text: "AL", style: { weight: 400 } }])
  })

  it("refuses a path that doesn't lead inside an instance", async () => {
    const unknown = await execute(
      {
        label: "Unknown",
        code: `AddState("profile", { name: "Busy", changes: { "person/nothing": { hidden: true } } })`
      },
      snapshot(designs()),
      hooks
    )

    expect(unknown.error).toContain('No layer "nothing" in card')

    const notInstance = await execute(
      { label: "Text", code: `Update("profile/heading/inner", { text: "Hi" }, { state: "selected" })` },
      snapshot(designs()),
      hooks
    )

    expect(notInstance.error).toContain("heading in profile isn't an instance")
  })
})

describe("Update taking a value away in a state", () => {
  const card: ContainerSpec = {
    id: "card",
    name: "Card",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "body", style: { gap: 2, padding: 3 }, children: [] },
    states: [
      { id: "base", name: "Base" },
      { id: "plain", name: "Plain" }
    ]
  }

  it("takes the base's gap away in that state only", async () => {
    const result = await read(
      [card],
      `Update("card/body", { unset: { style: ["gap"] } }, { state: "plain" })
Print(JSON.stringify([Get("card/body", { state: "plain" }).style, Get("card/body").style]))`
    )

    expect(result).toEqual([{ padding: 3 }, { gap: 2, padding: 3 }])
  })

  it("refuses a style key it doesn't know", async () => {
    const result = await execute(
      { label: "Unset", code: `Update("card/body", { unset: { style: ["colour"] } }, { state: "plain" })` },
      snapshot([card]),
      hooks
    )

    expect(result.ok).toBe(false)
  })
})
