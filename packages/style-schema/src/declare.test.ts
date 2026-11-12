import { describe, expect, it } from "vite-plus/test"
import { type Declaration, declarations, type StyleContext } from "./declare.ts"
import { owned, ownerOf, setsForOthers } from "./ledger.ts"
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
  ["flex-direction", "column", "flexDirection"]
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
      ["grid-template-columns", "repeat(2, minmax(0, 1fr))", "gridTemplateColumns"]
    ]
  ],
  [
    "tracks of different sizes, one a track",
    {
      display: "grid",
      gridTemplateColumns: [{ value: "200px" }, { fr: 1 }, { step: 10 }, { fr: 2 }],
      gridTemplateRows: [{ keyword: "auto" }, { token: "row" }, { expr: "minmax(4rem, auto)" }]
    },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "200px minmax(0, 1fr) calc(var(--spacing) * 10) minmax(0, 2fr)", "gridTemplateColumns"],
      ["grid-template-rows", "auto var(--row) minmax(4rem, auto)", "gridTemplateRows"]
    ]
  ],
  [
    "gridTemplateColumns and gridTemplateRows",
    {
      display: "grid",
      gridTemplateColumns: [{ fr: 1 }, { fr: 1 }, { fr: 1 }],
      gridTemplateRows: [{ fr: 1 }, { fr: 1 }]
    },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "repeat(3, minmax(0, 1fr))", "gridTemplateColumns"],
      ["grid-template-rows", "repeat(2, minmax(0, 1fr))", "gridTemplateRows"]
    ]
  ],
  [
    "flexDirection: row, wrapping",
    { flexDirection: "row", flexWrap: "wrap" },
    layout,
    [...flexBox.slice(0, 1), ["flex-direction", "row", "flexDirection"], ["flex-wrap", "wrap", "flexWrap"]]
  ],
  ["gap in steps", { gap: { step: 4 } }, layout, [...flexBox, ["gap", "calc(var(--spacing) * 4)", "gap"]]],
  ["gap of none", { gap: { step: 0 } }, layout, [...flexBox, ["gap", "0", "gap"]]],
  ["gap as a token", { gap: { token: "gutter" } }, layout, [...flexBox, ["gap", "var(--gutter)", "gap"]]],
  ["gap as a value", { gap: { value: "12px" } }, layout, [...flexBox, ["gap", "12px", "gap"]]],
  [
    "gap as an expression",
    { gap: { expr: "clamp(1rem, 2vw, 2rem)" } },
    layout,
    [...flexBox, ["gap", "clamp(1rem, 2vw, 2rem)", "gap"]]
  ],
  ["rowGap", { rowGap: { step: 2 } }, layout, [...flexBox, ["row-gap", "calc(var(--spacing) * 2)", "rowGap"]]],
  ["alignItems", { alignItems: "end" }, layout, [...flexBox, ["align-items", "flex-end", "alignItems"]]],
  [
    "justifyContent",
    { justifyContent: "space-between" },
    layout,
    [...flexBox, ["justify-content", "space-between", "justifyContent"]]
  ],
  [
    "justifyContent in a grid places items in their cells",
    { display: "grid", justifyContent: "center" },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "repeat(2, minmax(0, 1fr))", "gridTemplateColumns"],
      ["justify-items", "center", "justifyContent"]
    ]
  ],
  [
    "justifyContent in a grid distributes the tracks",
    { display: "grid", justifyContent: "space-evenly" },
    layout,
    [
      ["display", "grid", "display"],
      ["grid-template-columns", "repeat(2, minmax(0, 1fr))", "gridTemplateColumns"],
      ["justify-content", "space-evenly", "justifyContent"]
    ]
  ],
  [
    "a component ignores layout keys",
    { flexDirection: "row", gap: { step: 4 }, alignItems: "center", flexWrap: "wrap" },
    component,
    []
  ],

  ["padding on all sides", { padding: { step: 4 } }, component, [["padding", "calc(var(--spacing) * 4)", "padding"]]],
  [
    "padding per axis",
    { padding: [{ step: 2 }, { token: "gutter" }] },
    component,
    [["padding", "calc(var(--spacing) * 2) var(--gutter)", "padding"]]
  ],
  [
    "padding per side",
    { padding: [{ step: 1 }, { step: 2 }, { step: 0 }, { step: 4 }] },
    component,
    [["padding", "calc(var(--spacing) * 1) calc(var(--spacing) * 2) 0 calc(var(--spacing) * 4)", "padding"]]
  ],
  ["margin", { margin: [{ step: 0 }, { step: 2 }] }, component, [["margin", "0 calc(var(--spacing) * 2)", "margin"]]],
  ["margin as a keyword", { margin: [{ step: 0 }, { keyword: "auto" }] }, component, [["margin", "0 auto", "margin"]]],
  ["text has no margin of its own", {}, text, [["margin", "0", "margin"]]],
  ["text with a margin", { margin: { step: 2 } }, text, [["margin", "calc(var(--spacing) * 2)", "margin"]]],

  ["a fixed width", { width: { step: 20 } }, component, [["width", "calc(var(--spacing) * 20)", "width"]]],
  ["a width token", { width: { token: "container-sm" } }, component, [["width", "var(--container-sm)", "width"]]],
  ["a width as a value", { width: { value: "50%" } }, component, [["width", "50%", "width"]]],
  ["a height as a keyword", { height: { keyword: "auto" } }, component, [["height", "auto", "height"]]],
  [
    "a width as an expression",
    { width: { expr: "calc(100% - 2rem)" } },
    inRow,
    [
      ["width", "calc(100% - 2rem)", "width"],
      ["flex-shrink", "0", "width"]
    ]
  ],
  [
    "hugging",
    { width: { size: "hug" }, height: { size: "hug" } },
    component,
    [
      ["width", "fit-content", "width"],
      ["height", "fit-content", "height"]
    ]
  ],
  ["filling with no layout around it", { width: { size: "fill" } }, component, [["width", "100%", "width"]]],
  [
    "a fixed length along a row doesn't shrink",
    { width: { step: 20 }, height: { step: 10 } },
    inRow,
    [
      ["width", "calc(var(--spacing) * 20)", "width"],
      ["flex-shrink", "0", "width"],
      ["height", "calc(var(--spacing) * 10)", "height"]
    ]
  ],
  [
    "filling a row along it grows, and across it stretches",
    { width: { size: "fill" }, height: { size: "fill" } },
    inRow,
    [
      ["flex", "1 1 0%", "width"],
      ["min-width", "0", "width"],
      ["align-self", "stretch", "height"]
    ]
  ],
  [
    "filling a column along it grows, and across it stretches",
    { width: { size: "fill" }, height: { size: "fill" } },
    inColumn,
    [
      ["align-self", "stretch", "width"],
      ["flex", "1 1 0%", "height"],
      ["min-height", "0", "height"]
    ]
  ],
  [
    "filling along a row with a share of the free space",
    { width: { size: "fill", share: 2 } },
    inRow,
    [
      ["flex", "2 1 0%", "width"],
      ["min-width", "0", "width"]
    ]
  ],
  [
    "a share across the parent changes nothing",
    { height: { size: "fill", share: 2 } },
    inRow,
    [["align-self", "stretch", "height"]]
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
    { minWidth: { step: 10 }, maxWidth: { token: "container-md" }, minHeight: { step: 0 }, maxHeight: { step: 40 } },
    component,
    [
      ["min-width", "calc(var(--spacing) * 10)", "minWidth"],
      ["max-width", "var(--container-md)", "maxWidth"],
      ["min-height", "0", "minHeight"],
      ["max-height", "calc(var(--spacing) * 40)", "maxHeight"]
    ]
  ],
  [
    "least and most sizes written out",
    { minWidth: { value: "280px" }, maxWidth: { expr: "min(100%, 40rem)" }, maxHeight: { keyword: "none" } },
    component,
    [
      ["min-width", "280px", "minWidth"],
      ["max-width", "min(100%, 40rem)", "maxWidth"],
      ["max-height", "none", "maxHeight"]
    ]
  ],
  [
    "a layout's least width",
    { minWidth: { step: 10 } },
    layout,
    [
      ["display", "flex", "display"],
      ["min-width", "calc(var(--spacing) * 10)", "minWidth"],
      ["flex-direction", "column", "flexDirection"]
    ]
  ],
  ["alignSelf", { alignSelf: "start" }, component, [["align-self", "flex-start", "alignSelf"]]],
  [
    "a centred column fills up to its maximum",
    { width: { size: "fill" }, maxWidth: { step: 160 }, alignSelf: "center" },
    inColumn,
    [
      ["width", "100%", "width"],
      ["max-width", "calc(var(--spacing) * 160)", "maxWidth"],
      ["align-self", "center", "alignSelf"]
    ]
  ],
  [
    "a fill with a maximum is left to the parent's alignment",
    { width: { size: "fill" }, maxWidth: { step: 112 } },
    inColumn,
    [
      ["width", "100%", "width"],
      ["max-width", "calc(var(--spacing) * 112)", "maxWidth"]
    ]
  ],
  [
    "a fill along the parent with a maximum still grows",
    { width: { size: "fill" }, maxWidth: { step: 112 } },
    inRow,
    [
      ["flex", "1 1 0%", "width"],
      ["min-width", "0", "width"],
      ["max-width", "calc(var(--spacing) * 112)", "maxWidth"]
    ]
  ],
  // A fill placed by `alignSelf` takes the whole parent rather than stretching, which `alignSelf` would replace
  // (PAR-897).
  [
    "alignSelf over filling across a row",
    { height: { size: "fill" }, alignSelf: "center" },
    inRow,
    [
      ["height", "100%", "height"],
      ["align-self", "center", "alignSelf"]
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
    { position: "absolute", top: { step: 0 }, right: { step: 4 }, bottom: { token: "inset" }, left: { step: 2 } },
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
    { position: "absolute", left: { step: 4 }, right: { step: 0 }, width: { step: 20 } },
    component,
    [
      ["width", "calc(var(--spacing) * 20)", "width"],
      ["position", "absolute", "position"],
      ["right", "0", "right"],
      ["left", "calc(var(--spacing) * 4)", "left"]
    ]
  ],
  [
    "edges written out",
    { position: "absolute", top: { value: "50%" }, left: { keyword: "auto" }, right: { expr: "calc(100% - 1rem)" } },
    layout,
    [
      ["display", "flex", "display"],
      ["position", "absolute", "position"],
      ["top", "50%", "top"],
      ["right", "calc(100% - 1rem)", "right"],
      ["left", "auto", "left"],
      ["flex-direction", "column", "flexDirection"]
    ]
  ],
  ["edges without a position write nothing", { top: { step: 4 }, left: { step: 4 } }, component, []],
  [
    "an absolute layout",
    { position: "absolute" },
    layout,
    [
      ["display", "flex", "display"],
      ["position", "absolute", "position"],
      ["flex-direction", "column", "flexDirection"]
    ]
  ],
  [
    "a layout a child is placed in",
    {},
    { kind: "layout", anchors: true },
    [
      ["display", "flex", "display"],
      ["position", "relative", "position"],
      ["flex-direction", "column", "flexDirection"]
    ]
  ],
  [
    "an absolute layout a child is placed in",
    { position: "absolute" },
    { kind: "layout", anchors: true },
    [
      ["display", "flex", "display"],
      ["position", "absolute", "position"],
      ["flex-direction", "column", "flexDirection"]
    ]
  ],
  ["zIndex as a number", { zIndex: { step: -1 } }, component, [["z-index", "-1", "zIndex"]]],
  ["zIndex as a token", { zIndex: { token: "z-modal" } }, component, [["z-index", "var(--z-modal)", "zIndex"]]],

  [
    "fills, one color",
    { fills: [{ type: "solid", color: { token: "primary" } }] },
    component,
    [["background-color", "var(--primary)", "fills"]]
  ],
  ["fills, a color that is off", { fills: [{ type: "solid", color: { token: "primary" }, off: true }] }, component, []],
  [
    "a stack of paints, the bottom color under the image layers",
    {
      fills: [
        { type: "image", src: "/t.png", fit: "fill" },
        { type: "gradient", token: "gradient-brand" },
        { type: "solid", color: { token: "muted", alpha: { step: 50 } } }
      ]
    },
    component,
    [
      ["background-color", "color-mix(in oklab, var(--muted) 50%, transparent)", "fills"],
      ["background-image", 'url("/t.png"), var(--gradient-brand)', "fills"],
      ["background-size", "cover, auto", "fills"],
      ["background-position", "50% 50%, 0% 0%", "fills"],
      ["background-repeat", "no-repeat, repeat", "fills"]
    ]
  ],
  [
    "borderColor alone is a 1px solid border",
    { borderColor: { token: "input" } },
    component,
    [
      ["border-width", "1px", "borderWidth"],
      ["border-style", "solid", "borderStyle"],
      ["border-color", "var(--input)", "borderColor"]
    ]
  ],
  [
    "borderWidth alone takes the project's border color",
    { borderWidth: { step: 2 }, borderStyle: "dashed" },
    component,
    [
      ["border-width", "2px", "borderWidth"],
      ["border-style", "dashed", "borderStyle"],
      ["border-color", "var(--border, currentColor)", "borderColor"]
    ]
  ],
  [
    "borderColor as a value",
    { borderColor: { value: "#2563eb" }, borderWidth: { step: 1 } },
    component,
    [
      ["border-width", "1px", "borderWidth"],
      ["border-style", "solid", "borderStyle"],
      ["border-color", "#2563eb", "borderColor"]
    ]
  ],
  ["borderStyle alone writes nothing", { borderStyle: "dotted" }, component, []],
  [
    "borderRadius as a token",
    { borderRadius: { token: "radius-md" } },
    component,
    [["border-radius", "var(--radius-md)", "borderRadius"]]
  ],
  [
    "borderRadius as radius-full, which the framework writes as a keyword",
    { borderRadius: { token: "radius-full" } },
    component,
    [["border-radius", "var(--radius-full, calc(infinity * 1px))", "borderRadius"]]
  ],
  [
    "borderRadius as a value",
    { borderRadius: { value: "6px" } },
    component,
    [["border-radius", "6px", "borderRadius"]]
  ],
  [
    "borderRadius as an expression",
    { borderRadius: { expr: "calc(var(--radius) - 2px)" } },
    component,
    [["border-radius", "calc(var(--radius) - 2px)", "borderRadius"]]
  ],
  [
    "boxShadow",
    { boxShadow: [{ type: "drop", token: "shadow-md" }] },
    component,
    [["box-shadow", "var(--shadow-md)", "boxShadow"]]
  ],
  [
    "a stack of shadows, top first, without the ones that are off",
    {
      boxShadow: [
        { type: "drop", token: "shadow-md" },
        { type: "inner", x: 0, y: 1, blur: 2, spread: 0, color: { token: "foreground", alpha: { step: 10 } } },
        { type: "ring", width: 1, color: { token: "ring" }, off: true }
      ]
    },
    component,
    [
      [
        "box-shadow",
        "var(--shadow-md), inset 0 1px 2px 0 color-mix(in oklab, var(--foreground) 10%, transparent)",
        "boxShadow"
      ]
    ]
  ],
  [
    "filters, and those on what's behind",
    {
      filter: [
        { type: "blur", value: { token: "blur-sm" } },
        { type: "adjust", values: { brightness: 25 } }
      ],
      backdropFilter: [{ type: "blur", value: { token: "blur-md" } }]
    },
    component,
    [
      ["filter", "blur(var(--blur-sm)) brightness(125%)", "filter"],
      ["backdrop-filter", "blur(var(--blur-md))", "backdropFilter"]
    ]
  ],
  [
    "a blur as a value",
    { filter: [{ type: "blur", value: { value: "4px" } }] },
    component,
    [["filter", "blur(4px)", "filter"]]
  ],
  [
    "a transform, each part its own property",
    {
      translate: { x: { step: 2 }, y: { value: "-50%" } },
      rotate: 45,
      scale: { x: -100 },
      transform: [{ type: "skewX", value: 10 }],
      transformOrigin: { x: 50, y: 0 }
    },
    component,
    [
      ["translate", "calc(var(--spacing) * 2) -50%", "translate"],
      ["rotate", "45deg", "rotate"],
      ["scale", "-1 1", "scale"],
      ["transform", "skewX(10deg)", "transform"],
      ["transform-origin", "50% 0%", "transformOrigin"]
    ]
  ],
  [
    "translate one way moves none the other",
    { translate: { y: { step: 4 } } },
    component,
    [["translate", "0 calc(var(--spacing) * 4)", "translate"]]
  ],
  [
    "transform without an entry that is off",
    {
      transform: [
        { type: "skewX", value: 10, off: true },
        { type: "skewY", value: 5 }
      ]
    },
    component,
    [["transform", "skewY(5deg)", "transform"]]
  ],
  [
    "transform with every entry off writes nothing",
    { transform: [{ type: "skewX", value: 10, off: true }] },
    component,
    []
  ],
  ["opacity", { opacity: { step: 50 } }, component, [["opacity", "0.5", "opacity"]]],
  ["opacity of none", { opacity: { step: 0 } }, component, [["opacity", "0", "opacity"]]],
  ["opacity as a number to 1", { opacity: { value: 0.473 } }, component, [["opacity", "0.473", "opacity"]]],
  [
    "opacity as a token",
    { opacity: { token: "opacity-muted" } },
    component,
    [["opacity", "var(--opacity-muted)", "opacity"]]
  ],
  ["overflow", { overflow: "hidden" }, component, [["overflow", "hidden", "overflow"]]],
  ["overflow: auto scrolls only when it needs to", { overflow: "auto" }, component, [["overflow", "auto", "overflow"]]],

  ["color", { color: { token: "muted-foreground" } }, component, [["color", "var(--muted-foreground)", "color"]]],
  ["color as a value", { color: { value: "#2563eb" } }, component, [["color", "#2563eb", "color"]]],
  [
    "color with an alpha in percent",
    { color: { token: "primary", alpha: { step: 50 } } },
    component,
    [["color", "color-mix(in oklab, var(--primary) 50%, transparent)", "color"]]
  ],
  [
    "color with an alpha from 0 to 1",
    { color: { value: "#2563eb", alpha: { value: 0.25 } } },
    component,
    [["color", "color-mix(in oklab, #2563eb 25%, transparent)", "color"]]
  ],
  [
    "color with an alpha token",
    { color: { token: "primary", alpha: { token: "opacity-muted" } } },
    component,
    [["color", "color-mix(in oklab, var(--primary) var(--opacity-muted), transparent)", "color"]]
  ],
  [
    "color with an alpha of 100% is the color",
    { color: { token: "primary", alpha: { step: 100 } } },
    component,
    [["color", "var(--primary)", "color"]]
  ],
  ["color as a keyword", { color: { keyword: "currentColor" } }, component, [["color", "currentColor", "color"]]],
  [
    "color as an expression",
    { color: { expr: "light-dark(#111, #eee)" } },
    component,
    [["color", "light-dark(#111, #eee)", "color"]]
  ],
  [
    "fontFamily",
    { fontFamily: { token: "font-sans" } },
    component,
    [["font-family", "var(--font-sans)", "fontFamily"]]
  ],
  [
    "fontSize as a token brings its line height",
    { fontSize: { token: "text-lg" } },
    component,
    [
      ["font-size", "var(--text-lg)", "fontSize"],
      ["line-height", "var(--text-lg--line-height, 1.5)", "fontSize"]
    ]
  ],
  [
    "fontSize as a value brings no line height",
    { fontSize: { value: "18px" } },
    component,
    [["font-size", "18px", "fontSize"]]
  ],
  [
    "lineHeight in steps",
    { lineHeight: { step: 6 } },
    component,
    [["line-height", "calc(var(--spacing) * 6)", "lineHeight"]]
  ],
  ["lineHeight as a value", { lineHeight: { value: "1.5" } }, component, [["line-height", "1.5", "lineHeight"]]],
  [
    "lineHeight over the fontSize's line height",
    { fontSize: { token: "text-lg" }, lineHeight: { token: "leading-tight" } },
    component,
    [
      ["font-size", "var(--text-lg)", "fontSize"],
      ["line-height", "var(--leading-tight)", "lineHeight"]
    ]
  ],
  ["fontWeight", { fontWeight: { value: 600 } }, component, [["font-weight", "600", "fontWeight"]]],
  [
    "fontWeight as a token",
    { fontWeight: { token: "font-weight-medium" } },
    component,
    [["font-weight", "var(--font-weight-medium)", "fontWeight"]]
  ],
  ["fontWeight as a keyword", { fontWeight: { keyword: "bold" } }, component, [["font-weight", "bold", "fontWeight"]]],
  [
    "borderWidth as a token",
    { borderWidth: { token: "border-width-hairline" } },
    component,
    [
      ["border-width", "var(--border-width-hairline)", "borderWidth"],
      ["border-style", "solid", "borderStyle"],
      ["border-color", "var(--border, currentColor)", "borderColor"]
    ]
  ],
  [
    "letterSpacing",
    { letterSpacing: { token: "tracking-wide" } },
    component,
    [["letter-spacing", "var(--tracking-wide)", "letterSpacing"]]
  ],
  ["textAlign", { textAlign: "center" }, component, [["text-align", "center", "textAlign"]]],
  ["textTransform", { textTransform: "uppercase" }, component, [["text-transform", "uppercase", "textTransform"]]],
  [
    "textDecorationLine",
    { textDecorationLine: "line-through" },
    component,
    [["text-decoration-line", "line-through", "textDecorationLine"]]
  ],
  ["fontStyle", { fontStyle: "italic" }, component, [["font-style", "italic", "fontStyle"]]],
  ["overflowWrap", { overflowWrap: "anywhere" }, component, [["overflow-wrap", "anywhere", "overflowWrap"]]],
  ["what's switched off writes nothing", { fontStyle: "normal", flexWrap: "nowrap", grow: false }, layout, flexBox],

  [
    "hugging text is as wide as its line",
    { width: { size: "hug" } },
    text,
    [
      ["margin", "0", "margin"],
      ["width", "max-content", "width"]
    ]
  ],
  [
    "one line",
    { lineClamp: 1 },
    text,
    [
      ["margin", "0", "margin"],
      ["overflow", "hidden", "lineClamp"],
      ["text-overflow", "ellipsis", "lineClamp"],
      ["white-space", "nowrap", "lineClamp"]
    ]
  ],
  [
    "several lines",
    { lineClamp: 3 },
    text,
    [
      ["margin", "0", "margin"],
      ["display", "-webkit-box", "lineClamp"],
      ["-webkit-box-orient", "vertical", "lineClamp"],
      ["-webkit-line-clamp", "3", "lineClamp"],
      ["overflow", "hidden", "lineClamp"]
    ]
  ],
  [
    "inline text given a maximum width draws as a block",
    { maxWidth: { step: 40 }, lineClamp: 1 },
    inlineText,
    [
      ["margin", "0", "margin"],
      ["max-width", "calc(var(--spacing) * 40)", "maxWidth"],
      ["display", "block", "maxWidth"],
      ["overflow", "hidden", "lineClamp"],
      ["text-overflow", "ellipsis", "lineClamp"],
      ["white-space", "nowrap", "lineClamp"]
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
    { lineClamp: 2 },
    inlineText,
    [
      ["margin", "0", "margin"],
      ["display", "-webkit-box", "lineClamp"],
      ["-webkit-box-orient", "vertical", "lineClamp"],
      ["-webkit-line-clamp", "2", "lineClamp"],
      ["overflow", "hidden", "lineClamp"]
    ]
  ],
  [
    "inline text with nothing that needs a box stays inline",
    { fontWeight: { value: 600 } },
    inlineText,
    [
      ["margin", "0", "margin"],
      ["font-weight", "600", "fontWeight"]
    ]
  ],
  ["lineClamp on anything but text writes nothing", { lineClamp: 2 }, component, []],
  [
    "transition, leaving out one that is off",
    {
      transition: [
        { property: "opacity", duration: { step: 200 }, easing: { keyword: "linear" } },
        { property: "width", off: true }
      ]
    },
    component,
    [["transition", "opacity 200ms linear", "transition"]]
  ],
  [
    "css, drawn after the keys, without what is off",
    {
      opacity: { step: 50 },
      css: {
        "scroll-snap-type": { value: "x mandatory" },
        "mix-blend-mode": { value: "multiply", off: true },
        "--accent": { value: "#2563eb" }
      }
    },
    layout,
    [
      ["display", "flex", "display"],
      ["opacity", "0.5", "opacity"],
      ["flex-direction", "column", "flexDirection"],
      ["scroll-snap-type", "x mandatory", "css"],
      ["--accent", "#2563eb", "css"]
    ]
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

  it("writes only properties the key owns, or sets for the key that does, and from css only what no key owns", () => {
    const strays = cases.flatMap(([, style, context]) =>
      declarations(style, context).flatMap(({ property, from }) => {
        const own =
          from === "css"
            ? ownerOf(property) === undefined
            : owned[from].includes(property) || setsForOthers[from]?.includes(property)

        return own ? [] : [`${from} writes ${property}`]
      })
    )

    expect(strays).toEqual([])
  })

  it("draws an image, a video and an instance as it draws a component", () => {
    const style: NodeStyle = {
      width: { size: "fill" },
      fills: [{ type: "solid", color: { token: "muted" } }],
      borderRadius: { token: "radius-md" },
      opacity: { step: 80 }
    }

    const expected = declarations(style, inRow)

    for (const kind of ["image", "video", "instance"] as const) {
      expect(declarations(style, { kind, parent: "row" })).toEqual(expected)
    }
  })

  it("writes each property once", () => {
    const style: NodeStyle = {
      grow: true,
      width: { size: "fill" },
      minWidth: { step: 4 },
      fontSize: { token: "text-sm" },
      lineHeight: { token: "leading-6" },
      lineClamp: 2
    }

    const properties = declarations(style, { kind: "text", parent: "row" }).map(({ property }) => property)

    expect(properties).toEqual([...new Set(properties)])
  })

  it("keeps a property where it was first written when a later key changes it", () => {
    const under: Declaration[] = declarations({ fontSize: { token: "text-sm" }, fontWeight: { value: 500 } }, component)

    const over: Declaration[] = declarations(
      { fontSize: { token: "text-sm" }, fontWeight: { value: 500 }, lineHeight: { token: "leading-6" } },
      component
    )

    expect(over.map(({ property }) => property)).toEqual(under.map(({ property }) => property))
  })
})
