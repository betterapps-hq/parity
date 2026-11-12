# Designs and nodes

A project's designs live in `.par` files at its root, as JSON. You change them through `execute`, which validates every
change, so you never edit the files by hand. This is the shape `GetDesign` and `Get` return and `Insert` takes.

## Designs

A design is a screen, a component or a frame, drawn on the canvas as a board of frames: one frame per state and mode it
shows.

| Field     | What it is                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Made from the name when the design is created. Stable; use it in paths.                                                                     |
| `name`    | What people see.                                                                                                                            |
| `kind`    | `screen` (a page or view), `component` (a reusable part that screens place as instances) or `frame` (a sketch; see below).                  |
| `root`    | The design itself: one node, usually a layout.                                                                                              |
| `states`  | Situations the whole design can be in, like loading or empty. The first is the base; the others store only what they change.                |
| `params`  | A component design's inputs, each with a `type` (`text`, `boolean`, `number`, `value`, `variant`) and a `default`. See Params and bindings. |
| `frames`  | A screen's or component's fixed size per viewport, when it isn't as wide as the viewport or as tall as its content.                         |
| `size`    | A frame's own `width` and `height` in pixels. Without a width it's as wide as the primary mode; without a height, as tall as its content.   |
| `view`    | How the canvas shows it: the main mode, the modes beside it, the state and the variant options shown. Not part of the design.               |
| `context` | Components a component design is drawn inside on its own board, such as a table around a table row.                                         |

A frame is the light kind, for sketching: a layout at its root, drawn once in the project's primary mode at its own
`size`, with one state and no `params`, `view` or `frames`. No code is written from it. Make it a screen or a component
to give it more.

## Nodes

Every node has an `id` (given when it's inserted), and can have a `name`, `hidden`, `style` and `responsive`. Name the
layouts that group things ("Header", "Stats", "Actions"): the layers panel, state changes and paths all read better.

### `layout`

A box that lays out its `children`: a flex box by default, or a grid. Most structure is layouts.

```json
{ "type": "layout", "name": "Actions", "style": { "direction": "row", "gap": 2, "justify": "end" }, "children": [] }
```

A layout or text can take accessibility `props`: `role`, `id` and `aria-*`, written on its element as code writes them.
Name what reads wrong to a screen reader, or point `aria-labelledby` at another layer's `id`:

```json
{ "type": "layout", "name": "Chart", "props": { "role": "img", "aria-labelledby": "chart-title" }, "children": [] }
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

A prop that takes a `Date` (a Calendar's `selected`, a date picker's `defaultValue`) is `{ "$date": ... }`, which the
component gets as `new Date(...)` would make it in code. Give a date and time without a zone for a day, since a
date-only string is midnight UTC and lands on the day before west of UTC, as it does in code:

```json
{
  "type": "component",
  "component": "nova/Calendar",
  "props": { "mode": "single", "selected": { "$date": "2026-11-19T00:00:00" } }
}
```

A date can sit inside other values too: `"disabled": { "before": { "$date": "2026-11-12T00:00:00" } }`.

### `instance`

A copy of one of the project's component designs. `design` is the component design's id, `args` give its params values
(an option's id for a variant), and `state` picks which of its states this copy shows.

```json
{ "type": "instance", "design": "stat-card", "args": { "label": "Active users", "value": "1,284" } }
```

`overrides` holds what this copy changes inside the component, keyed by the inner node's id, or `nested/inner` for a
node inside a nested instance. A file keys them by id only; a name there matches nothing. Each is a patch like a state's
(`hidden`, `text`, `props`, `style`). Everything the copy doesn't override keeps following the component.

```json
{ "type": "instance", "design": "stat-card", "overrides": { "trend": { "hidden": true } } }
```

A state's patches can reach inside an instance the same way, keyed `instance/inner`, so one copy can change in one
state.

### `text`

Words. `tag` is `p` (the default), `span`, `h1` to `h4` or `strong`, and sets what the text is, not how it looks; size
and weight come from `style`. A `span` or `strong` given a width, a minimum or maximum, `textAlign` or `lines: 1` is
drawn as a block, so the style works in a component's slot or a table cell too; without them it stays in the line.

```json
{ "type": "text", "tag": "h2", "text": "Recent activity", "style": { "size": "text-lg", "weight": 600 } }
```

An en dash in a table cell reads as "en dash"; give it the words it stands for:
`{ "type": "text", "tag": "span", "text": "–", "props": { "aria-label": "Doesn't apply" } }`.

### `image`

A picture: `src` is a path the project serves (`/images/team.jpg`) or a URL; `alt` describes it, or is empty when it's
decoration; `fit` is `cover` (the default), `contain` or `fill`; `credit` names its maker when a photo asks for it.

### `video`

A video, written as a `<video>`: `src` is a path the project serves (`/videos/waves.mp4`) or a URL; `alt` describes it
for screen readers; `fit` and `credit` work as an image's do. It plays by itself, without sound, round and round, as a
video behind a heading does. `controls: true` shows the browser's controls instead, and it waits to be played.

```json
{ "type": "video", "src": "/videos/waves.mp4", "alt": "Waves at dusk", "style": { "width": "fill", "height": 90 } }
```

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
| `zIndex`                                         | Layer order: a whole number, higher in front, or a z-index token          |
| `background`                                     | A colour token, or a stack of paints (below)                              |
| `foreground`, `border`                           | A colour token                                                            |
| `borderWidth`                                    | Pixels: 0, 1, 2, 4 or 8                                                   |
| `borderStyle`                                    | `solid`, `dashed` or `dotted`                                             |
| `radius`                                         | A radius token, such as `radius-lg`                                       |
| `shadow`                                         | A shadow token, such as `shadow-sm`, or a list of shadows (below)         |
| `opacity`                                        | Percent, 0 to 100                                                         |
| `overflow`                                       | `visible`, `hidden` or `scroll`                                           |
| `filter`, `backdropFilter`                       | A list of filters on the layer, or on what's behind it (below)            |
| `transform`                                      | Move, rotate, scale and skew how the layer is drawn (below)               |
| `font`, `size`, `leading`, `tracking`            | A token, such as `font-mono`, `text-sm`, `leading-tight`, `tracking-wide` |
| `weight`                                         | A number: 400, 500, 600, 700                                              |
| `textAlign`                                      | `start`, `center`, `end` or `justify`                                     |
| `textTransform`, `decoration`, `italic`          | `uppercase` and the like, `underline` or `line-through`, `true`           |
| `lines`                                          | Lines of text before an ellipsis                                          |
| `overflowWrap`                                   | Where a word too long for its line breaks: `anywhere` or `break-word`     |
| `transitions`                                    | How the layer moves when its style changes; see Transitions below         |

Effects stack. `shadow` as a list is drawn top first. Colors there are a color token with an optional `alpha` from 0 to
100:

```json
{
  "shadow": [
    { "kind": "drop", "token": "shadow-md" },
    { "kind": "drop", "x": 0, "y": 4, "blur": 12, "spread": -2, "color": { "color": "foreground", "alpha": 20 } },
    { "kind": "inner", "x": 0, "y": 1, "blur": 2, "spread": 0, "color": { "color": "foreground", "alpha": 10 } },
    { "kind": "ring", "width": 1, "color": { "color": "border" } }
  ],
  "filter": [
    { "kind": "blur", "value": "blur-sm" },
    { "kind": "adjust", "values": { "brightness": 10, "grayscale": 100 } },
    { "kind": "dropShadow", "shadow": { "kind": "drop", "token": "drop-shadow-md" } }
  ],
  "backdropFilter": [{ "kind": "blur", "value": "blur-md" }],
  "transform": { "x": 2, "y": { "percent": -50 }, "rotate": 45, "scaleX": -100, "origin": { "x": 50, "y": 0 } }
}
```

Offsets, blur, spread and a ring's `width` are pixels. Brightness, contrast and saturate are a change from 100, so `10`
is 110%; `hue` is degrees, and grayscale, sepia and invert go from 0 to 100. A transform's `x` and `y` are lengths or a
percentage of the layer's own size; `rotate`, `skewX` and `skewY` are degrees; `scaleX` and `scaleY` are percentages,
negative to flip; `origin` is a point in percent from the top left. Any entry takes `"off": true` to keep it without
drawing it.

A text layer sizes as Figma's text does, by its `width` and `height`: `width: "hug"` is auto width, one line as wide as
its text, wrapped only by a `maxWidth`; any other width, or none, with no `height` is auto height, wrapping at its width
and growing down; a `height` as well is fixed.

A `fill` across the parent with a `maxWidth` takes the parent's width up to that maximum, then sits where `self` or the
parent's `align` puts it, as `w-full max-w-… mx-auto` does: a content column centred at 160 steps is
`{ width: "fill", maxWidth: 160, self: "center" }`, and it still narrows on a phone. `hug` with `self` stays as wide as
its content.

`overflowWrap` breaks a long word, such as a web address, so it stays in its box: `anywhere` also lets a table cell or a
hugging layout narrow to fit it, and `break-word` breaks it only once it can't fit on a line of its own. Set on a
layout, the text inside takes it.

An absolutely placed node with both `left` and `right` and no `width` spans between them, components included, over any
width their own classes give them; `top` and `bottom` with no `height` do the same.

### Fill

`background` is one colour token, or a list of paints, top first, for gradients, images and colours laid over each
other. The bottom paint shows through the ones above where they're transparent. Each paint has a `kind`:

| `kind`                      | Takes                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `solid`                     | `color`, a colour token, and `alpha`, 0 to 100                                          |
| `linear`, `radial`, `conic` | `stops`: two or more of `{ color, alpha, position }`, position in %; `angle` in degrees |
|                             | (linear's direction, 180 is down; conic's start), `center` `[x, y]` in %, `repeat`      |
| `gradient`                  | `token`: a gradient token from `GetTokens()`                                            |
| `image`                     | `src`, a file in the project; `fit`: `fill`, `fit`, `crop` (at `scale` %) or `tile`;    |
|                             | `position` `[x, y]` in %                                                                |

Any paint takes `hidden: true` to keep it without drawing it. Prefer a gradient token to stops of your own.

```json
{
  "background": [
    {
      "kind": "linear",
      "angle": 180,
      "stops": [
        { "color": "primary", "alpha": 0, "position": 0 },
        { "color": "primary", "position": 100 }
      ]
    },
    { "kind": "image", "src": "/images/hero.jpg", "fit": "fill" },
    { "kind": "solid", "color": "muted" }
  ]
}
```

Type set on a layout applies to the text inside it. A component's own look comes from its props, so reach for a variant
(`variant: "secondary"`) before styling a component from outside.

### Transitions

`transitions` is a list, each entry how some properties change when the layer's style does. A board switching to a state
plays them, so put them on the base and let the state change the look:

```json
{ "style": { "transitions": [{ "property": "colors", "duration": 200, "easing": "ease-out" }] } }
```

| Field      | Takes                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `property` | `all`, `colors`, `opacity`, `transform` or `shadow`, as Tailwind's `transition-*`, or a CSS property (`width`) |
| `duration` | Milliseconds, or a duration token; Tailwind's 150ms when unset                                                 |
| `delay`    | Milliseconds, or a duration token                                                                              |
| `easing`   | `linear`, `ease-in`, `ease-out`, `ease-in-out`, an easing token, `cubic-bezier(…)` or `steps(…)`               |
| `hidden`   | `true` keeps the entry without playing it                                                                      |

`easing` can also be a spring, `{ "spring": { "duration": 400, "bounce": 0.3 } }` or
`{ "spring": { "stiffness": 300, "damping": 20, "mass": 1 } }`, whose settle time is the transition's duration.

## States

A state's `overrides` map node ids to patches of `hidden`, `text`, `props` and `style`. A node a state doesn't mention
looks as it does in the base. States win over responsive patches.

A patch can also take values away with `unset`, which lists prop names and style keys to drop from what's under it, so a
state can turn off a prop the base sets or leave a layout without the base's gap:

```json
{ "fields": { "style": { "padding": 4 }, "unset": { "style": ["gap"], "props": ["disabled"] } } }
```

A key a patch sets isn't also in its `unset`. Taking away an instance's param value gives the param its default.

## Responsive

A node's `responsive` maps a viewport option's id (such as `tablet` or `mobile`) to a patch of the same four things,
applied in every mode on that viewport:

```json
{ "name": "Sidebar", "type": "instance", "design": "app-sidebar", "responsive": { "mobile": { "hidden": true } } }
```

## Params and bindings

Inside a component design, a node's `bind` takes its values from the component's params, so each instance shows its own:
`bind.text` names a text param, `bind.props` maps a prop to a param, and `bind.visible` names a boolean param that shows
or hides the node. `ExtractComponent` sets all of this up from the occurrences it replaces; for a component built once,
`CreateDesign` takes `params` and `AddParam` adds one (see execute.md).

```json
{ "type": "text", "text": "Revenue", "bind": { "text": "label" } }
```

A **variant** is a param whose `options` each patch the component design, the way a state does: a size or a tone the
instance chooses. Its `default` is an option's id, else the first option. An instance picks one in its `args`, and
`view.variants` picks which one the component's own board shows. Patches apply in this order: the viewport's, the
variant options', the state's, then the instance's overrides. `Get` returns the stored node, with the text it was given;
`Get(path, { state })` returns it as the board shows it, the param's value filled in and `bind` kept (see execute.md).

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
