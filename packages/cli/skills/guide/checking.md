# Checking a design

Parity renders every frame offscreen at its real width, with the project's real components, so checks see what the app
would show. Run them after every change you make, and before you tell the person you're done.

## Screenshots

`screenshot`, or `Screenshot` in a snippet, returns the images. Look at them: text that wraps badly, a button pushed off
the edge, a skeleton that doesn't match what it stands for, colours that disappear in dark mode. `scale: 2` helps with
small details.

To see many frames at once, pass `sheet: true` to `screenshot` (`parity screenshot <design> --sheet`). You get one image
per design instead of one per frame: a component's states in rows, modes in columns, each labeled. The CLI saves it as
one file, so it's one read. A sheet is kept within 2,000 pixels, so big frames are shrunk; its `scale` says by how much.
Screenshot a single state and mode to read small text.

## Layout problems

`find_problems`, or `Problems` in a snippet, lists what's wrong in each frame without looking at it:

- **Render errors.** A component threw. Usually a prop with the wrong type, or a part used outside its parent (a
  `TabsTrigger` without `Tabs`). `parity components` lists the components failing anywhere on the canvas, with why.
- **Overflow.** A node that sticks out of the frame, by its width or where it's placed, usually a row that needs to wrap
  or stack on mobile. The finding gives the node, its box, the frame's, and how many pixels past which edge.
- **Clipping.** A node cut off by an ancestor with `overflow: hidden` or a fixed size, named in the finding with its
  box. What an ancestor with `overflow: scroll` scrolls to isn't cut off, so a row of chips or days that scrolls
  sideways is clean, as long as the row itself fits the frame. A node that only spills past a parent that doesn't clip
  still shows, so it isn't listed.
- **Unknown components.** A name that isn't in `Components()`; it draws as a placeholder.

`Measure` gives every node's box in one frame, for checking alignment or sizes by numbers. It takes one state and one
mode; to compare frames, call it for each, as the execute skill shows.

## Accessibility

`check_accessibility`, or `Accessibility` in a snippet, runs axe-core against WCAG 2.2 AA in each frame and reports each
rule broken on the layers that break it, worst first. Fix what it finds within the design system:

| Finding                    | Fix in the design                                                                 |
| -------------------------- | --------------------------------------------------------------------------------- |
| Text contrast too low      | A stronger token: `foreground` instead of `muted-foreground`, or a darker variant |
| Button or link has no name | Visible text, or an `aria-label` prop on an icon-only button                      |
| Form field has no label    | A `Label` with `htmlFor` matching the field's `id`, or an `aria-label`            |
| Image has no alt text      | `alt` that says what it shows, or `alt: ""` when it's decoration                  |
| ARIA reference to nothing  | Add what it points at, such as the `TabsContent` for each `TabsTrigger`           |
| Heading level skipped      | Text tags that go down one level at a time: `h1`, then `h2`                       |
| Target too small           | A bigger size variant, or more room around small controls                         |

Automated checks find some problems, not all. A clean result doesn't make a design accessible; say so when you report.

## The console

`get_console` returns what the project's own components wrote to the console: errors, warnings and logs, from the
person's canvas and from your offscreen renders. React warnings about props, keys and nesting show up here, often before
they show on screen. `clear: true` empties it, so the next read shows only what's new.

React's warnings keep their `%s` placeholders, with the values that fill them listed after the message.

When Parity itself misbehaves (a render that never finishes, a save that fails), `get_logs` reads its own events, with
their traces, from the app's local log: `parity logs --level warn --since 10m`. When a bug needs filing by hand,
`parity diagnostics` writes a zip of what Help > Report a problem sends: the last hour of the log, versions, the open
projects and the latest run that didn't quit. Read it before attaching it.

## Trying it

Checks can't click. The person can: the Interact tool (I, or the pointing hand in the toolbar) hands their mouse and
keyboard to the real components, so tabs switch, menus open and fields take typing. Escape steps out of a component, and
a second Escape stops interacting; the design goes back to how it was. When behaviour matters (a menu, a dialog,
keyboard order), ask them to try it, and read `get_console` afterwards for errors it caused.

The Accessibility tab also shows the tab order on the canvas, numbered in the order the Tab key visits.
