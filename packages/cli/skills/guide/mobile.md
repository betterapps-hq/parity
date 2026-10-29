# Phones and small viewports

In Parity a phone layout is the same design in a mobile viewport, patched where it needs to differ. Show a mobile mode
beside the main frame (`UpdateDesign(design, { showModes: ["mobile-light"] })`) and fix what breaks there.

## What usually changes

| On desktop                           | On a phone                                         |
| ------------------------------------ | -------------------------------------------------- |
| A sidebar                            | Hidden, with navigation in a top bar or a menu     |
| Rows of cards or columns of a grid   | One column: `columns: 1`, or `direction: "column"` |
| A header row with actions at the end | Title above, actions below or in a menu            |
| Page padding of 8 steps              | 4 to 5 steps                                       |
| A wide table                         | Fewer columns, or each row as a stacked card       |
| Side-by-side form fields             | Stacked, full width                                |

Patch these with `Responsive(node, "mobile", patch)`. Hiding a column in a table means hiding its header cell and the
matching cell in the row component design.

## Touch

- Controls need room for a finger. WCAG asks for targets of at least 24 by 24 pixels; phones are easier at about 44. Use
  the components' default or large sizes, and keep small controls apart.
- Put the main action where a thumb reaches it: full width at the bottom of a form, or at the bottom of the screen.
- Nothing can depend on hover. Anything a hover shows on desktop needs another way in.

## Content

- Text wraps more. Check long names, emails and numbers in every state; `lines: 1` keeps a single line with an ellipsis
  where wrapping would break a row.
- Lead with less. A phone shows the first few items; put the most important ones first.
- Check the mobile frame with `find_problems`: overflow there usually means a row that needs to stack.
