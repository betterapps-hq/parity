# Proposal: easier-to-read interface type

Status: draft for Andrew's approval, 2026-11-08 (PAR-709). The comparison is in Storybook under Parity/Explorations/
Interface type ([InterfaceType.stories.tsx](../../apps/desktop/src/renderer/explorations/InterfaceType.stories.tsx)),
and the toolbar's Type control turns the proposed type on for every story. What the proposal sets is one stylesheet,
[proposed-type.css](../../apps/desktop/src/renderer/explorations/interface-type/proposed-type.css), which the build
moves into `styles.css`.

## In one line

Four sizes for the chrome where there are nine, nothing under 11px, regular text a step heavier, section titles in
sentence case, and code in a monospace that matches Geist, all from the theme's variables so the kit's components
follow.

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
- **No font smoothing is set,** so on macOS light text on the dark theme is drawn with subpixel smoothing and looks
  heavier and softer than on a light background.

The colors weren't changed. In the light theme the muted gray is 4.7:1 on white, which passes AA for text this size.

## The proposed type

| Part                                   | Now                          | Proposed                                 |
| -------------------------------------- | ---------------------------- | ---------------------------------------- |
| Units, counts, canvas labels           | 10, 10.5 and 11px            | 11/14px, 0.01em tracking                 |
| Labels, values, panel text, status bar | 12/16px                      | 12/16px                                  |
| Kit's small button                     | 12.8px                       | 12/16px                                  |
| Menus, tabs, buttons, layer rows       | 13 and 14px                  | 13/18px                                  |
| Names, dialog titles                   | 15 and 16px                  | 15/20px                                  |
| Headings                               | 18/28, 20/28, 24/32px        | 18/24, 20/28, 24/32px, closer set        |
| Section titles                         | 12px semibold capitals, gray | 12px semibold, sentence case, text color |
| Group labels                           | regular or medium, gray      | medium, gray                             |
| Weights                                | 400, 500, 600                | 450, 540, 620                            |
| Code                                   | Consolas on Windows          | Cascadia Mono on Windows, Menlo on macOS |

Geist is a variable font, so 450 and 540 cost nothing. Headings tighten as they grow: -0.01em at 18px, -0.015em at 20px,
-0.02em at 24px. Font smoothing is grayscale on macOS; Windows ignores it.

Notes on the canvas are people's own text and keep their size and spacing.

## Monospace

Cascadia Mono comes with Windows 11, and its lowercase is within 2% of Geist's, so it needs no new dependency. Geist
Mono (`@fontsource-variable/geist-mono`, from the same source as the Geist package Parity already uses) would match
Geist exactly and look the same on both systems, but it's a new dependency, so it waits for your agreement.

## Geist or Inter

The Geist or Inter story sets the proposed type in both, at the same sizes and weights. Inter, which Figma, Framer and
Linear use, was drawn for screen text at small sizes: its letters are a little wider and more open than Geist's, and it
has optical sizes, so small text comes out a little looser and headings a little tighter on their own. Geist is
narrower, gives Parity a look of its own, and has Geist Mono to match.

Inter's own release can tell I, l and 1 apart and slash its zero, but `@fontsource-variable/inter`, a Google Fonts
build, leaves those alternates out. It's a dev dependency for Storybook only: the build drops it, or moves it to the
app's dependencies if you choose Inter.

## What the build changes

- **`styles.css`:** the sizes, line heights, weights and `--font-mono` in `@theme`, body text at the normal weight, and
  font smoothing. The kit's components read these, so menus, tabs, buttons and dialogs follow without changing the kit.
  The kit's small button and menu shortcuts take a rule on their `data-slot`, as tooltips already do.
- **Components:** the pixel sizes become the scale's classes (`text-[10px]` and `text-[11px]` become one 11px size,
  `text-[13px]` becomes `text-sm`, `text-[15px]` becomes `text-base`); `PanelSectionTitle`, the console's and the error
  screen's titles drop `uppercase` and `tracking-wide` and take the text color, with their counts in gray; Layers' group
  titles become medium.
- **Storybook:** the Type control and the exploration's stylesheet go, since the app is the proposed type then.
