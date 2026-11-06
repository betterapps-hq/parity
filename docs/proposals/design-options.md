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

- This page: the principles, the value model in brief, the calls to make, and the order of work.
- [design-options-panel.md](design-options-panel.md): the Design tab section by section, with how each control looks and
  the CSS it writes.
- [design-options-fields.md](design-options-fields.md): what every field shares: its slots, forms, states, typing, keys,
  token picker and lists.
- [design-options-values.md](design-options-values.md): how each type of value is shown, edited and written, type by
  type.
- [design-options-tokens.md](design-options-tokens.md): which tokens each field offers, how a value off the system is
  marked, which framework steps are on it, the levels a project sets, Semantic and Primitive, and what a text style is.
- [design-options-code.md](design-options-code.md): what the design model stores, how frames draw it, and the classes
  Parity writes and reads back.
- [design-options-css.md](design-options-css.md): every CSS property Chromium 156 draws (562 of them) and where each one
  goes.
- [design-options-research.md](design-options-research.md): what Figma, pen.dev, Webflow and Framer offer, control by
  control, how each tool shows a value, how Penpot and Tokens Studio model tokens, and what the tools that write code
  (Onlook, Plasmic, Subframe, Builder.io, Chrome DevTools) do.

This page is meant to be read in fifteen minutes. The others are reference, read a section at a time.

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
- **No shared field.** A token shows as mono text in `TokenInput` and a length as a number in `LengthInput`; nothing yet
  says how a color, an angle, a shadow or an expression is shown, or how a field marks a value's states.

## Going further than Figma

Figma's panel is the bar: designers know it, and Dev Mode turns it into CSS. But Figma draws its own model, so some of
it has no CSS (a diamond gradient, noise), and what CSS can do that Figma can't (sticky, z-index, transitions, filters,
`clamp()`) has no control in its Design panel. Parity's frames are CSS, so its panel can offer every property, write
each one as a developer would, and show that code beside the control.

1. **Named like Figma, true to CSS.** A section and its controls use the words designers know (Fill, Stroke, Effects,
   Hug, Clip content). Each control writes exactly one CSS concept, and hovering a row's label shows the declarations it
   writes, in the selector and query it writes them in for the state and mode shown
   ([design-options-code.md](design-options-code.md)). Pasting CSS on a layer, or into the CSS row, sends each
   declaration to the control that owns it.
2. **Three depths, and nothing past them.** A section shows its common controls. Its More lists the rest of its
   properties, and one that's set shows as a row. The CSS row at the end takes any declaration, checked with
   `CSS.supports`, and the ledger in [design-options-css.md](design-options-css.md) says which depth each property gets.
3. **One stored key per property.** Each CSS property is stored in one place, so the panel never shows two values for
   one property. A list such as `filter` is shown where designers look for its entries (adjustments in Image, blur in
   Effects) and written as one declaration. The CSS row doesn't take a property a key owns: typing `border-radius` opens
   the Radius control instead.
4. **Every field takes a token, a step where the utility has one, a value, a keyword or an expression,** and shows
   which. See One value model below.
5. **Tokens by kind, with their previews.** A field offers the tokens whose kind fits it, drawn as the Tokens panel
   draws them ([design-options-tokens.md](design-options-tokens.md)), and picked from its token button or by typing a
   name ([design-options-fields.md](design-options-fields.md), Picking a token).
6. **Where a value comes from is visible.** A row's label is colored by where its value is set: on this layer, in the
   state shown, for the mode shown, by the component's own code, by the project's base styles, or inherited from a
   parent. The reset arrow PAR-552 put by the label clears what's set at that level, and clicking the label goes to
   where it's set, as Webflow's labels name their source.
7. **What isn't everywhere is marked.** A control for a property other browsers don't draw yet (corner shape, gap
   dividers, animation triggers) has a small mark beside its label, with the browsers that lack it in its hint, from the
   web-features project's Baseline data. Frames draw it either way, since they run in Chromium. A value that isn't
   everywhere is marked the same way, beside the option and after the value
   ([design-options-fields.md](design-options-fields.md), States).
8. **A control sets what it needs, and says so.** Max lines sets the overflow it needs, Aspect ratio frees the other
   axis to Auto, and Sticky says when a layout around it scrolls or hides its overflow (`overflow: hidden`, `auto` or
   `scroll`), which stops it sticking. Layer order names the stacking context it orders within
   ([design-options-panel.md](design-options-panel.md), Position). The control that owns a property shows such a value
   as set by the other one; the pairs are listed in [design-options-css.md](design-options-css.md), Properties set by
   another control.
9. **Sections follow what's selected.** Layout shows for layouts, Image for images, Icon for icons, Text for text, and
   Text inside for layouts, components and instances whose text inherits it. A layer inside a layout gets the rows that
   place it there (fill, align self, span, as its parent takes them); an Absolute or Fixed one gets none of them.
10. **A value that does nothing says why.** A set row whose declaration has no effect on this layer is dimmed, with the
    reason in its hint, as Chrome DevTools has done since version 108. This covers CSS rows, More rows and values from a
    patch, not only what a control sets for itself.

## One value model

Every field takes a token, a step of the framework's scale where the utility has one, a value, a keyword or an
expression, and shows which. How each type of value looks at rest, is edited, shows its states and is written to CSS and
Tailwind is in [design-options-values.md](design-options-values.md).

| Form       | Example                                                            | Shown as                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token      | `primary`, `radius-lg`, `container-md`                             | A chip with the token's preview and name                                                                                                                                                                               |
| Step       | `{ step: 4 }` (`p-4`, `border-2`, `z-10`, `duration-200`, `w-1/2`) | The number it comes to in the field's unit (16, 2, 10, 200ms, 50%), unmarked unless its kind's level marks it ([design-options-tokens.md](design-options-tokens.md), Framework steps); the class it writes in the hint |
| Value      | `#2563eb`, `6px` (a radius), `1.5` (a line height), `22.5deg`      | The value with its unit; marked when the kind's level marks it                                                                                                                                                         |
| Keyword    | `auto`, `none`, `currentColor`, `inherit`                          | In words (Auto, None, Text color, Transparent, Inherit), with the CSS keyword in the hint                                                                                                                              |
| Expression | `clamp(1rem, 2vw, 2rem)`, `calc(100% - 2rem)`, `color-mix(…)`      | Its function's name and what it comes to (`clamp · 24`); the text while focused                                                                                                                                        |

Width and height also take a size mode, Fixed, Hug or Fill with a share, since Hug and Fill aren't CSS keywords. Every
field shows what its value comes to on this layer, and every field has the same slots, states, keys and token picker
([design-options-fields.md](design-options-fields.md)).

Each field offers the tokens whose kind fits it, marks a value that isn't a token with the nearest token one click away,
and treats Tailwind's documented steps as on the system, though steps of opacity, z-index, border width and duration
only while the project has no tokens of their kind. Semantic and Primitive, kinds and overrides are in
[design-options-tokens.md](design-options-tokens.md); whether values off the system are allowed is call 1.

**What the design model needs.** `NodeStyle` stores each value with its form (`{ token }`, `{ step }`, `{ value }`,
`{ keyword }`, `{ expr }`, `{ size }` for width and height, and `{ fr }` for grid tracks), so whether a value is a token
is never guessed from its text. Fills, shadows, filters, transforms and transitions become lists, sides and corners take
one value or four, and a CSS map holds the rest, in a new `.par` version. Frames draw the classes Parity writes,
compiled by the project's Tailwind, rather than inline styles, and every class reads back into the key and form it came
from. [design-options-code.md](design-options-code.md) has the details.

## Calls to make

These need Andrew's answer before the work they hold up starts. Each has a recommendation.

1. **Can a layer use a value that isn't a token?** PAR-194 keeps lengths off the scale but says colors, type, radius and
   shadows stay tokens, and PAR-186's color picker edits tokens rather than layers. Recommended: every field takes a
   value of its own, marked as not a token, with the nearest token one click away. A color picker that can only edit
   tokens, and gradients and shadows that can only be tokens, would fall short of the request and of Figma. Four levels
   per kind (Any value, Marked, Tokens only, Semantic only for colors), set in the project's `.lib.par` so CI reads
   them, with Allow here for a reasoned exception ([design-options-tokens.md](design-options-tokens.md), Levels).
2. **What does Stroke's position write?** CSS has no single stroke with Figma's inside, center and outside. Recommended:
   Stroke owns `border` and `outline`, and Effects alone owns `box-shadow`. Include in layout, on for a new stroke,
   writes `border`, as Figma's updated auto layout counts an inside stroke (July 2026). Off, Inside, Center and Outside
   write `outline` with an offset of minus the width, minus half the width, or 0, drawn above the children that aren't
   positioned. A layer has one of each, so Stroke's + adds the other. Per-side widths, colors and styles and gradient
   strokes need Include in layout. [design-options-panel.md](design-options-panel.md), Stroke, has the details.
3. **Are Chromium-only properties offered?** Recommended: yes, marked as principle 7 says, since frames draw them and
   many projects target current browsers. A project setting for its target browsers can hide them later.
4. **One stored key per property?** Recommended: yes, as principle 3 says, so the CSS row can't hold a value that fights
   a control, and a list shown in two sections (`filter`, `background-image`) is still one declaration.
5. **Section order.** Recommended: Figma's order, with the layer's own content near the top: Position, Size, Layout,
   Spacing, Appearance, then the content section the layer has (Text, Image or Icon), then Fill, Stroke, Effects,
   Selection colors, Transform, Text inside for layouts, components and instances, Interaction, Motion, CSS. Size comes
   before Layout as Figma's W and H come before auto layout, and Spacing follows Layout so padding sits next to gap.
6. **What is a text style?** Recommended: in Tailwind projects, a `--text-*` size that pairs a weight or letter spacing,
   usually with a line height (Tailwind v4's own), or a project utility that sets only type when the style names a font
   or sets what a size can't pair (OpenType features, case); a DTCG typography token compiles to the same. Overriding
   one row keeps the style and marks the override, and a style can differ per breakpoint. PAR-135 waits on this.
   [design-options-tokens.md](design-options-tokens.md), What a text style is, has the detail.
7. **What a state writes.** Each state names its trigger: a pseudo-class (`:hover`), an attribute (`[data-state=open]`)
   or a prop. Recommended: pseudo-classes and attributes by default, as Webflow's and Plasmic's states are, with a prop
   only when the component's code has one, written as Tailwind variants. A component's state reaches the layers inside
   through `group-*`, and a sibling's or child's through `peer-*` and `has-*`
   ([design-options-code.md](design-options-code.md), States).
8. **What a viewport's patch writes.** A viewport's patch applies in that viewport alone, as render.ts draws it, while
   Tailwind's `md:` applies from its width up. Recommended: code written mobile-first, each wider viewport adding its
   prefix only where its value differs from the one below (`p-4 md:p-6 lg:p-8`). The frame draws a viewport's values
   from its prefix up to the next one, so it draws what the code does ([design-options-code.md](design-options-code.md),
   Viewports).
9. **A class Parity can't read back.** decisions.md says Parity asks whether to freeze the component as code or
   overwrite the edit. Recommended: a third answer, offered first, keeps the class on the layer as a From the code row,
   written back unchanged on every later write. It saves a whole component from being frozen over one class
   ([design-options-code.md](design-options-code.md)).
10. **What does a typed % mean in a length?** Today it's a share of the value there, as in Figma's dimension fields
    (editor.md, CAN-48). Recommended: in a field whose CSS takes a percentage, `%` is CSS's percentage, as Webflow,
    Framer's Relative size and DevTools read it, written as a fraction step where one exists (50% → `w-1/2`); Figma's
    share is typed as maths (`*0.5`), and the hint says so. `100%` width is one of the most common things typed on the
    web, and a `%` that means something else breaks a panel a developer reads as code. PAR-194 decides the stored form
    ([design-options-values.md](design-options-values.md), Length and percentage).

## Order of work

Each line would be an issue, after the calls above. They're ordered by what designers reach for first. The new controls
(the box-model widget, the paint editor, the corner and side fields, the effects stack, the track chips) are designed in
Storybook as clickable explorations first, for Andrew's approval, before any goes into the app.

0. [design-options-fields.md](design-options-fields.md)'s field anatomy and states as one shared field component in
   Storybook, used by every control after it.
1. The value model and the CSS map in `NodeStyle`, with the one-owner rule (after PAR-194, which settles lengths), with
   read-back of every form it writes, and frames drawn from the classes Parity writes, compiled by the project's
   Tailwind, rather than inline styles.
2. Pickers by kind with previews (PAR-143), and the color popover with its Custom and Tokens tabs (PAR-186). Tokens get
   a value per combination of modes.
3. Fills as a stack: color, linear, radial and conic gradients, and images, with the gradient editor on the canvas.
4. Strokes per side, with style and position, and corners each on their own, with corner shape.
5. Effects as a stack: shadows and rings, layer and background blur, and adjustments.
6. Position: sticky and fixed, the pin box, and layer order. Fixed and Sticky previewed against the frame's window
   (CAN-25).
7. Layout: grid tracks of any size, areas, flow, baseline and reversed direction, and the box-model widget.
8. Text: decoration details, wrapping and truncation, vertical trim, OpenType and variable axes, and text styles
   (PAR-135).
9. Transform, Image, Interaction and Motion.
10. The CSS row, with completion and checks, and Copy as CSS and Tailwind from each section.
11. Labels colored by where a value comes from, the Baseline marks, and hints for values that do nothing.
12. Off-system values: a list in the Tokens panel of every value off the system in the open design, grouped by kind and
    by nearest token, with Replace all, and how many layers use each token. The agent's lint reads the same list. It
    runs without the app too, from the same package (`@parity-app/tokens`), so a project's CI can fail on values below
    its level.
