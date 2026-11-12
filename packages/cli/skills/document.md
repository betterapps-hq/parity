# Designs and nodes

A project's designs live in `.par` files at its root, as JSON. You change them through `execute`, which validates every
change, so you never edit the files by hand. This is the shape `GetDesign` and `Get` return and `Insert` takes.

## Designs

A design is a screen, a component or a frame, drawn on the canvas as a board of frames: one frame per mode it shows, and
for a component, per state.

| Field     | What it is                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Made from the name when the design is created. Stable; use it in paths.                                                                     |
| `name`    | What people see.                                                                                                                            |
| `kind`    | `screen` (a page or view), `component` (a reusable part that screens place as instances) or `frame` (a sketch; see below).                  |
| `root`    | The design itself: one node, usually a layout.                                                                                              |
| `states`  | A component's variations, like loading or empty. The first is the base; the others store only what they change. Only a component has them.  |
| `params`  | A component design's inputs, each with a `type` (`text`, `boolean`, `number`, `value`, `variant`) and a `default`. See Params and bindings. |
| `frames`  | A screen's or component's fixed size per viewport, when it isn't as wide as the viewport or as tall as its content.                         |
| `size`    | A frame's own `width` and `height` in pixels. Without a width it's as wide as the primary mode; without a height, as tall as its content.   |
| `view`    | How the canvas shows it: the main mode, the modes beside it, a component's state and variant options shown. Not part of the design.         |
| `context` | Components a component design is drawn inside on its own board, such as a table around a table row.                                         |

A frame is the light kind, for sketching: a layout at its root, drawn once in the project's primary mode at its own
`size`, with no `states`, `params`, `view` or `frames`. No code is written from it. Make it a screen or a component to
give it more.

## Nodes

Every node has an `id` (given when it's inserted), and can have a `name`, `hidden`, `style` and `responsive`. Name the
layouts that group things ("Header", "Stats", "Actions"): the layers panel, state changes and paths all read better.

### `layout`

A box that lays out its `children`: a flex box by default, or a grid. Most structure is layouts.

```json
{
  "type": "layout",
  "name": "Actions",
  "style": { "flexDirection": "row", "gap": { "step": 2 }, "justifyContent": "end" },
  "children": []
}
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
(an option's id for a variant). A copy shows its component's base state; to make one look another way, set a variant.

```json
{ "type": "instance", "design": "stat-card", "args": { "label": "Active users", "value": "1,284" } }
```

`overrides` holds what this copy changes inside the component, keyed by the inner node's id, or `nested/inner` for a
node inside a nested instance. A file keys them by id only; a name there matches nothing. Each is a patch like a state's
(`hidden`, `text`, `props`, `style`). Everything the copy doesn't override keeps following the component.

```json
{ "type": "instance", "design": "stat-card", "overrides": { "trend": { "hidden": true } } }
```

A component's state can reach inside an instance it places the same way, keyed `instance/inner`, so one copy can change
in one state.

### `text`

Words. `tag` is `p` (the default), `span`, `h1` to `h4` or `strong`, and sets what the text is, not how it looks; size
and weight come from `style`. A `span` or `strong` given a width, a minimum or maximum, `textAlign` or `lineClamp: 1` is
drawn as a block, so the style works in a component's slot or a table cell too; without them it stays in the line.

```json
{
  "type": "text",
  "tag": "h2",
  "text": "Recent activity",
  "style": { "fontSize": { "token": "text-lg" }, "fontWeight": { "value": 600 } }
}
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
{
  "type": "video",
  "src": "/videos/waves.mp4",
  "alt": "Waves at dusk",
  "style": { "width": { "size": "fill" }, "height": { "step": 90 } }
}
```

## Style

A style key is named after the CSS property it writes, in camelCase, and a value says which form it is, so
`{ "token": "auto" }` is a token named auto and `{ "keyword": "auto" }` is CSS's word. Reach for the project's tokens
first: `GetTokens()` lists them, named without the `--`.

### Value forms

| Form                                   | Is                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `{ "step": 4 }`                        | Steps of the key's scale: the spacing scale for a length (4 is 1rem in a default |
|                                        | Tailwind project), milliseconds for a time, a whole number for `zIndex`          |
| `{ "token": "radius-lg" }`             | One of the project's tokens                                                      |
| `{ "value": "280px" }`                 | A value as CSS writes it, with its unit: `50%`, `#2563eb`, `1.4`                 |
| `{ "keyword": "auto" }`                | One of CSS's own words for the property: `auto`, `currentColor`                  |
| `{ "expr": "clamp(1rem, 2vw, 2rem)" }` | A CSS expression: `clamp()`, `calc()`, `min()`                                   |

Each kind of value takes some of them:

| Kind        | Takes                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Length      | Any form. Steps and length tokens keep a design on the project's scale                                    |
| Size        | A length, `{ "size": "fill" }` (take the room the parent gives) or `{ "size": "hug" }` (fit the content). |
|             | Beside other fills, `{ "size": "fill", "share": 2 }` takes twice the room                                 |
| Color       | `token` or `value`, each with an optional `alpha`; `keyword`; `expr`. `alpha` is `{ "step": 50 }` for     |
|             | 50%, `{ "value": 0.5 }` or an opacity token: `{ "token": "primary", "alpha": { "step": 50 } }`            |
| Named value | `token`, `value`, `keyword` or `expr`: a radius, a font, a font size, a letter spacing                    |
| Opacity     | `{ "step": 50 }` for 50%, `{ "value": 0.5 }` or an opacity token                                          |
| Number      | A plain number in the key's one unit: `scale` in %, `rotate` in degrees, `lineClamp`, `colSpan`,          |
|             | `rowSpan`                                                                                                 |

A `value` where a token goes (a color, `borderRadius`, `fontFamily`, `fontSize`, `lineHeight`, `letterSpacing`) is drawn
as written and gets a `not_a_token` warning, since it leaves the project's tokens. A `value`, `keyword` or `expr` its
CSS property doesn't take gets `invalid_value`. Both are in execute.md, under Modes and tokens.

### Keys

| Key                                              | Takes                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `display`                                        | `flex` (the default) or `grid`                                                |
| `flexDirection`                                  | `column` (the default) or `row`                                               |
| `gridTemplateColumns`, `gridTemplateRows`        | A grid's tracks, as a list: `{ "fr": 1 }` shares the room left, or a length.  |
|                                                  | A grid without columns has two equal ones                                     |
| `gap`, `rowGap`                                  | A length                                                                      |
| `padding`, `margin`                              | A length, `[vertical, horizontal]` or `[top, right, bottom, left]`            |
| `alignItems`                                     | Children across: `start`, `center`, `end`, `stretch`                          |
| `justifyContent`                                 | Children along: `start`, `center`, `end`, `space-between`, `space-around`,    |
|                                                  | `space-evenly`                                                                |
| `flexWrap`                                       | `wrap` to wrap a row; `nowrap` in a patch takes a wrap off                    |
| `width`, `height`                                | A size                                                                        |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | A length                                                                      |
| `grow`                                           | `true` to fill along the parent's direction                                   |
| `alignSelf`                                      | This node across its parent, overriding the parent's `alignItems`             |
| `colSpan`, `rowSpan`                             | Grid cells to span                                                            |
| `position`, `top`, `right`, `bottom`, `left`     | `absolute`, placed against the parent's edges by lengths                      |
| `zIndex`                                         | Layer order: `{ "step": 10 }`, a whole number, higher in front, or a z-index  |
|                                                  | token                                                                         |
| `fills`                                          | A list of paints, top first; see Fill below                                   |
| `color`                                          | Text's color                                                                  |
| `borderColor`                                    | A color                                                                       |
| `borderWidth`                                    | Whole pixels, `{ "step": 2 }` (0, 1, 2, 4 or 8), or a border width token      |
| `borderStyle`                                    | `solid`, `dashed` or `dotted`                                                 |
| `borderRadius`                                   | A named value, such as `{ "token": "radius-lg" }`                             |
| `boxShadow`                                      | A list of shadows, top first; see Effects below                               |
| `opacity`                                        | An opacity: `{ "step": 50 }` is 50%                                           |
| `overflow`                                       | `visible`, `hidden` or `auto`, which scrolls what doesn't fit                 |
| `filter`, `backdropFilter`                       | A list of filters on the layer, or on what's behind it; see Effects below     |
| `translate`, `rotate`, `scale`, `transform`,     | Move, turn, resize and skew how the layer is drawn; see Effects below         |
| `transformOrigin`                                |                                                                               |
| `fontFamily`, `fontSize`, `letterSpacing`        | A named value, such as `{ "token": "font-mono" }`, `text-sm`, `tracking-wide` |
| `lineHeight`                                     | A named value, such as `{ "token": "leading-tight" }`, or `{ "step": 6 }`     |
| `fontWeight`                                     | `{ "value": 600 }` (400, 500, 600, 700), or a font weight token               |
| `textAlign`                                      | `start`, `center`, `end` or `justify`                                         |
| `textTransform`                                  | `uppercase`, `lowercase` or `capitalize`                                      |
| `textDecorationLine`                             | `underline` or `line-through`                                                 |
| `fontStyle`                                      | `italic`; `normal` in a patch takes italic off                                |
| `lineClamp`                                      | Lines of text before an ellipsis                                              |
| `overflowWrap`                                   | Where a word too long for its line breaks: `anywhere` or `break-word`         |
| `transition`                                     | How the layer moves when its style changes; see Transitions below             |
| `css`                                            | Declarations for CSS properties no key above writes; see The CSS map below    |

A grid whose first column is a fixed sidebar and whose other two share the rest:

```json
{
  "display": "grid",
  "gridTemplateColumns": [{ "step": 60 }, { "fr": 1 }, { "fr": 1 }],
  "gap": { "step": 6 },
  "padding": [{ "step": 8 }, { "token": "gutter" }]
}
```

A text layer sizes as Figma's text does, by its `width` and `height`: `{ "size": "hug" }` for `width` is auto width, one
line as wide as its text, wrapped only by a `maxWidth`; any other width, or none, with no `height` is auto height,
wrapping at its width and growing down; a `height` as well is fixed.

A fill across the parent with a `maxWidth` takes the parent's width up to that maximum, then sits where `alignSelf` or
the parent's `alignItems` puts it, as `w-full max-w-… mx-auto` does: a content column centred at 160 steps is
`{ "width": { "size": "fill" }, "maxWidth": { "step": 160 }, "alignSelf": "center" }`, and it still narrows on a phone.
A hug with `alignSelf` stays as wide as its content.

`overflowWrap` breaks a long word, such as a web address, so it stays in its box: `anywhere` also lets a table cell or a
hugging layout narrow to fit it, and `break-word` breaks it only once it can't fit on a line of its own. Set on a
layout, the text inside takes it.

`position` takes only `absolute`, which places the node against its parent's edges; the parent needs nothing set,
because every layout is a positioning context. An absolutely placed node with both `left` and `right` and no `width`
spans between them, components included, over any width their own classes give them; `top` and `bottom` with no `height`
do the same.

Type set on a layout applies to the text inside it. A component's own look comes from its props, so reach for a variant
(`variant: "secondary"`) before styling a component from outside.

### Fill

`fills` is a list of paints, top first, for colors, gradients and images laid over each other; one color is a list of
one solid paint. The bottom paint shows through the ones above where they're transparent. Each paint has a `type`:

| `type`                      | Takes                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `solid`                     | `color`, a color                                                                     |
| `linear`, `radial`, `conic` | `stops`: two or more of `{ color, position }`, position in %; `angle` in degrees     |
|                             | (linear's direction, 180 is down; conic's start), `center` `[x, y]` in %, `repeat`   |
| `gradient`                  | `token`: a gradient token from `GetTokens()`                                         |
| `image`                     | `src`, a file in the project; `fit`: `fill`, `fit`, `crop` (at `scale` %) or `tile`; |
|                             | `position` `[x, y]` in %                                                             |

Any paint takes `"off": true` to keep it without drawing it. Prefer a gradient token to stops of your own.

```json
{
  "fills": [
    {
      "type": "linear",
      "angle": 180,
      "stops": [
        { "color": { "token": "primary", "alpha": { "step": 0 } }, "position": 0 },
        { "color": { "token": "primary" }, "position": 100 }
      ]
    },
    { "type": "image", "src": "/images/hero.jpg", "fit": "fill" },
    { "type": "solid", "color": { "token": "muted" } }
  ]
}
```

### Effects

`boxShadow`, `filter` and `backdropFilter` are lists whose entries each have a `type`; shadows are drawn top first, and
filters apply in order. The transform is five keys, which CSS applies as `translate`, `rotate`, `scale`, then
`transform`:

```json
{
  "boxShadow": [
    { "type": "drop", "token": "shadow-md" },
    {
      "type": "drop",
      "x": 0,
      "y": 4,
      "blur": 12,
      "spread": -2,
      "color": { "token": "foreground", "alpha": { "step": 20 } }
    },
    { "type": "inner", "token": "inset-shadow-sm" },
    { "type": "ring", "width": 1, "color": { "token": "border" } }
  ],
  "filter": [
    { "type": "blur", "value": { "token": "blur-sm" } },
    { "type": "adjust", "values": { "brightness": 10, "grayscale": 100 } },
    { "type": "dropShadow", "shadow": { "type": "drop", "token": "drop-shadow-md" } }
  ],
  "backdropFilter": [{ "type": "blur", "value": { "token": "blur-md" } }],
  "translate": { "x": { "step": 2 }, "y": { "value": "-50%" } },
  "rotate": 45,
  "scale": { "x": -100 },
  "transform": [{ "type": "skewX", "value": 10 }],
  "transformOrigin": { "x": 50, "y": 0 }
}
```

| Entry or key           | Takes                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `drop`, `inner` shadow | `token`, a shadow token, with an optional `color` to recolor it; or `x`, `y`, `blur` and |
|                        | `spread` in pixels with a `color`                                                        |
| `ring` shadow          | `width` in pixels and a `color`; `"inset": true` draws it inside the box                 |
| `blur` filter          | `value`: a blur token, `{ "value": "4px" }` or an `expr`                                 |
| `adjust` filter        | `values`: `brightness`, `contrast` and `saturate` as a change from 100, so `10` is 110%; |
|                        | `hue` in degrees; `grayscale`, `sepia` and `invert` from 0 to 100                        |
| `dropShadow` filter    | `shadow`, a drop shadow that follows what's drawn rather than the box; `filter` only     |
| `translate`            | `x` and `y`, each a length; a percentage is of the layer's own size                      |
| `rotate`               | Degrees, clockwise                                                                       |
| `scale`                | `x` and `y` in %, 100 when unset, negative to flip                                       |
| `transform`            | A list of `{ "type": "skewX" }` or `skewY` with a `value` in degrees, applied in order   |
| `transformOrigin`      | `x` and `y` in % from the layer's top left; its center when unset                        |

Any list entry takes `"off": true` to keep it without drawing it.

### Transitions

`transition` is a list, each entry how some properties change when the layer's style does. A board switching to a state
plays them, so put them on the base and let the state change the look:

```json
{
  "style": {
    "transition": [{ "property": "colors", "duration": { "step": 200 }, "easing": { "keyword": "ease-out" } }]
  }
}
```

| Field      | Takes                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `property` | `all`, `colors`, `opacity`, `transform` or `shadow`, as Tailwind's `transition-*`, or a CSS property (`width`) |
| `duration` | `{ "step": 200 }` in milliseconds, or a duration token; Tailwind's 150ms when unset                            |
| `delay`    | As `duration`                                                                                                  |
| `easing`   | `{ "keyword": … }` with `linear`, `ease-in`, `ease-out` or `ease-in-out`; an easing token; `{ "value": … }`    |
|            | with `cubic-bezier(…)` or `steps(…)`; or a spring. Tailwind's default curve when unset                         |
| `off`      | `true` keeps the entry without playing it                                                                      |

A spring is `{ "spring": { "duration": 400, "bounce": 0.3 } }` or
`{ "spring": { "stiffness": 300, "damping": 20, "mass": 1 } }`, whose settle time is the transition's duration.

### The CSS map

`css` holds declarations for the CSS properties no key writes, by property name as CSS spells it. Use it when a design
needs one of those: scroll snapping, `aspect-ratio`, `mix-blend-mode`, a custom property for a component to read.

```json
{
  "flexDirection": "row",
  "overflow": "auto",
  "css": {
    "scroll-snap-type": { "value": "x mandatory" },
    "--card-accent": { "value": "var(--primary)" }
  }
}
```

A value is CSS as written, naming a token as `var(--primary)`. A property a key writes belongs to that key, so
`"css": { "gap": … }` is refused with the key's name: set `gap`. Reach for a key and a token first; the map draws what
they can't. A declaration takes `"off": true` to keep it without drawing it, and a value its property doesn't take gets
an `invalid_value` warning.

## States

Only a component has states. A state's `overrides` map node ids to patches of `hidden`, `text`, `props` and `style`. A
node a state doesn't mention looks as it does in the base. States win over responsive patches.

A patch can also take values away with `unset`, which lists prop names and style keys to drop from what's under it, so a
state can turn off a prop the base sets or leave a layout without the base's gap:

```json
{ "fields": { "style": { "padding": { "step": 4 } }, "unset": { "style": ["gap"], "props": ["disabled"] } } }
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
`bind.text` names a text param and `bind.props` maps a prop to a param. Whether a node shows isn't bound: hide it in a
state or a variant option, or with an instance's override. `ExtractComponent` sets all of this up from the occurrences
it replaces; for a component built once, `CreateDesign` takes `params` and `AddParam` adds one (see execute.md).

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
      { "id": "small", "name": "Small", "overrides": { "card": { "style": { "padding": { "step": 3 } } } } }
    ]
  }
}
```
