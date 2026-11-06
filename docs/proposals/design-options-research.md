# Design options: what other tools offer

Part of [design-options.md](design-options.md) (PAR-652). What Figma, pen.dev, Webflow and Framer offer in their design
panels, researched on 2026-11-05, and what Parity takes from each. Sources are linked under each tool.

## At a glance

"Not found" means the research didn't find it in that tool's docs, not that it's surely missing.

| Capability                      | Figma                                          | pen.dev                        | Webflow                                  | Framer                                | Parity today                       |
| ------------------------------- | ---------------------------------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------- | ---------------------------------- |
| Stacked fills                   | Yes                                            | Yes                            | Yes, images and gradients                | Not found                             | One color token                    |
| Linear and radial gradients     | Yes                                            | Yes                            | Yes                                      | Yes                                   | No                                 |
| Conic gradient                  | Angular                                        | Angular                        | No                                       | Yes                                   | No                                 |
| Paints CSS can't draw           | Diamond, pattern, shader                       | Mesh, shader                   | None                                     | None                                  | None                               |
| Color models                    | Hex, RGB, HSL, HSB, CSS (OKLCH typed)          | Hex                            | Hex, RGBA                                | P3 picker                             | Tokens only                        |
| Layer blend mode                | Yes                                            | No                             | Yes                                      | Yes                                   | No                                 |
| Radius per corner               | Yes                                            | Yes                            | Yes                                      | Yes                                   | No                                 |
| Corner smoothing or shape       | Smoothing                                      | No                             | No                                       | Squircle (`corner-shape`)             | No                                 |
| Border per side                 | Width                                          | Width                          | Width, style and color                   | Not found                             | No                                 |
| Stroke inside, center, outside  | Yes                                            | Yes                            | No                                       | No                                    | No                                 |
| Outline                         | No                                             | No                             | Yes                                      | Not found                             | No                                 |
| Shadows                         | Drop and inner, up to 8, spread                | Inner and outer, no spread     | Box (spread, inset) and text             | Box, inset, "realistic"               | One shadow token                   |
| Layer and background blur       | Yes, and progressive                           | Yes                            | As filters                               | Yes                                   | No                                 |
| Color adjustments on a layer    | On image fills only                            | No                             | Filters and backdrop filters             | Yes                                   | No                                 |
| Transforms                      | Rotate and flip                                | Rotate and flip                | 2D and 3D                                | 2D and 3D                             | No                                 |
| Grid                            | Fixed, fr and hug tracks (2025)                | No                             | Tracks with min and max, areas, auto-fit | Fixed or min-and-max columns, masonry | Equal tracks only                  |
| Wrap; min and max sizes         | Yes; yes                                       | No; no                         | Yes; yes                                 | Yes; yes                              | Yes; yes                           |
| Margin                          | No                                             | No                             | Yes                                      | Not found                             | Yes                                |
| Aspect ratio                    | Lock while resizing                            | No                             | Yes                                      | Yes                                   | No                                 |
| Sticky and fixed                | In prototypes only                             | No                             | Yes                                      | Yes                                   | No                                 |
| Z-index                         | No: layer order                                | No                             | Yes                                      | Yes                                   | No                                 |
| Units beyond px                 | No                                             | No                             | %, em, rem, vw, vh, dvh, ch, fr          | %, fr, vh, rem                        | px, rem and % typed, kept as steps |
| `calc()`, `clamp()`             | No                                             | No                             | Yes, after `=`                           | Not found                             | No                                 |
| Decoration style, color, offset | Yes                                            | No                             | Yes                                      | Yes                                   | No                                 |
| Balance and pretty wrapping     | Yes (2026)                                     | No                             | Only as a custom property                | Balance                               | No                                 |
| Max lines                       | Yes                                            | No                             | One line                                 | Yes                                   | Yes                                |
| OpenType and variable axes      | Yes                                            | No                             | Variable axes                            | Yes                                   | No                                 |
| Cursor and transitions          | Prototypes and Motion                          | No                             | Yes                                      | Cursor                                | No                                 |
| Variable types                  | Number, color, string, boolean, easing, timing | Color, number, string, boolean | Color, size, percentage, number, font    | Color and text styles                 | 14 categories, 29 preview kinds    |
| Where a value comes from        | Bound values marked                            | Bound values purple            | Every label colored by source            | Overrides marked                      | Reset arrow on changed rows        |
| Any CSS declaration             | No                                             | No                             | Custom properties                        | Not found                             | No                                 |

## Figma

From Figma's [plugin API typings](https://github.com/figma/plugin-typings/blob/master/plugin-api.d.ts), which list every
property a layer stores, its [API changelog](https://developers.figma.com/docs/plugins/updates/) for what changed in
2025 and 2026, its [variable scopes](https://developers.figma.com/docs/plugins/api/VariableScope/), and its help center
for how the panel shows each one: [auto layout](https://help.figma.com/hc/en-us/articles/360040451373),
[grid](https://help.figma.com/hc/en-us/articles/31289469907863),
[fills](https://help.figma.com/hc/en-us/articles/360041003694),
[strokes](https://help.figma.com/hc/en-us/articles/360049283914),
[effects](https://help.figma.com/hc/en-us/articles/360041488473) and
[text](https://help.figma.com/hc/en-us/articles/360039956634). Figma doesn't document what Dev Mode writes as CSS, so
the CSS below is what its help center and staff say; a plugin can check it with `node.getCSSAsync()`.

**The panel** shows, by what's selected: position and alignment, frame size, layout (auto layout, sizes, clip content),
appearance (opacity, blend mode, radius, smoothing, variable modes), typography, fill, stroke, effects, layout guides
and export. Scrolling, fixed and sticky are in the Prototype tab.

**Layout.** Auto layout flows vertically, horizontally, wrapping (vertically too since late 2026) or as a grid (2025).
Gap can be Auto, which spreads children between, evenly or around (2026). Padding is two values or four. The alignment
box has nine spots and a text baseline option. A child is Fixed, Hug or Fill on each axis, with min and max, or ignores
auto layout and is placed by its constraints (left, right, left and right, center, scale). A grid's tracks are fixed, a
share (`fr`) or hug, with spans and gaps, but no `minmax()`, auto-fill or named areas. Since July 2026 auto layout
behaves like CSS flexbox by default ("layout version"), including the border-box model.

**Paint.** Fills and strokes stack, each with its own opacity and blend mode: solid, linear, radial, angular and diamond
gradients (stops and an on-canvas transform, no angle field or interpolation), image (Fill, Fit, Crop, Tile, with
exposure, contrast, saturation, temperature, tint, highlights and shadows), video, a pattern from another layer, and
shaders (2026). The picker has Custom and Libraries tabs, Hex, RGB, CSS, HSL and HSB models (OKLCH and P3 typed in the
CSS model, kept in the space they were typed in since October 2026), an eyedropper and a contrast checker. Strokes are
inside, center or outside, per side in weight, with dash patterns, caps, joins, width profiles and brushes.

**Effects.** Up to eight drop and inner shadows (X, Y, blur, spread, color, blend), one layer blur and one background
blur (each normal or progressive), noise, texture, glass (2025) and shaders. Dev Mode writes `box-shadow`, `text-shadow`
on text, and `filter: drop-shadow` for icon-like frames; glass gets nothing.

**Type.** Font, style, size, line height (auto, px, %), letter spacing (px, %), paragraph spacing and indent, horizontal
and vertical alignment, auto width, auto height or fixed, truncation with max lines, case (with small caps), underline
and strikethrough with style, thickness, offset, skip ink and color, vertical trim, wrap style (Auto, Balance, Pretty,
2026), lists, hanging punctuation, OpenType features and variable axes (2026).

**Variables** are numbers, colors, strings and booleans, plus easing and timing for Motion (2026), and each can be
limited to the fields it fits by 23 scopes: corner radius, width and height, gap, opacity, a color's opacity, stroke and
effect numbers, each font property, and fills by what they fill (frames, shapes, text). Positions, rotation, smoothing,
blend modes, gradient geometry, layout enums, grid tracks and alignment can't be bound.

**What CSS can do and Figma's Design panel can't:** sticky and fixed placement, z-index, scrolling, margins, grow ratios
and order, `minmax()` and areas, units other than px, `calc()` and `clamp()`, transforms beyond rotation, filters on
layers, isolation as its own setting, repeating gradients and their color space, background size and position per layer,
`object-fit`, outline, double and groove borders, `corner-shape`, `clip-path`, `visibility` that keeps a layer's space,
writing direction, hyphens and word breaking, columns, floats, cursor, transitions, scroll snap and form control colors.

**What Figma does that CSS can't:** diamond gradients, pattern and shader paints, stacked strokes and gradient strokes,
dash lengths, caps and width profiles on a box, noise, texture and glass, progressive blur (a mask and a backdrop blur
come close), temperature and tint on images, and text on a path. Corner smoothing comes close with `corner-shape`.

**Take:** the names designers know, Auto gap, the alignment box with baseline, stacked paints and effects with a + menu,
the picker's contrast checker, scopes for variables, and Hug and Fill. **Leave:** paints and effects CSS can't draw, and
a model where scrolling and sticky are prototype settings rather than the design's.

## pen.dev

Read from pen.dev 1.2.21's own schema and validators (file format 2.21), which list every property a node takes, and its
property panel's code, beside [the .pen format](https://docs.pencil.dev/for-developers/the-pen-format),
[drawing and editing](https://docs.pencil.dev/core-concepts/drawing-and-editing) and
[variables](https://docs.pencil.dev/design-systems/variables).

**Its model is a small flex box.** A frame lays out with `layout` (none, vertical or horizontal), one `gap`, padding of
one, two or four values, `justifyContent` (start, center, end, space between, space around) and `alignItems` (start,
center, end). Sizes are a number, `fill_container` or `fit_content`. There's no wrap, grid, row gap, min or max size,
margin, grow ratio, align self or order, and no %, viewport units or `calc()`. A child is in the flow or absolute, at an
x and y from its parent's top left; there's no fixed, sticky, right or bottom inset, or z-index.

**Its paint goes beyond CSS.** Fills and strokes stack, each with its own blend mode (18 of them), and a paint is a hex
color, a linear, radial or angular gradient, an image (cover, contain or stretch, with a crop transform), a mesh
gradient, or a GLSL shader. Strokes are inside, center or outside, per side in width, with joins and caps. Effects
stack: inner and outer shadows (no spread), one layer blur, one background blur, and shaders.

**Type is thin.** Font, size, weight, style, letter spacing, line height as a multiple, underline, strikethrough, a
link, horizontal and vertical alignment, and auto width, auto height or fixed. No case, truncation, decoration styles,
OpenType, indent or word spacing.

**Variables** are colors, numbers, strings and booleans, themed along any number of axes (light and dark, phone and
tablet), and bind to most number, color and boolean fields. There are no gradient, shadow or type variables, and no
shared text or effect styles.

**The panel** stacks sections that show when they apply: Alignment, Position (X, Y, rotation, flips), Layout (Freeform,
Vertical or Horizontal; a nine-spot box; gap as a number, space between or space around; padding as two fields or four;
Fill and Hug checkboxes), Appearance (opacity, radius, clip content), Fill, Stroke, Typography, Effects (added from +:
drop shadow, inner shadow, layer blur, background blur, shader), Theme, Code (HTML and CSS or Tailwind) and Export. A
bound value shows purple.

**Take:** stacked paints with a blend mode each, the + menu for effects, and Fill and Hug as plain words. **Leave:** a
model that's a second, smaller copy of CSS. Everything pen.dev can't say is a property its own format has no key for,
which is the gap Parity avoids by writing CSS.

## Webflow

From Webflow's help center, read article by article: the
[Style panel](https://help.webflow.com/hc/en-us/articles/33961362040723-Style-panel-overview),
[spacing](https://help.webflow.com/hc/en-us/articles/33961243177875-Spacing-margin-and-padding),
[units](https://help.webflow.com/hc/en-us/articles/33961290465043-Input-values-and-units),
[position](https://help.webflow.com/hc/en-us/articles/33961228002963-CSS-position-properties),
[grid](https://help.webflow.com/hc/en-us/articles/33961365794451-Grid),
[typography](https://help.webflow.com/hc/en-us/articles/33961334261779-Typography),
[backgrounds](https://help.webflow.com/hc/en-us/articles/33961278898323-Background-styles),
[effects](https://help.webflow.com/hc/en-us/articles/33961245810451-Effects),
[custom properties](https://help.webflow.com/hc/en-us/articles/33961265610259-Custom-CSS-properties-and-values) and
[variables](https://help.webflow.com/hc/en-us/articles/33961268146323-Variables), and its
[updates](https://webflow.com/updates) since 2024.

**The closest to CSS of the four,** with sections in CSS's own order: Layout, Spacing, Size, Position, Typography,
Backgrounds, Borders, Effects and Custom properties.

- **Every label is colored by where its value comes from:** orange when inherited (from a parent, a base class or a
  larger breakpoint; clicking it names the source), blue when set here, pink when set on this element only, purple when
  bound to a variable. Alt-click a label resets it.
- **Spacing is a box-model widget:** margin's ring around padding's, a value on each of the eight sides. Drag a side to
  scrub it, click it for a field, unit menu, slider and presets; Alt applies to the opposite side, Shift to all four.
  Margins take `auto` and negatives. The position offsets use the same box, with presets from Top left to Full.
- **Fields take any unit and keyword** (px, %, em, rem, vw, vh, dvh, ch, fr, auto, none, unitless), simple maths, and,
  since June 2025, any CSS value: pressing `=` opens a function editor with completion for `calc()`, `clamp()`, `min()`,
  `max()`, `color-mix()` and `var()`.
- **Flex and grid in full:** display as a labelled segment, wrap and reverse as plain-language options ("Wrap down",
  "Single row"), a nine-spot align box with X and Y menus beside it, gap with a lock, grid tracks edited on the canvas
  with min and max, auto-fit, dense, and named areas painted on the canvas. A flex child's sizing is three presets
  (Shrink if needed, Grow if possible, Don't shrink or grow) and Custom; order is First, Last or a number.
- **Stacks** for background images and gradients (linear and radial, no conic), box shadows (with spread and inset),
  text shadows, filters, backdrop filters, 2D and 3D transforms, and transitions with an easing editor.
- **Typography's More** has decoration style, thickness, color and offset, indent, columns, word breaking, white space,
  truncation that adds the `overflow` and `white-space` it needs, text stroke, and a slider per variable font axis.
  `text-wrap`, line clamp and user select go through custom properties.
- **Variables** are colors, sizes, percentages, numbers and fonts, each binding only to fields of its type, with modes
  per breakpoint or applied to a class.
- **Custom properties** take any declaration (about 90% of CSS, Webflow says), except prefixed ones and those a native
  control covers in ways it can't merge (`background*`, `transition*`).
- **States** (hover, pressed, focused, focus visible, disabled, visited, placeholder, checked) inherit from each other,
  and breakpoints cascade from desktop, each shown by the label colors.

**Take:** the label colors, the box-model widget and its keys, units and keywords in one menu, `=` for an expression,
plain-language presets with the CSS beneath, and controls that add what they need. **Leave:** a class-first model, where
styling an element means naming a class first; Parity's layers carry their own styles.

## Framer

From Framer's [academy](https://www.framer.com/academy), its plugin API's types, which list the values its panel offers,
and its [updates](https://www.framer.com/updates).

- **Layout** is None, Stack or Grid. A stack has direction, distribution (including space evenly), alignment, wrap, gap
  and padding; a grid has counts, fixed or min-and-max columns, and, since 2025 and 2026, masonry and bento layouts.
- **Each axis has a sizing mode:** Fixed, Relative (% of the parent), Fill (a share of what's left), Fit Content,
  Viewport, or Fit Image, and Framer refuses a Fit parent with a Fill child on the same axis rather than drawing
  nothing.
- **Position** is relative, absolute, fixed (at page level only) or sticky, pinned on any side or centered, with
  z-index.
- **Overflow's default became Clip** in August 2025: Hidden makes a scroll container, which breaks sticky children.
- **Styles:** fills with P3 colors and linear, radial and conic gradients; a radius per corner; a squircle
  (December 2025) that writes `corner-shape` with a radius for browsers without it; borders with style; shadows, inset,
  and a "realistic" shadow that layers itself from elevation and focus; stacked gradient and image masks; filters, blur,
  blending, cursor, pointer events and user select; 3D transforms.
- **Text:** styles per breakpoint, case, decoration with style, color, thickness and offset, balance, truncation by
  lines, OpenType features with a live preview, variable axes, and paragraph spacing.

**Take:** Clip as the default, the squircle with its fallback, conflicts refused with a reason, OpenType with a preview.
**Leave:** a hosted runtime that owns the page.

## What Parity takes

| Idea                                                          | From                    | Where in the plan                |
| ------------------------------------------------------------- | ----------------------- | -------------------------------- |
| Labels colored by where a value comes from                    | Webflow                 | design-options.md, principle 6   |
| Box-model widget, Alt for the opposite side, Shift for all    | Webflow                 | Spacing                          |
| Units and keywords in one menu; `=` opens an expression       | Webflow                 | The value model                  |
| Plain-language presets with the CSS under them                | Webflow, Figma          | Size, Position                   |
| Controls that add the properties they need                    | Webflow                 | design-options.md, principle 8   |
| Stacks of fills, shadows, filters, transforms and transitions | Figma, Webflow, pen.dev | Fill, Effects, Transform, Motion |
| Clip content as `overflow: clip`                              | Framer                  | Appearance                       |
| Corner shape with a radius to fall back on                    | Framer                  | Appearance                       |
| Variables limited to the fields they fit                      | Figma, Webflow          | Fields and token kinds           |
