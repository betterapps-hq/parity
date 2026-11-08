import type { Example, Shot } from "./inspiration.tsx"

/*
 * How Figma, Webflow, Framer, Wix Studio, Penpot and Plasmic build each type of field, from their own help centers,
 * update pages and, for the open-source two, their code, collected 2026-11-08 for PAR-186's simpler-field spike.
 * Every screenshot is the product's own, loaded from where it publishes it and cropped to the field; Webflow's 2019
 * pictures show its older panel and say so.
 */

/** A product's own screenshot, cropped to its field (`crop` is left, top, right, bottom, as fractions). */
const pic = (src: string, size: [number, number], crop: Shot["crop"], caption: string, href: string): Shot => ({
  src,
  size,
  crop,
  caption,
  href
})

const figmaImage = (id: string) => `https://help.figma.com/hc/article_attachments/${id}`
const figma = {
  position: "https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions",
  variables: "https://help.figma.com/hc/en-us/articles/15343107263511-Apply-variables-to-designs",
  radius: "https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing",
  autoLayout: "https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma",
  fills: "https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills",
  picker: "https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker",
  styles: "https://help.figma.com/hc/en-us/articles/360040316193-Apply-styles-to-layers-and-objects",
  modes: "https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables",
  stroke: "https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties",
  effects: "https://help.figma.com/hc/en-us/articles/360041488473-Apply-effects-to-layers",
  text: "https://help.figma.com/hc/en-us/articles/360039956634-Explore-text-properties",
  textStyles: "https://help.figma.com/hc/en-us/articles/360039957034-Create-and-apply-text-styles",
  constraints: "https://help.figma.com/hc/en-us/articles/360039957734-Apply-constraints-to-define-how-layers-resize",
  sitesPosition: "https://help.figma.com/hc/en-us/articles/31242774629655-Position-elements-in-a-webpage",
  instances: "https://help.figma.com/hc/en-us/articles/360039150733-Apply-changes-to-instances",
  componentProperties: "https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties"
}
const figmaShot = (id: string, size: [number, number], crop: Shot["crop"], caption: string, href: string) =>
  pic(figmaImage(id), size, crop, caption, href)

const webflow = {
  overview: "https://help.webflow.com/hc/en-us/articles/33961362040723-Style-panel-overview",
  units: "https://help.webflow.com/hc/en-us/articles/33961290465043-Input-values-and-units",
  variables: "https://help.webflow.com/hc/en-us/articles/33961268146323-Variables",
  spacing: "https://help.webflow.com/hc/en-us/articles/33961243177875-Spacing-margin-and-padding",
  borders: "https://help.webflow.com/hc/en-us/articles/33961270594067-Advanced-borders-on-the-web",
  backgrounds: "https://help.webflow.com/hc/en-us/articles/33961278898323-Background-styles",
  effects: "https://help.webflow.com/hc/en-us/articles/33961245810451-Effects",
  typography: "https://help.webflow.com/hc/en-us/articles/33961334261779-Typography",
  position: "https://help.webflow.com/hc/en-us/articles/33961228002963-CSS-position-properties",
  flexbox: "https://help.webflow.com/hc/en-us/articles/33961260795155-Flexbox",
  layout: "https://webflow.com/updates/style-panel-layout-improvements",
  shadows: "https://webflow.com/updates/x-y-offsets-for-shadows-variable-support",
  truncate: "https://webflow.com/updates/truncate-content-text-overflow",
  panel2019: "https://webflow.com/blog/meet-the-new-style-panel"
}
const webflowFiles = "https://cdn.prod.website-files.com/687e8d1b96312cc631cafec7"
const webflowShots = {
  alignBox: "https://help.webflow.com/hc/article_attachments/42118795103379",
  wrap: "https://help.webflow.com/hc/article_attachments/42118051179411",
  layout2024: `${webflowFiles}/68c387ab2589c4e03229ec2e_65de054a8465b69c31f45c57_Thumbnail_layout-section.jpeg`,
  shadows2024: `${webflowFiles}/68c387b5c3127c39587c092b_65aaa8d6b9d852461eee82d2_SlashUpdates_1280x720.webp`,
  truncate2025: `${webflowFiles}/68c387aecc34c5aec6e68544_67e45431ca330e2f6eaf4f21_SlashUpdates_1280x720.webp`,
  units2019: `${webflowFiles}/68c49301f3746a789e97b67c_601081d73faee4671500bef4_6002086f72b7274fbf01da4b_BWmNzTw5X60GsSpbzkDPhpN0eKFJ_oHTbO3Dt7B1FAEV3Ebo8Dh6gAZqvQnVgf9_H2zTm4BGVOr84WL78UPuAz3DMBrxNJD6OUImuv_SurLRH0621OcZL6r-rnSGQ8i4v0-Lpqia.gif`,
  spacing2019: `${webflowFiles}/68c49301f3746a789e97b684_601081d633e66995b43400c2_6002086f72b727e12e01da31_PX1tR7mpCkDQ_k5fahDF4PkmPDFYN6oUdsSi9yUXtkgezVmkS_JnB3jtVVaW-_aikSqnc21iFsaGdwrqTp0qIbEVtzN99V2frtTyWEdryKi6_RkjFxeWJvCIURVBMdg4OduN5IdL.jpeg`,
  color2019: `${webflowFiles}/68c49301f3746a789e97b66c_601081d654fa61618501d1b6_6002086f72b7277a1101db53_whQROITqg1gVy-4Sb5yHPBJo2oMrELTfo2qKaI2Uk8ventFZcr8odqYW3TeYkqg-inVgC18j5rav6_VRZ5HkjkoyjLA93twGvZzpwKs0iAle_EryGV3u9zq_CvXdJ2IABDR584Zi.jpeg`
}

const framerImage = (name: string) => `https://framerusercontent.com/images/${name}`
const framer = {
  pointer: "https://www.framer.com/help/articles/disable-pointer-events/",
  rtl: "https://www.framer.com/help/articles/rtl-best-practices/",
  scrollTop: "https://www.framer.com/help/articles/how-to-add-a-scroll-to-top-button-to-your-website/",
  fetch: "https://www.framer.com/help/articles/how-to-use-fetch/",
  fonts: "https://www.framer.com/help/articles/how-to-add-custom-fonts/",
  mobileNav: "https://www.framer.com/help/articles/my-navigation-works-in-preview-mode-but-not-on-mobile/",
  effects: "https://www.framer.com/help/articles/why-aren-t-the-effects-in-my-project-functioning/",
  colorPicker: "https://www.framer.com/updates/october-update-2023",
  styles: "https://www.framer.com/updates/january-update-2023",
  transitions: "https://www.framer.com/updates/april-update-2023",
  variables: "https://www.framer.com/academy/lessons/component-variables-in-framer"
}

const penpot = {
  tokens: "https://help.penpot.app/user-guide/design-tokens/",
  layers: "https://help.penpot.app/user-guide/designing/layers/",
  color: "https://help.penpot.app/user-guide/designing/color-stroke/",
  text: "https://help.penpot.app/user-guide/designing/text-typo/",
  flex: "https://help.penpot.app/user-guide/designing/flexible-layouts/",
  numericInput: "https://github.com/penpot/penpot/blob/develop/frontend/src/app/main/ui/ds/controls/numeric_input.mdx",
  radius:
    "https://github.com/penpot/penpot/blob/develop/frontend/src/app/main/ui/workspace/sidebar/options/menus/border_radius.cljs"
}
const penpotImage = (path: string) => `https://help.penpot.app/img/${path}`

const plasmic = {
  tokens: "https://docs.plasmic.app/learn/tokens/",
  variants: "https://docs.plasmic.app/learn/variants/",
  tokenSelector:
    "https://github.com/plasmicapp/plasmic/blob/master/platform/wab/src/wab/client/components/widgets/DimTokenSelector.tsx",
  definedIndicator:
    "https://github.com/plasmicapp/plasmic/blob/master/platform/wab/src/wab/client/components/style-controls/DefinedIndicator.tsx",
  padding: "https://forum.plasmic.app/t/cannot-edit-margin-padding-separately/3282"
}

const wix = {
  inspector: "https://support.wix.com/en/article/studio-editor-using-the-inspector-panel",
  size: "https://support.wix.com/en/article/studio-editor-setting-the-size-of-your-elements",
  docking: "https://support.wix.com/en/article/studio-editor-working-with-docking-margins-and-padding",
  flexbox: "https://support.wix.com/en/article/studio-editor-managing-and-customizing-flexboxes",
  breakpoints: "https://support.wix.com/en/article/studio-editor-designing-across-breakpoints",
  siteColors: "https://support.wix.com/en/article/studio-editor-working-with-site-colors",
  text: "https://support.wix.com/en/article/studio-editor-adding-and-customizing-text",
  blend: "https://support.wix.com/en/article/studio-editor-using-blend-mode",
  cursor: "https://support.wix.com/en/article/studio-editor-adding-a-custom-cursor"
}
const wixFiles = "https://d2x3xhvgiqkx42.cloudfront.net/12345678-1234-1234-1234-1234567890ab"
const wixShots = {
  pxPopup: `${wixFiles}/8696077d-830a-4b1e-bd86-9df98f89994a/2025/09/11/496c9521-3e31-4f71-82a7-07cb5f52478e/6eabea6f-7af8-484e-8e5e-653f4ea00bf8.png`,
  advancedSize: `${wixFiles}/8696077d-830a-4b1e-bd86-9df98f89994a/2025/09/11/6789f4e1-706d-4aa4-bd61-b4d519b2d50e/c1bbd01d-ff93-47a2-9d62-d78ae6b187ee.gif`,
  themeColor: `${wixFiles}/651c25b0-2d60-43c8-addf-1df2fd575568/2024/11/18/62d5b952-5ee8-48e6-94b3-b44d80f66538/01b5f236-1a41-48bb-88fc-a8275fe1e521.jpg`,
  resetText: `${wixFiles}/8696077d-830a-4b1e-bd86-9df98f89994a/2023/11/21/c4ffe24d-4608-4299-9b51-a47ff1e02575/abc3c2ee-10c3-4482-b064-24785e7b7aaa.png`,
  padding: `${wixFiles}/8696077d-830a-4b1e-bd86-9df98f89994a/2024/10/30/3eb57872-4385-4d6b-baee-7bcea7383aca/bfa6c253-3d4f-46e9-aaef-c4cd9e101d4b.png`,
  blend: `${wixFiles}/651c25b0-2d60-43c8-addf-1df2fd575568/2025/08/12/06617963-f9fb-45e1-9b9d-d5e1b5558d2f/88426660-015f-497e-934b-35fbee8f71c9.png`,
  layout: `${wixFiles}/651c25b0-2d60-43c8-addf-1df2fd575568/2023/10/17/3aa8cdb7-4759-4e6c-b764-d44e8cb94ed7/76e4f341-7e50-4fd6-810c-e46d495b6edb.png`
}

/** A number field and its token: the field every other type builds on. */
export const numberInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot(
        "26978261986199",
        [1920, 1440],
        [0.4, 0.27, 0.97, 0.82],
        "A radius bound to a variable, hovered: Detach",
        figma.variables
      ),
      figmaShot(
        "31779413358487",
        [1920, 1920],
        [0.46, 0.5, 0.97, 0.78],
        "Typing in Corner radius: the variable button shows at the field's end",
        figma.radius
      ),
      figmaShot(
        "29799649003671",
        [1920, 1290],
        [0.53, 0.1, 0.97, 0.92],
        "X, Y, W and H as letters, with no px",
        figma.position
      ),
      figmaShot("29799649018519", [1920, 1304], [0.53, 0.38, 0.96, 0.92], "Maths typed into W", figma.position)
    ],
    how: [
      "One glyph per field, a letter (X, Y, W, H) or one icon, and dragging it changes the value. Word labels above the fields are a setting.",
      "Pixels aren't shown. Only % and ° are.",
      "Nothing marks a value that isn't a variable. Check designs finds those in a separate pass.",
      "The variable button and Detach appear at the field's end on hover or while typing. A bound value is a named pill in the value's place.",
      "A deleted variable shows a ? in the field, the one problem it marks there."
    ],
    sources: [
      { label: "Apply variables", href: figma.variables },
      { label: "Corner radius", href: figma.radius },
      { label: "Position and dimensions", href: figma.position }
    ]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("BXHdwQZwkm0HwP4BoUBMQqKQqw.png"),
        [1600, 1110],
        [0.68, 0.18, 1, 0.9],
        "Words on the left, filled boxes with no border, one control on the right",
        framer.pointer
      ),
      pic(
        framerImage("lp3GnonFTytCU2x2oO2qorIayEM.png"),
        [1600, 1024],
        [0.3, 0.05, 1, 1],
        "A bound value becomes one blue chip; it's edited in a pop-out",
        framer.rtl
      )
    ],
    how: [
      "Each row is a short word on the left and a filled box with no border. The only things inside a field are data: a swatch, a style, a bound variable's chip.",
      "Pixels are never printed. Size, letter spacing and line height pair the number with a small Px or Em menu.",
      "One control at most beside a field, always there: a slider, a −/+ stepper, a mode menu or the corners toggle. Nothing appears on hover.",
      "A small circled + left of the label binds a variable; the bound field turns into one blue chip with an ×."
    ],
    sources: [
      { label: "Pointer events", href: framer.pointer },
      { label: "Variables (Academy)", href: framer.variables }
    ]
  },
  {
    product: "Webflow",
    shots: [
      pic(
        webflowShots.units2019,
        [1101, 1002],
        [0.55, 0.1, 1, 0.62],
        "Width in %, Height in PX: the unit is text that opens its menu, and blue labels mark what's set (2019 panel)",
        webflow.panel2019
      )
    ],
    how: [
      "The property's name is its status: plain when unset, blue when set on this class, orange when inherited, pink for this element only. Clicking it shows where the value comes from, or resets it.",
      "The unit is text inside the field and opens the unit menu, which also holds Auto and None. Typing a unit after the number switches to it.",
      "Variables hide behind a purple dot on the field's corner, shown on hover; a bound value turns purple. A value that isn't a variable has no mark.",
      "No scrub icon: Alt-drag in the field scrubs. Bounded values (opacity, radius) pair the field with a slider."
    ],
    sources: [
      { label: "Style panel overview", href: webflow.overview },
      { label: "Values and units", href: webflow.units },
      { label: "Variables", href: webflow.variables }
    ]
  },
  {
    product: "Penpot",
    shots: [
      pic(
        penpotImage("design-tokens/41-design-tab-token-dropdown.webp"),
        [672, 353],
        undefined,
        "A numeric field's token list",
        penpot.tokens
      ),
      pic(
        penpotImage("design-tokens/24-tokens-type-number.webp"),
        [672, 268],
        undefined,
        "A number token applied, from the Tokens panel",
        penpot.tokens
      )
    ],
    how: [
      "Letters and icons inside the field (W, H, X, Y), with the name in a tooltip, and the field itself scrubs.",
      "A token's button and Detach sit over the end of the field and fade in on hover or focus, so nothing moves.",
      "An applied token is a pill showing the resolved value, with the token's name in its tooltip. Typing { opens the token list.",
      "A token that no longer exists drops the pill's fill and adds a small red dot, explained in the tooltip."
    ],
    sources: [
      { label: "Design tokens", href: penpot.tokens },
      { label: "Numeric input (code)", href: penpot.numericInput }
    ]
  },
  {
    product: "Plasmic",
    shots: [
      pic(
        "https://docs.plasmic.app/static/0019cecf05cbd11a0572f5c498120eef/267c0/creating-style-token-in-place.png",
        [1140, 599],
        [0.64, 0, 1, 0.9],
        "Typing in Size lists the size tokens and offers Create new token",
        plasmic.tokens
      )
    ],
    how: [
      "Words on the left name each field, and dragging the word scrubs. The unit is written into the value (16px).",
      "A token is a chip with its name; the tooltip says name and value. Typing a token's name picks it.",
      "Where a value comes from is one 4px dot, shown only when it's set or overridden. Hovering it lists the chain and offers to remove the override.",
      "An unset value is grey text with no badge."
    ],
    sources: [
      { label: "Style tokens", href: plasmic.tokens },
      { label: "Token selector (code)", href: plasmic.tokenSelector },
      { label: "Set indicator (code)", href: plasmic.definedIndicator }
    ]
  },
  {
    product: "Wix Studio",
    shots: [
      pic(wixShots.pxPopup, [287, 261], undefined, "px* explained in a pop-up on hover", wix.size),
      pic(wixShots.advancedSize, [286, 338], undefined, "Min and max appear under Advanced settings", wix.size)
    ],
    how: [
      "Width and height are typed fields under Size that take maths (*3 triples it).",
      "They default to px*, which explains itself in a pop-up on hover rather than a mark in the field.",
      "Min and max appear only once Advanced settings is on.",
      "Breakpoint icons say where an edit will apply, not whether a value is overridden."
    ],
    sources: [
      { label: "Inspector panel", href: wix.inspector },
      { label: "Element size", href: wix.size }
    ]
  }
]

/** Sides and corners: padding, margin, per-corner radius, per-side stroke. */
export const sidesInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot(
        "31837638889367",
        [1182, 860],
        [0.68, 0, 1, 1],
        "Padding: two fields until Cmd-click or the toggle opens four",
        figma.autoLayout
      ),
      figmaShot(
        "31779390031383",
        [1920, 1920],
        [0.08, 0.47, 0.96, 0.83],
        "Corner radius details: each corner by its glyph",
        figma.radius
      ),
      figmaShot("33073812001431", [1920, 1920], [0.39, 0, 0.97, 0.9], "Stroke per side, under Custom", figma.stroke)
    ],
    how: [
      "Padding shows two fields, horizontal and vertical. A toggle opens all four; typing 1, 2, 3, 4 sets them in CSS order.",
      "Corner radius is one field. Each corner opens in a separate panel, laid out where the corners are.",
      "Per-side stroke widths appear only after choosing Custom."
    ],
    sources: [
      { label: "Auto layout", href: figma.autoLayout },
      { label: "Corner radius", href: figma.radius },
      { label: "Stroke", href: figma.stroke }
    ]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("IlJdriFlrxuc7qylCDI13lpxE.png"),
        [1600, 1202],
        [0.13, 0.05, 1, 1],
        "Padding per side: four values with T, R, B and L under them",
        framer.rtl
      ),
      pic(
        framerImage("Zd1z5tU8PqbYUGmJzo0WOy85GHg.png"),
        [1600, 1110],
        [0.67, 0.1, 1, 1],
        "Position pins: a value on each side of a small drawing",
        framer.scrollTop
      )
    ],
    how: [
      "Padding and radius have an all-or-each toggle beside the field, always visible.",
      "Split values are lettered T, R, B and L under the fields, and the letters scrub."
    ],
    sources: [{ label: "Right-to-left layouts", href: framer.rtl }]
  },
  {
    product: "Webflow",
    shots: [
      pic(
        webflowShots.spacing2019,
        [1600, 1131],
        [0.7, 0.38, 0.95, 0.88],
        "Clicking a side of the box: presets, a field and Reset (2019 panel)",
        webflow.panel2019
      )
    ],
    how: [
      "One box-model drawing holds margin, padding and offsets. Drag a side to change it, or click it for presets and a field.",
      "Alt sets the opposite side too, Shift sets all four, Alt-click clears a set value.",
      "Borders pick a side from a small drawing; its middle selects every side. Radius has one slider and a per-corner view."
    ],
    sources: [
      { label: "Spacing", href: webflow.spacing },
      { label: "Borders", href: webflow.borders }
    ]
  },
  {
    product: "Penpot",
    shots: [pic(penpotImage("styling/stroke-per-side.webp"), [672, 260], undefined, "Stroke per side", penpot.color)],
    how: [
      "Radius collapses to one field and padding to two, each with a toggle to show every part.",
      "Sides and corners carry small icons inside the field, with the side named in the tooltip."
    ],
    sources: [
      { label: "Radius menu (code)", href: penpot.radius },
      { label: "Flex layouts", href: penpot.flex }
    ]
  },
  {
    product: "Plasmic",
    how: [
      "Padding is one field holding the CSS shorthand. Focusing it opens a small box drawing to pick sides, which the same field then edits.",
      "Its own staff called these controls weird in 2022 and suggested typing the shorthand instead."
    ],
    sources: [{ label: "Forum: editing padding", href: plasmic.padding }]
  },
  {
    product: "Wix Studio",
    shots: [pic(wixShots.padding, [542, 480], undefined, "Padding: each side, horizontal or vertical", wix.docking)],
    how: [
      "Padding starts from one of three modes, each side, horizontal or vertical, then takes values.",
      "Corners and borders are one value until Unlock separates them."
    ],
    sources: [{ label: "Margins and padding", href: wix.docking }]
  }
]

/** A color: the fill row, its token, the picker. */
export const colorInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot(
        "34210574256279",
        [1920, 1080],
        [0.1, 0.15, 0.9, 0.83],
        "Fill rows: swatch, hex, opacity, then show and remove",
        figma.fills
      ),
      figmaShot(
        "26978254525079",
        [1920, 1920],
        [0.48, 0.03, 0.97, 1],
        "A fill bound to a variable: the swatch and its name, primary",
        figma.modes
      ),
      figmaShot(
        "30896143963415",
        [1920, 1440],
        [0.13, 0.15, 0.85, 0.9],
        "Styles as a list or as swatches",
        figma.styles
      ),
      figmaShot(
        "34327470354711",
        [1920, 1920],
        [0.27, 0.08, 0.72, 0.9],
        "The color picker, with Custom and Libraries",
        figma.picker
      )
    ],
    how: [
      "A fill row is a swatch, the hex, the opacity with %, an eye and a minus. Hovering previews on the canvas, not in the panel.",
      "A bound color shows its swatch and name in the hex's place; no pill is needed beside a swatch.",
      "The picker opens from the swatch, with Custom and Libraries tabs."
    ],
    sources: [
      { label: "Fills", href: figma.fills },
      { label: "Color picker", href: figma.picker },
      { label: "Styles", href: figma.styles }
    ]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("VwXvXzh2wmaYWBKjVEUwDjwKpts.webp"),
        [1600, 900],
        [0.24, 0.15, 0.76, 0.85],
        "Fill as a swatch and its value, with an × to clear",
        framer.styles
      ),
      pic(
        framerImage("DzLa4JDSRIqqt3GzTLktayE67Kc.png"),
        [1600, 900],
        [0.33, 0.08, 0.68, 0.92],
        "The fill pop-out: kinds of fill, the picker, the model's fields",
        framer.colorPicker
      )
    ],
    how: [
      "A color style looks like an ordinary value with its name and an ×.",
      "Color editing opens in a pop-out beside the panel, not inline."
    ],
    sources: [
      { label: "January 2023 update", href: framer.styles },
      { label: "October 2023 update", href: framer.colorPicker }
    ]
  },
  {
    product: "Webflow",
    shots: [
      pic(
        webflowShots.color2019,
        [1600, 1338],
        [0.66, 0.05, 0.95, 0.98],
        "The color picker under its field (2019 panel)",
        webflow.panel2019
      )
    ],
    how: [
      "A color field is a swatch and its value. The purple dot on hover connects it to a color variable; bound, the value turns purple.",
      "Backgrounds are a list of layers (color, image, gradient), each added with +."
    ],
    sources: [
      { label: "Backgrounds", href: webflow.backgrounds },
      { label: "Variables", href: webflow.variables }
    ]
  },
  {
    product: "Penpot",
    shots: [
      pic(
        penpotImage("styling/fill-multiple.webp"),
        [690, 325],
        undefined,
        "Several fills, each a swatch, a hex or a name, and opacity",
        penpot.color
      ),
      pic(penpotImage("styling/color-picker.webp"), [612, 752], undefined, "The color picker", penpot.color)
    ],
    how: [
      "A fill row is a swatch, the hex or the token's name, and opacity. The picker has solid, gradient and image, with an eyedropper."
    ],
    sources: [{ label: "Color and stroke", href: penpot.color }]
  },
  {
    product: "Wix Studio",
    shots: [pic(wixShots.themeColor, [600, 565], undefined, "Theme colors in the color picker", wix.siteColors)],
    how: [
      "Site colors, 6 to 25 of them, are Wix's color tokens. The color box opens the picker, and an element with several colors gets a box for each."
    ],
    sources: [{ label: "Site colors", href: wix.siteColors }]
  }
]

/** Keyword pickers: a menu, a row of icons, or words. */
export const keywordInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot("32003404358679", [1920, 1080], [0.62, 0.15, 1, 1], "Position as a menu of words", figma.sitesPosition),
      figmaShot(
        "33073858760471",
        [1920, 1920],
        [0.36, 0, 0.97, 0.88],
        "Stroke position and endpoints as menus, with words above",
        figma.stroke
      ),
      figmaShot(
        "42724005779863",
        [1374, 1374],
        [0.31, 0.12, 0.69, 0.89],
        "Type settings: alignment, decoration and case as icon rows",
        figma.text
      )
    ],
    how: [
      "Choices with a picture (alignment, decoration, case) are a row of icon buttons; choices without one are a menu of words.",
      "Blend mode is an icon until it's set, then an inline menu."
    ],
    sources: [
      { label: "Position (Sites)", href: figma.sitesPosition },
      { label: "Text properties", href: figma.text }
    ]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("vcReAuqtIlamLtE9M4f32VL4a0c.png"),
        [1600, 1042],
        [0.66, 0, 1, 0.8],
        "Stack or Grid as words, direction as two icons, Wrap as Yes and No",
        framer.rtl
      )
    ],
    how: [
      "Small sets are segmented (Yes and No, direction icons, text align); long lists are menus (distribute, overflow, position)."
    ],
    sources: [{ label: "Right-to-left layouts", href: framer.rtl }]
  },
  {
    product: "Webflow",
    shots: [
      pic(
        webflowShots.alignBox,
        [1620, 954],
        [0.66, 0.5, 0.98, 0.99],
        "Display as words, direction as icons, the align box with X and Y menus",
        webflow.flexbox
      ),
      pic(webflowShots.wrap, [1620, 1076], [0.25, 0.05, 0.95, 0.95], "Wrap behind one menu", webflow.flexbox)
    ],
    how: [
      "Webflow's 2024 research chose words over icons for display (Block, Flex, Grid, None).",
      "Rarer options sit behind one disclosure each: inline display, wrap, the X and Y menus beside the align box."
    ],
    sources: [
      { label: "Flexbox", href: webflow.flexbox },
      { label: "Layout section update", href: webflow.layout }
    ]
  },
  {
    product: "Penpot",
    shots: [
      pic(
        penpotImage("styling/blend-opacity.webp"),
        [342, 216],
        undefined,
        "Blend mode as a menu beside opacity",
        penpot.layers
      )
    ],
    how: ["Blend modes are a menu, each previewed on the canvas as it's hovered."],
    sources: [{ label: "Layers", href: penpot.layers }]
  },
  {
    product: "Wix Studio",
    shots: [pic(wixShots.blend, [500, 384], undefined, "Blend mode as a menu under Design", wix.blend)],
    how: ["Blend mode is a menu under Design. A cursor is an image or SVG with a size slider, set per breakpoint."],
    sources: [
      { label: "Blend mode", href: wix.blend },
      { label: "Custom cursor", href: wix.cursor }
    ]
  }
]

/** Typography: family, weight, size, line height, letter spacing. */
export const typographyInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot(
        "27469557155991",
        [1920, 1920],
        [0.18, 0.2, 0.82, 0.8],
        "Typography: family, weight and size, then line height and letter spacing",
        figma.text
      ),
      figmaShot(
        "30808952410263",
        [1920, 1440],
        [0.33, 0, 0.97, 0.9],
        "Text styles, each previewed with its size and line height",
        figma.textStyles
      )
    ],
    how: [
      "Family spans the row; weight and size share the next. Line height and letter spacing have a word above and one glyph inside.",
      "Rarer settings (case, decoration, trim, list style) are behind one settings button.",
      "A text style replaces the section with its name; hovering a font previews it on the canvas."
    ],
    sources: [
      { label: "Text properties", href: figma.text },
      { label: "Text styles", href: figma.textStyles }
    ]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("IVkPVDwQ08CXCtVopQXATc8X5Y.png"),
        [1600, 970],
        [0.67, 0, 1, 1],
        "Text: words on the left, Px and Em menus beside size, letter and line",
        framer.fetch
      )
    ],
    how: [
      "Size, letter spacing and line height each pair the number with a small unit menu; fonts open in a pop-out with search."
    ],
    sources: [
      { label: "Fetch", href: framer.fetch },
      { label: "Custom fonts", href: framer.fonts }
    ]
  },
  {
    product: "Webflow",
    shots: [
      pic(
        webflowShots.truncate2025,
        [1280, 720],
        [0.63, 0, 0.89, 0.93],
        "Type options under More type options, with Truncate",
        webflow.truncate
      )
    ],
    how: ["Typography lists font, weight, size, height and color, with the rest under More type options."],
    sources: [{ label: "Typography", href: webflow.typography }]
  },
  {
    product: "Penpot",
    shots: [
      pic(penpotImage("objects/text-options.webp"), [612, 546], undefined, "Text options", penpot.text),
      pic(
        penpotImage("design-tokens/29-tokens-type-font-family-missing.webp"),
        [672, 101],
        undefined,
        "A missing font, marked on the row",
        penpot.tokens
      )
    ],
    how: ["Typography tokens apply as one row; a missing font is marked on the row."],
    sources: [{ label: "Text and typography", href: penpot.text }]
  },
  {
    product: "Wix Studio",
    shots: [pic(wixShots.resetText, [280, 497], undefined, "A theme style, with Reset Changes", wix.text)],
    how: ["Text takes a theme style first; changes on top of it are overrides that can be reset to the style."],
    sources: [{ label: "Text", href: wix.text }]
  }
]

/** Layer lists: effects, shadows, fills, transitions. */
export const listInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot(
        "31937315180951",
        [2318, 1420],
        [0.78, 0.12, 0.995, 0.95],
        "Effects: one row each, a type menu, an eye and a minus",
        figma.effects
      )
    ],
    how: [
      "A section with nothing in it is just its title and +.",
      "Each row is the type as a menu, then show and remove; its settings open from the row's icon. Drag to reorder."
    ],
    sources: [{ label: "Effects", href: figma.effects }]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("KSIFEm7ExXUgX2SMKSPhF1R0.png"),
        [1600, 900],
        [0.32, 0.03, 0.67, 0.97],
        "A transition's pop-out: Instant, Ease or Spring, the curve, time and delay",
        framer.transitions
      )
    ],
    how: ["Color, border, shadow, transition and font editing open in pop-outs beside the panel, not inline."],
    sources: [{ label: "April 2023 update", href: framer.transitions }]
  },
  {
    product: "Webflow",
    shots: [
      pic(
        webflowShots.shadows2024,
        [2560, 1440],
        [0.6, 0.1, 0.94, 1],
        "A box shadow's row and its settings, with X and Y",
        webflow.shadows
      )
    ],
    how: [
      "Shadows, filters, transitions and backgrounds share one pattern: + adds, an eye hides, trash removes, drag reorders. The handle and trash show on hover."
    ],
    sources: [{ label: "Effects", href: webflow.effects }]
  },
  {
    product: "Penpot",
    shots: [
      pic(
        penpotImage("styling/shadow.webp"),
        [630, 287],
        undefined,
        "Shadows: a type menu, an eye and a minus, settings in place",
        penpot.layers
      )
    ],
    how: ["Shadow rows open their settings in place; the drag handle is hidden and sits outside the row."],
    sources: [{ label: "Layers", href: penpot.layers }]
  }
]

/** Layout and position: direction, alignment, sizing, constraints. */
export const layoutInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot(
        "31837633116311",
        [2486, 1564],
        [0.765, 0.18, 0.995, 0.8],
        "Auto layout: direction, W and H with Hug, the alignment grid, gap and padding",
        figma.autoLayout
      ),
      figmaShot("31937331188759", [1354, 860], [0.76, 0, 1, 1], "Min width shows only once it's set", figma.autoLayout),
      figmaShot(
        "25953942136599",
        [1920, 1920],
        [0.17, 0.21, 0.81, 0.79],
        "Constraints as two menus and a drawing",
        figma.constraints
      )
    ],
    how: [
      "W and H carry Hug and Fill in the field's own menu, so sizing needs no extra row.",
      "Alignment is a 3 by 3 grid of dots; gap and padding sit beside it.",
      "Min and max hide again once the layer is reselected, leaving a hint on the W or H glyph."
    ],
    sources: [
      { label: "Auto layout", href: figma.autoLayout },
      { label: "Constraints", href: figma.constraints }
    ]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("dxdTgkJROOdsf3xsS7B0sHVnloo.jpg"),
        [1600, 1056],
        [0.68, 0.6, 1, 0.98],
        "Width and Height with Fixed beside them, and Min Max to add",
        framer.mobileNav
      )
    ],
    how: [
      "Width and height pair the number with a sizing mode, such as Fixed or Fit, which implies the unit. Min and max are added on request."
    ],
    sources: [{ label: "Navigation on mobile", href: framer.mobileNav }]
  },
  {
    product: "Webflow",
    shots: [pic(webflowShots.layout2024, [2400, 1260], undefined, "The 2024 Layout section", webflow.layout)],
    how: [
      "Display is four words; flex shows direction, an align box with X and Y menus, gap with a slider, and Wrap behind one menu."
    ],
    sources: [
      { label: "Layout section update", href: webflow.layout },
      { label: "Position", href: webflow.position }
    ]
  },
  {
    product: "Penpot",
    shots: [
      pic(
        penpotImage("flexible-layouts/flex-properties.webp"),
        [670, 343],
        undefined,
        "Flex layout: align, direction, justify, gap, padding",
        penpot.flex
      )
    ],
    how: ["Min and max show only when a child fills; flex properties are a compact grid of icon rows."],
    sources: [{ label: "Flex layouts", href: penpot.flex }]
  },
  {
    product: "Wix Studio",
    shots: [
      pic(wixShots.layout, [650, 464], undefined, "Layout: display type, direction, item width, gaps", wix.flexbox)
    ],
    how: ["Flexbox settings live in the Inspector, named in words, with menus for display type and direction."],
    sources: [
      { label: "Flexboxes", href: wix.flexbox },
      { label: "Size", href: wix.size }
    ]
  }
]

/** Mixed and set elsewhere: several layers, overrides, states, breakpoints. */
export const statesInspiration: Example[] = [
  {
    product: "Figma",
    shots: [
      figmaShot(
        "27771782233751",
        [1921, 1440],
        [0.58, 0.02, 0.97, 0.98],
        "Several layers: X and Y say Mixed in the field",
        figma.componentProperties
      ),
      figmaShot(
        "26978261704599",
        [1920, 1440],
        [0.04, 0.3, 0.97, 1],
        "Overrides reset from a menu, per property",
        figma.instances
      )
    ],
    how: [
      "Mixed is the field's placeholder text, nothing more.",
      "An instance's overrides aren't marked on fields; they're listed in More actions with a Reset per property."
    ],
    sources: [
      { label: "Component properties", href: figma.componentProperties },
      { label: "Instances", href: figma.instances }
    ]
  },
  {
    product: "Framer",
    shots: [
      pic(
        framerImage("us82gGgVDGoskz3TnYBzp9VPKXk.jpg"),
        [1600, 1182],
        [0.33, 0.35, 0.67, 0.92],
        "A reference that's gone shows as a Missing chip",
        framer.effects
      )
    ],
    how: [
      "An overridden property's label is highlighted, and clicking it offers Reset Override. Something deleted shows as a Missing chip."
    ],
    sources: [{ label: "Effects not working", href: framer.effects }]
  },
  {
    product: "Webflow",
    how: [
      "The label's color carries where a value comes from: blue set here, orange inherited, pink this element only. Collapsed sections show the same colors as dots."
    ],
    sources: [{ label: "Style panel overview", href: webflow.overview }]
  },
  {
    product: "Plasmic",
    shots: [
      pic(
        "https://docs.plasmic.app/static/4e2c4bbafda67f0ca24d166005b28c8a/267c0/red-dot-override.png",
        [1140, 617],
        [0.5, 0, 1, 1],
        "A dot beside Backgrounds; hovering it lists the layers that set it",
        plasmic.variants
      )
    ],
    how: [
      "One small dot beside a field when it's set or overridden; hovering it lists base, variants, breakpoints and theme, and removes the override."
    ],
    sources: [
      { label: "Variants", href: plasmic.variants },
      { label: "Set indicator (code)", href: plasmic.definedIndicator }
    ]
  },
  {
    product: "Wix Studio",
    how: ["Breakpoint icons say where an edit applies; overrides are removed per element, not per property."],
    sources: [{ label: "Breakpoints", href: wix.breakpoints }]
  }
]
