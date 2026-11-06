# Proposal: design options that cover CSS

Status: research and a plan, 2026-11-05 (PAR-652). Nothing here is built yet. PAR-186 is building the first of these
controls, PAR-194 decides how a length off the spacing scale is kept, and PAR-143 puts token previews in the pickers;
this proposal is meant to steer all three.

## In one line

Everything a frame can draw has a place in the Design tab: controls a Figma user already knows for the common things, a
More list in each section for the rest, and a CSS row that takes any declaration. Each control is named the way
designers name it and writes the CSS a developer would, so the panel can be read as code. Each field takes a token of
the kinds the Tokens panel already draws, a value of its own, or a CSS expression, and says where its value comes from.

## The pages

- This page: the principles, the value model, how fields find tokens, what the design model needs, and the calls to
  make.
- [design-options-panel.md](design-options-panel.md): the Design tab section by section, with how each control looks and
  the CSS it writes.
- [design-options-css.md](design-options-css.md): every CSS property Chromium 156 draws (562 of them) and where each one
  goes.
- [design-options-research.md](design-options-research.md): what Figma, pen.dev, Webflow and Framer offer, control by
  control.

## Where Parity is today

The Design tab shows seven sections for a layer (Layout, Spacing, Size, Position, Appearance, Stroke and Text), from
`StyleSections.tsx`, editing the 45 keys of `NodeStyle` in `@parity-app/core`. A frame draws them as about 50 CSS
properties (`render.ts`), roughly 9% of what Chromium draws. What's there works the way Figma does: fill, hug and fixed
sizes, the nine-spot alignment box, text that sizes by auto width, auto height or fixed, and fields that scrub, step and
take maths.

What holds it back:

- **Values are locked to tokens.** A color, radius, shadow or font names a token; a length is a step of the spacing
  scale or a length token. There's no color picker, and no way to say `280px`, `#2563eb` or `clamp(1rem, 2vw, 2rem)`.
  PAR-194 opens this for lengths only.
- **One of each.** One fill, one shadow, one border color and width for every side, one radius for every corner. Figma
  stacks fills and effects and edits corners and sides on their own.
- **Whole families are missing:** gradients and images as fills, blend modes, filters and blurs, transforms, outlines,
  per-side borders, grid tracks of different sizes, sticky and fixed placement, z-index, aspect ratio, cursors,
  transitions, and most of type (decoration details, wrapping, OpenType).
- **Pickers ask by category, not by kind.** `TokenInput` filters by `TokenCategory`, of which there are 14, while the
  Tokens panel draws 29 preview kinds. Opacity, blur and border width tokens have kinds but no category, so no field can
  offer them, as editor.md's Tokens section notes under Gaps.

## Going further than Figma

Figma's panel is the bar: designers know it, and Dev Mode turns it into CSS. But Figma draws its own model, so some of
it has no CSS (a diamond gradient, a centered stroke), and what CSS can do that Figma can't (sticky, z-index,
transitions, filters, `clamp()`) has no control at all. Parity's frames are CSS, so its panel can offer every property,
write each one as a developer would, and show that code beside the control.

1. **Named like Figma, true to CSS.** A section and its controls use the words designers know (Fill, Stroke, Effects,
   Hug, Clip content). Each control writes exactly one CSS concept, and hovering a row's label shows the declarations it
   writes (`border-radius: var(--radius-lg)`). Each section's menu has Copy as CSS and Copy as Tailwind.
2. **Three depths, and nothing past them.** A section shows its common controls. Its More lists the rest of its
   properties, and one that's set shows as a row. The CSS row at the end takes any declaration, with completion for
   property names, values and tokens, checked with `CSS.supports`. The ledger in
   [design-options-css.md](design-options-css.md) says which depth each property gets.
3. **One owner per property.** Each CSS property is edited in one place. The CSS row doesn't take a property a control
   owns: typing `border-radius` opens the Radius control instead. So the panel never shows two values for one property.
4. **Every field takes a token, a value or an expression.** See "One value model" below.
5. **Tokens by kind, with their previews.** A field offers the tokens whose kind fits it (see "Fields and token kinds"),
   drawn as the Tokens panel draws them: a swatch, a spacing bar, a corner, a shadow card, an easing curve.
6. **Where a value comes from is visible.** A row's label is colored by where its value is set: on this layer, in the
   state shown, for the mode shown, by the component's own code, or inherited from a parent (type only). The reset arrow
   PAR-552 put by the label clears what's set at that level. This is Webflow's idea, and Parity already has the levels.
7. **What isn't everywhere is marked.** A control for a property other browsers don't draw yet (corner shape, gap
   dividers, scroll-driven animation) has a small mark beside its label, with the browsers that lack it in its hint,
   from the web-features project's Baseline data. Frames draw it either way, since they run in Chromium.
8. **A control sets what it needs, and says so.** Layer order on a layer that isn't placed sets `position: relative`,
   Max lines sets the overflow it needs, and Sticky says when a layout around it clips or scrolls, which stops it
   sticking. Webflow's Truncate does this for `text-overflow`; Parity does it for every control that needs it.
9. **Sections follow what's selected.** Layout shows for layouts, Image for images, Icon for icons, Type for text and
   for layouts whose text inherits it. A layer inside a flex or grid layout gets the rows that place it there (fill,
   align self, span); one outside gets none of them.

## One value model

Every field, whatever it edits, takes the same four forms, and shows which one it holds:

| Form       | Example                                                                                               | Shown as                                            |
| ---------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Token      | `primary`, `radius-lg`, `spacing-4`                                                                   | The token's name, with its preview; Mixed, if mixed |
| Value      | `280px`, `#2563eb`, `1.5`, `45deg`                                                                    | The value, with its unit                            |
| Keyword    | `auto`, `fit-content`, `currentColor`                                                                 | The keyword, in words where it has some (Hug)       |
| Expression | `clamp(1rem, 2vw, 2rem)`, `calc(100% - 2rem)`, `color-mix(in oklab, var(--primary) 50%, transparent)` | The expression, editable as text                    |

- **A value that isn't a token is marked,** as PAR-194 already plans for lengths off the scale, with the nearest token
  one click away. A color's nearest token is the closest in OKLCH; a length's is the nearest step. A project can choose
  to take tokens only, which turns the mark into a refusal (see "Calls to make").
- **Units are the field's to offer.** A length field's unit menu lists px, %, rem, em, vw, vh, dvh, ch and the container
  units, and the keywords the property takes (`auto`, `min-content`, `max-content`, `fit-content`). Typing a unit
  switches to it, as typing `rem` does today.
- **Expressions are kept as written.** A field shows an expression as text, and maths typed with `+ - * /` that mixes
  units becomes `calc()`. Typing `=` in any field opens it as an expression, with completion for `var()`, `calc()`,
  `min()`, `max()`, `clamp()` and `color-mix()`, as Webflow's fields do. `clamp()` gets a popover of its own, since a
  font size or width that grows with the screen between two limits is common: three fields, for the least, the preferred
  and the most.
- **Lists are lists.** Fills, shadows, filters, transforms and transitions are ordered lists of entries, each with its
  own visibility, added with +, reordered by dragging and removed with −, as Figma's fills and effects are. A token can
  stand for a whole list (a shadow token with three layers) or for one entry's value (a shadow's color).

How each kind of value is edited:

| Value type                     | Control                                                                                                                                 | Picker preview (from `token-previews.tsx`) |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Length or percentage           | Number field: scrub, step, maths, unit menu, token list                                                                                 | Spacing bar at true size                   |
| Four sides                     | One, two (vertical and horizontal) or four fields, linked by default; the box-model widget for padding and margin together              | Spacing bar                                |
| Four corners                   | One field, or four around a drawn corner                                                                                                | Corner at real size                        |
| Number                         | Number field, with a suffix where it has a unit (`%`, `×`, `deg`)                                                                       | The number                                 |
| Color                          | Swatch and value; a popover with Custom and Tokens tabs (below)                                                                         | Swatch per theme                           |
| Paint (color, gradient, image) | A stack of fills, each a swatch that opens the paint editor                                                                             | Swatch or gradient strip                   |
| Shadow                         | A stack of shadows: X, Y, blur, spread, color, inner or drop                                                                            | Card's corner with the shadow              |
| Filter function                | A stack of adjustments, each a slider with its own unit                                                                                 | Shape with the effect                      |
| Angle                          | Number field with a dial                                                                                                                | None yet: no angle kind                    |
| Time                           | Number field in ms or s                                                                                                                 | Track against half a second                |
| Easing                         | Curve with two handles, presets, steps                                                                                                  | Curve                                      |
| Font family                    | Searchable list set in each font, with the project's `@font-face` fonts first                                                           | "Ag" in the font                           |
| Keyword set of up to five      | Icon toggles in one group                                                                                                               | None                                       |
| Longer keyword set             | Menu, with a preview of each option on hover where it shows (blend modes, cursors)                                                      | None                                       |
| Position in a box              | Nine-spot box, with X and Y fields under More                                                                                           | None                                       |
| Grid tracks                    | Track list: a row per column or row, sized in fr, px, %, auto, `min-content`, `max-content`, `minmax()` or `fit-content()`, with Repeat | None                                       |
| Anything else                  | Text field, checked with `CSS.supports` as it's typed                                                                                   | None                                       |

**The color popover** has two tabs. Custom has a saturation and brightness square, hue and alpha sliders, a model menu
(Hex, RGB, HSL, OKLCH and Display P3), an eyedropper, the colors the design already uses, and the nearest token with its
contrast against the layer behind. Tokens lists the color tokens in the Tokens panel's order, Semantic first, then the
Palette's shades as a grid. A token's opacity is a field beside it, written as `color-mix()` or Tailwind's
`bg-primary/50`, as PAR-186 asks.

## Fields and token kinds

Figma calls this a variable's scopes, 23 of them, which say which fields a variable may be used in. Webflow limits each
variable type (color, size, percentage, number, font) to the fields it fits. Parity already has a finer classification:
`previewKind` in `@parity-app/tokens` gives every token one of 29 kinds from its value, name, category and DTCG type.
Fields should ask for kinds rather than categories, so a token of a kind with no category (opacity, blur, border width)
can be used as soon as it's in the stylesheet.

| Fields                                                                                                        | Token kinds offered                               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Fill color, text color, border, outline and decoration color, shadow color, accent, caret and scrollbar color | color                                             |
| A fill (a whole paint), a mask                                                                                | color, gradient                                   |
| Padding, margin, gap, insets, translate, outline offset, underline offset, scroll padding and margin          | spacing                                           |
| Width, height, min and max, grid tracks, column width                                                         | spacing, container                                |
| Radius (one or each corner)                                                                                   | radius, and Full                                  |
| Border width, outline width, decoration thickness, divider width                                              | border-width                                      |
| A whole border (width, style and color)                                                                       | border                                            |
| Shadows                                                                                                       | shadow, inset-shadow                              |
| Drop shadow that follows the shape (`filter`)                                                                 | drop-shadow                                       |
| Text shadow                                                                                                   | text-shadow                                       |
| Text style (font, size, weight, line height and letter spacing at once)                                       | type-style                                        |
| Font                                                                                                          | font                                              |
| Font size                                                                                                     | font-size                                         |
| Weight                                                                                                        | font-weight                                       |
| Line height                                                                                                   | leading                                           |
| Letter spacing, word spacing                                                                                  | tracking                                          |
| Opacity, a fill's opacity                                                                                     | opacity                                           |
| Layer blur, background blur                                                                                   | blur, backdrop-blur                               |
| Aspect ratio                                                                                                  | aspect                                            |
| Perspective                                                                                                   | perspective                                       |
| Layer order                                                                                                   | z-index                                           |
| Cursor                                                                                                        | cursor                                            |
| Transition and animation duration and delay                                                                   | duration                                          |
| Transition and animation easing                                                                               | easing                                            |
| Animation                                                                                                     | animation                                         |
| Breakpoints                                                                                                   | none: they're the Modes panel's, as media queries |
| Any other number (flex grow, scale, iterations)                                                               | number, when the field asks for one               |

One kind doesn't exist yet: angles, for a gradient's angle, a rotation and a hue rotation. It's worth adding once a
project has angle tokens; until then those fields take values only. Delays need no kind of their own, since
`previewKind` already reads a delay as a duration.

A picker shows the preview of each token in its list and a larger one of the highlighted token under the list, as
PAR-143 sets out, so a field's token list and the Tokens panel draw a token the same way. Where a field has no token,
the picker's Custom tab is the field's own editor (the color square, the shadow's fields, the curve).

## What the design model needs

`NodeStyle` was built for a token-locked subset. For the rest:

- **Values in the four forms.** PAR-194 decides how a length that isn't a step or a token is stored. Every other value
  type should take the same form, so a color, a radius or a shadow's blur can be a token, a value, a keyword or an
  expression. Today's files keep working: a bare token name stays a token, and a number stays a step.
- **Steps where Tailwind uses the spacing scale, pixels where it doesn't.** Padding, margin, gap, width and height with
  their limits, insets, translate, text indent and a grid's fixed tracks are kept as steps of the spacing scale, since
  Tailwind's utilities for them are. Radius, border width, blur and the type values have token families of their own, so
  they're kept as a token's name, or as pixels when they aren't a token (Tailwind's `rounded-[6px]`), never as steps. px
  and rem stay ways of typing and showing a value, as `FieldUnit` has them today.
- **Units that can't become pixels are kept as written.** A percentage, em, ch, vw, vh, dvh or container unit comes to a
  size that depends on the parent, the font or the screen, so it's stored with its unit rather than worked out when it's
  typed. Frames already turn vw and vh into the mode's screen. `fr` belongs only to grid tracks (`{ fr: 1 }`, beside a
  length, `auto`, `min-content`, `max-content` and `minmax()`). A typed `%` means a share of the value today, as in
  Figma, so a kept percentage is picked from the unit menu; PAR-194 decides the stored form.
- **Lists and sides as data.** Fills, shadows, filters, backdrop filters, transforms and transitions become ordered
  lists, named for the CSS property they write (`filter: [{ type: "blur", value: "blur-sm" }]`), and radius, border
  width, border color and border style take one value or four, in CSS's order. A patch for a viewport, state or variant
  replaces a whole key, as it does for `padding` today, so one corner changed in a state writes all four.
- **A token's opacity in the token's name,** `primary/50`, on every color, as Tailwind writes it and as PAR-186 plans.
  It's drawn as `color-mix(in oklab, var(--primary) 50%, transparent)`, which is what Tailwind's `bg-primary/50` comes
  to. A color that isn't a token carries its own alpha.
- **A CSS map** for what the CSS row and More hold: declarations by property name, drawn after the structured keys. The
  ledger's one-owner rule decides which properties a structured key owns, so the map never holds one of those.

What Parity writes into code stays Tailwind (PAR-265): a token becomes its utility (`bg-primary`), a value an arbitrary
value (`w-[280px]`, `bg-[#2563eb]`), and a property Tailwind has no utility for an arbitrary property
(`[mask-type:luminance]`), so every declaration has a class.

## Calls to make

These need Andrew's answer before the work they hold up starts. Each has a recommendation.

1. **Can a layer use a value that isn't a token?** PAR-194 keeps lengths off the scale but says colors, type, radius and
   shadows stay tokens, and PAR-186's color picker edits tokens rather than layers. Recommended: every field takes a
   value of its own, marked as not a token with the nearest token one click away, and a project setting, Tokens only,
   makes the mark a refusal. A color picker that can only edit tokens, and gradients and shadows that can only be
   tokens, would fall short of the request and of Figma.
2. **What does Stroke's position write?** CSS has no single stroke with Figma's inside, center and outside. Recommended:
   Stroke writes `border` by default, which takes space in the layout as code does, and its Position menu offers Inside
   (an inset ring, `box-shadow: inset 0 0 0 1px`), Outside (`outline`) and Center (`outline` with a negative offset of
   half its width), each named with what it writes. A ring with no blur reads back as a stroke, not a shadow.
3. **Are Chromium-only properties offered?** Recommended: yes, marked as above, since frames draw them and many projects
   target current browsers. A project setting for its target browsers can hide them later.
4. **One owner per property?** Recommended: yes, as above, so the CSS row can't hold a value that fights a control.
5. **Section order.** Recommended: Figma's order for the sections Figma has, and CSS's own after them: Position, Layout,
   Size, Spacing, Appearance, Fill, Stroke, Effects, Transform, Type, Image, Icon, Interaction, Motion, CSS.

## Order of work

Each line would be an issue, after the calls above. They're ordered by what designers reach for first. The new controls
(the box-model widget, the paint editor, the corner and side fields, the effects stack, the track list) are designed in
Storybook as clickable explorations first, for Andrew's approval, before any goes into the app.

1. The value model and the CSS map in `NodeStyle`, with the one-owner rule (after PAR-194, which settles lengths).
2. Pickers by kind with previews (PAR-143), and the color popover with its Custom and Tokens tabs (PAR-186).
3. Fills as a stack: color, linear, radial and conic gradients, and images, with the gradient editor on the canvas.
4. Strokes per side, with style and position, and corners each on their own, with corner shape.
5. Effects as a stack: shadows, layer and background blur, and adjustments.
6. Position: sticky and fixed, the inset widget, and layer order.
7. Layout: grid tracks of any size, areas, flow, baseline and reversed direction, and the box-model widget.
8. Type: decoration details, wrapping and truncation, vertical trim, OpenType and variable axes, and text styles
   (PAR-135).
9. Transform, Image, Interaction and Motion.
10. The CSS row, with completion and checks, and Copy as CSS and Tailwind from each section.
11. Labels colored by where a value comes from, and the Baseline marks.
