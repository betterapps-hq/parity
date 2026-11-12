# Proposal: the style package (PAR-938)

Agreed on 2026-11-11 ([decisions.md](../decisions.md)). Steps 1, 2 and 5 are built: the package holds the stored style
and `declarations`, which render calls (PAR-939), the ledger and `validate` (PAR-940), and the adapter contract, which
`@parity-app/styles-tailwind` implements (PAR-943). The rest isn't built yet. It sets where the rules for what a layer's
style means live, so the canvas, Copy as code, writing components (PAR-265) and reading code back all follow one set.

## In one line

A new pure package, `@parity-app/style`, owns the translation layer: a layer's style becomes CSS declarations, by the
CSS spec, and each framework's adapter turns declarations into its own code and back. CSS is the spec in the middle;
Tailwind is one adapter, not the model.

```text
style (in the .par file)
  → declarations              # @parity-app/style: what the style means, in CSS's own terms
      → canvas rules          # what a frame draws
      → Tailwind classes      # @parity-app/styles-tailwind
      → plain CSS rules       # projects without Tailwind
  ← declarations              # each adapter reads its code back
← style                       # @parity-app/style: back into keys, or into the CSS map
```

## Why

**`NodeStyle` is Parity's own schema, not a spec.** It mixes three vocabularies, and some names mean something else in
CSS:

| Key today    | Vocabulary | What it is in CSS                                     |
| ------------ | ---------- | ----------------------------------------------------- |
| `transform`  | none       | `text-transform`, not `transform`                     |
| `self`       | none       | `align-self`                                          |
| `size`       | none       | `font-size`                                           |
| `leading`    | Tailwind   | `line-height`                                         |
| `tracking`   | Tailwind   | `letter-spacing`                                      |
| `justify`    | Tailwind   | `justify-content`, with `between` for `space-between` |
| `foreground` | shadcn     | `color`                                               |
| `border`     | none       | `border-color`                                        |
| `columns`    | Figma      | a count of equal tracks, not `grid-template-columns`  |
| `grow`       | Figma      | `flex-grow`, part of Fill                             |

**What a style means is decided in three places that can disagree:**

- `packages/core/src/render.ts` turns a style into inline CSS for the canvas.
- The stand-in writers in `apps/desktop/src/renderer/inspector/controls/` (`lists-writes.ts`, `text-writes.ts`,
  `css-values.ts`) turn the controls' drafts into Tailwind classes for their previews.
- [design-options-code.md](design-options-code.md) describes, in prose, the Tailwind each value writes and how it reads
  back.

Nothing checks that the three agree, and a project without Tailwind has only the first.

## What's already decided

This page builds on decisions it doesn't reopen:

- **One stored key per CSS property** (call 4 of PAR-652, [decisions.md](../decisions.md)): a property is owned by one
  key, and the CSS map holds the rest.
- **A layer can hold its own values, checked before they're stored** (call 1 of PAR-652): a typed value must parse as
  its type and be one the browser accepts for the property.
- **Not every project uses Tailwind, and the panel mustn't overfit to it** (call 7 of PAR-652). PAR-708 maps the
  overlaps between frameworks and picks the first-class concepts, with Tailwind's output as one adapter's.

[design-options-code.md](design-options-code.md) already proposes the stored model: keys renamed after the CSS property
they write, lists named for their property (`boxShadow`, `filter`, `fills`), each value stored with its form (`token`,
`value`, `step`, `keyword`, `expr`, `size`), and a CSS map. This page adopts that model and says where it lives and how
it's checked. Its Tailwind sections become the Tailwind adapter's specification.

## The package

`@parity-app/style` is pure, as [packages.md](packages.md) sets out: it takes data and returns data, with no Node, React
or Electron, and its tests run on their own.

```text
packages/style/src/
├── model.ts        # the stored style schema (zod), moved from core's document.ts
├── ledger.ts       # every CSS property: its owning key, section, token kinds and Baseline mark
├── declare.ts      # style → declarations
├── read.ts         # declarations → style, and what no key owns into the CSS map
├── validate.ts     # a value against its property's CSS grammar
└── adapter.ts      # the contract each framework's adapter implements
```

### Declarations

A declaration is a CSS property, its value, and where it applies:

```ts
interface Declaration {
  property: string // as CSS spells it: "background-color", "align-self"
  value: string // as CSS reads it: "var(--primary)", "calc(var(--spacing) * 4)"
  when?: { state?: string; viewport?: string; theme?: string } // from the state, viewport or theme patch
  from: string // the key that wrote it, so read-back and the hint can name the row
}
```

A layer has one declaration for each property. Where two keys write one property, as `size` and `leading` both write
`line-height`, the later key's value stands, in the place the property was first written. What a kind of layer draws
before any key is set, such as a layout's `display: flex` or text's `margin: 0`, is from the key that would change it.

`declarations(style, context)` gives a layer's declarations. The context carries what a key's meaning depends on: the
parent's layout (Fill writes `flex: 1 1 0` with `min-width: 0` in a row, and `align-self: stretch` across it), the
layer's kind, and the project's tokens. Today it holds the kind and the parent's direction, which are all the keys read;
the tokens join it with the first key that needs them. Each key's function is the only place that key's CSS is decided.

### The ledger

[design-options-css.md](design-options-css.md) places all 562 properties Chromium draws, by hand. The ledger is that
page as data, generated from the W3C's machine-readable spec data and checked by a test:

- each property's owning key, or the CSS map;
- its value grammar, for validation;
- the token kinds it takes;
- its Baseline status, for the panel's marks (PAR-706).

A test fails when two keys claim one property, when a key writes a property it doesn't own, or when the ledger and the
property list disagree, which turns call 4 into something the build checks.

### Validation

`validate(property, value)` checks a value against the property's grammar from the ledger, so a value typed in a field,
read from code or typed in the CSS row is checked the same way, without a browser. The panel still asks `CSS.supports`
at the edge, since a grammar can be right and the browser still not draw it.

### The adapter contract

```ts
interface StylePrinter<Output> {
  /** A layer's declarations as this framework writes them. */
  print(declarations: readonly Declaration[], tokens: TokenSet): Output
  /** This framework's code back into declarations, with what it couldn't read kept as it was. */
  read(output: Output, tokens: TokenSet): { declarations: Declaration[]; unread: string[] }
}
```

As built (PAR-943), the contract is in `adapter.ts` and differs in three ways. A printer takes no tokens: it's made for
one project, with what it needs of that project already in hand, as the Tailwind printer is made from the project's
design system. `print` returns its output with the declarations it had no way to write (`unwritten`), such as one for a
theme the project's code has no variant for. And `when` is in CSS's terms, so every adapter reads it alike: a state is
the selector that follows the layer (`:hover`, `[data-state="open"]`), a viewport the least width it applies from
(`48rem`), a theme its name.

`StylesAdapter` in core gains a printer beside `detect` and `loadTheme`. Detection doesn't change: the stylesheet regex
picks the adapter, and a project with none gets plain CSS.

## The adapters

| Adapter     | Where                         | Prints                                                                                            | Reads back                                  |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Canvas      | `@parity-app/style`           | One rule set per layer, keyed by its node id, with states and viewports as selectors and at-rules | Not needed                                  |
| Tailwind v4 | `@parity-app/styles-tailwind` | Classes, by the rules in [design-options-code.md](design-options-code.md)                         | Classes into declarations                   |
| Plain CSS   | `@parity-app/style`           | A rule set per selector, for a project without Tailwind                                           | Rules into declarations, with Lightning CSS |

**The Tailwind adapter leans on Tailwind rather than a table of its own.** It already loads the project's design system
to read the theme. That object, in Tailwind 4.3.3, also has:

- `candidatesToCss(classes)`: the CSS a class compiles to in this project. Every class the adapter writes is checked by
  compiling it and comparing the result with the declarations it came from, so a class that means something else in this
  project, through a plugin or a theme override, is caught before it's written. Read-back runs the same call the other
  way, compiling a hand-written class and reading its declarations.
- `getClassOrder(classes)`: the order Prettier's Tailwind plugin sorts classes into, so written classes sort as a
  developer's would without the plugin.
- `canonicalizeCandidates(classes)`: the canonical spelling of a class (`p-[16px]` to `p-4` where the theme has it), so
  the adapter writes what Tailwind's own tools would suggest.

The design system is loaded through `__unstable__loadDesignSystem`, which Tailwind marks unstable. A test against each
supported Tailwind version pins what the adapter uses, so a release that changes it fails in CI rather than in a
project.

**The canvas draws what code would.** The canvas adapter prints rules rather than today's inline styles, which can't
hold a state's pseudo-class, a container query or a `group-hover:` rule. That's the change
[design-options-code.md](design-options-code.md), Frames draw rules, proposes. In a Tailwind project the frame can draw
the Tailwind adapter's classes compiled by the project's own Tailwind instead, so the canvas has the code's cascade; the
plain rules are the fallback and the reference the round trip is tested against.

## Specifications and packages it uses

| Need                                  | Specification                     | Package                                 | Status                          |
| ------------------------------------- | --------------------------------- | --------------------------------------- | ------------------------------- |
| Every property and its value grammar  | CSS, from the W3C's specs         | `@webref/css`                           | New, approved                   |
| Checking a value against that grammar | CSS value definition syntax       | `css-tree`, which reads `mdn-data`      | New, approved                   |
| Baseline marks                        | web-features                      | `web-features`                          | New, approved                   |
| Types for every property              | Generated from MDN                | `csstype`                               | Installed through React's types |
| Parsing and printing plain CSS        | CSS syntax                        | `lightningcss`                          | Installed, through Tailwind     |
| Token values                          | W3C Design Tokens Community Group | `@parity-app/tokens` (`dtcg-values.ts`) | Built                           |
| What a Tailwind class compiles to     | The project's own Tailwind        | Its design system object                | Loaded today                    |

`@webref/css` and `css-tree` overlap: webref is the spec data itself, and css-tree brings a validator built on MDN's
copy of it. PAR-940 uses both, each for one thing. css-tree's own data (3.2.1, March 2026) lacks 52 of the properties
Chromium 156 draws, among them `border-shape` and the `row-rule` family, so the ledger's grammars come from webref,
which has them all. webref has no matcher, so css-tree matches values against those grammars: `validate` builds
css-tree's lexer from the ledger's grammars and never asks css-tree's own dictionary about a property. webref and
web-features are read only when `spec.json` is generated, so only css-tree ships in the app.

## Where it sits

| Package                         | Role in this                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `@parity-app/style` (new, pure) | The model, the ledger, declarations both ways, validation, the canvas and plain CSS printers |
| `@parity-app/core`              | Documents hold a style from `@parity-app/style`; render calls `declarations` for each layer  |
| `@parity-app/editor`            | Style editing writes keys through the model, and the panel's rows come from the ledger       |
| `@parity-app/styles-tailwind`   | The Tailwind printer and reader, at the edge since it loads the project's Tailwind           |
| `@parity-app/code`              | Writing a component (PAR-265) and reading an edited one back call the project's printer      |
| `@parity-app/agent`             | The agent's style tools validate through `@parity-app/style`                                 |

`@parity-app/style` depends on nothing but zod and the spec data. Core depends on it, not the other way.

## Testing

- **Each key, against the spec:** for every key and value form, the declarations it writes, with property names checked
  against the ledger.
- **Round trip through declarations:** style to declarations and back gives the same style, for every value form.
- **Round trip through each adapter:** declarations to code and back give the same declarations. For Tailwind, this runs
  against the example project's real design system.
- **Canvas against code:** a layer drawn from the canvas rules and from the compiled Tailwind classes measures the same,
  in the end-to-end tests CI runs.

## The work in progress

PAR-925, PAR-931, PAR-933 and PAR-934 are adding keys to core's `nodeStyle` now. They land as they are and move into the
package in step 1 unchanged. The renames in step 3 then take every key at once, PAR-931's widened `background` becoming
the `fills` list [design-options-code.md](design-options-code.md) names, so the `.par` format changes once rather than
with each issue.

## Order of work

Each is its own issue and pull request:

1. **Create the package and move what exists (PAR-939):** the schema from core's `document.ts`, and render's
   style-to-CSS into `declarations`, with no change to what's drawn. Render calls it.
2. **The ledger and validation (PAR-940):** generated from the spec data, with the ownership test, replacing the hand
   checks in the agent's lint and the panel.
3. **The format change (PAR-941):** keys renamed after their CSS properties, values stored with their form, lists for
   fills, shadows, filters, transforms and transitions, and the CSS map. One new `.par` version, with the examples and
   fixtures rewritten, as the Fix forward rule in [conventions.md](../conventions.md) says.
4. **The canvas draws rules (PAR-942),** not inline styles.
5. **The Tailwind printer and reader (PAR-943),** with the round-trip tests; Copy as Tailwind and the hint's code use
   it.
6. **The plain CSS printer and reader (PAR-944).** Further adapters follow PAR-708's map.

## The calls, as agreed

Andrew accepted all four recommendations on 2026-11-11:

1. **The package:** `@parity-app/style`, with the schema moving out of core, since the schema is the part every adapter
   depends on.
2. **When the format changes:** once, after PAR-925, PAR-931, PAR-933 and PAR-934 land, rather than with each issue.
3. **What the canvas draws in a Tailwind project:** the project's compiled classes, so the canvas is the code, with
   Parity's own rules from the declarations as the fallback.
4. **The new dependencies:** `@webref/css` or `css-tree` (PAR-940 picks, since one may be enough), and `web-features`.
