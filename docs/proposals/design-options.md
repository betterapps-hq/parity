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
  control, how Penpot and Tokens Studio model tokens, and what the tools that write code (Onlook, Plasmic, Subframe,
  Builder.io, Chrome DevTools) do.

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
   writes (`border-radius: var(--radius-lg)`), including what frames add for every layer of its type (`margin: 0` on
   text, which Tailwind's preflight already writes), with the selector and query it writes them in for the state and
   mode shown (`:hover { … }` or `hover:bg-primary/90`; `@media (width >= 48rem) { … }` or `md:p-6`), so the code shown
   is the code drawn. Each section's menu has Copy as CSS and Copy as Tailwind, which copy them the same way. Pasting
   CSS on a layer, or into the CSS row, sends each declaration to the control that owns it. Copy properties and Paste
   properties carry a whole layer's style, or one section's, to the selected layers, as Figma's Ctrl+Alt+C and
   Ctrl+Alt+V do.
2. **Three depths, and nothing past them.** A section shows its common controls. Its More lists the rest of its
   properties, and one that's set shows as a row. The CSS row at the end takes any declaration, with completion for
   property names, values and tokens, checked with `CSS.supports`. The ledger in
   [design-options-css.md](design-options-css.md) says which depth each property gets. A section with nothing set shows
   only its title and +: Fill, Stroke, Effects, Transform, Interaction and Motion start this way, as Stroke does today,
   and so does Spacing on text, image and icon layers. Inside a section, a row the layer rarely needs (Min and max,
   Margin, Layer order on a layer in the flow, Corner shape, Vertical trim) shows once it's set, or is added from the
   section's More or from the field it belongs to.
3. **One stored key per property.** Each CSS property is stored in one place, so the panel never shows two values for
   one property. A few properties are lists whose entries are shown where designers look for them, and written as one
   declaration in the list's order. `filter`'s adjustments show in Image on an image layer, and its blur and shape
   shadow in Effects. `background-image` holds the fills and, under them, a gradient stroke's layer. `box-shadow` is
   Effects' alone and `outline` is Stroke's alone. The CSS row doesn't take a property a key owns: typing
   `border-radius` opens the Radius control instead. A control may still set a property another key owns when it needs
   it (principle 8).
4. **Every field takes a token, a value or an expression.** See "One value model" below.
5. **Tokens by kind, with their previews.** A field offers the tokens whose kind fits it (see "Fields and token kinds"),
   drawn as the Tokens panel draws them: a swatch, a spacing bar, a corner, a shadow card, an easing curve. A field's
   token button sits at its right and shows on hover, as Figma's variable button does, and typing a token's name in the
   field completes it. A field bound to a token has Detach in its menu, which writes the token's value as a value of its
   own. The same menu has Edit token, which opens the token in the Tokens panel's editor and says how many layers use
   it, and Go to definition, which opens the line of CSS or DTCG that defines it, as Chrome DevTools jumps from a
   `var()` to its declaration. A token whose value differs between themes offers "This theme's value" or "Its value in
   every theme", which writes a value for each theme as that theme's patch (marked, per the Theme rule in
   [design-options-panel.md](design-options-panel.md)).
6. **Where a value comes from is visible.** A row's label is colored by where its value is set: on this layer, in the
   state shown, for the mode shown, by the component's own code, by the project's base styles (a `@layer base` rule such
   as `h1 { … }`, named with its file and line, with Open in code), or inherited from a parent (type only). The reset
   arrow PAR-552 put by the label clears what's set at that level. This is Webflow's idea, and Parity already has the
   levels. Clicking a colored label names where the value is set and goes there: the parent layer it's inherited from,
   the state or viewport, the variant, or the component's or base style's line in code, as Webflow's orange labels name
   their source.
7. **What isn't everywhere is marked.** A control for a property other browsers don't draw yet (corner shape, gap
   dividers, scroll-driven animation) has a small mark beside its label, with the browsers that lack it in its hint,
   from the web-features project's Baseline data. Frames draw it either way, since they run in Chromium.
8. **A control sets what it needs, and says so.** Max lines sets the overflow it needs, Aspect ratio frees the other
   axis to Auto, and Sticky says when a layout around it clips or scrolls, which stops it sticking. Layer order needs
   nothing more on a child of a flex or grid layout, where `z-index` works without `position`, and every Parity layer
   that isn't a root is one. Only a child of a Block layout gets `position: relative`. A layer with a Layer order paints
   above its parent's Inside or Center stroke, and the row says so. The row names the stacking context it orders within
   (the nearest ancestor that makes one, named with its reason: opacity below 100%, a transform, Move, Scale or
   Rotation, a filter or backdrop filter, a mask or clip path, a blend mode, isolation, Fixed or Sticky placement, a
   Size container, or a z-index in a layout), since a value can't lift a layer out of it. Webflow's Truncate does this
   for `text-overflow`; Parity does it for every control that needs it.

   A control can set a property another control owns when it needs it. The owning control then shows that value as set
   by the other one ("0, set by Fill"), and changing it there turns the other control to Custom. The ledger lists these
   pairs.

9. **Sections follow what's selected.** Layout shows for layouts, Image for images, Icon for icons, Text for text, and
   Text inside for layouts whose text inherits it. A layer's own content section (Text, Image or Icon) comes right after
   Appearance; a layout's Text inside comes after Transform (call 5). A layer inside a flex or grid layout gets the rows
   that place it there (fill, align self, span); one outside gets none of them.
10. **A value that does nothing says why.** A set row whose declaration has no effect on this layer is dimmed, with the
    reason in its hint, as Chrome DevTools has done since version 108. Examples: Gap on a layout that isn't flex or
    grid, Align self outside flex or grid, an inset on a layer that isn't placed, `text-overflow` without clipping,
    Fixed under a transformed parent. This covers CSS rows, More rows and values from a patch, not only what a control
    sets for itself.

## One value model

Every field, whatever it edits, takes the same four forms, and shows which one it holds:

| Form       | Example                                                                                               | Shown as                                            |
| ---------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Token      | `primary`, `radius-lg`, `spacing-4`                                                                   | The token's name, with its preview; Mixed, if mixed |
| Value      | `280px`, `#2563eb`, `1.5`, `45deg`                                                                    | The value, with its unit                            |
| Keyword    | `auto`, `fit-content`, `currentColor`                                                                 | The keyword, in words where it has some (Hug)       |
| Expression | `clamp(1rem, 2vw, 2rem)`, `calc(100% - 2rem)`, `color-mix(in oklab, var(--primary) 50%, transparent)` | The expression, editable as text                    |

- **A value that isn't a token is marked,** as PAR-194 already plans for lengths off the scale, with the nearest token
  one click away. A color's nearest token is the closest by ΔE in OKLab; a length's is the nearest step. A token is
  matched within its kind only. A color's nearest token is offered only within a ΔEOK of 0.02 (2 on the 0 to 100 scale),
  Semantic before Primitive, and a length's only within half a step. A token is matched by its value in the mode shown.
  When the matched token has a different value in another theme, the offer says so ("primary: the same in Light, darker
  in Dark"), since replacing the value changes the design there. Past that, the mark offers Create token instead, which
  opens the Tokens panel's editor with the value, a name and the kind filled in, and replaces the value with the new
  token. A reference to a token that the stylesheet no longer has is marked Missing, drawn with its last known value,
  and offers the nearest token. A token marked `$deprecated` in DTCG is left out of pickers and marked on the layers
  that use it, with its replacement where one is named. A project can limit values to tokens, which turns the mark into
  a refusal (see "Calls to make").
- **Framework steps count as on the system.** Tailwind v4 takes bare numbers for utilities whose theme has no tokens by
  default: `border-2`, `outline-offset-2`, `underline-offset-4`, `opacity-50`, a color's `/50`, `z-10`, `order-1`,
  `duration-200`, `delay-75`, `scale-105`, `rotate-45`, `grid-cols-3`, `line-clamp-2`, and spacing multiples beyond the
  listed steps (`p-13`). A value that such a utility takes is a Step. It's written without brackets and never marked. At
  Tokens only it's allowed for any kind the project has no tokens of. A project that defines tokens for that kind
  (`--opacity-*`, `--z-*`, `--border-width-*`, `--duration-*`) can choose, per kind, to have its steps marked. Spacing
  can also be limited to a list of allowed multiples
  (`$extensions.parity.levels.spacing.steps: [0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16]`), and a multiple outside it is treated
  as off the system at that kind's level. Only a value that needs brackets (`border-[3px]`, `bg-[#2563eb]`, `z-[37]`) is
  off the system.
- **Semantic and Primitive.** A token is Semantic when its value is another token (an alias,
  `--color-primary: var(--primary)`), or when it has a different value in some theme. A token worked out from another
  (`--radius-lg: calc(var(--radius) + 4px)`, a spacing step, a `color-mix()` of a token) takes the tier of the token
  it's built on, so a scale built on one base stays Primitive. Any other token is Primitive: a raw value that's the same
  in every theme. A token's author can set it in the token's `$extensions.parity.tier` (`semantic` or `primitive`), or
  in the Tokens panel's detail for a token defined in CSS. Pickers, the nearest-token rule and the Semantic only level
  all use this split, never where the token was defined. The Tokens panel's Colors section shows the same two groups,
  Semantic and Primitive (today it calls the second one the Palette).
- **Units are the field's to offer.** A length field's unit menu lists px, %, rem, em, vw, vh, dvh, svh, lvh, ch, lh and
  the container units, and the keywords the property takes (`auto`, `min-content`, `max-content`, `fit-content`). Typing
  a unit switches to it, as typing `rem` does today.
- **Expressions are kept as written.** A field shows an expression as text, and maths typed with `+ - * /` that mixes
  units becomes `calc()`. Typing `=` in any field opens it as an expression, with completion for `var()`, `calc()`,
  `min()`, `max()`, `clamp()` and `color-mix()`, as Webflow's fields do. `clamp()` gets a popover of its own, since a
  font size or width that grows with the screen between two limits is common: three fields, for the least, the preferred
  and the most.
- **What it comes to is always shown.** A field holding a token, a keyword, a relative unit or an expression shows what
  it computes to on this layer, in the mode and state shown, as faint text after its value (`clamp(1rem, 2vw, 2rem)` →
  24px; `spacing-4` → 16px; `1.5em` → 21px). It's the same measured value Width already shows for Hug and Fill.
- **Lists are lists.** Fills, shadows, filters, transforms and transitions are ordered lists of entries, each with its
  own visibility, added with +, reordered by dragging and removed with −, as Figma's fills and effects are. A token can
  stand for a whole list (a shadow token with three layers) or for one entry's value (a shadow's color).
- **A token can be overridden in part.** A token that stands for several values (a text style, a shadow, a border, an
  animation) stays applied when one of its parts is changed. The changed part is marked as an override on that row, with
  a reset arrow back to the token's value, as Figma marks an override on a component instance (Figma itself detaches a
  text or effect style when one of its values changes). It's written the way the framework overrides one:
  `text-xl leading-7` for a line height (never `text-xl/7`, which drops the letter spacing and weight the size pairs
  with it), `shadow-lg shadow-black/20` for a shadow's color, `drop-shadow-md drop-shadow-primary/40`, and a border
  token's width as its own `border-2` after the token's class, or as `border-[length:…]`. This works whatever the order
  of the classes, because each override sets what the token's utility reads first. `text-xl` reads `--tw-leading`,
  `--tw-tracking` and `--tw-font-weight`, which `leading-7`, `tracking-wide` and `font-bold` set. `shadow-lg` reads
  `--tw-shadow-color`. Tailwind sorts a shorthand before its longhands, so `border-2` wins over a border token's class.
  A part can be overridden only where the framework can do it. A token outside a Tailwind namespace
  (`shadow-(--mantine-shadow-md)`, a gradient token as `bg-(image:--brand-gradient)`, a border token as
  `[border:var(--card-border)]`) is one variable, so changing one of its parts offers Detach instead of an override.
  Detach, in the token chip's menu, writes the parts as values and drops the token.
- **Several layers at once.** A field whose layers differ shows Mixed, as today, and maths works from each layer's own
  value (`+8`, `Mixed*2`). A four-sides or four-corners field shows each side on its own, Mixed where they differ.
  Editing one side changes only that side on every layer and writes each layer's other sides as they were, as a patch
  does. A stack (fills, shadows, filters, transforms, transitions) that differs between the layers shows "Several fills"
  with + to replace them all, as Figma's does; one that's the same on every layer is edited as one. A section shows when
  it applies to every selected layer, except Text, which shows for the text layers of a mixed selection, as Resizing
  does today.
- **Keys and scrubbing are the same in every field.** Dragging a field's label scrubs it, as today; Up and Down step it,
  Shift by ten. A field holding a token steps to the next token of its kind in the scale's order (`radius-md` to
  `radius-lg`, `text-sm` to `text-base`, `shadow-sm` to `shadow-md`), so stepping stays on the tokens; Alt steps 1px off
  them, which marks the value. Each side and corner field, each stack entry's numbers (a shadow's X, Y, blur and spread)
  and each gradient stop's position scrub and step the same way. Enter commits, Escape puts the value back, Tab moves to
  the next field, and a scrub or a run of steps is one undo step. Moving through any menu or token list with the arrow
  keys or the pointer previews each option on the canvas, as Figma's font list does: fonts, weights, tokens, blend
  modes, shadows and cursors. Escape or leaving the list puts the value back, and choosing one is a single undo step.

How each kind of value is edited:

| Value type                     | Control                                                                                                                                                                                                                                           | Picker preview (from `token-previews.tsx`) |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Length or percentage           | Number field: scrub, step, maths, unit menu, token list                                                                                                                                                                                           | Spacing bar at true size                   |
| Four sides                     | One, two (vertical and horizontal) or four fields, linked by default; the box-model widget for padding and margin together                                                                                                                        | Spacing bar                                |
| Four corners                   | One field, or four around a drawn corner                                                                                                                                                                                                          | Corner at real size                        |
| Number                         | Number field, with a suffix where it has a unit (`%`, `×`, `deg`)                                                                                                                                                                                 | The number                                 |
| Color                          | Swatch and value; a popover with Custom and Tokens tabs (below)                                                                                                                                                                                   | Swatch per theme                           |
| Paint (color, gradient, image) | A stack of fills, each a swatch that opens the paint editor                                                                                                                                                                                       | Swatch or gradient strip                   |
| Shadow                         | A stack of shadows: X, Y, blur, spread, color, inner or drop                                                                                                                                                                                      | Card's corner with the shadow              |
| Filter function                | A stack of adjustments, each a slider with its own unit                                                                                                                                                                                           | Shape with the effect                      |
| Angle                          | Number field with a dial                                                                                                                                                                                                                          | None yet: no angle kind                    |
| Time                           | Number field in ms or s                                                                                                                                                                                                                           | Track against half a second                |
| Easing                         | Curve with two handles, presets, steps, and Spring (duration and bounce, as Framer's time-based spring, or physics: stiffness, damping and mass, as Framer's physics spring, written with the duration it takes to settle), written as `linear()` | Curve                                      |
| Font family                    | Searchable list set in each font, with the project's `@font-face` fonts first                                                                                                                                                                     | "Ag" in the font                           |
| Keyword set of up to five      | Icon toggles in one group                                                                                                                                                                                                                         | None                                       |
| Longer keyword set             | Menu, with a preview of each option on hover where it shows (blend modes, cursors)                                                                                                                                                                | None                                       |
| Position in a box              | Nine-spot box, with X and Y fields under More                                                                                                                                                                                                     | None                                       |
| Grid tracks                    | Track list: a row per column or row, sized in fr, px, %, auto, `min-content`, `max-content`, `minmax()` or `fit-content()`, with Repeat                                                                                                           | None                                       |
| Anything else                  | Text field, checked with `CSS.supports` as it's typed                                                                                                                                                                                             | None                                       |

**The color popover** has two tabs. It opens on Tokens when the field holds a token and on Custom when it holds a value.
Custom has a saturation and brightness square, hue and alpha sliders, a model menu (Hex, RGB, HSL, HSB, OKLCH and
Display P3; HSB is written as hex, since CSS has no HSB), an eyedropper, the colors the design already uses, and the
nearest token, and the contrast against the layer behind in every theme, with the worst ratio shown first, with the AA
and AAA contrast lines drawn across the color square, as Chrome DevTools' picker draws them. The popover opens in the
model of the value it holds: hex for a hex value, OKLCH for an `oklch()` value or a Tailwind palette value. It remembers
the last model the person chose. A new value starts in OKLCH in a Tailwind v4 project, whose palette is OKLCH, and in
Hex otherwise. A value outside sRGB or Display P3 is marked. A value that isn't a token says, in its hint, that it stays
the same in every theme. Tokens lists the color tokens in the Tokens panel's order, Semantic first, then Primitive
shades as a grid. Under Semantic only, the Primitive grid is hidden and Custom is read-only. The Selection colors'
Replace with token and the nearest-token offer follow the same level. A token's opacity is a field beside it, written as
`color-mix()` or Tailwind's `bg-primary/50`, as PAR-186 asks.

## Fields and token kinds

Figma calls this a variable's scopes, 23 of them, which say which fields a variable may be used in. Webflow limits each
variable type (color, size, percentage, number, font) to the fields it fits. Parity already has a finer classification:
`previewKind` in `@parity-app/tokens` gives every token one of 29 kinds from its value, name, category and DTCG type.
Fields should ask for kinds rather than categories, so a token of a kind with no category (opacity, blur, border width)
can be used as soon as it's in the stylesheet.

| Fields                                                                                                                                                                    | Token kinds offered                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fill color, text color, border, outline and decoration color, shadow color, accent, caret and scrollbar color                                                             | color                                                                                                                                                                                                |
| A fill                                                                                                                                                                    | color, gradient                                                                                                                                                                                      |
| A mask                                                                                                                                                                    | gradient                                                                                                                                                                                             |
| Padding, margin, gap, insets, translate, scroll padding and margin                                                                                                        | spacing                                                                                                                                                                                              |
| Width, height, min and max, grid tracks, column width                                                                                                                     | spacing, container                                                                                                                                                                                   |
| Radius (one or each corner)                                                                                                                                               | radius, and Full                                                                                                                                                                                     |
| Border width, outline width, decoration thickness, divider width, outline offset and underline offset (px, as Tailwind's `outline-offset-2` and `underline-offset-4` are) | border-width                                                                                                                                                                                         |
| A whole border (width, style and color)                                                                                                                                   | border                                                                                                                                                                                               |
| Shadows                                                                                                                                                                   | shadow, inset-shadow                                                                                                                                                                                 |
| Drop shadow that follows the shape (`filter`)                                                                                                                             | drop-shadow                                                                                                                                                                                          |
| Text shadow (Drop shadow on a text layer)                                                                                                                                 | text-shadow                                                                                                                                                                                          |
| Text style (size with its line height, letter spacing and weight; font where the style names one)                                                                         | type-style tokens, project utilities that set only type (`@utility type-heading`), and font-size tokens that pair a weight or letter spacing (`--text-xl--font-weight`, `--text-xl--letter-spacing`) |
| Font                                                                                                                                                                      | font                                                                                                                                                                                                 |
| Font size                                                                                                                                                                 | font-size, including sizes whose only pair is a line height (all of Tailwind's defaults)                                                                                                             |
| Weight                                                                                                                                                                    | font-weight                                                                                                                                                                                          |
| Line height                                                                                                                                                               | leading, spacing (Tailwind v4's `leading-6` is a spacing step)                                                                                                                                       |
| Letter spacing, word spacing                                                                                                                                              | tracking                                                                                                                                                                                             |
| Opacity, a fill's opacity                                                                                                                                                 | opacity                                                                                                                                                                                              |
| Layer blur                                                                                                                                                                | blur                                                                                                                                                                                                 |
| Background blur                                                                                                                                                           | blur, backdrop-blur (Tailwind's `backdrop-blur-*` reads `--blur-*`)                                                                                                                                  |
| Aspect ratio                                                                                                                                                              | aspect                                                                                                                                                                                               |
| Perspective                                                                                                                                                               | perspective                                                                                                                                                                                          |
| Layer order                                                                                                                                                               | z-index                                                                                                                                                                                              |
| Cursor                                                                                                                                                                    | cursor                                                                                                                                                                                               |
| Transition and animation duration and delay                                                                                                                               | duration                                                                                                                                                                                             |
| Transition and animation easing                                                                                                                                           | easing                                                                                                                                                                                               |
| Animation                                                                                                                                                                 | animation                                                                                                                                                                                            |
| Size container breakpoints                                                                                                                                                | container (Tailwind v4's `@md:` reads `--container-md`)                                                                                                                                              |
| Breakpoints                                                                                                                                                               | none: they're the Modes panel's, as media queries                                                                                                                                                    |
| Any other number (flex grow, scale, iterations)                                                                                                                           | number tokens whose value is a plain number: the number kind is `previewKind`'s catch-all for any token it can't place, keywords included                                                            |

A token is offered in Text style or in Size, never both, so a class reads back into one key. A size token whose only
pair is its line height is a size. It's chosen in Size, and its line height shows as From size. In a project with no
text styles, the Text style row is hidden and Size leads the section.

One kind doesn't exist yet: angles, for a gradient's angle, a rotation and a hue rotation. It's worth adding once a
project has angle tokens; until then those fields take values only. Delays need no kind of their own, since
`previewKind` already reads a delay as a duration.

Two DTCG types have no kind: `transition` (duration, easing and delay together) and `strokeStyle`. `dtcg-values.ts`
reads both today, but `typeKinds` in `inference.ts` maps neither. A transition token is offered in Motion's Transitions
row as a whole, and its three parts can be overridden as a text style's can. A stroke style token is offered in Stroke's
Style menu. `previewKind` gets `transition` and `border-style` for them.

A text style is written the way the project's styling framework writes one. In Tailwind v4, that's a `--text-*` size
with the values paired with it, so `text-xl` sets all four, and a font is a separate `font-*` class. A DTCG typography
token is compiled to that same set of variables. A `font` shorthand token is read as a style but never written as
`font:`, since `font` can't hold letter spacing and resets the OpenType settings.

A token named `<base>--<part>` whose base is also a token (`--text-xl--line-height`, `--text-xl--letter-spacing`,
`--text-xl--font-weight`) is a value paired with its base, as Tailwind v4 pairs them. It isn't offered in the Line
height, Letter spacing or Weight pickers. It shows in its base's detail and in the row's From size value. `previewKind`
reads it as leading, tracking or font-weight by its name. A DTCG font size gives its pair through
`$extensions.parity.lineHeight`, which Parity already reads.

Kinds are inferred, so a token's author can correct one. A DTCG token's `$extensions.parity.kind` sets its kind,
`$extensions.parity.fields` limits it to some of the fields of that kind (as Figma's scopes do), and
`$extensions.parity.hidden` keeps it out of pickers (component-internal tokens). These join the `var`, `category` and
`lineHeight` that Parity's extension already holds (`TokenExtension` in `@parity-app/core`), which every registry
`.lib.par` writes. For tokens defined in CSS, the Tokens panel's detail sets the same three, kept in the project's own
`.lib.par`. Tokens brought from Figma keep Figma's settings. A variable's `scopes` (`FRAME_FILL`, `TEXT_FILL`,
`STROKE_COLOR`, `EFFECT_COLOR`, `GAP`, `CORNER_RADIUS`, `WIDTH_HEIGHT`, and so on) are read as `fields`,
`hiddenFromPublishing` as `hidden`, and `codeSyntax.WEB` as `var`, so a team's Figma setup carries over without being
set again. `fields` uses Figma's scope names, plus Parity's own for fields Figma has no scope for (`INSET`, `TRANSLATE`,
`Z_INDEX`, `DURATION`). Parity never writes into a token file another tool owns, such as a Tokens Studio sync or a Figma
export. Settings for those tokens go in the project's `.lib.par`, by token name, as for CSS tokens. Where Parity does
write a DTCG file, it keeps every other tool's `$extensions` as they were. Today the reader in `dtcg.ts` drops them.
Figma's scopes, `hiddenFromPublishing` and `codeSyntax` are read from the Figma REST API's variables, or from the
`com.figma` keys of a DTCG file Figma exports.

The framework's defaults are tokens too, since Parity reads Tailwind's full theme. A project that resets a namespace
(`--color-*: initial`) has none of those defaults. One that doesn't shows them in pickers after its own tokens, under
"Tailwind defaults", and a project setting can hide them per kind. `hidden` can name a namespace as well as a token.

A picker shows the preview of each token in its list and a larger one of the highlighted token under the list, as
PAR-143 sets out, so a field's token list and the Tokens panel draw a token the same way. Where a field has no token,
the picker's Custom tab is the field's own editor (the color square, the shadow's fields, the curve).

## What the design model needs

`NodeStyle` was built for a token-locked subset. For the rest:

- **Values in the four forms.** PAR-194 decides how a length that isn't a step or a token is stored. Every other value
  type should take the same form, so a color, a radius or a shadow's blur can be a token, a value, a keyword or an
  expression. Each value is stored with its form: `{ token: "primary", alpha?: 50 | { token: "opacity-muted" } }`,
  `{ value: "#2563eb" }`, `{ step: 2 }`, `{ keyword: "auto" }` or `{ expr: "clamp(…)" }`, so whether a value is a token
  is never guessed from its text. The new forms are a new `.par` version. The repository's examples and fixtures are
  rewritten in it, and a file in today's form is rejected, as conventions.md's Fix forward rule says (one current
  format, no old readers).
- **Steps where Tailwind uses the spacing scale, pixels where it doesn't.** Padding, margin, gap, width and height with
  their limits, insets, translate and text indent are kept as steps of the spacing scale, since Tailwind's utilities for
  them are. A grid's fixed tracks aren't: Tailwind writes them as arbitrary values (`grid-cols-[200px_1fr]`). Radius,
  border width, blur and the type values have token families of their own, so they're kept as a token's name, or as
  pixels when they aren't a token (Tailwind's `rounded-[6px]`), never as steps. px and rem stay ways of typing and
  showing a value, as `FieldUnit` has them today.
- **Units that can't become pixels are kept as written.** A percentage, em, ch, vw, vh, dvh or container unit comes to a
  size that depends on the parent, the font or the screen, so it's stored with its unit rather than worked out when it's
  typed. Frames already turn vw and vh into the mode's screen. `fr` belongs only to grid tracks (`{ fr: 1 }`, beside a
  length, `auto`, `min-content`, `max-content` and `minmax()`). A typed `%` means a share of the value today, as in
  Figma, so a kept percentage is picked from the unit menu; PAR-194 decides the stored form.
- **Lists and sides as data.** Fills, shadows, filters, backdrop filters, transforms and transitions become ordered
  lists, named for the CSS property they write (`filter: [{ type: "blur", value: "blur-sm" }]`), and radius, border
  width, border color and border style take one value or four, in CSS's order. Each list entry, and each declaration in
  the CSS map, carries an off flag, which keeps it in the file without drawing it or writing it to code. A patch for a
  viewport, state or variant replaces a whole key, as it does for `padding` today, so one corner changed in a state
  writes all four. In code, a patch writes only the sides, corners or longhands that differ from what's under it
  (`hover:rounded-bl-none`, not all four corners), though the file keeps the whole key. Today's keys `transform`
  (text-transform), `border` (border color), `size` (font size), `font` (font family), `background` (one color token)
  and `shadow` (one shadow token) clash with the CSS names the new lists take. They're renamed (`textTransform`,
  `borderColor`, `fontSize`, `fontFamily` for today's `font`, and `background` becomes the `fills` list and `shadow` the
  `boxShadow` list), and the examples are rewritten with the new keys; a file with the old keys is rejected. The
  examples' `overflow` values are rewritten as they draw: `scroll` (drawn as `auto`) becomes Scroll when needed, and
  `hidden` stays `hidden` rather than becoming Clip, since the two differ for flex sizing and sticky children.
- **A token's opacity with the token,** on every color, as Tailwind writes it and as PAR-186 plans. It's stored as the
  value's `alpha` (above) and drawn as `color-mix(in oklab, var(--primary) 50%, transparent)`, which is what Tailwind's
  `bg-primary/50` comes to. The alpha can be an opacity token, written as Tailwind v4's `bg-primary/(--opacity-muted)`.
  A token in Tailwind's `--opacity-*` namespace that's written as a percentage is written as a named modifier
  (`bg-primary/muted`), which Tailwind reads from `--opacity-muted`. A color that isn't a token carries its own alpha.
  Tailwind's `/(--opacity-muted)` modifier puts the variable into `color-mix()` as a percentage, so it works only for an
  opacity token written as a percentage (`50%`). An opacity token written as a number (`0.5`, as DTCG's number type and
  most libraries write it) is written as `bg-primary/[calc(var(--opacity-muted)*100%)]` instead. The alpha follows the
  opacity kind's level: under Tokens only, it's one of the opacity tokens.
- **A CSS map** for what the CSS row and More hold: declarations by property name, drawn after the structured keys. The
  ledger's one-owner rule decides which properties a structured key owns, so the map never holds one of those.
- **Frames draw rules, not inline styles.** render.ts gives each element a `style` object today, which can't hold a
  state's pseudo-class, `::placeholder` or `::selection`, `@starting-style`, a `@container` query or a `group-hover:`
  rule. Each frame draws each layer with the classes Parity will write for it. They're compiled by the project's own
  Tailwind (the design system `@parity-app/styles-tailwind` already loads through `@tailwindcss/node`) into the shadow
  root's stylesheet, in Tailwind's own layers. Its `@property` registrations (`--tw-shadow`, `--tw-ring-shadow`,
  `--tw-rotate-x` and the rest) are hoisted into the document's stylesheet, since Chromium ignores `@property` inside a
  shadow root, and Tailwind's shadows, rings, transforms and gradients need their initial values. So the frame has the
  code's cascade: `hover:` inside `@media (hover: hover)`, a text style's `--tw-leading`, `group-hover:`, `divide-y`'s
  child selector, a component's own classes against the layer's, and `!`. A project without Tailwind gets one rule set
  per layer, keyed by its node id (`[data-node="…"]`), in `@layer utilities`, with states, theme variants and container
  queries as its selectors and at-rules. Showing a state on the canvas still applies its patch, as today. Play draws the
  real `:hover`, `:focus-visible` and `:active`, so a transition plays as it will in the app.
- **Frames add only what code writes.** Today every layout gets `position: relative` and `min-width: 0` (render.ts).
  Both go. `relative` is written on a layout that has an Absolute child, the design's root included (it shows in the
  root's CSS section as set by that child, since a root has no Position section), or for Layer order in a Block layout.
  It isn't written when the layout's Placement is already Absolute, Fixed, Sticky or Relative, each of which already
  places an Absolute child, and where `relative` would undo Sticky, Fixed or Absolute. `min-w-0` is written where Fill
  writes it. Developers don't keep `relative min-w-0` on every div. The blanket `min-width: 0` also lets a Hug layout
  shrink below its content in a crowded row, which Figma's Hug doesn't do.
- **A token's value for each combination of modes.** `Token.values` is keyed by one theme name. `themeOfSelector` reads
  no rule that names two themes at once (`.dark.brand-b`) or uses a combinator. `readDesignTokens` reads a resolver's
  contexts one at a time, with the other modifiers at their defaults. With more than one set of modes (Theme and Brand),
  a token's values are keyed by the context of each set, and both readers read combinations. "Every theme" then means
  every combination the project defines, worst first. That covers the contrast check, "Its value in every theme" and the
  nearest-token offer.

What Parity writes into code stays Tailwind (PAR-265): a token in a Tailwind theme namespace becomes its utility
(`bg-primary`, `p-4`, `rounded-lg`); any other token, such as a library's `--mantine-spacing-md`, uses v4's variable
shorthand (`p-(--mantine-spacing-md)`), never `p-[var(--…)]`. A value becomes an arbitrary value (`w-[280px]`,
`bg-[#2563eb]`), and a property Tailwind has no utility for an arbitrary property (`[mask-type:luminance]`), so every
declaration has a class. A value that isn't a token and would make a long arbitrary class offers Save as token first.
That includes a gradient, a shadow of more than one layer, or a `clamp()`. The new token's utility replaces the
arbitrary class, and Copy as Tailwind shows the class that will be written, so a designer sees an unreadable class
before it's written. Classes are written in the class order prettier-plugin-tailwindcss produces; whether Parity uses
the plugin or keeps that order itself is a dependency question for Andrew.

**What's written reads back.** Every class Parity writes reads back into the same key and form: a utility into a token,
an arbitrary value (`w-[280px]`, `bg-(--brand)`) into a value or expression, `bg-primary/50` into a token with opacity,
an arbitrary property (`[mask-type:luminance]`) into the CSS map, and `hover:`, `focus-visible:` and breakpoint prefixes
into the state's or viewport's patch. A test writes each value form and reads it back unchanged. Read-back runs through
the drift review decisions.md sets out: a hand edit that reads back is a change to approve on the design, not applied
silently. `ring-*`, `inset-ring-*` and their colors (`ring-ring/50`, as shadcn's components write their focus rings)
read back as entries in Effects' shadow list, labelled Ring, with the `ring` token as their color. They're written back
as the same utilities, so a shadcn component's focus ring comes back unchanged. The shadow list is written into
Tailwind's four `box-shadow` slots in Tailwind's order, and any other list as one arbitrary value
(design-options-panel.md, Effects). Writing a design to code changes only the classes Parity wrote on each element and
keeps the rest where they are. A class a developer added by hand (`[&_svg]:size-4`) survives the next write and shows in
From the code, as call 9 recommends. Parity never regenerates a file whole, as Subframe's sync does.

## Calls to make

These need Andrew's answer before the work they hold up starts. Each has a recommendation.

1. **Can a layer use a value that isn't a token?** PAR-194 keeps lengths off the scale but says colors, type, radius and
   shadows stay tokens, and PAR-186's color picker edits tokens rather than layers. Recommended: every field takes a
   value of its own, marked as not a token, with the nearest token one click away. A project setting, kept in the
   project's own `.lib.par` under `$extensions.parity.levels` so the agent and CI read it where they read the tokens,
   sets a level for each kind: Any value, Marked (the default), Tokens only, and, for colors, Semantic only (Semantic as
   One value model defines it, not where a token is defined). Always allowed at any level: `0`, `auto`, `none`, `100%`,
   `currentColor`, `transparent`, `inherit`, a framework step (One value model), and expressions whose only values are
   tokens (`calc(var(--spacing) * 18)`, `color-mix(in oklab, var(--primary), var(--background))`). The CSS row,
   expressions, tokens set on a layer and per-theme overrides follow the same levels. A color picker that can only edit
   tokens, and gradients and shadows that can only be tokens, would fall short of the request and of Figma. A level can
   be broken on purpose. Allow here, in a refused or marked value's menu, keeps the value with a reason and marks the
   row as an exception. The exception is listed in Off-system values with its reason. CI passes an exception but reports
   how many there are, as eslint's disable comments do.
2. **What does Stroke's position write?** CSS has no single stroke with Figma's inside, center and outside. Recommended:
   Stroke owns `border` and `outline`, and Effects alone owns `box-shadow`. Include in layout, a toggle beside Inside,
   Center and Outside as Figma's "Strokes included in layout" is, writes `border`, which takes space as Figma's does.
   Include in layout is on for a new stroke (1px `border`, as today's Stroke Add and Tailwind's `border` write, and what
   code writes for a card or input). This is Figma's own model since its updated auto layout became the default for new
   frames in July 2026: an inside stroke counts in layout like a CSS border, and center and outside strokes are drawn
   like an outline and never take space, whatever the frame's setting
   ([help center](https://help.figma.com/hc/articles/42031586813719)). A frame brought from Figma on the legacy layout
   version keeps its "Strokes included in layout" setting. A designer who wants an inside stroke that doesn't move the
   content, as legacy frames drew it, turns Include in layout off. A border is always inside the box, so with Include in
   layout on, Position is Inside, and choosing Center or Outside turns it off and says so. A gradient stroke needs it
   on, as widths, colors and styles per side do. A layer has one border and one outline. Stroke's + adds whichever the
   first stroke doesn't use: an outline (Outside) when the first is in layout, or a border when it isn't. With Include
   in layout off, Inside writes `outline` with `outline-offset` of minus its width, Center minus half its width, and
   Outside 0. All three follow the radius in Chromium. An outline is drawn above the layer's own content and its
   children that aren't positioned, as Figma's strokes are. A child that is placed (Absolute, Fixed, Sticky or
   Relative), has a Layer order, or makes a stacking context (opacity, a transform, a filter) is drawn over it. When one
   covers an Inside or Center stroke, the Position row says so and offers Include in layout. For this to hold in the
   common case, a layout gets `position: relative` only when it needs it (an Absolute child), not on every layout as
   render.ts does today (see What the design model needs). Widths, colors or styles per side need Include in layout, so
   choosing one turns it on and says so. A focus ring is Stroke's outline in the focus-visible state. An inset ring
   (`box-shadow: inset 0 0 0 1px`) is drawn under the children, so a child that fills the frame hides it; it stays an
   Inner shadow in Effects.
3. **Are Chromium-only properties offered?** Recommended: yes, marked as above, since frames draw them and many projects
   target current browsers. A project setting for its target browsers can hide them later.
4. **One stored key per property?** Recommended: yes, as principle 3 says, so the CSS row can't hold a value that fights
   a control, and a list shown in two sections (`filter`, `background-image`) is still one declaration.
5. **Section order.** Recommended: Figma's order, with the layer's own content near the top: Position, Size, Layout,
   Spacing, Appearance, then the content section the layer has (Text for text, Image for images, Icon for icons), then
   Fill, Stroke, Effects, Selection colors (for a layout or several layers), Transform, Text inside for layouts,
   Interaction, Motion, CSS. Size comes before Layout as Figma's W and H come before auto layout, and Spacing follows
   Layout so padding sits next to gap.
6. **What is a text style?** Recommended: in Tailwind projects, a `--text-*` size that pairs a weight or letter spacing
   as well as a line height (Tailwind v4's own), plus a font when the style names one; a DTCG typography token compiles
   to the same variables. Overriding one row keeps the style and marks the override. A style can differ per breakpoint,
   as Framer's do. Its variables are redefined in a breakpoint's `@media (width >= …)` block in the project's CSS, which
   Parity reads as that viewport's value, so the layer keeps one class. Today's reader leaves values under `@media` out
   (`policy.ts`, `isUnconditional`). Changing the size on one layer per viewport instead writes a viewport patch
   (`text-base md:text-lg`). PAR-135 waits on this. A text style can also be a project utility that sets only type
   properties (`@utility heading-1 { … }`, or a class in `@layer components`), which is how many Tailwind teams write a
   style with a font. It's offered in the Text style picker and written as its class. A style that names a font, or sets
   anything a `--text-*` size can't pair (a font, OpenType features, case), is a project utility, so it's one class and
   reads back as one style. A DTCG typography token that names a font is compiled to one
   (`@utility type-heading { … }`). A `font-*` class beside a style is an override.
7. **What a state writes.** Each state names its trigger: a pseudo-class (`:hover`, `:focus-visible`, `:active`,
   `:disabled`), an attribute (`[aria-expanded=true]`, `[data-state=open]`) or a prop. Recommended: pseudo-classes and
   attributes by default, as Webflow's and Plasmic's states are, with a prop only when the component's code has one.
   States are written as Tailwind variants (`hover:`, `focus-visible:`, `aria-expanded:`, `data-[state=open]:`), and a
   parent's state can style a child through `group-hover:` or `group-data-[state=open]:`, as Plasmic's and Webflow's
   parent states do. A state can also come from a sibling or a child, as Tailwind's `peer-*` and `has-*` variants write
   it: a label styled when its input is checked or invalid (`peer-checked:`, `peer-invalid:`, with `peer` on the input),
   or a card styled when something inside it has focus (`has-focus-visible:`, `has-[:checked]:`). The States menu also
   lists the form states Webflow has (Checked, Invalid, Required, Read only, Placeholder shown), written as `checked:`,
   `invalid:`, `required:`, `read-only:` and `placeholder-shown:`. Custom selector, at the end of the menu, takes any
   selector relative to the layer, as Plasmic's element variants do, written as an arbitrary variant
   (`[&:nth-child(3)]:`, `[[open]_&]:`), and reads back into the same state. A state also says whose it is. On the
   component's root, it's written on the layers inside as `group-hover:` (Plasmic's interaction variants). The root gets
   `group`, or a named `group/<name>` when components nest, so an inner component's `group-hover:` doesn't fire on its
   parent's hover. On one layer, it's written as `hover:` on that layer (Plasmic's element variants, and Webflow's
   states on a class). Hover and press shortcuts on a layer in a screen add that layer's own state, listed under the
   layer in the States menu.
8. **What a viewport's patch writes.** A viewport's patch applies in that viewport alone, as render.ts draws it, while
   Tailwind's `md:` applies from its width up. Recommended: code is written mobile-first. The narrowest viewport's
   values are the plain classes, and each wider viewport adds its prefix only where its value differs from the one below
   (`p-4 md:p-6 lg:p-8`). A viewport's prefix is the project's widest breakpoint token at or below its width and above
   the next narrower viewport's width (`md:` for 768 with Tailwind's `--breakpoint-md: 48rem`). Where no breakpoint
   fits, an arbitrary one is written (`min-[900px]:`), and the Modes panel offers to add a breakpoint token. The frame
   draws a viewport's values at every width from its prefix up to the next one, so a frame resized between viewports
   draws what the code does. A value that holds in a middle viewport only gets a range (`md:max-lg:p-6`). A row's hover
   and Copy as Tailwind show this form. A row with a different value in another viewport or state has a dot after its
   label, and the dot's menu lists each value (Tablet: 24, Hover: primary/90) and goes to it.
9. **A class Parity can't read back.** decisions.md says Parity asks whether to freeze the component as code or
   overwrite the edit. Recommended: a third answer, offered first, keeps the class on the layer as a "From the code" row
   in the CSS section, not editable there, written back unchanged on every later write. This is how `[&_svg]:size-4` or
   a developer's `has-[…]:` variant survives, without freezing a whole component over one class. Freeze and Overwrite
   stay in the menu.

## Order of work

Each line would be an issue, after the calls above. They're ordered by what designers reach for first. The new controls
(the box-model widget, the paint editor, the corner and side fields, the effects stack, the track list) are designed in
Storybook as clickable explorations first, for Andrew's approval, before any goes into the app.

1. The value model and the CSS map in `NodeStyle`, with the one-owner rule (after PAR-194, which settles lengths), with
   read-back of every form it writes, and frames drawn from the classes Parity writes, compiled by the project's
   Tailwind, rather than inline styles.
2. Pickers by kind with previews (PAR-143), and the color popover with its Custom and Tokens tabs (PAR-186).
   `Token.source` (`semantic` or `theme`, which says whether Tailwind's theme defines a token) gives way to the token's
   tier, Semantic or Primitive, by the rule in One value model, and token values per combination of modes.
3. Fills as a stack: color, linear, radial and conic gradients, and images, with the gradient editor on the canvas.
4. Strokes per side, with style and position, and corners each on their own, with corner shape.
5. Effects as a stack: shadows, layer and background blur, and adjustments.
6. Position: sticky and fixed, the inset widget, and layer order.
7. Layout: grid tracks of any size, areas, flow, baseline and reversed direction, and the box-model widget.
8. Text: decoration details, wrapping and truncation, vertical trim, OpenType and variable axes, and text styles
   (PAR-135). `typographyCss` in `@parity-app/tokens` writes a DTCG typography token as a `font` shorthand today and
   drops its letter spacing. It writes the `--text-*` set, or a utility, instead. Styling part of a text (a bold word, a
   link, a colored span) needs inline ranges in the model, with Mixed in each Text row as Figma has it. It's its own
   issue, filed with this plan, so it isn't lost (design-options-panel.md, Text).
9. Transform, Image, Interaction and Motion.
10. The CSS row, with completion and checks, and Copy as CSS and Tailwind from each section.
11. Labels colored by where a value comes from, the Baseline marks, and hints for values that do nothing.
12. Off-system values: a list in the Tokens panel of every value off the system in the open design, grouped by kind and
    by nearest token, with Replace all, and how many layers use each token. The agent's lint reads the same list. It
    runs without the app too, from the same package (`@parity-app/tokens`), so a project's CI can fail on values below
    its level. It also lists Missing tokens and tokens marked `$deprecated`, with Replace all to the named replacement.
    A replacement is named by a `{token}` reference in the `$deprecated` text or by `$extensions.parity.replacedBy`.
