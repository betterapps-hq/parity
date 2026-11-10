# Design options: the field every value shares

Part of [design-options.md](design-options.md) (PAR-652). Every field builds on [editor.md](../editor.md)'s Typing,
stepping and scrubbing (CAN-48), which already sets typing, maths, Mixed, input it can't read, and notes under the row.
This page sets what's the same in every field: its slots, forms, states, typing, keys, token picker and lists. How each
type of value differs is in [design-options-values.md](design-options-values.md), which tokens a field offers in
[design-options-tokens.md](design-options-tokens.md), and how classes are put together in
[design-options-code.md](design-options-code.md).

## The field

Every field has the same slots, left to right:

1. **The label or icon,** which scrubs. It's colored by where the value is set (principle 6), with † when the property
   isn't Baseline (principle 7), and a dot after it when another viewport or state differs (calls 7 and 8).
2. **The value** in its form (Forms, below).
3. **Its unit,** hidden while focused, as today; typing a unit switches to it. Where the field takes more than one unit
   or keyword, the unit is a button that opens the field's unit and mode menu, as Webflow's unit does, separate from the
   token button. For Width and Height the menu lists Fixed, Hug and Fill first, with Auto only when the value is `auto`
   from code or the aspect lock has freed that axis (Size in [design-options-values.md](design-options-values.md)), then
   px, %, rem and More units, with Min content and Max content under More units, then Add min and Add max. A field with
   one unit (ms, °) shows it as plain text.
4. **What it comes to,** in faint text, when the value is a token, keyword, relative unit or expression: measured on
   this layer, in the mode and state shown, as Width already shows for Hug and Fill (`card · 24`, `1.5em · 21px`). Where
   the field has room (about 96px or more), it shows after the value. In narrower fields (sides, corners, a shadow's
   numbers), it shows in the hint and under the row while the field is focused, so a value isn't clipped (PAR-496).
5. **One status slot** for the value's standing with the token system: off the system, exception, Missing, set for a
   theme, deprecated or invalid (States, below).
6. **The token button.** It shows while the field is focused or hovered and holds no token, as Figma's variable button
   does. While the field holds a token, the chip takes the value's place (slot 2): clicking the chip opens the list, and
   the button becomes Detach, as Figma's does. Alt+Down opens the list from the keyboard, as a combobox's list opens.
   Typing a token's name in the field completes it.

In a field narrower than about 96px (sides, corners, a shadow's numbers), only the label, the value and one mark show at
rest; the status mark takes the unit's place. The unit shows on hover, the token button on hover or focus (slot 6), and
what it comes to in the hint and under the row while focused (slot 4). While focused, the value otherwise takes the
whole field, as today.

A value too long for the field is cut in the middle, with the whole value in the hint. A row whose value does nothing is
dimmed whole (principle 10). Where a code component's own class and the layer set the same property, the value that
loses shows struck through under the row ([design-options-panel.md](design-options-panel.md), CSS). No other marks.
Storybook decides the glyphs; this page fixes where each one goes and that it's the same in every field.

The field's menu opens from a right-click on the field or its label. It has Copy as CSS (`padding: 16px`) and Copy as
Tailwind (`p-4`), and pasting either into a field reads it, as DevTools copies declarations. A field holding a token
adds Detach, which writes the token's value as a value of its own; Edit token, which opens it in the Tokens panel's
editor and says how many layers use it; and Go to definition, which opens the line of CSS or DTCG that defines it, as
DevTools jumps from a `var()` to its declaration.

What none of the other tools has is one anatomy in every field: Figma and Webflow each draw tokens, units and maths
differently by field, where here every field has the same slots, states and keys.

## Forms

Every field takes one of these five forms, a step only where its utility takes a bare number, and shows which:

| Form       | Example                                                            | Shown as                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token      | `primary`, `radius-lg`, `container-md`                             | A chip with the token's preview and name                                                                                                                                                                               |
| Step       | `{ step: 4 }` (`p-4`, `border-2`, `z-10`, `duration-200`, `w-1/2`) | The number it comes to in the field's unit (16, 2, 10, 200ms, 50%), unmarked unless its kind's level marks it ([design-options-tokens.md](design-options-tokens.md), Framework steps); the class it writes in the hint |
| Value      | `#2563eb`, `6px` (a radius), `1.5` (a line height), `22.5deg`      | The value with its unit; marked when the kind's level marks it                                                                                                                                                         |
| Keyword    | `auto`, `none`, `currentColor`, `inherit`                          | In words (Auto, None, Text color, Transparent, Inherit), with the CSS keyword in the hint                                                                                                                              |
| Expression | `clamp(1rem, 2vw, 2rem)`, `calc(100% - 2rem)`, `color-mix(…)`      | Its function's name and what it comes to (`clamp · 24`); the text while focused (Expression in [design-options-values.md](design-options-values.md))                                                                   |

Which steps a field takes is in [design-options-tokens.md](design-options-tokens.md), Framework steps. A field whose
utility takes no bare number has no Step form.

**The token chip.** A field bound to a token shows a chip on a tinted background, as Figma UI3's variable pill: the
kind's small preview (swatch, spacing bar, corner, `Ag`, shadow card, curve) and the name without the namespace the
field implies (`lg` in Radius, `primary` in Fill), then what it comes to, faintly. A color token's alpha shows as its
own % field after the chip, as Figma's; an alpha that's an opacity token follows a slash in the chip
(`primary / muted`). Hovering shows the full name, its value in every theme and the class. Clicking the chip opens the
picker on its Tokens tab. Typing over a focused chip replaces the token with what's typed (marked if it's off the
system, as Framework steps in [design-options-tokens.md](design-options-tokens.md) says); Backspace unsets the field.
Where a field can't be unset, as a shadow's color can't, Backspace still takes the chip off and leaves the field empty
to type into; leaving it empty, or Escape, puts the token back. A chip always means a named token, never a step.

**Stored in its simplest form.** What's typed is stored in its simplest form, so it reads back the same way. An
expression that comes to a step or one token is stored as that: `calc(var(--spacing) * 18)` is `{ step: 18 }` (`p-18`),
`var(--radius-lg)` is the token, and `color-mix(in oklab, var(--color-primary) 50%, transparent)` is
`{ token: "primary", alpha: { step: 50 } }`.

Width and height also take a size mode (Size in [design-options-values.md](design-options-values.md)), and a grid track
a share in fr (`{ fr: 1 }`, written `minmax(0,1fr)`, Grid tracks there).

## States

| State                                | Shows as                                                                                                                                                                                                                                                                                      | Where                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Unset                                | What it computes to, as a muted placeholder (inherited `16`, measured `Hug · 248`, From size, initial `0`), never blank. A list shows only its title and +. An inherited value names its parent in the hint, and clicking the label selects the parent                                        | Value; label uncolored, or muted when the value comes from elsewhere (inherited, the component's code or base styles) |
| Mixed                                | "Mixed", typeable after, as today; a swatch split diagonally; toggles press none; "Several fills" for a stack; Mixed in the alpha field for one token with different alphas. Typing replaces every layer's value; maths and arrows work per layer                                             | Value                                                                                                                 |
| Set in a state or mode               | The label's color and the reset arrow                                                                                                                                                                                                                                                         | Label                                                                                                                 |
| Set for a theme                      | The label's color and a mark, with the theme's variant in the hint ([design-options-code.md](design-options-code.md), Themes)                                                                                                                                                                 | Label, status slot                                                                                                    |
| Differs in another viewport or state | A dot after the label; its menu lists each value (Tablet: 24, Hover: primary/90) and goes to it                                                                                                                                                                                               | Label                                                                                                                 |
| Overrides part of a token            | The value in the override color with a reset arrow, and a dot on the token's chip, wherever it sits (Typography preset's row, Stroke's title, a list entry)                                                                                                                                   | Value                                                                                                                 |
| Set by another control               | "set by Fill" after the value, where what it comes to shows (slot 4). Changing it turns the other control to Custom                                                                                                                                                                           | Slot 4                                                                                                                |
| Off the system                       | A hollow mark, whose menu has Nearest token (saying how it differs in other themes), Create token and Allow here                                                                                                                                                                              | Status slot                                                                                                           |
| Refused (Tokens only)                | Typing searches the kind's tokens and Enter takes the highlighted one. A value stays in the error color with "Not a token. Nearest: radius-md (6px)". Escape restores; its menu has Allow here, which keeps it as an exception ([design-options-tokens.md](design-options-tokens.md), Levels) | Value, under the row                                                                                                  |
| Exception (allowed here)             | The mark filled, its reason in the hint                                                                                                                                                                                                                                                       | Status slot                                                                                                           |
| Missing token                        | The chip struck through (or outlined) in the warning color, drawn with its last known value                                                                                                                                                                                                   | Value, status slot                                                                                                    |
| Deprecated                           | The chip with a warning mark, its replacement in the hint                                                                                                                                                                                                                                     | Value, status slot                                                                                                    |
| Invalid as typed                     | The typed text stays, the field outlined in the error color, the reason under it (`unclosedInValue`, `CSS.supports`, "Width takes a length, a token or auto"). Enter keeps it open; Escape or leaving puts the value back and says so. Nothing is stored                                      | Field, status slot, under the row                                                                                     |
| Does nothing                         | The row dimmed, the reason in its hint                                                                                                                                                                                                                                                        | Row                                                                                                                   |
| Not Baseline                         | † after the label for a property; beside the menu option and after the value for a value                                                                                                                                                                                                      | Label, menu, value                                                                                                    |
| Off                                  | The eye or checkbox off, the row dimmed                                                                                                                                                                                                                                                       | Row                                                                                                                   |

Labels use three colors, not one per source. The accent means set on this layer. The state color means set in the state,
mode or theme shown. Muted means it comes from elsewhere: inherited, the component's code or base styles, with the
source named in the hint and reached by clicking. A dot means it differs elsewhere.

The status slot shows one mark, in this order: Invalid, Missing, Off the system or Exception, Set for a theme,
Deprecated. Does nothing dims the row rather than taking the slot. The hint lists every one that applies. Glyphs are
drawn once in Storybook.

## Typing

| Type                     | Accepts                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Length                   | A number in the unit shown; a number with a unit (switches the unit); a token's name, or `spacing-4` for step 4 (a bare `4` is 4 in the unit shown); a keyword; `+ - * /` maths (mixed units become `calc()`); `=` for an expression |
| Four sides, four corners | CSS shorthand of one to four values (`8 16`, `8 8 0 0`)                                                                                                                                                                              |
| Color                    | As Color in [design-options-values.md](design-options-values.md)                                                                                                                                                                     |
| Font                     | A name searches the list; a comma-separated stack (`Inter, system-ui, sans-serif`) is kept as typed, with the first family shown                                                                                                     |
| Angle                    | `45`, `45deg`, `0.25turn`, `1rad`, converted to degrees unless in an expression                                                                                                                                                      |
| Time                     | `200`, `200ms`, `0.2s`, kept and shown in ms                                                                                                                                                                                         |
| Aspect ratio             | `16:9`, `16/9`, `16x9` or `1.78`                                                                                                                                                                                                     |
| Count                    | Whole numbers; Iterations also takes `infinite`, shown as ∞                                                                                                                                                                          |

Only what's typed in the panel is converted. A value read from code keeps the unit it was written in (`0.25turn`,
`0.2s`, written back as `rotate-[0.25turn]` and `duration-[0.2s]`) until it's edited, and is shown converted, so
read-back leaves it unchanged.

## Keys and scrubbing

| Type                | Up and Down                                                                                                | Shift                   | Scrub                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------ |
| Spacing step        | The next whole step (13px → 16px, `p-3.25` → `p-4`; a whole step is 4px at Tailwind's default `--spacing`) | Ten steps               | One whole step per 2 screen px |
| Value in px or rem  | 1px                                                                                                        | 10px                    | 1px per screen px              |
| Token               | The next token of its kind in scale order (`radius-md` to `radius-lg`, `shadow-sm` to `shadow-md`)         | The first or last token | Through the tokens in order    |
| Percentage, opacity | 1%                                                                                                         | 10%                     |                                |
| Angle               | 1°                                                                                                         | 15°                     |                                |
| Time                | 10ms                                                                                                       | 100ms                   |                                |
| Scale               | 1%                                                                                                         | 10%                     |                                |
| Count, Layer order  | 1                                                                                                          | 10                      |                                |
| Color channels      | 1                                                                                                          | 10                      |                                |

Steps of other kinds follow their type's row (Time, Percentage, Angle, Scale, Count). Other values scrub one Up step per
screen px. Alt keeps the meaning Figma gives it in sides and corners: the opposite side too, or one corner. In a field
with no side or corner, Alt steps by the field's smallest step from
[design-options-tokens.md](design-options-tokens.md), Framework steps (1px for spacing and border widths, 0.25% for
opacity and a color's alpha, 1% for scale and filters, 1° for rotation, 1ms for durations), or by a tenth where the
field has no steps (radius, blur, font size, letter spacing).

Stepping keeps the value's form: a token steps to the next token of its kind, a step to the next step, and a value by
its unit (`rounded-[6px]` goes to 7px, not to `rounded-md`). To move between forms, type or pick from the list. A color
token steps through its palette's shades (`blue-500` to `blue-600`); a Semantic color has no scale, so Up and Down open
its list. Enter commits, Escape restores, Tab moves to the next field, and a scrub or a run of steps is one undo step.
Each side, corner, list entry's number and gradient stop's position scrubs and steps the same way.

## Picking a token

The token button opens the field's list, and typing a name in the field completes from the same list. The list has four
groups, in order: Semantic; Scale, the steps drawn as a ruler; Primitive; and Tailwind defaults. Primitive and Tailwind
defaults are hidden when the field's level is Semantic only, and Tailwind defaults show only when the project's theme
still includes them. Each group lists only the tokens whose `previewKind` fits the field
([design-options-tokens.md](design-options-tokens.md)). A field with no kind has no token button, except where a DTCG
type with no kind fits it: a transition entry offers transition tokens, and Stroke's Style menu offers stroke style
tokens ([design-options-tokens.md](design-options-tokens.md), Fields and token kinds).

Each token is drawn with its preview, as the Tokens panel draws it, with a larger one of the highlighted token under the
list (PAR-143). A field that can be unset lists None first, drawn with the same preview at nothing, so the scale starts
from it: no blur shows the shapes sharp, and no radius a square corner. Auto, which is worked out, has no preview.
Moving through the list with the arrow keys or the pointer previews each token on the canvas, as Figma's font list does,
and so does every menu (fonts, weights, blend modes, shadows, cursors). Escape or leaving puts the value back, and
choosing is one undo step. Where a field has an editor of its own (the color square, a shadow's fields, the curve), it's
the picker's Custom tab.

## Lists

Fills, shadows, filters, transforms and transitions are ordered lists. Every entry has the same row, with little in it
so it reads at a glance. First comes a drag handle, always shown, where the entry has another in its group to move past;
a list of one has none. Then the entry: one button with its preview (swatch, gradient strip, shadow card, filter glyph),
what it is (Drop shadow, Linear, Colors) and a faint summary (the token's chip, `0px 4px 12px −2px black 10%`, `180°`,
`200ms, Ease out`), which opens its details in one popover shared by every list, as Figma's effect settings do. Last
come the eye, which turns it off (it stays in the file but isn't drawn or written to code, as Figma's eye), and −. A
solid fill's row is its color field instead, as Figma's is.

The + button adds the list's usual entry at once, on top, as Figma's does (a new drop shadow at the top of the drop
shadows, below any rings, so Tailwind's order holds): a solid fill, a drop shadow, a transition on Colors at Tailwind's
default timing. On a text layer, Fill's + is a menu instead, Text color then Background
([design-options-panel.md](design-options-panel.md), Fill). It's in a form the project's level allows: the kind's most
common token where there is one (`bg-background`, `shadow-sm`, `border-border`), otherwise Figma's defaults. An entry's
details start with its type, which changes it to another: a menu (Inner shadow, Ring), or for a fill its five types by
glyph, as Figma's fill picker starts, a solid's in its color picker. Presets (Layered shadow, Frosted glass) and Ring
are in the type menu and the section's menu, not behind +. A preset (Spring, Layered shadow) keeps its settings in the
file (`{ spring: { duration: 400, bounce: 0.2 } }`), since the `linear()` or shadow list it writes can't be read back
into them. Code still matching the settings reads back as the preset; code that differs, as a Custom curve or plain
entries.

Clicking selects an entry and Shift-click extends; Delete removes the selection; Ctrl+C and Ctrl+V copy entries between
layers, as Figma's rows do. Dragging reorders: shadows within their Inside and Outside groups, where an order other than
Tailwind's writes one arbitrary value (Shadow list in [design-options-values.md](design-options-values.md)), while
filters keep Tailwind's order (Filter list).

An entry is picked up by its handle at once, or by the entry itself once the pointer has moved 4px, so a click still
opens its details. It lifts off the list as a card, raised and a little larger, and follows the pointer up and down.
Each entry it covers half of slides aside to make room, and the layer draws the order it's over, so the result shows
before it's let go; the code doesn't change until then. When it's let go it settles into the gap on a spring and stays a
card there for a moment, which shows where it landed, before it fades into the list. Past either end of its group it
gives a little and stops, and near the edge of a scrolling panel it scrolls. Escape puts it and the layer back. Up and
Down on its handle move it a place, the entries sliding the same way and the entry marked where it lands, and a screen
reader hears where it went. Reduced motion keeps the mark and drops the easing. Every list that's put in order by hand
moves this way (`sortable.ts`).

A token for a whole entry is the entry's chip, with its parts under a disclosure (Composite token, in the same page). A
list set in a state colors its label and marks the entries that differ from the base. A list that differs between the
selected layers shows "Several fills" with + to replace them all, as Figma's does.
