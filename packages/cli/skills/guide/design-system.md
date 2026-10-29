# Designing with the project's system

The project already decided its colours, type, spacing and components. Your job is to compose them well, not to style
around them. A design that only uses the system's pieces is one the code can build without new CSS.

## Spacing

Spacing is a scale of steps (`4` is 1rem in a default Tailwind project). Use a few steps consistently:

| Between                                      | Steps   |
| -------------------------------------------- | ------- |
| An icon and its label, a label and its field | 1 to 2  |
| Items in a list or fields in a form          | 3 to 4  |
| Groups within a section                      | 6       |
| Sections of a page                           | 8 to 12 |
| A page's edge, desktop                       | 8       |
| A page's edge, mobile                        | 4 to 5  |

Space shows what belongs together: less inside a group than between groups. Let cards and other components keep their
own padding; add gaps between them, not padding around them.

## Type

Use the type scale tokens (`text-sm`, `text-base`, `text-lg`, `text-2xl`) and weights 400 to 700. A page needs about
three sizes: its title, section titles and body. Secondary text uses `muted-foreground`, not a smaller size alone. Pick
the `tag` for meaning: one `h1` per screen, then `h2` for sections.

## Colour

Semantic tokens carry meaning and follow the theme:

- `background` and `foreground` for the page; `card` and `card-foreground` for raised surfaces.
- `muted` and `muted-foreground` for quiet surfaces and secondary text.
- `primary` for the one main action on a screen, through a component's default variant rather than a raw background.
- `destructive` for actions that delete or can't be undone.
- `border` for dividers and outlines.

Palette colours (`color-emerald-500`) don't change with the theme, so keep them for data, such as chart series and
status dots, and check them in dark mode.

## Composing

- Start from the page's structure: a header with the title and its actions, then the content, then anything secondary.
- Group with the components meant for it. A `Card` frames one subject; a `Table` shows records with the same fields; a
  list of rows suits items people scan and act on; `Tabs` split one subject into views.
- One primary button per view. Other actions use `outline`, `secondary` or `ghost` variants, and destructive ones the
  `destructive` variant, usually behind a confirmation.
- Align to one edge. Text and controls in a column share a left edge; actions sit together, at the end of a row or the
  bottom of a form.
- Show status with the system's pieces: `Badge` for a status or count, `Skeleton` for loading, `Empty` for nothing yet.
- Fill designs with believable data: real names, dates, amounts and lengths. Include a long one; it finds layout
  problems a short one hides.
