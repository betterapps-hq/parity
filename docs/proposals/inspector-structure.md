# Proposal: the inspector's structure (PAR-1028)

Status: the tree was agreed on 2026-11-12. This page is for review before anything moves.

## The problem

The Design tab's stories overlap. Layer › Props, Slots, States and Instances, Inspector › Props and States, and Controls
› Component instance each show parts of the same panel, in different combinations. Each layer's panel is one large
component, `LayerPanel`, so a story can only show a section by drawing a whole layer and cutting the rest away. Each
case then gets filed under whichever layer happens to show it. Fixes made in one copy miss the others: two `Field` rows
and two prop sections exist side by side.

## Seven levels

Each level is built only from the one below it, and each has its own stories.

| Level        | What it is                                                                     | Example                            |
| ------------ | ------------------------------------------------------------------------------ | ---------------------------------- |
| **Panel**    | The inspector itself: its tabs, nothing selected, a selection that's gone      | Design tab, Accessibility tab      |
| **Layers**   | What one kind of selection shows: the sections the table below picks, in order | Text, Component instance           |
| **Sections** | One titled section, which takes the selection and edits it                     | Props, Attributes, Layout, Fill    |
| **Rows**     | One labelled row, which can hold several fields                                | Padding, Size and aspect ratio     |
| **Lists**    | Rows that are added, removed and reordered                                     | Paint stack, Shadow list           |
| **Fields**   | One value's control, with no idea what layer it's on                           | Number field, Select, Switch       |
| **Parts**    | What fields and rows are made of                                               | Field row, Change mark, Token chip |

A case lives at the lowest level it's about. A field's changed look is a Fields story. Padding marking one side is a
Rows story. Props being defined on a component and set on an instance are two Sections stories. A Layers story shows
only which sections a kind has, so each kind has one.

## Which sections a layer shows

[design-panel-sections.md](design-panel-sections.md) already picks the style sections from what a layer can do
(`styleParts` in `packages/editor/src/layer-capabilities.ts`). The same table grows to cover every section, so the panel
draws a list rather than branching on the layer's type. It needs three more capabilities:

| Capability  | True when                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| `component` | The selection is a component design, or a layer inside one                |
| `instance`  | It's a component instance                                                 |
| `attrs`     | It passes attributes to an element: an instance, a layout or a text layer |

| Section        | Shown when                                                   |
| -------------- | ------------------------------------------------------------ |
| Header         | Always: name, kind, eye, links, Make component, Make slot    |
| State selector | A layer inside a component design                            |
| States         | A component design                                           |
| Props          | A component design (defines them) or an instance (sets them) |
| Slots          | A component design's slots, or an instance that fills them   |
| Attributes     | `attrs`                                                      |
| Content        | `text`                                                       |
| Media          | `media`                                                      |
| Style sections | As `styleParts` decides today                                |
| Modes          | A screen or component design                                 |
| Export         | Always                                                       |

Attributes takes over the Accessibility section on layouts and text, which hold only `role`, `id` and `aria-*` today. An
instance of a component design gets attributes once the file can hold them on it.

## Stories

```text
Inspector/
├── Panel/          Design tab, Accessibility tab, nothing selected
├── Layers/         Screen, Component, Frame, Text, Horizontal layout, Vertical layout, Grid,
│                   Component instance, Icon, Image, Video, Several layers
├── Sections/       Header, State selector, States, Props, Attributes, Slots, Content, Media,
│                   Layout, Position, Size, Spacing, Fill, Stroke, Appearance, Effects,
│                   Typography, Transform, Motion, Modes, Export
├── Rows/           Box model, Padding, Margin, Size and aspect ratio, Placement and insets,
│                   Frame size, Layout direction and alignment, Grid tracks, Grid placement,
│                   Line height and letter spacing, Typography preset, Opacity and blend mode,
│                   Stroke, Stroke width, Transform, Spacing fields
├── Lists/          Paint stack, Shadow list, Filter list, Transition list
├── Fields/         Number field, Token length, Color field, Color picker, Angle, Time,
│                   Easing and spring, Expression, Raw CSS value, Select, Keyword sets,
│                   Segments, Icon segments, Switch, Class names, Font family, Weight and style,
│                   Position in a box, Layer order
└── Parts/          Field row, Change mark, Token chip and list, Unit menu, Marks
```

| Today                                        | Moves to                                                |
| -------------------------------------------- | ------------------------------------------------------- |
| Controls › Controls                          | Rows; Component instance and Content fold into Sections |
| Controls › Fields, Controls › Unique         | Fields                                                  |
| Controls › Lists                             | Lists                                                   |
| Inspector › Fields (`chrome/fields.stories`) | Parts › Field row, and Fields                           |
| Inspector › Props, States, Export, Modes     | Sections › Props, States, Export, Modes                 |
| Inspector › Styles                           | Sections › Layout, Size, Fill and the rest, one each    |
| Layer › Basics                               | Sections › Header                                       |
| Layer › Props                                | Sections › Content                                      |
| Layer › Slots                                | Sections › Slots, and Header for Make slot              |
| Layer › States                               | Sections › State selector                               |
| Layer › Instances                            | Layers › Component instance, and Sections › Props       |
| Layer › Kinds, Inspector › Design, Multiple  | Layers                                                  |
| Inspector › Panel, Accessibility             | Panel                                                   |

## Order of work

Each step is its own pull request, and the app looks the same after each.

1. **One field row.** `Field` in `chrome/fields.tsx` and `Field` in `inspector/controls/field-row.tsx` become one, in
   Parts.
2. **One Props section.** `PropsSection` (a code component's instance) and `InstanceSection` (a component design's
   instance, and a design's params) become one Sections › Props, with Attributes beside it.
3. **Sections take the selection.** Each section reads and edits the selection through one hook, so a story draws it
   alone. The `only` parts that stories pass to `LayerPanel` today go.
4. **The table.** `styleParts` becomes `panelParts`, covering every section, with its tests in `@parity-app/editor`.
   `LayerPanel` draws its list.
5. **Stories move,** one level per pull request, from Parts up, deleting each old folder as its stories land.
