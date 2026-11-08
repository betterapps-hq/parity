# Proposal: easier-to-read interface type

Status: draft, 2026-11-08 (PAR-709). Andrew chose Inter over Geist that day
([decisions.md](../decisions.md#the-interface-is-set-in-inter-par-709)); the rest waits for his approval. The comparison
is in Storybook under Parity/Explorations/ Interface type
([InterfaceType.stories.tsx](../../apps/desktop/src/renderer/explorations/InterfaceType.stories.tsx)), and the toolbar's
Type control turns the proposed type on for every story: Parity/Chrome/App menu's stories, such as Edit and Settings,
show menus with shortcuts and a dialog with descriptions and a select open in either type, and Parity/Left panel/Tokens'
Detail and Save fails show a token's detail, with its 10px modes and values and its messages. What the proposal sets is
one stylesheet, [proposed-type.css](../../apps/desktop/src/renderer/explorations/interface-type/proposed-type.css),
which the build moves into `styles.css`.

## In one line

Inter in place of Geist, four sizes for the chrome where there are nine, nothing under 11px, regular text a step
heavier, section titles in sentence case, and code in a monospace that matches it, all from the theme's variables so the
kit's components follow.

## What the audit found

Measured on the running stories (the whole window, the inspector's Design tab and styles, fields, the start page) and
counted in the renderer's code, leaving out explorations and stories.

- **Nine sizes between 10 and 16px.** The app's own panels are 12px (`text-xs`, 227 uses), with 11px (75), 10px (14),
  10.5px (2), 13px (11) and 15px (2) written as pixel values. The kit's components are 14px (`text-sm`: menus, tabs,
  selects, inputs, buttons) and its small button 12.8px (`text-[0.8rem]`). So a menu opens 2px bigger than the panel it
  came from, and one Design tab mixes 11, 12, 12.8, 14 and 16px.
- **Units and counts at 10px.** The V and H before padding, % and px after values, are 10px in gray, the smallest text
  in the app and the hardest to read. Modes' sizes are 11px on an 11px line.
- **Regular text is thin.** Panel labels are 12px at weight 400 in the muted color. Geist at 400 that small reads thin,
  most of all on the dark theme, which is the default.
- **Section titles look like labels.** The inspector's are 12px semibold capitals in the same gray as the labels under
  them, spaced out (`tracking-wide`), so a title and its first label are hard to tell apart. Layers' group titles are
  sentence case and regular, Settings' are medium: three styles for one job.
- **Code falls back to Consolas on Windows.** `font-mono` starts with `ui-monospace`, which only Safari knows, so
  Chromium takes Consolas, whose lowercase is 8% shorter than Geist's. Code, token names and classes look smaller than
  the text beside them.
- **Shortcuts in menus are spaced out** at the kit's widest tracking, so Ctrl+Alt+Shift+N runs long.
- **No font smoothing is set,** so on macOS text keeps the stem darkening that thickens light text on a dark panel.

The colors weren't changed. The muted gray is 7.7:1 on the dark panel and 5.9:1 on a selected row, and 4.7:1 on white in
the light theme. On the light theme's fills (`--muted` and `--accent`, under mode chips, a selected State and a hovered
or selected row's count) it's 4.4:1, just under AA, as it is today. That's the color's to fix, not the type's: a
separate change takes the light theme's `--muted-foreground` from oklch(0.556) to oklch(0.52), 5.0:1 on those fills.

## The proposed type

| Part                                   | Now                          | Proposed                                 |
| -------------------------------------- | ---------------------------- | ---------------------------------------- |
| Typeface                               | Geist                        | Inter 4.1, self-hosted                   |
| Units, counts, canvas labels           | 10, 10.5 and 11px            | 11/14px, 0.01em tracking                 |
| Labels, values, panel text, status bar | 12/16px                      | 12/16px                                  |
| Kit's small button                     | 12.8px                       | 12/16px                                  |
| Menus, tabs, buttons, layer rows       | 13 and 14px                  | 13/18px, layer rows regular              |
| Names, dialog titles                   | 15 and 16px                  | 15/20px, semibold                        |
| Headings                               | 18/28, 20/28, 24/32px        | 18/24, 20/28, 24/32px                    |
| Section titles                         | 12px semibold capitals, gray | 12px semibold, sentence case, text color |
| Group labels in lists (Layers, Tokens) | regular or medium, gray      | medium, gray                             |
| Group titles in dialogs (Settings)     | medium, gray                 | semibold, gray                           |
| Weights                                | 400, 500, 600                | 450, 550, 650                            |
| Code                                   | Consolas on Windows, 12px    | Cascadia Mono or Menlo, 12px, 400        |

Inter is a variable font, so 450 and 550 cost nothing, and 450 reads evenly on the light theme as well as the dark.
Medium and semibold move up with it, keeping today's 100-unit steps, since on a heavier base a smaller step reads as
less, and gray group labels lean on medium to stand apart. Headings the app tracks tight close up -0.01em rather than
-0.025em, since Inter's optical sizes already tighten them. Layer rows and fields, where names and values are read, use
Inter's `ss04` (I with serifs, l with a tail), so I, l and 1 can't be mistaken, and turn off its contextual alternates
(`"calt" 0`), which draw a typed `->` as an arrow, so a name shows what was typed; labels and titles keep the plain
letters. Every layer row is regular, the top level's too, which Layers sets medium: in white at 13px a long tree read as
a column of bold, and icons, indent and group titles already mark the top level. Wrapped text has more room:
descriptions at 12/18, empty panels at 13/20. A panel's select opens with its items at its field's 12px (set on the
panels' selects in `fields.tsx`, so dialogs' selects keep 13px), while menus from the title bar and canvas stay 13px. A
section title that folds shows hover with a fill, as rows do, since it's already in the text color hover used to turn
it. Font smoothing is grayscale on macOS, which turns off the stem darkening and thins text, as Figma and Linear set it
with weights like these; Windows ignores it. The stories were judged on Windows at 100% scaling, where Inter is unhinted
and stems fall between pixels, which favors heavier weights. Before the build fixes the weights, they're checked on a
Mac and on Windows at 150%: the Design tab, Layers, Tokens, the Code tab and the console, in both themes, with the
fixed-width boxes that hold 10px text today (a token's mode names and values in `TokenDetail.tsx`, the tab order's
numbers, the console's count) checked for clipping at 11px. If 450 reads heavy on the Mac, where grayscale smoothing is
the cause rather than density, the weights come down there only, keyed to a class the preload sets once on `<html>` from
`process.platform` (the renderer can't read it under context isolation), as
`:root.platform-mac { --font-weight-normal: …; --weight-sans-medium: …; --weight-sans-semibold: … }`, with
`--weight-sans-*` in `@theme static` so Tailwind emits them though no utility names them. It's set on `:root`, where
`@theme` resolves `--font-weight-medium` from them, not on `<body>`, which would reach only the rules that restate them.
The same variables can be keyed to the theme, as `:root:not(.dark) { --font-weight-normal: … }`, if the light theme's
screenshots show 450 reading heavy there: dark text on light reads heavier than light on dark, which is why 450 was
chosen on the dark theme. Not a resolution query: a window moved between a 1x and a 2x screen would otherwise change
weight, and Inter's widths with it, so names would re-truncate mid-session.

Notes on the canvas are people's own text and keep their size and spacing, at Inter's own regular weight.

## Monospace

Inter has no monospace of its own, so code is set in each system's: Cascadia Mono, which comes with Windows 11, and
Menlo on macOS. Neither needs a dependency. Their lowercase runs from 5% shorter than Inter's text cut (Cascadia, 0.52
of the size against Inter's 0.546) to 10% shorter (Consolas), so `font-size-adjust` sets every one to Cascadia's height,
which lifts Consolas 6% and draws Menlo a touch smaller. Their letters are wider and darker than Inter's, so code is set
at 400 against Inter's 450, at the size of the values beside it. A token picker with nothing chosen says None in Inter.

## Inter, not Geist

Andrew chose Inter on 2026-11-08, after seeing the proposed type set in both at the same sizes and weights. Inter, which
Figma, Framer and Linear use, was drawn for interfaces at small sizes. Its optical sizes run from 14px, so the chrome's
11 to 13px all use the 14px cut, and only names and headings tighten on their own. At the same size it sets about 5%
narrower than Geist, with a lowercase 3% taller.

It's Inter's own release, 4.1 from github.com/rsms/inter, bundled with the app in
`apps/desktop/src/renderer/fonts/inter` with its licence (SIL OFL 1.1): `InterVariable.woff2`, 352 KB, with the optical
sizes and every alternate. Its italic isn't bundled, since nothing in the interface is set in italic; it's added if that
changes. The npm builds come from Google Fonts, which leave out the alternates that tell I, l and 1 apart. Andrew agreed
to bundle it on 2026-11-08.

## Calls weighed in review

Reviews of the proposal raised these, and they were decided as follows.

- **Code stays 12px, at 400.** At 11px it read smaller than the values beside it, the audit's own complaint about
  Consolas; the lighter weight is what quietens Cascadia's wider letters. Secondary code, such as a file name, a token's
  path or a stack trace, is 11px with the captions, without their letter spacing.
- **A secondary line sits one step below its name.** Under a 13px name it's 12px; under a 12px name, as in Tokens and
  Processes, it stays 11px. Raised to 12px there, a token row would set a 12px gray description over a 12px mono name
  whose lowercase is shorter, and Tokens would have four levels at 12px told apart only by weight and color.
- **Code stays at 400, measured.** Cascadia is hinted where Inter isn't, so at 100% its outlines are crisper and code
  can look the darkest text in a column. By the ink it lays down per pixel of width at 12px it's the lightest: Cascadia
  400 2.31, Inter 450 2.50, Inter 550 2.93. So it doesn't go down to SemiLight (350, 2.07), which would leave code
  fainter than the labels beside it.
- **Code's lowercase is Cascadia's, 5% under Inter's.** Set to Inter's full height, the monospace's wider, even letters
  read bigger than the values beside them; only the shorter fallbacks are lifted to Cascadia's.
- **Layers' group titles stay gray and medium,** unlike the inspector's section titles: a tree's groups recede so its
  rows lead, where an inspector's sections lead their fields.
- **Inter's alternates are on only for names and values,** in layer rows and fields. Turned on everywhere, every l in
  every label would have a tail.
- **Section titles stay 12px.** An inspector's titles lead by weight and color, as Figma's do; at 13px they made a bold
  white bar every section, and the design's name above them barely outranked them. States' and Modes' rows are 13px as
  list rows are.
- **11px keeps its 0.01em.** It's drawn from Inter's 14px cut, the smallest there is, so it gets a little more room than
  that cut was spaced for.
- **Settings' group titles are semibold and gray.** At medium gray they matched the descriptions under them; in the text
  color at 12px they sat level with the 13px white rows they head. Weight parts them from the one and color from the
  other. The inspector's titles can be white because the labels under them are gray.
- **A name inside a sentence takes the sentence's letters.** Given Inter's alternates there, "Only Desktop Light" would
  set a plain l and a tailed l side by side in one button, which reads as a fault. The alternates are for a name that
  stands on its own: rows, fields, a board's title, the selection's label, tabs.
- **Code stays in each system's monospace,** not a bundled one. Every monospace draws a hyphen a full cell wide, so a
  bundled one wouldn't join kebab-case names less, and the system's needs no dependency; `font-size-adjust` gives them
  one lowercase height.
- **The stories are judged at the app's width.** The window is never under 960px, where the kit's inputs switch to their
  `md:` size, so a narrow Storybook column shows inputs as the app never does.

## What the build changes

- **The typeface:** the bundled `InterVariable` moves from the exploration's stylesheet into `styles.css` with its
  `@font-face` rules, `--font-sans` names it, and Geist's package goes. It loads with `font-display: block`: the file is
  local, so it's there within the block period, and the first frame never paints in a fallback that re-lays out names
  and tabs.
- **`styles.css`:** the sizes, line heights (as ratios, `calc(18 / 13)` and so on, as Tailwind's are, so a child sized
  inline inherits a line in proportion), weights and `--font-mono` in a plain `@theme` block of their own, not the
  `@theme inline` that holds `--font-sans`: inline writes the values into the utilities, so `font-medium` would no
  longer read the variable that code sets back to 500. Then body text at the normal weight, and font smoothing, once
  it's been seen on a Mac. The kit's components read these, so menus, tabs, buttons and dialogs follow without changing
  the kit.
- **`styles.css`, the kit's parts,** unlayered, as the tooltip rule is, since the kit sets these with utilities that
  would beat a base rule. The kit's input sets `md:text-sm`, which beats a caller's size in any window wider than 48rem,
  so today the design's name (`DesignPanel.tsx`, `text-base`) draws at 14px and most panel inputs that set `text-xs`
  (`fields.tsx`'s `TextInput`, Components', Assets', Layers', slots' and a token's) at 14px beside 12px values; only
  `fields.tsx`'s number field works around it with `md:text-xs`. One rule fixes them all:
  `@media (width >= 48rem) { :is([data-slot="input"], [data-slot="input-group-control"], [data-slot="textarea"]).text-xs { … the xs size; line-height: var(--tw-leading, the xs line) } …the same for .text-base }`,
  since an input in a group (the console's search) carries the group's slot and the textarea sets `md:text-sm` too; the
  `--tw-leading` fallback lets a caller's `leading-*` still win. These rules lean on the kit's exact classes
  (`text-[0.8rem]` in its button, toggle and calendar, `md:text-sm` in its input and textarea, `tracking-widest` on
  shortcuts), so a small Vitest reads those files in the kit's `dist` and fails when a kit upgrade changes them, rather
  than 12.8px and 14px quietly coming back. Then: `.text-\[0\.8rem\]` at `text-xs` with its line height, which is the
  kit's small button, small toggles and toggle groups, and the calendar, `[data-slot$="-shortcut"]` and the empty
  state's 13px title (`[data-slot="empty-title"]`, tracked tight by the kit) with `letter-spacing: 0`, shortcuts and the
  kit's key chips (`[data-slot="kbd"]`, in tooltips, the toolbar, tabs and the Shortcuts dialog) with
  `font-feature-settings: "case"` so `+` sits at the capitals' middle wherever a shortcut shows (the guard test covers
  the chip's classes too), and `[data-slot="dialog-description"]`, `[data-slot="dialog-title"]` and
  `[data-slot="alert-dialog-title"]` on a 20px line, since the kit sets titles `leading-none` and a title with a long
  name in it (`ConvertToFrameDialog.tsx`) wraps. Dialog titles also take `font-semibold`: 15px is a name or a title, at
  650 either way, so a dialog's title outranks the semibold group titles inside it.
- **`styles.css`, the rest,** in `@layer base`, so a utility on the element still wins:
  `:is(.font-mono, code, pre) { font-weight: 400; letter-spacing: 0; --tw-tracking: 0; font-size-adjust: ex-height 0.52; --font-weight-medium: 500; --font-weight-semibold: 600 }`,
  and `input { font-feature-settings: "ss04", "calt" 0 }`, `textarea { font-feature-settings: "calt" 0 }`, since a
  textarea holds prose (a text layer's copy, a note in the Design tab, Report a problem) that keeps the plain letters
  but should still show a typed `->` as typed, and
  `:is(input, textarea)::placeholder { font-feature-settings: normal }`, since a placeholder is a label. So mono
  headings set `font-medium` keep it, at 500, which Menlo and Consolas draw in their regular where 550 would pick bold
  (Windows gives Cascadia its named weights, and in Chromium 500 draws its SemiBold, measured by the ink it lays down:
  the same as 600's, 14% more than 400's, so clear of code); 11px code gets no caption spacing; and whichever monospace
  renders has Cascadia's lowercase height.
- **The menu bar:** File, Edit and the rest take `font-normal` on their `MenubarTrigger` (`AppMenu.tsx`). The kit sets
  them medium, which at 13px in white made them the heaviest text in the window, as native menu bars aren't.
- **People's own text keeps its own settings.** Notes on the canvas take `font-[400]` (`NoteShapeUtil.tsx`), and their
  textarea `[font-feature-settings:normal]`, so letters don't change shape between editing and showing. The editor over
  a design's text (`TextEditor.tsx`) copies `fontFeatureSettings`, `fontVariantLigatures`, `fontVariationSettings` and
  `fontKerning` from the text's computed style along with its family, weight and size, so the input rule's `ss04` and
  `calt` don't swap the person's glyphs while they type. A font token's sample (`token-previews.tsx`, `TokenDetail.tsx`)
  sets `fontWeight: 400`, since at the chrome's 450 a variable font shows a weight nobody chose and static faces pick
  their 500.
- **Pixel sizes:** `text-[9px]`, `text-[10px]`, `text-[10.5px]` and `text-[11px]` become one 11px size with 0.01em, a
  `text-2xs` in `@theme`, for what's glanced at: units, counts, chips, labels over the canvas. Each 11px use is sorted
  by its job, not carried over by size: a secondary line sits one step below the name it's under, so under a 13px name
  it's a Label at `text-xs` (a component card's note and status in `ComponentCard.tsx`, the console's "Written outside
  any design" in `ConsolePanel.tsx`, the accessibility panel's notes), and under a 12px name it stays a Caption (Tokens'
  descriptions and hue headings in `TokensPanel.tsx`, a process's role and status in `Processes.tsx`); `text-[12px]`
  becomes `text-xs`, `text-[13px]` `text-sm`, `text-[15px]` `text-base`. The Code tab's source (`CodePanel.tsx`, the
  `CodeBlockContent` at `text-[11px]`) is read, not glanced at, so it takes `type-code`, 12px on 18px; its file path
  above stays 11px. Every message or error that's read, rather than glanced at, takes `type-message` (12/18) instead of
  11px: a field's messages, their link and errors (`fields.tsx`, the `text-[11px] leading-snug` ones), Assets' "Can't
  tell" reasons (`AssetsPanel.tsx`), Tokens' "Not written to the stylesheet" (`TokensPanel.tsx`, as in
  `TokenDetail.tsx`) and a token's per-theme problems (`TokenDetail.tsx`).
- **Titles:** `PanelSectionTitle` (`PanelSection.tsx`), the console's (`ConsolePanel.tsx`) and the error screen's
  (`ErrorBoundary.tsx`) drop `uppercase` and `tracking-wide` and take the text color, with their counts in gray. The
  title that folds gets `-ml-1 pl-1` and a `hover:bg-accent/50` fill in place of its color hover. Layers' group titles
  become medium (`LayerTree.tsx`, `GroupHeading`), and Processes' move from 11px to 12px (`Processes.tsx`). Tokens is a
  list, like Layers, so its groups are medium and gray, as Layers' are, where the inspector's lead in the text color.
  Each 12px title comes from one component, so the three styles can't drift apart again: `PanelSectionTitle` takes a
  `tone`, `lead` (the inspector's, semibold in the text color) or `quiet` (lists', medium gray), and keeps the fold,
  chevron, count and hover fill for both, with an `as` for the heading level. `GroupLabel` is the quiet tone, shared by
  Layers (`LayerTree.tsx`, replacing `GroupHeading`), Tokens (`TokensPanel.tsx`, which folds) and Processes
  (`Processes.tsx`, whose rows are 12px like a list's). The console (`ConsolePanel.tsx`) and the error screen
  (`ErrorBoundary.tsx`) render the lead tone as their `h2`. `DialogGroupTitle` is Settings' and Shortcuts'. Settings'
  and Shortcuts' group titles (`SettingsDialog.tsx`, `ShortcutsDialog.tsx`, each an `h3`) become `font-semibold`,
  staying gray.
- **Names:** one utility in `styles.css`, `@utility name-text { font-feature-settings: "ss04", "calt" 0 }`, goes
  wherever a design, layer, component, state or mode name shows, so a name has the same letters everywhere: Layers' rows
  (`LayerTree.tsx`), a board's title and its states' and modes' names on the canvas (`ContainerView.tsx`), the
  selection's label over the canvas (`CanvasOverlay.tsx`), modes in the Design tab (`DesignPanel.tsx`), the Components
  panel's names, layer names in the accessibility panel (`AccessibilityPanel.tsx`), and a project's name on the start
  page (`HomePage.tsx`), in the actions search (`ActionsSearch.tsx`) and on its tab in the title bar. Inputs take it
  from the base rule. Those standalone names render through one small `<Name>` span carrying `name-text` and `truncate`,
  so new places pick it up, and the lint rule fails `name-text` used anywhere else. A name inside a sentence, such as
  "Only {name}" or "Export {name}", takes the label's plain letters.
- **Layers:** rows drop `font-medium` at the top level (`LayerTree.tsx`).
- **Fields:** a token picker sets `font-mono` only on a token's name, so None and Mixed, which are words, show in Inter
  (`fields.tsx`, the value span: `value ? "font-mono" : "text-muted-foreground"`). A panel's select opens with 12px
  items: `fields.tsx` exports one `PanelSelectContent` with `[&_[data-slot=select-item]]:text-xs`, since the kit's items
  set their own size, and every panel's select uses it: `fields.tsx`'s, Export's two (`ExportSection.tsx`), Layers' two
  (`LayerPanel.tsx`, the state picker among them) and Modes' (`ModesPanel.tsx`, whose trigger also takes `text-xs`, to
  match its label). Dialogs' selects keep 13px. The exploration's stylesheet shrinks every select, as it can't tell a
  panel's popup from a dialog's.
- **Wrapped text,** as named roles rather than a tag or one-off values: 12px text that can run to more than one line is
  on an 18px line, 13px on 20px, and 11px on 16px. `styles.css` adds three utilities, `@utility type-description` and
  `@utility type-message` (12px on 18px, `text-wrap: pretty`) and `@utility type-empty` (13px on 20px, `balance`), each
  setting `--tw-leading` too, since Tailwind emits a utility with more properties before `text-xs` and the size utility
  would otherwise win the line height; they replace `text-xs` or `text-sm` on an element, and the lint rule fails one
  beside the other. The lint rule then allows no `/[…]` or `leading-[…]` line heights at all. They go on every wrapped
  description, whatever its tag (a grep for `text-xs` on `<p>`, `<div>` and `<span>` that hold sentences finds them:
  section and setting descriptions, the Code and Components tabs' notes, panel errors, toasts), on every message that's
  read (field messages, TokenDetail's and Tokens' errors, Assets' reasons), and on the empty panels. A one-line `<p>`,
  such as "No stroke.", keeps `text-xs` and its 16px line. 11px code that wraps (`ComponentCard.tsx`'s error, the
  accessibility panel's color rows) takes `text-2xs/4`. "double-click" in the empty Design tab's hint takes a
  non-breaking hyphen (U+2011). The named line heights left in the renderer come onto the roles too: `leading-relaxed`
  (`ProjectStatus.tsx`, `ErrorBoundary.tsx`, `ExportSection.tsx`, `SignInPanels.tsx`, the accessibility panel),
  `leading-normal`, `leading-snug` (`AccessibilityPanel.tsx`, `AssetsPanel.tsx`), `leading-5` (`ConsolePanel.tsx`,
  `slot-props.tsx`, `UpdateToast.tsx`) and `leading-4` (`instance-slots.tsx`, `UpdateToast.tsx`) become the `type-*`
  role their text plays. Code over many lines (the Code tab's `CodeBlockContent`, stack traces' `pre`, the console's
  messages) takes a fourth, `@utility type-code`, 12px on 18px with `--tw-leading`, as editors set code.
- **Sans inside code:** an Inter word inside a monospace line, such as "on" between two colors in the accessibility
  panel, resets what the monospace rule passes down:
  `:is(.font-mono, code, pre) .font-sans { font-size-adjust: none; font-weight: var(--font-weight-normal); --font-weight-medium: var(--weight-sans-medium); --font-weight-semibold: var(--weight-sans-semibold) }`,
  in the base layer. `@theme` holds Inter's medium and semibold as `--weight-sans-medium` (550) and
  `--weight-sans-semibold` (650), which `--font-weight-medium` and `--font-weight-semibold` point at, so the Mac's
  lighter weights, if the check calls for them, change in one place and reach Inter inside code too.
- **Headings:** `tracking-tight` on the start page's and sign-in's headings becomes -0.01em (`HomePage.tsx`,
  `SignInPanels.tsx`).
- **Storybook:** the Type control and the exploration's stylesheet go, since the app is the proposed type then. The
  Scale story stays, as Parity/Type/Scale: one column, every role in [typography.md](../typography.md) drawn with its
  classes and measured, so a change to a role is reviewed where it shows.
- **Holding to it:** [typography.md](../typography.md) describes the roles and their classes. A rule in the vite-plus
  oxlint plugin config fails one-off type values (`text-[…px]`, `font-[…]`, `tracking-[…]`, `leading-[…]`, `/[…]`) and
  the named one-offs the audit found (any `leading-*` but `leading-none` on fixed-size chips and glyphs, any
  `tracking-*` but `tracking-tight` on a heading, `uppercase`, and `font-thin`, `light`, `bold`, `extrabold`, `black`)
  in the renderer's `className` strings, outside explorations, notes, the text editor and font samples, and names the
  role to use, with no exceptions now that wrapped text has its own utilities. It also fails the kit's `SelectContent`
  in the panels outside `fields.tsx` (use `PanelSelectContent`) and `name-text` outside `<Name>`. With the kit guard
  test above, drifting fails the build rather than a review.

Windows 10 has no Cascadia Mono, so code there falls back to Consolas, as it does on every Windows today. Its lowercase
is 10% shorter than Inter's and 6% shorter than Cascadia's, which `font-size-adjust` makes up, so code is the same size
on both.
