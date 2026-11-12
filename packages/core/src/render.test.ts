import { describe, expect, it } from "vite-plus/test"
import { type ContainerSpec, type DesignNode, parseCanvasDocument } from "./document.ts"
import { defaultModeSettings, resolveModes } from "./modes.ts"
import {
  applyPatch,
  componentLibrary,
  frameGeometry,
  frameSize,
  frameViewport,
  mergePatches,
  placedDesigns,
  projectComponentLibrary,
  type RenderNode,
  reachableLibrary,
  resolveDesign,
  withoutEmptyLayoutMarks
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
  it("draws a video as a <video> that plays by itself, without sound, unless it has controls (PAR-841)", () => {
    const page: DesignNode = {
      type: "layout",
      id: "page",
      children: [
        { type: "video", id: "hero", src: "/videos/waves.mp4", alt: "Waves", style: { width: 80, height: 45 } },
        { type: "video", id: "talk", src: "/videos/talk.webm", fit: "contain", controls: true }
      ]
    }

    const [drawn] = resolveDesign(page, undefined, "desktop")

    expect(drawn).toMatchObject({
      children: [
        {
          tag: "video",
          nodeId: "hero",
          style: { display: "block", objectFit: "cover", width: "calc(var(--spacing) * 80)" },
          attributes: {
            src: "/videos/waves.mp4",
            "aria-label": "Waves",
            autoplay: "",
            muted: "",
            loop: "",
            playsinline: ""
          }
        },
        {
          tag: "video",
          nodeId: "talk",
          style: { objectFit: "contain" },
          attributes: { src: "/videos/talk.webm", controls: "", playsinline: "" }
        }
      ]
    })
    expect(
      drawn?.kind === "element" && drawn.children[1]?.kind === "element" && drawn.children[1].attributes
    ).not.toHaveProperty("autoplay")
  })

  it("maps layout and text styles to token-backed CSS", () => {
    const [page] = resolveDesign(root, undefined, "desktop")
    expect(page).toMatchObject({
      kind: "element",
      tag: "div",
      style: { display: "flex", flexDirection: "row", gap: "calc(var(--spacing) * 4)", background: "var(--background)" }
    })

    if (page?.kind !== "element") {
      throw new Error("expected an element")
    }

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

    if (row?.kind !== "element") {
      throw new Error("expected an element")
    }

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

    if (row?.kind !== "element") {
      throw new Error("expected an element")
    }

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

  it("leaves the empty-layout mark out of a tree drawn as the code draws it, in slots too, keeping other attributes", () => {
    const mark = { "data-canvas-empty-layout": "width height" }

    const tree: RenderNode[] = [
      {
        kind: "element",
        nodeId: "page",
        tag: "div",
        style: {},
        children: [
          { kind: "element", nodeId: "gap", tag: "div", style: { height: "8px" }, attributes: mark, children: [] },
          {
            kind: "component",
            nodeId: "card",
            component: "Card",
            props: {},
            slots: {
              children: [{ kind: "element", nodeId: "body", tag: "div", style: {}, attributes: mark, children: [] }]
            }
          },
          { kind: "element", nodeId: "logo", tag: "img", style: {}, attributes: { src: "/logo.svg" }, children: [] }
        ]
      }
    ]

    const before = structuredClone(tree)

    expect(JSON.stringify(withoutEmptyLayoutMarks(tree))).not.toContain("data-canvas-empty-layout")
    expect(withoutEmptyLayoutMarks(tree)).toEqual([
      {
        kind: "element",
        nodeId: "page",
        tag: "div",
        style: {},
        children: [
          { kind: "element", nodeId: "gap", tag: "div", style: { height: "8px" }, children: [] },
          {
            kind: "component",
            nodeId: "card",
            component: "Card",
            props: {},
            slots: { children: [{ kind: "element", nodeId: "body", tag: "div", style: {}, children: [] }] }
          },
          { kind: "element", nodeId: "logo", tag: "img", style: {}, attributes: { src: "/logo.svg" }, children: [] }
        ]
      }
    ])

    // The canvas still draws the tree it was given.
    expect(tree).toEqual(before)
  })

  it("applies responsive patches per viewport and lets states win", () => {
    const state = {
      id: "error",
      name: "Error",
      overrides: { error: { hidden: false }, save: { props: { disabled: true } }, page: { style: { gap: 2 } } }
    }

    const [page] = resolveDesign(root, state, "mobile")

    if (page?.kind !== "element") {
      throw new Error("expected an element")
    }

    expect(page.style).toMatchObject({ flexDirection: "column", gap: "calc(var(--spacing) * 2)" })
    expect(page.children).toHaveLength(3)
    const card = page.children[1]

    if (card?.kind !== "component") {
      throw new Error("expected a component")
    }

    expect(card.slots.children?.[0]).toMatchObject({ props: { children: "Save", disabled: true } })
  })

  it("takes away what a state unsets from the design, but not what the viewport's patch sets", () => {
    const state = {
      id: "plain",
      name: "Plain",
      overrides: {
        page: { unset: { style: ["direction" as const, "background" as const, "radius" as const] } },
        save: { unset: { props: ["children"] } }
      }
    }

    const rounded: DesignNode = { ...root, responsive: { mobile: { style: { radius: "radius" } } } }
    const [page] = resolveDesign(rounded, state, "mobile")

    if (page?.kind !== "element") {
      throw new Error("expected an element")
    }

    // The design's row is taken away, so the layout is a column, as it is by default.
    expect(page.style).toMatchObject({ flexDirection: "column", gap: "calc(var(--spacing) * 4)" })
    expect(page.style).not.toHaveProperty("background")
    // A breakpoint's style applies whatever the state is.
    expect(page.style).toMatchObject({ borderRadius: "var(--radius)" })
    expect(resolveDesign(rounded, state, "desktop")[0]).not.toHaveProperty("style.borderRadius")
    const card = page.children[1]

    if (card?.kind !== "component") {
      throw new Error("expected a component")
    }

    expect(card.slots.children?.[0]).toMatchObject({ component: "Button" })
    expect(card.slots.children?.[0]).not.toHaveProperty("props.children")
  })

  it("writes a layout's and a text's accessibility props on its element, as a state changes them (PAR-913)", () => {
    const page: DesignNode = {
      type: "layout",
      id: "chart",
      props: { role: "img", "aria-labelledby": "chart-title" },
      children: [
        { type: "text", id: "title", text: "Bookings", props: { id: "chart-title" } },
        {
          type: "text",
          id: "dash",
          tag: "span",
          text: "–",
          props: { "aria-label": "Doesn't apply", "aria-hidden": false }
        }
      ]
    }

    const state = {
      id: "quiet",
      name: "Quiet",
      overrides: { dash: { props: { "aria-hidden": true }, unset: { props: ["aria-label"] } } }
    }

    expect(resolveDesign(page, undefined, "desktop")[0]).toMatchObject({
      attributes: { role: "img", "aria-labelledby": "chart-title" },
      children: [
        { tag: "p", attributes: { id: "chart-title" } },
        { tag: "span", attributes: { "aria-label": "Doesn't apply", "aria-hidden": "false" } }
      ]
    })
    expect(resolveDesign(page, state, "desktop")[0]).toMatchObject({
      children: [{}, { attributes: { "aria-hidden": "true" } }]
    })
    expect(resolveDesign(page, state, "desktop")[0]).not.toHaveProperty("children.1.attributes.aria-label")
  })

  it("keeps an empty layout's accessibility props beside the empty-layout mark", () => {
    const empty: DesignNode = { type: "layout", id: "spacer", props: { "aria-hidden": "true" }, children: [] }

    expect(resolveDesign(empty, undefined, "desktop")[0]).toMatchObject({
      attributes: { "aria-hidden": "true", "data-canvas-empty-layout": "width height" }
    })
  })

  it("rounds radius-full as fully as the box allows, unless the project declares --radius-full (PAR-458)", () => {
    const full = "var(--radius-full, calc(infinity * 1px))"

    const avatars: DesignNode = {
      type: "layout",
      id: "people",
      style: { radius: "radius-md" },
      responsive: { mobile: { style: { radius: "radius-full" } } },
      children: [
        { type: "layout", id: "small", style: { width: 6, height: 6, radius: "radius-full" }, children: [] },
        { type: "layout", id: "large", style: { width: 96, height: 96, radius: "radius-full" }, children: [] },
        { type: "component", id: "pill", component: "Badge", style: { radius: "radius-full" } }
      ]
    }

    const [desktop] = resolveDesign(avatars, undefined, "desktop")
    const [mobile] = resolveDesign(avatars, undefined, "mobile")

    if (desktop?.kind !== "element" || mobile?.kind !== "element") {
      throw new Error("expected elements")
    }

    expect(desktop.style.borderRadius).toBe("var(--radius-md)")
    expect(mobile.style.borderRadius).toBe(full)
    const [small, large, pill] = desktop.children
    expect(small).toMatchObject({ kind: "element", style: { borderRadius: full } })
    expect(large).toMatchObject({ kind: "element", style: { borderRadius: full } })
    // A component takes it on its root, as an inline style.
    expect(pill).toMatchObject({ kind: "component", props: { style: { borderRadius: full } } })
  })
})

describe("layering patches that take values away", () => {
  it("takes away the lower patch's values, and a value the upper one sets wins over what the lower took away", () => {
    expect(mergePatches({ style: { gap: 2, padding: 1 } }, { unset: { style: ["gap"] } })).toEqual({
      props: {},
      style: { padding: 1 },
      unset: { style: ["gap"] }
    })
    expect(mergePatches({ unset: { props: ["disabled"] } }, { props: { disabled: false } })).toEqual({
      props: { disabled: false },
      style: {}
    })
  })

  it("gives an instance's param its default again when a patch takes its value away", () => {
    const badge: ContainerSpec = {
      id: "badge",
      name: "Badge",
      kind: "component",
      position: { x: 0, y: 0 },
      params: { label: { type: "text", default: "New" } },
      root: { type: "text", id: "label", text: "New", bind: { text: "label" } },
      states: [{ id: "default", name: "Default" }]
    }

    const instance: DesignNode = { type: "instance", id: "tag", design: "badge", args: { label: "Sale" } }
    const plain = { id: "plain", name: "Plain", overrides: { tag: { unset: { props: ["label"] } } } }
    const [shown] = resolveDesign(instance, plain, "desktop", componentLibrary([badge]))
    expect(shown).toMatchObject({ kind: "element", children: [{ kind: "text", text: "New" }] })
    expect(applyPatch(instance, { unset: { props: ["label"] } })).toEqual({
      type: "instance",
      id: "tag",
      design: "badge"
    })
  })
})

describe("transitions", () => {
  it("draws the transition the state shows, so switching to it animates the change (PAR-934)", () => {
    const card: DesignNode = {
      type: "layout",
      id: "card",
      style: { background: "card", transitions: [{ property: "colors", duration: 200 }] },
      children: []
    }

    const hover = {
      id: "hover",
      name: "Hover",
      overrides: { card: { style: { background: "accent", transitions: [{ property: "all", duration: 300 }] } } }
    }

    const style = (state?: typeof hover) => {
      const [drawn] = resolveDesign(card, state, "desktop")

      return drawn?.kind === "element" ? drawn.style : undefined
    }

    expect(style()?.transition).toMatch(/^color 200ms /)
    expect(style(hover)).toMatchObject({ background: "var(--accent)" })
    expect(style(hover)?.transition).toMatch(/^all 300ms /)
  })
})

describe("parseCanvasDocument", () => {
  // Fields laid over a valid design, which may make it invalid on purpose.
  const document = <Fields extends object>(overrides?: Fields) => ({
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

  it("reads what a state takes away, and rejects a style key it doesn't know", () => {
    const states = [{ id: "plain", name: "Plain", overrides: { page: { unset: { style: ["gap"], props: [] } } } }]
    expect(parseCanvasDocument(document({ states })).containers[0]?.states[0]?.overrides?.page).toEqual({
      unset: { style: ["gap"], props: [] }
    })
    const bad = [{ id: "plain", name: "Plain", overrides: { page: { unset: { style: ["colour"] } } } }]
    expect(() => parseCanvasDocument(document({ states: bad }))).toThrow("/overrides/page/unset/style/0")
  })

  it("takes only accessibility props on a layout or text layer (PAR-913)", () => {
    const named = { ...root, props: { role: "region", "aria-label": "Team" } }
    expect(parseCanvasDocument(document({ root: named })).containers[0]?.root).toEqual(named)
    const bad = { ...root, props: { onClick: "save" } }
    expect(() => parseCanvasDocument(document({ root: bad }))).toThrow(
      '/containers/0/root/props/onClick: a layout or text layer takes role, id and aria-* props, not "onClick"'
    )
  })

  it("refuses a component's date prop that `new Date` can't read (PAR-912)", () => {
    const calendar = {
      type: "component",
      id: "calendar",
      component: "Calendar",
      props: { selected: { $date: "soon" } }
    }

    expect(() => parseCanvasDocument(document({ root: { ...root, children: [calendar] } }))).toThrow(
      "/containers/0/root/children/0/props/selected/$date: expected a date"
    )
  })

  it("rejects overrides for nodes that don't exist", () => {
    const states = [{ id: "x", name: "X", overrides: { missing: { hidden: true } } }]
    expect(() => parseCanvasDocument(document({ states }))).toThrow("no node has this id")
  })
})

describe("sizing", () => {
  const sized = (direction: "row" | "column", style: DesignNode["style"], parent: DesignNode["style"] = {}) => {
    const [page] = resolveDesign(
      {
        type: "layout",
        id: "page",
        style: { ...parent, direction },
        children: [{ type: "layout", id: "box", style, children: [] }]
      },
      undefined,
      "desktop"
    )

    if (page?.kind !== "element" || page.children[0]?.kind !== "element") {
      throw new Error("expected elements")
    }

    return page.children[0].style
  }

  it("fills along the parent's direction by growing, and across it by stretching", () => {
    expect(sized("row", { width: "fill" })).toMatchObject({ flex: "1 1 0%", minWidth: "0" })
    expect(sized("column", { width: "fill" })).toMatchObject({ alignSelf: "stretch" })
    expect(sized("column", { height: "fill" })).toMatchObject({ flex: "1 1 0%", minHeight: "0" })
  })

  it("fills across up to a maximum and then takes its place, as mx-auto max-w-… does", () => {
    // Stretching would give way to `self`, leaving the box as wide as its content.
    expect(sized("column", { width: "fill", maxWidth: 240, self: "center" })).toMatchObject({
      width: "100%",
      maxWidth: "calc(var(--spacing) * 240)",
      alignSelf: "center"
    })
    // A stretched box stops at its maximum at the start; filling instead leaves it to the parent's alignment.
    const capped = sized("column", { width: "fill", maxWidth: 112 }, { align: "center" })
    expect(capped).toMatchObject({ width: "100%", maxWidth: "calc(var(--spacing) * 112)" })
    expect(capped.alignSelf).toBeUndefined()
    expect(sized("row", { height: "fill", self: "end" })).toMatchObject({ height: "100%", alignSelf: "flex-end" })
    // Along the parent, it still grows.
    expect(sized("row", { width: "fill", maxWidth: 240 })).toMatchObject({ flex: "1 1 0%" })
    expect(sized("row", { width: "fill", maxWidth: 240 }).width).toBeUndefined()
    // Hugging still hugs.
    expect(sized("column", { width: "hug", maxWidth: 240, self: "center" })).toMatchObject({
      width: "fit-content",
      alignSelf: "center"
    })
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

      if (page?.kind !== "element" || page.children[0]?.kind !== "element") {
        throw new Error("expected elements")
      }

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

  it("draws an inline tag as a block when its style needs one, in a slot as in a layout", () => {
    const [cell] = resolveDesign(
      {
        type: "component",
        id: "cell",
        component: "TableCell",
        slots: {
          children: [
            { type: "text", id: "amount", tag: "span", text: "$1,200", style: { textAlign: "end" } },
            { type: "text", id: "note", tag: "strong", text: "Paid" },
            { type: "text", id: "title", tag: "p", text: "Plans", style: { maxWidth: 40 } }
          ]
        }
      },
      undefined,
      "desktop"
    )

    if (cell?.kind !== "component") {
      throw new Error("expected a component")
    }

    const display = cell.slots.children?.map((child) => (child.kind === "element" ? child.style.display : null))
    expect(display).toEqual(["block", undefined, undefined])
  })

  it("stretches a component placed against both edges over the width its own classes give it", () => {
    const [page] = resolveDesign(
      {
        type: "layout",
        id: "page",
        children: [
          {
            type: "component",
            id: "line",
            component: "Separator",
            props: { style: { width: "100%" } },
            style: { position: "absolute", left: 14, right: 0 }
          }
        ]
      },
      undefined,
      "desktop"
    )

    if (page?.kind !== "element" || page.children[0]?.kind !== "component") {
      throw new Error("expected a component")
    }

    expect(page.children[0].props.style).toMatchObject({ width: "auto", left: "calc(var(--spacing) * 14)", right: "0" })
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

  it("writes a layer order as z-index, from a whole number or a z-index token", () => {
    expect(sized("row", { zIndex: 10 }).zIndex).toBe("10")
    expect(sized("row", { zIndex: -5 }).zIndex).toBe("-5")
    expect(sized("row", { zIndex: "z-overlay" }).zIndex).toBe("var(--z-overlay)")
    expect(sized("row", {}).zIndex).toBeUndefined()
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

    if (page?.kind !== "element") {
      throw new Error("expected an element")
    }

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
    // A field states don't have yet, which a design from a newer Parity could.
    const busy = { id: "busy", name: "Busy", added: [{ type: "instance", id: "spinner", design: "button" }] }
    const stated: ContainerSpec = { ...other, states: [{ id: "base", name: "Base" }, busy] }

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
