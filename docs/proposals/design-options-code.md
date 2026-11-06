# Design options: what the panel writes to code

Part of [design-options.md](design-options.md) (PAR-652). What the design model stores, how frames draw it, the classes
Parity writes and how they read back, and what states, viewports, themes and animation triggers write. Each value type's
usual classes are under Writes in [design-options-values.md](design-options-values.md), and the harder cases under
Values in classes, below.

## What the design model needs

`NodeStyle` was built for a token-locked subset. For the rest:

- **Values in five forms.** PAR-194 decides how a length that isn't a step or a token is stored. Every other value type
  takes the same forms, so a color, a radius or a layer blur can be a token, a value, a keyword or an expression, and a
  value is a step where its utility takes a bare number. Each value is stored with its form:
  `{ token: "primary", alpha?: { step: 50 } | { value: 0.473 } | { token: "opacity-muted" } }`,
  `{ value: "#2563eb", alpha?: … }` (a color value keeps its alpha apart, in the same forms as a token's, only when code
  wrote it as a modifier, `bg-[#2563eb]/50`; otherwise the alpha is in the value, `#2563eb80`), `{ step: 2 }`,
  `{ keyword: "auto" }` or `{ expr: "clamp(…)" }`, width and height also take `{ size: "hug" }` or
  `{ size: "fill", share?: 2 }`, and a grid track `{ fr: 1 }`, a Fill track, written and read back as `minmax(0,1fr)` (a
  plain `1fr`, Fill, grow with content, is the value `{ value: "1fr" }`), so whether a value is a token is never guessed
  from its text. Today Hug and Fill are strings among `Length` (`document.ts`), where a token named `fill` would be read
  as Fill. An exception keeps its reason on the value (`{ value: "#18181b", allow: "Photo backdrop" }`), and a preset
  its settings (`{ spring: { duration: 400, bounce: 0.2 } }`). The new forms are a new `.par` version. The repository's
  examples and fixtures are rewritten in it, and a file in today's form is rejected, as conventions.md's Fix forward
  rule says (one current format, no old readers).
- **Steps where Tailwind takes a bare number.** A value is kept as a step wherever its utility takes it without brackets
  ([design-options-tokens.md](design-options-tokens.md), Framework steps, gives each field's scale). That covers, among
  others, spacing steps for padding, margin, gap, width and height with their limits, insets, translate, text indent,
  scroll padding and margin, and a line height in px (`leading-6`); whole px for border, outline and ring width, outline
  offset and underline offset (`border-3`); and the steps of opacity, z-index, order, scale, rotation, and a
  transition's duration and delay. Radius, blur, font size, letter spacing, a shadow's offsets, blur and spread (a
  Ring's width aside) and a grid's fixed tracks have no bare-number utility (`rounded-3`, `blur-3` and `text-13` compile
  to nothing), so they're kept as a token's name, or as a value (`rounded-[6px]`), never as steps. px and rem stay ways
  of typing and showing a value, as `FieldUnit` has them today.
- **Units that can't become pixels are kept as written.** A percentage, em, ch, vw, vh, dvh or container unit comes to a
  size that depends on the parent, the font or the screen, so it's stored with its unit rather than worked out when it's
  typed. Frames already turn vw and vh into the mode's screen. `fr` belongs to grid tracks (`{ fr: 1 }`, beside a
  length, `auto`, `min-content`, `max-content` and `minmax()`) and to a Fill's share. PAR-194 decides the stored form;
  [design-options-values.md](design-options-values.md) recommends `%` as CSS reads it (call 10).
- **Lists and sides as data.** Fills, shadows, filters, backdrop filters, transforms and transitions become ordered
  lists, named for the CSS property they write, in camelCase (`boxShadow`, `filter`), except `fills`, which writes
  `background-color` and `background-image` (`filter: [{ type: "blur", value: { token: "blur-sm" } }]`), and radius,
  border width, border color and border style take one value or four, in CSS's order. Each list entry, and each
  declaration in the CSS map, carries an off flag. A patch for a viewport, state or variant replaces a whole key, as
  `applyPatch` does for `padding` today, so one corner changed in a state writes all four, the other three as the frame
  shows them there. In code, a patch writes only the sides, corners or longhands that differ from what's under it
  (`hover:rounded-bl-none`), though the file keeps the whole key.
- **Renamed keys.** Today's keys `transform` (text-transform), `border` (border color), `size` (font size), `font` (font
  family), `background` (one color token) and `shadow` (one shadow token) clash with the CSS names the new lists take.
  They become `textTransform`, `borderColor`, `fontSize`, `fontFamily`, the `fills` list and the `boxShadow` list, and a
  file with the old keys is rejected. The examples' `overflow` values are rewritten as they draw: `scroll` (drawn as
  `auto`) becomes Scroll when needed, and `hidden` stays `hidden` rather than becoming Clip, since the two differ for
  flex sizing and sticky children.
- **A CSS map** for what the CSS row and More hold: declarations by property name, drawn after the structured keys. The
  ledger's one-owner rule decides which properties a structured key owns, so the map never holds one of those.

## Frames draw rules, not inline styles

render.ts gives each element a `style` object today, which can't hold a state's pseudo-class, `::placeholder` or
`::selection`, `@starting-style`, a `@container` query or a `group-hover:` rule. Each frame draws each layer with the
classes Parity will write for it, compiled by the project's own Tailwind (the design system
`@parity-app/styles-tailwind` already loads through `@tailwindcss/node`) into the shadow root's stylesheet, in
Tailwind's own layers. So the frame has the code's cascade: `hover:` inside `@media (hover: hover)`, a text style's
`--tw-leading`, `group-hover:`, `divide-y`'s child selector, a component's own classes against the layer's, and `!`. A
project without Tailwind gets one rule set per layer, keyed by its node id (`[data-node="…"]`), in `@layer utilities`,
with states, theme variants and container queries as its selectors and at-rules. Showing a state on the canvas still
applies its patch, as today. Play draws the real `:hover`, `:focus-visible` and `:active`, so a transition plays as it
will in the app.

## Frames add only what code writes

Today every layout gets `position: relative` and `min-width: 0` (render.ts). Both go. `relative` is written on a layout
that has an Absolute child, the design's root included (it shows in the root's CSS section as set by that child, since a
root has no Position section), and on a layer with a Layer order inside a Block layout. It isn't written when the
layout's Placement is already Absolute, Fixed, Sticky or Relative, each of which already places an Absolute child, and
where `relative` would undo Sticky, Fixed or Absolute. `min-w-0` is written where Fill writes it. Developers don't keep
`relative min-w-0` on every div, and the blanket `min-width: 0` lets a Hug layout shrink below its content in a crowded
row, which Figma's Hug doesn't do.

## What Parity writes into code

It stays Tailwind (PAR-265). A token in a theme namespace the field's utility reads becomes that utility (`bg-primary`,
`p-card`, `rounded-lg`); any other token uses v4's variable shorthand, never `p-[var(--…)]`: a library's
`--mantine-spacing-md` (`p-(--mantine-spacing-md)`), and a theme token the utility doesn't read, such as a container
token in Height (`h-(--container-md)`, since `h-*` reads only `--height-*` and `--spacing-*`) or a border width token in
Outline offset. Where a utility takes more than one type, the shorthand carries the type, since Tailwind otherwise reads
the variable as a color: `text-(length:--font-size-body)`, `font-(family-name:--brand-font)`,
`border-(length:--card-border-width)`, `bg-(image:--brand-gradient)`, `shadow-(color:--brand-shadow)`,
`decoration-(length:--x)`, `outline-(length:--x)`. The token's kind gives the hint, and read-back uses the same hints to
choose the key.

A value becomes an arbitrary value (`rounded-[6px]`, `bg-[#2563eb]`), and a property Tailwind has no utility for an
arbitrary property (`[interpolate-size:allow-keywords]`), so every declaration has a class. Arbitrary values write
spaces as underscores (`w-[calc(100%-2rem)]`, `grid-cols-[200px_minmax(0,1fr)]`), relying on Tailwind to put back the
spaces around `-` and `+` in `calc()`. A value that isn't a token and would make a long arbitrary class, such as a
gradient, a shadow of more than one layer, a spring or a `clamp()`, offers Save as token first. The new token's utility
replaces the arbitrary class, and Copy as Tailwind shows the class that will be written, so a designer sees an
unreadable class before it's written. Classes are written in the order prettier-plugin-tailwindcss produces.

**The hover shows the code.** Hovering a row's label shows the declarations it writes
(`border-radius: var(--radius-lg)`), including what frames add for every layer of its type (`margin: 0` on text, which
Tailwind's preflight already writes), in the selector and query it writes them in for the state and mode shown
(`:hover { … }` or `hover:bg-primary/90`; `@media (width >= 48rem) { … }` or `md:p-6`), so the code shown is the code
drawn. Each section's Copy as CSS and Copy as Tailwind copy them the same way.

## Values in classes

Where a value type in [design-options-values.md](design-options-values.md) takes more than one class, or more than one
utility allows:

- **An opacity token as a color's alpha** is written as a named modifier when it's in Tailwind's `--opacity-*` namespace
  and written as a percentage (`bg-primary/muted`), as `bg-primary/(--brand-alpha)` for a percentage outside that
  namespace, and as `bg-primary/[calc(var(--opacity-muted)*100%)]` when it's a number, since the `/(…)` modifier takes a
  percentage.
- **A gradient** of up to three stops, each with at most one position, is written with `bg-linear-<angle>`
  (`bg-linear-to-r`, `bg-linear-45`), `bg-radial-[at_30%_20%]` or `bg-conic-<angle>`, with `from-`, `via-` and `to-` and
  their positions (`from-10%`). Four or more stops, a color hint, a stop at two positions, or a radial size beyond
  Tailwind's is written inside the utility (`bg-linear-[45deg,red_5%,yellow_60%,lime_90%,teal]`). A repeating gradient,
  which has no utility, and two or more layers are written as `bg-[image:…]`. The color space is the utility's modifier
  (`bg-linear-to-r/oklch`, `bg-conic/[in_hsl_longer_hue]`), and a stop's alpha its color's `/50`.
- **Fill layers.** With two or more layers, each fill's size, position, repeat, origin, clip and blend mode is written
  as a comma list in the layers' order (`bg-size-[cover,auto]`, `bg-position-[center,0_0]`,
  `[background-clip:padding-box,border-box]`); `bg-cover`, `bg-center` and `bg-clip-*` would set every layer at once.
  One image fill writes `bg-[url(/images/hero.jpg)] bg-cover bg-center bg-no-repeat`, and Tile writes
  `bg-repeat bg-size-[64px]`.
- **Shadows.** A token fills its own slot (`shadow-md`); a color is `shadow-black/20` or a token. More than one entry in
  a slot, a token beside a value in one, or an entry dragged out of Tailwind's order (a drop shadow above a ring, an
  inset ring above an inner shadow) is one arbitrary value in the order shown, with its tokens as `var()`
  (`shadow-[var(--shadow-sm),0_0_0_1px_var(--color-border)]`); the entry says so and offers Save as token.

## Overrides in classes

An override sets what the token's utility reads, so it works whatever the order of the classes. `text-xl` reads
`--tw-leading`, `--tw-tracking` and `--tw-font-weight`, which `leading-7`, `tracking-wide` and `font-bold` set; it's
never written `text-xl/7`, which drops the letter spacing and weight the size pairs with it. `shadow-lg` reads
`--tw-shadow-color`, which `shadow-black/20` sets.

Tailwind v4 has no border namespace, and an arbitrary `[border:var(--card-border)]` is sorted after every border utility
and every arbitrary longhand. A compiler test with Tailwind 4.3.3 checks that `border-2`, `border-dashed` and
`[border-width:2px]` all come before it, so nothing beside it can override one part. A border token whose parts are
tokens of their own (a DTCG border token's width, style and color, or `--card-border-width`, `--card-border-style` and
`--card-border-color`) is written as those three:
`border-(length:--card-border-width) [border-style:var(--card-border-style)] border-(--card-border-color)`. An override
replaces one of the three classes. A border token that's a single variable offers Detach, as a token outside a Tailwind
namespace does.

A text style written as a project utility (`@utility heading-1`) sets `line-height` and the rest directly, so an
override such as `leading-7` holds only if Tailwind sorts the utility before single-property utilities. That compiler
test checks this too; if it fails, the override is written with `!`.

## Line height beside a size

With a size token, line height is written beside it as `leading-6` (`text-xl leading-7`, for a size that pairs a weight
or letter spacing). `text-sm/6` is written only when the size pairs nothing but a line height, since the `/6` form drops
a paired letter spacing and weight; found in code, it reads back as the size with a line height override. A % is written
as its multiple (150% → `leading-[1.5]`). That's deliberate: a number inherits as a factor while a % inherits as a fixed
length, which breaks children with another font size. A size token with no paired line height leaves line height
inherited, as Tailwind's class does; render.ts's fallback of 1.5 goes, so the frame draws what the class writes.

## What's written reads back

Every class Parity writes reads back into the same key and form: a utility into the token its theme resolves
(`bg-primary`, or `p-4` when the theme defines `--spacing-4`), else a bare number into a step (`p-4`, `z-10`,
`opacity-50`); an arbitrary value (`rounded-[6px]`, `w-[calc(100%-2rem)]`) into a value or expression; a variable
shorthand (`bg-(--brand)`) into the token it names; `bg-primary/50` into a token with alpha; an arbitrary property into
the key that owns its property (`[transition:…]` into the transitions list, `[text-align:inherit]` into Align), or into
the CSS map when no key owns it; and `hover:`, `focus-visible:` and breakpoint prefixes into the state's or viewport's
patch. A test writes each value form and reads it back unchanged. Read-back runs through the drift review decisions.md
sets out: a hand edit that reads back is a change to approve on the design, not applied silently.

A value made by a preset (Spring, Layered shadow) keeps its settings in the file, since the `linear()` or shadow list it
writes can't be read back into them. When the code's value is still what the settings write, it reads back as the
preset; when it differs, it reads back as a Custom curve of points or plain entries.

`ring-*`, `inset-ring-*` and their colors (`ring-ring/50`, as shadcn's components write their focus rings) read back as
Ring entries in Effects' shadow list, with the `ring` token as their color, and are written back as the same utilities.
Writing a design to code changes only the classes Parity wrote on each element and keeps the rest where they are. A
class a developer added by hand (`[&_svg]:size-4`) survives the next write and shows in From the code (call 9). Parity
never regenerates a file whole, as Subframe's sync does.

## Code components

A code component takes the layer's style through `className` when its props take one, and Parity writes it there. The
component then merges its own classes with the layer's (`cn()` with tailwind-merge, as shadcn's components do), which
lets the layer's `bg-red-500` beat the component's `bg-primary`. Without a merge, which class wins depends on the
stylesheet's order, not the order of the classes. So the frame draws the component as its code would, and a value that
loses shows struck through, overridden by the component's code, with Tailwind's `!` modifier (`bg-red-500!`) offered as
the fix. When the code doesn't merge `className`, the Design tab says so on the component and offers the `!` fix per
row. A component that takes `style` but not `className` gets only the rows that work inline, with no states or theme
variants, and says so. One that takes neither gets none, as today.

## Themes

A row set for a theme mode on a layer is written with the variant the project's CSS defines for that theme (`dark:bg-…`,
from `@custom-variant dark (&:where(.dark, .dark *))` or a `data-theme` variant). A theme with no variant can't take a
value per layer, and the row says so. Under Tokens only, the value set for a theme must itself be on the system: a
token, or a step that Framework steps in [design-options-tokens.md](design-options-tokens.md) leaves unmarked
(`dark:bg-zinc-900`, not `dark:bg-[#18181b]`).

## States

Each state names its trigger: a pseudo-class (`:hover`, `:focus-visible`, `:active`, `:disabled`), an attribute
(`[aria-expanded=true]`, `[data-state=open]`) or a prop. As call 7 recommends, pseudo-classes and attributes are the
default, with a prop only when the component's code has one, and states are written as Tailwind variants (`hover:`,
`focus-visible:`, `aria-expanded:`, `data-[state=open]:`).

The States menu lists:

- **The layer's own states,** written on it (`hover:`), as Plasmic's element variants and Webflow's states on a class.
  Hover and press shortcuts on a layer in a screen add that layer's own state, listed under the layer.
- **The component's states.** On the component's root, a state is written on the layers inside as `group-hover:` or
  `group-data-[state=open]:` (Plasmic's interaction variants). The root gets `group`, or a named `group/<name>` when
  components nest, so an inner component's `group-hover:` doesn't fire on its parent's hover.
- **A sibling's or a child's state,** as Tailwind's `peer-*` and `has-*` write it: a label styled when its input is
  checked or invalid (`peer-checked:`, `peer-invalid:`, with `peer` on the input), or a card styled when something
  inside it has focus (`has-focus-visible:`, `has-[:checked]:`).
- **Form states:** Checked, as Webflow has, and Invalid, Required, Read only and Placeholder shown (`checked:`,
  `invalid:`, `required:`, `read-only:`, `placeholder-shown:`).
- **Placeholder and Selected text,** written as `placeholder:` and `selection:`. Pseudo-elements aren't layers;
  `::before`, `::after` and `::marker` wait.
- **Conditions:** First, Last, Odd, Even and Only (`first:`, `last:`, `odd:`, `even:`, `only:`), as Webflow's item
  states. On a component's root, each is drawn on the instances where it holds, so a list item can drop its divider on
  the last one (`last:border-0`).
- **Custom selector,** at the end: any selector relative to the layer, as Plasmic's element variants take, written as an
  arbitrary variant (`[&:nth-child(3)]:`, `[[open]_&]:`), which reads back into the same state.

## Viewports

A viewport's patch applies in that viewport alone, as render.ts draws it, while Tailwind's `md:` applies from its width
up. As call 8 recommends, code is written mobile-first: the narrowest viewport's values are the plain classes, and each
wider viewport adds its prefix only where its value differs from the one below (`p-4 md:p-6 lg:p-8`). A viewport's
prefix is the project's widest breakpoint token at or below its width and above the next narrower viewport's width
(`md:` for 768 with Tailwind's `--breakpoint-md: 48rem`). Where no breakpoint fits, an arbitrary one is written
(`min-[900px]:`), and the Modes panel offers to add a breakpoint token. The frame draws a viewport's values at every
width from its prefix up to the next one, so a frame resized between viewports draws what the code does. A value that
holds in a middle viewport only gets a range (`md:max-lg:p-6`). A row's hover and Copy as Tailwind show this form.

## Animation triggers

Motion's In view trigger ([design-options-panel.md](design-options-panel.md), Motion) writes a `timeline-trigger` on a
`view()` timeline with `animation-trigger`, playing once (Chromium only, marked †). While scrolling writes
`animation-timeline: view()` or `scroll()` with its range. Appear adds `transition-behavior: allow-discrete`, so it can
animate from `display: none`; in view, it uses Animation's In view trigger. Browsers without animation triggers show the
final state (wrapped in `@supports`), so content is never left hidden.

## Classes Parity can't read back

decisions.md says Parity asks whether to freeze the component as code or overwrite the edit. Call 9 recommends a third
answer, offered first, that keeps the class on the layer as a From the code row in the CSS section, not editable there,
written back unchanged on every later write. This is how `[&_svg]:size-4` or a developer's `has-[…]:` variant survives,
without freezing a whole component over one class. Freeze and Overwrite stay in the menu.
