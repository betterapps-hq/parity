# Proposal: which layers get which controls (PAR-892)

Agreed on 2026-11-11 ([decisions.md](../decisions.md)).

PAR-186 settled every styling control in Storybook. PAR-892 builds them into the Design tab. This page proposes the one
table that picks a layer's sections and controls, and the order to build them in. It updates the table in
[design-options-panel.md](design-options-panel.md), Which layers get which sections, which predates video layers, frame
roots and the approved controls.

## What a layer can do

The panel stops asking what type a node is. It works out what the selected layer can do, once, from the design and the
selection, in `@parity-app/editor`:

| Capability   | True when                                                                           |
| ------------ | ----------------------------------------------------------------------------------- |
| `box`        | It's a layout: a flex or grid box with children of its own                          |
| `root`       | It's a screen's or component design's outermost layout                              |
| `frame`      | It's a frame's root, which sizes the frame                                          |
| `text`       | It's a text layer                                                                   |
| `textInside` | It's a layout, a component or an instance, whose text inherits what it sets         |
| `media`      | It's an image or a video                                                            |
| `inFlex`     | Its parent is a flex layout                                                         |
| `inGrid`     | Its parent is a grid                                                                |
| `styled`     | It takes style: every layer except a code component whose props take no `className` |

With several layers selected, a capability holds when it holds for every one, except `text`, which holds for the text
layers of a mixed selection, as Resizing does today.

## Layer kinds

| Layer                           | Capabilities                                                     |
| ------------------------------- | ---------------------------------------------------------------- |
| Screen or component design root | `box`, `root`, `textInside`, `styled`                            |
| Frame root                      | `box`, `root`, `frame`, `textInside`, `styled`                   |
| Layout                          | `box`, `textInside`, `styled`, and its parent's                  |
| Text                            | `text`, `styled`, and its parent's                               |
| Image or video                  | `media`, `styled`, and its parent's                              |
| Code component                  | `textInside`, its parent's, and `styled` if it takes `className` |
| Instance of a component design  | `textInside`, `styled`, and its parent's                         |

"Its parent's" is `inFlex` or `inGrid`.

## Sections and what they need

Each section and each conditional control states what it needs, as one line in the table. The panel shows the ones that
match, in this order. Every section needs `styled`.

| Section               | Needs                  | Controls (from PAR-186's stories)                                                                                           |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Frame size            | `frame`                | W with breakpoints, H with Hug                                                                                              |
| Placement and insets  | not `root`             | Position (in flow, absolute, fixed, sticky, relative), the pin box, insets                                                  |
| Layer order           | not `root`             | z-index                                                                                                                     |
| Size and aspect ratio | not `frame`            | W and H with the Sizing menu (Fill needs `inFlex`, `inGrid` or `box`), min and max, aspect ratio; align self needs `inFlex` |
| Grid placement        | `inGrid`               | Span, start and end lines, align and justify self                                                                           |
| Layout                | `box`                  | Direction, wrap, alignment, gap, grid tracks                                                                                |
| Spacing               | none                   | The box model: padding, and margin when not `root`                                                                          |
| Appearance            | none                   | Opacity, blend mode, radius and corner shape, clip, cursor                                                                  |
| Text                  | `text` or `textInside` | Preset, font, weight, size, line height, letter spacing, align, case, wrap; tag and max lines need `text`                   |
| Fill                  | none                   | The paint stack: colors, gradients and images                                                                               |
| Stroke                | none                   | Color, width per side, style, position                                                                                      |
| Effects               | none                   | Shadows, blurs and filters, transform                                                                                       |
| Motion                | none                   | Transitions with time and easing                                                                                            |
| Raw CSS               | none                   | Properties the sections don't cover                                                                                         |

An image's or video's own section (file, alt text, fit, playback) stays where it is, above the style sections. Unit
tests check, for each layer kind, which sections and conditional controls show.

## What the document doesn't hold yet

`NodeStyle` in `@parity-app/core` holds one background, one shadow and one border width, and `position` is only
`absolute`. Most approved controls write something it can't hold yet:

| Section              | Missing from `NodeStyle`                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| Placement and insets | `position`: fixed, sticky, relative                                                     |
| Layer order          | z-index                                                                                 |
| Size                 | Aspect ratio                                                                            |
| Grid placement       | Start and end lines, justify self                                                       |
| Layout               | Reverse, distribute, dense flow, auto rows, items alignment                             |
| Appearance           | Blend mode, corner shape, cursor                                                        |
| Text                 | Wrap, the preset; the tag is HTML, so it's the node's, not its style's                  |
| Fill                 | A stack of paints in place of one background                                            |
| Stroke               | Width per side, style per side, position (outline and offset)                           |
| Effects              | A stack of shadows, blurs and filters, and transform (today's `transform` is text case) |
| Motion               | Transitions                                                                             |
| Raw CSS              | Other properties                                                                        |

Each needs the schema, the Tailwind and CSS it writes, reading it back from code, and the agent's tools taking it.

## Order of work

PAR-892 is too large for one pull request, so it's split, each its own issue and pull request:

1. **Foundation (PAR-892).** The controls move from `explorations/styling-controls/` to `inspector/controls/` in one go,
   with their stories under `Parity/Inspector/Controls`, since the shared parts and the stand-in tokens they fall back
   on are tangled. Field names its control. The capability table drives today's sections.
2. **Sections the document already holds:** Layout, Size, Spacing, Placement and insets (absolute), Appearance (opacity,
   radius, clip), Stroke (one width), and Text, on the shared parts, replacing today's inputs.
3. **One issue per row of the table above:** the property in `NodeStyle`, what it writes and reads back, the agent's
   tools, and its controls in the panel.
4. **The stand-ins go** once every control edits the document: the draft models, stand-in tokens and playground.
