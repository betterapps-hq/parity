import type { ContainerSpec, DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  designCapabilities,
  layerCapabilities,
  type InspectorSection,
  panelParts,
  selectionCapabilities,
  type StyleControl,
  styleParts,
  type StyleSection,
  type TakesStyle
} from "./layer-capabilities.ts"
import { styleSelection } from "./style-editing.ts"

/** One of each layer kind, prefixed with where it sits. */
function kinds(prefix: string): DesignNode[] {
  return [
    { type: "layout", id: `${prefix}-layout`, children: [] },
    { type: "text", id: `${prefix}-text`, text: "Title" },
    { type: "image", id: `${prefix}-image`, src: "photo.png" },
    { type: "video", id: `${prefix}-video`, src: "clip.mp4" },
    { type: "component", id: `${prefix}-button`, component: "Button" },
    { type: "component", id: `${prefix}-row`, component: "MemberRow" },
    { type: "instance", id: `${prefix}-card`, design: "card" }
  ]
}

/** A screen whose root is a row holding one of each kind, and a grid holding one of each kind. */
function screen(kind: ContainerSpec["kind"] = "screen"): ContainerSpec {
  return {
    id: "pricing",
    name: "Pricing",
    kind,
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      style: { flexDirection: "row" },
      children: [
        ...kinds("flex"),
        {
          type: "layout",
          id: "grid",
          style: { display: "grid", gridTemplateColumns: [{ fr: 1 }, { fr: 1 }] },
          children: kinds("grid")
        }
      ]
    }
  }
}

/** Button takes `className`; MemberRow doesn't. */
const takesStyle: TakesStyle = (component) => component !== "MemberRow"

/** The sections and conditional controls the layers get, as the panel would show them. */
function partsOf(container: ContainerSpec, ids: string[]) {
  const selection = styleSelection(container, ids, undefined)!
  const parts = styleParts(selectionCapabilities(container, selection.layers, takesStyle))

  return { sections: parts.sections, controls: [...parts.controls].sort() }
}

const last: StyleSection[] = ["fill", "stroke", "effects", "motion", "rawCss"]

/** A layer's sections around its own: placement, layer order, transform and size before, and the rest after. */
function nested(between: StyleSection[], text: boolean, layout = false): StyleSection[] {
  return [
    "placement",
    "layerOrder",
    "transform",
    "size",
    ...between,
    "spacing",
    ...(layout ? ["layout" as const] : []),
    ...(text ? ["text" as const] : []),
    "appearance",
    ...last
  ]
}

const sorted = (controls: StyleControl[]) => [...controls].sort()

describe("a layer's capabilities", () => {
  it("make a screen's root a box that holds text and has no parent", () => {
    const container = screen()

    expect(layerCapabilities(container, { id: "root", node: container.root, parent: undefined })).toEqual({
      box: true,
      root: true,
      frame: false,
      text: false,
      textInside: true,
      media: false,
      inFlex: false,
      inGrid: false,
      styled: true,
      design: false,
      component: false,
      instance: false,
      attrs: false,
      copy: false
    })
  })

  it("never make a layer inside an instance its design's root", () => {
    const container = screen()
    const layer = { id: "card/root", node: container.root, parent: undefined }

    expect(layerCapabilities(container, layer).root).toBe(false)
  })

  it("count a code component whose props aren't known as taking style", () => {
    const container = screen()
    const node: DesignNode = { type: "component", id: "flex-row", component: "MemberRow" }

    expect(layerCapabilities(container, { id: node.id, node, parent: undefined }).styled).toBe(true)
    expect(layerCapabilities(container, { id: node.id, node, parent: undefined }, takesStyle).styled).toBe(false)
  })

  it("hold nothing for no layers", () => {
    expect(Object.values(selectionCapabilities(screen(), [])).some(Boolean)).toBe(false)
  })
})

describe("the sections and controls each kind of layer gets", () => {
  it("give a screen's or component's root its size, layout and text inside, without placement or margin", () => {
    const expected = {
      sections: ["size", "spacing", "layout", "text", "appearance", ...last],
      controls: ["sizeFill"]
    }

    expect(partsOf(screen("screen"), ["root"])).toEqual(expected)
    expect(partsOf(screen("component"), ["root"])).toEqual(expected)
  })

  it("give a frame's root the frame's size in place of Size", () => {
    expect(partsOf(screen("frame"), ["root"])).toEqual({
      sections: ["frameSize", "spacing", "layout", "text", "appearance", ...last],
      controls: ["sizeFill"]
    })
  })

  it.each([
    ["flex", [], sorted(["sizeFill", "alignSelf", "margin"])],
    ["grid", ["gridPlacement"], sorted(["sizeFill", "span", "margin"])]
  ] as const)("give a layout in a %s parent its layout and text inside", (parent, placement, controls) => {
    expect(partsOf(screen(), [`${parent}-layout`])).toEqual({
      sections: nested([...placement], true, true),
      controls
    })
  })

  it.each([
    ["flex", [], ["alignSelf"]],
    ["grid", ["gridPlacement"], ["span"]]
  ] as const)("give text in a %s parent its tag, max lines and resizing", (parent, placement, controls) => {
    expect(partsOf(screen(), [`${parent}-text`])).toEqual({
      sections: nested([...placement], true),
      controls: sorted(["sizeFill", "margin", "tag", "maxLines", "resizing", ...controls])
    })
  })

  it.each([
    ["an image", "flex", "image", [], ["alignSelf"]],
    ["an image", "grid", "image", ["gridPlacement"], ["span"]],
    ["a video", "flex", "video", [], ["alignSelf"]],
    ["a video", "grid", "video", ["gridPlacement"], ["span"]]
  ] as const)("give %s in a %s parent no text section", (_, parent, kind, placement, controls) => {
    expect(partsOf(screen(), [`${parent}-${kind}`])).toEqual({
      sections: nested([...placement], false),
      controls: sorted(["sizeFill", "margin", ...controls])
    })
  })

  it.each([
    ["a code component that takes className", "flex", "button", [], ["alignSelf"]],
    ["a code component that takes className", "grid", "button", ["gridPlacement"], ["span"]],
    ["an instance", "flex", "card", [], ["alignSelf"]],
    ["an instance", "grid", "card", ["gridPlacement"], ["span"]]
  ] as const)("give %s in a %s parent text inside but no layout", (_, parent, kind, placement, controls) => {
    expect(partsOf(screen(), [`${parent}-${kind}`])).toEqual({
      sections: nested([...placement], true),
      controls: sorted(["sizeFill", "margin", ...controls])
    })
  })

  it("give a code component that takes no className no style sections", () => {
    expect(partsOf(screen(), ["flex-row"])).toEqual({ sections: [], controls: [] })
    expect(partsOf(screen(), ["grid-row"])).toEqual({ sections: [], controls: [] })
  })
})

describe("the sections and controls a mixed selection gets", () => {
  it("give text's controls to the text layers of a selection, and Layout only when every layer is a layout", () => {
    expect(partsOf(screen(), ["flex-layout", "flex-text"])).toEqual({
      sections: nested([], true),
      controls: sorted(["sizeFill", "alignSelf", "margin", "tag", "maxLines", "resizing"])
    })
  })

  it("show the text section for text beside an image, which has no text of its own", () => {
    expect(partsOf(screen(), ["flex-text", "flex-image"]).sections).toContain("text")
  })

  it("leave out what only some of the layers' parents allow", () => {
    expect(partsOf(screen(), ["flex-image", "grid-image"])).toEqual({
      sections: nested([], false),
      controls: ["margin"]
    })
  })

  it("leave out the style sections when one layer takes no style", () => {
    expect(partsOf(screen(), ["flex-layout", "flex-row"])).toEqual({ sections: [], controls: [] })
  })
})

describe("the sections each selection gets", () => {
  /** The sections one layer of `container` gets, found by its id or path, or the design's own without one. */
  function sectionsOf(container: ContainerSpec, id?: string, node?: DesignNode): InspectorSection[] {
    if (id === undefined) {
      return panelParts(designCapabilities(container, takesStyle))
    }

    const layer = node ?? styleSelection(container, [id], undefined)!.layers[0]!.node

    return panelParts(selectionCapabilities(container, [{ id, node: layer, parent: undefined }], takesStyle))
  }

  it("give a screen its components to make and its modes, and no style sections", () => {
    expect(sectionsOf(screen("screen"))).toEqual(["header", "components", "modes", "export"])
  })

  it("give a component design the props it defines and its modes", () => {
    expect(sectionsOf(screen("component"))).toEqual(["header", "props", "modes", "export"])
  })

  it("give a frame its root's style sections, and no modes", () => {
    expect(sectionsOf(screen("frame"))).toEqual(["header", "styles", "export"])
  })

  it.each([
    ["flex-layout", ["header", "styles", "export"]],
    ["flex-text", ["header", "content", "styles", "export"]],
    ["flex-image", ["header", "media", "styles", "export"]],
    ["flex-card", ["header", "props", "styles", "export"]],
    ["flex-button", ["header", "props", "attributes", "styles", "export"]],
    ["flex-row", ["header", "props", "attributes", "noStyle", "styles", "export"]]
  ] as const)("give %s its own sections", (id, sections) => {
    expect(sectionsOf(screen(), id)).toEqual(sections)
  })

  it("leave an image's file to its component inside an instance", () => {
    const image: DesignNode = { type: "image", id: "photo", src: "photo.png" }

    expect(sectionsOf(screen(), "card/photo", image)).toEqual(["header", "styles", "export"])
  })
})
