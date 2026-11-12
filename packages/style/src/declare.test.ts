import { describe, expect, it } from "vite-plus/test"
import { type Declaration, declarations, type StyleContext } from "./declare.ts"
import { owned, setsForOthers } from "./ledger.ts"
import { type NodeStyle, styleKeys } from "./model.ts"

/** A component draws nothing of its own, so its declarations are only what the style's keys write. */
const component: StyleContext = { kind: "component" }
const inRow: StyleContext = { kind: "component", parent: "row" }
const inColumn: StyleContext = { kind: "component", parent: "column" }
const layout: StyleContext = { kind: "layout" }
const text: StyleContext = { kind: "text" }
const inlineText: StyleContext = { kind: "text", inline: true }

/** What a layout draws before any key is set. */
const flexBox = [
  ["display", "flex", "display"],
  ["flex-direction", "column", "direction"]
] as const

type Written = readonly (readonly [property: string, value: string, from: string])[]

function written(style: NodeStyle, context: StyleContext): Written {
  return declarations(style, context).map(({ property, value, from }) => [property, value, from] as const)
}

/** Each key in each form its value takes, with the declarations it writes. */
const cases: readonly (readonly [name: string, style: NodeStyle, context: StyleContext, expected: Written])[] = [
  ["a layout with nothing set", {}, layout, flexBox],
  [
    "display: grid, two columns unless it says",
    { display: "grid" },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "repeat(2, minmax(0, 1fr))", "columns"]
    ]
  ],
  [
    "columns and rows",
    { display: "grid", columns: 3, rows: 2 },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "repeat(3, minmax(0, 1fr))", "columns"],
      ["grid-template-rows", "repeat(2, minmax(0, 1fr))", "rows"]
    ]
  ],
  [
    "direction: row, wrapping",
    { direction: "row", wrap: true },
    layout,
    [...flexBox.slice(0, 1), ["flex-direction", "row", "direction"], ["flex-wrap", "wrap", "wrap"]]
  ],
  ["gap in steps", { gap: 4 }, layout, [...flexBox, ["gap", "calc(var(--spacing) * 4)", "gap"]]],
  ["gap of none", { gap: 0 }, layout, [...flexBox, ["gap", "0", "gap"]]],
  ["gap as a token", { gap: "gutter" }, layout, [...flexBox, ["gap", "var(--gutter)", "gap"]]],
  ["rowGap", { rowGap: 2 }, layout, [...flexBox, ["row-gap", "calc(var(--spacing) * 2)", "rowGap"]]],
  ["align", { align: "end" }, layout, [...flexBox, ["align-items", "flex-end", "align"]]],
  ["justify", { justify: "between" }, layout, [...flexBox, ["justify-content", "space-between", "justify"]]],
  [
    "justify in a grid places items in their cells",
    { display: "grid", justify: "center" },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "repeat(2, minmax(0, 1fr))", "columns"],
      ["justify-items", "center", "justify"]
    ]
  ],
  [
    "justify in a grid distributes the tracks",
    { display: "grid", justify: "evenly" },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "repeat(2, minmax(0, 1fr))", "columns"],
      ["justify-content", "space-evenly", "justify"]
    ]
  ],
  ["a component ignores layout keys", { direction: "row", gap: 4, align: "center", wrap: true }, component, []],

  ["padding on all sides", { padding: 4 }, component, [["padding", "calc(var(--spacing) * 4)", "padding"]]],
  [
    "padding per axis",
    { padding: [2, "gutter"] },
    component,
    [["padding", "calc(var(--spacing) * 2) var(--gutter)", "padding"]]
  ],
  [
    "padding per side",
    { padding: [1, 2, 0, 4] },
    component,
    [["padding", "calc(var(--spacing) * 1) calc(var(--spacing) * 2) 0 calc(var(--spacing) * 4)", "padding"]]
  ],
  ["margin", { margin: [0, 2] }, component, [["margin", "0 calc(var(--spacing) * 2)", "margin"]]],
  ["text has no margin of its own", {}, text, [["margin", "0", "margin"]]],
  ["text with a margin", { margin: 2 }, text, [["margin", "calc(var(--spacing) * 2)", "margin"]]],

  ["a fixed width", { width: 20 }, component, [["width", "calc(var(--spacing) * 20)", "width"]]],
  ["a width token", { width: "container-sm" }, component, [["width", "var(--container-sm)", "width"]]],
  [
    "hugging",
    { width: "hug", height: "hug" },
    component,
    [
      ["width", "fit-content", "width"],
      ["height", "fit-content", "height"]
    ]
  ],
  ["filling with no layout around it", { width: "fill" }, component, [["width", "100%", "width"]]],
  [
    "a fixed length along a row doesn't shrink",
    { width: 20, height: 10 },
    inRow,
    [
      ["width", "calc(var(--spacing) * 20)", "width"],
      ["flex-shrink", "0", "width"],
      ["height", "calc(var(--spacing) * 10)", "height"]
    ]
  ],
  [
    "filling a row along it grows, and across it stretches",
    { width: "fill", height: "fill" },
    inRow,
    [
      ["flex", "1 1 0%", "width"],
      ["min-width", "0", "width"],
      ["align-self", "stretch", "height"]
    ]
  ],
  [
    "filling a column along it grows, and across it stretches",
    { width: "fill", height: "fill" },
    inColumn,
    [
      ["align-self", "stretch", "width"],
      ["flex", "1 1 0%", "height"],
      ["min-height", "0", "height"]
    ]
  ],
  [
    "grow in a row",
    { grow: true },
    inRow,
    [
      ["flex", "1 1 0%", "grow"],
      ["min-width", "0", "grow"]
    ]
  ],
  [
    "grow in a column",
    { grow: true },
    inColumn,
    [
      ["flex", "1 1 0%", "grow"],
      ["min-height", "0", "grow"]
    ]
  ],
  [
    "grow with no layout around it",
    { grow: true },
    component,
    [
      ["flex", "1 1 0%", "grow"],
      ["min-width", "0", "grow"]
    ]
  ],
  [
    "least and most sizes",
    { minWidth: 10, maxWidth: "container-md", minHeight: 0, maxHeight: 40 },
    component,
    [
      ["min-width", "calc(var(--spacing) * 10)", "minWidth"],
      ["max-width", "var(--container-md)", "maxWidth"],
      ["min-height", "0", "minHeight"],
      ["max-height", "calc(var(--spacing) * 40)", "maxHeight"]
    ]
  ],
  [
    "a layout's least width",
    { minWidth: 10 },
    layout,
    [
      ["display", "flex", "display"],
      ["min-width", "calc(var(--spacing) * 10)", "minWidth"],
      ["flex-direction", "column", "direction"]
    ]
  ],
  ["self", { self: "start" }, component, [["align-self", "flex-start", "self"]]],
  [
    "a centred column fills up to its maximum",
    { width: "fill", maxWidth: 160, self: "center" },
    inColumn,
    [
      ["width", "100%", "width"],
      ["max-width", "calc(var(--spacing) * 160)", "maxWidth"],
      ["align-self", "center", "self"]
    ]
  ],
  [
    "a fill with a maximum is left to the parent's alignment",
    { width: "fill", maxWidth: 112 },
    inColumn,
    [
      ["width", "100%", "width"],
      ["max-width", "calc(var(--spacing) * 112)", "maxWidth"]
    ]
  ],
  [
    "a fill along the parent with a maximum still grows",
    { width: "fill", maxWidth: 112 },
    inRow,
    [
      ["flex", "1 1 0%", "width"],
      ["min-width", "0", "width"],
      ["max-width", "calc(var(--spacing) * 112)", "maxWidth"]
    ]
  ],
  // A fill placed by `self` takes the whole parent rather than stretching, which `self` would replace (PAR-897).
  [
    "self over filling across a row",
    { height: "fill", self: "center" },
    inRow,
    [
      ["height", "100%", "height"],
      ["align-self", "center", "self"]
    ]
  ],
  [
    "spans",
    { colSpan: 2, rowSpan: 3 },
    component,
    [
      ["grid-column", "span 2 / span 2", "colSpan"],
      ["grid-row", "span 3 / span 3", "rowSpan"]
    ]
  ],

  [
    "position, placed against its parent's edges, stretching between both edges whatever size its classes give it",
    { position: "absolute", top: 0, right: 4, bottom: "inset", left: 2 },
    component,
    [
      ["position", "absolute", "position"],
      ["top", "0", "top"],
      ["right", "calc(var(--spacing) * 4)", "right"],
      ["bottom", "var(--inset)", "bottom"],
      ["left", "calc(var(--spacing) * 2)", "left"],
      ["width", "auto", "right"],
      ["height", "auto", "bottom"]
    ]
  ],
  [
    "a component placed between both edges keeps a width it's given",
    { position: "absolute", left: 4, right: 0, width: 20 },
    component,
    [
      ["width", "calc(var(--spacing) * 20)", "width"],
      ["position", "absolute", "position"],
      ["right", "0", "right"],
      ["left", "calc(var(--spacing) * 4)", "left"]
    ]
  ],
  ["edges without a position write nothing", { top: 4, left: 4 }, component, []],
  [
    "an absolute layout",
    { position: "absolute" },
    layout,
    [
      ["display", "flex", "display"],
      ["position", "absolute", "position"],
      ["flex-direction", "column", "direction"]
    ]
  ],
  [
    "a layout a child is placed in",
    {},
    { kind: "layout", anchors: true },
    [
      ["display", "flex", "display"],
      ["position", "relative", "position"],
      ["flex-direction", "column", "direction"]
    ]
  ],
  [
    "an absolute layout a child is placed in",
    { position: "absolute" },
    { kind: "layout", anchors: true },
    [
      ["display", "flex", "display"],
      ["position", "absolute", "position"],
      ["flex-direction", "column", "direction"]
    ]
  ],
  ["zIndex as a number", { zIndex: -1 }, component, [["z-index", "-1", "zIndex"]]],
  ["zIndex as a token", { zIndex: "z-modal" }, component, [["z-index", "var(--z-modal)", "zIndex"]]],

  ["background", { background: "primary" }, component, [["background", "var(--primary)", "background"]]],
  [
    "a stack of paints, the bottom color under the image layers",
    {
      background: [
        { kind: "image", src: "/t.png", fit: "fill" },
        { kind: "gradient", token: "gradient-brand" },
        { kind: "solid", color: "muted", alpha: 50 }
      ]
    },
    component,
    [
      ["background-color", "color-mix(in oklab, var(--muted) 50%, transparent)", "background"],
      ["background-image", 'url("/t.png"), var(--gradient-brand)', "background"],
      ["background-size", "cover, auto", "background"],
      ["background-position", "50% 50%, 0% 0%", "background"],
      ["background-repeat", "no-repeat, repeat", "background"]
    ]
  ],
  [
    "a border color alone is a 1px solid border",
    { border: "input" },
    component,
    [
      ["border-width", "1px", "borderWidth"],
      ["border-style", "solid", "borderStyle"],
      ["border-color", "var(--input)", "border"]
    ]
  ],
  [
    "a border width alone takes the project's border color",
    { borderWidth: 2, borderStyle: "dashed" },
    component,
    [
      ["border-width", "2px", "borderWidth"],
      ["border-style", "dashed", "borderStyle"],
      ["border-color", "var(--border, currentColor)", "border"]
    ]
  ],
  ["a border style alone writes nothing", { borderStyle: "dotted" }, component, []],
  ["radius as a token", { radius: "radius-md" }, component, [["border-radius", "var(--radius-md)", "radius"]]],
  [
    "radius as a keyword",
    { radius: "radius-full" },
    component,
    [["border-radius", "var(--radius-full, calc(infinity * 1px))", "radius"]]
  ],
  ["shadow", { shadow: "shadow-md" }, component, [["box-shadow", "var(--shadow-md)", "shadow"]]],
  [
    "a stack of shadows, top first, without the ones that are off",
    {
      shadow: [
        { kind: "drop", token: "shadow-md" },
        { kind: "inner", x: 0, y: 1, blur: 2, spread: 0, color: { color: "foreground", alpha: 10 } },
        { kind: "ring", width: 1, color: { color: "ring" }, off: true }
      ]
    },
    component,
    [
      [
        "box-shadow",
        "var(--shadow-md), inset 0 1px 2px 0 color-mix(in oklab, var(--foreground) 10%, transparent)",
        "shadow"
      ]
    ]
  ],
  [
    "filters, and those on what's behind",
    {
      filter: [
        { kind: "blur", value: "blur-sm" },
        { kind: "adjust", values: { brightness: 25 } }
      ],
      backdropFilter: [{ kind: "blur", value: "blur-md" }]
    },
    component,
    [
      ["filter", "blur(var(--blur-sm)) brightness(125%)", "filter"],
      ["backdrop-filter", "blur(var(--blur-md))", "backdropFilter"]
    ]
  ],
  [
    "a transform, each part its own property",
    { transform: { x: 2, y: { percent: -50 }, rotate: 45, scaleX: -100, skewX: 10, origin: { x: 50, y: 0 } } },
    component,
    [
      ["translate", "calc(var(--spacing) * 2) -50%", "transform"],
      ["rotate", "45deg", "transform"],
      ["scale", "-1 1", "transform"],
      ["transform", "skewX(10deg)", "transform"],
      ["transform-origin", "50% 0%", "transform"]
    ]
  ],
  ["opacity", { opacity: 50 }, component, [["opacity", "0.5", "opacity"]]],
  ["opacity of none", { opacity: 0 }, component, [["opacity", "0", "opacity"]]],
  ["overflow", { overflow: "hidden" }, component, [["overflow", "hidden", "overflow"]]],
  [
    "overflow: scroll scrolls only when it needs to",
    { overflow: "scroll" },
    component,
    [["overflow", "auto", "overflow"]]
  ],

  ["foreground", { foreground: "muted-foreground" }, component, [["color", "var(--muted-foreground)", "foreground"]]],
  ["font", { font: "font-sans" }, component, [["font-family", "var(--font-sans)", "font"]]],
  [
    "size brings its line height",
    { size: "text-lg" },
    component,
    [
      ["font-size", "var(--text-lg)", "size"],
      ["line-height", "var(--text-lg--line-height, 1.5)", "size"]
    ]
  ],
  [
    "leading over the size's line height",
    { size: "text-lg", leading: "leading-tight" },
    component,
    [
      ["font-size", "var(--text-lg)", "size"],
      ["line-height", "var(--leading-tight)", "leading"]
    ]
  ],
  ["weight", { weight: 600 }, component, [["font-weight", "600", "weight"]]],
  ["tracking", { tracking: "tracking-wide" }, component, [["letter-spacing", "var(--tracking-wide)", "tracking"]]],
  ["textAlign", { textAlign: "center" }, component, [["text-align", "center", "textAlign"]]],
  ["textTransform", { textTransform: "uppercase" }, component, [["text-transform", "uppercase", "textTransform"]]],
  ["decoration", { decoration: "line-through" }, component, [["text-decoration-line", "line-through", "decoration"]]],
  ["italic", { italic: true }, component, [["font-style", "italic", "italic"]]],
  ["overflowWrap", { overflowWrap: "anywhere" }, component, [["overflow-wrap", "anywhere", "overflowWrap"]]],
  ["what's switched off writes nothing", { italic: false, wrap: false, grow: false }, layout, flexBox],

  [
    "hugging text is as wide as its line",
    { width: "hug" },
    text,
    [
      ["margin", "0", "margin"],
      ["width", "max-content", "width"]
    ]
  ],
  [
    "one line",
    { lines: 1 },
    text,
    [
      ["margin", "0", "margin"],
      ["overflow", "hidden", "lines"],
      ["text-overflow", "ellipsis", "lines"],
      ["white-space", "nowrap", "lines"]
    ]
  ],
  [
    "several lines",
    { lines: 3 },
    text,
    [
      ["margin", "0", "margin"],
      ["display", "-webkit-box", "lines"],
      ["-webkit-box-orient", "vertical", "lines"],
      ["-webkit-line-clamp", "3", "lines"],
      ["overflow", "hidden", "lines"]
    ]
  ],
  [
    "inline text given a maximum width draws as a block",
    { maxWidth: 40, lines: 1 },
    inlineText,
    [
      ["margin", "0", "margin"],
      ["max-width", "calc(var(--spacing) * 40)", "maxWidth"],
      ["display", "block", "maxWidth"],
      ["overflow", "hidden", "lines"],
      ["text-overflow", "ellipsis", "lines"],
      ["white-space", "nowrap", "lines"]
    ]
  ],
  [
    "inline text aligned draws as a block",
    { textAlign: "end" },
    inlineText,
    [
      ["margin", "0", "margin"],
      ["text-align", "end", "textAlign"],
      ["display", "block", "textAlign"]
    ]
  ],
  [
    "inline text cut off after several lines keeps the box that clamps it",
    { lines: 2 },
    inlineText,
    [
      ["margin", "0", "margin"],
      ["display", "-webkit-box", "lines"],
      ["-webkit-box-orient", "vertical", "lines"],
      ["-webkit-line-clamp", "2", "lines"],
      ["overflow", "hidden", "lines"]
    ]
  ],
  [
    "inline text with nothing that needs a box stays inline",
    { weight: 600 },
    inlineText,
    [
      ["margin", "0", "margin"],
      ["font-weight", "600", "weight"]
    ]
  ],
  ["lines on anything but text write nothing", { lines: 2 }, component, []],
  [
    "transitions, leaving out a hidden one",
    {
      transitions: [
        { property: "opacity", duration: 200, easing: "linear" },
        { property: "width", hidden: true }
      ]
    },
    component,
    [["transition", "opacity 200ms linear", "transitions"]]
  ]
]

describe("declarations", () => {
  it.each(cases)("%s", (_name, style, context, expected) => {
    expect(written(style, context)).toEqual(expected)
  })

  it("has a case for every key", () => {
    const covered = new Set(cases.flatMap(([, style]) => Object.keys(style)))

    expect(styleKeys.filter((key) => !covered.has(key))).toEqual([])
  })

  it("writes only properties the key owns, or sets for the key that does", () => {
    const strays = cases.flatMap(([, style, context]) =>
      declarations(style, context).flatMap(({ property, from }) =>
        owned[from].includes(property) || setsForOthers[from]?.includes(property) ? [] : [`${from} writes ${property}`]
      )
    )

    expect(strays).toEqual([])
  })

  it("draws an image, a video and an instance as it draws a component", () => {
    const style: NodeStyle = { width: "fill", background: "muted", radius: "radius-md", opacity: 80 }
    const expected = declarations(style, inRow)

    for (const kind of ["image", "video", "instance"] as const) {
      expect(declarations(style, { kind, parent: "row" })).toEqual(expected)
    }
  })

  it("writes each property once", () => {
    const style: NodeStyle = { grow: true, width: "fill", minWidth: 4, size: "text-sm", leading: "leading-6", lines: 2 }
    const properties = declarations(style, { kind: "text", parent: "row" }).map(({ property }) => property)

    expect(properties).toEqual([...new Set(properties)])
  })

  it("keeps a property where it was first written when a later key changes it", () => {
    const under: Declaration[] = declarations({ size: "text-sm", weight: 500 }, component)
    const over: Declaration[] = declarations({ size: "text-sm", weight: 500, leading: "leading-6" }, component)

    expect(over.map(({ property }) => property)).toEqual(under.map(({ property }) => property))
  })
})
