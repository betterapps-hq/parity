import type { Placement } from "./ledger.ts"

// Where each CSS property goes in the Design tab: its section, the concept it's part of, whether it has a control, and
// the kinds of token it takes. docs/proposals/design-options-css.md describes the placing; this is the placing itself.
// ledger.test.ts fails when a property Chromium draws (spec.json) isn't here exactly once.

export const placements: readonly Placement[] = [
  {
    section: "position",
    concept: "Placement",
    where: "control",
    tokens: [],
    properties: ["position"]
  },
  {
    section: "position",
    concept: "Insets",
    where: "control",
    tokens: ["spacing"],
    properties: [
      "top",
      "right",
      "bottom",
      "left",
      "inset",
      "inset-block",
      "inset-block-start",
      "inset-block-end",
      "inset-inline",
      "inset-inline-start",
      "inset-inline-end"
    ]
  },
  {
    section: "position",
    concept: "Layer order",
    where: "control",
    tokens: ["z-index"],
    properties: ["z-index"]
  },
  {
    section: "position",
    concept: "Rotation",
    where: "control",
    tokens: [],
    properties: ["rotate"]
  },
  {
    section: "position",
    concept: "Anchor",
    where: "more",
    tokens: [],
    properties: [
      "anchor-name",
      "anchor-scope",
      "position-anchor",
      "position-area",
      "position-try",
      "position-try-fallbacks",
      "position-try-order",
      "position-visibility"
    ]
  },
  {
    section: "position",
    concept: "Float",
    where: "more",
    tokens: [],
    properties: ["float", "clear"]
  },
  {
    section: "position",
    concept: "Text wrap around a float",
    where: "css",
    tokens: [],
    properties: ["shape-outside", "shape-margin", "shape-image-threshold"]
  },
  {
    section: "position",
    concept: "Top layer",
    where: "left-out",
    tokens: [],
    properties: ["overlay"]
  },
  {
    section: "size",
    concept: "Width and height",
    where: "control",
    tokens: ["spacing", "container"],
    properties: ["width", "height", "inline-size", "block-size"]
  },
  {
    section: "size",
    concept: "Grow and shrink",
    where: "control",
    tokens: ["number"],
    properties: ["flex", "flex-grow", "flex-shrink"]
  },
  {
    section: "size",
    concept: "Grow and shrink",
    where: "control",
    tokens: ["spacing", "container"],
    properties: ["flex-basis"]
  },
  {
    section: "size",
    concept: "Min and max",
    where: "control",
    tokens: ["spacing", "container"],
    properties: [
      "min-width",
      "max-width",
      "min-height",
      "max-height",
      "min-inline-size",
      "max-inline-size",
      "min-block-size",
      "max-block-size"
    ]
  },
  {
    section: "size",
    concept: "Aspect ratio",
    where: "control",
    tokens: ["aspect"],
    properties: ["aspect-ratio"]
  },
  {
    section: "size",
    concept: "Align self",
    where: "control",
    tokens: [],
    properties: ["align-self", "justify-self", "place-self"]
  },
  {
    section: "size",
    concept: "Grid placement",
    where: "control",
    tokens: [],
    properties: [
      "grid-area",
      "grid-column",
      "grid-row",
      "grid-column-start",
      "grid-column-end",
      "grid-row-start",
      "grid-row-end"
    ]
  },
  {
    section: "size",
    concept: "Order",
    where: "more",
    tokens: ["number"],
    properties: ["order"]
  },
  {
    section: "size",
    concept: "Box sizing",
    where: "more",
    tokens: [],
    properties: ["box-sizing"]
  },
  {
    section: "size",
    concept: "Fields grow with their text",
    where: "more",
    tokens: [],
    properties: ["field-sizing"]
  },
  {
    section: "size",
    concept: "Intrinsic size placeholders",
    where: "css",
    tokens: [],
    properties: [
      "contain-intrinsic-size",
      "contain-intrinsic-width",
      "contain-intrinsic-height",
      "contain-intrinsic-inline-size",
      "contain-intrinsic-block-size"
    ]
  },
  {
    section: "size",
    concept: "Zoom",
    where: "css",
    tokens: [],
    properties: ["zoom"]
  },
  {
    section: "size",
    concept: "Frame sizing",
    where: "css",
    tokens: [],
    properties: ["frame-sizing"]
  },
  {
    section: "layout",
    concept: "Layout type",
    where: "control",
    tokens: [],
    properties: ["display"]
  },
  {
    section: "layout",
    concept: "Direction and wrap",
    where: "control",
    tokens: [],
    properties: ["flex-direction", "flex-wrap", "flex-flow"]
  },
  {
    section: "layout",
    concept: "Alignment",
    where: "control",
    tokens: [],
    properties: ["align-items", "justify-content", "align-content", "place-content", "place-items", "justify-items"]
  },
  {
    section: "layout",
    concept: "Which baseline an inline-block exports",
    where: "css",
    tokens: [],
    properties: ["baseline-source"]
  },
  {
    section: "layout",
    concept: "Gap",
    where: "control",
    tokens: ["spacing"],
    properties: ["gap", "row-gap", "column-gap"]
  },
  {
    section: "layout",
    concept: "Grid tracks",
    where: "control",
    tokens: ["spacing", "container", "number"],
    properties: ["grid-template-columns", "grid-template-rows", "grid-template", "grid"]
  },
  {
    section: "layout",
    concept: "Grid areas",
    where: "more",
    tokens: [],
    properties: ["grid-template-areas"]
  },
  {
    section: "layout",
    concept: "Grid flow and implicit tracks",
    where: "more",
    tokens: [],
    properties: ["grid-auto-flow", "grid-auto-columns", "grid-auto-rows"]
  },
  {
    section: "layout",
    concept: "Dividers between items",
    where: "more",
    tokens: ["color", "border-width", "border"],
    properties: [
      "rule",
      "rule-break",
      "rule-color",
      "rule-inset",
      "rule-inset-cap",
      "rule-inset-end",
      "rule-inset-junction",
      "rule-inset-start",
      "rule-overlap",
      "rule-style",
      "rule-visibility-items",
      "rule-width",
      "row-rule",
      "row-rule-break",
      "row-rule-color",
      "row-rule-inset",
      "row-rule-inset-cap",
      "row-rule-inset-cap-end",
      "row-rule-inset-cap-start",
      "row-rule-inset-end",
      "row-rule-inset-junction",
      "row-rule-inset-junction-end",
      "row-rule-inset-junction-start",
      "row-rule-inset-start",
      "row-rule-style",
      "row-rule-visibility-items",
      "row-rule-width",
      "column-rule-break",
      "column-rule-color",
      "column-rule-inset",
      "column-rule-inset-cap",
      "column-rule-inset-cap-end",
      "column-rule-inset-cap-start",
      "column-rule-inset-end",
      "column-rule-inset-junction",
      "column-rule-inset-junction-end",
      "column-rule-inset-junction-start",
      "column-rule-inset-start",
      "column-rule-style",
      "column-rule-visibility-items",
      "column-rule-width",
      "column-rule"
    ]
  },
  {
    section: "layout",
    concept: "Text columns",
    where: "more",
    tokens: ["spacing", "container", "number"],
    properties: [
      "columns",
      "column-count",
      "column-width",
      "column-fill",
      "column-span",
      "column-height",
      "column-wrap"
    ]
  },
  {
    section: "layout",
    concept: "Size container",
    where: "more",
    tokens: ["container"],
    properties: ["container", "container-name", "container-type"]
  },
  {
    section: "layout",
    concept: "Reading order",
    where: "css",
    tokens: [],
    properties: ["reading-flow", "reading-order"]
  },
  {
    section: "layout",
    concept: "Trimming children's margins",
    where: "css",
    tokens: [],
    properties: ["margin-trim"]
  },
  {
    section: "layout",
    concept: "Flex line count",
    where: "css",
    tokens: [],
    properties: ["flex-line-count"]
  },
  {
    section: "spacing",
    concept: "Padding",
    where: "control",
    tokens: ["spacing"],
    properties: [
      "padding",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "padding-block",
      "padding-block-start",
      "padding-block-end",
      "padding-inline",
      "padding-inline-start",
      "padding-inline-end"
    ]
  },
  {
    section: "spacing",
    concept: "Margin",
    where: "control",
    tokens: ["spacing"],
    properties: [
      "margin",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "margin-block",
      "margin-block-start",
      "margin-block-end",
      "margin-inline",
      "margin-inline-start",
      "margin-inline-end"
    ]
  },
  {
    section: "appearance",
    concept: "Opacity",
    where: "control",
    tokens: ["opacity"],
    properties: ["opacity"]
  },
  {
    section: "appearance",
    concept: "Blend mode",
    where: "control",
    tokens: [],
    properties: ["mix-blend-mode"]
  },
  {
    section: "appearance",
    concept: "Visibility",
    where: "control",
    tokens: [],
    properties: ["visibility"]
  },
  {
    section: "appearance",
    concept: "Radius",
    where: "control",
    tokens: ["radius"],
    properties: [
      "border-radius",
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-right-radius",
      "border-bottom-left-radius",
      "border-start-start-radius",
      "border-start-end-radius",
      "border-end-start-radius",
      "border-end-end-radius"
    ]
  },
  {
    section: "appearance",
    concept: "Corner shape",
    where: "control",
    tokens: [],
    properties: [
      "corner-shape",
      "corner-block-end-shape",
      "corner-block-start-shape",
      "corner-bottom-left-shape",
      "corner-bottom-right-shape",
      "corner-bottom-shape",
      "corner-end-end-shape",
      "corner-end-start-shape",
      "corner-inline-end-shape",
      "corner-inline-start-shape",
      "corner-left-shape",
      "corner-right-shape",
      "corner-start-end-shape",
      "corner-start-start-shape",
      "corner-top-left-shape",
      "corner-top-right-shape",
      "corner-top-shape"
    ]
  },
  {
    section: "appearance",
    concept: "Clip content",
    where: "control",
    tokens: [],
    properties: ["overflow", "overflow-x", "overflow-y", "overflow-block", "overflow-inline", "overflow-clip-margin"]
  },
  {
    section: "appearance",
    concept: "Isolation",
    where: "more",
    tokens: [],
    properties: ["isolation"]
  },
  {
    section: "appearance",
    concept: "Clip path",
    where: "more",
    tokens: [],
    properties: ["clip-path", "clip-rule"]
  },
  {
    section: "appearance",
    concept: "Mask",
    where: "more",
    tokens: ["gradient"],
    properties: [
      "mask",
      "mask-image",
      "mask-mode",
      "mask-repeat",
      "mask-position",
      "mask-clip",
      "mask-origin",
      "mask-size",
      "mask-composite",
      "mask-type"
    ]
  },
  {
    section: "appearance",
    concept: "Mask border",
    where: "css",
    tokens: [],
    properties: [
      "mask-border",
      "mask-border-outset",
      "mask-border-repeat",
      "mask-border-slice",
      "mask-border-source",
      "mask-border-width"
    ]
  },
  {
    section: "appearance",
    concept: "Color scheme",
    where: "more",
    tokens: [],
    properties: ["color-scheme"]
  },
  {
    section: "appearance",
    concept: "Border shape",
    where: "css",
    tokens: [],
    properties: ["border-shape"]
  },
  {
    section: "appearance",
    concept: "Forced colors and print",
    where: "css",
    tokens: [],
    properties: ["forced-color-adjust", "print-color-adjust"]
  },
  {
    section: "appearance",
    concept: "HDR limit",
    where: "css",
    tokens: [],
    properties: ["dynamic-range-limit"]
  },
  {
    section: "text",
    concept: "Font shorthand",
    where: "css",
    tokens: ["type-style"],
    properties: ["font"]
  },
  {
    section: "text",
    concept: "Font",
    where: "control",
    tokens: ["font"],
    properties: ["font-family"]
  },
  {
    section: "text",
    concept: "Weight and style",
    where: "control",
    tokens: ["font-weight"],
    properties: ["font-weight", "font-style"]
  },
  {
    section: "text",
    concept: "Size",
    where: "control",
    tokens: ["font-size"],
    properties: ["font-size"]
  },
  {
    section: "text",
    concept: "Line height",
    where: "control",
    tokens: ["leading", "spacing"],
    properties: ["line-height"]
  },
  {
    section: "text",
    concept: "Letter spacing",
    where: "control",
    tokens: ["tracking"],
    properties: ["letter-spacing"]
  },
  {
    section: "text",
    concept: "Color",
    where: "control",
    tokens: ["color"],
    properties: ["color"]
  },
  {
    section: "text",
    concept: "Align",
    where: "control",
    tokens: [],
    properties: ["text-align"]
  },
  {
    section: "text",
    concept: "Justification",
    where: "more",
    tokens: [],
    properties: ["text-align-last", "text-justify"]
  },
  {
    section: "text",
    concept: "Vertical trim",
    where: "more",
    tokens: [],
    properties: ["text-box", "text-box-trim", "text-box-edge"]
  },
  {
    section: "text",
    concept: "Decoration",
    where: "control",
    tokens: ["color", "border-width"],
    properties: [
      "text-decoration",
      "text-decoration-line",
      "text-decoration-style",
      "text-decoration-color",
      "text-decoration-thickness",
      "text-decoration-skip-ink",
      "text-decoration-skip-spaces",
      "text-decoration-inset",
      "text-underline-offset",
      "text-underline-position"
    ]
  },
  {
    section: "text",
    concept: "Case",
    where: "control",
    tokens: [],
    properties: ["text-transform", "font-variant-caps"]
  },
  {
    section: "text",
    concept: "Wrap and truncate",
    where: "control",
    tokens: ["number"],
    properties: [
      "text-wrap",
      "text-wrap-mode",
      "text-wrap-style",
      "white-space",
      "white-space-collapse",
      "text-overflow",
      "line-clamp",
      "-webkit-line-clamp",
      "-webkit-box-orient"
    ]
  },
  {
    section: "text",
    concept: "Outlined text",
    where: "more",
    tokens: ["color", "border-width"],
    properties: ["-webkit-text-stroke", "-webkit-text-stroke-width", "-webkit-text-stroke-color"]
  },
  {
    section: "text",
    concept: "Text fill and smoothing",
    where: "css",
    tokens: [],
    properties: ["-webkit-text-fill-color", "-webkit-font-smoothing"]
  },
  {
    section: "text",
    concept: "Word spacing and indent",
    where: "more",
    tokens: ["tracking", "spacing"],
    properties: ["word-spacing", "text-indent", "tab-size"]
  },
  {
    section: "text",
    concept: "Breaking and hyphens",
    where: "more",
    tokens: [],
    properties: ["word-break", "overflow-wrap", "line-break", "hyphens", "hyphenate-character", "hyphenate-limit-chars"]
  },
  {
    section: "text",
    concept: "OpenType and variable axes",
    where: "more",
    tokens: [],
    properties: [
      "font-stretch",
      "font-synthesis",
      "font-synthesis-weight",
      "font-synthesis-style",
      "font-synthesis-small-caps",
      "font-variant",
      "font-variant-numeric",
      "font-variant-ligatures",
      "font-variant-alternates",
      "font-variant-position",
      "font-variant-east-asian",
      "font-variant-emoji",
      "font-feature-settings",
      "font-variation-settings",
      "font-kerning",
      "font-optical-sizing",
      "font-palette",
      "font-size-adjust",
      "font-language-override"
    ]
  },
  {
    section: "text",
    concept: "Direction and writing mode",
    where: "more",
    tokens: [],
    properties: ["direction", "unicode-bidi", "writing-mode", "text-orientation", "text-combine-upright"]
  },
  {
    section: "text",
    concept: "Outline order",
    where: "more",
    tokens: [],
    properties: ["paint-order"]
  },
  {
    section: "text",
    concept: "Inline alignment",
    where: "css",
    tokens: [],
    properties: ["vertical-align"]
  },
  {
    section: "text",
    concept: "List markers",
    where: "css",
    tokens: [],
    properties: ["list-style", "list-style-type", "list-style-position", "list-style-image"]
  },
  {
    section: "text",
    concept: "Drop cap",
    where: "css",
    tokens: [],
    properties: ["initial-letter"]
  },
  {
    section: "text",
    concept: "Emphasis marks and ruby",
    where: "css",
    tokens: [],
    properties: [
      "text-emphasis",
      "text-emphasis-color",
      "text-emphasis-position",
      "text-emphasis-style",
      "ruby-align",
      "ruby-overhang",
      "ruby-position"
    ]
  },
  {
    section: "text",
    concept: "East Asian spacing",
    where: "css",
    tokens: [],
    properties: ["text-autospace", "text-spacing-trim"]
  },
  {
    section: "text",
    concept: "Rendering hints",
    where: "css",
    tokens: [],
    properties: ["text-rendering", "text-size-adjust"]
  },
  {
    section: "text",
    concept: "Fit text to its box",
    where: "css",
    tokens: [],
    properties: ["text-fit"]
  },
  {
    section: "text",
    concept: "Generated content",
    where: "css",
    tokens: [],
    properties: ["content", "quotes", "counter-reset", "counter-increment", "counter-set"]
  },
  {
    section: "image",
    concept: "Fit and position",
    where: "control",
    tokens: [],
    properties: ["object-fit", "object-position"]
  },
  {
    section: "image",
    concept: "Crop",
    where: "more",
    tokens: [],
    properties: ["object-view-box"]
  },
  {
    section: "image",
    concept: "Rendering",
    where: "more",
    tokens: [],
    properties: ["image-rendering", "image-orientation"]
  },
  {
    section: "icon",
    concept: "Stroke width",
    where: "control",
    tokens: ["border-width"],
    properties: ["stroke-width"]
  },
  {
    section: "icon",
    concept: "SVG paint",
    where: "more",
    tokens: ["color"],
    properties: ["fill", "fill-opacity", "stroke", "stroke-opacity"]
  },
  {
    section: "icon",
    concept: "SVG strokes and geometry",
    where: "left-out",
    tokens: [],
    properties: [
      "fill-rule",
      "stroke-dasharray",
      "stroke-dashoffset",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-miterlimit",
      "vector-effect",
      "marker",
      "marker-start",
      "marker-mid",
      "marker-end",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "x",
      "y",
      "d",
      "shape-rendering",
      "text-anchor",
      "dominant-baseline",
      "alignment-baseline",
      "baseline-shift",
      "stop-color",
      "stop-opacity",
      "color-interpolation",
      "color-interpolation-filters",
      "flood-color",
      "flood-opacity",
      "lighting-color"
    ]
  },
  {
    section: "fill",
    concept: "Fills",
    where: "control",
    tokens: ["color", "gradient"],
    properties: ["background", "background-color", "background-image"]
  },
  {
    section: "fill",
    concept: "Each fill's size, position, tiling and clip",
    where: "control",
    tokens: [],
    properties: [
      "background-size",
      "background-position",
      "background-position-x",
      "background-position-y",
      "background-repeat",
      "background-repeat-x",
      "background-repeat-y",
      "background-origin",
      "background-clip",
      "background-blend-mode"
    ]
  },
  {
    section: "fill",
    concept: "Fixed",
    where: "more",
    tokens: [],
    properties: ["background-attachment"]
  },
  {
    section: "stroke",
    concept: "Border",
    where: "control",
    tokens: ["color", "border-width", "border", "stroke-style"],
    properties: [
      "border",
      "border-block",
      "border-block-color",
      "border-block-end",
      "border-block-end-color",
      "border-block-end-style",
      "border-block-end-width",
      "border-block-start",
      "border-block-start-color",
      "border-block-start-style",
      "border-block-start-width",
      "border-block-style",
      "border-block-width",
      "border-bottom",
      "border-bottom-color",
      "border-bottom-style",
      "border-bottom-width",
      "border-color",
      "border-inline",
      "border-inline-color",
      "border-inline-end",
      "border-inline-end-color",
      "border-inline-end-style",
      "border-inline-end-width",
      "border-inline-start",
      "border-inline-start-color",
      "border-inline-start-style",
      "border-inline-start-width",
      "border-inline-style",
      "border-inline-width",
      "border-left",
      "border-left-color",
      "border-left-style",
      "border-left-width",
      "border-right",
      "border-right-color",
      "border-right-style",
      "border-right-width",
      "border-style",
      "border-top",
      "border-top-color",
      "border-top-style",
      "border-top-width",
      "border-width"
    ]
  },
  {
    section: "stroke",
    concept: "Outline",
    where: "control",
    tokens: ["color", "border-width"],
    properties: ["outline", "outline-color", "outline-style", "outline-width", "outline-offset"]
  },
  {
    section: "stroke",
    concept: "Border image",
    where: "css",
    tokens: [],
    properties: [
      "border-image",
      "border-image-outset",
      "border-image-repeat",
      "border-image-slice",
      "border-image-source",
      "border-image-width"
    ]
  },
  {
    section: "stroke",
    concept: "Box decoration break",
    where: "css",
    tokens: [],
    properties: ["box-decoration-break"]
  },
  {
    section: "stroke",
    concept: "Table borders",
    where: "css",
    tokens: [],
    properties: ["border-collapse", "border-spacing", "caption-side", "empty-cells", "table-layout"]
  },
  {
    section: "effects",
    concept: "Shadows",
    where: "control",
    tokens: ["shadow", "inset-shadow", "color", "border-width"],
    properties: ["box-shadow"]
  },
  {
    section: "effects",
    concept: "Text shadow",
    where: "control",
    tokens: ["text-shadow", "color"],
    properties: ["text-shadow"]
  },
  {
    section: "effects",
    concept: "Layer blur and adjustments",
    where: "control",
    tokens: ["blur", "drop-shadow", "color"],
    properties: ["filter"]
  },
  {
    section: "effects",
    concept: "Background blur and adjustments",
    where: "control",
    tokens: ["backdrop-blur", "blur"],
    properties: ["backdrop-filter"]
  },
  {
    section: "transform",
    concept: "Move and scale",
    where: "control",
    tokens: ["spacing"],
    properties: ["translate", "scale"]
  },
  {
    section: "transform",
    concept: "Origin",
    where: "control",
    tokens: [],
    properties: ["transform-origin"]
  },
  {
    section: "transform",
    concept: "Origin box",
    where: "more",
    tokens: [],
    properties: ["transform-box"]
  },
  {
    section: "transform",
    concept: "Transform list",
    where: "more",
    tokens: [],
    properties: ["transform"]
  },
  {
    section: "transform",
    concept: "3D",
    where: "more",
    tokens: ["perspective"],
    properties: ["perspective", "perspective-origin", "transform-style", "backface-visibility"]
  },
  {
    section: "transform",
    concept: "Motion path",
    where: "css",
    tokens: [],
    properties: ["offset", "offset-anchor", "offset-distance", "offset-path", "offset-position", "offset-rotate"]
  },
  {
    section: "interaction",
    concept: "Cursor",
    where: "control",
    tokens: ["cursor"],
    properties: ["cursor"]
  },
  {
    section: "interaction",
    concept: "Clicks pass through",
    where: "control",
    tokens: [],
    properties: ["pointer-events"]
  },
  {
    section: "interaction",
    concept: "Text selection",
    where: "more",
    tokens: [],
    properties: ["user-select"]
  },
  {
    section: "interaction",
    concept: "Form control colors",
    where: "more",
    tokens: ["color"],
    properties: ["accent-color", "caret-color"]
  },
  {
    section: "interaction",
    concept: "Caret shape",
    where: "more",
    tokens: [],
    properties: ["caret-shape", "caret-animation"]
  },
  {
    section: "interaction",
    concept: "Resize handle",
    where: "more",
    tokens: [],
    properties: ["resize"]
  },
  {
    section: "interaction",
    concept: "Native look",
    where: "more",
    tokens: [],
    properties: ["appearance"]
  },
  {
    section: "interaction",
    concept: "Scrolling",
    where: "more",
    tokens: ["color"],
    properties: [
      "scroll-behavior",
      "overscroll-behavior",
      "overscroll-behavior-x",
      "overscroll-behavior-y",
      "overscroll-behavior-block",
      "overscroll-behavior-inline",
      "scrollbar-gutter",
      "scrollbar-width",
      "scrollbar-color",
      "overflow-anchor"
    ]
  },
  {
    section: "interaction",
    concept: "Scroll snap",
    where: "more",
    tokens: ["spacing"],
    properties: [
      "scroll-snap-type",
      "scroll-snap-align",
      "scroll-snap-stop",
      "scroll-padding",
      "scroll-padding-block",
      "scroll-padding-block-end",
      "scroll-padding-block-start",
      "scroll-padding-bottom",
      "scroll-padding-inline",
      "scroll-padding-inline-end",
      "scroll-padding-inline-start",
      "scroll-padding-left",
      "scroll-padding-right",
      "scroll-padding-top",
      "scroll-margin",
      "scroll-margin-block",
      "scroll-margin-block-end",
      "scroll-margin-block-start",
      "scroll-margin-bottom",
      "scroll-margin-inline",
      "scroll-margin-inline-end",
      "scroll-margin-inline-start",
      "scroll-margin-left",
      "scroll-margin-right",
      "scroll-margin-top"
    ]
  },
  {
    section: "interaction",
    concept: "Scroll markers and targets",
    where: "css",
    tokens: [],
    properties: ["scroll-initial-target", "scroll-marker-group", "scroll-target-group", "scroll-axis-lock"]
  },
  {
    section: "interaction",
    concept: "Touch gestures",
    where: "css",
    tokens: [],
    properties: ["touch-action"]
  },
  {
    section: "interaction",
    concept: "Inert and interest",
    where: "css",
    tokens: [],
    properties: ["interactivity", "interest-delay", "interest-delay-start", "interest-delay-end"]
  },
  {
    section: "interaction",
    concept: "Window dragging",
    where: "left-out",
    tokens: [],
    properties: ["window-drag"]
  },
  {
    section: "motion",
    concept: "Transitions",
    where: "control",
    tokens: ["transition", "duration", "easing"],
    properties: [
      "transition",
      "transition-property",
      "transition-duration",
      "transition-timing-function",
      "transition-delay",
      "transition-behavior"
    ]
  },
  {
    section: "motion",
    concept: "Animation",
    where: "control",
    tokens: ["animation", "duration", "easing", "number"],
    properties: [
      "animation",
      "animation-name",
      "animation-duration",
      "animation-timing-function",
      "animation-delay",
      "animation-iteration-count",
      "animation-direction",
      "animation-fill-mode",
      "animation-play-state",
      "animation-composition"
    ]
  },
  {
    section: "motion",
    concept: "Animate to auto size",
    where: "more",
    tokens: [],
    properties: ["interpolate-size"]
  },
  {
    section: "motion",
    concept: "Play on scroll",
    where: "control",
    tokens: [],
    properties: ["animation-timeline", "animation-range", "animation-range-start", "animation-range-end"]
  },
  {
    section: "motion",
    concept: "Named timelines",
    where: "more",
    tokens: [],
    properties: [
      "scroll-timeline",
      "scroll-timeline-name",
      "scroll-timeline-axis",
      "view-timeline",
      "view-timeline-name",
      "view-timeline-axis",
      "view-timeline-inset",
      "timeline-scope"
    ]
  },
  {
    section: "motion",
    concept: "Animation triggers",
    where: "control",
    tokens: [],
    properties: [
      "animation-trigger",
      "trigger-scope",
      "timeline-trigger",
      "timeline-trigger-activation-range",
      "timeline-trigger-activation-range-end",
      "timeline-trigger-activation-range-start",
      "timeline-trigger-active-range",
      "timeline-trigger-active-range-end",
      "timeline-trigger-active-range-start",
      "timeline-trigger-name",
      "timeline-trigger-source"
    ]
  },
  {
    section: "motion",
    concept: "View transitions",
    where: "more",
    tokens: [],
    properties: ["view-transition-name", "view-transition-class", "view-transition-group", "view-transition-scope"]
  },
  {
    section: "css",
    concept: "Tokens set here, in the CSS section",
    where: "control",
    tokens: ["any"],
    properties: ["custom-property"]
  },
  {
    section: "css",
    concept: "Performance hints",
    where: "css",
    tokens: [],
    properties: ["contain", "content-visibility", "will-change"]
  },
  {
    section: "css",
    concept: "Printing and pages",
    where: "css",
    tokens: [],
    properties: ["page", "break-before", "break-after", "break-inside", "orphans", "widows"]
  },
  {
    section: "css",
    concept: "Reflection and tap highlight",
    where: "css",
    tokens: [],
    properties: ["-webkit-box-reflect", "-webkit-tap-highlight-color"]
  },
  {
    section: "left-out",
    concept: "Speech",
    where: "left-out",
    tokens: [],
    properties: ["speak"]
  },
  {
    section: "left-out",
    concept: "MathML",
    where: "left-out",
    tokens: [],
    properties: ["math-depth", "math-shift", "math-style"]
  },
  {
    section: "left-out",
    concept: "Reset everything",
    where: "left-out",
    tokens: [],
    properties: ["all"]
  },
  {
    section: "left-out",
    concept: "Electron's own title bars",
    where: "left-out",
    tokens: [],
    properties: ["-webkit-app-region"]
  }
]
