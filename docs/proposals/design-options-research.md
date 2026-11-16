# Design options: what other tools offer

Part of [design-options.md](design-options.md) (PAR-652). What Figma, pen.dev, Webflow and Framer offer in their design
panels, how Penpot and Tokens Studio for Figma model design tokens, and what the tools that write code (Onlook, Plasmic,
Subframe, Builder.io and Chrome DevTools) do, researched on 2026-11-05, how each shows a value, and what Parity takes
from each. Sources are linked under each tool.

## At a glance

"Not found" means the research didn't find it in that tool's docs, not that it's surely missing.

| Capability                      | Figma                                                                    | pen.dev                        | Webflow                                  | Framer                                                                                    | Penpot                                                              | Parity today                       |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Stacked fills                   | Yes                                                                      | Yes                            | Yes, images and gradients                | No: one fill (color, gradient or image); masks stack                                      | Yes                                                                 | One color token                    |
| Linear and radial gradients     | Yes                                                                      | Yes                            | Yes                                      | Yes                                                                                       | Yes                                                                 | No                                 |
| Conic gradient                  | Angular                                                                  | Angular                        | No                                       | Yes                                                                                       | Not found                                                           | No                                 |
| Paints CSS can't draw           | Diamond, pattern, shader                                                 | Mesh, shader                   | None                                     | None                                                                                      | None                                                                | None                               |
| Color models                    | Hex, RGB, HSL, HSB, CSS (OKLCH typed)                                    | Hex                            | Hex, RGBA                                | P3 picker                                                                                 | Hex, RGB, HSV                                                       | Tokens only                        |
| Layer blend mode                | Yes                                                                      | No                             | Yes                                      | Yes                                                                                       | Yes                                                                 | No                                 |
| Radius per corner               | Yes                                                                      | Yes                            | Yes                                      | Yes                                                                                       | Yes                                                                 | No                                 |
| Corner smoothing or shape       | Smoothing                                                                | No                             | No                                       | Squircle (`corner-shape`)                                                                 | Not found                                                           | No                                 |
| Border per side                 | Width                                                                    | Width                          | Width, style and color                   | Width; one style (solid, dashed, dotted, double)                                          | Width                                                               | No                                 |
| Stroke inside, center, outside  | Yes; inside counts in layout (2026)                                      | Yes                            | No                                       | No                                                                                        | Yes                                                                 | No                                 |
| Outline                         | No                                                                       | No                             | Yes                                      | Not found                                                                                 | Not found                                                           | No                                 |
| Shadows                         | Drop and inner, up to 8, spread                                          | Inner and outer, no spread     | Box (spread, inset) and text             | Box, inset, "realistic"                                                                   | Drop and inner, spread; shadow tokens                               | One shadow token                   |
| Layer and background blur       | Yes, and progressive                                                     | Yes                            | As filters                               | Yes                                                                                       | Layer blur                                                          | No                                 |
| Color adjustments on a layer    | On image fills only                                                      | No                             | Filters and backdrop filters             | Yes                                                                                       | Not found                                                           | No                                 |
| Transforms                      | Rotate and flip                                                          | Rotate and flip                | 2D and 3D                                | 2D and 3D                                                                                 | Rotate and flip                                                     | No                                 |
| Grid                            | Fixed, fr and hug tracks (2025)                                          | No                             | Tracks with min and max, areas, auto-fit | Fixed or min-and-max columns, masonry                                                     | Tracks and areas                                                    | Equal tracks only                  |
| Wrap; min and max sizes         | Yes; yes                                                                 | No; no                         | Yes; yes                                 | Yes; yes                                                                                  | Yes; yes                                                            | Yes; yes                           |
| Margin                          | No                                                                       | No                             | Yes                                      | Not found                                                                                 | Yes                                                                 | Yes                                |
| Aspect ratio                    | Lock while resizing                                                      | No                             | Yes                                      | Yes                                                                                       | Lock while resizing                                                 | No                                 |
| Sticky and fixed                | In prototypes only; Figma Sites publishes both                           | No                             | Yes                                      | Yes                                                                                       | Fixed, in prototypes                                                | No                                 |
| Z-index                         | No: layer order                                                          | No                             | Yes                                      | Yes                                                                                       | Not found                                                           | No                                 |
| Units beyond px                 | % for line height and letter spacing only                                | No                             | %, em, rem, vw, vh, dvh, ch, fr          | %, em, rem, vw, vh, fr                                                                    | No                                                                  | px, rem and % typed, kept as steps |
| `calc()`, `clamp()`             | No                                                                       | No                             | Yes, after `=`                           | No: a length is a number with a unit                                                      | No                                                                  | No                                 |
| Decoration style, color, offset | Yes                                                                      | No                             | Yes                                      | Yes                                                                                       | Not found                                                           | No                                 |
| Balance and pretty wrapping     | Yes (2026)                                                               | No                             | Only as a custom property                | Balance                                                                                   | Not found                                                           | No                                 |
| Max lines                       | Yes                                                                      | No                             | One line                                 | Yes                                                                                       | Not found                                                           | Yes                                |
| OpenType and variable axes      | Yes                                                                      | No                             | Variable axes                            | Yes                                                                                       | Not found                                                           | No                                 |
| Cursor and transitions          | Prototypes and Motion; Figma Sites: hover, press, Reveal, scroll effects | No                             | Yes                                      | Cursor; tween and spring transitions; Appear, Hover, Press, Loop, Drag and Scroll effects | Prototypes only                                                     | No                                 |
| Variable types                  | Number, color, string, boolean, easing, timing                           | Color, number, string, boolean | Color, size, percentage, number, font    | Color and text styles                                                                     | DTCG tokens, with typography and shadow composites; sets and themes | 14 categories, 29 preview kinds    |
| Where a value comes from        | Bound values marked                                                      | Bound values purple            | Every label colored by source            | Overrides marked                                                                          | Not found                                                           | Reset arrow on changed rows        |
| Any CSS declaration             | No                                                                       | No                             | Custom properties                        | Not found                                                                                 | No                                                                  | No                                 |

## How each tool shows a value

The table above compares what each tool can do. This one compares how each shows a value in its fields, from the same
sources and from Chrome DevTools' [CSS reference](https://developer.chrome.com/docs/devtools/css/reference). Framer's
cells come from its academy and its [plugin API types](https://www.npmjs.com/package/framer-plugin) (3.10.3:
`ColorStyle`, `Shadow`, `BorderRadius`, `Length`, the gradients' `angle`), which give what a field holds rather than how
it's drawn. "Not checked" means the research didn't check that tool's fields for it; nothing here is inferred.

| Value type                    | Figma                                                                                                                                                                                                                | Framer                                                                            | Webflow                               | Chrome DevTools                           | Parity                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| Token in a field              | A pill, detached before it's typed over                                                                                                                                                                              | A color style in place of the color, with a light and a dark value                | Its label in purple                   | `var()` as text, linked to its definition | A chip that can be typed over, with Detach beside it                   |
| Unit                          | px only; % for line height and letter spacing                                                                                                                                                                        | %, em, rem, fr, vw and vh where a field takes them                                | A unit menu, with keywords            | Typed as text                             | px, % and rem in a menu, the rest under More units                     |
| Keyword                       | Words (Hug, Fill, Auto)                                                                                                                                                                                              | Words (Fit Content, Fill, Relative, Fit Image)                                    | In the unit menu (`auto`, `none`)     | As written                                | In words, the keyword in the hint                                      |
| Expression                    | Maths worked out when typed                                                                                                                                                                                          | None: a length is a number with px, rem, em, %, fr, vw or vh                      | `=` opens a function editor           | As written                                | The function and its result; the text, with token chips, while focused |
| Mixed                         | Mixed                                                                                                                                                                                                                | Not checked                                                                       | Not checked                           | One element at a time                     | Mixed, typeable after; a split swatch                                  |
| Unset                         | Never unset: every field holds a value                                                                                                                                                                               | Not checked                                                                       | The inherited value, its label orange | Not in Styles; in the Computed tab        | The computed value, muted                                              |
| Invalid input                 | Restored                                                                                                                                                                                                             | Not checked                                                                       | Not checked                           | Struck through, with a warning            | Kept, outlined, with the reason                                        |
| Does nothing                  | Not shown                                                                                                                                                                                                            | Not checked                                                                       | Not checked                           | Dimmed, with the reason                   | Dimmed, with the reason                                                |
| Not in every browser          | Not applicable: Figma draws its own model                                                                                                                                                                            | Not checked                                                                       | Not checked                           | Not checked                               | † after the property or value                                          |
| Color at rest                 | Hex, or the model chosen                                                                                                                                                                                             | A color style, or an RGBA value                                                   | Hex or RGBA                           | As written, with a swatch                 | The value's own model, short; its alpha as a %                         |
| Angle                         | Degrees, normalized to −180 to 180                                                                                                                                                                                   | A number of degrees, for rotation and a gradient's angle                          | Not checked                           | An angle clock                            | Degrees as typed, with a dial                                          |
| Shadow                        | A row that opens a settings popover                                                                                                                                                                                  | A list of X, Y, blur, spread, color and inset, or Realistic's diffusion and focus | A row in a stack                      | An editor with an offset pad              | A card and summary; a popover with an offset pad                       |
| Easing                        | A bezier editor and springs (stiffness, damping, mass) in prototype transitions ([source](https://help.figma.com/hc/en-us/articles/360051748654-Prototype-easing-and-spring-animations)); easing variables in Motion | Tween curves and springs                                                          | An easing editor                      | A curve editor                            | A curve and its name; curve, steps and spring                          |
| Four corners when they differ | Mixed                                                                                                                                                                                                                | Four px values, or one value in px or %                                           | Not checked                           | The shorthand as written                  | Four fields in a 2 × 2 grid                                            |

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
behaves like CSS flexbox by default ("layout version"), including the border-box model. Inside strokes count in layout
like a CSS border, center and outside strokes are drawn like an outline and don't, a frame can't shrink below its
padding, and Fill children share space by their content area. Frames made before then keep the legacy version until
they're updated, and can switch until January 2027 ([help center](https://help.figma.com/hc/articles/42031586813719)).

**Paint.** Fills and strokes stack, each with its own opacity and blend mode: solid, linear, radial, angular and diamond
gradients (stops and an on-canvas transform, no angle field or interpolation), image (Fill, Fit, Crop, Tile, with
exposure, contrast, saturation, temperature, tint, highlights and shadows), video, a pattern from another layer, and
shaders (2026). The picker has Custom and Libraries tabs, Hex, RGB, CSS, HSL and HSB models (OKLCH and P3 can be typed
in the CSS model; OKLCH isn't a picker model, which Figma's forum still listed as a request in September 2026), an
eyedropper and a contrast checker. Strokes are inside, center or outside, per side in weight, with dash patterns, caps,
joins, width profiles and brushes.

**Effects.** Up to eight drop and inner shadows (X, Y, blur, spread, color, blend), one layer blur and one background
blur (each normal or progressive), noise, texture, glass (2025) and shaders. Dev Mode writes `box-shadow`, `text-shadow`
on text, and `filter: drop-shadow` for icon-like frames; glass gets nothing.

**Figma Sites** (2025) publishes designs as HTML and CSS, with breakpoints, fixed and sticky placement, and interactions
(hover, press, Reveal, scroll parallax, scroll transform, marquee). It's Figma's closest product to Parity, but its
panel is Figma Design's, so what CSS has and Figma lacks still has no control there.

**Type.** Font, style, size, line height (auto, px, %), letter spacing (px, %), paragraph spacing and indent, horizontal
and vertical alignment, auto width, auto height or fixed, truncation with max lines, case (with small caps), underline
and strikethrough with style, thickness, offset, skip ink and color, vertical trim, wrap style (Auto, Balance, Pretty,
2026), lists, hanging punctuation, OpenType features and variable axes (2026).

**Variables** are numbers, colors, strings and booleans, plus easing and timing for Motion (2026), and each can be
limited to the fields it fits by 23 scopes: corner radius, width and height, gap, opacity, a color's opacity, stroke and
effect numbers, each font property, and fills by what they fill (frames, shapes, text). Positions, rotation, smoothing,
blend modes, gradient geometry, layout enums, grid tracks and alignment can't be bound.

**What CSS can do and Figma's Design panel can't:** sticky and fixed placement, z-index, scrolling, margins, grow ratios
and order, `minmax()` and areas, units other than px (and % in type), `calc()` and `clamp()`, transforms beyond
rotation, filters on layers, isolation as its own setting, repeating gradients and their color space, background size
and position per layer, `object-fit`, outline, double and groove borders, `corner-shape`, `clip-path`, `visibility` that
keeps a layer's space, writing direction, hyphens and word breaking, columns, floats, cursor, transitions, scroll snap
and form control colors.

**What Figma does that CSS can't:** diamond gradients, pattern and shader paints, stacked strokes, gradient strokes
other than an inside one (Parity draws that as a border over a gradient layer,
[design-options-panel.md](design-options-panel.md), Stroke), dash lengths, caps and width profiles on a box, noise,
texture and glass, progressive blur (a mask and a backdrop blur come close), temperature, tint, highlights and shadows
on images, and text on a path. Corner smoothing comes close with `corner-shape`.

**Take:** the names designers know, Auto gap, the alignment box with baseline, stacked paints and effects, each + adding
the usual entry at once, the picker's contrast checker, scopes for variables, Hug and Fill, and the updated layout
version's strokes, which Parity's Stroke and Fill already match. **Leave:** paints and effects CSS can't draw, and a
model where scrolling and sticky are prototype settings rather than the design's.

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

**Take:** stacked paints with a blend mode each, and Fill and Hug as plain words. **Leave:** a model that's a second,
smaller copy of CSS. Everything pen.dev can't say is a property its own format has no key for, which is the gap Parity
avoids by writing CSS.

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
- **Flex and grid in full:** display as a labeled segment, wrap and reverse as plain-language options ("Wrap down",
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
  and breakpoints cascade from desktop, each shown by the label colors, and, on Collection items, First, Last, Odd and
  Even
  ([help center](https://help.webflow.com/hc/en-us/articles/33961406388243-Style-first-last-odd-even-items-in-your-CMS)).

**Take:** the label colors, the box-model widget (with Figma's keys: Alt for the opposite side, Alt+Shift for all four),
units and keywords in one menu, `=` for an expression, plain-language presets with the CSS beneath, and controls that
add what they need. **Leave:** a class-first model, where styling an element means naming a class first; Parity's layers
carry their own styles.

## Framer

From Framer's [academy](https://www.framer.com/academy), its plugin API's types, which list the values its panel offers,
and its [updates](https://www.framer.com/updates).

- **Layout** is None, Stack or Grid. A stack has direction, distribution (including space evenly), alignment, wrap, gap
  and padding; a grid has counts, fixed or min-and-max columns, and, since 2025 and 2026, masonry and bento layouts.
  Masonry has no CSS that Chromium 156 draws. None of grid lanes' properties (`flow-tolerance`) is among its 562, and
  `display: grid-lanes` shipped in Safari 26.4 (March 2026) but is still behind a flag in Chrome
  ([caniuse](https://caniuse.com/css-grid-lanes)). So Parity can't offer it yet. It joins Layout's Type when Chromium
  ships it.
- **Each axis has a sizing mode:** Fixed, Relative (% of the parent), Fill (a share of what's left), Fit Content,
  Viewport, or Fit Image, and Framer refuses a Fit parent with a Fill child on the same axis rather than drawing
  nothing.
- **Position** is relative, absolute, fixed (at page level only) or sticky, pinned on any side or centered, with
  z-index.
- **Overflow's default became Clip** in August 2025: Hidden makes a scroll container, which breaks sticky children.
- **Styles:** one fill, a P3 color, an image, or a linear, radial or conic gradient; a radius per corner; a squircle
  (December 2025) that writes `corner-shape` with a radius for browsers without it; borders with style; shadows, inset,
  and a "realistic" shadow that layers itself from diffusion and focus; stacked gradient and image masks; filters, blur,
  blending, cursor, pointer events and user select; 3D transforms.
- **Text:** styles per breakpoint, case, decoration with style, color, thickness and offset, balance, truncation by
  lines, OpenType features with a live preview, variable axes, and paragraph spacing.
- **Effects:** Appear (fade, slide, scale, blur), Hover, Press, Loop, Drag and Scroll (scroll-linked transforms and
  parallax), each with a tween or a spring (stiffness, damping and mass, or time and bounce).

**Take:** Clip as the default, the squircle with its fallback, conflicts named with their reason (Parity writes them and
says so rather than refusing, [design-options-panel.md](design-options-panel.md), Size), OpenType with a preview,
effects named by what triggers them, and springs. **Leave:** a hosted runtime that owns the page.

## Penpot

From Penpot's [design tokens guide](https://help.penpot.app/user-guide/design-tokens/). Penpot is the open-source design
tool whose layouts are CSS flex and grid.

- **Tokens are native and DTCG** (2025): color, dimension, sizing, spacing, border radius, stroke width, opacity,
  rotation and number, the type values one by one (line height only inside a typography token), and composite typography
  and shadow tokens. They follow the Design Tokens Format Module, so they're exported and read by other tools without
  conversion.
- **Tokens apply to properties by type.** A click applies a token where its type usually goes (a color as a fill, a
  spacing token to every gap), and a right-click picks another property of that type (stroke, padding, margin, one
  corner, one side).
- **Sets and themes.** Sets group tokens, and a later set overrides a token of the same name in an earlier one. Themes
  choose which sets are on, and work along several axes at once (mode and brand), one theme per group, the model Tokens
  Studio uses.
- **Composite typography** groups the text values into one token, each part a token or a value, and applies to a whole
  text layer.

**Take:** tokens applied by type, and themes along several axes. **Leave:** line height only inside the composite
typography token, which Tailwind's paired `--text-*--line-height` doesn't need.

## Tokens Studio for Figma

From [Tokens Studio's docs](https://docs.tokens.studio/), including
[color modifiers](https://docs.tokens.studio/manage-tokens/token-types/color/modified). A Figma plugin that many
design-systems teams keep their tokens in.

- **Sets and themes across several axes,** as Penpot's are, each theme a choice of sets.
- **Composite tokens:** typography, border and shadow, each applied as a whole.
- **Modifiers** on a color token (lighten, darken, mix and alpha), kept in `$extensions["studio.tokens"]` and resolved
  when the tokens are exported.

**Take:** themes across several axes, and composite tokens applied as a whole, with a part overridden only where the
framework can do it.

## Tools that write code

These start from code rather than a canvas of their own, and show what developers expect from a panel that edits it.

**Onlook** puts a visual editor over the project's own Next.js and Tailwind app: an edit is made in the running page,
then written into the project's source as Tailwind classes. It instruments the code to map each element to its place in
the source, and a right-click opens that line. Its style toolbar covers alignment, type, opacity, width and height, and
borders by side (width, style and color). Its README says it manages brand assets and tokens, without saying how. From
its [repository](https://github.com/onlook-dev/onlook) and [docs](https://docs.onlook.com).

**Plasmic** has [style tokens](https://docs.plasmic.app/learn/tokens/) (color, spacing, font family, size, line height
and opacity), which can vary by global variant and reach code as CSS variables.
[Interaction variants](https://docs.plasmic.app/learn/variants/) (hovered, pressed, focused, disabled) style a
component's states, and [element variants](https://docs.plasmic.app/learn/element-states) style one element by any CSS
selector (`:hover`, `:first-child`). Its code arrives either as
[generated React files in the repository or through a loader at runtime](https://docs.plasmic.app/learn/loader-vs-codegen/).

**Subframe** [exports its theme](https://docs.subframe.com/learn/theme/exporting-theme) as a `theme.css` imported after
Tailwind v4, and components come in through its sync command.
[Sync goes one way](https://docs.subframe.com/syncing-components): edits to a synced component's code are overwritten on
the next sync, unless the file opts out.

**Builder.io** has a Visual Editor whose [Style tab](https://www.builder.io/c/docs/visual-editor-style-tab) takes custom
CSS properties per element, and [Fusion](https://www.builder.io/c/docs/key-concepts-fusion), which edits a project's
repository and [opens pull requests](https://builder.io/c/docs/fusion-create-a-pull-request). Webflow's
[DevLink](https://developers.webflow.com/devlink) and code export are one-way too.

**Chrome DevTools' Styles pane** dims declarations that have no effect and says why
([DevTools 108](https://developer.chrome.com/blog/new-in-devtools-108)), has a checkbox per declaration, strikes through
overridden declarations, traces each value to its rule in the Computed tab, and has shadow, easing, font and color
editors, the color one with contrast ([CSS reference](https://developer.chrome.com/docs/devtools/css/reference)).

**Take:** hints for values that do nothing, what each value comes to (the Computed tab), shown in Parity's field,
turning a declaration off without deleting it, Paste CSS, open in code, and states written as selectors. **Leave:** code
that's generated once, then overwritten (Subframe), and shared classes or mixins (Webflow classes, Plasmic mixins):
styles shared by several layers are a component design or a token, so a layer's classes are always its own.

## Bringing a design from Figma

What Parity writes for what Figma draws differently. Each one is noted on the layer it changes.

| Figma                                         | Parity writes                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Rotation, counter-clockwise                   | Rotation with its sign flipped, as Dev Mode does                                                                                 |
| Layer and background blur                     | Half the radius (below)                                                                                                          |
| A text layer's fill                           | Text's Color; a gradient fill as the gradient Color                                                                              |
| A text layer's stroke                         | Text's Outline (`-webkit-text-stroke`, with `paint-order` for Outside)                                                           |
| Gradient handles                              | Stop positions on CSS's gradient line, which spans the box: a gradient drawn across the middle half has stops at 25% and 75%     |
| A rotated radial gradient                     | Drawn unrotated, with a note, since CSS can't rotate a radial gradient's ellipse                                                 |
| A gradient's interpolation                    | `in srgb` (`/srgb`), so it matches                                                                                               |
| A shadow with "Show behind transparent areas" | Follow shape (`drop-shadow()`), since CSS never draws a box shadow under the box                                                 |
| Legacy layout's "Strokes included in layout"  | Include in layout, as set                                                                                                        |
| Diamond gradient                              | Not offered: it has no CSS                                                                                                       |
| An HSB color                                  | Hex                                                                                                                              |
| Corner smoothing                              | Corner shape (`superellipse()`), a different curve that looks close rather than the same                                         |
| Image exposure                                | Brightness, the closest; temperature, tint, highlights and shadows have no CSS filter and are dropped with a note                |
| Image adjustments                             | One Adjustments entry on the layer's `filter` (Image on an image layer, Effects otherwise), noted as applying to the whole layer |

Figma's blur radius is about twice CSS's. Dev Mode halves both layer and background blur, as Figma's staff said in 2023
and 2024 forum threads; Bjango's measurements put the match nearer 0.44, so halving is close but not exact.

## What Parity takes

| Idea                                                                                                                                                                                                                                         | From                     | Where in the plan                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| Labels colored by where a value comes from                                                                                                                                                                                                   | Webflow                  | design-options.md, principle 6                              |
| Box-model widget (Webflow); Alt for the opposite side, Alt+Shift for all (Figma)                                                                                                                                                             | Webflow, Figma           | Spacing                                                     |
| Units and keywords in one menu; `=` opens an expression                                                                                                                                                                                      | Webflow                  | design-options-values.md, Length and percentage; Expression |
| Plain-language presets with the CSS under them                                                                                                                                                                                               | Webflow, Figma           | Size, Position                                              |
| Controls that add the properties they need                                                                                                                                                                                                   | Webflow                  | design-options.md, principle 8                              |
| Stacks of fills, shadows, filters, transforms and transitions                                                                                                                                                                                | Figma, Webflow, pen.dev  | Fill, Effects, Transform, Motion                            |
| Clip content as `overflow: clip`                                                                                                                                                                                                             | Framer                   | Appearance                                                  |
| Corner shape with a radius to fall back on                                                                                                                                                                                                   | Framer                   | Appearance                                                  |
| Variables limited to the fields they fit                                                                                                                                                                                                     | Figma, Webflow           | design-options-tokens.md, Fields and token kinds            |
| Effects named by their trigger, and springs                                                                                                                                                                                                  | Framer, Figma Sites      | Motion; design-options-values.md, Easing and spring         |
| Classes edited in the project's own source, open in code                                                                                                                                                                                     | Onlook                   | design-options-code.md, What's written reads back; CSS      |
| Values that do nothing dimmed, with the reason                                                                                                                                                                                               | Chrome DevTools          | design-options.md, principle 10                             |
| What each value comes to (DevTools' Computed tab, Webflow's inherited value in an unset field), shown in its field (in the hint in a narrow one)                                                                                             | Chrome DevTools, Webflow | design-options-fields.md, The field                         |
| A checkbox to turn a declaration off                                                                                                                                                                                                         | Chrome DevTools          | CSS                                                         |
| Overridden values struck through                                                                                                                                                                                                             | Chrome DevTools          | CSS, From the component's code                              |
| States as selectors and attributes                                                                                                                                                                                                           | Plasmic, Webflow         | design-options.md, call 7; design-options-code.md, States   |
| Paste CSS or classes onto a layer                                                                                                                                                                                                            | Chrome DevTools          | design-options.md, principle 1; CSS                         |
| Fill as a share (1fr, 2fr)                                                                                                                                                                                                                   | Framer                   | Size                                                        |
| States by position in a list (first, last, odd, even)                                                                                                                                                                                        | Webflow, Plasmic         | design-options-code.md, States                              |
| Themes along several axes (mode, brand, density)                                                                                                                                                                                             | Penpot, Tokens Studio    | design-options-panel.md, Appearance's Theme row             |
| Composite tokens applied as a whole, a part overridden where the framework can                                                                                                                                                               | Penpot, Tokens Studio    | design-options-tokens.md, A token can be overridden in part |
| In one field anatomy, which none of them has: what each value comes to shown in every field (in the hint in a narrow one), token chips (Detach in place of the token button) also inside expressions, and a status slot for the token system | Figma, Webflow, DevTools | design-options-fields.md                                    |
