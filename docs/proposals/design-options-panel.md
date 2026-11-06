# Design options: the panel, section by section

Part of [design-options.md](design-options.md) (PAR-652). For each section of the Design tab: when it shows, its rows,
the control each row uses, the CSS it writes, and what Figma has in its place. What a section's More holds is listed
after its rows; [design-options-css.md](design-options-css.md) has every property. Rows marked "today" exist now.

The sections, in the order call 5 recommends: Position, Size, Layout, Spacing, Appearance, then the layer's own content
section (Text for text, Image for images, Icon for icons), then Fill, Stroke, Effects, Selection colors (for a layout or
several layers), Transform, Text inside for layouts, Interaction, Motion and CSS. Every row can be set for one state and
one mode, as rows are today, and its label is colored by where its value comes from. A color, shadow or other token-able
row set for a theme mode on a layer is written as `dark:bg-…` and marked, with the variant the project's CSS defines for
that theme (`@custom-variant dark (&:where(.dark, .dark *))`, or a `data-theme` variant). A theme with no variant can't
take a value per layer, and the row says so. A Semantic token already changes with the theme, so the mark offers that
token instead. For colors under Semantic only it's refused; under Tokens only, the value it sets for the theme must
itself be a token (`dark:bg-zinc-900`, not `dark:bg-[#18181b]`).

## Which layers get which sections

Parity's layers are the node types in `@parity-app/core`: a layout (a flex or grid box, the only node with children), a
text layer, an image, a component (an instance of a code component, whose style lands on its root element over the
component's own classes) and an instance (of a component design). A screen's or component design's root is a layout; a
frame sizes itself.

| Section          | Layout                          | Text                                                                                                             | Image                                 | Component or instance                         |
| ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| Position         | Yes, but not a root             | Yes                                                                                                              | Yes                                   | Yes                                           |
| Size             | Yes                             | Yes, with Resizing                                                                                               | Yes                                   | Yes                                           |
| Layout           | Yes                             | No                                                                                                               | No                                    | No: its children are its code's               |
| Spacing          | Yes                             | Yes, as a title with + until set                                                                                 | Yes, as a title with + until set      | Yes; for an icon, as a title with + until set |
| Appearance       | Yes                             | Yes                                                                                                              | Yes                                   | Yes                                           |
| Text             | As Text inside, after Transform | Yes, after Appearance                                                                                            | No                                    | As Text inside; not for icons                 |
| Image            | No                              | No                                                                                                               | Yes                                   | No                                            |
| Icon             | No                              | No                                                                                                               | No                                    | An icon component only                        |
| Fill             | Yes                             | Yes, titled Background: a highlight or badge behind the text (today)                                             | Yes, behind the image                 | Yes                                           |
| Stroke           | Yes                             | Yes (today); the text outline is Text's Outline                                                                  | Yes                                   | Yes                                           |
| Effects          | Yes                             | Yes: Drop shadow shadows the text (`text-shadow`), or the box (`box-shadow`) when the layer has a fill or stroke | Yes                                   | Yes                                           |
| Selection colors | Yes, when it uses a color       | Only in a selection of several layers                                                                            | Only in a selection of several layers | Only in a selection of several layers         |
| Transform        | Yes                             | Yes                                                                                                              | Yes                                   | Yes                                           |
| Interaction      | Yes                             | Yes                                                                                                              | Yes                                   | Yes                                           |
| Motion           | Yes                             | Yes                                                                                                              | Yes                                   | Yes                                           |
| CSS              | Yes                             | Yes                                                                                                              | Yes                                   | Yes                                           |

A code component takes the layer's style through `className` when its props take one, and Parity writes it there. The
component then merges its own classes with the layer's (`cn()` with tailwind-merge, as shadcn's components do), which is
what lets the layer's `bg-red-500` beat the component's `bg-primary`. Without a merge, which class wins depends on the
stylesheet's order, not the order of the classes. So the frame draws the component as its code would, and a value that
loses shows as overridden by the component's code, with Tailwind's `!` modifier (`bg-red-500!`) offered as the fix.
Parity checks whether the component's code merges `className` (`cn`, `twMerge`, or `clsx` with `twMerge`). When it
doesn't, the Design tab says so on the component and offers the `!` fix per row, rather than assuming a merge. A
component that takes `style` but not `className` gets only the rows that work inline, with no states or theme variants,
and says so. One that takes neither gets none, as today.

The layout a layer sits in adds rows:

| Parent                 | Rows it adds to the child                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| A flex layout          | Fill and Hug on both axes, Align self (with baseline), and under More grow, shrink, basis and order |
| A grid                 | Span, start lines, Align self and Justify self, and under More the area                             |
| A Block layout         | Width Fill and Hug, Margin auto; no Align self, Gap or Span                                         |
| Absolute or fixed      | The pin box's insets; none of the rows above                                                        |
| Sticky or relative     | The flex or grid rows above, and the pin box                                                        |
| None (a design's root) | None of these: Fill is the whole frame                                                              |

A layout that wraps or is a grid shows a row gap and Lines on itself, not on its children. A text layer's and a layout's
tag (a heading, paragraph or label; a section, list or button) is the name row's, at the top of the tab, since it's HTML
rather than CSS.

Every row also works in a patch: for a viewport, a state, a variant, or as an unset. A patch replaces a whole key, as
`applyPatch` does today for `padding`, so a key holding a list or four sides (radius, border width, fills) is written
whole in a patch: changing one corner in a state writes all four, the other three as the frame shows them there.

## Position

Shows for every layer but a design's root.

| Row         | Control                                                                                                                                                                                                                                | Writes                                                                                                                                    | Figma                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Align       | Align buttons at the top of Position: left, center, right, top, middle, bottom, and Distribute for three or more layers (today: the Align and Distribute commands, editor.md "Arranging layers")                                       | In a layout, Align self or the layout's justify, as today; on an Absolute or Fixed layer, its insets, with Center as the pin box's Center | Figma's align buttons                                                                |
| Placement   | Toggles: In layout, Absolute, Fixed, Sticky; Relative under More (today: the first two)                                                                                                                                                | `position`                                                                                                                                | Absolute position in auto layout; fixed and sticky only in prototype scroll settings |
| Insets      | The pin box: a field on each side of a small box, each side pinned or not, with presets (below) (today: four fields). Shown when Placement is Absolute, Fixed, Sticky or Relative (today: Absolute only); a layer in the flow has none | `top`, `right`, `bottom`, `left`, `inset`                                                                                                 | Constraints                                                                          |
| Layer order | Number field, with z-index tokens. Shown by default when Placement is Absolute, Fixed or Sticky; on a layer in the flow, under More                                                                                                    | `z-index`                                                                                                                                 | None: order in Layers only                                                           |
| Rotation    | Angle field with a dial, and the canvas's rotate handle; clockwise, as CSS is; a rotation brought from Figma, which counts counter-clockwise, flips its sign. Shift snaps the canvas handle to 15°, as Figma's does                    | `rotate`                                                                                                                                  | Rotation, counter-clockwise, so Dev Mode flips its sign                              |

The pin box's presets are Figma's constraints, each written in CSS:

| Preset         | Writes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left, Top      | `left`, `top`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Right, Bottom  | `right`, `bottom`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Left and right | `left` and `right`, width unset, so it stretches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Center         | `left: 0` and `right: 0` with `margin-inline: auto` on that axis, and `width: fit-content` when the width is Hug, since an auto width between two insets stretches; Margin then shows the auto margins. Not `translate`, which is Transform's. Figma's Center keeps the layer's offset from the parent's center, so an offset d is written as `left: d; right: -d` (or `top` and `bottom`) with `margin-inline: auto`, which moves the centered box by d without `translate`. It needs a definite width, or `w-fit` for Hug, as at 0. The Center preset's field shows the offset from center |
| Scale          | `left` and `right` as percentages of the parent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Fill parent    | `inset: 0`, Webflow's Full                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Sticky shows the inset it sticks at (`top: 0`) and outlines the layout it scrolls inside on the canvas, and says when a
layout around it clips or scrolls, which stops it sticking. In a flex or grid layout that stretches its children, a
sticky child as tall as the layout has no room to move, so the row says so and offers Align self Start (`self-start`).
Layer order needs nothing more on a child of a flex or grid layout, where `z-index` works without `position`; only a
child of a Block layout gets `position: relative`. A layer with a Layer order paints above its parent's Inside or Center
stroke, and the row says so. The row names the stacking context it orders within (the nearest ancestor that makes one,
named with its reason: opacity below 100%, a transform, Move, Scale or Rotation, a filter or backdrop filter, a mask or
clip path, a blend mode, isolation, Fixed or Sticky placement, a Size container, or a z-index in a layout), since a
value can't lift a layer out of it.

Frames are shadow roots whose root is a size container, so `position: fixed` places against the frame (decisions.md,
CAN-25). A frame that grows with its content therefore pins a Fixed bottom bar to the bottom of the whole page, and
nothing scrolls, so Sticky never sticks. Fixed and Sticky draw an outline of the frame's window (its viewport height
from frameGeometry) and are previewed by scrolling inside it in Play. Fixed says when an ancestor's transform, filter,
backdrop filter, perspective, `contain` or Size container turns it into an absolute layer.

**More:** Layer order on a layer in the flow, Anchor (name this layer as an anchor, or place it against one with a
nine-spot `position-area` picker and fallbacks) and Float.

## Size

Shows for every layer. A layer inside a flex or grid layout also gets the rows that place it there.

| Row           | Control                                                                                                                                                                                                                                 | Writes                                                                                                                                      | Figma                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Width, Height | W and H on one line, each a length field with a menu inside it for Fixed, Fill, Hug and Auto, and the aspect lock beside them, as Figma UI3's are (today: a row each, with a mode menu beside the field); a unit menu with the keywords | `width`, `height`, or what Fill and Hug write in the parent (below)                                                                         | W and H with Fixed, Hug, Fill                                   |
| Min and max   | Added from the Width or Height field's menu (Add min width, Add max width, and so on), as Figma UI3 does; each shows as its own row under that axis once set (today: a Min and max button shows all four)                               | `min-width`, `max-width`, `min-height`, `max-height`                                                                                        | Min and max width and height                                    |
| Aspect ratio  | A lock beside the W and H fields, as Figma's is. Once locked, a ratio field (`16 / 9`, with aspect tokens and named ratios) shows as its own row                                                                                        | `aspect-ratio`                                                                                                                              | Lock aspect ratio, which holds while resizing but isn't written |
| Align self    | Menu (today, in flex)                                                                                                                                                                                                                   | `align-self`, and `justify-self` in a grid                                                                                                  | Stretch only; a grid child aligns in its cell                   |
| Span          | Columns and rows spanned, or All (today, in a grid); start lines beside them; end lines and an area under More                                                                                                                          | `grid-column`, `grid-row`, `grid-area`                                                                                                      | Grid auto layout's spans                                        |
| Resizing      | Text only: Auto width, Auto height, Fixed (today)                                                                                                                                                                                       | `width: max-content`, and, along a flex parent's main axis, `flex-shrink: 0` (`w-max shrink-0`), as Fixed writes; width and height as above | Text resizing                                                   |

What a width or height writes depends on where the layer sits:

| Size                                         | Writes                                                                                                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed                                        | `width` (`flex-shrink: 0` along a flex parent's main axis, as today)                                                                                                                                                                                           |
| Fill along a flex parent                     | `flex: 1 1 0%` with `min-width: 0` (`flex-1 min-w-0`), as today. Fill takes a weight, typed as `2` or `2fr` in the field, as Framer's Fill takes 1fr and 2fr. It writes `flex: 2 1 0%` (Tailwind `flex-2`), so siblings share space 1:2 without opening More   |
| Fill across a flex parent                    | `align-self: stretch`, shown in Align self as Stretch. With a max width or height on that axis, `width: 100%` (`w-full`) and no `align-self`, so the parent's alignment places it: a centered parent centers a Fill child that stops at its max, as Figma does |
| Fill in a grid cell                          | Nothing, since grid items stretch, or `justify-self` or `align-self: stretch` when the parent aligns items. An image needs `width: 100%` and `height: 100%` (`size-full`), since an item with an aspect ratio aligns to start rather than stretching           |
| Fill in a Block parent                       | A layout or text: width nothing. An image, an Inline layout, or a component whose root isn't block-level: `width: 100%` (`w-full`). Height: `100%`, only when the parent's height is definite                                                                  |
| Hug along a flex main axis                   | Nothing. A crowded row can still shrink it to its narrowest content, wrapping the text inside, which Figma's Hug doesn't do. The row says so when it happens, and offers More's Don't shrink (`shrink-0`)                                                      |
| Hug across a stretching parent, or in a grid | `fit-content` (`w-fit`)                                                                                                                                                                                                                                        |
| Outside a layout                             | `100%` for Fill and `fit-content` for Hug                                                                                                                                                                                                                      |

A field showing Hug, Fill or Auto has the layer's measured size as its placeholder, as Width does today. A % height
needs a parent with a definite height; under a Hug parent the row says it acts as Auto. A Fill child in a Hug parent:
Figma turns the parent Fixed and Framer refuses it, while CSS draws the parent hugging the child's content. Parity
writes what's asked, and the field says "Fills a layout that hugs, so it hugs", with Make parent fixed beside it.
Double-clicking a layer's edge handle on the canvas sets that axis to Hug, as in Figma.

Locking the aspect ratio keeps the current ratio, writes `aspect-ratio`, and sets the other axis to Auto, which
`aspect-ratio` needs to take effect, saying so (principle 8). Locked, the layer writes `aspect-ratio` with one axis's
size and writes nothing on the other, never `fit-content`, since a ratio is ignored when both are set. In a flex layout
that stretches its children on the free axis, stretching wins over the ratio. So the lock also writes
`align-self: flex-start` (`self-start`), or keeps an Align self that's already set, and says so. The ratio field offers
named ratios (Square, 4:3, 16:9, 21:9) as Webflow's does. On an image, the ratio field offers the image's own ratio
first, as Framer's Fit Image sizing does.

**More:** Grow, shrink and basis, as Webflow's presets (Shrink if needed, Grow if possible, Don't shrink or grow) with
numbers under Custom; Order, as First, Last or a number; Box sizing; and Grow with the text (inputs and text areas,
`field-sizing`). Setting Order marks the layout, since the reading order no longer matches what's seen, and offers
Reading order (`reading-flow`) from the CSS row as the fix.

## Layout

Shows for layouts. A flex box or a grid, as today, with direction, alignment and gap. Padding is in Spacing, next.

| Row              | Control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Writes                                                                                                     | Figma                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Type             | Icon toggles: Vertical, Horizontal, Grid; Block under More (today: the three). Inline under More, shown as a toggle beside them only when the layer's parent is a Block layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `display` (`flex`, `grid`, `block`, or `inline-flex`, `inline-grid`, `inline-block`), `flex-direction`     | Auto layout: vertical, horizontal, grid; freeform          |
| Wrap             | A toggle beside Type (today)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `flex-wrap`                                                                                                | Wrap; no reverse                                           |
| Alignment        | Nine-spot box and a distribution menu: Packed, Space between, around, evenly (today)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `align-items`, `justify-content`; in a grid, `justify-items` and `align-items`                             | Alignment box; Auto gap is space between, evenly or around |
| Baseline         | A toggle under the box: align text on its first or last baseline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `align-items: baseline` or `align-items: last baseline` (Tailwind `items-baseline`, `items-baseline-last`) | Text baseline alignment                                    |
| Lines            | Menu, shown when wrapping or in a grid: Start, Center, End, Space between, Stretch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `align-content`                                                                                            | Auto or space between, when wrapping                       |
| Gap              | One field, or columns and rows when wrapping or in a grid (today). Takes a negative value, as Figma's gap does for overlapping items (an avatar stack). CSS `gap` can't be negative, so a negative gap is written as a negative margin on each child but the last, Tailwind's `-space-x-2` or `-space-y-2`, and pairs with Stacking's First on top. Its menu offers Auto, as Figma's Gap does, which sets Space between (`justify-content: space-between`), the key Alignment's distribution menu sets, and shows Auto in the field while it's set; Space around and Space evenly stay in Alignment's menu                                                                                                                                                      | `gap`, `row-gap`, `column-gap`                                                                             | Gap; row gap when wrapping                                 |
| Columns and rows | Two counts, Columns and Rows, as today, with Figma's grid picker (drag across a small grid to pick 3 × 2), while every track is the same size (`grid-cols-3`). The track list opens from a count's menu (Edit tracks), or when a track's size is set on the canvas, and goes back to counts when the tracks are the same again. A grid's track lists: one row per track, each sized in fr, px, %, auto, `min-content`, `max-content`, `minmax()` or `fit-content()`, with Repeat (count, auto-fill or auto-fit) and Add (today: a count of equal tracks). A Fill (`fr`) track is written as `minmax(0, 1fr)`, as Tailwind's `grid-cols-N` and today's render.ts do, so long content can't widen its column; plain `1fr` is offered as "Fill, grow with content" | `grid-template-columns`, `grid-template-rows`                                                              | Grid tracks: fixed, fr or hug; no `minmax()` or auto-fill  |

There's no None: hiding a layer is Appearance's Visibility, so `display` has one owner. Inline writes `inline-flex`,
`inline-grid` or `inline-block`, which is how buttons and badges are written. Inside a flex or grid layout, which is
where nearly every Parity layer sits, Inline does nothing, since the browser makes every flex and grid item a block.
It's offered where it changes what's drawn, and Copy as Tailwind still writes `inline-flex` for a component whose code
uses it. When Type is Block, Gap, Alignment and Wrap are hidden, since they do nothing in block layout. Setting Reverse
marks the layout, since the reading order no longer matches what's seen, and offers Reading order (`reading-flow`) from
the CSS row as the fix.

Tracks are also edited on the canvas, as Figma's grid is: a track's size label sits on its edge, and dragging between
tracks resizes them. Repeat's auto-fit is the grid that fits as many columns of at least a width as there's room for,
`repeat(auto-fit, minmax(16rem, 1fr))`, which Figma has no way to say. When the layout is reversed, the alignment box
stays as it looks: its top-left spot is the top left, and the editor writes `flex-end` where a reversed row needs it.

**More:** Reverse direction (`flex-direction: *-reverse`), shown as a toggle beside Wrap once set, Freeform (below),
Areas (named and painted over the grid on the canvas), Flow (rows or columns, and Dense), the size of tracks made by
overflow (`grid-auto-rows`, `grid-auto-columns`), Dividers between items, Text columns (count, width, the rule between
them), Stacking (Last on top, as CSS paints; First on top, Figma's canvas stacking, writes descending `z-index` on the
children) and Size container (lets modes ask this layer's width rather than the screen's; its breakpoints are the
container tokens, as Tailwind v4's `@md:` reads `--container-md`).

Freeform is Figma's frame without auto layout: every child is Absolute, placed where it's dropped, written as `relative`
on the layout and insets on each child. Removing auto layout in Figma (Shift+Alt+A) is this, keeping each child where it
is. A Freeform layout's width and height are Fixed or Fill, never Hug, since absolute children don't size their parent.
Its rows say so.

Dividers between items come in two forms. On the items writes Tailwind's `divide-y` and `divide-x` with a color, width
and style: a border on each item but the last (Tailwind v4's `divide-*` targets `:not(:last-child)`), in every browser.
In the gap writes `row-rule` and `column-rule` (Chromium only, marked), centered in the gap without moving the items.

Size container writes `container-type: inline-size` (Tailwind `@container`), never `size`. A layout set as a size
container can't hug its width, since its children no longer size it, so turning it on makes a Hug width Fill and says
so. A size container also makes a stacking context and a containing block for Absolute and Fixed layers inside it, so a
menu inside can't rise above the layout's siblings and a Fixed layer inside acts as Absolute. The row says so when it's
turned on.

## Spacing

Shows for every layer. It follows Layout, so padding sits next to gap. On layouts, Padding shows by default. On text,
image and icon layers, Spacing starts as a title with + until a padding or margin is set, since padding on these is rare
(a badge is usually a layout with text in it).

| Row     | Control                                                                                                                                                                                                                                                                                                                            | Writes                  | Figma                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- |
| Padding | Horizontal and vertical fields, with a per-side toggle for four (today); the box-model widget opens from the per-side toggle and shows margin's ring once a margin is set. Type or scrub a side; Alt changes the opposite side too, Alt+Shift all four, as Figma's padding handles do; Shift alone steps by ten, as in every field | `padding` and its sides | Auto layout's padding |
| Margin  | The outer ring of the box-model widget, shown once a margin is set or added from More; takes `auto` and negatives; handles on the canvas, as padding's and gaps' are today (`SpacingHandles.tsx`)                                                                                                                                  | `margin` and its sides  | None                  |

Each box writes the shortest form that says it: one value, two, or four. A percentage on any side, top and bottom
included, is of the parent's width; each side's hint says so. Horizontal and vertical are written as Tailwind's `px-*`
and `py-*`, which v4 compiles to `padding-inline` and `padding-block` (and `mx-auto` to `margin-inline: auto`). So they
already follow writing direction, and the frame draws them that way. Separate sides are written physically (`pl-4` is
`padding-left`). A Logical switch under More writes them as `ps-*` and `pe-*` (`padding-inline-start` and
`padding-inline-end`) for designs that also read right to left. Hovering a side highlights it on the canvas, as the
padding hatch does.

In a Block layout, vertical margins between children collapse, and a first or last child's margin passes through the
layout's edge unless the layout has padding or a stroke in layout. Clip content doesn't stop this, since
`overflow: clip` doesn't start a block formatting context, unlike `hidden`. The Margin row says so (principle 10) and
offers Contain margins, which writes `display: flow-root` (Tailwind `flow-root`) on the Block layout.

## Appearance

Shows for every layer.

| Row                 | Control                                                                                                                                                                                                                                                                                                                                                                                                                                             | Writes                                                                                                                                                                                                                                                                          | Figma                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Visibility          | The eye in the section's title: Shown, Hidden (keeps its space), Removed. Removed is the layer's eye in Layers (`hidden`), not a second switch                                                                                                                                                                                                                                                                                                      | Hidden: `visibility: hidden`. Removed: the layer isn't rendered, or `display: none` (Tailwind `hidden`) where it's removed only in some modes; the modes or states it shows in write the layer's display back (`hidden md:flex`, `max-md:hidden`), never `flex hidden` together | The eye in Layers                      |
| Opacity, Blend mode | One row: a percentage field (today), with opacity tokens, then the blend menu, each mode previewed on the canvas while pointed at. With the canvas focused, typing digits sets the selected layers' opacity, as in Figma: 1 is 10%, 0 is 100%, and two quick digits set that percentage (5 then 5 is 55%)                                                                                                                                           | `opacity`, `mix-blend-mode`                                                                                                                                                                                                                                                     | Layer opacity and blend mode           |
| Theme               | A theme button in the section's title, shown when the project has more than one theme with a class or attribute. Its menu lists each set of modes the project has: Theme (Light, Dark), and any other DTCG resolver modifier or set of classes the Modes panel lists, such as Brand or Density, each with Inherit, as Figma's variable-mode button in Appearance lists one entry per variable collection. A row for a set shows below once it's set | The theme's class or attribute on this layer (`dark`, `data-theme="dark"`)                                                                                                                                                                                                      | Appearance's variable modes on a frame |
| Radius              | One field, or four around a drawn corner; Full (today: one, as a token). The corner popover holds Corner shape. Dots inside each corner on the canvas: drag for all corners, Alt for one, as Figma's                                                                                                                                                                                                                                                | `border-radius` and its corners                                                                                                                                                                                                                                                 | Corner radius, independent corners     |
| Corner shape        | In the Radius control's corner popover: a smoothing slider, and a menu: Round, Squircle, Bevel, Scoop, Notch, Square. Shown as a row once set                                                                                                                                                                                                                                                                                                       | `corner-shape`, Chromium only                                                                                                                                                                                                                                                   | Corner smoothing                       |
| Clip content        | A toggle, and a menu: Clip, Scroll, Scroll when needed (today: a menu)                                                                                                                                                                                                                                                                                                                                                                              | `overflow`, and each axis and the clip margin (`overflow-clip-margin`) under More                                                                                                                                                                                               | Clip content                           |

Removed is the same switch as the layer's eye in Layers, the node's `hidden` flag. Like Figma's eye, which is part of
the design (hidden layers don't show in prototypes, exports or Figma Sites, and visibility can be bound to a boolean
property or variable), Parity's hides the layer in the frame and leaves it out of code. It can also be set per state or
viewport and bound to a `visible` prop. It's named Visibility because it has three values (Shown, Hidden, Removed) where
Figma's eye has two. A theme the root gives with no class (Light) can only be set inside another theme if the project
gives it a class too; the Theme menu says so.

Clip content writes `overflow: clip` rather than today's `hidden`: it clips the same, but doesn't make a scroll
container, so a sticky layer inside still sticks. Framer made the same change in August 2025. Unlike `hidden`, `clip`
doesn't zero a flex item's automatic minimum size or start a block formatting context. Fill already writes
`min-width: 0`, and Block layouts that relied on `hidden` to contain floats or margins keep `hidden`. Each axis can clip
on its own (`overflow-x: clip` with `overflow-y: visible`), which `hidden` can't.

Figma's smoothing and CSS's `superellipse()` are different curves, so smoothing is labelled with what it writes and a
design brought over from Figma looks close rather than the same. A corner shape keeps its radius, which browsers without
`corner-shape` draw instead, as Framer's squircle does. Figma's "pass through" blend is CSS's default; Normal with a
group's blend kept inside is `isolation: isolate`. **More:** Isolation, Clip path (inset, circle, ellipse or polygon,
drawn on the canvas), Mask (an image or a gradient, such as fading an edge) and Color scheme (light or dark form
controls and scrollbars).

## Text

Shows for text right after Appearance, and for layouts as "Text inside" after Transform, as today. It doesn't show for
icons, whose color is Icon's. Text styles the whole text layer, since a text layer's text is one string (`document.ts`).
Styling part of it (a bold word, a link, a colored span), as Figma does for selected characters with Mixed in each row,
needs inline ranges in the model and gets its own issue; until then, Text has no Mixed state for part of a text.

Text style shows when the project has a text style (design-options.md, Fields and token kinds). In a stock Tailwind
project, whose sizes pair only a line height, it doesn't, and Size leads the section with its line height shown as From
size. Text style is the section's first row. With a style applied, the rows it sets (Size, Line height, Letter spacing,
Weight, and Font where the style names one) fold into that row and show as its summary ("Inter, 20/28, Semibold"), as
Figma's Typography does. A disclosure on the row shows them. A row that's overridden stays shown, marked, with its reset
arrow. Detach is in the style row's menu.

| Row                 | Control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Writes                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Figma                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Text style          | Picker of the project's text styles, which set Size, Line height, Letter spacing and Weight at once, and Font where the style names one (PAR-135); the rows it sets fold into it while it's applied                                                                                                                                                                                                                                                                                                                                                                            | the style's class (`text-xl`), or those rows' properties; never `font`                                                                                                                                                                                                                                                                                                                                                                                                       | Text styles                                                                                           |
| Font                | Searchable list in each font: the project's `@font-face` and `--font-*` fonts first, then Google Fonts. Choosing a font the project doesn't have adds it the way the project loads fonts (`next/font/google` in a Next.js app, otherwise its files copied to `public/fonts/` with an `@font-face`), plus a `--font-*` token, as a code change to approve. Where the project's font level is Tokens only, the list shows only the project's fonts, and Google Fonts is reached through Add font, which adds the `--font-*` token as a code change to approve. (Today: a token.) | `font-family`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Font family                                                                                           |
| Weight and style    | Menu of the font-weight tokens the font has a face for, then the font's other weights marked as not tokens, from its `@font-face` or its axes; italics (today: nine weights and an Italic toggle)                                                                                                                                                                                                                                                                                                                                                                              | `font-weight`, `font-style`                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Font style                                                                                            |
| Size                | Length field with font size tokens, px, rem and `clamp()` (today: a token)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `font-size`, and the line height, letter spacing and weight the size token pairs with it, unless those rows are set                                                                                                                                                                                                                                                                                                                                                          | Size                                                                                                  |
| Line height         | Auto (`normal`), a multiple, px or %; leading tokens and spacing steps. Unset with a size token, it shows the size's paired line height (Tailwind's `--text-sm--line-height`, read by render.ts today), labelled From size. A size token with no paired line height leaves line height inherited, as Tailwind's class does; render.ts's fallback of 1.5 goes, so the frame draws what the class writes                                                                                                                                                                         | `line-height`; with a size token, written beside it as `leading-6` (`text-sm leading-6`). `text-sm/6` is written only when the size pairs nothing but a line height, since the `/6` form drops a paired letter spacing and weight. `text-sm/6` found in code reads back as the size with a line-height override. A % is written as its multiple (150% → `1.5`, `leading-[1.5]`), since a % line height inherits as a fixed length and breaks children with another font size | Line height                                                                                           |
| Letter spacing      | Field in em, % or px; tracking tokens (today: a token)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `letter-spacing`; a % is typed as Figma's and written as em (5% → `0.05em`, `tracking-[0.05em]`), since a % letter spacing isn't widely supported and Tailwind's tracking tokens are em                                                                                                                                                                                                                                                                                      | Letter spacing                                                                                        |
| Color               | Solid, or a gradient when the text layer has no fill (today: a token)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `color`; a gradient is `color: transparent` with the gradient as `background-image` and `background-clip: text` (Tailwind `bg-linear-to-r from-… to-… bg-clip-text text-transparent`)                                                                                                                                                                                                                                                                                        | Text fill                                                                                             |
| Align               | Left, Center, Right, Justify (today), then Top, Middle and Bottom, shown when the height is fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `text-align: start`, `center`, `end` or `justify` (`text-start`, `text-end`), as today, labelled Left and Right in a left-to-right layer; `align-content`                                                                                                                                                                                                                                                                                                                    | Horizontal and vertical alignment                                                                     |
| Decoration and case | Icon toggles in one row: Underline, Strikethrough and Overline, with a popover for style (solid, double, dotted, dashed, wavy), color, thickness, offset, skip ink and skip spaces, underline position and inset; then Case: As typed, Uppercase, Lowercase, Title case, Small caps (today: the first two, and the first four)                                                                                                                                                                                                                                                 | `text-decoration-*`, `text-underline-offset`; `text-transform`, `font-variant-caps`                                                                                                                                                                                                                                                                                                                                                                                          | Underline and strikethrough, with style, color, thickness, offset and skip ink; Case, with small caps |
| Wrap                | Wrap, Balance, Pretty, No wrap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `text-wrap`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Wrap style: Auto, Balance, Pretty (2026)                                                              |
| Truncate            | Max lines, with an ellipsis (today)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | what Tailwind's `line-clamp-N` writes; for one line, `text-overflow: ellipsis` with the `overflow` and `white-space` it needs                                                                                                                                                                                                                                                                                                                                                | Truncate text, max lines                                                                              |

On a layout, Text inside shows only properties that inherit: Text style, Font, Weight and style, Size, Line height,
Letter spacing, solid Color, horizontal Align, Case, Wrap and the inheriting More entries. Align's Top, Middle and
Bottom, Vertical trim, Decoration, Truncate and a gradient Color are for text layers only; on a layout they'd write
`background-image` and `align-content`, which the layout's own Fill and Lines own. Truncate on Auto width text switches
it to Fixed, since text that's as wide as its line never truncates. On Auto width text, Wrap is hidden, since text as
wide as its line never wraps; Balance, Pretty or No wrap show again when the width is Fixed or Fill. With a gradient
Color, Decoration's color needs a value of its own, since an underline in `currentColor` would be transparent, and the
Decoration row says so.

Rows Figma pairs share a line: Weight and style with Size, and Line height with Letter spacing. Wrap and Truncate share
a line too (the wrap menu, then Max lines). A text layer then shows Text style, Font, two paired lines, Color, Align,
Decoration and case, and Wrap and truncate: eight lines rather than eleven.

**More:** Vertical trim (Standard, or Cap height to baseline, writing `text-box: trim-both cap alphabetic`; shown once
set, since it's usually set once in a text style; Dev Mode writes it in an old draft syntax), Word spacing, Paragraph
indent, Justification (`text-align-last`, `text-justify`), Breaking (`word-break`, `overflow-wrap`, hyphens), OpenType
(a Tabular numbers toggle at the top, `font-variant-numeric: tabular-nums`, Tailwind's `tabular-nums`; then number
styles, fractions, ligatures, superscript and subscript, stylistic sets, as Figma's Details does), Variable axes (a
slider per axis the font has, with width as `font-stretch`, and whether the browser may fake bold, italic or small caps
the font lacks, `font-synthesis`), Direction and writing mode, and Outline (`-webkit-text-stroke`, with `paint-order` to
draw it outside the glyphs). Figma's paragraph spacing is the gap of a layout of paragraphs, or `margin-block` on each,
not a property of one text layer. Inline alignment (`vertical-align`) and list markers are the CSS row's: a text layer
in a flex or grid layout is a flex or grid item, which the browser makes a block, so `vertical-align` does nothing
there; a `span` or `strong` text layer in a code component's slot is inline, where the CSS row takes it. Text layers are
p, span, strong or h1–h4, never li, so list markers return when list tags do.

## Image

Shows for images, videos and other replaced elements, right after Appearance.

| Row         | Control                                                                                                                                           | Writes            | Figma                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------- |
| Source      | The project's images (`public/images/`), Replace, and an image dropped or pasted onto the row or the layer, which is copied into `public/images/` | `src`             | Image fill            |
| Fit         | Fill (cover), Fit (contain), Stretch, Original size, Shrink to fit, with the CSS keyword in each option's hover                                   | `object-fit`      | Fill, Fit, Crop, Tile |
| Position    | Nine-spot box, and X and Y                                                                                                                        | `object-position` | Crop                  |
| Adjustments | Brightness, contrast, saturation, hue                                                                                                             | `filter`          | Image adjustments     |

`filter` is one ordered list. Effects and Image show different entries of it. It's written in Tailwind's order (blur,
brightness, contrast, grayscale, hue-rotate, invert, saturate, sepia, drop-shadow) so it becomes utilities. Reordering
it, or adding one function twice, writes `filter-[…]`. Figma's exposure is closest to Brightness, since CSS has no
exposure. Alt text is the Accessibility tab's. **More:** Crop (`object-view-box`, Chromium only) and Rendering
(pixelated, for pixel art). Figma's temperature, tint, highlights and shadows have no CSS filter.

## Icon

Shows for icons and other SVGs placed as layers, right after Appearance.

| Row          | Control                                          | Writes                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Color        | Color popover; follows the text color by default | `color`, which `currentColor` icons draw in                                                                                                                                                                                                      |
| Stroke width | Number field, with border width tokens           | The icon's `strokeWidth` prop for a value where the component takes one (Lucide). A border width token goes in CSS (`stroke-width: var(--border-width-thin)`, `[stroke-width:var(--…)]`), since an SVG presentation attribute can't hold `var()` |

Icon's Color is Text's Color for an icon component (one owner, `color`), so Text doesn't show for icons. **More:** a
fill and stroke of its own, for an SVG that doesn't draw in `currentColor`.

## Fill

Shows for every layer; on text, it's a highlight or badge behind the text (today). A stack of fills, the top one first,
as in Figma. With nothing set, it's a title with +. A gradient token is one fill's paint, chosen in that fill's paint
editor (its Tokens tab), as the "A fill" row of the kind table says. There's no button for the whole section, since a
fill stack can hold a token and other fills at once. Editing a stop of a gradient token offers Detach.

On a text layer, the section's title reads Background, and its + menu starts with Text color, which opens Text's Color,
then Background (the highlight behind the text). With no fill, the empty title says "Text color is in Text". In Figma, a
text layer's Fill is its glyph color, so a text layer brought from Figma has its fill read as Text's Color (a gradient
fill as the gradient Color).

| Row       | Control                                                                                                                     | Writes                                                                                                                             | Figma                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Each fill | A swatch, the fill's type and value, its opacity, the eye and −; the swatch opens the paint editor (today: one color token) | the bottom solid as `background-color`; the rest as `background-image` layers, a solid above the bottom as `linear-gradient(c, c)` | Fills: solid, linear, radial, angular and diamond gradients, image, video, pattern, shader |

The paint editor has a tab for each type:

- **Solid:** the color popover, with Custom and Tokens tabs (see design-options.md).
- **Linear, Radial and Angular:** a bar of stops under the color square (click to add, drag off to remove, each stop a
  color and a position), and handles on the canvas: an angle line for linear, a center and size for radial (circle or
  ellipse, to the closest side or the farthest corner), a center and start angle for angular. Angular's hover names what
  it writes, `conic-gradient` (principle 1). An Angle field sits beside the canvas line, each stop's color is a token or
  a value, Delete removes the selected stop, and Left and Right move it 1%, Shift 10%. A Repeat toggle writes
  `repeating-*-gradient`. Interpolation defaults to `in oklab`, as Tailwind v4's gradient utilities do, so the frame
  draws what `bg-linear-to-r from-… to-…` draws and needs no modifier. The menu also offers `in oklch` (which keeps a
  blue to yellow gradient bright through the middle) and sRGB, to match a gradient brought from Figma, written as
  `/srgb` in Tailwind and `in srgb` in CSS. Gradient tokens are offered here. CSS's gradient line always spans the box
  at its angle, so dragging the canvas line's ends sets the angle and moves the first and last stops (a Figma gradient
  drawn across the middle half is written with stops at 25% and 75%). Radial's canvas handles set an explicit ellipse's
  two radii and center (`radial-gradient(ellipse 40% 60% at 30% 20%, …)`), as Figma's two radius handles do. CSS can't
  rotate a radial gradient's ellipse, so a rotated radial gradient brought from Figma is drawn unrotated, with a note
  saying so. Each stop has its own opacity. Two stops at one position make a hard edge. A midpoint between two stops,
  dragged on the bar, writes a CSS color hint (`red, 30%, blue`), which Figma lacks; Tailwind writes it as an arbitrary
  value. Flip and Rotate 90° buttons sit beside the Angle field, as in Figma's gradient editor.
- **Image:** the project's images (`public/images/`), Replace, and an image dropped or pasted onto the swatch or the
  layer, which is copied into `public/images/`; Fill, Fit, Crop and Tile, written as `background-size: cover`,
  `contain`, a size and position, or a size with `background-repeat`; and a nine-spot position.

A solid fill that isn't the bottom one is written as a `linear-gradient(c, c)` layer, since `background-color` always
paints under every image. A fill's opacity is folded into a solid's color (`color-mix`) or a gradient's stops; an image
fill's opacity has no CSS per layer, so it isn't offered (the layer's Opacity is). Fill writes longhands, never the
`background` shorthand that render.ts uses today, so it doesn't reset `background-clip`. One gradient is written with
Tailwind's `bg-linear-*`, `bg-radial` or `bg-conic` and `from-`, `via-` and `to-`; two or more layers as `bg-[image:…]`.

Each fill's own blend mode writes `background-blend-mode`, and its clip (Border, Padding, Content, Text) writes
`background-clip`. Figma's diamond gradient has no CSS and isn't offered. Figma's image adjustments apply to a whole
layer in CSS (`filter`), so they're in Image for image layers and in Effects for the rest.

**More:** Fixed, which stays put as the page scrolls (`background-attachment: fixed`). It's drawn against the editor's
window rather than the frame's, and ignored by iOS Safari, so it's previewed only in Play.

## Stroke

Shows for every layer, text included (today); the text outline is Text's Outline. With nothing set, it's a title with
Add, as today. A border token for the whole section is chosen from the section title's token button. Its parts show in
the rows below in the token's color, and editing one overrides it (see design-options.md, One value model).

On a text layer, + starts with Outline the text (Text's Outline, `-webkit-text-stroke`), then Border around the box. A
text layer brought from Figma has its stroke read as Text's Outline (`-webkit-text-stroke`, with `paint-order` for
Outside).

| Row          | Control                                                                                                                                              | Writes                                                                                                                                                                                                                                                                                                                                                                                                                       | Figma                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Border token | Token chip in the title row; border tokens                                                                                                           | `border` shorthand from the token                                                                                                                                                                                                                                                                                                                                                                                            | Stroke style                                                                                                                                                                               |
| Color        | Swatch and color popover, or a gradient paint (today: a token)                                                                                       | `border-color` or `outline-color`; always written with the stroke (`border-border`, or the token), since Tailwind v4's default border color is `currentColor` while render.ts draws `var(--border, currentColor)` today; not written when the project's base styles already give every element a border color (shadcn's `* { border-color: var(--border) }`), which the label shows as coming from base styles (principle 6) | Stroke paint                                                                                                                                                                               |
| Width        | One field, with Figma's side menu (All, Top, Bottom, Left, Right, Custom) to set the sides on their own (today: 1, 2, 4 or 8)                        | `border-width` and its sides, or `outline-width`                                                                                                                                                                                                                                                                                                                                                                             | Stroke weight, per side                                                                                                                                                                    |
| Style        | Menu: Solid, Dashed, Dotted, Double; Groove, Ridge, Inset and Outset under More (today: three)                                                       | `border-style` or `outline-style`                                                                                                                                                                                                                                                                                                                                                                                            | Dash and gap lengths, or a custom pattern                                                                                                                                                  |
| Position     | Inside, Center, Outside, and an Include in layout toggle beside them (see design-options.md's call 2); Center and Outside turn Include in layout off | `border`; or `outline` with `outline-offset` of minus the width, minus half, or 0                                                                                                                                                                                                                                                                                                                                            | Inside counts in layout like a border, and center and outside are drawn as an outline (updated auto layout, July 2026); a legacy frame's "Strokes included in layout" is Include in layout |

A layer can have a border and an outline at once (a stroke in layout and a focus ring): Stroke's + adds the second, a
border or an outline, whichever the first doesn't use, with its own color, width, style and offset. Include in layout is
on for a new stroke. Widths, colors or styles per side need Include in layout, so choosing one turns it on and says so.
When the state shown is Focus or Focus visible, Stroke opens with its outline (the focus ring) shown, with Offset beside
Width.

An outline set on the base state replaces the browser's focus ring, since author styles beat the browser's own
`:focus-visible` outline. On a layer that takes focus (a button or link tag, a component, or a layer with a Focus
state), a stroke that isn't in layout says so and offers a focus ring. A layer has only one outline, so with an outline
stroke the ring is that outline changed in the Focus visible state (and the row says so), or a spread shadow in Effects
(`focus-visible:ring-3`, as shadcn's components write it).

A gradient stroke keeps the radius by writing the fills as `padding-box` layers above a `border-box` gradient:
`background-clip: padding-box, …, border-box` and `background-origin: padding-box, …, border-box`, with
`border-color: transparent`. Every fill, the bottom solid included, is then a layer (`linear-gradient(c, c)`), since
`background-color` is clipped to the last layer's border-box and would show through a translucent stroke. It needs
Include in layout and a solid border style, and it's offered only when the bottom fill is opaque. Otherwise the gradient
would show through the middle, and the row says so. Fill owns `background-image`, so these layers are listed among the
properties set by another control (design-options-css.md) and shown in Fill as set by Stroke. `border-image` ignores
radius, so it stays in the CSS row. Figma's dash and gap lengths, caps and joins have no CSS for a box's border; they're
the Icon section's for SVG strokes.

## Effects

Shows for every layer. A stack of effects, added from + as in Figma; with nothing set, it's a title with +. A shadow
token is one entry of the shadow list, with its layers under a disclosure on the entry. Its color can be overridden
(`shadow-lg shadow-black/20`); any other part offers Detach. Blur and drop shadow tokens are their own entries' values.

| Effect                 | Control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Writes                                                                                                             | Figma                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop shadow            | X, Y, blur, spread, color; shadow tokens (today: one shadow token). A Follow shape toggle draws it around what's drawn rather than the box, with no spread, and offers drop shadow tokens. It's off by default, and on for icons and for images with transparency. On a text layer with no fill or stroke, Drop shadow writes `text-shadow` (X, Y, blur and color; no spread), since a drop shadow on text in Figma is the glyphs' shadow and Dev Mode writes it as `text-shadow`; it then offers text shadow tokens. With a fill or stroke, the entry has a toggle, Shadow of: Text or Box | `box-shadow`; on a text layer, `text-shadow` unless it shadows the box; with Follow shape, `filter: drop-shadow()` | Drop shadow. Figma's shadows follow vectors and unfilled frames; Dev Mode writes `drop-shadow()` for icon-like frames; Figma's "Show behind transparent areas" has no `box-shadow` equivalent (CSS never draws a box shadow under the box), so a shadow brought with it on is drawn with Follow shape |
| Inner shadow           | The same, inside; an inset ring is an inner shadow with no blur                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `box-shadow: inset …`                                                                                              | Inner shadow                                                                                                                                                                                                                                                                                          |
| Layer blur             | Blur, with blur tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `filter: blur()`                                                                                                   | Layer blur                                                                                                                                                                                                                                                                                            |
| Background blur        | Blur, with backdrop blur tokens. Says when what it can see is cut short: an ancestor with opacity below 100%, a filter, a mask, a clip path, a blend mode or its own backdrop filter becomes the backdrop root, and nothing behind that is blurred. It also says when the layer's own fill is opaque, which hides the blur                                                                                                                                                                                                                                                                  | `backdrop-filter: blur()`                                                                                          | Background blur                                                                                                                                                                                                                                                                                       |
| Adjustments            | Sliders: brightness, contrast, saturation, grayscale, sepia, hue, invert                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `filter` functions, in Tailwind's order (see Image)                                                                | Image adjustments only                                                                                                                                                                                                                                                                                |
| Background adjustments | The same sliders, for what's behind; its hover says "brightness, contrast and saturation of what's behind"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `backdrop-filter` functions                                                                                        | None                                                                                                                                                                                                                                                                                                  |

Effects' shadows are written into Tailwind's four `box-shadow` slots: drop shadows as `shadow-*`, inner shadows as
`inset-shadow-*`, a ring (`ring-*`) and an inset ring (`inset-ring-*`). Tailwind paints them top to bottom as inset
shadow, inset ring, ring, drop shadow, and the list shows them in that order. A list with at most one entry per slot, in
that order, is written as utilities, and a shadow token fills its own slot (`shadow-md`, `inset-shadow-xs`). Any other
list, such as two drop shadows, a token beside a value in one slot, or another order, is written as one arbitrary value
with its tokens as `var()` (`shadow-[var(--shadow-sm),0_0_0_1px_var(--color-border)]`). The entry that causes it says so
and offers Save as token, since the token is then no longer a utility a team can find.

The + menu also offers Layered shadow: elevation and softness, written as several `box-shadow` layers that can be saved
as one shadow token. Figma's noise, texture and glass effects and its progressive blur have no CSS of their own. The +
menu also offers Frosted glass, a preset for Figma's glass effect written in CSS: a Background blur, a translucent fill
from the fill's color (or white at 10%), a 1px inner shadow highlight, and `saturate()` behind. Each part is then a
normal entry in Fill and Effects. The preset's fill and highlight take the project's tokens where they exist (the
nearest surface color with an opacity token) and follow the color and opacity levels; under Tokens only, a part with no
matching token is marked as off-system rather than written raw. A progressive blur can be built from a background blur
and a gradient mask, which the panel could offer as a preset once masks are in. Figma's blur radius is twice CSS's (Dev
Mode halves both layer and background blur, as Figma's staff said in 2023 and 2024 forum threads; Bjango's measurements
put the match nearer 0.44, so halving is close but not exact), so a design brought from Figma halves it, and the Blur
field's hint says so.

## Selection colors

Shows only when a layout or several layers are selected and they use at least one color. It lists every color used
inside them (fills, strokes, text, shadows), token or not, each listed once. Editing one changes it everywhere it's
used. A color that isn't a token has Replace with token, which offers the nearest token (by the rule in
design-options.md's One value model), so a design can be brought onto its tokens in one pass. It shows up to six
swatches, with See all, as Figma's does, so a layout with many colors doesn't push Transform and Motion down the panel.

## Transform

Shows for every layer, as a title with + until something in it is set. Rotation is Position's.

| Row    | Control                                                         | Writes                 | Figma                                   |
| ------ | --------------------------------------------------------------- | ---------------------- | --------------------------------------- |
| Move   | X and Y fields, in any length; % is of the layer's own size     | `translate`            | None: X and Y move the layer            |
| Scale  | Percentage, X and Y linked or not; Flip horizontal and vertical | `scale`, flips as `-1` | Flip only                               |
| Origin | Nine-spot box, and X and Y under More                           | `transform-origin`     | A rotation origin, moved while rotating |

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

**More:** Text selection, Accent and caret colors for form controls, Resize handle, Native look (`appearance`),
Scrolling (smooth, overscroll, scrollbar width, color and gutter) and Scroll snap (on a layout, how it snaps; on a
child, where it lands).

## Motion

Shows for every layer, as a title with + until something in it is set. An animation token is the Animation row's value,
and a transition token a transition's.

| Row             | Control                                                                                                                                                                                  | Writes                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transitions     | A list: what changes (All, Colors, Opacity, Transform, Shadow, or a property), duration, easing, delay                                                                                   | `transition`; Transform covers `transform, translate, scale, rotate` (Tailwind v4's `transition-transform`), since Move, Scale and Rotation write their own properties; Colors covers what Tailwind's `transition-colors` does                                                                                                                        |
| Animation       | The project's `@keyframes` and animation tokens, previewed as the Tokens panel does; duration, easing, delay, repeat, direction, fill; a Trigger menu: On load, In view, While scrolling | `animation`; In view adds a `timeline-trigger` on a `view()` timeline and `animation-trigger` (plays once, Chromium only, marked); While scrolling sets `animation-timeline: view()` or `scroll()` and its range (the animation follows the scroll)                                                                                                   |
| Appear          | Fade, Slide, Scale and Blur presets with duration, easing and delay; played when the layer is first drawn, or when it scrolls into view                                                  | `@starting-style` with a `transition` (and `transition-behavior: allow-discrete`, so it can animate from `display: none`), as Tailwind v4's `starting:` variant with `transition-discrete`; in view, the same trigger as Animation's In view, playing a keyframes animation once, written as arbitrary properties until Tailwind has utilities for it |
| Hover and press | Shortcuts that add a Hover or Pressed state with scale, move, rotate or opacity, and a transition                                                                                        | the state's patch and `transition`                                                                                                                                                                                                                                                                                                                    |

These are Framer's Appear, Hover, Press and Scroll effects, written as CSS a developer can keep. `@starting-style` is an
at-rule, kept beside the layer's states. A transition matters once a state changes something, so when a state's change
has none, the section offers one. Duration, easing and animation tokens are offered here, and the easing field is the
curve the Tokens panel draws. Browsers without animation triggers show the final state (the trigger and its keyframes
are wrapped in `@supports`), so the content is never left hidden.

Appear, Animation and the movement the Hover and press shortcuts add are written under `motion-safe:`
(`@media (prefers-reduced-motion: no-preference)`). A Reduced motion choice in the section's menu sets what shows
instead (nothing, or a fade), written as `motion-reduce:`. Play can preview reduced motion, as DevTools' rendering
emulation can.

**More:** Animate to auto sizes (`interpolate-size`), Named timelines (so one layer's scrolling drives another layer's
animation) and View transition name.

## CSS

Always the last section. A list of declarations, one a row, `property: value`, with + to add one.

- **Completion** of property names from the ledger, with each one's Baseline mark, and of values from what the property
  takes: its keywords, and tokens, written as `var()`.
- **Checked as typed** with `CSS.supports`, after filling in tokens, as the token editor checks values (PAR-569). A
  property a control owns opens that control instead.
- **Paste CSS or classes.** Pasting a block of declarations (from DevTools or a code file) or a string of Tailwind
  classes into the CSS section gives each declaration to the key that owns it and keeps the rest as rows. What can't be
  read is listed, not dropped.
- **Classes.** A field at the top of the section shows the layer's classes as Copy as Tailwind writes them, for the
  state and mode shown, as Chrome DevTools' `.cls` pane lists an element's classes. Typing in it
  (`px-4 py-2 rounded-md hover:bg-primary/90`) reads each class back into the key that owns it, by the rule in
  design-options.md (What's written reads back), and the controls above fill in. A class it can't read stays a From the
  code row. It's a view of the same keys, not a second store, so the panel and the field can't disagree. Typed classes
  follow the project's levels as any field does: an arbitrary value under Tokens only is refused, or marked under
  Marked, on the row it reads into.
- **Off without deleting.** Each row, and each entry of a list, has a checkbox that turns it off. It stays in the file,
  but isn't drawn or written to code, as DevTools' checkboxes and Figma's eye work.
- **Tokens set here:** a token given its own value for this layer and everything inside it. Each one is edited with the
  token's own editor and kind (a swatch for a color), listed by token name rather than as `--name: value`, and marked as
  an override of the system. Under Tokens only, a token set here takes another token as its value
  (`--primary: var(--brand-600)`, Chakra's `colorPalette`, a shadcn theme scoped to one card) but not a value of its
  own.
- **From the component's code,** read-only: what a component's own classes set on its root, so a designer can see why it
  looks as it does without opening the file. Where a code component's own class sets a property this layer also sets,
  the component's value shows struck through under the row, as DevTools shows an overridden declaration, and Open in
  code goes to the line that sets it, as Onlook's right-click does.

Pseudo-elements aren't layers. Placeholder and selection colors join the States menu now, as Placeholder and Selected
text, written as Tailwind's `placeholder:` and `selection:` variants; `::before`, `::after` and `::marker` wait.
Conditions join the States menu too: First, Last, Odd, Even and Only, written as `first:`, `last:`, `odd:`, `even:` and
`only:`, as Webflow's First, Last, Odd and Even item states are. On a component's root, each is drawn on the instances
where it holds, so a list item can drop its divider on the last one (`last:border-0`) and a table can stripe its rows.
