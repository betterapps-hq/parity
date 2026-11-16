import {
  type ContainerSpec,
  defaultModeSettings,
  type DesignNode,
  type EffectiveTree,
  effectiveTree,
  type RenderNode,
  resolveDesign,
  spacing,
  fontWeightNumber
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
    documents: [{ path: "app.par", document: { version: 4, containers } }],
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
  const css = Object.fromEntries(node.declarations.map(({ property, value }) => [property, value]))
  const outline: Outline = { id: node.nodeId, children: node.children.flatMap(renderOutline) }

  if (node.tag === "div") {
    outline.direction = css["flex-direction"]
  }

  if (css.gap !== undefined) {
    outline.gap = css.gap
  }

  if (text?.kind === "text") {
    outline.text = text.text
  }

  if (css["font-weight"] !== undefined) {
    outline.weight = css["font-weight"]
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
    outline.direction = style.flexDirection ?? "column"
  }

  if (style.gap !== undefined) {
    outline.gap = spacing(style.gap)
  }

  if (node.type === "text") {
    outline.text = node.text
  }

  if (style.fontWeight !== undefined) {
    outline.weight = String(fontWeightNumber(style.fontWeight))
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
        const context = { state: state ?? design.states![0], variants, viewport, library }
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
      { id: "quiet", name: "Quiet", overrides: { frame: { style: { gap: { step: 2 } } } } }
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

describe("Get reading the layers an instance fills its slots with (PAR-966)", () => {
  const panel: ContainerSpec = {
    id: "panel",
    name: "Panel",
    kind: "component",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "panel",
      children: [{ type: "layout", id: "body", slot: "content", children: [] }]
    }
  }

  const page: ContainerSpec = {
    id: "page",
    name: "Page",
    kind: "component",
    position: { x: 600, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        {
          type: "instance",
          id: "copy",
          design: "panel",
          slots: {
            content: [
              {
                type: "layout",
                id: "fill",
                children: [
                  { type: "text", id: "status", text: "Saving", responsive: { mobile: { text: "Saving offline" } } }
                ]
              }
            ]
          }
        },
        { type: "layout", id: "spacer", children: [] },
        { type: "instance", id: "blank", design: "panel", slots: { content: [] } }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "done", name: "Done", overrides: { status: { text: "Saved" } } }
    ]
  }

  it("reads them as the state and mode draw them, on the instance they fill", async () => {
    const result = await read(
      [panel, page],
      `const status = (options) => Get("page/copy", options).slots.content[0].children[0].text
Print(JSON.stringify([status({ state: "done" }), status({ mode: "mobile-light" })]))`
    )

    expect(result).toEqual(["Saved", "Saving offline"])
  })

  it("leaves them out past the depth asked for, as it does a layout's children", async () => {
    const result = await read(
      [panel, page],
      `Print(JSON.stringify([Get("page", { depth: 1 }).children, Get("page", { depth: 2 }).children[0].slots.content[0].children]))`
    )

    // Past the depth an empty layout reads as empty, and a slot as "…" even when nothing fills it.
    expect(result).toEqual([
      [
        { type: "instance", id: "copy", design: "panel", slots: { content: ["…"] } },
        { type: "layout", id: "spacer", children: [] },
        { type: "instance", id: "blank", design: "panel", slots: { content: ["…"] } }
      ],
      ["…"]
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
Print(JSON.stringify([at("profile/person/avatar/circle", "selected").style.fills[0].color.token, at("profile/person/title", "selected").text]))`
    )

    expect(result).toEqual(["primary", "Selected"])
  })

  it("updates a layer inside an instance in a state, or that copy alone in the base", async () => {
    const result = await read(
      designs(),
      `${shown}
Update("profile/person/meta", { text: "Picked" }, { state: "selected" })
Update("profile/Person/Avatar/initials", { style: { fontWeight: { value: 400 } } })
Print(JSON.stringify([at("profile/person/meta", "selected").text, at("profile/person/meta", "base").text, Get("profile/person").overrides["avatar/initials"]]))`
    )

    expect(result).toEqual(["Picked", "Joined 1843", { text: "AL", style: { fontWeight: { value: 400 } } }])
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

    expect(notInstance.error).toContain("goes inside heading, which isn't an instance")
  })
})

describe("a state keeping a change equal to what's under it (PAR-882)", () => {
  const stored = `const overrides = (state) => GetDesign("profile").states.find((each) => each.id === state).overrides`

  it("keeps an AddState change that matches the base, on the design's own layers and inside an instance", async () => {
    const result = await read(
      structuredClone(effectiveFixture.designs),
      `${stored}
const id = AddState("profile", { name: "Pinned", changes: { heading: { text: "Profile" }, page: { style: { gap: { step: 4 } } }, "person/meta": { text: "Joined 1843", hidden: false } } })
Print(JSON.stringify(overrides(id)))`
    )

    expect(result).toEqual({
      heading: { text: "Profile" },
      page: { style: { gap: { step: 4 } } },
      "person/meta": { text: "Joined 1843", hidden: false }
    })
  })

  it("keeps an Update in a state that matches what the state shows", async () => {
    const result = await read(
      structuredClone(effectiveFixture.designs),
      `${stored}
Update("profile/heading", { text: "Profile", style: { fontWeight: { value: 700 } } }, { state: "selected" })
Update("profile/heading", { style: { fontWeight: null } }, { state: "selected" })
Print(JSON.stringify(overrides("selected").heading))`
    )

    expect(result).toEqual({ text: "Profile" })
  })
})

describe("Responsive merging with a viewport's earlier patch (PAR-884)", () => {
  it("merges style and props key by key, and null takes one key away", async () => {
    const result = await read(
      structuredClone(effectiveFixture.designs),
      `Responsive("profile/page", "mobile", { style: { gap: { step: 2 } } })
const merged = Get("profile/page").responsive.mobile
Responsive("profile/person", "mobile", { props: { title: "Ada" } })
Responsive("profile/page", "mobile", { style: { padding: null }, hidden: true })
Responsive("profile/page", "mobile", { hidden: null })
Print(JSON.stringify([merged, Get("profile/page").responsive.mobile, Get("profile/person").responsive.mobile]))`
    )

    expect(result).toEqual([
      { style: { padding: { step: 4 }, gap: { step: 2 } } },
      { style: { gap: { step: 2 } } },
      { props: { layout: "stacked", title: "Ada" } }
    ])
  })

  it("takes keys away with unset, takes them all back with null, and drops the whole patch with null (PAR-1050)", async () => {
    const result = await read(
      structuredClone(effectiveFixture.designs),
      `Responsive("profile/heading", "mobile", { unset: { style: ["opacity"] }, style: { opacity: { step: 50 } } })
const taken = Get("profile/heading").responsive.mobile
Responsive("profile/heading", "mobile", { unset: null })
const back = Get("profile/heading").responsive.mobile
Responsive("profile/heading", "mobile", { text: null })
const emptied = Get("profile/heading").responsive
Responsive("profile/page", "mobile", null)
Print(JSON.stringify([taken, back, emptied ?? "none", Get("profile/page").responsive ?? "none"]))`
    )

    expect(result).toEqual([{ text: "Me", unset: { style: ["opacity"] } }, { text: "Me" }, "none", "none"])
  })
})

describe("instance overrides keyed by a layer's name (PAR-887)", () => {
  /** The fixture's designs, the card's meta and avatar named so an override can reach them by name. */
  function designs(): ContainerSpec[] {
    const copies = structuredClone(effectiveFixture.designs)
    const card = copies.find((design) => design.id === "card")!
    // SAFETY: the fixture's card is a layout, its avatar instance first and its copy layout second.
    const body = card.root as Extract<DesignNode, { type: "layout" }>
    body.children[0]!.name = "Avatar"
    // SAFETY: the card's second child is its copy layout, holding the title and then the meta text.
    const copy = body.children[1] as Extract<DesignNode, { type: "layout" }>
    copy.children[1]!.name = "Meta"

    return copies
  }

  it("stores an inserted instance's overrides by id, whether they name layers by id or name", async () => {
    const result = await read(
      designs(),
      `const id = Insert("profile/page", { type: "instance", design: "card", overrides: { Meta: { text: "Hi" }, "Avatar/initials": { hidden: true }, title: { text: "Ada" } } })
Print(JSON.stringify([Get("profile/" + id).overrides, Get("profile/" + id + "/meta", { state: "base" }).text]))`
    )

    expect(result).toEqual([
      { meta: { text: "Hi" }, "avatar/initials": { hidden: true }, title: { text: "Ada" } },
      "Hi"
    ])
  })

  it("refuses an override for a layer the component doesn't have", async () => {
    const result = await execute(
      {
        label: "Unknown",
        code: `Insert("profile/page", { type: "instance", design: "card", overrides: { Subtitle: { text: "Hi" } } })`
      },
      snapshot(designs()),
      hooks
    )

    expect(result.error).toContain('No layer "Subtitle" in card')
  })
})

describe("Update taking a value away in a state", () => {
  const card: ContainerSpec = {
    id: "card",
    name: "Card",
    kind: "component",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "body", style: { gap: { step: 2 }, padding: { step: 3 } }, children: [] },
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

    expect(result).toEqual([{ padding: { step: 3 } }, { gap: { step: 2 }, padding: { step: 3 } }])
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

describe("Copy into a design, as a paste does (PAR-1048)", () => {
  /** A card whose title is bound to its `title` param, and a page with no params. */
  const designs = (): ContainerSpec[] => [
    {
      id: "card",
      name: "Card",
      kind: "component",
      position: { x: 0, y: 0 },
      params: { title: { type: "text", default: "Welcome" } },
      root: {
        type: "layout",
        id: "body",
        children: [{ type: "text", id: "title", name: "Title", text: "Title", bind: { text: "title" } }]
      }
    },
    {
      id: "page",
      name: "Page",
      kind: "screen",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "main", children: [] }
    }
  ]

  it("copies the layer as shown, bound where the design has the param and unbound where it doesn't", async () => {
    const result = await read(
      designs(),
      `const within = Copy("card/title", "card/body", { name: "Again" })
const across = Copy("card/title", "page")
Print(JSON.stringify([Get("card/" + within), Get("page/" + across)]))`
    )

    expect(result).toEqual([
      { type: "text", id: expect.any(String), name: "Again", text: "Welcome", bind: { text: "title" } },
      { type: "text", id: expect.any(String), name: "Title", text: "Welcome" }
    ])
  })
})

describe("Accessibility props on layout and text layers (PAR-913)", () => {
  const cell: ContainerSpec = {
    id: "cell",
    name: "Cell",
    kind: "component",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "row", children: [{ type: "text", id: "dash", tag: "span", text: "–" }] },
    states: [
      { id: "base", name: "Base" },
      { id: "busy", name: "Busy" }
    ]
  }

  it("names a layer, in the design and in a state, and takes a name away with null", async () => {
    const result = await read(
      [cell],
      `Update("cell/dash", { props: { "aria-label": "Doesn't apply" } })
Update("cell/row", { props: { role: "row", "aria-busy": true } }, { state: "busy" })
Update("cell/row", { props: { role: "row" } })
Update("cell/row", { props: { role: null } })
Print(JSON.stringify([Get("cell/dash").props, Get("cell/row", { state: "busy" }).props, Get("cell/row").props ?? {}]))`
    )

    expect(result).toEqual([{ "aria-label": "Doesn't apply" }, { role: "row", "aria-busy": true }, {}])
  })

  it.each([
    `Update("cell/dash", { props: { onClick: "save" } })`,
    `Update("cell/row", { props: { className: "row" } }, { state: "busy" })`
  ])("refuses a prop that isn't an accessibility attribute: %s", async (code) => {
    const result = await execute({ label: "Name", code }, snapshot([structuredClone(cell)]), hooks)

    expect(result.error).toContain("A layout or text layer takes role, id and aria-* props, not")
  })

  it("refuses a layer inserted with another prop", async () => {
    const result = await execute(
      { label: "Insert", code: `Insert("cell/row", { type: "text", text: "Hi", props: { title: "Hi" } })` },
      snapshot([structuredClone(cell)]),
      hooks
    )

    expect(result.error).toContain('a layout or text layer takes role, id and aria-* props, not "title"')
  })
})

describe("Update taking a prop away with null, and paths that can't be right (PAR-885)", () => {
  const table: ContainerSpec = {
    id: "table",
    name: "Table",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "body",
      style: { gap: { step: 2 }, padding: { step: 3 } },
      children: [{ type: "component", id: "head", component: "TableHead", props: { "aria-sort": "ascending" } }]
    }
  }

  function withTableHead(): AgentSnapshot {
    return {
      ...snapshot([structuredClone(table)]),
      components: ["TableHead"],
      props: {
        TableHead: {
          name: "TableHead",
          path: "src/components/ui/table.tsx",
          props: [
            { name: "aria-sort", kind: "enum", options: ["none", "ascending", "descending", "other"], group: "own" }
          ]
        }
      }
    }
  }

  it("removes an enum prop set to null, without warning that null isn't an option", async () => {
    const result = await execute(
      {
        label: "Null",
        code: `Update("table/head", { props: { "aria-sort": null } })
Update("table/body", { style: { gap: null } })
Print(JSON.stringify([Get("table/head").props ?? {}, Get("table/body").style]))`
      },
      withTableHead(),
      hooks
    )

    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.output.at(-1)!)).toEqual([{}, { padding: { step: 3 } }])
    expect(result.warnings.join("\n")).not.toContain("aria-sort")
  })

  async function failure(code: string): Promise<string | undefined> {
    return (await execute({ label: "Path", code }, snapshot(structuredClone(effectiveFixture.designs)), hooks)).error
  }

  it("says a path has a part too many, and shows design/node, rather than naming a missing design", async () => {
    expect(await failure(`Delete("profile/page/heading")`)).toContain(
      `Path "profile/page/heading" has 3 parts. A node path is design/node, without the node's parents, such as "profile/heading".`
    )
    expect(await failure(`Update("profile/page/heading", { text: "Hi" })`)).toContain(
      'Path "profile/page/heading" goes inside page, which isn\'t an instance. A node path is design/node, such as "profile/heading", or design/instance/layer for a layer inside an instance.'
    )
  })

  it("names the design a path starts with when it's missing", async () => {
    expect(await failure(`Delete("nope/page/heading")`)).toContain('No design "nope".')
  })

  it("refuses a path with an empty part", async () => {
    for (const path of ["/profile/heading", "profile/heading/", "profile//heading"]) {
      expect(await failure(`Update(${JSON.stringify(path)}, { text: "Hi" })`)).toContain(
        `Path "${path}" has an empty part.`
      )
    }
  })
})

describe("A layer's own fields, set by Update (PAR-1051)", () => {
  const card: ContainerSpec = {
    id: "card",
    name: "Card",
    kind: "component",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "frame", children: [{ type: "layout", id: "body", slot: "content", children: [] }] }
  }

  const page: ContainerSpec = {
    id: "page",
    name: "Page",
    position: { x: 600, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [
        { type: "text", id: "title", text: "Hello" },
        {
          type: "instance",
          id: "copy",
          design: "card",
          slots: {
            content: [
              { type: "text", id: "lead", text: "Lead" },
              { type: "image", id: "cover", src: "/images/cover.jpg", alt: "A cover" }
            ]
          }
        }
      ]
    }
  }

  it("renames, retags and repictures layers, including those filling an instance's slot", async () => {
    const result = await read(
      [card, page],
      `Update("page/title", { name: "Heading", tag: "h1" })
Update("page/lead", { name: "Lead paragraph", tag: "p" })
Update("page/cover", { src: "/images/sea.jpg", alt: "The sea" })
Print(JSON.stringify(["page/title", "page/lead", "page/cover"].map((path) => Get(path))))`
    )

    expect(result).toEqual([
      { type: "text", id: "title", name: "Heading", text: "Hello", tag: "h1" },
      { type: "text", id: "lead", name: "Lead paragraph", text: "Lead", tag: "p" },
      { type: "image", id: "cover", src: "/images/sea.jpg", alt: "The sea" }
    ])
  })

  it("takes a name, a tag and alt text away with null or an empty string", async () => {
    const result = await read(
      [card, page],
      `Update("page/title", { name: "Heading", tag: "h2" })
Update("page/title", { name: "", tag: null })
Update("page/cover", { alt: "" })
Print(JSON.stringify([Get("page/title"), Get("page/cover")]))`
    )

    expect(result).toEqual([
      { type: "text", id: "title", text: "Hello" },
      { type: "image", id: "cover", src: "/images/cover.jpg" }
    ])
  })

  it("refuses a field the layer doesn't have", async () => {
    const result = await execute(
      { label: "Tag", code: `Update("page/cover", { tag: "h2" })` },
      snapshot([structuredClone(card), structuredClone(page)]),
      hooks
    )

    expect(result.error).toContain("Only a text has a tag")
  })
})
