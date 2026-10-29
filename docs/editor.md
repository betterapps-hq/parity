# The editor

What Parity's canvas editor does, how each part of it works, and the tests that keep it working. You asked on 2026-10-29
for every piece of editor work to land with tests and a description here, so nothing gets lost or quietly breaks.
Shortcuts are listed once, in the keymap ([chrome/keymap.ts](../apps/desktop/src/renderer/chrome/keymap.ts)) and the
Keyboard shortcuts dialog; this page says what they do. What's decided and why is in [decisions.md](decisions.md).
Features built before 2026-10-29 are being added under DOC-2 in the [backlog](backlog.md).

## How to keep it

- **Each feature has a section** under its area: what it does from the person's side, the rules it follows, including
  the edge cases, where its code is, and the tests that cover it, by file.
- **Change the section in the same commit as the feature.** A behaviour that changes while its section doesn't is a
  regression nobody will notice.
- **Name the gaps.** When part of a feature has no automated test, its section says so and how it was checked instead.

## Selecting

How a click, a drag or a key picks layers and designs, and how the canvas finds and outlines them.

## Moving, reordering and resizing

Dragging layers and designs, where they land, resize handles and duplicates.

## Keyboard

What the keys do on the canvas, and when they belong to a design or a field instead.

## Fields

How the inspector's number, length and token fields read what's typed, scrubbed or stepped.
