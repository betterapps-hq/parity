# Design options: what other tools offer

Part of [design-options.md](design-options.md) (PAR-652). What Figma, pen.dev, Webflow and Framer offer in their design
panels, how Penpot and Tokens Studio for Figma model design tokens, and what the tools that write code (Onlook, Plasmic,
Subframe, Builder.io and Chrome DevTools) do, researched on 2026-11-05, and what Parity takes from each. Sources are
linked under each tool.

## At a glance

"Not found" means the research didn't find it in that tool's docs, not that it's surely missing.

| Capability                      | Figma                                                                    | pen.dev                        | Webflow                                  | Framer                                                                                    | Penpot                                                                                                                                                   | Onlook                                    | Parity today                       |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| Stacked fills                   | Yes                                                                      | Yes                            | Yes, images and gradients                | No: one fill (color, gradient or image); masks stack                                      | Yes                                                                                                                                                      | Not found                                 | One color token                    |
| Linear and radial gradients     | Yes                                                                      | Yes                            | Yes                                      | Yes                                                                                       | Yes                                                                                                                                                      | Not found                                 | No                                 |
| Conic gradient                  | Angular                                                                  | Angular                        | No                                       | Yes                                                                                       | Not found                                                                                                                                                | Not found                                 | No                                 |
| Paints CSS can't draw           | Diamond, pattern, shader                                                 | Mesh, shader                   | None                                     | None                                                                                      | None                                                                                                                                                     | None                                      | None                               |
| Color models                    | Hex, RGB, HSL, HSB, CSS (OKLCH typed)                                    | Hex                            | Hex, RGBA                                | P3 picker                                                                                 | Hex, RGB, HSV                                                                                                                                            | Not found                                 | Tokens only                        |
| Layer blend mode                | Yes                                                                      | No                             | Yes                                      | Yes                                                                                       | Yes                                                                                                                                                      | Not found                                 | No                                 |
| Radius per corner               | Yes                                                                      | Yes                            | Yes                                      | Yes                                                                                       | Yes                                                                                                                                                      | Not found                                 | No                                 |
| Corner smoothing or shape       | Smoothing                                                                | No                             | No                                       | Squircle (`corner-shape`)                                                                 | Not found                                                                                                                                                | Not found                                 | No                                 |
| Border per side                 | Width                                                                    | Width                          | Width, style and color                   | Width; one style (solid, dashed, dotted, double)                                          | Width                                                                                                                                                    | Width, style and color                    | No                                 |
| Stroke inside, center, outside  | Yes; inside counts in layout (2026)                                      | Yes                            | No                                       | No                                                                                        | Yes                                                                                                                                                      | Not found                                 | No                                 |
| Outline                         | No                                                                       | No                             | Yes                                      | Not found                                                                                 | Not found                                                                                                                                                | Not found                                 | No                                 |
| Shadows                         | Drop and inner, up to 8, spread                                          | Inner and outer, no spread     | Box (spread, inset) and text             | Box, inset, "realistic"                                                                   | Drop and inner, spread; shadow tokens                                                                                                                    | Not found                                 | One shadow token                   |
| Layer and background blur       | Yes, and progressive                                                     | Yes                            | As filters                               | Yes                                                                                       | Layer blur                                                                                                                                               | Not found                                 | No                                 |
| Color adjustments on a layer    | On image fills only                                                      | No                             | Filters and backdrop filters             | Yes                                                                                       | Not found                                                                                                                                                | Not found                                 | No                                 |
| Transforms                      | Rotate and flip                                                          | Rotate and flip                | 2D and 3D                                | 2D and 3D                                                                                 | Rotate and flip                                                                                                                                          | Not found                                 | No                                 |
| Grid                            | Fixed, fr and hug tracks (2025)                                          | No                             | Tracks with min and max, areas, auto-fit | Fixed or min-and-max columns, masonry                                                     | Tracks and areas                                                                                                                                         | Not found                                 | Equal tracks only                  |
| Wrap; min and max sizes         | Yes; yes                                                                 | No; no                         | Yes; yes                                 | Yes; yes                                                                                  | Yes; yes                                                                                                                                                 | Not found                                 | Yes; yes                           |
| Margin                          | No                                                                       | No                             | Yes                                      | Not found                                                                                 | Yes                                                                                                                                                      | Not found                                 | Yes                                |
| Aspect ratio                    | Lock while resizing                                                      | No                             | Yes                                      | Yes                                                                                       | Lock while resizing                                                                                                                                      | Not found                                 | No                                 |
| Sticky and fixed                | In prototypes only; Figma Sites publishes both                           | No                             | Yes                                      | Yes                                                                                       | Fixed, in prototypes                                                                                                                                     | Not found                                 | No                                 |
| Z-index                         | No: layer order                                                          | No                             | Yes                                      | Yes                                                                                       | Not found                                                                                                                                                | Not found                                 | No                                 |
| Units beyond px                 | No                                                                       | No                             | %, em, rem, vw, vh, dvh, ch, fr          | %, fr, vh, rem                                                                            | No                                                                                                                                                       | Not found                                 | px, rem and % typed, kept as steps |
| `calc()`, `clamp()`             | No                                                                       | No                             | Yes, after `=`                           | Not found                                                                                 | No                                                                                                                                                       | Not found                                 | No                                 |
| Decoration style, color, offset | Yes                                                                      | No                             | Yes                                      | Yes                                                                                       | Not found                                                                                                                                                | Not found                                 | No                                 |
| Balance and pretty wrapping     | Yes (2026)                                                               | No                             | Only as a custom property                | Balance                                                                                   | Not found                                                                                                                                                | Not found                                 | No                                 |
| Max lines                       | Yes                                                                      | No                             | One line                                 | Yes                                                                                       | Not found                                                                                                                                                | Not found                                 | Yes                                |
| OpenType and variable axes      | Yes                                                                      | No                             | Variable axes                            | Yes                                                                                       | Not found                                                                                                                                                | Not found                                 | No                                 |
| Cursor and transitions          | Prototypes and Motion; Figma Sites: hover, press, Reveal, scroll effects | No                             | Yes                                      | Cursor; tween and spring transitions; Appear, Hover, Press, Loop, Drag and Scroll effects | Prototypes only                                                                                                                                          | Not found                                 | No                                 |
| Variable types                  | Number, color, string, boolean, easing, timing                           | Color, number, string, boolean | Color, size, percentage, number, font    | Color and text styles                                                                     | DTCG tokens: color, dimension, sizing, spacing, radius, stroke width, opacity, rotation, number, type, typography and shadow composites; sets and themes | Brand assets and tokens, not detailed     | 14 categories, 29 preview kinds    |
| Where a value comes from        | Bound values marked                                                      | Bound values purple            | Every label colored by source            | Overrides marked                                                                          | Not found                                                                                                                                                | Each element mapped to its line in code   | Reset arrow on changed rows        |
| Any CSS declaration             | No                                                                       | No                             | Custom properties                        | Not found                                                                                 | No                                                                                                                                                       | Tailwind classes, in the project's source | No                                 |

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
and order, `minmax()` and areas, units other than px, `calc()` and `clamp()`, transforms beyond rotation, filters on
layers, isolation as its own setting, repeating gradients and their color space, background size and position per layer,
`object-fit`, outline, double and groove borders, `corner-shape`, `clip-path`, `visibility` that keeps a layer's space,
writing direction, hyphens and word breaking, columns, floats, cursor, transitions, scroll snap and form control colors.

**What Figma does that CSS can't:** diamond gradients, pattern and shader paints, stacked strokes and gradient strokes,
dash lengths, caps and width profiles on a box, noise, texture and glass, progressive blur (a mask and a backdrop blur
come close), temperature and tint on images, and text on a path. Corner smoothing comes close with `corner-shape`.

**Take:** the names designers know, Auto gap, the alignment box with baseline, stacked paints and effects with a + menu,
the picker's contrast checker, scopes for variables, Hug and Fill, and the updated layout version's strokes, which
Parity's Stroke and Fill already match. **Leave:** paints and effects CSS can't draw, and a model where scrolling and
sticky are prototype settings rather than the design's.

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
  and breakpoints cascade from desktop, each shown by the label colors, and, on Collection items, First, Last, Odd and
  Even
  ([help center](https://help.webflow.com/hc/en-us/articles/33961406388243-Style-first-last-odd-even-items-in-your-CMS)).

**Take:** the label colors, the box-model widget and its keys, units and keywords in one menu, `=` for an expression,
plain-language presets with the CSS beneath, and controls that add what they need. **Leave:** a class-first model, where
styling an element means naming a class first; Parity's layers carry their own styles.

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
- **Styles:** one fill, a P3 color or a linear, radial or conic gradient; a radius per corner; a squircle
  (December 2025) that writes `corner-shape` with a radius for browsers without it; borders with style; shadows, inset,
  and a "realistic" shadow that layers itself from elevation and focus; stacked gradient and image masks; filters, blur,
  blending, cursor, pointer events and user select; 3D transforms.
- **Text:** styles per breakpoint, case, decoration with style, color, thickness and offset, balance, truncation by
  lines, OpenType features with a live preview, variable axes, and paragraph spacing.
- **Effects:** Appear (fade, slide, scale, blur), Hover, Press, Loop, Drag and Scroll (scroll-linked transforms and
  parallax), each with a tween or a spring (stiffness, damping and mass, or time and bounce).

**Take:** Clip as the default, the squircle with its fallback, conflicts refused with a reason, OpenType with a preview,
effects named by what triggers them, and springs. **Leave:** a hosted runtime that owns the page.

## Penpot

From Penpot's [design tokens guide](https://help.penpot.app/user-guide/design-tokens/). Penpot is the open-source design
tool whose layouts are CSS flex and grid.

- **Tokens are native and DTCG** (2025): color, dimension, sizing, spacing, border radius, stroke width, opacity,
  rotation and number, the type values one by one, and composite typography and shadow tokens. They follow the Design
  Tokens Format Module, so they're exported and read by other tools without conversion.
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

**Take:** hints for values that do nothing, computed values beside each field, turning a declaration off without
deleting it, Paste CSS, open in code, and states written as selectors. **Leave:** per-element raw CSS boxes (Builder.io)
and code that's generated once, then overwritten (Subframe), and shared classes or mixins (Webflow classes, Plasmic
mixins): styles shared by several layers are a component design or a token, so a layer's classes are always its own.

## What Parity takes

| Idea                                                                             | From                     | Where in the plan                                                        |
| -------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Labels colored by where a value comes from                                       | Webflow                  | design-options.md, principle 6                                           |
| Box-model widget (Webflow); Alt for the opposite side, Alt+Shift for all (Figma) | Webflow, Figma           | Spacing                                                                  |
| Units and keywords in one menu; `=` opens an expression                          | Webflow                  | The value model                                                          |
| Plain-language presets with the CSS under them                                   | Webflow, Figma           | Size, Position                                                           |
| Controls that add the properties they need                                       | Webflow                  | design-options.md, principle 8                                           |
| Stacks of fills, shadows, filters, transforms and transitions                    | Figma, Webflow, pen.dev  | Fill, Effects, Transform, Motion                                         |
| Clip content as `overflow: clip`                                                 | Framer                   | Appearance                                                               |
| Corner shape with a radius to fall back on                                       | Framer                   | Appearance                                                               |
| Variables limited to the fields they fit                                         | Figma, Webflow           | Fields and token kinds                                                   |
| Effects named by their trigger, and springs                                      | Framer, Figma Sites      | Motion; the Easing control                                               |
| Classes edited in the project's own source, open in code                         | Onlook                   | design-options.md, read-back; CSS                                        |
| Values that do nothing dimmed, with the reason                                   | Chrome DevTools          | design-options.md, principle 10                                          |
| Computed value beside each field                                                 | Chrome DevTools, Webflow | The value model                                                          |
| A checkbox to turn a declaration off                                             | Chrome DevTools          | CSS                                                                      |
| Overridden values struck through                                                 | Chrome DevTools          | CSS, From the component's code                                           |
| States as selectors and attributes                                               | Plasmic, Webflow         | design-options.md, call 7                                                |
| Paste CSS or classes onto a layer                                                | Chrome DevTools          | design-options.md, principle 1; CSS                                      |
| Fill as a share (1fr, 2fr)                                                       | Framer                   | Size                                                                     |
| States by position in a list (first, last, odd, even)                            | Webflow, Plasmic         | design-options-panel.md, CSS (States menu)                               |
| Themes along several axes (mode, brand, density)                                 | Penpot, Tokens Studio    | design-options-panel.md, Appearance's Theme row                          |
| Composite tokens applied as a whole, a part overridden where the framework can   | Penpot, Tokens Studio    | design-options.md, One value model ("A token can be overridden in part") |
