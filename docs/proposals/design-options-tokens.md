# Design options: tokens in fields

Part of [design-options.md](design-options.md) (PAR-652). Which tokens each field offers, how a value off the system is
marked, which framework steps count as on it, the levels a project sets, Semantic and Primitive, overriding part of a
token, and what a typography preset is. How a token is shown and picked in a field is in
[design-options-fields.md](design-options-fields.md).

## Fields and token kinds

Figma calls this a variable's scopes, 23 of them, which say which fields a variable may be used in. Webflow limits each
variable type (color, size, percentage, number, font) to the fields it fits. Parity already has a finer classification:
`previewKind` in `@parity-app/tokens` gives every token one of 29 kinds from its value, name, category and DTCG type.
Fields ask for kinds rather than categories, so a token of a kind with no category (opacity, blur, border width) can be
used as soon as it's in the stylesheet.

| Fields                                                                                                                                                                                                   | Token kinds offered                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fill color, text color, border, outline and decoration color, shadow color, accent, caret and scrollbar color                                                                                            | color                                                                                                                                                                                                |
| A fill                                                                                                                                                                                                   | color, gradient                                                                                                                                                                                      |
| A mask                                                                                                                                                                                                   | gradient                                                                                                                                                                                             |
| Padding, margin, gap, insets, translate, text indent, scroll padding and margin                                                                                                                          | spacing                                                                                                                                                                                              |
| Width, height, min and max, flex basis, grid tracks, column width                                                                                                                                        | spacing, container                                                                                                                                                                                   |
| Radius (one or each corner)                                                                                                                                                                              | radius, and Full                                                                                                                                                                                     |
| Border width, outline width, ring width, decoration thickness, divider width, icon stroke width, outline offset and underline offset (px, as Tailwind's `outline-offset-2` and `underline-offset-4` are) | border-width                                                                                                                                                                                         |
| A whole border (width, style and color)                                                                                                                                                                  | border                                                                                                                                                                                               |
| Shadows                                                                                                                                                                                                  | shadow, inset-shadow                                                                                                                                                                                 |
| Drop shadow that follows the shape (`filter`)                                                                                                                                                            | drop-shadow                                                                                                                                                                                          |
| Text shadow (Drop shadow on a text layer)                                                                                                                                                                | text-shadow                                                                                                                                                                                          |
| Typography preset (size with its line height, letter spacing and weight; font, OpenType features or case where the style sets them)                                                                      | type-style tokens, project utilities that set only type (`@utility type-heading`), and font-size tokens that pair a weight or letter spacing (`--text-xl--font-weight`, `--text-xl--letter-spacing`) |
| Font                                                                                                                                                                                                     | font                                                                                                                                                                                                 |
| Font size                                                                                                                                                                                                | font-size tokens that pair nothing or only a line height (all of Tailwind's defaults); one that pairs a weight or letter spacing is offered in Typography preset                                     |
| Weight                                                                                                                                                                                                   | font-weight                                                                                                                                                                                          |
| Line height                                                                                                                                                                                              | leading, spacing (Tailwind v4's `leading-6` is a spacing step)                                                                                                                                       |
| Letter spacing, word spacing                                                                                                                                                                             | tracking                                                                                                                                                                                             |
| Opacity, a color's alpha                                                                                                                                                                                 | opacity                                                                                                                                                                                              |
| Layer blur                                                                                                                                                                                               | blur                                                                                                                                                                                                 |
| Background blur                                                                                                                                                                                          | blur, backdrop-blur (Tailwind's `backdrop-blur-*` reads `--blur-*`)                                                                                                                                  |
| Aspect ratio                                                                                                                                                                                             | aspect                                                                                                                                                                                               |
| Perspective                                                                                                                                                                                              | perspective                                                                                                                                                                                          |
| Layer order                                                                                                                                                                                              | z-index                                                                                                                                                                                              |
| Cursor                                                                                                                                                                                                   | cursor                                                                                                                                                                                               |
| Transition and animation duration and delay                                                                                                                                                              | duration                                                                                                                                                                                             |
| Transition and animation easing                                                                                                                                                                          | easing                                                                                                                                                                                               |
| Animation                                                                                                                                                                                                | animation                                                                                                                                                                                            |
| Size container breakpoints                                                                                                                                                                               | container (Tailwind v4's `@md:` reads `--container-md`)                                                                                                                                              |
| Breakpoints                                                                                                                                                                                              | breakpoint: a viewport's prefix, chosen in the Modes panel, not in a field (call 8)                                                                                                                  |
| Any other number (flex grow, iterations)                                                                                                                                                                 | number tokens whose value is a plain number: the number kind is `previewKind`'s catch-all for any token it can't place, keywords included                                                            |
| A shadow's offsets, blur and spread (a Ring's width aside); gradient stop positions; filter amounts; scale; grid lines and spans; origins and object positions                                           | none: values or steps only (`brightness-125`, `scale-105`). These fields have no token button                                                                                                        |

A token is offered in Typography preset or in Size, never both, so a class reads back into one key. A size token whose
only pair is its line height is a size. It's chosen in Size, and its line height shows as From size. In a project with
no typography presets, the Typography preset row is hidden, and Font is the section's first row.

One kind doesn't exist yet: angles, for a gradient's angle, a rotation and a hue rotation. It's worth adding once a
project has angle tokens; until then those fields take values, and steps where Framework steps lists them, with no token
button. Delays need no kind of their own, since `previewKind` already reads a delay as a duration. An opacity token
written as a percentage (`--opacity-muted: 50%`, `--brand-alpha: 50%`) isn't read as opacity yet: `inferTokenKind` reads
any `%` value as a length, so today only a plain number named for opacity or alpha (`0.5`) is an opacity token. Reading
a percentage named for opacity or alpha as opacity is part of this work. Two DTCG types have no kind: `transition`
(duration, easing and delay together) and `strokeStyle`. A transition token is offered in Motion's Transitions row as a
whole, and its three parts can be overridden where the framework can, as any composite token's (A token can be
overridden in part, below). A stroke style token is offered in Stroke's Style menu.

A token named `<base>--<part>` whose base is also a token (`--text-xl--line-height`, `--text-xl--letter-spacing`,
`--text-xl--font-weight`) is a value paired with its base, as Tailwind v4 pairs them. It isn't offered in the Line
height, Letter spacing or Weight pickers. It shows in its base's detail and in the row's From size value. A DTCG font
size gives its pair through `$extensions.parity.lineHeight`, which Parity already reads.

Kinds are inferred, so a token's author can correct one. A DTCG token's `$extensions.parity.kind` sets its kind,
`$extensions.parity.fields` limits it to some of the fields of that kind (as Figma's scopes do, by Figma's scope names
plus Parity's own, such as `INSET`), and `$extensions.parity.hidden` keeps it out of pickers (component-internal
tokens); for tokens defined in CSS, the Tokens panel's detail sets the same three. Tokens brought from Figma keep their
scopes, hidden flag and code syntax as `fields`, `hidden` and `var`. Settings for tokens Parity doesn't own go in the
project's `.lib.par`, and every other tool's `$extensions` are kept. PAR-143 has the rest.

The framework's defaults are tokens too, since Parity reads Tailwind's full theme. A project that resets a namespace
(`--color-*: initial`) has none of those defaults. One that doesn't shows them in pickers after its own tokens, under
Tailwind defaults, and a project setting can hide them per kind. `hidden` can name a namespace as well as a token.

## A value that isn't a token is marked

As PAR-194 already plans for lengths off the scale, a value that isn't a token is marked, with the nearest token one
click away. A token is matched within its kind only, by its value in the mode shown. A color's nearest token is the one
with the smallest ΔE OK (Euclidean distance in OKLab), offered only for a near match, Semantic before Primitive; a
length's in a spacing field (the first row of Framework steps) is the nearest spacing token or unmarked step
(`spacingScale`, and the fractions where the field takes them, Framework steps below), offered within half a whole step
(2px at Tailwind's default `--spacing`). When the matched token has a different value in another theme, the offer says
so ("primary: the same in Light, darker in Dark"), since replacing the value changes the design there. Past that, the
mark offers Create token, which opens the Tokens panel's editor with the value, a name and the kind filled in, and
replaces the value with the new token.

Create token writes where the field's utility will find it. A Primitive goes into `@theme` under the kind's namespace
(`--color-brand`, `--radius-card`, `--shadow-card`), so it's written `bg-brand`, as stylesheet.ts already places theme
tokens. A Semantic token, with a value per theme, goes in `:root` and each theme's block, with a `@theme inline` alias,
as shadcn's tokens are. The editor asks which, with Primitive the default for one value. In a project whose tokens
another tool owns (a Tokens Studio sync, a Figma export), Create token writes nothing there; it copies the token as DTCG
to paste into that tool, and the value stays marked until the token arrives.

A reference to a token the stylesheet no longer has is marked Missing, drawn with its last known value, and offers the
nearest token. A token marked `$deprecated` in DTCG is left out of pickers and marked on the layers that use it, with
its replacement where one is named. A project can limit values to tokens, which turns the mark into a refusal (Levels,
below).

## Framework steps count as on the system

Tailwind v4 takes bare numbers for many utilities whose theme has no tokens by default. A value such a utility takes is
a Step, written without brackets. Each field's steps, checked against Tailwind 4.3.3:

| Fields                                                                                                                                | Steps                                                                                                   | Example                                                   | Not a step                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------ |
| Spacing fields: padding, margin, gap, sizes and their limits, insets, translate, indent, scroll padding and margin, line height in px | Multiples of 0.25 of `--spacing`; fractions in sizes and their limits, flex basis, insets and translate | `p-3.25`, `w-1/2`, `leading-6`                            | `p-[13.3px]`                   |
| Border, outline, ring and divider width, outline offset, underline offset, decoration thickness                                       | Whole px                                                                                                | `border-3`, `ring-3`, `outline-offset-2`                  | `border-[1.5px]`               |
| Opacity, a color's alpha                                                                                                              | Multiples of 0.25%                                                                                      | `opacity-47.5`, `bg-black/20`                             | `opacity-[.473]`               |
| Scale, filter amounts                                                                                                                 | Whole %                                                                                                 | `scale-105`, `brightness-110`                             | `scale-[1.025]`                |
| Rotation, hue rotation, a gradient's angle                                                                                            | Whole degrees                                                                                           | `rotate-45`, `rotate-22`, `hue-rotate-15`, `bg-linear-45` | `rotate-[22.5deg]`             |
| Transition duration and delay                                                                                                         | Whole ms                                                                                                | `duration-150`, `duration-1234`                           | `duration-[0.2s]`              |
| Z-index, order, grow and shrink, Max lines, grid counts and spans, text column count                                                  | Whole numbers                                                                                           | `z-37`, `order-7`, `line-clamp-3`, `columns-3`            | None                           |
| Gradient stop positions                                                                                                               | Whole %                                                                                                 | `from-10%`                                                | `from-[12.5%]`                 |
| Aspect ratio                                                                                                                          | A ratio of multiples of 0.25                                                                            | `aspect-16/9`, `aspect-1.5/1`                             | `aspect-[1.618]`               |
| Radius, blur, font size, letter spacing, a shadow's offsets, blur and spread (a Ring's width is a step, above), grid tracks           | None                                                                                                    | None                                                      | `rounded-[6px]`, `text-[13px]` |

A fraction is any ratio of whole numbers, which Tailwind takes bare in sizes and their limits, flex basis, insets and
translate (`w-1/2`, `w-5/13`, `basis-1/3`, `top-1/2`, `-translate-x-1/2`); a typed percentage in those fields is written
as one when its denominator is 12 or less (50% → `w-1/2`; 50% padding is `p-[50%]`). 100% is `w-full`, 100vw `w-screen`,
100dvh `h-dvh` and 100svh `h-svh`, each a keyword (`{ keyword: "full" }`), as Size in
[design-options-values.md](design-options-values.md) stores it. A step stores the utility's own number (`{ step: 50 }`
is `opacity-50`, `{ step: 47.5 }` is `opacity-47.5`); a value stores the CSS number (`{ value: 0.473 }` is
`opacity-[.473]`), so each class reads back into one form.

Today `extractTokens` lists the spacing scale's steps as tokens of their own (`spacing-4`, `Token.derived`). They become
Steps: listed in the picker's Scale group, stored as `{ step: 4 }`, shown as the number they come to and never as a
chip, and `p-4` reads back as a step, unless the project's theme defines `--spacing-4` (or `--padding-4`), which
Tailwind 4.3.3 resolves before the bare number, so `p-4` then reads back as that token. Typing `spacing-4` still finds
step 4. A spacing token the project names itself (`--spacing-card`) stays a token.

At Tokens only, a step is allowed where it would be unmarked under Marked, as below; another multiple (`p-3.25`) is
refused, as a marked value is. Under Marked, steps of opacity, z-index, border width and duration stay unmarked only
while the project defines no tokens of that kind (any token `previewKind` reads as one of those, inside the theme's
namespace, such as `--opacity-*`, or outside it, such as `--brand-alpha`); once it does, steps of that kind are marked
as values are, and a project can turn this off per kind. Spacing steps unmarked by default are Tailwind's documented
scale (`spacingScale` in `@parity-app/tokens`) and the fractions. Another multiple (`p-3.25`) is written bare but
marked. A project can widen or narrow that list. A value that needs brackets (`border-[1.5px]`, `bg-[#2563eb]`,
`rounded-[6px]`, `rotate-[22.5deg]`, `opacity-[.473]`) is always off the system; a bare step is off it only as this
paragraph says.

## Levels

- **Levels.** A project setting, kept in the project's own `.lib.par` under `$extensions.parity.levels` so the agent and
  CI read it where they read the tokens, sets a level for each kind: Any value, Marked (the default), Tokens only, and,
  for colors, Semantic only. A level is set per kind, and can be narrowed per field group with the scope names `fields`
  already uses (`GAP`, `WIDTH_HEIGHT`, `CORNER_RADIUS`, `FRAME_FILL`, `TEXT_FILL`, plus Parity's `INSET`), so a team can
  hold padding and gap to tokens while leaving widths free. The CSS row, tokens set on a layer and per-theme values
  follow the same levels.
- **Always allowed:** `0`, `auto`, `none`, `100%`, `currentColor`, `transparent`, `inherit`, a framework step that
  Framework steps leaves unmarked, and expressions on the system, such as `calc(100% - var(--spacing) * 8)`. An
  expression is on the system only when every number in it is a step multiplier that Framework steps leaves unmarked
  (one in `spacingScale` for `--spacing`), 0, 1, −1 or 100%, and every value in it is a token:
  `calc(var(--spacing-card) * 1.37)` isn't. Tokens inside an expression are tracked as references (`tokenReferences` in
  `@parity-app/tokens`), so renaming, Missing, `$deprecated` and Off-system cover them.
- **Tokens only locks the field,** which is never the default: a company asks for it so its apps match its design
  language. Typing searches the kind's tokens, with the nearest to a value typed first, rather than taking a value of
  its own, and a color's picker has no Custom tab. A side still takes a step on the scale. A value of its own read from
  code stays, outlined in the error color with "Not a token." and Use with the nearest token under it (the nearest step
  for a side), and CI fails on it until a token is used or it's allowed here.
- **The nearest token is always offered,** locked or not, so a color or length handed over from a design lands on the
  system in one click: first in a field's token list ("Nearest to 12px"), in a locked field's search, beside a color's
  Custom editor, and in a narrow field's hint.
- **Allow here,** in a refused or marked value's menu, keeps the value with a reason and marks it as an exception. The
  reason is stored on the value (`{ value: "#18181b", allow: "Photo backdrop" }`), so it moves with the layer when it's
  copied, pasted or made into a component; the off-system state itself is worked out, never stored. CI passes an
  exception but reports how many there are, as eslint's disable comments do.

## Semantic and Primitive

A token is Semantic when its value is another token (`--card: var(--zinc-50)`), or when it has a different value in some
theme. A Tailwind alias that only maps a token into a namespace (`--color-primary: var(--primary)` in `@theme inline`)
isn't a token of its own: `extractTokens` already folds it into `primary`, and it's how `{ token: "primary" }` is
written as `bg-primary`. A token worked out from another (`--radius-lg: calc(var(--radius) + 4px)`, a `color-mix()` of a
token) takes the tier of the token it's built on, so a scale built on one base stays Primitive. Any other token is
Primitive: a raw value that's the same in every theme. A token's author can set it in the token's
`$extensions.parity.tier` (`semantic` or `primitive`), or in the Tokens panel's detail for a token defined in CSS.
Pickers, the nearest-token rule and the Semantic only level all use this split, never where the token was defined. The
Tokens panel's Colors section shows the same two groups (today it calls the second one the Palette).

A token whose value differs between themes offers, on Detach, "This theme's value" or "Its value in every theme", which
writes a value for each theme as that theme's patch (States, Set for a theme, in
[design-options-fields.md](design-options-fields.md)).

## A token can be overridden in part

A token that stands for several values (a typography preset, a shadow, a border, a transition, an animation) stays
applied when one of its parts is changed. The changed part is marked as an override on that row, with a reset arrow back
to the token's value, as Figma marks an override on a component instance (Figma itself detaches a text or effect style
when one of its values changes). It's written the way the framework overrides one: `text-xl leading-7` for a line
height, `shadow-lg shadow-black/20` for a shadow's color, `drop-shadow-md drop-shadow-primary/40`, and a border token's
width by replacing its width class ([design-options-code.md](design-options-code.md), Overrides in classes).

A part can be overridden only where the framework can do it. A token outside a Tailwind namespace
(`shadow-(--mantine-shadow-md)`, a gradient token as `bg-(image:--brand-gradient)`) is one variable, so changing one of
its parts offers Detach instead of an override. Detach writes the parts as values and drops the token.

A color's alpha, which can be an opacity token, is part of the color (Percentage and opacity, in
[design-options-values.md](design-options-values.md)); under Tokens only it must be an opacity token, or a step while
the project has none (Framework steps).

## What a typography preset is

A typography preset is written the way the project's styling framework writes one. In Tailwind v4, that's a `--text-*`
size that pairs a weight or letter spacing, usually with a line height (call 6), so `text-xl` sets all four, and a font
is a separate `font-*` class. A DTCG typography token compiles to that same set of variables. A `font` shorthand token
is read as a style but never written as `font:`, since `font` can't hold letter spacing and resets the OpenType
settings.

A style that names a font, or sets anything a `--text-*` size can't pair (OpenType features, case), is a project utility
(`@utility heading-1 { … }`, or a class in `@layer components`), which is how many Tailwind teams write a style with a
font. It's offered in the Typography preset picker, written as its one class, and reads back as one style. A DTCG
typography token that names a font is compiled to one (`@utility type-heading { … }`). A `font-*` class beside a style
is an override.

A style can differ per breakpoint, as Framer's do. Its variables are redefined in a breakpoint's `@media (width >= …)`
block in the project's CSS, which Parity reads as that viewport's value, so the layer keeps one class. Changing the size
on one layer per viewport instead writes a viewport patch (`text-base md:text-lg`). How the panel shows a style is under
Text in [design-options-panel.md](design-options-panel.md).
