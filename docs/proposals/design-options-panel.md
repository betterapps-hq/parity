# Design options: the panel, section by section

Part of [design-options.md](design-options.md) (PAR-652). For each section of the Design tab: when it shows, its rows,
the control each row uses, the CSS it writes, and what Figma has in its place. What a section's More holds is listed
after its rows; [design-options-css.md](design-options-css.md) has every property. How each field shows and edits its
value is in [design-options-fields.md](design-options-fields.md) and
[design-options-values.md](design-options-values.md). Rows marked "today" exist now.

The sections, in the order call 5 recommends: Position, Size, Layout, Spacing, Appearance, then the layer's own content
section (Text for text, Image for images, Icon for icons), then Fill, Stroke, Effects, Selection colors (for a layout or
several layers), Transform, Text inside for layouts, components and instances, Interaction, Motion and CSS. Every row
can be set for one state and one mode, as rows are today, and its label is colored by where its value comes from.

A section with nothing set shows only its title and +: Fill, Stroke, Effects, Transform, Interaction and Motion start
this way, as Stroke does today with its Add button, and so does Spacing on text, image and icon layers. Inside a
section, a row the layer rarely needs (Min and max, Margin, Layer order on a layer In layout or Relative, Corner shape)
shows once it's set, or is added from the section's More or from the field it belongs to. Each section's menu has Copy
as CSS and Copy as Tailwind. Copy properties and Paste properties carry a whole layer's style, or one section's, to the
selected layers, as Figma's Ctrl+Alt+C and Ctrl+Alt+V do.

## Which layers get which sections

Parity's layers are the node types in `@parity-app/core`: a layout (a flex or grid box, the only node with children), a
text layer, an image, a component (an instance of a code component, whose style lands on its root element over the
component's own classes) and an instance (of a component design). A screen's or component design's root is a layout; a
frame sizes itself.

| Section          | Layout                          | Text                                                                                                                            | Image                                 | Component or instance                         |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| Position         | Yes, but not a root             | Yes                                                                                                                             | Yes                                   | Yes                                           |
| Size             | Yes                             | Yes, with Resizing                                                                                                              | Yes                                   | Yes                                           |
| Layout           | Yes                             | No                                                                                                                              | No                                    | No: its children are its code's               |
| Spacing          | Yes                             | Yes, as a title with + until set                                                                                                | Yes, as a title with + until set      | Yes; for an icon, as a title with + until set |
| Appearance       | Yes                             | Yes                                                                                                                             | Yes                                   | Yes                                           |
| Text             | As Text inside, after Transform | Yes, after Appearance                                                                                                           | No                                    | As Text inside; not for icons                 |
| Image            | No                              | No                                                                                                                              | Yes                                   | No                                            |
| Icon             | No                              | No                                                                                                                              | No                                    | An icon component only                        |
| Fill             | Yes                             | Yes, titled Background (see Fill)                                                                                               | Yes, behind the image                 | Yes                                           |
| Stroke           | Yes                             | Yes (today); the text outline is Text's Outline                                                                                 | Yes                                   | Yes                                           |
| Effects          | Yes                             | Yes: Drop shadow shadows the text (`text-shadow`); with a fill or stroke, its Shadow of toggle picks Text or Box (`box-shadow`) | Yes                                   | Yes                                           |
| Selection colors | Yes, when it uses a color       | Only in a selection of several layers                                                                                           | Only in a selection of several layers | Only in a selection of several layers         |
| Transform        | Yes                             | Yes                                                                                                                             | Yes                                   | Yes                                           |
| Interaction      | Yes                             | Yes                                                                                                                             | Yes                                   | Yes                                           |
| Motion           | Yes                             | Yes                                                                                                                             | Yes                                   | Yes                                           |
| CSS              | Yes                             | Yes                                                                                                                             | Yes                                   | Yes                                           |

With several layers selected, a section shows when it applies to every one of them, except Text, which shows for the
text layers of a mixed selection, as Resizing does today. A code component takes the layer's style through `className`
when its props take one; how its own classes and the layer's are merged, and what happens when they aren't, is in
[design-options-code.md](design-options-code.md), Code components.

The layout a layer sits in adds rows:

| Parent                 | Rows it adds to the child                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| A flex layout          | Fill and Hug on both axes, Align self (with baseline), and under More grow, shrink, basis and order |
| A grid                 | Span, start lines, Align self and Justify self, and under More end lines and the area               |
| A Block layout         | Width Fill and Hug, Margin auto; no Align self, Gap or Span                                         |
| Absolute or fixed      | The pin box's insets; none of the rows above                                                        |
| Sticky or relative     | The flex or grid rows above, and the pin box                                                        |
| None (a design's root) | None of these: Fill is the whole frame                                                              |

A layout that wraps or is a grid shows a row gap and Lines on itself, not on its children. A text layer's and a layout's
tag (a heading, paragraph or label; a section, list or button) is the name row's, at the top of the tab, since it's HTML
rather than CSS.

## Position

Shows for every layer but a design's root.

| Row         | Control                                                                                                            | Writes                                                               | Figma                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Align       | Align buttons: left, center, right, top, middle, bottom, and Distribute for three or more layers (today: commands) | Align self or the layout's justify; on an Absolute layer, its insets | Figma's align buttons                                                                |
| Placement   | Toggles: In layout, Absolute, Fixed, Sticky; Relative under More (today: the first two)                            | `position`                                                           | Absolute position in auto layout; fixed and sticky only in prototype scroll settings |
| Insets      | The pin box, with presets (below), shown when Placement isn't In layout (today: four fields, Absolute only)        | `top`, `right`, `bottom`, `left`, `inset`                            | Constraints                                                                          |
| Layer order | Number field, with z-index tokens; shown by default when Absolute, Fixed or Sticky, otherwise under More           | `z-index`                                                            | None: order in Layers only                                                           |
| Rotation    | Angle field with a knob, and the canvas's rotate handle; clockwise, as CSS is                                      | `rotate`                                                             | Rotation, counter-clockwise                                                          |

The Align buttons are today's Align and Distribute commands (editor.md, "Arranging layers and designs"), moved to the
top of Position. On an Absolute or Fixed layer, Center aligns with the pin box's Center. The pin box is a field on each
side of a small box, each side pinned or not. The presets are Figma's constraints, each written in CSS:

| Preset         | Writes                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Left, Top      | `left`, `top`                                                                                  |
| Right, Bottom  | `right`, `bottom`                                                                              |
| Left and right | `left` and `right`, width unset, so it stretches                                               |
| Center         | `left: 0` and `right: 0` with `margin-inline: auto`, and `w-fit` when the width is Hug (below) |
| Scale          | `left` and `right` as percentages of the parent                                                |
| Fill parent    | `inset: 0`, Webflow's Full                                                                     |

Center needs a definite width, or `w-fit` for Hug, since an auto width between two insets stretches; Margin shows the
auto margins, and `translate` stays Transform's. Figma's Center keeps an offset d from the parent's center, written as
`left: d; right: -d` with `margin-inline: auto`, and the preset's field shows it.

Sticky shows the inset it sticks at and outlines the layout it scrolls inside, and says when a layout around it scrolls
or hides its overflow (`overflow: hidden`, `auto` or `scroll`), which stops it sticking, or when it's as tall as a
stretching flex or grid layout, offering Align self Start (`self-start`). Layer order needs nothing more on a child of a
flex or grid layout, where `z-index` works without `position`; only a child of a Block layout gets `position: relative`.
A layer with a Layer order paints above its parent's Inside or Center stroke, and the row says so. The row names the
stacking context it orders within and what makes it one.

Fixed and Sticky outline the frame's window and are previewed by scrolling in Play (decisions.md, CAN-25).

**More:** Relative placement, shown as a fifth toggle once set, Layer order on a layer In layout or Relative, Anchor
(name this layer as an anchor, or place it against one with a nine-spot `position-area` picker and fallbacks) and Float.

## Size

Shows for every layer. A layer inside a flex or grid layout also gets the rows that place it there.

| Row           | Control                                                                                                        | Writes                                                      | Figma                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Width, Height | W and H on one line, each a size field with one menu inside it (below), the aspect lock between them           | `width`, `height`, or what Fill and Hug write (below)       | W and H with Fixed, Hug, Fill                                   |
| Min and max   | Added from the Width or Height field's menu; each shows as its own row under that axis once set                | `min-width`, `max-width`, `min-height`, `max-height`        | Min and max width and height                                    |
| Aspect ratio  | A lock between the W and H fields; once locked, a ratio field (`16:9`) shows as its own row                    | `aspect-ratio`                                              | Lock aspect ratio, which holds while resizing but isn't written |
| Align self    | Menu (today, in flex)                                                                                          | `align-self`, and `justify-self` in a grid                  | Stretch only; a grid child aligns in its cell                   |
| Span          | Columns and rows spanned, or All (today, in a grid); start lines beside them; end lines and an area under More | `grid-column`, `grid-row`, `grid-area`                      | Grid auto layout's spans                                        |
| Resizing      | Text only: Auto width, Auto height, Fixed (today)                                                              | `width: max-content`, and `shrink-0` along a flex main axis | Text resizing                                                   |

The field and its menu are Size in [design-options-values.md](design-options-values.md); today it's a row each, with a
mode menu beside the field.

What a width or height writes depends on where the layer sits:

| Size                                         | Writes                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed                                        | `width` (`flex-shrink: 0` along a flex parent's main axis, as today)                                                                   |
| Fill along a flex parent                     | `flex: 1 1 0%` with `min-width: 0` (`flex-1 min-w-0`), as today; a share of 2 writes `flex-2 min-w-0`, or `flex-2 min-h-0` in a column |
| Fill across a flex parent                    | `align-self: stretch`, shown in Align self as Stretch; with a max on that axis, `w-full` and no `align-self`                           |
| Fill in a grid cell                          | Nothing, or `justify-self` or `align-self: stretch` when the parent aligns items; an image, `size-full`                                |
| Fill in a Block parent                       | A layout or text: nothing. An image, an Inline layout or a non-block component root: `w-full`                                          |
| Hug along a flex main axis                   | Nothing                                                                                                                                |
| Hug across a stretching parent, or in a grid | `fit-content` (`w-fit`)                                                                                                                |
| Outside a layout                             | `100%` for Fill and `fit-content` for Hug                                                                                              |

With a share of 2, siblings share space 1:2 without opening More, as Framer's 1fr and 2fr do. With a max on the cross
axis, Fill writes `w-full` so the parent's alignment places it, as Figma's does. A grid image needs `size-full`, since
an item with an aspect ratio aligns to start. A Fill height in a Block parent writes `100%` only when the parent's
height is definite. A crowded flex row can still shrink a Hug child below its content, which Figma's Hug doesn't do; the
row says so and offers Don't shrink (`shrink-0`).

A Fill child in a Hug parent: Figma turns the parent Fixed and Framer refuses it, while CSS draws the parent hugging the
child's content. Parity writes what's asked, and the field says "Fills a layout that hugs, so it hugs", with Make parent
fixed beside it. Double-clicking a layer's edge handle on the canvas sets that axis to Hug, as in Figma.

Locking the aspect ratio keeps the current ratio and sets the other axis to Auto, writing nothing on it, since a ratio
is ignored when both sizes are set, and says so (principle 8). In a flex layout that stretches its children, stretching
wins over the ratio, so the lock also writes `self-start` unless Align self is set. The ratio field offers named ratios
(Square, 4:3, 16:9, 21:9), and an image's own ratio first, as Framer's Fit Image does.

**More:** Grow, shrink and basis, as Webflow's presets (Shrink if needed, Grow if possible, Don't shrink or grow) with
numbers under Custom; Order, as First, Last or a number; Box sizing; and Grow with the text (inputs and text areas,
`field-sizing`); in a grid, end lines and an area. Setting Order marks the layout, since the reading order no longer
matches what's seen, and offers Reading order (`reading-flow`) from the CSS row as the fix.

## Layout

Shows for layouts. A flex box or a grid, as today, with direction, alignment and gap. Padding is in Spacing, next.

| Row              | Control                                                                                                                                     | Writes                                                                               | Figma                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Type             | Icon toggles: Vertical, Horizontal, Grid; Block under More (today: the three); Inline beside them when the parent is a Block layout (below) | `display`, `flex-direction`                                                          | Auto layout: vertical, horizontal, grid; freeform          |
| Wrap             | A toggle beside Type (today)                                                                                                                | `flex-wrap`                                                                          | Wrap; no reverse                                           |
| Alignment        | Nine-spot box and a distribution menu: Packed, Space between, around, evenly (today)                                                        | `align-items`, `justify-content`; in a grid, `justify-items` and `align-items`       | Alignment box; Auto gap is space between, evenly or around |
| Baseline         | A toggle under the box: align text on its first or last baseline                                                                            | `align-items: baseline` or `last baseline` (`items-baseline`, `items-baseline-last`) | Text baseline alignment                                    |
| Lines            | Menu, shown when wrapping or in a grid: Start, Center, End, Space between, Stretch                                                          | `align-content`                                                                      | Auto or space between, when wrapping                       |
| Gap              | One field, or columns and rows when wrapping or in a grid (today); takes negatives and Auto (below)                                         | `gap`, `row-gap`, `column-gap`                                                       | Gap; row gap when wrapping                                 |
| Columns and rows | Counts, or a line of track chips (below)                                                                                                    | `grid-template-columns`, `grid-template-rows`                                        | Grid tracks: fixed, fr or hug; no `minmax()` or auto-fill  |

There's no None: hiding a layer is Appearance's Visibility, so `display` has one owner. Inline (`inline-flex`,
`inline-grid`, `inline-block`, as buttons and badges are written) shows beside the types only when the parent is a Block
layout, since the browser makes every flex and grid item a block. When Type is Block, Gap, Alignment and Wrap are
hidden. Setting Reverse marks the layout, since the reading order no longer matches what's seen, and offers Reading
order (`reading-flow`) from the CSS row.

Gap takes a negative value for overlapping items (an avatar stack), as Figma's does. CSS `gap` can't be negative, so
it's written as a negative margin on each child but the last (`-space-x-2`), paired with Stacking's First on top. In a
Reverse direction layout it adds `space-x-reverse` (or `space-y-reverse`). It isn't offered while Wrap is on, since a
margin on each item but the last breaks wrapped lines. Gap's menu offers Auto, as Figma's does, which sets Space between
in Alignment and shows Auto in the field.

Columns and rows are counts, as today, with Figma's grid picker (drag across a small grid to pick 3 × 2), while every
track is the same size (`grid-cols-3`). Edit tracks in a count's menu, or sizing a track on the canvas, shows the tracks
as chips (Grid tracks in [design-options-values.md](design-options-values.md)), which go back to counts when the tracks
match again. A grid inside a grid offers Subgrid in a count's menu. A Fill track is written as `minmax(0, 1fr)`, as
`grid-cols-N` and today's render.ts do, so long content can't widen its column; plain `1fr` is offered as "Fill, grow
with content". Repeat's auto-fit (`repeat(auto-fit, minmax(16rem, 1fr))`) fits as many columns as there's room for,
which Figma can't say. In a reversed layout, the alignment box stays as it looks, and the editor writes `flex-end` where
needed.

**More:** Block, shown as a fourth Type toggle once set, Reverse direction (`flex-direction: *-reverse`), shown as a
toggle beside Wrap once set, Freeform (below), Areas (named and painted over the grid on the canvas), Flow (rows or
columns, and Dense), the size of tracks made by overflow (`grid-auto-rows`, `grid-auto-columns`), Dividers between
items, Text columns (count and width; the rule between them is Dividers' In the gap, `column-rule`), Stacking (Last on
top, as CSS paints; First on top, Figma's canvas stacking, writes descending `z-index` on the children) and Size
container (lets modes ask this layer's width rather than the screen's; its breakpoints are the container tokens, as
Tailwind v4's `@md:` reads `--container-md`).

Freeform is Figma's frame without auto layout: every child is Absolute, placed where it's dropped (`relative` on the
layout, insets on each child). Its width and height are Fixed or Fill, never Hug, since absolute children don't size
their parent.

Dividers between items come in two forms. On the items writes Tailwind's `divide-y` and `divide-x` with a color, width
and style: a border on each item but the last (Tailwind v4's `divide-*` targets `:not(:last-child)`), in every browser.
In the gap writes `row-rule` and `column-rule` (Chromium only, marked †), centered in the gap without moving the items.

Size container writes `@container` (`container-type: inline-size`), never `size`. It can't hug its width, so turning it
on makes a Hug width Fill. It also makes a stacking context and a containing block for Absolute and Fixed layers inside,
so a menu inside can't rise above the layout's siblings. The row says both.

## Spacing

Shows for every layer. It follows Layout, so padding sits next to gap. On layouts, Padding shows by default. On text,
image and icon layers, Spacing starts as a title with + until a padding or margin is set, since padding on these is rare
(a badge is usually a layout with text in it).

| Row     | Control                                                                                                                                                         | Writes                  | Figma                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- |
| Padding | The four-sides field, two fields on a layout (today: two, with a per-side toggle); the box-model widget                                                         | `padding` and its sides | Auto layout's padding |
| Margin  | The four-sides field, shown once set or added from More, and the box-model widget's outer ring; takes `auto` and negatives (today: a sides field, as Padding's) | `margin` and its sides  | None                  |

The box-model widget is being tried in Storybook as Spacing's whole control, in place of these two rows, since it's the
easiest to understand: margin's ring around padding's around the layer's size, each side's value where the side is.
Hovering a value opens its field in a popover after a moment, and pressing it or Enter opens it at once, so the box
needn't fit a field, a unit menu or a token's chip on every side. Padding is hatched in its color, as the canvas shades
it, and margin is flat in its own within a dashed edge. Both are the canvas's padding pink for now. The Margin colors
story compares pairs that would tell them apart, beside the colors the canvas already uses for screens and layers,
components, modes, agents, the tab order and padding. Green padding with pink margin is the pair being tried, which
would change padding's color on the canvas too. Margin has canvas handles, as padding's and gaps' are today
(`SpacingHandles.tsx`), and hovering a side highlights it. Horizontal and vertical are written as `px-*` and `py-*`,
which v4 compiles to `padding-inline` and `padding-block`, so they follow writing direction; separate sides are physical
(`pl-4`), and a Logical switch under More writes `ps-*` and `pe-*`.

In a Block layout, vertical margins collapse, and a first or last child's margin passes through the layout's edge unless
it has padding or a stroke in layout; `overflow: clip` doesn't stop this. The Margin row says so (principle 10) and
offers Contain margins (`flow-root`).

**More:** Margin, until set, and Logical (`ps-*`, `pe-*`).

## Appearance

Shows for every layer.

| Row                 | Control                                                                                                | Writes                                                                  | Figma                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------- |
| Visibility          | The eye in the section's title: Shown, Hidden (keeps its space), Removed                               | `visibility: hidden`; Removed isn't rendered, or `hidden` in some modes | The eye in Layers                      |
| Opacity, Blend mode | One row: a percentage field (today), with opacity tokens, then the blend menu, previewed on the canvas | `opacity`, `mix-blend-mode`                                             | Layer opacity and blend mode           |
| Theme               | A theme button in the section's title, shown when the project has more than one theme (below)          | The theme's class or attribute on this layer (`dark`, `data-theme`)     | Appearance's variable modes on a frame |
| Radius              | The four-corners field; Full (today: one, as a token). Its corner popover holds Corner shape           | `border-radius` and its corners                                         | Corner radius, independent corners     |
| Corner shape        | In the corner popover: a smoothing slider, and a menu: Round, Squircle, Bevel, Scoop, Notch, Square    | `corner-shape`, Chromium only                                           | Corner smoothing                       |
| Clip content        | A toggle, and a menu: Clip, Scroll, Scroll when needed (today: a menu)                                 | `overflow`, and each axis and `overflow-clip-margin` under More         | Clip content                           |

Removed is the layer's eye in Layers (the node's `hidden` flag), which, like Figma's eye, hides the layer in the frame
and leaves it out of code. It can be set per state or viewport and bound to a `visible` prop. Removed in some modes
only, it writes `display: none` there and the layer's display where it shows (`hidden md:flex`), never `flex hidden`.
It's named Visibility because it has three values where Figma's eye has two.

Theme's menu lists each set of modes the project has (Theme, and others the Modes panel lists, such as Brand or
Density), each with Inherit, as Figma's variable-mode button lists each collection. A theme the root gives with no class
(Light) can be set inside another theme only if the project gives it a class too; the menu says so.

Clip content writes `overflow: clip` rather than today's `hidden`: it clips the same but doesn't make a scroll
container, so a sticky layer inside still sticks, as Framer changed in August 2025. Block layouts that relied on
`hidden` to contain floats or margins keep it. Each axis can clip on its own, which `hidden` can't.

A corner shape keeps its radius, which browsers without `corner-shape` draw instead, as Framer's squircle does. Figma's
"pass through" blend is CSS's default; Normal with a group's blend kept inside is `isolation: isolate`. **More:** Clip
content per axis and its clip margin (`overflow-x`, `overflow-y`, `overflow-clip-margin`), Isolation, Clip path (inset,
circle, ellipse or polygon, drawn on the canvas), Mask (an image or a gradient, such as fading an edge) and Color scheme
(light or dark form controls and scrollbars).

## Text

Shows for text right after Appearance, and for layouts, components and instances (not icons) as "Text inside" after
Transform, as today. It doesn't show for icons, whose color is Icon's. Text styles the whole text layer, since a text
layer's text is one string (`document.ts`). Styling part of it (a bold word, a link, a colored span), as Figma does for
selected characters with Mixed in each row, needs inline ranges in the model and gets its own issue; until then, Text
has no Mixed state for part of a text.

Typography preset, the section's first row, shows when the project has one
([design-options-tokens.md](design-options-tokens.md), What a typography preset is); in a stock Tailwind project, whose
sizes pair only a line height, Size's token shows its line height as From size. With a preset applied, the rows it sets
fold into its row as a summary ("Inter 20/28 Semibold"), as Figma's Typography does, marked with a lock and with a
disclosure to show them. Shown, they're locked to the preset's values, each with an Unlock button, and changing an
unlocked row overrides the preset there. An overridden row stays shown while the summary is closed, marked, with its
reset arrow, and picking the preset again takes back every override. Detach is an icon button beside the picker. A layer
with no preset whose type matches one, or nearly does, says so under the row, with Use one click away (call 6, in
[decisions.md](../decisions.md#the-design-panels-calls-par-652)).

| Row                 | Control                                                                                                                 | Writes                                                                              | Figma                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Typography preset   | Picker of the project's typography presets (PAR-135); the rows it sets fold into it, locked, while it's applied         | the style's class (`text-xl`), or those rows' properties; never `font`              | Text styles                                                |
| Font                | Searchable list in each font, the project's fonts first, then Google Fonts (today: a token)                             | `font-family`                                                                       | Font family                                                |
| Weight and style    | Menu of the weights the font has (Semibold 600), a slider for a variable font; italics (today: nine weights and Italic) | `font-weight`, `font-style`                                                         | Font style                                                 |
| Size                | Length field with font size tokens, px, rem and `clamp()` (today: a token)                                              | `font-size`, and what the size token pairs, unless those rows are set               | Size                                                       |
| Line height         | Auto (`normal`), a multiple, px or %; leading and spacing tokens and spacing steps (below)                              | `line-height`, beside the size (below)                                              | Line height                                                |
| Letter spacing      | Field in em, % or px; tracking tokens (today: a token)                                                                  | `letter-spacing`; a % as em (5% → `tracking-[0.05em]`)                              | Letter spacing                                             |
| Color               | Solid, or a gradient when the text layer has no fill (today: a token)                                                   | `color`; a gradient as `bg-clip-text text-transparent` over the gradient            | Text fill                                                  |
| Align               | Left, Center, Right, Justify (today), then Top, Middle and Bottom, shown when the height is fixed                       | `text-align` (`text-start`, `text-end`), as today; `align-content`                  | Horizontal and vertical alignment                          |
| Decoration and case | Toggles: Underline, Strikethrough, Overline, with a popover for their details (below); then Case (below)                | `text-decoration-*`, `text-underline-offset`; `text-transform`, `font-variant-caps` | Underline and strikethrough with details; Case, small caps |
| Wrap                | Wrap, Balance, Pretty, No wrap                                                                                          | `text-wrap`                                                                         | Wrap style: Auto, Balance, Pretty (2026)                   |
| Truncate            | Max lines, with an ellipsis (today)                                                                                     | what Tailwind's `line-clamp-N` writes; one line, `truncate`                         | Truncate text, max lines                                   |

Font and Weight are the Font family and Weight types in [design-options-values.md](design-options-values.md), which also
cover missing fonts and faked weights; Weight lists the font-weight tokens the font has a face for first.

Line height unset with a size token shows the size's paired line height, labeled From size
([design-options-code.md](design-options-code.md), Line height beside a size). A gradient Color writes
`bg-clip-text text-transparent` over the gradient. Align is labeled Left and Right in a left-to-right layer while it
writes `start` and `end`.

Decoration's popover has style (solid, double, dotted, dashed, wavy), color, thickness, offset, skip ink and skip
spaces, underline position and inset. Case is As typed, Uppercase, Lowercase, Title case or Small caps (today: the first
four). Max lines of one writes `text-overflow: ellipsis` with the `overflow` and `white-space` it needs.

On a layout, Text inside shows only properties that inherit: Typography preset, Font, Weight and style, Size, Line
height, Letter spacing, solid Color, horizontal Align, Case, Wrap and the inheriting More entries; the rest would write
`background-image` and `align-content`, which the layout's own Fill and Lines own. Truncate on Auto width text switches
it to Fixed, and Wrap is hidden there, since text as wide as its line never wraps or truncates. With a gradient Color,
Decoration's color needs a value of its own, since `currentColor` would be transparent, and the row says so.

Rows Figma pairs share a line (Weight and style with Size, Line height with Letter spacing, Wrap with Max lines), so a
text layer shows eight lines rather than eleven.

**More:** Vertical trim (`text-box: trim-both cap alphabetic`, shown once set), Word spacing, Paragraph indent,
Justification, Breaking (`word-break`, `overflow-wrap`, hyphens), OpenType (a Tabular numbers toggle first, then number
styles, fractions, ligatures, superscript and subscript, stylistic sets, as Figma's Details), Variable axes (a slider
per axis, width as `font-stretch`, and `font-synthesis`), Direction and writing mode, and Outline
(`-webkit-text-stroke`, with `paint-order` to draw it outside the glyphs). Figma's paragraph spacing is a layout's gap
or `margin-block`, not a property of one text layer. Inline alignment (`vertical-align`) and list markers are the CSS
row's: a text layer in a flex or grid layout is a block, and text layers are never li.

## Image

Shows for images, videos and other replaced elements, right after Appearance.

| Row         | Control                                                                                                                                           | Writes            | Figma                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------- |
| Source      | The project's images (`public/images/`), Replace, and an image dropped or pasted onto the row or the layer, which is copied into `public/images/` | `src`             | Image fill            |
| Fit         | Fill (cover), Fit (contain), Stretch, Original size, Shrink to fit, with the CSS keyword in each option's hint                                    | `object-fit`      | Fill, Fit, Crop, Tile |
| Position    | Nine-spot box, and X and Y                                                                                                                        | `object-position` | Crop                  |
| Adjustments | One entry of sliders: brightness, contrast and saturation centered on no change, then hue (Filter list)                                           | `filter`          | Image adjustments     |

`filter` is one list, and Effects and Image show different entries of it. Adjustments keeps Tailwind's order, so it
becomes utilities, and a filter read from code in another order is one Custom entry (Filter list in
[design-options-values.md](design-options-values.md)). Alt text is the Accessibility tab's. **More:** Crop
(`object-view-box`, Chromium only) and Rendering (pixelated, for pixel art).

## Icon

Shows for icons and other SVGs placed as layers, right after Appearance.

| Row          | Control                                          | Writes                                                                                       |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Color        | Color popover; follows the text color by default | `color`, which `currentColor` icons draw in                                                  |
| Stroke width | Number field, with border width tokens           | The icon's `strokeWidth` prop where the component takes one (Lucide); a token as CSS (below) |

A border width token goes in CSS (`stroke-(length:--…)`), since an SVG presentation attribute can't hold `var()`. Icon's
Color is Text's Color for an icon component (one owner, `color`), so Text doesn't show for icons. **More:** a fill and
stroke of its own, for an SVG that doesn't draw in `currentColor`.

## Fill

Shows for every layer; on text, it's a highlight or badge behind the text (today). A stack of fills, the top one first,
as in Figma (Paint stack in [design-options-values.md](design-options-values.md)). With nothing set, it's a title with
+. A gradient token is one fill's paint, chosen in that fill's paint editor. There's no token button for the whole
section, since a fill stack can hold a token and other fills at once.

On a text layer, the section's title reads Background, and its + menu starts with Text color, which opens Text's Color,
then Background (the highlight behind the text). With no fill, the empty title says "Text color is in Text". A text
layer brought from Figma has its fill read as Text's Color ([design-options-research.md](design-options-research.md),
Bringing a design from Figma).

| Row       | Control                                                                                                 | Writes                                                                   | Figma                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Each fill | A preview, the fill's type and value, the color's alpha (for a gradient, all its stops'), the eye and − | `background-color` for the bottom solid, `background-image` for the rest | Fills: solid, linear, radial, angular and diamond gradients, image, video, pattern, shader |

The preview opens the paint editor, with a tab for each type: Solid (the color popover); Linear, Radial and Angular:
stops on a bar and handles on the canvas ([design-options-values.md](design-options-values.md), Paint stack); and Image.
A solid fill's opacity is its color's alpha (design-options-values.md, Percentage and opacity); an image fill has none
per layer, so the layer's Opacity is offered instead. Fill writes longhands, never the `background` shorthand, so it
doesn't reset `background-clip`.

Each fill's own blend mode writes `background-blend-mode`, and its clip (Border, Padding, Content, Text) writes
`background-clip`. Figma's image adjustments apply to a whole layer in CSS (`filter`), so they're in Image for image
layers and in Effects for the rest.

**More:** Fixed, which stays put as the page scrolls (`background-attachment: fixed`). It's drawn against the editor's
window rather than the frame's, and ignored by iOS Safari, so it's previewed only in Play.

## Stroke

Shows for every layer, text included (today); the text outline is Text's Outline. With nothing set, it's a title with +
(today it's a title with Add). A border token for the whole section is chosen from the section title's token button.
Color, Width and Style fold into its row, as for any composite token
([design-options-values.md](design-options-values.md), Composite token). On a text layer, + starts with Outline the text
(Text's Outline), then Border around the box.

| Row          | Control                                                                                                           | Writes                                                                            | Figma                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Border token | Token chip in the title row; border tokens                                                                        | `border` from the token                                                           | Stroke style                                            |
| Color        | Swatch and color popover, or a gradient paint (today: a token)                                                    | `border-color` or `outline-color`, always with the stroke (below)                 | Stroke paint                                            |
| Width        | The four-sides field ([design-options-values.md](design-options-values.md)); today: 1, 2, 4 or 8                  | `border-width` and its sides, or `outline-width`                                  | Stroke weight, per side                                 |
| Style        | Menu: Solid, Dashed, Dotted, Double; Groove, Ridge, Inset and Outset under More styles in the menu (today: three) | `border-style` or `outline-style`                                                 | Dash and gap lengths, or a custom pattern               |
| Position     | Inside, Center, Outside, and an Include in layout toggle beside them (call 2)                                     | `border`; or `outline` with `outline-offset` of minus the width, minus half, or 0 | Inside, center, outside; inside counts in layout (2026) |

Color is always written with the stroke (`border-border`, or the token), since Tailwind v4's default border color is
`currentColor`, unless the project's base styles already give every element one (shadcn's
`* { border-color: var(--border) }`), which the label shows (principle 6).

Include in layout writes `border`, which takes space as Figma's inside stroke does in its updated auto layout, and is on
for a new stroke (1px `border`, as today's Stroke Add and Tailwind's `border` write). A frame brought from Figma's
legacy layout keeps its "Strokes included in layout" setting; a designer who wants an inside stroke that doesn't move
the content turns it off. A border is always inside the box, so choosing Center or Outside turns Include in layout off,
and per-side widths, colors or styles or a gradient stroke turn it on; each says so.

With Include in layout off, Inside writes `outline` with `outline-offset` of minus its width, Center minus half, and
Outside 0, all following the radius in Chromium. An outline is drawn above the layer's content and its children that
aren't positioned, as Figma's strokes are. A child that's placed, has a Layer order or makes a stacking context is drawn
over it; when one covers an Inside or Center stroke, the Position row says so and offers Include in layout. So a layout
gets `position: relative` only when it needs it ([design-options-code.md](design-options-code.md), Frames add only what
code writes).

A layer can have a border and an outline at once (a stroke in layout and a focus ring): Stroke's + adds whichever the
first doesn't use. In the Focus or Focus visible state, Stroke opens with its outline shown, Offset beside Width. An
outline on the base state replaces the browser's focus ring, so on a layer that takes focus, a stroke that isn't in
layout says so and offers a focus ring: that outline changed in Focus visible, or a Ring in Effects
(`focus-visible:ring-3`, as shadcn writes it). An inset ring is drawn under the children, so a child that fills the
frame hides it; it's a Ring in Effects, not a stroke.

A gradient stroke keeps the radius by writing the fills as `padding-box` layers above a `border-box` gradient
(`background-clip` and `background-origin`), with `border-color: transparent`, so every fill, the bottom solid included,
becomes a layer. It needs a solid border style and an opaque bottom fill, or the gradient shows through, and the row
says so. These layers are set by another control ([design-options-css.md](design-options-css.md)) and shown in Fill as
set by Stroke. `border-image` ignores radius, so it stays in the CSS row. Figma's dash lengths, caps and joins have no
CSS for a box's border; an SVG's own strokes have them, in its file (Icon's SVG strokes and geometry, Left out, in
[design-options-css.md](design-options-css.md)).

## Effects

Shows for every layer. A stack of effects, added from + as a drop shadow and changed by the type menu its details start
with (Ring included), as in Figma; with nothing set, it's a title with +. A shadow token is one entry; its color can be
overridden (`shadow-lg shadow-black/20`), and any other part offers Detach. Blur and drop shadow tokens are their own
entries' values.

| Effect                 | Control                                                                                                                | Writes                                                                         | Figma                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------- |
| Drop shadow            | X, Y, blur, spread, color, its X and Y also set by dragging in an offset pad; Follow shape (below)                     | `box-shadow`; `text-shadow` on text; `filter: drop-shadow()` with Follow shape | Drop shadow            |
| Inner shadow           | The same, inside                                                                                                       | `box-shadow: inset …`                                                          | Inner shadow           |
| Ring                   | Width and color, and Inset; a ring is a spread with no offset or blur                                                  | `box-shadow: 0 0 0 W c` (`ring-W ring-c`), inset as `inset-ring-W`             | None: a stroke         |
| Layer blur             | Blur, with blur tokens                                                                                                 | `filter: blur()`                                                               | Layer blur             |
| Background blur        | Blur, with blur and backdrop blur tokens; says when what it can see is cut short (below)                               | `backdrop-filter: blur()`                                                      | Background blur        |
| Adjustments            | One entry of sliders: brightness, contrast and saturation centered on no change, then hue, grayscale, sepia and invert | `filter` functions, in Tailwind's order (Filter list)                          | Image adjustments only |
| Background adjustments | The same sliders, for what's behind; its hint says "brightness, contrast and saturation of what's behind"              | `backdrop-filter` functions                                                    | None                   |

Follow shape draws a drop shadow around what's drawn rather than the box, with no spread, and offers drop shadow tokens;
it's on by default for icons and images with transparency. On a text layer with no fill or stroke, Drop shadow writes
`text-shadow` (no spread), as Dev Mode does, and offers text shadow tokens; with a fill or stroke, a toggle picks Shadow
of: Text or Box.

Background blur says when what it can see is cut short: an ancestor with opacity below 100%, a filter, a mask, a clip
path, a blend mode or its own backdrop filter becomes the backdrop root, and nothing behind that is blurred. It also
says when the layer's own fill is opaque, which hides the blur.

Box shadows are written into four of Tailwind's `box-shadow` slots (design-options-values.md, Shadow list), and the list
shows them in two groups, Inside then Outside, in the order they paint, with a Follow shape drop shadow after them.

The section's menu also offers two presets. Layered shadow is one entry that keeps its elevation and softness (Lists in
[design-options-fields.md](design-options-fields.md)); Frosted glass becomes normal entries in Fill and Effects. Layered
shadow writes several shadows that can be saved as one token. Frosted glass, the closest CSS comes to Figma's glass, is
a Background blur, a translucent fill (or white at 10%), a 1px inner shadow highlight and `saturate()` behind, in the
project's tokens where they exist and marked where they don't. Figma's noise, texture and progressive blur have no CSS;
a progressive blur can be a background blur with a gradient mask, once masks are in. Figma's blur is about twice CSS's,
so a design brought from Figma halves it, and the Blur field's hint says so
([design-options-research.md](design-options-research.md), Bringing a design from Figma).

## Selection colors

Shows when a layout or several layers are selected and use at least one color. It lists each color used inside them
(fills, strokes, text, shadows) once, token or not, and editing one changes it everywhere. A color that isn't a token
has Replace with token, offering the nearest token ([design-options-tokens.md](design-options-tokens.md)) at the color
level, so a design can be brought onto its tokens in one pass. It shows up to six swatches, with See all, as Figma's
does.

## Transform

Shows for every layer, as a title with + until something in it is set. Rotation is Position's. Move, Scale and Origin
are fixed rows, not a list, since CSS applies them in its own order (Transform in
[design-options-values.md](design-options-values.md)).

| Row    | Control                                                         | Writes                 | Figma                                   |
| ------ | --------------------------------------------------------------- | ---------------------- | --------------------------------------- |
| Move   | X and Y fields, in any length; % is of the layer's own size     | `translate`            | None: X and Y move the layer            |
| Scale  | Percentage, X and Y linked or not; Flip horizontal and vertical | `scale`, flips as `-1` | Flip only                               |
| Origin | Nine-spot box, and a dot on the canvas while Transform is open  | `transform-origin`     | A rotation origin, moved while rotating |

These move how a layer is drawn, not where the layout puts it, so nothing around it moves: the panel says so under the
section's title the first time it's used. **More:** Origin box (`transform-box`, which box the origin is measured from),
Skew and the full transform list in its order, and 3D: the perspective a parent gives what's inside it, rotating about X
and Y, whether the back shows, and keeping children in 3D (`transform-style`). Perspective tokens are offered there.

## Interaction

Shows for every layer, as a title with + until something in it is set.

| Row                 | Control                                        | Writes                 |
| ------------------- | ---------------------------------------------- | ---------------------- |
| Cursor              | Menu with each cursor drawn, and cursor tokens | `cursor`               |
| Clicks pass through | Toggle                                         | `pointer-events: none` |

**More:** Text selection, Accent and caret colors and caret shape for form controls, Resize handle, Native look
(`appearance`), Scrolling (smooth, overscroll, scrollbar width, color and gutter) and Scroll snap (on a layout, how it
snaps; on a child, where it lands).

## Motion

Shows for every layer, as a title with + until something in it is set. An animation token is the Animation row's value,
and a transition token a transition's. Easing fields are the curve and spring editor (Easing and spring in
[design-options-values.md](design-options-values.md)).

| Row             | Control                                                                                                                            | Writes                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Transitions     | A list: what changes (All, Colors, Opacity, Transform, Shadow, or a property), duration, easing, delay                             | `transition` ([design-options-values.md](design-options-values.md), Transition list) |
| Animation       | The project's `@keyframes` and animation tokens; duration, easing, delay, iterations, direction, fill mode; a Trigger menu (below) | `animation`, and a trigger or timeline (below)                                       |
| Appear          | Fade, Slide, Scale and Blur presets with duration, easing and delay; played when first drawn, or on scrolling into view            | `@starting-style` with a `transition` (`starting:`, `transition-discrete`)           |
| Hover and press | Shortcuts that add a Hover or Pressed state with scale, move, rotate or opacity, and a transition                                  | the state's patch and `transition`                                                   |

Transform in Transitions covers `translate`, `scale` and `rotate` too (`transition-transform`), and Colors what
`transition-colors` does. Animation's Trigger is On load, In view (playing once, Chromium only, marked †) or While
scrolling, with its range. Appear can animate from `display: none`, and in view it uses Animation's In view trigger.
What each trigger writes is in [design-options-code.md](design-options-code.md), Animation triggers.

These are Framer's Appear, Hover, Press and Scroll effects, written as CSS a developer can keep. `@starting-style` is
kept beside the layer's states. When a state changes something with no transition, the section offers one.

Appear, Animation and the Hover and press movement are written under `motion-safe:`. A Reduced motion choice in the
section's menu sets what shows instead (nothing, or a fade) as `motion-reduce:`, and Play can preview it, as DevTools'
rendering emulation can.

**More:** Animate to auto sizes (`interpolate-size`), Named timelines (so one layer's scrolling drives another layer's
animation) and View transitions (name, class, group and scope).

## CSS

Always the last section. A list of declarations, one a row, `property: value` (Raw CSS value in
[design-options-values.md](design-options-values.md)), with + to add one.

- **Completion** of property names from the ledger, with each one's Baseline mark, and of values from what the property
  takes: its keywords, and tokens, written as `var()`.
- **Checked as typed** with `CSS.supports`, after filling in tokens, as the token editor checks values (PAR-569). A
  property a control owns opens that control instead.
- **Paste CSS or classes.** Pasting a block of declarations (from DevTools or a code file) or a string of Tailwind
  classes into the CSS section gives each declaration to the key that owns it and keeps the rest as rows. What can't be
  read is listed, not dropped.
- **Classes.** A field at the top of the section shows the layer's classes as Copy as Tailwind writes them, for the
  state and mode shown, as Chrome DevTools' `.cls` pane lists an element's classes. Typing in it
  (`px-4 py-2 rounded-md hover:bg-primary/90`) reads each class back into the key that owns it
  ([design-options-code.md](design-options-code.md), What's written reads back), and the controls above fill in. A class
  it can't read stays a From the code row. It's a view of the same keys, not a second store, so the panel and the field
  can't disagree. Typed classes follow the project's levels as any field does.
- **Off without deleting:** a checkbox on each row ([design-options-fields.md](design-options-fields.md), Lists and
  States).
- **Tokens set here:** a token given its own value for this layer and everything inside it, edited with the token's own
  editor, listed by name and marked as an override of the system. Under Tokens only, its value must be on the system:
  another token (`--primary: var(--brand-600)`, Chakra's `colorPalette`, a shadcn theme scoped to one card), or a value
  Levels always allows ([design-options-tokens.md](design-options-tokens.md), Levels).
- **From the component's code,** read-only: what a component's own classes set on its root, so a designer can see why it
  looks as it does without opening the file. Where a code component's own class sets a property this layer also sets,
  whichever value loses shows struck through under the row (the component's when the layer's wins, as DevTools shows an
  overridden declaration; the layer's otherwise, as in [design-options-code.md](design-options-code.md), Code
  components), and Open in code goes to the line that sets it, as Onlook's right-click does.

Pseudo-elements aren't layers. Placeholder and Selected text, and the conditions First, Last, Odd, Even and Only, are
states in the States menu ([design-options-code.md](design-options-code.md), States).
