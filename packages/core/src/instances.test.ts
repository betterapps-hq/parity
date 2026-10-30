import { describe, expect, it } from "vite-plus/test"
import { type ContainerSpec, parseCanvasDocument } from "./document.ts"
import {
  addVariant,
  addVariantOption,
  boardTarget,
  deleteNode,
  editNode,
  findNode,
  nodeOnBoard,
  removeVariantOption,
  resetOverride,
  toggleHidden
} from "./edit.ts"
import {
  detachInstance,
  editInner,
  innerChanges,
  layerOnBoard,
  locateInner,
  overrideCount,
  pushOverrides,
  resetInner,
  resetInstance,
  swapInstance
} from "./instances.ts"
import { componentLibrary, type RenderNode, resolveDesign } from "./render.ts"

const badge: ContainerSpec = {
  id: "badge",
  name: "Badge",
  kind: "component",
  position: { x: 0, y: 0 },
  params: {
    label: { type: "text", default: "New" },
    tone: {
      type: "variant",
      options: [
        { id: "neutral", name: "Neutral" },
        { id: "danger", name: "Danger", overrides: { badge: { style: { background: "destructive" } } } }
      ]
    }
  },
  root: {
    type: "layout",
    id: "badge",
    style: { background: "muted", padding: 1 },
    children: [{ type: "text", id: "label", text: "Badge", bind: { text: "label" } }]
  },
  states: [{ id: "default", name: "Default" }]
}

const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 0, y: 0 },
  params: { title: { type: "text", default: "Title" } },
  root: {
    type: "layout",
    id: "card",
    style: { padding: 4, gap: 2 },
    children: [
      { type: "text", id: "title", text: "Title", bind: { text: "title" } },
      { type: "text", id: "body", name: "Body", text: "Body copy", style: { foreground: "muted-foreground" } },
      { type: "instance", id: "status", design: "badge", args: { label: "Active" } }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "empty", name: "Empty", overrides: { body: { text: "Nothing yet" } } }
  ]
}

const team: ContainerSpec = {
  id: "team",
  name: "Team",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    children: [
      { type: "instance", id: "first", design: "card", args: { title: "Ada" } },
      { type: "instance", id: "second", design: "card", args: { title: "Grace" } }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "busy", name: "Busy" }
  ]
}

const library = componentLibrary([badge, card, team])

/** The rendered node with this id, anywhere in the tree. */
function rendered(tree: RenderNode[], id: string): RenderNode | undefined {
  for (const node of tree) {
    if (node.kind === "text") continue
    if (node.nodeId === id) return node
    const children = node.kind === "element" ? node.children : Object.values(node.slots).flat()
    const found = rendered(children, id)
    if (found) return found
  }
  return undefined
}

function textOf(tree: RenderNode[], id: string): string | undefined {
  const node = rendered(tree, id)
  return node?.kind === "element" && node.children[0]?.kind === "text" ? node.children[0].text : undefined
}

function render(design: ContainerSpec, state = design.states[0], lib = library) {
  return resolveDesign(design.root, state, "desktop", lib, { params: design.params, choices: design.view?.variants })
}

describe("variants", () => {
  it("shows the chosen option's patches, the default otherwise", () => {
    expect(rendered(render(badge), "badge")).toMatchObject({ style: { background: "var(--muted)" } })
    const danger = { ...badge, view: { variants: { tone: "danger" } } }
    expect(rendered(render(danger), "badge")).toMatchObject({ style: { background: "var(--destructive)" } })
    const unknown = { ...badge, view: { variants: { tone: "gone" } } }
    expect(rendered(render(unknown), "badge")).toMatchObject({ style: { background: "var(--muted)" } })
  })

  it("lets an instance pick an option through its args", () => {
    const screen: ContainerSpec = {
      ...team,
      root: { type: "instance", id: "alert", design: "badge", args: { tone: "danger", label: "Late" } }
    }
    const tree = render(screen)
    expect(rendered(tree, "alert")).toMatchObject({ style: { background: "var(--destructive)" } })
    expect(textOf(tree, "alert/label")).toBe("Late")
  })

  it("edits the variant option shown on the board instead of the design", () => {
    const danger = { ...badge, view: { variants: { tone: "danger" } } }
    const target = boardTarget(danger, "default")
    expect(target).toEqual({ state: "default", variant: { param: "tone", option: "danger" } })
    const edited = editNode(danger, target, "badge", { style: { radius: "radius-full" } })
    expect(edited.root.style).toEqual(badge.root.style)
    expect(edited.params?.tone?.options?.[1]?.overrides?.badge?.style).toEqual({
      background: "destructive",
      radius: "radius-full"
    })
    const reset = resetOverride(edited, target, "badge", { kind: "style", key: "radius" })
    expect(reset.params?.tone?.options?.[1]?.overrides).toEqual(badge.params?.tone?.options?.[1]?.overrides)
  })

  it("adds and removes options, and survives a save and load", () => {
    const sized = addVariant(card, "Size", ["Small", "Large"])
    const { container, id } = addVariantOption(sized, "Size", "Extra large")
    expect(container.params?.Size?.options?.map((option) => option.id)).toEqual(["small", "large", id])
    const shown = { ...container, view: { variants: { Size: id } } }
    const removed = removeVariantOption(shown, "Size", id)
    expect(removed.params?.Size?.options).toHaveLength(2)
    expect(removed.view?.variants).toBeUndefined()
    expect(() => removeVariantOption(addVariant(card, "One", ["Only"]), "One", "only")).toThrow(/at least one/)
    const loaded = parseCanvasDocument({ version: 3, containers: [badge, card, team] })
    expect(loaded.containers[0]).toEqual(badge)
  })

  it("rejects a variant without options, and patches for nodes that don't exist", () => {
    const parse = (params: unknown) =>
      parseCanvasDocument({ version: 3, containers: [{ ...badge, params }] }).containers[0]
    expect(() => parse({ tone: { type: "variant" } })).toThrow(/needs options/)
    expect(() =>
      parse({ tone: { type: "variant", options: [{ id: "a", name: "A", overrides: { nope: {} } }] } })
    ).toThrow(/no node has this id/)
  })
})

describe("instance overrides", () => {
  it("changes one copy and keeps the rest linked to the component", () => {
    const edited = editInner(team, "default", "first/body", { text: "Leads design", style: { weight: 600 } }, library)
    const instance = edited.root.type === "layout" ? edited.root.children[0] : undefined
    expect(instance).toMatchObject({ overrides: { body: { text: "Leads design", style: { weight: 600 } } } })
    const tree = render(edited)
    expect(textOf(tree, "first/body")).toBe("Leads design")
    expect(textOf(tree, "second/body")).toBe("Body copy")
    // The component changing still reaches the copy, for whatever the copy doesn't change itself.
    const restyled = editNode(card, "default", "body", { style: { foreground: "primary" } })
    const later = render(edited, edited.states[0], componentLibrary([badge, restyled]))
    expect(rendered(later, "first/body")).toMatchObject({ style: { color: "var(--primary)", fontWeight: "600" } })
  })

  it("sets a bound param on the instance rather than overriding the text", () => {
    const edited = editInner(team, "default", "first/title", { text: "Ada Lovelace" }, library)
    expect(edited.root.type === "layout" && edited.root.children[0]).toMatchObject({ args: { title: "Ada Lovelace" } })
    expect(textOf(render(edited), "first/title")).toBe("Ada Lovelace")
    expect(innerChanges(edited, "default", "first/title", library)).toEqual({ text: "Ada Lovelace" })
    // A copy giving the param its default value hasn't changed anything.
    const plain = editInner(team, "default", "first/title", { text: "Title" }, library)
    expect(innerChanges(plain, "default", "first/title", library)).toEqual({})
    const reset = resetInner(edited, "default", "first/title", library, { kind: "text" })
    expect(textOf(render(reset), "first/title")).toBe("Title")
  })

  it("reaches into nested instances", () => {
    const edited = editInner(team, "default", "first/status/label", { text: "Away" }, library)
    expect(edited.root.type === "layout" && edited.root.children[0]).toMatchObject({
      overrides: { status: { props: { label: "Away" } } }
    })
    const styled = editInner(edited, "default", "first/status", { props: { tone: "danger" } }, library)
    const tree = render(styled)
    expect(textOf(tree, "first/status/label")).toBe("Away")
    expect(rendered(tree, "first/status")).toMatchObject({ style: { background: "var(--destructive)" } })
    expect(textOf(tree, "second/status/label")).toBe("Active")
    expect(locateInner(styled, "first/status/label", library)?.shown).toMatchObject({ text: "Away" })
  })

  it("keeps a state's changes inside an instance in that state", () => {
    const busy = team.states[1]!
    const edited = editInner(team, "busy", "second/body", { hidden: true }, library)
    expect(edited.states[1]?.overrides).toEqual({ "second/body": { hidden: true } })
    expect(rendered(render(edited, edited.states[1]), "second/body")).toBeUndefined()
    expect(rendered(render(edited), "second/body")).toBeDefined()
    expect(innerChanges(edited, "busy", "second/body", library)).toEqual({ hidden: true })
    expect(resetInner(edited, busy.id, "second/body", library).states[1]?.overrides).toBeUndefined()
  })

  it("shows the component's state, under the copy's overrides", () => {
    const screen: ContainerSpec = {
      ...team,
      root: {
        type: "layout",
        id: "page",
        children: [{ type: "instance", id: "first", design: "card", args: { title: "Ada" }, state: "empty" }]
      }
    }
    expect(textOf(render(screen), "first/body")).toBe("Nothing yet")
    const edited = editInner(screen, "default", "first/body", { text: "Mine" }, library)
    expect(textOf(render(edited), "first/body")).toBe("Mine")
  })

  it("resets one copy, and pushes a copy's overrides to the component", () => {
    let edited = editInner(team, "default", "first/body", { text: "Leads design" }, library)
    edited = editInner(edited, "default", "first/status/label", { text: "Away" }, library)
    const first = edited.root.type === "layout" ? edited.root.children[0]! : undefined
    expect(first?.type === "instance" && overrideCount(first)).toBe(2)
    expect(resetInstance(edited, "first").root).toEqual(team.root)

    const pushed = pushOverrides(edited, "first", card)
    expect(pushed.container.root).toEqual(team.root)
    expect(pushed.component.root.type === "layout" && pushed.component.root.children[1]).toMatchObject({
      text: "Leads design"
    })
    // The badge's label is bound to its param, so the nested badge takes the value as its own.
    expect(pushed.component.root.type === "layout" && pushed.component.root.children[2]).toMatchObject({
      args: { label: "Away" }
    })
    const tree = render(pushed.container, team.states[0], componentLibrary([badge, pushed.component]))
    expect(textOf(tree, "second/body")).toBe("Leads design")
    expect(textOf(tree, "second/status/label")).toBe("Away")
  })

  it("drops the patches that reach inside a deleted instance", () => {
    const edited = editInner(team, "busy", "second/body", { hidden: true }, library)
    expect(deleteNode(edited, "second").states[1]?.overrides).toBeUndefined()
  })
})

describe("detach and swap", () => {
  it("detaches a copy into plain layers that look the same", () => {
    let edited = editInner(team, "default", "first/body", { text: "Leads design" }, library)
    edited = editInner(edited, "busy", "first/body", { hidden: true }, library)
    const before = render(edited)
    const detached = detachInstance(edited, "first", library)
    const first = detached.root.type === "layout" ? detached.root.children[0]! : undefined
    expect(first).toMatchObject({ type: "layout", id: "first", name: "Card" })
    expect(JSON.stringify(first)).not.toContain('"bind"')
    const after = render(detached)
    const texts = (tree: RenderNode[]) => JSON.stringify(tree).match(/"text":"[^"]*"/g)
    expect(texts(after)).toEqual(texts(before))
    // The state's change follows the body to its new id.
    const body = first?.type === "layout" ? first.children[1]! : undefined
    expect(detached.states[1]?.overrides).toEqual({ [body!.id]: { hidden: true } })
  })

  it("swaps a copy to another component, keeping what still applies", () => {
    const profile: ContainerSpec = {
      ...card,
      id: "profile",
      name: "Profile",
      params: { title: { type: "text" }, avatar: { type: "text" } },
      root: {
        type: "layout",
        id: "profile",
        children: [
          { type: "text", id: "heading", text: "Name", bind: { text: "title" } },
          { type: "text", id: "about", name: "Body", text: "About" }
        ]
      },
      states: [{ id: "default", name: "Default" }]
    }
    const lib = componentLibrary([badge, card, profile])
    let edited = editInner(team, "default", "first/body", { text: "Leads design" }, lib)
    edited = editInner(edited, "default", "first/status/label", { text: "Away" }, lib)
    const swapped = swapInstance(edited, "first", "profile", lib)
    const first = swapped.root.type === "layout" ? swapped.root.children[0] : undefined
    expect(first).toEqual({
      type: "instance",
      id: "first",
      design: "profile",
      args: { title: "Ada" },
      overrides: { about: { text: "Leads design" } }
    })
    expect(textOf(render(swapped, swapped.states[0], lib), "first/about")).toBe("Leads design")
    expect(() => swapInstance(team, "first", "team", library)).toThrow(/contain itself/)
  })
})

/** A stat card that shows a trend icon for each direction, picked by two boolean params, as the example's does. */
const statCard: ContainerSpec = {
  id: "stat-card",
  name: "Stat card",
  kind: "component",
  position: { x: 0, y: 0 },
  params: {
    label: { type: "text", default: "Revenue" },
    showRising: { type: "boolean", default: true },
    showFalling: { type: "boolean", default: false }
  },
  root: {
    type: "layout",
    id: "card",
    children: [
      { type: "text", id: "label", text: "Revenue", bind: { text: "label" } },
      { type: "component", id: "rising", component: "TrendingUp", bind: { visible: "showRising" } },
      { type: "component", id: "falling", component: "TrendingDown", bind: { visible: "showFalling" } }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "loading", name: "Loading" }
  ]
}

describe("a component's board", () => {
  const stats = componentLibrary([statCard])
  const dashboard: ContainerSpec = {
    id: "dashboard",
    name: "Dashboard",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [
        { type: "instance", id: "revenue", design: "stat-card" },
        { type: "instance", id: "churn", design: "stat-card", args: { showRising: false, showFalling: true } }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  }

  it("shows the trend icon its params select, as its instances do", () => {
    const board = render(statCard, statCard.states[0], stats)
    expect(rendered(board, "rising")).toBeDefined()
    expect(rendered(board, "falling")).toBeUndefined()
    const screen = render(dashboard, dashboard.states[0], stats)
    expect(rendered(screen, "revenue/falling")).toBeUndefined()
    expect(rendered(screen, "churn/falling")).toBeDefined()
    expect(rendered(screen, "churn/rising")).toBeUndefined()
  })

  it("shows a bound text's default, and an edit to it in the design changes the default", () => {
    expect(textOf(render(badge), "label")).toBe("New")
    const edited = editNode(badge, "default", "label", { text: "Fresh" })
    expect(edited.params?.label).toEqual({ type: "text", default: "Fresh" })
    expect(textOf(render(edited), "label")).toBe("Fresh")
    const lib = componentLibrary([edited, card, team])
    const screen: ContainerSpec = { ...team, root: { type: "instance", id: "tag", design: "badge" } }
    expect(textOf(render(screen, screen.states[0], lib), "tag/label")).toBe("Fresh")
  })

  it("leaves a param without a default, and variants, to the design's own values", () => {
    const plain: ContainerSpec = { ...badge, params: { ...badge.params, label: { type: "text" } } }
    expect(textOf(render(plain), "label")).toBe("Badge")
    expect(editNode(plain, "default", "label", { text: "Fresh" }).params?.label).toEqual({ type: "text" })
  })

  it("says what the board shows in a state for one of its own layers and for a layer inside an instance", () => {
    expect(nodeOnBoard(statCard, findNode(statCard.root, "falling")!, statCard.states[0])).toMatchObject({
      hidden: true
    })
    const empty = card.states[1]
    expect(layerOnBoard(card, "body", library, empty)).toMatchObject({ text: "Nothing yet" })
    expect(layerOnBoard(card, "title", library, empty)).toMatchObject({ text: "Title" })
    expect(layerOnBoard(card, "status/label", library, empty)).toMatchObject({ text: "Active" })
    const danger = { ...badge, view: { variants: { tone: "danger" } } }
    const shown = layerOnBoard(danger, "badge", library, danger.states[0])
    expect(shown?.style).toMatchObject({ background: "destructive" })
  })
})

describe("hiding a layer in a state", () => {
  it("reads whether the board hides it, through the params it binds", () => {
    // Falling shows nothing on the board, since showFalling is off: Hide or show shows it, and turns the default on.
    const shown = toggleHidden(statCard, "default", ["falling"])
    expect(shown.params?.showFalling).toEqual({ type: "boolean", default: true })
    expect(rendered(render(shown, shown.states[0], componentLibrary([shown])), "falling")).toBeDefined()
    expect(toggleHidden(shown, "default", ["falling"]).params?.showFalling?.default).toBe(false)
  })

  it("shows in a state what the board hides there, and hides it again", () => {
    const shown = toggleHidden(statCard, "loading", ["falling"])
    expect(shown.states[1]?.overrides).toEqual({ falling: { hidden: false } })
    expect(shown.params).toEqual(statCard.params)
    expect(rendered(render(shown, shown.states[1], componentLibrary([shown])), "falling")).toBeDefined()
    expect(toggleHidden(shown, "loading", ["falling"]).states[1]?.overrides).toBeUndefined()
  })

  it("reads what the state and the variant shown hide", () => {
    const loading = {
      ...card,
      states: [card.states[0]!, { id: "loading", name: "Loading", overrides: { body: { hidden: true } } }]
    }
    expect(toggleHidden(loading, "loading", ["body"]).states[1]?.overrides).toBeUndefined()
    const quiet: ContainerSpec = {
      ...badge,
      params: {
        ...badge.params,
        tone: {
          type: "variant",
          options: [
            { id: "neutral", name: "Neutral" },
            { id: "quiet", name: "Quiet", overrides: { label: { hidden: true } } }
          ]
        }
      },
      view: { variants: { tone: "quiet" } }
    }
    const shown = toggleHidden(quiet, "default", ["label"])
    expect(shown.params?.tone?.options?.[1]?.overrides).toBeUndefined()
    // Another state shows it over the variant, so its change is kept.
    const pressed = { ...quiet, states: [quiet.states[0]!, { id: "pressed", name: "Pressed" }] }
    expect(toggleHidden(pressed, "pressed", ["label"]).states[1]?.overrides).toEqual({ label: { hidden: false } })
  })
})
