# Typography

How Parity's interface sets its type: the roles text plays, the classes each role uses, and what keeps new UI on them.
Why each call was made is in the [interface type proposal](proposals/interface-type.md) and
[decisions.md](decisions.md#the-interface-is-set-in-inter-par-709).

Status: this describes the type PAR-709 builds. Until that lands, the app is in Geist on Tailwind's default scale, and
the proposed type shows in Storybook with the toolbar's Type control.

## In one line

Inter at four chrome sizes (11, 12, 13 and 15px) and three weights, code in each system's monospace, every size and
weight from the theme, and a lint rule that fails one-off values.

## The styles

The roles below come to a dozen styles. Several roles share one on purpose: they're named by what the text does, so a
change to one job doesn't move the others.

| Style       | Size and line         | Weight | Tracking | Roles                                                                       |
| ----------- | --------------------- | ------ | -------- | --------------------------------------------------------------------------- |
| 11 regular  | 11/14                 | 450    | 0.01em   | Caption                                                                     |
| 11 medium   | 11/14                 | 550    | 0.01em   | Canvas chip                                                                 |
| 12 regular  | 12/16                 | 450    | 0        | Label, Value, Field label in a panel, Control and chip, Compact row, Select |
| 12 medium   | 12/16                 | 550    | 0        | Strong value, Group label, Small button                                     |
| 12 semibold | 12/16                 | 650    | 0        | Section title, Group title                                                  |
| 12 wrapped  | 12/18                 | 450    | 0        | Description, Message, Empty panel hint                                      |
| 13 regular  | 13/18                 | 450    | 0        | Row, menu item, tab; Field label in a dialog                                |
| 13 medium   | 13/18                 | 550    | 0        | Item title, Button                                                          |
| 13 wrapped  | 13/20                 | 450    | 0        | Body, Empty panel, Dialog description                                       |
| 15 semibold | 15/20                 | 650    | 0        | Selection title, Dialog title                                               |
| Heading     | 18/24 or 24/32        | 650    | -0.01em  | Heading, Page title                                                         |
| Code        | 12/16, 12/18 or 11/14 | 400    | 0        | Code, Code block, Secondary code (emphasis at 600)                          |

## The roles

Pick the role, not a size. Each role's classes are all it needs; the theme sets what they come to.

| Role                | Classes                                                                               | Comes to                         | For                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Caption             | `text-2xs`                                                                            | 11/14, 450, 0.01em               | Units, counts, tags on a row (a mode's chips, the console's count, Primary), a line under a 12px name                             |
| Canvas chip         | `text-2xs font-medium tabular-nums` on a chip fill of at least 4.5:1                  | 11/14, 550, 0.01em               | Any text on a fill over the canvas: labels, W×H, spacing values, the inspect label, an agent's, tab order; never dimmed           |
| Label               | `text-xs text-muted-foreground`                                                       | 12/16, 450, gray                 | Field labels, secondary text, a line under a 13px name                                                                            |
| Value               | `text-xs`                                                                             | 12/16, 450                       | Values in fields, the status bar                                                                                                  |
| Description         | `type-description text-muted-foreground`                                              | 12/18, 450, gray                 | Text that wraps: a section's or a setting's description                                                                           |
| Body                | `type-body`                                                                           | 13/20, 450                       | A paragraph on a page: the start page's intros                                                                                    |
| Message             | `type-message`                                                                        | 12/18, 450                       | Messages and errors that are read, not glanced at                                                                                 |
| Section title       | `PanelSectionTitle`                                                                   | 12/16, 650                       | The inspector's sections, the accessibility panel's groups, the console, the error screen, the start page's sections              |
| Group label         | `GroupLabel`                                                                          | 12/16, 550, gray                 | Groups in lists: Layers, Tokens, Processes; the kit's menu labels and command groups draw it already                              |
| Group title         | `DialogGroupTitle`                                                                    | 12/16, 650, gray                 | Groups in dialogs: Settings, Shortcuts                                                                                            |
| Strong value        | `font-medium text-foreground` inside a Label                                          | 12/16, 550                       | The part of a line of labels that's read: the status bar's and Performance's figures                                              |
| Row, menu item, tab | `text-sm`                                                                             | 13/18, 450                       | Layer rows, the kit's menus, tabs (the active one too), dialogs' selects                                                          |
| Item title          | `text-sm font-medium`                                                                 | 13/18, 550                       | A name or title heading a card, popover or panel: a component card, Processes, Performance, a panel's error                       |
| Control, chip       | the kit's `ToggleGroup` and `Toggle` at `size="sm"`, `Kbd`, a `Badge` holding a value | 12/16, 450                       | Segmented controls in panels such as Placement, key chips, the design's path; at the default size a toggle is 13px, for dialogs   |
| Field label         | the kit's `Label` with `text-xs` in a panel; its `FieldLabel` in a dialog             | 12/16 or 13/18, 450              | A label tied to its control, such as a switch's, a checkbox's or a dialog's field; the kit's own are regular                      |
| Compact row         | `text-xs`, with a Caption under it                                                    | 12/16, 450                       | A list whose names are code or status: Tokens, Processes (names regular); every other list row is 13px                            |
| Select in a panel   | `PanelSelectContent` (`fields.tsx`)                                                   | 12/16, 450                       | A panel's select opens at its field's size                                                                                        |
| Small button        | the kit's `Button size="sm"`                                                          | 12/16, 550                       | Buttons in panels                                                                                                                 |
| Button              | the kit's `Button`                                                                    | 13/18, 550                       | Dialogs' actions, such as Cancel and Save                                                                                         |
| Empty panel         | `type-empty text-muted-foreground text-center`                                        | 13/20, 450, gray, balanced       | What a panel says when there's nothing to show; a title in it is `font-medium text-foreground`, 550                               |
| Empty panel hint    | `text-xs` inside `type-empty`                                                         | 12/18, 450, gray, balanced       | The line under it, such as how to select a layer                                                                                  |
| Selection title     | `text-base font-semibold`; `md:text-base` on a field                                  | 15/20, 650                       | The inspector's title for what's selected, on every tab: a design's or layer's name (a `NameInput`), several layers, a slot (600) |
| Dialog title        | the kit's `DialogTitle`                                                               | 15/20, 650                       | Titles of dialogs                                                                                                                 |
| Dialog description  | the kit's `DialogDescription`                                                         | 13/20, 450, gray                 | What a dialog is for, under its title                                                                                             |
| Page title          | `text-2xl font-semibold tracking-tight`                                               | 24/32, 650, -0.01em              | The heading of a screen that fills the window: sign-in at every step, the app's crash screen                                      |
| Heading             | `text-lg font-semibold tracking-tight`                                                | 18/24, 650, -0.01em              | A heading within a page: the start page, Couldn't open, a part's error; `text-xl` isn't used                                      |
| Code                | `font-mono text-xs`                                                                   | 12/16, 400                       | Classes, token names, code                                                                                                        |
| Code block          | `type-code font-mono`                                                                 | 12/18, 400                       | Code over many lines: the Code tab, stack traces, console messages                                                                |
| Secondary code      | `font-mono text-2xs`, `text-2xs/4` where it wraps                                     | 11/14 or 11/16, 400, no tracking | A file name, a token's path, a stack trace                                                                                        |

Weights are `font-normal` (450), `font-medium` (550) and `font-semibold` (650). Code is 400, and never medium: Menlo and
Consolas have only regular and bold, so a medium would draw bold on one system and SemiBold on another. Code repoints
`--font-weight-medium` to 400, so a kit part's own `font-medium` set in code stays regular. Emphasis in code is
`font-semibold`, at 600. Names in scripts Inter doesn't draw fall back to the system's static faces, which round 550 and
650 up to their semibold or bold; if that reads heavier than it should, `--font-sans` maps their weights back with
`@font-face` aliases.

The three 12px titles differ only by weight and color, so they're components, not recipes. `PanelSectionTitle`
(`PanelSection.tsx`) takes a `tone`, `lead` or `quiet`, and holds the fold, chevron, count and hover fill for both;
`GroupLabel` is its quiet tone, which Layers, Tokens, Processes, Assets, the actions search and a state's changes share.
`DialogGroupTitle` is Settings' and Shortcuts'. A secondary line sits one step below the name it's under.

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
  `type-message`, `type-body`, `type-empty` or, for code, `type-code`, which set its size, its 18px or 20px line and
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
  kit's `font-medium` reads, and only the kit's literal sizes, line heights and tracking by an unlayered rule. On those
  parts (tabs, toggles, badges, key chips, the kit's `Label`) `font-semibold` and `font-normal` still win, but
  `font-medium` reads the repointed variable and does nothing, so the lint rule fails it there; their children get the
  medium back. Each unlayered rule is keyed on the kit class it replaces, so a caller's own size or line, which makes
  `cn` drop the kit's, also turns the rule off. The `type-*` roles are registered with the class merger (`createCn`,
  installed with the kit runtime's `setCn`), so a caller's role replaces the kit's size as `text-xs` would. A Vitest
  scans the kit's `dist` for its own sizes, lines, tracking and medium, and fails on any it doesn't list.
- **The theme's line heights are ratios,** as Tailwind's are, so a child sized inline inherits a line in proportion.
- **The lint rule.** A rule in the vite-plus oxlint plugin config fails `className` strings with one-off type values in
  `apps/desktop/src/renderer`, outside explorations and the exempt parts above, gathering every static class string in
  an expression (both branches of a ternary, `cn` and `clsx` arguments, same-file constants) before it checks a
  combination, and names the role to use. It also fails the kit's `SelectContent` in the panels outside `fields.tsx`
  (use `PanelSelectContent`), `name-text` outside `<Name>` and `NameInput`, a `type-*` class beside a `text-{size}`
  class, `font-mono` with `font-medium`, `font-medium` on the kit's `TabsTrigger`, `Toggle`, `ToggleGroupItem`, `Badge`,
  `Kbd`, `Label` and `FieldLabel`, `text-xl`, and `text-xs` with `font-medium` or `font-semibold` and
  `text-muted-foreground` outside the title components.
- **The Scale story.** Parity/Type/Scale draws every role above that isn't a popup (a panel's select is checked by
  opening one in the panel stories) with the classes listed here, measured underneath, so a change to a role shows in
  Storybook, where it's reviewed.

## Changing the type

Change the role here and its value in `styles.css`'s `@theme` together, then check the Scale story and the panels it
touches in Storybook at the app's width (the window is never under 960px, where the kit's inputs change size). A new
role needs a reason the existing ones don't cover, and a row in the table.
