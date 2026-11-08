# Typography

How Parity's interface sets its type: the roles text plays, the classes each role uses, and what keeps new UI on them.
Why each call was made is in the [interface type proposal](proposals/interface-type.md) and
[decisions.md](decisions.md#the-interface-is-set-in-inter-par-709).

Status: this describes the type PAR-709 builds. Until that lands, the app is in Geist on Tailwind's default scale, and
the proposed type shows in Storybook with the toolbar's Type control.

## In one line

Inter at four chrome sizes (11, 12, 13 and 15px) and three weights, code in each system's monospace, every size and
weight from the theme, and a lint rule that fails one-off values.

## The roles

Pick the role, not a size. Each role's classes are all it needs; the theme sets what they come to.

| Role                | Classes                                                            | Comes to                          | For                                                                                    |
| ------------------- | ------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------- |
| Caption             | `text-2xs`                                                         | 11/14, 450, 0.01em                | Units, counts, chips, labels over the canvas, a line under a 12px name                 |
| Label               | `text-xs text-muted-foreground`                                    | 12/16, 450, gray                  | Field labels, secondary text, a line under a 13px name                                 |
| Value               | `text-xs`                                                          | 12/16, 450                        | Values in fields, the status bar                                                       |
| Description         | `type-description text-muted-foreground`                           | 12/18, 450, gray                  | Text that wraps: a section's or a setting's description                                |
| Message             | `type-message`                                                     | 12/18, 450                        | Messages and errors that are read, not glanced at                                      |
| Section title       | `PanelSectionTitle`                                                | 12/16, 650                        | The inspector's sections, the console, the error screen                                |
| Group label         | `GroupLabel`                                                       | 12/16, 550, gray                  | Groups in lists: Layers, Tokens, Processes                                             |
| Group title         | `DialogGroupTitle`                                                 | 12/16, 650, gray                  | Groups in dialogs: Settings, Shortcuts                                                 |
| Row, menu item, tab | `text-sm`                                                          | 13/18, 450; active tab 550        | Layer rows, the kit's menus, tabs, dialogs' selects                                    |
| Control, chip       | the kit's `ToggleGroup`, `Toggle`, `Badge`, `Kbd`                  | 12/16, 450                        | Segmented controls such as Placement, badges                                           |
| Compact row         | `text-xs`, with a Caption under it                                 | 12/16, 450                        | A list whose names are code or status: Tokens, Processes; every other list row is 13px |
| Select in a panel   | `PanelSelectContent` (`fields.tsx`)                                | 12/16, 450                        | A panel's select opens at its field's size                                             |
| Small button        | the kit's `Button size="sm"`                                       | 12/16, 550                        | Buttons in panels                                                                      |
| Empty panel         | `type-empty text-muted-foreground text-center`                     | 13/20, 450, gray, balanced        | What a panel says when there's nothing to show                                         |
| Design name         | `text-base font-semibold`                                          | 15/20, 650                        | The selected design's name, an input, which takes its letters from the input rule      |
| Dialog title        | the kit's `DialogTitle`                                            | 15/20, 650                        | Titles of dialogs                                                                      |
| Dialog description  | the kit's `DialogDescription`                                      | 13/20, 450, gray                  | What a dialog is for, under its title                                                  |
| Heading             | `text-lg`, `text-xl` or `text-2xl`, `font-semibold tracking-tight` | 18/24, 20/28, 24/32; 650, -0.01em | The start page and sign-in                                                             |
| Code                | `font-mono text-xs`                                                | 12/16, 400                        | Classes, token names, code                                                             |
| Code block          | `type-code font-mono`                                              | 12/18, 400                        | Code over many lines: the Code tab, stack traces, console messages                     |
| Secondary code      | `font-mono text-2xs`, `text-2xs/4` where it wraps                  | 11/14 or 11/16, 400, no tracking  | A file name, a token's path, a stack trace                                             |

Weights are `font-normal` (450), `font-medium` (550) and `font-semibold` (650). Code is 400, and never medium: Menlo and
Consolas have only regular and bold, so a medium would draw differently on each system. Emphasis in code is
`font-semibold`, at 600. Names in scripts Inter doesn't draw fall back to the system's static faces, which round 550 and
650 up to their semibold or bold; if that reads heavier than it should, `--font-sans` maps their weights back with
`@font-face` aliases.

The three 12px titles differ only by weight and color, so they're components, not recipes. `PanelSectionTitle`
(`PanelSection.tsx`) takes a `tone`, `lead` or `quiet`, and holds the fold, chevron, count and hover fill for both;
`GroupLabel` is its quiet tone, which Layers, Tokens and Processes share. `DialogGroupTitle` is Settings' and
Shortcuts'. A secondary line sits one step below the name it's under.

## Rules

- **No one-off values.** Sizes, weights, letter spacing, line heights and case come from the roles, never from
  `text-[…px]`, `font-[…]`, `tracking-[…]`, `leading-[…]` or a `/[…]` line height, and never from a named one-off
  either: no `leading-*` but `leading-none` on fixed-size chips and glyphs, no `tracking-*` but `tracking-tight` on a
  heading, no `uppercase`, and no `font-thin`, `font-light`, `font-bold`, `font-extrabold` or `font-black`. A part that
  needs something new gets a role here first.
- **Names keep their letters.** A design, layer, component, state, mode or project name that stands on its own (rows, a
  board's title, the selection's label, tabs) renders through `<Name>`, a span that carries `name-text` (Inter's `ss04`,
  with contextual alternates off) and `truncate`, so a new place that shows a name picks it up. It sets the letters
  only; the role around it sets the size and weight. A field that edits a name (the design's name, renaming, the Layers
  and Tokens searches) is a `NameInput`, which carries the same letters. A name inside a sentence ("Export Pricing")
  takes the sentence's plain letters, as do labels, titles and every other field.
- **Wrapped text is a role, whatever its tag.** Text that can run to more than one line takes `type-description`,
  `type-message`, `type-empty` or, for code, `type-code`, which set its size, its 18px or 20px line and
  `text-wrap: pretty` (`balance` for the centered empty panels), in place of `text-xs` or `text-sm`, never beside them.
  Each sets `--tw-leading` as well as its line height, so its line holds whichever utility Tailwind emits last. A label
  on one line keeps `text-xs` and its 16px line, even in a `<p>`.
- **Numbers that change while you watch take `tabular-nums`:** values in fields, the zoom, a selection's size, counts,
  so they don't shift as they change.
- **People's own text is theirs.** Canvas notes, the editor over a design's text and font token samples keep their own
  size, weight and font features: they're exempt from the rules above.
- **Custom role utilities don't start with `text-`.** tailwind-merge would read `text-caption` as a color and drop a
  size beside it, so a role that needs its own utility is `type-…` or, like `name-text`, says what it is.

## What holds it

- **The theme.** `styles.css` holds the sizes, line heights and weights in a plain `@theme` block, which the kit's
  components read too, so a change to a role is one change there.
- **The kit's overrides.** Where the kit sets a size or weight with its own utility (its small button, input, shortcuts,
  dialog titles, its field, item and empty-state descriptions, and the medium on its tabs, toggles and badges), a rule
  in `styles.css` brings it onto the roles: a weight by repointing `--font-weight-medium` in `@layer base`, which the
  kit's `font-medium` reads, and only the kit's literal sizes, line heights and tracking by an unlayered rule. A
  caller's `type-*` can't beat the kit's own size, so the lint rule fails one on a kit `*Description` or `*Title`. A
  Vitest reads those classes in the kit's `dist` and fails when an upgrade changes them.
- **The theme's line heights are ratios,** as Tailwind's are, so a child sized inline inherits a line in proportion.
- **The lint rule.** A rule in the vite-plus oxlint plugin config fails `className` strings with one-off type values in
  `apps/desktop/src/renderer`, outside explorations and the exempt parts above, and names the role to use. It also fails
  the kit's `SelectContent` in the panels outside `fields.tsx` (use `PanelSelectContent`), `name-text` outside `<Name>`
  and `NameInput`, a `type-*` class beside a `text-{size}` class, `font-mono` with `font-medium`, and `text-xs` with
  `font-medium` or `font-semibold` and `text-muted-foreground` outside the title components.
- **The Scale story.** Parity/Type/Scale draws every role above that isn't a popup (a panel's select is checked by
  opening one in the panel stories) with the classes listed here, measured underneath, so a change to a role shows in
  Storybook, where it's reviewed.

## Changing the type

Change the role here and its value in `styles.css`'s `@theme` together, then check the Scale story and the panels it
touches in Storybook at the app's width (the window is never under 960px, where the kit's inputs change size). A new
role needs a reason the existing ones don't cover, and a row in the table.
