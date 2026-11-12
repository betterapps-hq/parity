import { spacing } from "@parity-app/style-schema"
import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec } from "./document.ts"
import { findNode, nodeOnBoard } from "./edit.ts"
import { effectiveNode, type EffectiveTree, effectiveTree } from "./effective.ts"
import { effectiveFixture } from "./fixtures.ts"
import { layerOnBoard, locateInner } from "./instances.ts"
import { componentLibrary, type RenderNode, resolveDesign, scopeOf } from "./render.ts"

const { designs, library, viewports, cases } = effectiveFixture

function design(id: string): ContainerSpec {
  const found = designs.find((candidate) => candidate.id === id)

  if (!found) {
    throw new Error(`No design "${id}" in the fixture`)
  }

  return found
}

/** What both trees say about a drawn node, so one can be checked against the other. */
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
 * What the canvas draws of an effective tree: hidden layers left out, an instance drawn as its component's root, and
 * one that can't be expanded drawn as an empty placeholder.
 */
function effectiveOutline(tree: EffectiveTree): Outline[] {
  const { node } = tree

  if (node.hidden) {
    return []
  }

  if (node.type === "instance") {
    if (tree.children.length === 0) {
      return [{ id: tree.path, children: [] }]
    }

    return tree.children.flatMap(effectiveOutline).map((root) => ({ ...root, id: tree.path }))
  }

  const style = node.style ?? {}
  const outline: Outline = { id: tree.path, children: tree.children.flatMap(effectiveOutline) }

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

describe("effectiveTree", () => {
  for (const { name, design: container, state, variants } of cases) {
    for (const viewport of viewports) {
      it(`draws what resolveDesign draws: ${name}, ${viewport}`, () => {
        const tree = effectiveTree(container, container.root.id, { state, variants, viewport, library })

        const drawn = resolveDesign(container.root, state, viewport, library, {
          params: container.params,
          choices: variants ?? container.view?.variants
        })

        expect(tree && effectiveOutline(tree)).toEqual(drawn.flatMap(renderOutline))
      })
    }
  }

  it("keeps hidden layers, marked hidden", () => {
    const tree = effectiveTree(design("card"), "copy", { viewport: "mobile", library })
    expect(tree?.children.map((child) => [child.path, child.node.hidden ?? false])).toEqual([
      ["title", false],
      ["meta", true]
    ])
  })

  it("starts inside an instance, and names the component's root by its path", () => {
    const tree = effectiveTree(design("profile"), "person/avatar", { library })
    expect(tree?.path).toBe("person/avatar")
    expect(tree?.children.map((child) => child.path)).toEqual(["person/avatar/circle"])
    expect(tree?.children[0]?.children[0]).toMatchObject({ path: "person/avatar/initials", node: { text: "AL" } })
  })

  it("is undefined for a path that leads nowhere", () => {
    expect(effectiveTree(design("profile"), "person/nothing", { library })).toBeUndefined()
  })

  describe("a design that places itself", () => {
    const placing = (id: string, places: string): ContainerSpec => ({
      id,
      name: id,
      position: { x: 0, y: 0 },
      root: {
        type: "layout",
        id: "frame",
        children: [
          { type: "text", id: "label", text: id },
          { type: "instance", id: "copy", design: places }
        ]
      },
      states: [{ id: "base", name: "Base" }]
    })

    const loop = placing("loop", "loop")
    const outer = placing("outer", "inner")
    const inner = placing("inner", "outer")
    const loops = componentLibrary([loop, outer, inner])

    for (const container of [loop, outer]) {
      const how = container === loop ? "directly" : "through another design"
      it(`expands as resolveDesign does, ${how}`, () => {
        const tree = effectiveTree(container, "frame", { library: loops })
        const drawn = resolveDesign(container.root, undefined, "desktop", loops)
        expect(tree && effectiveOutline(tree)).toEqual(drawn.flatMap(renderOutline))
      })
    }

    it("finds the nodes the canvas draws inside it, and none past where it stops", () => {
      expect(effectiveNode(loop, "copy/label", { library: loops })).toMatchObject({ text: "loop" })
      expect(effectiveNode(loop, "copy/copy", { library: loops })).toMatchObject({ type: "instance" })
      expect(effectiveNode(loop, "copy/copy/label", { library: loops })).toBeUndefined()
      expect(effectiveNode(outer, "copy/copy/label", { library: loops })).toMatchObject({ text: "outer" })
      expect(effectiveNode(outer, "copy/copy/copy/label", { library: loops })).toBeUndefined()
    })
  })
})

describe("effectiveNode", () => {
  const card = design("card")
  const profile = design("profile")

  const body = (variants: Record<string, string>, viewport?: string, state = card.states[0]) =>
    effectiveNode(card, "body", { variants, viewport, state })?.style

  it("shows a bound param's default over the node's own value", () => {
    expect(effectiveNode(card, "title")).toMatchObject({ text: "Card title" })
  })

  it("applies the responsive patch over the node's own values", () => {
    expect(body({ layout: "stacked" }, "mobile")).toMatchObject({ direction: "column", gap: 2, padding: 2 })
    expect(body({ layout: "stacked" }, "desktop")).toMatchObject({ direction: "column", gap: 4, padding: 4 })
  })

  it("applies the responsive style over variant options, which still set what it leaves alone", () => {
    expect(body({ layout: "inline" }, "mobile")).toMatchObject({ direction: "row", gap: 2, padding: 2 })
    expect(body({ layout: "inline" }, "desktop")).toMatchObject({ direction: "row", gap: 6, padding: 4 })
  })

  it("applies the state over the variant options", () => {
    expect(body({ layout: "inline" }, "desktop", card.states[1])).toMatchObject({ direction: "row", gap: 2 })
  })

  it("shows the variants the board shows when none are given", () => {
    const showingInline = { ...card, view: { variants: { layout: "inline" } } }
    expect(effectiveNode(showingInline, "body")?.style?.direction).toBe("row")
  })

  it("applies an instance's args, overrides, responsive patch and the outer state inside it", () => {
    const title = (viewport: string, state = profile.states[0]) =>
      effectiveNode(profile, "person/title", { library, viewport, state })

    expect(title("desktop")).toMatchObject({ text: "Ada Lovelace" })
    expect(title("desktop", profile.states[1])).toMatchObject({ text: "Selected" })
    // The instance's responsive patch picks Stacked on mobile; its Compact state still changes the gap.
    expect(effectiveNode(profile, "person/body", { library, viewport: "mobile" })?.style).toMatchObject({
      direction: "column",
      gap: 2
    })
    expect(effectiveNode(profile, "person/body", { library, viewport: "desktop" })?.style).toMatchObject({
      direction: "row",
      gap: 2
    })
  })

  it("reaches through nested instances", () => {
    const initials = (state = profile.states[0]) => effectiveNode(profile, "person/avatar/initials", { library, state })
    expect(initials()).toMatchObject({ text: "AL", style: { weight: 700 } })
    expect(effectiveNode(profile, "person/avatar/circle", { library, state: profile.states[1] })?.style).toMatchObject({
      background: "accent"
    })
    expect(effectiveNode(design("card"), "avatar/initials", { library })).toMatchObject({ text: "CD" })
  })

  it("is what the board helpers give with no viewport", () => {
    for (const state of card.states) {
      for (const id of ["body", "title", "meta"]) {
        const node = findNode(card.root, id)!
        expect(nodeOnBoard(card, node, state)).toEqual(effectiveNode(card, id, { state }))
        expect(layerOnBoard(card, id, library, state)).toEqual(effectiveNode(card, id, { state, library }))
      }
    }

    const path = "person/avatar/initials"
    expect(locateInner(profile, path, library)?.shown).toEqual(effectiveNode(profile, path, { library }))
    expect(layerOnBoard(profile, path, library, profile.states[1])).toEqual(
      effectiveNode(profile, path, { library, state: profile.states[1] })
    )
  })
})

// A breakpoint is CSS, which applies whatever state the app is in: `isOpen && <Menu className="max-md:hidden" />`.
describe("a viewport's patch over states, variants and instances (PAR-902)", () => {
  const header: ContainerSpec = {
    id: "header",
    name: "Header",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "bar",
      style: { gap: 4 },
      responsive: { mobile: { style: { gap: 2 } } },
      children: [
        // Closed in the base design, and phones have their own menu.
        { type: "layout", id: "menu", hidden: true, responsive: { mobile: { hidden: true } }, children: [] },
        // Only phones show the menu button, and the open menu covers it.
        { type: "layout", id: "toggle", hidden: true, responsive: { mobile: { hidden: false } }, children: [] },
        { type: "text", id: "title", text: "Bookings", responsive: { mobile: { text: "Book" } } }
      ]
    },
    states: [
      { id: "base", name: "Base" },
      {
        id: "open",
        name: "Menu open",
        overrides: {
          bar: { style: { gap: 6 } },
          menu: { hidden: false },
          toggle: { hidden: true },
          title: { text: "Menu" }
        }
      }
    ]
  }

  const [closed, open] = header.states

  const shown = (id: string, viewport: string, state = closed) =>
    !effectiveNode(header, id, { state, viewport })?.hidden

  it("hides what the viewport hides, even in a state that shows it", () => {
    expect(shown("menu", "desktop", open)).toBe(true)
    expect(shown("menu", "mobile", open)).toBe(false)
    expect(shown("menu", "desktop")).toBe(false)
  })

  it("shows what the viewport shows over the design, and lets a state hide it", () => {
    expect(shown("toggle", "mobile")).toBe(true)
    expect(shown("toggle", "mobile", open)).toBe(false)
    expect(shown("toggle", "desktop")).toBe(false)
  })

  it("draws the viewport's style over the state's", () => {
    expect(effectiveNode(header, "bar", { state: open, viewport: "mobile" })?.style).toMatchObject({ gap: 2 })
    expect(effectiveNode(header, "bar", { state: open, viewport: "desktop" })?.style).toMatchObject({ gap: 6 })
  })

  it("keeps a state's text over the viewport's", () => {
    expect(effectiveNode(header, "title", { viewport: "mobile" })).toMatchObject({ text: "Book" })
    expect(effectiveNode(header, "title", { state: open, viewport: "mobile" })).toMatchObject({ text: "Menu" })
  })

  it("lets the viewport take a style away that a state sets", () => {
    const plain = { ...header.root, responsive: { mobile: { unset: { style: ["gap" as const] } } } }
    const style = effectiveNode({ ...header, root: plain }, "bar", { state: open, viewport: "mobile" })?.style
    expect(style?.gap).toBeUndefined()
  })

  it("draws a component's responsive patch over its instance's overrides and the screen's state", () => {
    const screen: ContainerSpec = {
      id: "home",
      name: "Home",
      position: { x: 0, y: 0 },
      root: {
        type: "layout",
        id: "page",
        children: [{ type: "instance", id: "top", design: "header", overrides: { bar: { style: { gap: 8 } } } }]
      },
      states: [
        { id: "base", name: "Base" },
        { id: "open", name: "Menu open", overrides: { "top/menu": { hidden: false } } }
      ]
    }

    const headers = componentLibrary([header])

    const at = (path: string, viewport: string, state = screen.states[0]) =>
      effectiveNode(screen, path, { library: headers, viewport, state })

    expect(at("top/bar", "mobile")?.style).toMatchObject({ gap: 2 })
    expect(at("top/bar", "desktop")?.style).toMatchObject({ gap: 8 })
    expect(at("top/menu", "mobile", screen.states[1])?.hidden).toBe(true)
    expect(at("top/menu", "desktop", screen.states[1])?.hidden).toBeUndefined()
  })

  it("draws the same in resolveDesign", () => {
    const [bar] = resolveDesign(header.root, open, "mobile")

    if (bar?.kind !== "element") {
      throw new Error("expected an element")
    }

    expect(bar.declarations).toContainEqual({ property: "gap", value: "calc(var(--spacing) * 2)" })
    expect(bar.children.map((child) => child.kind === "element" && child.nodeId)).toEqual(["title"])
  })
})

describe("scopeOf", () => {
  it("gives the variant options in param order under the state, and the params' defaults and choices", () => {
    const card = design("card")
    const scope = scopeOf(card, { variants: { layout: "inline" }, state: card.states[1] })
    expect(scope.layers).toEqual([card.params!.layout!.options![1]!.overrides, card.states[1]!.overrides])
    expect(scope.args).toEqual({ title: "Card title", layout: "inline" })
  })
})
