# Design options: how each value is shown and edited

Part of [design-options.md](design-options.md) (PAR-652). Every field has the anatomy, forms, states, typing, keys,
token picker and lists set in [design-options-fields.md](design-options-fields.md); this page gives, type by type, only
what differs. Which tokens a field offers is in [design-options-tokens.md](design-options-tokens.md), and how classes
are put together in [design-options-code.md](design-options-code.md).

Each type gives At rest, Forms, Editing, Tokens, Writes and Compared, and Typing and States only where they differ from
[design-options-fields.md](design-options-fields.md), States. A missing heading means the type does what that page says:
with no Editing, the type has only typing, keys and the token button; with no Tokens, it has no token button.

## Length and percentage

- **At rest:** the number with its unit as the suffix; Auto as a chip, with the measured size after it where there's
  room, and in a narrow field's hint. The panel's px or rem setting applies to steps, tokens and what they come to. A
  value shows in the unit it was typed in or read in.
- **Forms:** a token; a step of the field's scale where it has one
  ([design-options-tokens.md](design-options-tokens.md), Framework steps), so 13px is `p-3.25` and 50% is `w-1/2`; Font
  size and Radius have none; a value in any unit; `auto`; an expression.
- **Editing:** the unit's menu (the field's slot 3 in [design-options-fields.md](design-options-fields.md)) shows px, %,
  rem and the keywords the property takes. More units lists em, ch, lh, vw, vh, dvh, svh, lvh and the container units,
  only where they mean something (no vw in Radius). A typed `%` in a field whose CSS takes one (Width, Height, their
  limits, insets, Move, padding, margin) is CSS's percentage, as Webflow, Framer's Relative size and DevTools read it
  (call 10). Figma's share of the value is typed as maths (`*0.5`, `Mixed*0.5`), and the hint says so the first time a
  Figma user types `%` in Width or Height.
- **States:** the hint names what the % is of: the containing block's inline size for padding and margin on every side,
  its height for Height, Top and Bottom, the layer's own size for Move, the font size for em. A % height needs a
  definite height to resolve against; otherwise it acts as auto, and the row shows Does nothing.
- **Tokens:** spacing, and container for sizes, as a spacing bar at true size; font-size for Font size, border-width for
  widths and offsets, and blur for blurs ([design-options-tokens.md](design-options-tokens.md), Fields and token kinds).
- **Writes:** `p-4`, `p-[13.3px]`, `w-1/2`, `w-full`, `h-dvh`, `w-(--sidebar-width)`, `w-[clamp(16rem,30vw,24rem)]`,
  `-mt-4`, `-top-2`.
- **Compared:** Figma takes px only; Webflow takes every unit and shows an unset field's inherited value, but no token
  chip, and not what a relative unit comes to.

## Size

- **At rest:** Fixed shows its length; Hug, Fill or Fill ×2 show as chips, with the measured size faint in the chip.
- **Forms:** also a size mode, stored as `{ size: "hug" }` or `{ size: "fill", share?: 2 }`, since Hug and Fill write
  different CSS for each kind of parent ([design-options-panel.md](design-options-panel.md), Size) and aren't CSS
  keywords. Full is `{ keyword: "full" }`.
- **Editing:** the words are apart from the units. The chevron at the field's end always opens Sizing: Fixed, Hug, Fill,
  Min content and Max content, with Auto, then Add min and Add max. The unit's menu (the field's slot 3), after a
  number, holds only units: px, %, rem and More units. Hug covers `fit-content`, so it isn't listed twice. Fill's share
  is chosen in its menu (Fill, Fill ×2, Fill ×3, Custom) or typed as `2fr`; a bare number stays a length. Typing a
  length in a Hug or Fill field makes it Fixed, as in Figma; Backspace on a chip, or Up or Down on Hug, Fill or Auto,
  makes it Fixed at its measured size, and Up or Down steps from there. Auto is listed only when the value is `auto`
  from code or freed by the aspect lock, labeled by what it does in this parent ("Auto (fills)", "Auto (hugs)"), since
  elsewhere Hug and Fill already write `auto`. Freed by the aspect lock, it shows as Auto with its measured size, and
  its hint and Sizing say it's set by Aspect ratio ([design-options-css.md](design-options-css.md), Properties set by
  another control). A grid child's W and H are the same field, Fill filling its cell.
- **Tokens:** spacing, container, listed in Sizing under the words, smallest first, with the token nearest a length of
  its own above them and Create token under them. A token shows as its pill and steps through the scale with Up and
  Down; it writes Tailwind's name, `w-gutter` for `--spacing-gutter` and `w-md` for `--container-md`. A design's frame
  takes the project's breakpoints for its W instead (`xl`, 1280), and Hug or pixels for its H.
- **Writes:** `flex-1 min-w-0`, `flex-2 min-w-0` (`min-h-0` in a column), `self-stretch`, `w-fit`, `w-full`, or nothing,
  by the parent.
- **Compared:** Figma's Fixed, Hug and Fill, with Framer's share for Fill.

## Four sides

Padding, margin, border width and scroll padding.

- **At rest:** the shortest form that holds the value: one field when all sides match, two (vertical, then horizontal,
  as CSS's two-value shorthand and today's V and H fields are) when the pairs match, four otherwise, in CSS's order. The
  shortest form is chosen when the layer is selected, never while editing, so making four sides equal doesn't fold the
  fields under the pointer. The layout follows the value, not a toggle the selection forgets (today's `SidesField`
  toggle is component state). Padding on a layout shows at least two fields, as Figma's does, even when all four sides
  match.
- **Forms:** each side holds its own form, token chip and mark.
- **States:** Mixed is per side; editing one side changes only that side on every layer.
- **Editing:** a per-side button switches forms; its menu is Figma's (All, Top, Bottom, Left, Right, Custom). Shorthand
  typed into any of these fields fills them in CSS's order. The box-model widget shows padding and margin together, each
  side opening its field in a popover. Alt changes the opposite side too, Alt+Shift all four, as Figma's handles do.
- **Tokens:** spacing, or border-width for Stroke.
- **Writes:** the fewest classes, shorthand first: `p-4`, `px-4 py-2`, `p-4 pb-6`, `border border-t-2`; logical forms
  under the Logical switch.
- **Compared:** Figma has two or four padding values; Webflow's box always shows all eight sides.

## Four corners

- **At rest:** one field with a corner glyph, or four in a 2 × 2 grid laid out as the corners are, chosen when the layer
  is selected, as for Four sides; Corner shape in its popover, shown beside it only once set
  ([design-options-panel.md](design-options-panel.md), Appearance).
- **Forms:** Full is a keyword (`rounded-full`); a % writes `rounded-[50%]`; an elliptical radius (`12px / 24px`) is an
  expression, edited as text.
- **Editing:** dots inside each corner on the canvas: drag for all corners, Alt for one, as Figma's.
- **Tokens:** radius, as a corner at real size.
- **Writes:** `rounded-lg rounded-tr-none`.
- **Compared:** Figma shows Mixed when the corners differ; Parity shows the four.

## Number and count

Grow and shrink, Order, Layer order, Iterations, Max lines, Columns and Rows, Text columns' count, Span.

- **At rest:** the number, with no suffix; Iterations' `infinite` as ∞. Counts are whole.
- **Tokens:** z-index for Layer order; none for Span; elsewhere number tokens whose value is a plain number.
- **Writes:** steps, since Tailwind takes any whole number bare: `z-10`, `z-37`, `-z-5`, `order-7`, `grow-2`,
  `line-clamp-2`, `grid-cols-13`. A count never needs brackets, except Iterations, which has no Tailwind utility
  (`[animation-iteration-count:3]`, or inside the animation's own value).
- **Compared:** Figma has only Max lines, grid counts and spans.

## Percentage and opacity

- **At rest:** a percentage.
- **Forms:** Opacity, Scale and a color's alpha are shown as percentages. One on the field's steps is stored as the
  utility's number (`{ step: 50 }` is `opacity-50`, `{ step: 105 }` is `scale-105`), and one off them as the CSS number
  (`{ value: 0.473 }` is `opacity-[.473]`), so each class reads back into one form
  ([design-options-tokens.md](design-options-tokens.md), Framework steps). Today's `opacity` key stores 0 to 100, and
  the examples are rewritten. An opacity token written as a number or a percentage shows as a percentage.
- **One owner each.** Layer Opacity is `opacity`. A color's alpha is the color's own (`{ token, alpha }`, or a value's
  alpha), shown as the % beside the swatch and as the popover's alpha slider: one value in two places. A solid fill's
  opacity is that alpha. An image fill has none. A gradient fill has none of its own: its % sets every stop's alpha and
  shows Mixed when they differ, so `bg-primary/50` and `from-blue-500/50 to-red-500/50` read back as written.
- **Tokens:** opacity, for Opacity and a color's alpha; none for Scale.
- **Writes:** `opacity-50`, `opacity-47.5`, `scale-105`, `scale-x-90`, `-scale-x-100` for a flip; a color's alpha as
  `/50` or `/47.5`. A percentage on the field's steps (0.25% for opacity and alpha, 1% for scale) is a step, unmarked
  while the project has no tokens of its kind; a finer one (`opacity-[.473]`, `scale-[1.025]`) is written in brackets
  and marked.
- **Compared:** Figma's fill opacity is the paint's alpha too.

## Color

- **At rest:** a swatch (a checkerboard under translucency, split diagonally when Mixed), the value in its model in
  short form (`2563EB`, `oklch 62% .19 260`) with the full CSS in the hint, then the alpha as its own % field, as
  Figma's. A token is a chip with its swatch and name, then the alpha. `currentColor` shows as Text color, with
  `current` in the hint; `transparent` as Transparent over a checkerboard. None is kept for `none` and for an empty
  list. An alpha that's an opacity token shows its name after the slash (`primary / muted`), with its percentage faint
  after it.
- **Typing:** any CSS color: hex with or without `#`, of 3, 4, 6 or 8 digits; a named color; `rgb()`, `hsl()`, `oklch()`
  or `color()`, read in that model; a Tailwind palette name (`blue-500`); a token with alpha (`primary/50`);
  `color-mix()`.
- **Editing:** a popover with two tabs, opening on Tokens for a token and Custom for a value. Custom's square follows
  the model: saturation by brightness for Hex, RGB, HSL and HSB, and lightness by chroma at the chosen hue for OKLCH,
  with the sRGB and Display P3 edges drawn on it, as oklch.com draws them. Under it are the model's hue slider and an
  alpha slider, then a model menu (Hex, RGB, HSL, HSB, OKLCH, Display P3; HSB is written as hex), an eyedropper, the
  design's colors, the nearest token, and the contrast against the layer behind in every theme, worst first, with AA and
  AAA lines on the square, as DevTools' picker draws them. It opens in the value's model and remembers the last one
  chosen; a new value starts in OKLCH in a Tailwind v4 project and in Hex otherwise. A value outside sRGB or Display P3
  says so in the popover, and one that isn't a token says it stays the same in every theme. Tokens lists Semantic first,
  then Primitive shades as a grid; under Semantic only, the grid is hidden and Custom is read-only.
- **Tokens:** color, as a swatch per theme. When the layer behind is filled with a token that has a foreground pair
  (shadcn's `primary` and `primary-foreground`, `card` and `card-foreground`: a `<name>-foreground` token, or one named
  by `$extensions.parity.pair`), the text, icon and stroke color pickers list that pair first. If a color fails contrast
  in some theme, the popover offers the nearest token that passes in every theme (`contrastFix` in
  `@parity-app/tokens`).
- **Writes:** `bg-primary`, `bg-primary/50`, `bg-primary/muted`, `bg-current`, `bg-transparent`, `bg-(--brand)`; a value
  in its own model with its alpha (`bg-[#2563eb80]`, `bg-[oklch(62%_0.19_260/50%)]`), so it reads back unchanged. A
  token's alpha draws as `color-mix(in oklab, var(--primary) 50%, transparent)`. `bg-[#2563eb]/50`, a form developers
  often write, reads back as the value with a 50% alpha and is written back the same way. An opacity token as the alpha
  is in [design-options-code.md](design-options-code.md), Values in classes.
- **Compared:** Figma has no OKLCH picker; neither Figma nor Framer draws gamut edges.

## Paint stack

Fill's list of solids, gradients and images.

- **At rest:** each entry is a preview (swatch, gradient strip or image), its type or token chip, its alpha %, the eye
  and −, top first, as CSS paints.
- **Adding:** + is a menu of the five types, each drawn as the fill it adds, a gradient from white to blue-600 so its
  shape shows, with what it draws under its name (One color, Along a line, Out from the center, Around the center, A
  picture). The fill it adds opens its editor.
- **Editing:** the preview opens the paint editor for the fill's type, which was picked as it was added. Solid is the
  color popover. A gradient's editor names its kind at the top, in a menu that draws the gradient as each of Linear,
  Radial and Angular and switches between them keeping the stops. Under it is the bar of stops (click to add, drag off
  to remove, each a color and a position), with handles on the canvas, then the gradient's settings, each named above
  its control: Angle (Start angle for Angular), a field Figma lacks; Center, for Radial and Angular; Blend, `in oklab`
  as Tailwind v4's, with `in oklch` and sRGB in its menu; and Repeat's switch, which writes `repeating-*-gradient`. A
  divider sets the stops apart: each stop is a row, as Figma's gradient editor has them, with a position field in %, the
  color field (a token chip or a value, with its alpha), and − once there are more than the two a gradient needs. Flip,
  which reverses the stops, and the button that adds one sit beside the Stops title. Clicking a row selects that stop on
  the bar and on the canvas. Keys and scrubbing are as in every field. CSS's gradient line spans the box at its angle,
  so dragging the line's ends sets the angle and moves the first and last stops. Radial's handles set the ellipse's two
  radii and center (`radial-gradient(ellipse 40% 60% at 30% 20%, …)`), as Figma's do; Angular's set a center and start
  angle, and its hint names `conic-gradient`. Delete removes the selected stop, and Left and Right move it 1%, Shift
  10%. Two stops at one position make a hard edge; a midpoint dragged between two stops writes a color hint
  (`red, 30%, blue`), which Figma lacks.
- **Image:** no tabs, unlike the pickers that split Upload, Link and Unsplash apart. One search covers the project's
  images (`public/images/`) and a stock provider's (Unsplash), each a section of one grid, three to a row, with Upload
  first among the project's, and the fill's image ringed and ticked where it was picked. An image dropped or pasted
  anywhere on the editor, or uploaded, is copied into `public/images/`, named for a class (`My Photo.PNG` is
  `my-photo.png`), and used; one dropped on the Fill section is added as an image fill on top, its editor open. A photo
  picked from Unsplash is linked from Unsplash and its photographer credited, as its terms ask (decisions.md), so it
  stays ticked in Unsplash's section and its row names it by its title. Under a divider, how it's drawn: Fit as a menu
  (Fill, Fit, Crop and Tile, each saying what it does, writing `background-size` and `background-repeat`), Crop's scale,
  and the position, with its nine spots.
- **Tokens:** color and gradient. A gradient token is one fill's paint; editing its stops offers Detach.
- **Writes:** the bottom solid as `background-color`; the rest as `background-image` layers, a solid above the bottom as
  `linear-gradient(c, c)`. A simple gradient is utilities (`bg-linear-to-r from-blue-500 to-teal-400`), a longer one is
  written inside the utility (`bg-linear-[45deg,red_5%,yellow_60%,lime_90%,teal]`), and an image is
  `bg-[url(/images/hero.jpg)] bg-cover bg-center bg-no-repeat`. Each long form offers Save as token first, as long
  arbitrary classes do. Which form a gradient takes, and how each layer's size, position and clip are written, is in
  [design-options-code.md](design-options-code.md), Values in classes.
- **Compared:** Figma has no angle field, interpolation or color hints; Webflow has no conic gradient.

## Shadow list

- **At rest:** Drop shadow, Inner shadow or Ring, its card (which shows the color), type, summary
  (`0 4 12 0 · black 10%`), the eye and −; a token shows as a chip with its card. Entries are in two groups, Inside
  (inner shadows, then inset rings) and Outside (rings, then drop shadows), top first, as Tailwind paints them, and are
  dragged within a group. A Drop shadow with Follow shape is a Filter list entry (`drop-shadow-*`, last in `filter`),
  not a box-shadow slot. It's drawn under every entry here and shadows them too, so it's listed after the Outside group
  and isn't dragged among them. On a text layer, Drop shadow writes `text-shadow` (`text-shadow-*`), not a box-shadow
  slot, unless its Shadow of toggle is set to Box ([design-options-panel.md](design-options-panel.md), Effects). Inside
  and outside shadows never overlap, so the order between the groups changes nothing.
- **Forms:** offsets, blur and spread are px values, never steps, since Tailwind has no scale for them; a Ring's width
  is a whole-px step (`ring-3`). Offsets and spread take negatives; blur doesn't.
- **Editing:** a popover with X, Y, blur, spread, a color field, Follow shape, and a square offset pad for X and Y,
  dragged as DevTools' shadow editor's is. A shadow token's layers show under a disclosure, each with the same fields.
- **Tokens:** shadow, inset-shadow, drop-shadow with Follow shape (stored in the Filter list), text-shadow on text;
  border-width for a Ring's width; none for the other numbers.
- **Writes:** four of the five slots Tailwind composes `box-shadow` from, `shadow-*`, `inset-shadow-*`, `ring-*` and
  `inset-ring-*` (Parity doesn't write `ring-offset-*`, which sits between inset ring and ring), painted top to bottom
  as inset shadow, inset ring, ring, drop shadow: `shadow-md`, `shadow-black/20`, `ring-1 ring-border`. Anything that
  doesn't fit one entry per slot in that order is one arbitrary value
  (`shadow-[var(--shadow-sm),0_0_0_1px_var(--color-border)]`), which says so and offers Save as token
  ([design-options-code.md](design-options-code.md), Values in classes).
- **Compared:** Figma and Webflow edit shadows as fields; only DevTools has the offset pad.

## Filter list

`filter` (Effects; its Adjustments entry in Image on an image) and `backdrop-filter`.

- **At rest:** Layer blur, Background blur and Drop shadow are entries of their own. Adjustments is one entry, so it
  isn't reordered: a slider for each of brightness, contrast, saturation, hue, grayscale, sepia and invert (Image shows
  the first four), written in Tailwind's filter order between blur and drop shadow. Brightness, contrast and saturation
  are centered sliders from −100 to 100 with 0 as no change, as Figma's and every photo editor's adjustments are; +25
  brightness writes `brightness-125`. Hue runs from −180° to 180°. Grayscale, sepia and invert run from 0 to 100. Each
  slider's hint shows the class it writes. A slider at its neutral value writes nothing.
- **States:** a filter read from code in another order, or with a function twice, is one Custom entry, edited as text,
  with Put in order where that doesn't change what's drawn. Figma's image adjustments are converted
  ([design-options-research.md](design-options-research.md), Bringing a design from Figma).
- **Tokens:** blur, backdrop-blur, drop-shadow.
- **Writes:** `blur-sm`, `brightness-125`, `backdrop-blur-md`, or `filter-[…]` for Custom.
- **Compared:** Webflow stacks filters in any order; Figma adjusts image fills only.

## Transform

- **At rest:** Move's X and Y, Scale as a % with X and Y linked by a lock, as Width and Height are, and flips as
  toggles. CSS applies translate, rotate and scale in that order whatever the panel's, so these are fixed rows; only
  More's Transform list (`transform`, where skew and 3D rotation land) is ordered.
- **Forms:** Move takes lengths and fractions; any whole % of Scale is a step.
- **Editing:** while Transform is open, the origin shows as a dot on the canvas, dragged to move it.
- **Tokens:** spacing for Move.
- **Writes:** `translate-x-4`, `-translate-y-1/2`, `scale-105`, `scale-x-90`, `-scale-x-100`, `origin-top-left`.
- **Compared:** Figma has rotation and flips, and shows the origin only while rotating.

## Angle

- **At rest:** degrees with a ° suffix, an angle glyph inside the field that scrubs it, and a knob beside the field with
  its pointer at the angle. Past 360°, the knob counts the whole turns in its middle and draws the rest of the last turn
  as an arc along its rim, with a dot for the pointer at its end: 450° is 1 with a quarter arc.
- **Editing:** the knob is dragged round, as Framer's is, with no popover, snapping to 15° with Shift; a double-click
  sets 0°, and the keyboard steps it as a slider. A typed `turn` or `rad` becomes degrees; one read from code keeps its
  unit (Typing, in [design-options-fields.md](design-options-fields.md)). Negatives are allowed. Angles are kept as
  typed, never normalized to −180 to 180 as Figma's rotation is, since a transition to 270° turns the other way from one
  to −90°. A field can wrap within a turn where only the direction matters: a gradient's Angle and Start angle do, so
  370° comes to 10° and −90° to 270°; Rotation doesn't.
- **Tokens:** none yet: there's no angle kind.
- **Writes:** `rotate-45`, `-rotate-12`, `rotate-[22.5deg]`, `hue-rotate-90`, a gradient's `bg-linear-45`, or
  `bg-linear-to-r` for the eight named directions.
- **Compared:** Figma normalizes rotation and has no dial; Framer has a knob; DevTools keeps the angle as typed, with
  its dial in a popover.

## Time

- **At rest:** ms with its unit. A typed `0.2s` becomes 200ms; one read from code keeps `s` (Typing, in
  [design-options-fields.md](design-options-fields.md)).
- **Forms:** any whole ms of a transition's duration or delay is a step in Tailwind v4 (`duration-200`, `duration-1200`,
  `delay-75`), so it never needs brackets, and it's unmarked while the project has no duration tokens
  ([design-options-tokens.md](design-options-tokens.md), Framework steps). An animation's duration and delay have no
  Tailwind utility, so they're written in the animation's own value or as an arbitrary property
  (`[animation-duration:200ms]`), as Iterations is.
- **Tokens:** duration, as a track whose dot crosses it in that time.
- **Writes:** `duration-200`, `delay-75`, or `duration-[0.2s]` as read from code.
- **Compared:** Figma's Motion has timing variables.

## Easing and spring

- **At rest:** a small curve and its name: the token's name, a preset (Ease out, Linear, Steps 4), Spring (400ms, bounce
  0.2), or Custom.
- **Editing:** a popover with a tab for each way to set an easing: Curve, Steps and Spring. Each starts with the same
  graph, the easing's mark every preview draws, at the editor's size, with a dot riding the curve while it's open, as a
  token's detail plays it; a tab the easing isn't set by shows its default, faint. Under it, Curve has the curve's two
  handles, Tailwind's easings and the project's; Steps the count and where each jump comes; Spring a Set by menu that
  picks time and bounce or stiffness, damping and mass, as Framer's springs are set. A spring says Tailwind has no
  utility for springs, so it's written as an arbitrary value, and offers Save as token, as the shadow list's note does.
- **States:** a spring decides how long the motion takes, so with a spring the Duration field shows its settle time, set
  by Easing.
- **Tokens:** easing, as a curve.
- **Writes:** `ease-out`, `ease-snappy` (a project token, `--ease-snappy`), `ease-[cubic-bezier(0.2,0.8,0.2,1)]`; a
  spring as `ease-[linear(…)]`, which offers Save as token first, since its class runs to hundreds of characters.
- **Compared:** Figma's prototype transitions have a custom bezier editor and springs set by stiffness, damping and
  mass, dragged on a graph; Framer's springs are set by time and bounce or by physics; DevTools has the curve but no
  spring. Only Parity writes a spring as CSS (`linear()`).

## Transition list

Motion's Transitions.

- **At rest:** each entry shows what changes (All, Colors, Opacity, Transform, Shadow, or a property's name), then its
  timing (`200ms · Ease out`, with the curve's thumbnail), the eye and −. An unset duration or easing shows Tailwind's
  default faintly (150ms), from `--default-transition-duration` and `--default-transition-timing-function`; + adds
  Colors at those defaults.
- **Forms:** what changes is a keyword set or a property; duration and delay are Time; easing is Easing and spring. A
  transition token fills a whole entry, and its parts can be overridden where the framework can (Composite token).
- **Details:** Changes is one field. Focused, it lists the sets with their utilities (`transition-colors`); typing
  narrows them or names a property of its own (`width`, offered as `transition-[width]`), and Enter takes the
  highlighted one. Duration and Delay draw their time as Easing draws its curve, with the Tokens panel's mark: a track
  of one weight, whose dot crosses it in that time while the field's hovered. The dot and the track match the Easing's
  dot and curve. One of Tailwind's easings is a chip (`out` for `ease-out`), as a token is, so Backspace takes it off
  whole.
- **Tokens:** transition for a whole entry, which has no kind ([design-options-tokens.md](design-options-tokens.md),
  Fields and token kinds); duration and easing for its parts.
- **Writes:** Tailwind allows one transition property, duration, easing and delay per element. One entry is utilities
  (`transition-colors duration-200 ease-out delay-75`). Entries with the same timing merge into one property list
  (`transition-[color,opacity] duration-200`). Entries with different timings are one arbitrary value
  (`[transition:color_200ms_var(--ease-out),opacity_300ms_var(--ease-snappy)]`); a note under the list says "Mixed
  timings are written as one arbitrary value." and offers Save as token, as the shadow list does. A merged or arbitrary
  list spells out each entry's properties as its utility does: Transform as `transform, translate, scale, rotate`, and
  Colors as `transition-colors`' list.
- **Compared:** Webflow stacks transitions, each with its own timing; Figma and Framer set one transition per
  interaction.

## Font family

- **At rest:** the first family's name in its own face, with `+2` when the stack has fallbacks and the stack in the
  hint. Choosing another font keeps the fallbacks.
- **Editing:** a searchable list set in each font, the project's fonts first.
- **States:** a font the frame can't load (not in the project) is Missing font, drawn in the fallback with its name
  struck through, with Replace font and Add font, as Figma's missing fonts are.
- **Tokens:** font, as "Ag" in the font.
- **Writes:** `font-sans`, `font-(family-name:--brand)` or `font-[Inter]` (marked). A family name with spaces is quoted,
  with underscores for the spaces: `font-['Open_Sans',sans-serif]`.
- **Compared:** Figma has no font stacks.

## Weight

- **At rest:** the name (Semibold), with the number in the hint and the menu; a weight with no name shows its number.
- **Editing:** a menu of named weights; a variable font adds a number field with a slider over its weight axis.
- **States:** a weight the font lacks is marked "Faked by the browser" (`font-synthesis`).
- **Tokens:** font-weight.
- **Writes:** `font-semibold`, or `font-[550]` (marked).
- **Compared:** Figma lists the font's named styles.

## Line height and letter spacing

- **At rest:** line height as Auto for `normal`, a multiple with × (1.5×), or px for a step or a px value; a typed %
  becomes its multiple (150% → 1.5×), as it's written ([design-options-code.md](design-options-code.md), Line height
  beside a size). Unset beside a size token, the size's paired value shows faint, labeled From size. Letter spacing
  shows as a percentage of the font size, as Figma's does (`tracking-tight` shows `tight · −2.5%`), or in px when typed
  in px; a % is written as em (`tracking-[0.05em]`) and a px value as px (`tracking-[-0.5px]`).
- **Forms:** leading tokens; a spacing token or step for a line height in px (`leading-6` is 24px); a multiple or em as
  a value; `normal`; tracking tokens. A size's pairs (`--text-sm--line-height`) aren't offered as tokens.
- **Typing:** a bare number keeps the unit shown. A multiple above 4 asks "Did you mean 24px?", and a px value below 4
  asks "Did you mean 1.5×?".
- **Editing:** the unit's menu holds ×, px and % for line height, and %, em and px for letter spacing. Up and Down step
  a multiple by 0.05 (Shift 0.25) and letter spacing by 0.5% (Shift 2.5%).
- **Tokens:** leading and spacing for line height, tracking for letter spacing.
- **Writes:** `leading-none`, `leading-snug`, `leading-6`, `leading-[1.5]`, `leading-5.5` (22px, a step),
  `leading-[22.5px]` (off the steps), never `leading-1.5`, which Tailwind reads as a spacing step (6px); beside a size,
  `text-sm/6` for a size that pairs only a line height, and `text-xl leading-7` for one that also pairs a weight or
  letter spacing ([design-options-code.md](design-options-code.md), Line height beside a size); `tracking-tight`,
  `tracking-wide`, `tracking-[0.05em]`, `tracking-[-0.5px]`.
- **Compared:** Figma shows line height as Auto, px or % and letter spacing as % or px; neither Figma nor Webflow shows
  a style's paired value as From size.

## Composite token

A typography preset, border, shadow, transition or animation token.

- **At rest:** the token's chip with a one-line summary of its parts (`heading-1 · Inter 20/28 Semibold`,
  `card · 1px solid`, `md · 0 4 6 −1`, `colors · 150ms ease`), in the row or list entry that holds it.
- **Editing:** its parts fold under a disclosure, drawn in the token's color. A part changed on the layer stays shown,
  in the override color with its reset arrow, and puts a dot on the chip. Where the framework can't override that part
  ([design-options-code.md](design-options-code.md), Overrides in classes), editing it offers Detach. Detach, Edit token
  and Go to definition are in the field's menu, as for any token.
- **Tokens:** those Fields and token kinds in [design-options-tokens.md](design-options-tokens.md) offers for the row
  that holds it: Typography preset's (type-style and the others that table lists), border, shadow and inset-shadow,
  transition tokens (which have no kind) and animation.
- **Writes:** the token's class, then one class per overridden part.

## Keyword sets

Icon toggles or a menu, as each row in [design-options-panel.md](design-options-panel.md) says, each option previewed on
hover where it shows (blend modes, cursors) and its hint naming the CSS keyword it writes (principle 1).

- **States:** unset, the option the layer inherits or starts with shows faintly (unset text Align shows Left faintly);
  setting it presses it fully and colors the label. Mixed presses none, with Mixed after the label. A menu shows the
  inherited option as its muted placeholder (Left), as an unset field does. A keyword outside the set, read from code
  (`justify-content: safe center`), shows as a text chip with Custom, edited as text, never dropped or snapped.
- **Forms:** `inherit`, `initial`, `unset` and `revert` are keywords every field takes, shown in words. Inherit is in
  the menu wherever the property inherits or Tailwind has an `-inherit` utility (`text-inherit`); the others are typed.
- **Tokens:** cursor for Cursor; stroke style tokens for Stroke's Style, which have no kind
  ([design-options-tokens.md](design-options-tokens.md), Fields and token kinds); none for the other sets.
- **Writes:** Tailwind's utility, or an arbitrary property (`[text-align:inherit]`).
- **Compared:** Webflow's label colors and DevTools show what's inherited; Figma's toggles can't.

## Position in a box

Image's Position, Transform's Origin, a fill image's position.

- **At rest:** the nine spots. A value off them (`30% 70%`) lights none, shows as a dot where it is, with its X and Y.
- **Editing:** dragging in the box sets any position, Shift snapping to the spots; on an image, the focal point is also
  dragged on the canvas.
- **Writes:** `object-top-left`, `origin-center`, `bg-bottom`, or `object-[25%_75%]`.
- **Compared:** neither Figma's crop nor DevTools shows an off-grid value on the nine spots.

## Aspect ratio

- **At rest:** `16:9`, with its name where it has one (Video).
- **Editing:** typed as `16:9`, `16/9`, `16x9` or `1.78`; named ratios in its menu.
- **Tokens:** aspect.
- **Writes:** `aspect-video`, `aspect-square`, `aspect-4/3` (a step, which Tailwind v4 takes bare), `aspect-[1.618]`.
- **Compared:** Figma's lock writes nothing.

## Grid tracks

- **At rest:** while every track is the same size, a count and a size side by side ("3", Fill). Each column (or Each
  row), the toggle at the name's end, lists the tracks one a row: a grip to reorder, the track's number and size, and −.
  Sizes are words where a size mode fits, as chips (Fill, Fill ×2, Hug, Min content, Max content, and Fill with its
  least width after it, `min 120`), or a length (200 px, 50%). Labels on the canvas show the same sizes.
- **Editing:** a size's menu lists Fill, Hug, Fixed, Fill with a minimum (`minmax()`), Min content and Max content;
  typing takes CSS or those words (`200`, `50%`, `2fr`, `Fill ×2`, `120-Fill`). The count takes Fit for columns, as many
  as fit, each at least a width (`repeat(auto-fit, …)`), and Auto for rows, as many as children need, each a chip saying
  how many it makes; with Auto, the size is the size of those rows (`grid-auto-rows`). Hovering a track's row highlights
  it on the canvas. On the canvas, a size label on each track and dragging between them. A grid inside a grid also
  offers Subgrid, which takes its parent's tracks (`grid-cols-subgrid`, `grid-rows-subgrid`), so cards in a row line up
  their titles and footers.
- **Tokens:** spacing, container.
- **Writes:** `grid-cols-3`, or `grid-cols-[200px_minmax(0,1fr)]`, a Fill track as `minmax(0,1fr)`; `auto-rows-fr`.
- **Compared:** Figma has fixed, fr and hug tracks; Penpot lists each track to size; Webflow adds `minmax()` and
  auto-fit.

## Grid placement

- **At rest:** a map of the grid numbers its lines along its edges, the child's own in the layer's color, with Auto and
  Manual beside it. Under the map, where it sits in its cell is a box of spots beside Start and Span for columns and
  rows, laid out as a table; Span takes All as a chip. End lines and an area are under More.
- **Editing:** dragging the child moves it, dragging an edge moves that line, dragging across cells draws it, and a
  click on a cell moves it there, keeping its span. A field hovered or focused lights up its line or tracks in the map.
  A spot on an axis the child fills makes it hug, and Fill stretches it again, so the box, the map and W and H agree; W
  and H show Fill and Hug as chips, with a Sizing menu at their end. On the canvas, dragging a child's edge across the
  tracks sets its span and start line, as Figma's grid does.
- **Writes:** `col-span-2`, `col-start-2`, `row-span-full`, `[grid-area:hero]`.
- **Compared:** Figma has spans; Webflow adds lines and areas.

## Insets

- **At rest:** each side's value sits on its line in the inset box, a token's shaded. An unpinned side is `auto` and
  says Auto; its field shows its measured distance, muted (Auto 176px), and typing pins it.
- **Forms:** % is of the containing block, Top and Bottom of its height.
- **Editing:** clicking a side's line pins it at its measured distance, and clicking again unpins it to `auto`, as
  Framer's pin box does. Its value opens its field in a popover, as the box model's sides do; Alt and Alt+Shift reach
  the opposite side and all four. Dragging an Absolute layer updates the pinned sides.
- **Tokens:** spacing.
- **Writes:** `top-4`, `inset-x-0`, `top-1/2`, `-top-2`, `inset-0`.
- **Compared:** Figma's constraints show no distances.

## Expression

- **At rest:** `clamp · 24` (the function and what it comes to), after an `ƒ` mark at the field's start that opens the
  expression, as clicking its text does; only `ƒ` where the field is under 96px. The full text is in the hint.
- **Editing:** `=` in any field opens an expression, with completion for `var()`, `calc()`, `min()`, `max()`, `clamp()`
  and `color-mix()`, as Webflow's fields do; maths that mixes units becomes `calc()`. Focusing widens the field to the
  row and shows the text, as Webflow's `=` editor opens wide, with each `var()` drawn as an inline token chip. Clicking
  a `clamp()` opens its three fields: least, preferred and most.
- **Tokens:** the field's kind, inside `var()`, tracked as references so renaming and Missing cover them.
- **Writes:** `w-[calc(100%-2rem)]`, `text-[clamp(1rem,2vw,2rem)]`.
- **Compared:** Figma works maths out when typed; Webflow keeps the expression.

## Raw CSS value

The CSS row, and More rows with no control.

- **At rest:** `property: value` in the code font, with the off checkbox, a mark on a value other browsers lack, and
  inline previews in the value (a swatch, a curve, a shadow card), as DevTools' Styles pane has them; clicking one opens
  that type's editor.
- **Editing:** completion, and the invalid state every field has.
- **Writes:** an arbitrary property (`[interpolate-size:allow-keywords]`).
