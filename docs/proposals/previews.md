# Proposal: token and component previews

Status: designed as Storybook explorations on 2026-10-29; nothing is built. The builds are TOK-6 to TOK-8 and CAN-97 to
CAN-99 in [backlog.md](../backlog.md).

## In one line

Every token shows what it is (a shadow as a shadow, an easing as a curve that plays when you point at it) and every
component shows a picture of itself before you insert it. Tokens are drawn with CSS from their own values; components
are bitmaps the offscreen renderer makes once and keeps on disk. No panel ever mounts a component, and nothing moves
unless someone is looking at it.

## The explorations

In Parity's Storybook, under Parity/Explorations/Previews. Drawings stand in for the component bitmaps.

| Story                                           | What it settles                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Tokens: Every Kind                              | One preview per kind, as a tile and as a row, and which kinds are under Other or Effects today                 |
| Tokens: Panel Rows, Panel Tiles, Panel Shadows  | The Tokens tab with a preview on every row in one fixed box, a Tiles view, and sections by what a token is for |
| Tokens: Panel Motion, Motion Details            | Motion holds still until hovered; a duration races its scale, an easing draws over the project's others        |
| Tokens: Detail From Row, Details                | A token's detail above its editor: large preview, the tokens its value goes through, what it comes to, uses    |
| Tokens: Reduced Motion On                       | With reduced motion nothing plays by itself; Play runs it once asked                                           |
| Tokens: Inspector Fields, three Picker stories  | Previews in the inspector's token buttons and pickers, with a larger one for the highlighted option            |
| Components: States                              | Every state a preview can be in, in a list row, a grid tile and on the card                                    |
| Components: Panel List, Panel Grid, Panel Names | The Components tab's three views; Names is today's list                                                        |
| Components: Hover Card, Hover Card Updating     | The card a resting pointer opens: large picture, variants, source, uses, Insert                                |
| Components: Cards Without Pictures              | What a card says when there's no picture, and what fixes it                                                    |
| Components: three Insert Picker stories         | The `/` picker with a picture per row and the highlighted one's card beside the list                           |

## Token previews

**Drawn, not rendered.** A token's preview is a few elements styled from its resolved value, in Parity's own document:
`resolveTokenValue` already turns `calc(var(--radius) * 0.8)` into a value. The project's custom properties are never
set on Parity's elements, since shadcn's names (`--background`, `--primary`) are Parity's too. Fonts work because
`prepareCanvasCss` already moves `@font-face` to the document. Rows are virtualized as the Icons panel's grid is, so
Fluent's 459 tokens don't mean 459 previews mounted.

**A preview kind, finer than the category.** `previewKind(token)` comes from the category, the name, the value and the
DTCG `$type`. It splits Shadows into box, inset, drop and text; Motion into durations, easings and animations; and takes
what's under Effects and Other today into kinds of their own: blur and backdrop blur, aspect ratio, perspective, border
width (Fluent's `strokeWidth*`, Chakra's `borders`), opacity, z-index (Chakra's and Mantine's), cursor. The panel's
sections follow the kinds. Kinds the inspector picks by (opacity, blur, border width) also become categories, so a
picker can ask for them; the rest stay finer kinds inside a category.

| Kind                                      | Row preview                                         | Larger preview                                 |
| ----------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Color                                     | A swatch per theme, over a checkerboard for alpha   | Both themes side by side with their values     |
| Spacing, radius, border width             | A bar, a corner, a line, at real size               | The same, larger; a rounded card for radius    |
| Box and inset shadow                      | A card's corner at three quarters size              | A card on the design's soft grey, at full size |
| Drop and text shadow, blur, perspective   | The real effect, scaled down as a whole             | The same at full size                          |
| Font, size, weight, line height, tracking | "Ag", "Aa", "ABC" or lines of text in the value     | A specimen in the project's type               |
| Opacity                                   | A block at that opacity over a checkerboard         | The same, larger                               |
| Duration                                  | Its length against half a second                    | A race against the rest of its scale           |
| Easing                                    | Its curve, overshoot included                       | The curve over the project's other easings     |
| Animation                                 | Its first frame                                     | Its keyframes, playing                         |
| Z-index                                   | Stacked sheets, its own lit                         | The whole scale as a stack                     |
| Breakpoint, container                     | Its width against the widest                        | A ruler with phone, tablet and laptop widths   |
| Aspect ratio, cursor                      | A box in that ratio; the cursor, which it also sets | The same, larger                               |
| A bare number                             | Nothing: its name and value                         | The number                                     |

**On the design's sheet.** Kinds about how a design looks (shadows, blur, opacity, type) sit on the project's own
background in its default theme, so a shadow reads as it will in the design rather than on Parity's dark chrome. Kinds
that are measurements (spacing, radius, z-index, motion) are diagrams in Parity's ink.

**Motion only while looked at.** A motion preview runs through the Web Animations API while its row is hovered or
focused, its picker option is highlighted, or its detail is open, and is cancelled the moment that stops. One-off
motions loop with a short rest; the durations in a race share one loop so they always set off together. An animation
token plays the project's own `@keyframes`, read by name from the project's stylesheet (`CSSKeyframesRule` to Web
Animations keyframes), since those keyframes live in the frames' shadow roots. With reduced motion, previews hold their
resting picture and Play runs them once. Idle cost is nothing: with nothing hovered, `document.getAnimations()` holds
none of them, which a test can check.

## Component previews

**What's pictured is what inserting places.** The preview tree is the node `insertAtSelection` would build: the
component with its `.lib.par` sample and the parents a part needs (`withLibraryContext`), or a story's args when it has
stories, in the project's default mode with its decorators once DECO-4 and DECO-6 land. A component design's picture is
its board's bitmap, which the canvas already takes. Pages render at 1280 wide and show from the top, like a screenshot;
components render at their own size, capped at 640 wide.

**Where bitmaps come from: the offscreen renderer.** `renderFrame` in `main/index.ts` already draws a job in the
offscreen window and captures it for the canvas's zoomed-out bitmaps and for agents. Previews become a third kind of job
on the same queue, after canvas bitmaps and agent renders, so they never delay either. Each capture is cropped to the
component's box, at twice its size, then scaled down in the main process into the two files below. Drawing several
components on one page and cropping each from one capture is worth measuring once the simple version works.

**When they're made.**

1. Never while a project is opening: not before the canvas is usable and its own bitmaps are taken (CAN-65).
2. Ones in view first: a row or picker item on screen asks for its picture, still behind canvas and agent jobs.
3. The rest in an idle pass: after two seconds with no pointer, key, drag or agent edit, one job at a time, stopping
   before the next job as soon as the person works. The pass ends, and the offscreen renderer's idle close
   (`main/idle-close.ts`) still shuts it a minute later.
4. On demand: a card's variants when the card first opens.

The canvas took 27 s to have bitmaps for the example's 119 frames, about 0.2 s each with its waits, so 200 components is
under a minute of background work, once.

**Kept on disk, keyed by content.** Each picture's key is a hash of the preview tree, the mode, the content of the
component's file and everything it imports (from the builder's module graph), the project's compiled CSS and Parity's
renderer version. Files go in the disk store CAN-28 makes for the canvas's frame bitmaps,
`<userData>/previews/<project>/<key>.png`, with an index of each component's current key, size and state. The renderer
gets them through a `parity-preview:` protocol as plain `<img>`s, so Chromium decodes only what's on screen and nothing
sits in JavaScript as data URLs, as `frame-bitmaps.ts` keeps today's.

**Invalidation follows the keys.** A changed file re-makes only the components whose imports include it. A token saved
to the stylesheet changes the CSS hash, so every picture is re-made, visible ones first; a token being previewed but not
saved changes nothing. Until its new picture is made, a component shows its last one dimmed with an updating mark, as
Hover Card Updating shows: a picture of a moment ago is useful in a list, unlike on the canvas, which shows a skeleton
rather than an old bitmap. Reopening a project reads the index and shows every picture whose key still matches without
rendering anything.

**Memory and disk.** Two files per picture: a thumbnail at 240 by 152 pixels (the grid tile at 2x, also used for list
rows and picker rows) of about 5 to 10 KB, and a large one at 608 by 352 (the card at 2x) of about 25 to 40 KB, since
flat interface pictures compress well. 200 components come to about 10 MB on disk, capped per project (50 MB, least
recently shown first) and removed with the project from recents (CAN-74). In memory, decoded thumbnails are about 150 KB
each, so a panel showing 30 holds about 4.5 MB, plus under 1 MB for an open card. The renderer keeps only the index, a
few dozen bytes per component.

**States**, as the States story shows them: waiting its turn, being made, made, updating after an edit, fails to draw
(the error on the card), needs props (a required prop with no value, from the props reader), needs a provider (from
`renderProblem`), only renders on a server, and draws nothing of its own (a provider, listed only when searched for by
name). Made pictures sit on the project's background; everything else sits on the panel's fill, so a placeholder never
passes for a picture.

## Where the logic goes

Following [packages.md](packages.md): `previewKind`, easing curves and value labels go in `@parity/tokens` (PKG-8), or
`@parity/core` until it exists. Preview keys, invalidation from a changed-file set and the job order are pure and go in
`@parity/core` beside `builder-process.ts`, tested without Electron. The disk store, the protocol and the queue's wiring
stay in the main process; the views stay in the app.

## Calls made here

Recorded in [decisions.md](../decisions.md) under Previews: tokens drawn not rendered; preview kinds and the sections
they give; motion only while looked at; component pictures as bitmaps of what inserting places, on disk by content;
stale pictures shown dimmed; the Components tab's three views with List as the default; the hover card and the picker's
card; and CAN-64's preview clause moving to CAN-98.
