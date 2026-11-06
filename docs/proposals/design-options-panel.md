# Design options: the panel, section by section

Part of [design-options.md](design-options.md) (PAR-652). For each section of the Design tab: when it shows, its rows,
the control each row uses, the CSS it writes, and what Figma has in its place. What a section's More holds is listed
after its rows; [design-options-css.md](design-options-css.md) has every property. Rows marked "today" exist now.

The sections, in order: Position, Layout, Size, Spacing, Appearance, Fill, Stroke, Effects, Transform, Type, Image,
Icon, Interaction, Motion and CSS. Every row can be set for one state and one mode, as rows are today, and its label is
colored by where its value comes from.

## Which layers get which sections

Parity's layers are the node types in `@parity-app/core`: a layout (a flex or grid box, the only node with children), a
text layer, an image, a component (an instance of a code component, whose style lands on its root element over the
component's own classes) and an instance (of a component design). A screen's or component design's root is a layout; a
frame sizes itself.

| Section     | Layout              | Text                                | Image                 | Component or instance           |
| ----------- | ------------------- | ----------------------------------- | --------------------- | ------------------------------- |
| Position    | Yes, but not a root | Yes                                 | Yes                   | Yes                             |
| Layout      | Yes                 | No                                  | No                    | No: its children are its code's |
| Size        | Yes                 | Yes, with Resizing                  | Yes                   | Yes                             |
| Spacing     | Yes                 | Yes                                 | Yes                   | Yes                             |
| Appearance  | Yes                 | Yes                                 | Yes                   | Yes                             |
| Fill        | Yes                 | No: Type's Color                    | Yes, behind the image | Yes                             |
| Stroke      | Yes                 | No: Type's Outline                  | Yes                   | Yes                             |
| Effects     | Yes                 | Yes; a drop shadow is `text-shadow` | Yes                   | Yes                             |
| Transform   | Yes                 | Yes                                 | Yes                   | Yes                             |
| Type        | As Text inside      | Yes                                 | No                    | As Text inside                  |
| Image       | No                  | No                                  | Yes                   | No                              |
| Icon        | No                  | No                                  | No                    | An icon component only          |
| Interaction | Yes                 | Yes                                 | Yes                   | Yes                             |
| Motion      | Yes                 | Yes                                 | Yes                   | Yes                             |
| CSS         | Yes                 | Yes                                 | Yes                   | Yes                             |

A component whose props take no `style` gets none of these, and says so, as today. The layout a layer sits in adds rows:

| Parent                           | Rows it adds to the child                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| A flex layout                    | Fill and Hug on both axes, Align self (with baseline), and under More grow, shrink, basis and order |
| A grid                           | Span, start lines, Align self and Justify self, and under More the area                             |
| None (absolute, fixed or sticky) | The pin box's insets; none of the rows above                                                        |
| None (a design's root)           | None of these: Fill is the whole frame                                                              |

A layout that wraps or is a grid shows a row gap and Lines on itself, not on its children. A text layer's and a layout's
tag (a heading, paragraph or label; a section, list or button) is the name row's, at the top of the tab, since it's HTML
rather than CSS.

Every row also works in a patch: for a viewport, a state, a variant, or as an unset. A patch replaces a whole key, as
`applyPatch` does today for `padding`, so a key holding a list or four sides (radius, border width, fills) is written
whole in a patch: changing one corner in a state writes all four, the other three as the frame shows them there.

## Position

Shows for every layer but a design's root.

| Row         | Control                                                                                                              | Writes                                    | Figma                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Placement   | Toggles: In layout, Absolute, Fixed, Sticky; Relative under More (today: the first two)                              | `position`                                | Absolute position in auto layout; fixed and sticky only in prototype scroll settings |
| Insets      | The pin box: a field on each side of a small box, each side pinned or not, with presets (below) (today: four fields) | `top`, `right`, `bottom`, `left`, `inset` | Constraints                                                                          |
| Layer order | Number field, with z-index tokens                                                                                    | `z-index`                                 | None: order in Layers only                                                           |

The pin box's presets are Figma's constraints, each written in CSS:

| Preset         | Writes                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Left, Top      | `left`, `top`                                                                                                                     |
| Right, Bottom  | `right`, `bottom`                                                                                                                 |
| Left and right | `left` and `right`, width unset, so it stretches                                                                                  |
| Center         | `left: 0` and `right: 0` with `margin-inline: auto`, on that axis, which Margin then shows; not `translate`, which is Transform's |
| Scale          | `left` and `right` as percentages of the parent                                                                                   |
| Fill parent    | `inset: 0`, Webflow's Full                                                                                                        |

Sticky shows the inset it sticks at (`top: 0`) and outlines the layout it scrolls inside on the canvas, and says when a
layout around it clips or scrolls, which stops it sticking. Layer order on a layer in the flow sets
`position: relative`, which z-index needs. **More:** Anchor (name this layer as an anchor, or place it against one with
a nine-spot `position-area` picker and fallbacks) and Float.

## Layout

Shows for layouts. A flex box or a grid, as today, with direction, alignment and gap; padding is in Spacing.

| Row              | Control                                                                                                                                                                                                                  | Writes                                                                         | Figma                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Type             | Icon toggles: Vertical, Horizontal, Grid; Block, Inline and None under More (today: the three)                                                                                                                           | `display`, `flex-direction`                                                    | Auto layout: vertical, horizontal, grid; freeform          |
| Wrap and reverse | Two toggles beside Type (today: Wrap)                                                                                                                                                                                    | `flex-wrap`, `flex-direction: *-reverse`                                       | Wrap; no reverse                                           |
| Alignment        | Nine-spot box and a distribution menu: Packed, Space between, around, evenly (today)                                                                                                                                     | `align-items`, `justify-content`; in a grid, `justify-items` and `align-items` | Alignment box; Auto gap is space between, evenly or around |
| Baseline         | A toggle under the box: align text on its first or last baseline                                                                                                                                                         | `align-items: baseline`, `baseline-source`                                     | Text baseline alignment                                    |
| Lines            | Menu, shown when wrapping or in a grid: Start, Center, End, Space between, Stretch                                                                                                                                       | `align-content`                                                                | Auto or space between, when wrapping                       |
| Gap              | One field, or columns and rows when wrapping or in a grid (today)                                                                                                                                                        | `gap`, `row-gap`, `column-gap`                                                 | Gap; row gap when wrapping                                 |
| Columns and rows | A grid's track lists: one row per track, each sized in fr, px, %, auto, `min-content`, `max-content`, `minmax()` or `fit-content()`, with Repeat (count, auto-fill or auto-fit) and Add (today: a count of equal tracks) | `grid-template-columns`, `grid-template-rows`                                  | Grid tracks: fixed, fr or hug; no `minmax()` or auto-fill  |

Tracks are also edited on the canvas, as Figma's grid is: a track's size label sits on its edge, and dragging between
tracks resizes them. Repeat's auto-fit is the grid that fits as many columns of at least a width as there's room for,
`repeat(auto-fit, minmax(16rem, 1fr))`, which Figma has no way to say. When the layout is reversed, the alignment box
stays as it looks: its top-left spot is the top left, and the editor writes `flex-end` where a reversed row needs it.
**More:** Areas (named and painted over the grid on the canvas), Flow (rows or columns, and Dense), the size of tracks
made by overflow (`grid-auto-rows`, `grid-auto-columns`), Dividers between items (the gap's color, width and style,
Chromium only), Text columns (count, width, the rule between them) and Size container (lets modes ask this layer's width
rather than the screen's).

## Size

Shows for every layer. A layer inside a flex or grid layout also gets the rows that place it there.

| Row           | Control                                                                                                        | Writes                                                                                         | Figma                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Width, Height | Length field with Fixed, Fill, Hug and Auto (today), and a unit menu with the keywords                         | `width`, `height`; Fill along a flex parent is `flex: 1 1 0%`, across it `align-self: stretch` | W and H with Fixed, Hug, Fill                                   |
| Min and max   | Four fields (today)                                                                                            | `min-width`, `max-width`, `min-height`, `max-height`                                           | Min and max width and height                                    |
| Aspect ratio  | A lock and a ratio field (`16 / 9`), with aspect tokens                                                        | `aspect-ratio`                                                                                 | Lock aspect ratio, which holds while resizing but isn't written |
| Align self    | Menu (today, in flex)                                                                                          | `align-self`, and `justify-self` in a grid                                                     | Stretch only; a grid child aligns in its cell                   |
| Span          | Columns and rows spanned, or All (today, in a grid); start lines beside them; end lines and an area under More | `grid-column`, `grid-row`, `grid-area`                                                         | Grid auto layout's spans                                        |
| Resizing      | Text only: Auto width, Auto height, Fixed (today)                                                              | `width: max-content`, and width and height as above                                            | Text resizing                                                   |

A field showing Hug, Fill or Auto has the layer's measured size as its placeholder, as Width does today. The ratio field
offers named ratios (Square, 4:3, 16:9, 21:9) as Webflow's does. **More:** Grow, shrink and basis, as Webflow's presets
(Shrink if needed, Grow if possible, Don't shrink or grow) with numbers under Custom; Order, as First, Last or a number;
Box sizing; and Grow with the text (inputs and text areas, `field-sizing`).

## Spacing

Shows for every layer. Padding and margin are one box-model widget: margin's box around padding's box around the layer.

| Row     | Control                                                                                                                               | Writes                  | Figma                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- |
| Padding | The inner box: a field on each side; type or scrub one; Alt changes the opposite side too, Shift all four (today: two or four fields) | `padding` and its sides | Auto layout's padding |
| Margin  | The outer box, the same way; takes `auto` and negatives                                                                               | `margin` and its sides  | None                  |

Each box writes the shortest form that says it: one value, two, or four. A Logical switch under More writes the sides by
writing direction (`padding-inline`, `margin-block`) for designs that also read right to left. Hovering a side
highlights it on the canvas, as the padding hatch does.

## Appearance

Shows for every layer.

| Row          | Control                                                                    | Writes                                | Figma                              |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| Visible      | The eye in the section's title: Shown, Hidden (keeps its space), Removed   | `visibility: hidden`, `display: none` | The eye in Layers                  |
| Opacity      | Percentage field, with opacity tokens (today)                              | `opacity`                             | Layer opacity                      |
| Blend mode   | Menu, each mode previewed on the canvas while pointed at                   | `mix-blend-mode`                      | Layer blend mode                   |
| Radius       | One field, or four around a drawn corner; Full (today: one, as a token)    | `border-radius` and its corners       | Corner radius, independent corners |
| Corner shape | Smoothing slider, and a menu: Round, Squircle, Bevel, Scoop, Notch, Square | `corner-shape`, Chromium only         | Corner smoothing                   |
| Clip content | A toggle, and a menu: Clip, Scroll, Scroll when needed (today: a menu)     | `overflow`, and each axis under More  | Clip content                       |

Clip content writes `overflow: clip` rather than today's `hidden`: it clips the same, but doesn't make a scroll
container, so a sticky layer inside still sticks. Framer made the same change in August 2025. Figma's smoothing and
CSS's `superellipse()` are different curves, so smoothing is labelled with what it writes and a design brought over from
Figma looks close rather than the same. A corner shape keeps its radius, which browsers without `corner-shape` draw
instead, as Framer's squircle does. Figma's "pass through" blend is CSS's default; Normal with a group's blend kept
inside is `isolation: isolate`. **More:** Isolation, Clip path (inset, circle, ellipse or polygon, drawn on the canvas),
Mask (an image or a gradient, such as fading an edge) and Color scheme (light or dark form controls and scrollbars).

## Fill

Shows for every layer but text, whose color is Type's. A stack of fills, the top one first, as in Figma.

| Row       | Control                                                                                                                     | Writes                                                                              | Figma                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Each fill | A swatch, the fill's type and value, its opacity, the eye and −; the swatch opens the paint editor (today: one color token) | the bottom solid color as `background-color`, the rest as `background-image` layers | Fills: solid, linear, radial, angular and diamond gradients, image, video, pattern, shader |

The paint editor has a tab for each type:

- **Solid:** the color popover, with Custom and Tokens tabs (see design-options.md).
- **Linear, Radial and Conic:** a bar of stops under the color square (click to add, drag off to remove, each stop a
  color and a position), and handles on the canvas: an angle line for linear, a center and size for radial (circle or
  ellipse, to the closest side or the farthest corner), a center and start angle for conic. A Repeat toggle writes
  `repeating-*-gradient`, and an Interpolation menu writes the color space it blends in (`in oklch` keeps a blue to
  yellow gradient bright through the middle). Gradient tokens are offered here.
- **Image:** the project's images (`public/images/`) and Replace; Fill, Fit, Crop and Tile, written as
  `background-size: cover`, `contain`, a size and position, or a size with `background-repeat`; a nine-spot position;
  and Fixed, which stays put as the page scrolls (`background-attachment: fixed`).

Each fill's own blend mode writes `background-blend-mode`, and its clip (Border, Padding, Content, Text) writes
`background-clip`. Figma's diamond gradient has no CSS and isn't offered. Figma's image adjustments apply to a whole
layer in CSS (`filter`), so they're in Image for image layers and in Effects for the rest.

## Stroke

Shows for every layer but text.

| Row      | Control                                                                                        | Writes                                                                  | Figma                                     |
| -------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Color    | Swatch and color popover (today: a token)                                                      | `border-color`, or the ring's or outline's                              | Stroke paint                              |
| Width    | One field, or four around a drawn box (today: 1, 2, 4 or 8)                                    | `border-width` and its sides                                            | Stroke weight, per side                   |
| Style    | Menu: Solid, Dashed, Dotted, Double; Groove, Ridge, Inset and Outset under More (today: three) | `border-style`                                                          | Dash and gap lengths, or a custom pattern |
| Position | Menu: In layout, Inside, Outside, Center (see design-options.md's call 2)                      | `border`, an inset ring, `outline`, or `outline` with a negative offset | Inside, center, outside                   |

Each side's own color and style are under More, beside Outline, which a layer with a border can still have (a focus
ring). Rings are `box-shadow` layers, so a ring shows here and the shadows in Effects, and both are written as one
`box-shadow`. Figma's dash and gap lengths, caps and joins have no CSS for a box's border; they're the Icon section's
for SVG strokes. A gradient stroke is `border-image` or a padded gradient fill behind the layer, through the CSS row.

## Effects

Shows for every layer. A stack of effects, added from + as in Figma.

| Effect             | Control                                                                  | Writes                                           | Figma                                                                                         |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Drop shadow        | X, Y, blur, spread, color; shadow tokens (today: one shadow token)       | `box-shadow`; on text, `text-shadow` (no spread) | Drop shadow                                                                                   |
| Inner shadow       | The same, inside                                                         | `box-shadow: inset …`                            | Inner shadow                                                                                  |
| Drop shadow, shape | X, Y, blur, color: follows what's drawn, not the box                     | `filter: drop-shadow()`                          | Figma's shadows follow vectors and unfilled frames; Dev Mode writes this for icon-like frames |
| Layer blur         | Blur, with blur tokens                                                   | `filter: blur()`                                 | Layer blur                                                                                    |
| Background blur    | Blur, with backdrop blur tokens                                          | `backdrop-filter: blur()`                        | Background blur                                                                               |
| Adjust             | Sliders: brightness, contrast, saturation, grayscale, sepia, hue, invert | `filter` functions, in the stack's order         | Image adjustments only                                                                        |
| Adjust behind      | The same sliders, for what's behind                                      | `backdrop-filter` functions                      | None                                                                                          |

Figma's noise, texture and glass effects and its progressive blur have no CSS of their own. A progressive blur can be
built from a background blur and a gradient mask, which the panel could offer as a preset once masks are in. Figma's
background blur radius is twice CSS's, Figma's staff say, so a design brought from Figma halves it.

## Transform

Shows for every layer.

| Row    | Control                                                         | Writes                 | Figma                                                   |
| ------ | --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| Rotate | Angle field with a dial, and the canvas's rotate handle         | `rotate`               | Rotation, counter-clockwise, so Dev Mode flips its sign |
| Move   | X and Y fields, in any length                                   | `translate`            | None: X and Y move the layer                            |
| Scale  | Percentage, X and Y linked or not; Flip horizontal and vertical | `scale`, flips as `-1` | Flip only                                               |
| Origin | Nine-spot box, and X and Y under More                           | `transform-origin`     | A rotation origin, moved while rotating                 |

These move how a layer is drawn, not where the layout puts it, so nothing around it moves: the panel says so under the
section's title the first time it's used. **More:** Skew and the full transform list in its order, and 3D: the
perspective a parent gives what's inside it, rotating about X and Y, whether the back shows, and keeping children in 3D
(`transform-style`). Perspective tokens are offered there.

## Type

Shows for text, and for layouts as "Text inside", as today.

| Row              | Control                                                                                                                                                              | Writes                                                               | Figma                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Text style       | Picker of the project's text styles, which set the rows below at once (PAR-135)                                                                                      | the rows' properties, or a class                                     | Text styles                                                                                          |
| Font             | Searchable list in each font (today: a token)                                                                                                                        | `font-family`                                                        | Font family                                                                                          |
| Weight and style | Menu of the weights and italics the font has, from its `@font-face` or its axes (today: nine weights and an Italic toggle)                                           | `font-weight`, `font-style`                                          | Font style                                                                                           |
| Size             | Length field with font size tokens, px, rem and `clamp()` (today: a token)                                                                                           | `font-size`                                                          | Size                                                                                                 |
| Line height      | Field: Auto, a multiple, px or %; leading tokens (today: a token)                                                                                                    | `line-height`                                                        | Line height                                                                                          |
| Letter spacing   | Field in em, % or px; tracking tokens (today: a token)                                                                                                               | `letter-spacing` (Figma's 5% is `0.05em`)                            | Letter spacing                                                                                       |
| Color            | Solid or gradient (today: a token)                                                                                                                                   | `color`; a gradient is `background-clip: text` with transparent text | Text fill                                                                                            |
| Align            | Left, Center, Right, Justify (today)                                                                                                                                 | `text-align`                                                         | Horizontal alignment                                                                                 |
| Align down       | Top, Middle, Bottom, for text with a fixed height                                                                                                                    | `align-content`                                                      | Vertical alignment                                                                                   |
| Vertical trim    | Standard, or Cap height to baseline                                                                                                                                  | `text-box: trim-both cap alphabetic`                                 | Vertical trim, which Dev Mode writes in an old draft syntax                                          |
| Decoration       | Underline, Strikethrough and Overline toggles, and a popover: style (solid, double, dotted, dashed, wavy), color, thickness, offset, skip ink (today: the first two) | `text-decoration-*`, `text-underline-offset`                         | Underline and strikethrough, with style (solid, wavy, dotted), color, thickness, offset and skip ink |
| Case             | As typed, Uppercase, Lowercase, Title case, Small caps (today: the first four)                                                                                       | `text-transform`, `font-variant-caps`                                | Case, with small caps                                                                                |
| Wrap             | Wrap, Balance, Pretty, No wrap                                                                                                                                       | `text-wrap`                                                          | Wrap style: Auto, Balance, Pretty (2026)                                                             |
| Truncate         | Max lines, with an ellipsis (today)                                                                                                                                  | `line-clamp`, or `text-overflow` for one line                        | Truncate text, max lines                                                                             |

**More:** Word spacing, Paragraph indent, Breaking (`word-break`, `overflow-wrap`, hyphens), OpenType (number styles,
fractions, ligatures, superscript and subscript, stylistic sets, as Figma's Details does), Variable axes (a slider per
axis the font has), Direction and writing mode, Inline alignment (`vertical-align`), List markers, and Outline
(`-webkit-text-stroke`). Figma's paragraph spacing is the gap of a layout of paragraphs, or `margin-block` on each, not
a property of one text layer.

## Image

Shows for images, videos and other replaced elements.

| Row         | Control                                          | Writes            | Figma                 |
| ----------- | ------------------------------------------------ | ----------------- | --------------------- |
| Source      | The project's images, and Replace                | `src`             | Image fill            |
| Fit         | Fill, Fit, Stretch, Original size, Shrink to fit | `object-fit`      | Fill, Fit, Crop, Tile |
| Position    | Nine-spot box, and X and Y                       | `object-position` | Crop                  |
| Adjustments | Exposure, contrast, saturation, hue              | `filter`          | Image adjustments     |

Alt text is the Accessibility tab's. **More:** Crop (`object-view-box`, Chromium only) and Rendering (pixelated, for
pixel art). Figma's temperature, tint, highlights and shadows have no CSS filter.

## Icon

Shows for icons and other SVGs placed as layers.

| Row          | Control                                          | Writes                                      |
| ------------ | ------------------------------------------------ | ------------------------------------------- |
| Color        | Color popover; follows the text color by default | `color`, which `currentColor` icons draw in |
| Stroke width | Number field, with border width tokens           | `stroke-width`                              |

**More:** a fill and stroke of its own, for an SVG that doesn't draw in `currentColor`.

## Interaction

Shows for every layer, closed until something in it is set.

| Row                 | Control                                        | Writes                 |
| ------------------- | ---------------------------------------------- | ---------------------- |
| Cursor              | Menu with each cursor drawn, and cursor tokens | `cursor`               |
| Clicks pass through | Toggle                                         | `pointer-events: none` |

**More:** Text selection, Accent and caret colors for form controls, Resize handle, Native look (`appearance`),
Scrolling (smooth, overscroll, scrollbar width, color and gutter) and Scroll snap (on a layout, how it snaps; on a
child, where it lands).

## Motion

Shows for every layer, closed until something in it is set.

| Row         | Control                                                                                                                               | Writes       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Transitions | A list: what changes (All, Colors, Opacity, Transform, Shadow, or a property), duration, easing, delay                                | `transition` |
| Animation   | The project's `@keyframes` and animation tokens, previewed as the Tokens panel does; duration, easing, delay, repeat, direction, fill | `animation`  |

A transition matters once a state changes something, so when a state's change has none, the section offers one.
Duration, easing and animation tokens are offered here, and the easing field is the curve the Tokens panel draws.
**More:** Animate to auto sizes (`interpolate-size`), Play on scroll (a scroll or view timeline and its range) and View
transition name.

## CSS

Always the last section. A list of declarations, one a row, `property: value`, with + to add one.

- **Completion** of property names from the ledger, with each one's Baseline mark, and of values from what the property
  takes: its keywords, and tokens, written as `var()`.
- **Checked as typed** with `CSS.supports`, after filling in tokens, as the token editor checks values (PAR-569). A
  property a control owns opens that control instead.
- **Tokens set here:** custom properties set on the layer, which change a token's value for this layer and everything
  inside it, as a theme does for a whole frame.
- **From the component's code,** read-only: what a component's own classes set on its root, so a designer can see why it
  looks as it does without opening the file.

Pseudo-elements (`::placeholder`, `::selection`, `::marker`, `::before`) aren't layers, so they're not here yet; the
three whose colors are designed most often could join States later.
