# Designs and nodes

A project's designs live in `.par` files at its root, as JSON. You change them through `execute`, which validates every
change, so you never edit the files by hand. This is the shape `GetDesign` and `Get` return and `Insert` takes.

## Designs

A design is a screen or a component, drawn on the canvas as a board of frames: one frame per state and mode it shows.

| Field     | What it is                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Made from the name when the design is created. Stable; use it in paths.                                                                     |
| `name`    | What people see.                                                                                                                            |
| `kind`    | `screen` (a page or view) or `component` (a reusable part that screens place as instances).                                                 |
| `root`    | The design itself: one node, usually a layout.                                                                                              |
| `states`  | Situations the whole design can be in, like loading or empty. The first is the base; the others store only what they change.                |
| `params`  | A component design's inputs, each with a `type` (`text`, `boolean`, `number`, `value`, `variant`) and a `default`. See Params and bindings. |
| `frames`  | A fixed size per viewport, when the design isn't as wide as the viewport or as tall as its content.                                         |
| `view`    | How the canvas shows it: the main mode, the modes beside it, the state and the variant options shown. Not part of the design.               |
| `context` | Components a component design is drawn inside on its own board, such as a table around a table row.                                         |

## Nodes

Every node has an `id` (given when it's inserted), and can have a `name`, `hidden`, `style` and `responsive`. Name the
layouts that group things ("Header", "Stats", "Actions"): the layers panel, state changes and paths all read better.

### `layout`

A box that lays out its `children`: a flex box by default, or a grid. Most structure is layouts.

```json
{ "type": "layout", "name": "Actions", "style": { "direction": "row", "gap": 2, "justify": "end" }, "children": [] }
```

### `component`

One of the project's components. `component` is a name from `Components()`; `props` are its props; `slots` hold child
nodes, where `children` is what goes between its tags and any other slot becomes a prop that takes nodes.

```json
{
  "type": "component",
  "component": "Button",
  "props": { "variant": "outline", "size": "sm" },
  "slots": {
    "children": [
      { "type": "component", "component": "lucide/Download" },
      { "type": "text", "text": "Export" }
    ]
  }
}
```

Text that's only a component's label can be its `children` prop instead: `"props": { "children": "Export" }`.

### `instance`

A copy of one of the project's component designs. `design` is the component design's id, `args` give its params values
(an option's id for a variant), and `state` picks which of its states this copy shows.

```json
{ "type": "instance", "design": "stat-card", "args": { "label": "Active users", "value": "1,284" } }
```

`overrides` holds what this copy changes inside the component, keyed by the inner node's id, or `nested/inner` for a
node inside a nested instance. Each is a patch like a state's (`hidden`, `text`, `props`, `style`). Everything the copy
doesn't override keeps following the component.

```json
{ "type": "instance", "design": "stat-card", "overrides": { "trend": { "hidden": true } } }
```

A state's patches can reach inside an instance the same way, keyed `instance/inner`, so one copy can change in one
state.

### `text`

Words. `tag` is `p` (the default), `span`, `h1` to `h4` or `strong`, and sets what the text is, not how it looks; size
and weight come from `style`.

```json
{ "type": "text", "tag": "h2", "text": "Recent activity", "style": { "size": "text-lg", "weight": 600 } }
```

### `image`

A picture: `src` is a path the project serves (`/images/team.jpg`) or a URL; `alt` describes it, or is empty when it's
decoration; `fit` is `cover` (the default), `contain` or `fill`; `credit` names its maker when a photo asks for it.

## Style

Every value comes from the project. Lengths are steps of the spacing scale or the name of a length token; colours and
type name a token from `GetTokens()`, without the `--`.

| Key                                              | Takes                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `display`                                        | `flex` (the default) or `grid`                                            |
| `direction`                                      | `column` (the default) or `row`                                           |
| `columns`, `rows`                                | A grid's column or row count; all the same size                           |
| `gap`, `rowGap`                                  | A length                                                                  |
| `padding`, `margin`                              | A length, `[vertical, horizontal]` or `[top, right, bottom, left]`        |
| `align`                                          | Children across: `start`, `center`, `end`, `stretch`                      |
| `justify`                                        | Children along: `start`, `center`, `end`, `between`, `around`, `evenly`   |
| `wrap`                                           | `true` to wrap a row                                                      |
| `width`, `height`                                | A length, `fill` (take the room the parent gives) or `hug` (fit content)  |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | A length                                                                  |
| `grow`                                           | `true` to fill along the parent's direction                               |
| `self`                                           | This node across its parent, overriding the parent's `align`              |
| `colSpan`, `rowSpan`                             | Grid cells to span                                                        |
| `position`, `top`, `right`, `bottom`, `left`     | `absolute`, placed against the parent's edges by lengths                  |
| `background`, `foreground`, `border`             | A colour token                                                            |
| `borderWidth`                                    | Pixels: 0, 1, 2, 4 or 8                                                   |
| `borderStyle`                                    | `solid`, `dashed` or `dotted`                                             |
| `radius`, `shadow`                               | A radius or shadow token, such as `radius-lg` or `shadow-sm`              |
| `opacity`                                        | Percent, 0 to 100                                                         |
| `overflow`                                       | `visible`, `hidden` or `scroll`                                           |
| `font`, `size`, `leading`, `tracking`            | A token, such as `font-mono`, `text-sm`, `leading-tight`, `tracking-wide` |
| `weight`                                         | A number: 400, 500, 600, 700                                              |
| `textAlign`                                      | `start`, `center`, `end` or `justify`                                     |
| `transform`, `decoration`, `italic`              | `uppercase` and the like, `underline` or `line-through`, `true`           |
| `lines`                                          | Lines of text before an ellipsis                                          |

Type set on a layout applies to the text inside it. A component's own look comes from its props, so reach for a variant
(`variant: "secondary"`) before styling a component from outside.

## States

A state's `overrides` map node ids to patches of `hidden`, `text`, `props` and `style`. A node a state doesn't mention
looks as it does in the base. States win over responsive patches.

## Responsive

A node's `responsive` maps a viewport option's id (such as `tablet` or `mobile`) to a patch of the same four things,
applied in every mode on that viewport:

```json
{ "name": "Sidebar", "type": "instance", "design": "app-sidebar", "responsive": { "mobile": { "hidden": true } } }
```

## Params and bindings

Inside a component design, a node's `bind` takes its values from the component's params, so each instance shows its own:
`bind.text` names a text param, `bind.props` maps a prop to a param, and `bind.visible` names a boolean param that shows
or hides the node. `ExtractComponent` sets all of this up from the occurrences it replaces.

```json
{ "type": "text", "text": "Revenue", "bind": { "text": "label" } }
```

A **variant** is a param whose `options` each patch the component design, the way a state does: a size or a tone the
instance chooses. Its `default` is an option's id, else the first option. An instance picks one in its `args`, and
`view.variants` picks which one the component's own board shows. Patches apply in this order: the viewport's, the
variant options', the state's, then the instance's overrides.

```json
"params": {
  "size": {
    "type": "variant",
    "default": "medium",
    "options": [
      { "id": "medium", "name": "Medium" },
      { "id": "small", "name": "Small", "overrides": { "card": { "style": { "padding": 3 } } } }
    ]
  }
}
```
