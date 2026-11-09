# Proposal: easier-to-read interface type

Status: built, 2026-11-08 (PAR-710). Andrew chose Inter over Geist and approved the rest on 2026-11-08
([decisions.md](../decisions.md#the-interface-is-set-in-inter-par-709)), but for the weights, which wait for the check
in [Open: the weights](#open-the-weights); font smoothing waits with them. What was built, and the calls made building
it, are in [decisions.md](../decisions.md#the-interface-type-is-built-into-the-app-par-710); the roles are described in
[typography.md](../typography.md), which is the reference from here on. The lint rule under "Holding to it" is PAR-729.
The comparison stories and their stylesheet were removed with the build; Parity/Type/Scale draws every role.

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
| Headings                               | 18/28, 20/28, 24/32px        | 18/24 within a page, 24/32 for a screen  |
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
with weights like these; Windows ignores it. The weights are open until they're checked on a Mac and on Windows at 150%:
see [Open: the weights](#open-the-weights).

Notes on the canvas are people's own text and keep their size and spacing, at Inter's own regular weight.

## Open: the weights

The stories were judged on Windows at 100% scaling, where Inter is unhinted and stems fall between pixels, which favors
heavier weights. Windows at 100% is a floor, not the reference: text mustn't read thin there, but most Windows laptops
run at 125–150% and Macs at 2x, so those are what the weights are tuned on. Every screenshot reviewed so far is at the
floor, so approving this proposal approves its sizes, roles, case and code; its weights are approved by this check,
whose results fill the table below before the build sets them.

On each setup, the Design tab, Layers, Tokens, the Code tab and the console are screenshotted in both themes beside
Figma's desktop inspector, also Inter at similar weights, at the same scaling, with the base tried at 425, 450 and 475
and semibold at 600 and 650 on its own, not only as the base plus 200, since the inspector's titles lead their 13px rows
by weight alone. The side-by-side decides. Ink per pixel of width (an 11px Caption gray on the dark panel and on the
light theme's `--muted` fill, an 11px Canvas chip on its fill, a 12px label, a 13px row, a 12px section title, the 15px
selection title) is recorded beside it as a diagnostic, not a gate, since it grows with size and shrinks with a wide
face's sidebearings. The fixed-width boxes that hold 10px text today (a token's mode names and values in
`TokenDetail.tsx`, the tab order's numbers, the console's count) are checked for clipping at 11px, and the Caption is
judged on its own: if 450 reads thin there at the floor, the Caption takes its own weight rather than the whole base
moving.

| Setup            | Theme       | Screens                                   | Screenshot | Base | Semibold | Verdict |
| ---------------- | ----------- | ----------------------------------------- | ---------- | ---- | -------- | ------- |
| Windows 11, 100% | dark, light | Design, Layers, Tokens, Code tab, console | to do      |      |          |         |
| Windows 11, 150% | dark, light | Design, Layers, Tokens, Code tab, console | to do      |      |          |         |
| Windows 10, 150% | dark, light | Design, Layers, Tokens, Code tab, console | to do      |      |          |         |
| macOS, 2x        | dark, light | Design, Layers, Tokens, Code tab, console | to do      |      |          |         |

Windows gets one set at every scale, since a class can't tell 100% from 150%: if 450 reads heavy at 150%, Windows moves
to 425/525/625 everywhere, as long as 100% still reads evenly. If 450 reads heavy on the Mac, where grayscale smoothing
is the cause rather than density, the weights come down there only, keyed to a class on `<html>`: the preload exposes
`process.platform` on the context bridge (the renderer can't read it under context isolation, and `<html>` doesn't exist
yet while the preload runs), and the renderer's entry adds `platform-mac` before React mounts, beside where `theme.ts`
sets `dark`, as `:root.platform-mac { --font-weight-normal: …; --weight-sans-medium: …; --weight-sans-semibold: … }`,
with `--weight-sans-*` in `@theme static` so Tailwind emits them though no utility names them. It's set on `:root`,
where `@theme` resolves `--font-weight-medium` from them, not on `<body>`, which would reach only the rules that restate
them. The weights aren't keyed to the theme: with the System theme a Mac switches appearance on its own, which would
change Inter's widths and re-truncate names mid-session, and light and dark would stop comparing like for like. If 450
reads heavy on the light theme, that's fixed with its colors, as its `--muted-foreground` change is, or with one value
for both themes. Not a resolution query either, for the same reason: a window moved between a 1x and a 2x screen would
change weight, and Inter's widths with it.

The check also covers names in scripts Inter doesn't draw (Japanese, Chinese, Arabic, Hebrew, Thai, Devanagari), which
fall back to static system faces: CSS rounds 500 down to their regular but 550 and 650 up to their semibold or bold, so
a non-Latin design name or "Only {name}" would turn heavier than it is today. If it reads wrong, `--font-sans` lists
`@font-face` aliases after InterVariable, such as `local("Yu Gothic UI")` declared at `font-weight: 100 599` and its
Semibold from 600, so 550 maps to regular as 500 did.

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
- **Inter's alternates are on only for names,** where one stands on its own and in the fields that edit one. Turned on
  for every field, a text prop's copy would change letters with the field that edits it; turned on everywhere, every l
  in every label would have a tail.
- **Code is never medium.** A medium in code draws regular on a Mac and SemiBold on Windows 11, so it would mean
  different things on each; code is 400, or semibold where it must stand out.
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
- **Every tab is regular, the active one too.** The kit's fill marks the active tab; at 550 its label widened the tab,
  shifting the list, and the kit's `transition-all` animated the weight.
- **The selection's title is one role.** A design's name, a layer's, several layers' and a slot's sit in the same slot
  at the top of the inspector, so they're all 15px semibold; at 13px for a layer, selecting into a board shrank it.
- **An empty panel's hint is one step below its message,** 12px under 13px, as a secondary line is under its name; set
  at the message's size, the hint read as more of the message.
- **A filled tag on a row is a Caption,** whatever name it sits under; a `Badge` holding a value is a control.
- **The kit's overrides stay in the app.** Buildkit's kits keep shadcn's classes for every app built on them, so the
  roles this app chose (12px small buttons, regular tabs, 18px description lines) are set here, held by the override
  table and the guard test, not changed in the kit. Moving a value into the kit as a theme variable is Buildkit's own
  decision, made there for every app.
- **Roles are named by job, not by style.** Label, Value, Field label and Compact row all come to 12/16 at 450, and
  that's intended: a change to one job (labels grayer, values tabular) shouldn't move the others, and typography.md says
  which to pick by what the text does.
- **One set of weights for both themes.** Keyed to the theme, they'd change Inter's widths when a Mac's appearance
  switches under the System theme, re-truncating names mid-session; the light theme's balance is fixed with color.

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
- **`styles.css`, the kit's parts:** one rule per row below. A rule that beats one of the kit's own sizes, lines or
  tracking is unlayered, as the tooltip rule is, since the kit's utilities would beat a base rule, and it's keyed on the
  kit class it replaces (`[data-slot$="dialog-title"].leading-none`, not the slot alone), so it applies only while the
  kit's class is there: a caller's own size or line makes `cn` drop the kit's, and the rule with it. Sign-in's headings,
  which are the kit's `DialogTitle` in a dialog at `text-2xl` and `text-xl` (`SignInPanels.tsx`), keep their own lines
  that way rather than a dialog title's 20px. Line heights in these rules are ratios (`calc(20 / 15)`), as the theme's
  are. The `type-*` roles are registered with the class merger as size and line-height utilities, through `createCn`
  from `cn/config` installed with the kit runtime's `setCn` in the renderer's entry, so a caller's `type-description` on
  a kit `*Description` drops the kit's `text-sm` as `text-xs` would, and `EmptyDescription className="text-xs"`
  (`CodePanel.tsx`, `ConsolePanel.tsx`), ignored today, takes effect. A weight goes in `@layer base` and repoints
  `--font-weight-medium`, which the kit's `font-medium` reads, rather than the property, so a caller's `font-semibold`
  or `font-normal` still wins; a caller's `font-medium` reads the same variable and does nothing there, so the lint rule
  fails it on those parts, and their children that aren't kit parts themselves (`> :not([data-slot])`) get the sans
  medium back, since the variable inherits, while a badge or key chip nested in a tab keeps its own rule. A small Vitest
  scans every component in the kit's `dist` for `font-medium`, `text-[…]`, `md:text-*`, `leading-*` and `tracking-*`,
  with each slot's name, and compares the hits with a checked-in list where each is either a row below or marked unused
  by the app, so a kit upgrade that adds, changes or renames one fails, rather than 12.8px, 14px or a medium tab quietly
  coming back. Later, since Buildkit is ours, those literal values can move into the kit as theme variables, which would
  retire most of these rules.

  | Kit part                                                                                                                  | Rule                                                                                                        | Layer     | Guard test                         | Why                                                                                                                                                                                                                                                                                                                                                                                                        |
  | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `:is([data-slot="input"], [data-slot="input-group-control"], [data-slot="textarea"]).text-xs`                             | at `width >= 48rem`, the xs size and `line-height: var(--tw-leading, …)`                                    | unlayered | `md:text-sm`                       | The kit's `md:text-sm` beats a caller's size in the app's window, so 12px fields drew at 13–14px. Not for `.text-base`, which the kit's inputs carry themselves; the selection's title takes `md:text-base`                                                                                                                                                                                                |
  | `.text-\[0\.8rem\]`: the small button, small toggles and toggle groups, the calendar                                      | the xs size and line                                                                                        | unlayered | `text-[0.8rem]`                    | 12.8px is off the scale                                                                                                                                                                                                                                                                                                                                                                                    |
  | `[data-slot$="-shortcut"]`                                                                                                | `letter-spacing: 0`, `font-feature-settings: "case"`                                                        | unlayered | `tracking-widest`                  | Shortcuts ran long; `case` sets `+` at the capitals' middle                                                                                                                                                                                                                                                                                                                                                |
  | `[data-slot="kbd"]`: tooltips, the toolbar, tabs, the Shortcuts dialog                                                    | `font-feature-settings: "case"`                                                                             | base      | its classes                        | As shortcuts                                                                                                                                                                                                                                                                                                                                                                                               |
  | `[data-slot="empty-title"]`                                                                                               | `letter-spacing: 0`                                                                                         | unlayered | `tracking-tight`                   | 13px isn't tracked                                                                                                                                                                                                                                                                                                                                                                                         |
  | `tabs-trigger` (the active one too), `toggle`, `toggle-group-item`, `badge`, `kbd`                                        | `--font-weight-medium: var(--font-weight-normal)`, and `var(--weight-sans-medium)` on `> :not([data-slot])` | base      | `font-medium`                      | At 550 controls and chips sat one step under the section titles; a heavier active tab widened and, through `transition-all`, animated. Buttons, which act, stay medium                                                                                                                                                                                                                                     |
  | `label`, `field-label`                                                                                                    | `--font-weight-medium: var(--font-weight-normal)`                                                           | base      | `text-sm leading-none font-medium` | The kit's `Label` is 13px at 550 on a 1.0 line, no role; every panel use sets `text-xs font-normal` (`DesignPanel.tsx`, `StatesSection.tsx`, `AccessibilityPanel.tsx`), and a bare one now lands regular. `FieldLabel` renders its `Label` under its own slot, `field-label`, so it's named too: a dialog's field labels (`ReportProblemDialog.tsx`) are 13/18 regular. In a panel a label takes `text-xs` |
  | `field-description`, `item-description:not(.font-mono)`, `alert-description` (`ReportProblemDialog.tsx`), each `.text-sm` | the description role, 12/18, `pretty`                                                                       | unlayered | their size and line                | The kit's own size and line, which a caller's role can't beat. Not an item description in code: the Code tab's file path (`CodePanel.tsx`) is Secondary code, 11px, under its 12px name                                                                                                                                                                                                                    |
  | `code-block-content.leading-relaxed`                                                                                      | 12px on an 18px line, setting `--tw-leading` too                                                            | unlayered | `leading-relaxed`                  | The Code tab's source (`CodePanel.tsx`, `text-[11px]` today) is read, so it's a Code block; the kit's `leading-relaxed` beat a caller's `type-code` until the roles are registered with the merger                                                                                                                                                                                                         |
  | `item-title.font-mono.leading-snug`                                                                                       | the xs line                                                                                                 | unlayered | `leading-snug`                     | The Code tab's names (`CodePanel.tsx`, `ItemTitle` in code at `text-xs`) sit on code's line, not the kit's                                                                                                                                                                                                                                                                                                 |
  | `empty-description`, keyed on its `text-sm/relaxed`                                                                       | the empty-panel role, 13/20, `balance`                                                                      | unlayered | its size and line                  | As above                                                                                                                                                                                                                                                                                                                                                                                                   |
  | `dialog-description.text-sm`, `dialog-title.leading-none`, `alert-dialog-title.leading-none`                              | a 20px line, `calc(20 / 15)` on a title                                                                     | unlayered | `leading-none`                     | A title with a long name in it (`ConvertToFrameDialog.tsx`) wraps                                                                                                                                                                                                                                                                                                                                          |
  | `dialog-title`, `alert-dialog-title`                                                                                      | `--font-weight-medium: var(--font-weight-semibold)`                                                         | base      | `font-medium`                      | 15px is a name or a title, at 650 either way, so a dialog's title outranks the semibold group titles in it                                                                                                                                                                                                                                                                                                 |

- **`styles.css`, the rest,** in `@layer base`, so a utility on the element still wins:
  `:is(.font-mono, code, pre) { font-weight: 400; letter-spacing: 0; --tw-tracking: 0; font-size-adjust: ex-height 0.52; --font-weight-medium: 400; --font-weight-semibold: 600 }`,
  and `:is(input, textarea) { font-feature-settings: "calt" 0 }`, since a field shows a typed `->` as typed but keeps
  the plain letters unless it edits a name, and `:is(input, textarea)::placeholder { font-feature-settings: normal }`,
  since a placeholder is a label. Code is never medium: Menlo and Consolas have only regular and bold, and Windows gives
  Cascadia its named weights, so a medium at 550 comes out bold on a Mac and Windows 10 (font matching takes a weight
  over 500 heavier first) and SemiBold on Windows 11 (measured in Chromium: 500 already lays down the same ink as 600).
  So `font-medium` comes off code (a token's heading in `TokenDetail.tsx`, its current mode, slot names in
  `instance-slots.tsx`), which size and color already set apart, and emphasis in code, where it's needed, is
  `font-semibold` at 600, bold or SemiBold everywhere; the lint rule fails `font-mono` with `font-medium`. A medium the
  lint rule can't see, from inside the kit (its `ItemTitle` and `CodeBlockTitle` carry `font-medium`, and the Code tab
  sets them in code, `CodePanel.tsx`), reads `--font-weight-medium`, which the rule above repoints to 400; Inter inside
  code takes 550 back through the `.font-sans` reset. 11px code gets no caption spacing; and whichever monospace renders
  has Cascadia's lowercase height.
- **The menu bar:** File, Edit and the rest take `font-normal` on their `MenubarTrigger` (`AppMenu.tsx`). The kit sets
  them medium, which at 13px in white made them the heaviest text in the window, as native menu bars aren't. The kit's
  `MenubarLabel` is `text-sm font-medium` in the text color, so "Nothing opened yet" outweighed every item under it;
  both of `AppMenu.tsx`'s take `font-normal text-muted-foreground`, a message at the menu's own size. The kit's other
  menu labels (`DropdownMenuLabel`, `ContextMenuLabel`, a `CommandGroup`'s heading) are already 12px medium gray, a
  Group label.
- **People's own text keeps its own settings.** Notes on the canvas take `font-[400]` (`NoteUtil.tsx`), and their
  textarea `[font-feature-settings:normal]`, so letters don't change shape between editing and showing. The editor over
  a design's text (`TextEditor.tsx`) copies `fontFeatureSettings`, `fontVariantLigatures`, `fontVariationSettings` and
  `fontKerning` from the text's computed style along with its family, weight and size, so the input rule's `ss04` and
  `calt` don't swap the person's glyphs while they type. A font token's sample (`token-previews.tsx`, `TokenDetail.tsx`)
  sets `fontWeight: 400`, since at the chrome's 450 a variable font shows a weight nobody chose and static faces pick
  their 500.
- **Pixel sizes:** `text-[9px]`, `text-[10px]`, `text-[10.5px]` and `text-[11px]` become one 11px size with 0.01em, a
  `text-2xs` in `@theme`, for what's glanced at: units, counts, tags on a row, labels over the canvas. A filled tag on a
  row is a Caption whatever name it sits under: a mode's chips (`DesignPanel.tsx`, `OptionChip`), the console's count
  (`ConsolePanel.tsx`) and a mode's Primary badge (`ModesPanel.tsx`, which takes `text-2xs` on its `Badge`); a `Badge`
  that holds a value, such as the design's path in `DesignPanel.tsx`, stays at the control size. Each 11px use is sorted
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
  (`Processes.tsx`, a compact list). The console (`ConsolePanel.tsx`) and the error screen (`ErrorBoundary.tsx`) render
  the lead tone as their `h2`. `DialogGroupTitle` is Settings' and Shortcuts'. Settings' and Shortcuts' group titles
  (`SettingsDialog.tsx`, `ShortcutsDialog.tsx`, each an `h3`) become `font-semibold`, staying gray. The other 12px gray
  medium titles are groups in lists, so they take `GroupLabel`: the actions search's group headers (`QuickInsert.tsx`),
  Assets' "Not listed" and its folding groups (`AssetsPanel.tsx`), and "Changes in {state}" (`StatesSection.tsx`). The
  accessibility panel's group titles, 13px medium with `leading-snug` (`AccessibilityPanel.tsx`), are the panel's
  sections, so they take `PanelSectionTitle` in the lead tone.
- **The selection's title:** the inspector's first line is one role whatever's selected, `text-base font-semibold`
  (15/20, 650), so clicking from a board to one of its layers doesn't drop its title from 15px semibold to 13px medium:
  a design's name (`DesignPanel.tsx`), a layer's (`LayerPanel.tsx`, its field and the span it shows when it can't be
  renamed), several layers or designs (`MultiPanel.tsx`, from 13px), a slot's name (`instance-slots.tsx`, in code, so at
  code's semibold, 600), and the same selection's name heading the Code and Accessibility tabs (`CodePanel.tsx`,
  `AccessibilityPanel.tsx`, through `<Name>`), so switching tabs doesn't resize it either. The fields take
  `md:text-base` beside `text-base`, which `cn` lets replace the kit's `md:text-sm`, as `fields.tsx`'s number field does
  with `md:text-xs`.
- **Processes** is a compact list, like Tokens: a process's name (`Processes.tsx`, `text-[13px] font-medium`) becomes
  `text-xs` at the regular weight, over its 11px role and status, under the popover's 13px medium title.
- **Canvas chips:** white text on a selection or spacing color is one role whatever it says,
  `text-2xs font-medium tabular-nums`, since 11px white there is about 3.3:1 and needs the weight: the selection's and a
  board's label and the W×H chips under a selection, a frame and a frame being drawn (`CanvasOverlay.tsx`), the spacing
  value (`SpacingHandles.tsx`), the inspect label (`InspectOverlay.tsx`) and an agent's (`AgentPresence.tsx`). Their
  dimmed parts (`text-white/75` on the spacing chip's scale name, `opacity-80` on the inspect label's location) go to
  plain white. Code in a chip stays at code's 400. Weight doesn't make 11px legible on a weak fill, so the role carries
  a fill requirement, met by the color change, which merges before the build or lands in the same PR, so a chip never
  ships at 11px on a fill it can't read on: a chip's text is at least 4.5:1 on its fill. The Scale story draws the
  proposed chip on that fill. The screen, layer and component chips (oklch L 0.64, about 3.3:1 for white) take a darker
  step of their color, around L 0.55, while the selection's strokes keep 0.64; the light hues, mode green (2.5:1) and
  agent amber (2.2:1), take near-black text. The role covers any text on a fill drawn over the canvas or a swatch, so
  three more join it: tab order's numbers (`TabOrderOverlay.tsx`, `text-[10px] font-semibold` on a trail color) become
  `text-2xs font-medium tabular-nums`, with the same fill rule; the slot chip (`CanvasOverlay.tsx`, 10px code in the
  component color on a 16% tint of it) becomes Secondary code, at code's 400, with its kind color held to 4.5:1 on its
  own tint in both themes by the color change; and a token swatch's theme label (`TokenDetail.tsx`, white on a 55% black
  scrim, about 4.7:1 over white) is a Caption.
- **Figures:** a number read at a glance in a panel or popover is a Figure, `text-base font-semibold tabular-nums`,
  15/20: Performance's frame rate (`PerformanceStats.tsx`, `text-lg font-semibold` today, an 18px heading used as a
  number) and the accessibility panel's impact counts (`AccessibilityPanel.tsx`, which drops `leading-none`).
  Performance's memory and CPU, inside a line of labels, stay Strong values.
- **Item titles:** a name or title that heads a card, popover or panel is `text-sm font-medium`, 13/18 at 550: a
  component card's name (`ComponentCard.tsx`), a board's and a state's title on the canvas (`ContainerView.tsx`),
  Processes' and Performance's titles (`Processes.tsx`, `PerformanceStats.tsx`), a panel's error (`PanelError.tsx`) and
  the account menu's name (`AccountMenu.tsx`). Names among them render through `<Name>`. Inside a line of labels, the
  part that's read (the status bar's renderer, builder and counts in `StatusBar.tsx`, Performance's figures) is a Strong
  value, `font-medium text-foreground` at 12/16 550.
- **Names:** one utility in `styles.css`, `@utility name-text { font-feature-settings: "ss04", "calt" 0 }`, goes
  wherever a design, layer, component, state or mode name shows, so a name has the same letters everywhere: Layers' rows
  (`LayerTree.tsx`), a board's title and its states' and modes' names on the canvas (`ContainerView.tsx`), the
  selection's label over the canvas (`CanvasOverlay.tsx`), modes in the Design tab (`DesignPanel.tsx`), the Components
  panel's names, layer names in the accessibility panel (`AccessibilityPanel.tsx`), and a project's name on the start
  page (`HomePage.tsx`), in the actions search (`ActionsSearch.tsx`) and on its tab in the title bar. A field that edits
  a name takes it through `NameInput` (or `TextInput`'s `name` prop): the design's name (`DesignPanel.tsx`), renaming a
  layer, component, mode or token, and the Layers and Tokens searches, which match names. Other fields, such as a text
  prop or an email, keep the plain letters, so the same text doesn't change letters with the field that edits it. Those
  standalone names render through one small `<Name>` span carrying `name-text` and `truncate`, so new places pick it up,
  and the lint rule fails `name-text` used anywhere else. A name inside a sentence, such as "Only {name}" or "Export
  {name}", takes the label's plain letters.
- **Layers:** rows drop `font-medium` at the top level (`LayerTree.tsx`).
- **Fields:** a token picker sets `font-mono` only on a token's name, so None and Mixed, which are words, show in Inter
  (`fields.tsx`, the value span: `value ? "font-mono" : "text-muted-foreground"`). A panel's select opens with 12px
  items: `fields.tsx` exports one `PanelSelectContent` with `[&_[data-slot=select-item]]:text-xs`, since the kit's items
  set their own size, and every panel's select uses it: `fields.tsx`'s, Export's two (`ExportSection.tsx`), Layers' two
  (`LayerPanel.tsx`, the state picker among them) and Modes' (`ModesPanel.tsx`, whose trigger also takes `text-xs`, to
  match its label). Dialogs' selects keep 13px. The exploration's stylesheet shrinks every select, as it can't tell a
  panel's popup from a dialog's.
- **Wrapped text,** as named roles rather than a tag or one-off values: 12px text that can run to more than one line is
  on an 18px line, 13px on 20px, and 11px on 16px. `@utility type-body` (13px on 20px, `text-wrap: pretty`) is the start
  page's paragraphs (`HomePage.tsx`'s intros, `text-sm text-pretty` today, on 18px). `styles.css` adds three more,
  `@utility type-description` and `@utility type-message` (12px on 18px, `text-wrap: pretty`) and `@utility type-empty`
  (13px on 20px, `balance`, with `& > .text-xs { line-height: calc(18 / 12) }` so its hint, such as "Click inside one to
  select a layer…" in `DesignPanel.tsx` and `AccessibilityPanel.tsx`, wraps on an 18px line and stays balanced, and an
  empty title inside it, as in `AssetsPanel.tsx`, is `font-medium text-foreground`), each setting `--tw-leading` too,
  since Tailwind emits a utility with more properties before `text-xs` and the size utility would otherwise win the line
  height; they replace `text-xs` or `text-sm` on an element, and the lint rule fails one beside the other. The lint rule
  then allows no `/[…]` or `leading-[…]` line heights at all. They go on every wrapped description, whatever its tag (a
  grep for `text-xs` on `<p>`, `<div>` and `<span>` that hold sentences finds them: section and setting descriptions,
  the Code and Components tabs' notes, panel errors, toasts), on every message that's read (field messages,
  TokenDetail's and Tokens' errors, Assets' reasons), and on the empty panels. A one-line `<p>`, such as "No stroke.",
  keeps `text-xs` and its 16px line. 11px code that wraps (`ComponentCard.tsx`'s error, the accessibility panel's color
  rows) takes `text-2xs/4`. "double-click" in the empty Design tab's hint takes a non-breaking hyphen (U+2011). The
  named line heights left in the renderer come onto the roles too: `leading-relaxed` (`ProjectStatus.tsx`,
  `ErrorBoundary.tsx`, `ExportSection.tsx`, `SignInPanels.tsx`, the accessibility panel), `leading-normal`,
  `leading-snug` (`AccessibilityPanel.tsx`, `AssetsPanel.tsx`), `leading-5` (`ConsolePanel.tsx`, `slot-props.tsx`,
  `UpdateToast.tsx`) and `leading-4` (`instance-slots.tsx`, `UpdateToast.tsx`) become the `type-*` role their text
  plays. Code over many lines (the Code tab's `CodeBlockContent`, stack traces' `pre`, the console's messages) takes a
  fourth, `@utility type-code`, 12px on 18px with `--tw-leading`, as editors set code.
- **Sans inside code:** an Inter word inside a monospace line, such as "on" between two colors in the accessibility
  panel, resets what the monospace rule passes down:
  `:is(.font-mono, code, pre) .font-sans { font-size-adjust: none; font-weight: var(--font-weight-normal); --font-weight-medium: var(--weight-sans-medium); --font-weight-semibold: var(--weight-sans-semibold) }`,
  in the base layer. `@theme` holds Inter's medium and semibold as `--weight-sans-medium` (550) and
  `--weight-sans-semibold` (650), which `--font-weight-medium` and `--font-weight-semibold` point at, so the Mac's
  lighter weights, if the check calls for them, change in one place and reach Inter inside code too.
- **The start page's sections:** "Bring your own" and "For you" (`HomePage.tsx`, `text-sm font-semibold`, 13/650 over
  13/550 items) take `PanelSectionTitle` in the lead tone, 12/650, as the inspector's sections lead their rows. The
  project filter's pressed state (`ProjectList.tsx`, `aria-pressed:font-medium`) is marked by color only, since a
  heavier pressed label widens it, as a heavier active tab did. The start page is compared through the toolbar's Type
  control on Parity/Start page.
- **Headings:** `tracking-tight` on the start page's and sign-in's headings becomes -0.01em (`HomePage.tsx`,
  `SignInPanels.tsx`) through `--tracking-tight: -0.01em` in the plain `@theme`; the kit's only `tracking-tight`, on
  `empty-title`, is already reset to 0. Two heading roles, not three sizes: a Page title, 24/32, heads a screen that
  fills the window, and a Heading, 18/24, heads part of a page. So sign-in is 24px at every step of its flow, its
  waiting and problem panels moving up from `text-xl` (`SignInPanels.tsx`), and its `text-2xl leading-tight` drops
  `leading-tight`; the crash screen's whole-app heading moves from `text-xl` to `text-2xl` while a part's error stays
  `text-lg` (`ErrorBoundary.tsx`), 18 and 20 being too close to read as different steps. The lint rule fails `text-xl`
  in the chrome.
- **Leftovers the lint rule would fail:** `tracking-normal` on the shortcuts in `ComponentMenu.tsx` and on both of
  Search's row ends in `ActionsSearch.tsx`, which the shortcut rule already covers, and `tracking-normal normal-case` on
  the section count in `PanelSection.tsx`, which only undid the old capitals, all go. Search's row end that holds a
  detail rather than keys, a path or a layer's design, keeps its lowercase's hyphens: the shortcut's raised symbols are
  for keys only.
- **Storybook:** the Type control and the exploration's stylesheet go, since the app is the proposed type then. The
  Scale story stays, as Parity/Type/Scale: one column, every role in [typography.md](../typography.md) drawn with its
  classes and measured, so a change to a role is reviewed where it shows.
- **Holding to it:** [typography.md](../typography.md) describes the roles and their classes. A rule in the vite-plus
  oxlint plugin config fails one-off type values (`text-[…px]`, `font-[…]`, `tracking-[…]`, `leading-[…]`, `/[…]`) and
  the named one-offs the audit found (any `leading-*` but `leading-none` on fixed-size chips and glyphs, any
  `tracking-*` but `tracking-tight` on a heading, `uppercase`, and `font-thin`, `light`, `bold`, `extrabold`, `black`)
  in the renderer's `className` strings, outside explorations, notes, the text editor and font samples, and names the
  role to use, with no exceptions now that wrapped text has its own utilities. It also fails the kit's `SelectContent`
  in the panels outside `fields.tsx` (use `PanelSelectContent`), `name-text` outside `<Name>` and `NameInput`, a
  `type-*` class beside a `text-{size}` class, `font-mono` with `font-medium`, `text-xl`, and `text-xs` with
  `font-medium` or `font-semibold` and `text-muted-foreground` outside the title components (`PanelSectionTitle`,
  `GroupLabel`, `DialogGroupTitle`). The renderer writes many classes as template literals with ternaries, so a
  combination is checked over every static class string in the expression gathered into one set: both branches of a
  ternary or `&&`, each argument to `cn` or `clsx`, and string constants defined in the same file. Its tests cover each
  of those shapes, starting with `TokenDetail.tsx`'s mode name, which splits `font-mono` and `font-medium` across a
  ternary; a combination built any other way isn't caught. [typography.md](../typography.md) is the reference for both
  the lint rule and the roles; where this list and it differ, it wins. With the kit guard test above, drifting fails the
  build rather than a review.

Windows 10 has no Cascadia Mono, so code there falls back to Consolas, as it does on every Windows today. Its lowercase
is 10% shorter than Inter's and 6% shorter than Cascadia's, which `font-size-adjust` makes up, so code is the same size
on both.
