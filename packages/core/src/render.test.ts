import { describe, expect, it } from "vite-plus/test"
import { type ContainerSpec, type DesignNode, parseCanvasDocument } from "./document.ts"
import { defaultModeSettings, resolveModes } from "./modes.ts"
import {
  componentLibrary,
  frameGeometry,
  frameSize,
  frameViewport,
  placedDesigns,
  projectComponentLibrary,
  reachableLibrary,
  resolveDesign
} from "./render.ts"

const root: DesignNode = {
  type: "layout",
  id: "page",
  style: { direction: "row", gap: 4, background: "background" },
  responsive: { mobile: { style: { direction: "column" } } },
  children: [
    { type: "text", id: "title", tag: "h1", text: "Team", style: { size: "text-2xl", weight: 600 } },
    {
      type: "component",
      id: "card",
      component: "Card",
      style: { grow: true },
      slots: {
        children: [{ type: "component", id: "save", component: "Button", props: { children: "Save" } }]
      }
    },
    { type: "text", id: "error", text: "Oops", hidden: true }
  ]
}

describe("resolveDesign", () => {
  it("maps layout and text styles to token-backed CSS", () => {
    const [page] = resolveDesign(root, undefined, "desktop")
    expect(page).toMatchObject({
      kind: "element",
      tag: "div",
      style: { display: "flex", flexDirection: "row", gap: "calc(var(--spacing) * 4)", background: "var(--background)" }
    })
    if (page?.kind !== "element") throw new Error("expected an element")
    expect(page.children[0]).toMatchObject({
      tag: "h1",
      style: { fontSize: "var(--text-2xl)", lineHeight: "var(--text-2xl--line-height, 1.5)", fontWeight: "600" }
    })
    expect(page.children[1]).toMatchObject({
      kind: "component",
      component: "Card",
      props: { style: { flex: "1 1 0%", minWidth: "0" } },
      slots: { children: [{ kind: "component", component: "Button", props: { children: "Save" } }] }
    })
    expect(page.children).toHaveLength(2)
  })

  it("marks an empty layout with the axes its content would size, for the canvas to size it by", () => {
    const empty = (id: string, style: DesignNode["style"]): DesignNode => ({ type: "layout", id, style, children: [] })
    const [row] = resolveDesign(
      {
        type: "layout",
        id: "row",
        style: { direction: "row" },
        children: [
          empty("hugs", undefined),
          empty("hugs-too", { width: "hug", height: "hug" }),
          empty("spacer", { width: 2 }),
          empty("least", { minHeight: 4 }),
          // Growing and filling leave a layout at nothing in a grid, or with no space to share.
          empty("grows", { grow: true }),
          empty("fills", { width: "fill", height: 10 })
        ]
      },
      undefined,
      "desktop"
    )
    if (row?.kind !== "element") throw new Error("expected an element")
    // The row has layers in it, so it isn't marked.
    expect(row.attributes).toBeUndefined()
    expect(row.children.map((child) => (child.kind === "element" ? child.attributes : undefined))).toEqual([
      { "data-canvas-empty-layout": "width height" },
      { "data-canvas-empty-layout": "width height" },
      { "data-canvas-empty-layout": "height" },
      { "data-canvas-empty-layout": "width" },
      { "data-canvas-empty-layout": "width height" },
      { "data-canvas-empty-layout": "width" }
    ])
  })

  it("keeps a length an instance gives its component's empty root, and marks one it sets to hug over a fixed one", () => {
    const gap: ContainerSpec = {
      id: "gap",
      name: "Gap",
      kind: "component",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "root", style: { width: 6, height: 4 }, children: [] },
      states: [{ id: "default", name: "Default" }]
    }
    const [row] = resolveDesign(
      {
        type: "layout",
        id: "row",
        style: { direction: "row" },
        children: [
          { type: "instance", id: "narrow", design: "gap", style: { width: 2 } },
          { type: "instance", id: "fixed", design: "gap" },
          { type: "instance", id: "hugs", design: "gap", style: { width: "hug", height: "hug" } }
        ]
      },
      undefined,
      "desktop",
      componentLibrary([gap])
    )
    if (row?.kind !== "element") throw new Error("expected an element")
    expect(row.children.map((child) => (child.kind === "element" ? child.attributes : undefined))).toEqual([
      { "data-canvas-empty-layout": "" },
      { "data-canvas-empty-layout": "" },
      { "data-canvas-empty-layout": "width height" }
    ])
  })

  it("marks a layout whose layers the state hides as empty", () => {
    const column: DesignNode = {
      type: "layout",
      id: "column",
      children: [{ type: "text", id: "note", text: "Saved" }]
    }
    const hidden = { id: "quiet", name: "Quiet", overrides: { note: { hidden: true } } }
    expect(resolveDesign(column, undefined, "desktop")[0]).not.toHaveProperty("attributes")
    expect(resolveDesign(column, hidden, "desktop")[0]).toMatchObject({
      attributes: { "data-canvas-empty-layout": "width height" },
      children: []
    })
  })

  it("applies responsive patches per viewport and lets states win", () => {
    const state = {
      id: "error",
      name: "Error",
      overrides: { error: { hidden: false }, save: { props: { disabled: true } }, page: { style: { gap: 2 } } }
    }
    const [page] = resolveDesign(root, state, "mobile")
    if (page?.kind !== "element") throw new Error("expected an element")
    expect(page.style).toMatchObject({ flexDirection: "column", gap: "calc(var(--spacing) * 2)" })
    expect(page.children).toHaveLength(3)
    const card = page.children[1]
    if (card?.kind !== "component") throw new Error("expected a component")
    expect(card.slots.children?.[0]).toMatchObject({ props: { children: "Save", disabled: true } })
  })
})

describe("parseCanvasDocument", () => {
  const document = (overrides: Record<string, unknown> = {}) => ({
    version: 3,
    containers: [
      {
        id: "team",
        name: "Team",
        position: { x: 0, y: 0 },
        view: { modes: ["desktop-dark"], state: "default" },
        root,
        states: [{ id: "default", name: "Default" }],
        ...overrides
      }
    ]
  })

  it("accepts a valid design", () => {
    expect(parseCanvasDocument(document()).containers[0]?.root).toEqual(root)
  })

  it("reports the path of unknown style properties", () => {
    const bad = { ...root, style: { colour: "red" } }
    expect(() => parseCanvasDocument(document({ root: bad }))).toThrow(
      "/containers/0/root/style/colour: unknown property"
    )
  })

  it("rejects overrides for nodes that don't exist", () => {
    const states = [{ id: "x", name: "X", overrides: { missing: { hidden: true } } }]
    expect(() => parseCanvasDocument(document({ states }))).toThrow("no node has this id")
  })
})

describe("sizing", () => {
  const sized = (direction: "row" | "column", style: DesignNode["style"]) => {
    const [page] = resolveDesign(
      {
        type: "layout",
        id: "page",
        style: { direction },
        children: [{ type: "layout", id: "box", style, children: [] }]
      },
      undefined,
      "desktop"
    )
    if (page?.kind !== "element" || page.children[0]?.kind !== "element") throw new Error("expected elements")
    return page.children[0].style
  }

  it("fills along the parent's direction by growing, and across it by stretching", () => {
    expect(sized("row", { width: "fill" })).toMatchObject({ flex: "1 1 0%", minWidth: "0" })
    expect(sized("column", { width: "fill" })).toMatchObject({ alignSelf: "stretch" })
    expect(sized("column", { height: "fill" })).toMatchObject({ flex: "1 1 0%", minHeight: "0" })
  })

  it("keeps fixed sizes from shrinking along the parent's direction only", () => {
    expect(sized("row", { width: 64 })).toMatchObject({ width: "calc(var(--spacing) * 64)", flexShrink: "0" })
    expect(sized("column", { width: 64 }).flexShrink).toBeUndefined()
    expect(sized("row", { height: "hug" })).toMatchObject({ height: "fit-content" })
  })

  it("draws a hugging text on its own line, never wrapping for its parent, as Figma's auto width does", () => {
    const text = (style: DesignNode["style"]) => {
      const [page] = resolveDesign(
        { type: "layout", id: "page", children: [{ type: "text", id: "title", text: "Plans", style }] },
        undefined,
        "desktop"
      )
      if (page?.kind !== "element" || page.children[0]?.kind !== "element") throw new Error("expected elements")
      return page.children[0].style
    }
    expect(text({ width: "hug" }).width).toBe("max-content")
    // A maximum still wraps it, as it does in Figma.
    expect(text({ width: "hug", maxWidth: 80 })).toMatchObject({
      width: "max-content",
      maxWidth: "calc(var(--spacing) * 80)"
    })
    expect(text({ width: 40 }).width).toBe("calc(var(--spacing) * 40)")
    expect(text({}).width).toBeUndefined()
  })

  it("writes padding per side, appearance and type from tokens", () => {
    expect(
      sized("row", {
        padding: [1, 2, 3, 4],
        border: "border",
        borderWidth: 2,
        shadow: "shadow-sm",
        opacity: 50,
        leading: "leading-tight",
        position: "absolute",
        top: 2
      })
    ).toMatchObject({
      padding: "calc(var(--spacing) * 1) calc(var(--spacing) * 2) calc(var(--spacing) * 3) calc(var(--spacing) * 4)",
      borderWidth: "2px",
      borderStyle: "solid",
      borderColor: "var(--border)",
      boxShadow: "var(--shadow-sm)",
      opacity: "0.5",
      lineHeight: "var(--leading-tight)",
      position: "absolute",
      top: "calc(var(--spacing) * 2)"
    })
  })

  it("sizes frames from the design's own size for a viewport", () => {
    const design = parseCanvasDocument({
      version: 3,
      containers: [
        {
          id: "card",
          name: "Card",
          position: { x: 0, y: 0 },
          root: { type: "layout", id: "root", style: { width: 80, padding: [1, 2, 3, 4] }, children: [] },
          states: [{ id: "default", name: "Default" }],
          frames: { mobile: { height: 844 } }
        }
      ]
    }).containers[0]!
    expect(frameSize(design, { viewport: "mobile", width: 390 })).toEqual({ width: 390, height: 844 })
    expect(frameSize(design, { viewport: "desktop", width: 1280 })).toEqual({ width: 1280 })
  })

  it("gives a frame the window of its fixed height, its screen or the nearest device", () => {
    const [desktop] = resolveModes(defaultModeSettings)
    const phone = {
      options: [
        {
          variable: { id: "viewport", name: "Viewport", kind: "viewport" as const, options: [] },
          option: { id: "se", name: "iPhone SE", width: 375, height: 667 }
        }
      ]
    }
    expect(frameViewport({ width: 1280, height: 900 }, desktop!)).toEqual({ width: 1280, height: 900 })
    expect(frameViewport({ width: 375 }, phone)).toEqual({ width: 375, height: 667 })
    expect(frameViewport({ width: 1280 }, desktop!)).toEqual({ width: 1280, height: 800 })
    expect(frameViewport({ width: 390 }, desktop!)).toEqual({ width: 390, height: 844 })
    expect(frameViewport({ width: 1243 }, desktop!)).toEqual({ width: 1243, height: 800 })
  })

  // The case every renderer keeps: the live frame, its bitmap and the agent's offscreen frames all draw from this.
  it("keeps a frame's own height apart from its window's", () => {
    const [mode] = resolveModes({
      version: 1,
      variables: [
        {
          id: "viewport",
          name: "Viewport",
          kind: "viewport",
          options: [{ id: "desktop", name: "Desktop", width: 1280, height: 1234 }]
        }
      ],
      modes: [{ id: "desktop", name: "Desktop", values: { viewport: "desktop" } }]
    })
    const [grows, fixed] = parseCanvasDocument({
      version: 3,
      containers: [
        {
          id: "page",
          name: "Page",
          position: { x: 0, y: 0 },
          root: { type: "layout", id: "root", children: [] },
          states: [{ id: "default", name: "Default" }]
        },
        {
          id: "hero",
          name: "Hero",
          position: { x: 0, y: 0 },
          root: { type: "layout", id: "root", children: [] },
          states: [{ id: "default", name: "Default" }],
          frames: { desktop: { height: 600 } }
        }
      ]
    }).containers
    // Growing with its content, the frame has no height of its own, and its window is the screen's, not the 800 of the
    // device nearest 1280.
    expect(frameGeometry(grows!, mode!)).toEqual({ width: 1280, viewport: { width: 1280, height: 1234 } })
    // A fixed height clips the frame, and is its window's height too.
    expect(frameGeometry(fixed!, mode!)).toEqual({ width: 1280, height: 600, viewport: { width: 1280, height: 600 } })
  })
})

describe("grid, margin and length tokens", () => {
  it("lays out a grid with spans, and takes tokens for lengths", () => {
    const [page] = resolveDesign(
      {
        type: "layout",
        id: "page",
        style: { display: "grid", columns: 3, gap: 4, rowGap: "spacing-section", margin: [2, "gutter"] },
        children: [{ type: "text", id: "wide", text: "Wide", style: { colSpan: 2, padding: 1 } }]
      },
      undefined,
      "desktop"
    )
    if (page?.kind !== "element") throw new Error("expected an element")
    expect(page.style).toMatchObject({
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "calc(var(--spacing) * 4)",
      rowGap: "var(--spacing-section)",
      margin: "calc(var(--spacing) * 2) var(--gutter)"
    })
    expect(page.style.flexDirection).toBeUndefined()
    expect(page.children[0]).toMatchObject({
      style: { gridColumn: "span 2 / span 2", padding: "calc(var(--spacing) * 1)" }
    })
  })

  it("styles a component's root like any layout", () => {
    const [card] = resolveDesign(
      {
        type: "component",
        id: "card",
        component: "Card",
        style: { background: "muted", padding: 6, foreground: "primary" }
      },
      undefined,
      "desktop"
    )
    expect(card).toMatchObject({
      props: { style: { background: "var(--muted)", padding: "calc(var(--spacing) * 6)", color: "var(--primary)" } }
    })
  })
})

describe("reachableLibrary", () => {
  const design = (id: string, root: DesignNode): ContainerSpec => ({
    id,
    name: id,
    position: { x: 0, y: 0 },
    root,
    states: [{ id: "base", name: "Base" }]
  })
  const button = design("button", { type: "text", id: "label", text: "Save" })
  const card = design("card", {
    type: "layout",
    id: "card",
    children: [{ type: "instance", id: "save", design: "button" }]
  })
  const screen = design("screen", {
    type: "layout",
    id: "page",
    children: [{ type: "instance", id: "first", design: "card" }]
  })
  const other = design("other", { type: "text", id: "hello", text: "Hello" })
  const all = (...designs: ContainerSpec[]) => componentLibrary(designs)

  it("holds the designs a design's instances reach, through other designs too", () => {
    const library = all(button, card, screen, other)
    expect([...reachableLibrary(screen, library).keys()].sort()).toEqual(["button", "card"])
    expect([...reachableLibrary(other, library).keys()]).toEqual([])
    expect(placedDesigns(screen)).toEqual(["card"])
  })

  it("stops at a design that places itself", () => {
    const loop = design("loop", { type: "instance", id: "again", design: "loop" })
    expect([...reachableLibrary(loop, all(loop)).keys()]).toEqual(["loop"])
  })

  it("holds a project's library designs and its own, its own winning an id they share", () => {
    const kitButton = design("button", { type: "text", id: "label", text: "Kit" })
    const kitBadge = design("kit/badge", { type: "text", id: "label", text: "New" })
    const library = projectComponentLibrary([kitButton, kitBadge], [button, card])
    expect(library.get("button")).toBe(button)
    expect(library.get("kit/badge")).toBe(kitBadge)
    expect([...library.keys()]).toEqual(["button", "kit/badge", "card"])
  })

  it("finds instances that a state adds", () => {
    const stated = {
      ...other,
      states: [
        { id: "base", name: "Base" },
        { id: "busy", name: "Busy", added: [{ type: "instance", id: "spinner", design: "button" }] }
      ]
    } as unknown as ContainerSpec
    expect(placedDesigns(stated)).toEqual(["button"])
  })

  it("stays the same library while the designs it holds are unchanged", () => {
    const first = reachableLibrary(screen, all(button, card, screen, other))
    const renamed = { ...other, name: "Renamed" }
    expect(reachableLibrary(screen, all(button, card, screen, renamed), first)).toBe(first)
    const edited = { ...button, name: "Edited" }
    const next = reachableLibrary(screen, all(edited, card, screen, other), first)
    expect(next).not.toBe(first)
    expect(next.get("button")).toBe(edited)
  })
})
