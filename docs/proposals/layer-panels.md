# Proposal: a Design panel for each layer kind (PAR-1056)

Agreed on 2026-11-12.

Today one `LayerPanel` picks a layer's sections from the tables in `packages/editor/src/layer-capabilities.ts`, from
what the layer can do ([design-panel-sections.md](design-panel-sections.md)). Every styled layer gets almost the same 13
style sections, so an image gets Fill and Raw CSS, and a text layer's panel reads much like a layout's. This page
proposes a panel for each kind of layer instead, each designed for what that kind is for.

## One component for each kind

Each kind's panel is a top-level component that puts the existing sections in its own order, with the section people
reach for first at the top. It's built in Storybook first, under Panel › Layers, as a story you can click through, and
once it's approved `LayerPanel` draws it as it is.

What varies within a kind stays in the capability table: whether a layer is its design's root or a frame's, whether its
parent is a flex layout or a grid, whether it's inside a component instance, and whether its component takes
`className`. A kind's panel asks the table which conditional controls to show, as the sections do today.

Selecting several layers of one kind draws that kind's panel, with Mixed where their values differ. Layers of different
kinds get a panel of their own, Several layers, with only the sections they all share.

## Each kind's panel

| Kind               | Opens with                                      | Then                                                 | Leaves out or folds                                                                  |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Layout             | Layout: direction, gap, alignment               | Size and spacing, Position, Fill, Stroke, Appearance | Folds Text inside, Effects, Motion and CSS                                           |
| Text               | Content, then Text with its color               | Size with resizing, Position, Appearance             | Leaves out Layout; folds Fill, which is the background                               |
| Image              | Content: the image's                            | Size with aspect ratio, Position, Appearance, Stroke | Leaves out Layout, Text and Fill                                                     |
| Video              | Content: the video's                            | As an image's                                        | As an image's                                                                        |
| Icon               | The icon, its size, stroke width and color      | Size, Position                                       | Leaves out Layout, Text and the Fill stack                                           |
| Component instance | Props, with the slots it fills, then Attributes | Size, Position, Text inside, Appearance              | Leaves out Layout; when its component takes no `className`, a note in place of style |
| Slot               | What fills it, from the picker (PAR-1046)       | Waits on the slots design                            |                                                                                      |
| Several layers     | The sections every selected layer shares        | Mixed where values differ                            | Everything the layers don't share                                                    |

Every panel starts with its header and ends with Export. A design's root layout leaves out Position and Layer order, and
a frame's root adds Frame size above the rest. A layer inside a component instance gets its kind's panel, with the
header's Reset and Push to main, and an image there keeps its component's file. A screen's, a component's and a frame's
own panels are in Layers › Designs already, and stay as they are.

## Folded sections

A section with nothing set, such as Stroke, Effects, Motion, CSS or a background, shows only its title and an add
button. Adding opens it, and removing the last value folds it again, as Penpot does.

## Sections still to design

Until each lands, a panel draws today's section in its place.

| Section        | Issue    |
| -------------- | -------- |
| Image content  | PAR-1065 |
| Video content  | PAR-1066 |
| CSS            | PAR-1067 |
| Export         | PAR-1068 |
| States         | PAR-1069 |
| How slots work | PAR-1070 |

## Order of work

1. Layout (PAR-1057) and Text (PAR-1058), the kinds people select most.
2. Image (PAR-1059), Video (PAR-1060), Icon (PAR-1061) and Component instance (PAR-1062).
3. Slot (PAR-1063), after the slots design.
4. Several layers (PAR-1064), once each kind is settled.
5. The sections still to design, each dropping into the panels that use it.
