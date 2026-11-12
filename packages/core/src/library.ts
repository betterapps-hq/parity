import { z } from "zod"
import { type CanvasDocument, type ContainerSpec, canvasDocument } from "./document.ts"
import { mapNodes } from "./edit.ts"
import { fileObject, finiteNumber, parseData, parserFor, plainObject } from "./schema.ts"
import { isComposite, isText } from "./values/evaluate.ts"
import { decoratorProps, decoratorValue, sampleProps } from "./values/grammar.ts"

// A library file is checked by the schemas below, leaves first, as a `.par` is in `document.ts`. Its `canvas` is a
// `.par`'s document, so problems in it point inside `/canvas`.

const libraryBreakpoint = fileObject({
  id: z.string(),
  name: z.string(),
  /** The width where it starts, in CSS pixels. */
  width: finiteNumber
})

export type LibraryBreakpoint = z.infer<typeof libraryBreakpoint>

/** The package a manifest describes. */
export const libraryPackage = fileObject({
  /** Its name on npm, as in `@mui/material`. */
  name: z.string(),
  /** The version it was generated from. */
  version: z.string().optional(),
  /** The versions it describes, as a semver range such as `^9.0.0`. Unset means any. */
  range: z.string().optional()
})

export type LibraryPackage = z.infer<typeof libraryPackage>

/** How a component was recognised, which is also why it's believed to be one. */
export const componentEvidence = ["function", "forwardRef", "memo", "lazy", "class", "exotic"] as const

export type ComponentEvidence = (typeof componentEvidence)[number]

/**
 * Where a part's parents came from: the library's own examples and stories, the namespace it's exported in
 * (`Accordion.Item`), the error it throws alone ("must be used within `Accordion`"), a shared name prefix
 * (`AccordionItem` under `Accordion`), or a hand edit.
 */
export const parentSignals = ["example", "source", "namespace", "error", "prefix", "edit", "app"] as const

export type ParentSignal = (typeof parentSignals)[number]

/**
 * A function returning these children. With `spread`, the object it's called with is spread onto the one element it
 * returns, as MUI's `renderInput={(params) => <TextField {...params} />}`; `pass` names props of that element that take
 * it whole, as React Aria's `{(segment) => <DateSegment segment={segment} />}`.
 */
const sampleRender = fileObject({
  get $render(): z.ZodArray<typeof sampleChild> {
    return z.array(sampleChild)
  },
  spread: z.literal(true).optional(),
  pass: z.array(z.string()).optional()
})

export type SampleRender = z.infer<typeof sampleRender>

/** A component of the same library, by its name in `components.list`, with its props and children. */
const sampleComponent = fileObject({
  component: z.string(),
  props: sampleProps.optional(),
  get children(): z.ZodOptional<z.ZodArray<typeof sampleChild>> {
    return z.array(sampleChild).optional()
  }
})

export type SampleComponent = z.infer<typeof sampleComponent>

/**
 * Text, a component of the same library by its name in `components.list`, or a render function: what a part calls to
 * draw, as children (`Field.Validity`) or as a prop's value (`renderInput`).
 */
const sampleChild = z.union([z.string(), sampleRender, sampleComponent])

export type SampleChild = z.infer<typeof sampleChild>

/** Whether a sample's child is text, rather than a component or a render function. */
export function isSampleText(child: SampleChild): child is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the other kinds are objects; text is the one kind JSON holds as a string
  return typeof child === "string"
}

/**
 * A prop whose value is elements, as MUI's `control={<Checkbox />}` or an `icon`: inserted as a named slot of that
 * prop, which the canvas passes as the prop's value.
 */
const sampleElement = z.object({ $element: z.array(sampleChild) })

export type SampleElement = z.infer<typeof sampleElement>

/** What a component needs to draw something: props with sample values, and children, as for a collection's items. */
const componentSample = fileObject({
  props: sampleProps.optional(),
  children: z.array(sampleChild).optional()
})

export type ComponentSample = z.infer<typeof componentSample>

/** A regular expression's source, checked by compiling it. */
const pattern = z.string().refine((source) => {
  try {
    // oxlint-disable-next-line eslint/no-new -- constructing the expression is the check: it throws when it's invalid
    new RegExp(source)

    return true
  } catch {
    return false
  }
}, "expected a regular expression")

// The parts' booleans keep the words their hand-written checks used.
const flag = z.boolean("expected a boolean")

/** What a component says about itself that a hand edit can change too. */
const componentFields = {
  /** The type declarations that define it, relative to the package, for reading its props. */
  declaration: z.string().optional(),
  /** The family it belongs to in the Components panel, as Card, CardHeader and CardTitle share `Card`. */
  group: z.string().optional(),
  /**
   * The components a part is placed inside, outermost first, as `["Accordion", "AccordionItem"]` for
   * `AccordionTrigger`, and what said so.
   */
  parents: z.array(z.string()).optional(),
  parentsFrom: z.enum(parentSignals).optional(),
  /**
   * Parents most examples show but it renders without (`DropdownMenuGroup`), a subset of `parents`: inserting it
   * where the parents outside them are already leaves them out.
   */
  optionalParents: z.array(z.string()).optional(),
  /**
   * `true` when its parents need the other parts their samples hold around it to draw (a table's header beside the
   * body a row is in): inserting it alone puts it in its outermost parent's whole sample, in place of the first like it.
   */
  parentParts: flag.optional(),
  /** `false` for exports that draw nothing of their own, such as a context's consumer or a `RootProvider`. */
  visual: flag.optional(),
  /**
   * `true` for a part the package renders inside its own components and that no example or docs page places
   * (`ChartStyle` in `ChartContainer`, a Select's scroll buttons). It can still be placed; the Components panel lists
   * it apart.
   */
  internal: flag.optional(),
  /** What it needs to draw something: props with sample values, and children, as for a collection's items. */
  sample: componentSample.optional()
}

const libraryComponent = fileObject({
  as: z.enum(componentEvidence),
  ...componentFields,
  /** A hash of what it was found as and its own props, to tell what changed when the file is regenerated. */
  fingerprint: z.string().optional(),
  /** Its own props (not the HTML attributes it passes on), each with a hash of its type; `?` marks an optional one. */
  props: z.record(z.string(), z.string()).optional()
})

export type LibraryComponent = z.infer<typeof libraryComponent>

const libraryComponentEdit = fileObject({ as: z.enum(componentEvidence).optional(), ...componentFields })

export type LibraryComponentEdit = z.infer<typeof libraryComponentEdit>

const libraryComponents = fileObject({
  /** The module components are imported from. Defaults to the package name. */
  import: z.string().optional(),
  /**
   * Components by the name they're imported by: an export, or `Namespace.Member` for libraries that group a
   * component's parts, as Base UI's `Dialog.Root` does.
   */
  list: z.record(z.string(), libraryComponent)
})

export type LibraryComponents = z.infer<typeof libraryComponents>

/** One React component that draws an icon given as data, as Hugeicons' `HugeiconsIcon` does with its `icon` prop. */
const iconRenderer = fileObject({ import: z.string(), component: z.string(), prop: z.string() })

export type IconRenderer = z.infer<typeof iconRenderer>

const iconVariants = fileObject({
  /**
   * Splits an export name into named groups: `name`, and optionally `size` and `style`, for sets that write them into
   * names (Fluent's `Add24Regular`). A name without a style has the default style.
   */
  pattern: pattern.optional(),
  /** The prop that picks a style, for sets that take it as a prop (Phosphor's `weight`). */
  prop: z.string().optional(),
  /**
   * The module each style's icons are imported from, for sets that keep each style in a module of its own, as
   * Heroicons does in `@heroicons/react/16/solid`. The default style's is the set's `import`.
   */
  modules: z.record(z.string(), z.string()).optional(),
  styles: z.array(z.string()).optional(),
  sizes: z.array(finiteNumber).optional(),
  /** What the picker shows first. An icon without a size in its name scales with the text. */
  default: fileObject({ style: z.string().optional(), size: finiteNumber.optional() }).optional()
})

export type IconVariants = z.infer<typeof iconVariants>

const libraryIcons = fileObject({
  /** The module icons are imported from. Defaults to the package name. */
  import: z.string().optional(),
  /**
   * `export` when every icon is a component of its own; otherwise the component that draws icons from data. A string
   * is checked as one, so a renderer with a mistake in it reports the mistake rather than `expected "export"`.
   */
  render: z.union([z.string().pipe(z.literal("export")), iconRenderer]),
  /** A regular expression for the export names that are icons. Defaults to every export that can be one. */
  match: pattern.optional(),
  /** Exports that look like icons but aren't, such as Lucide's generic `Icon` and its provider. */
  exclude: z.array(z.string()).optional(),
  /**
   * For icons exported under several names, the one to insert where it isn't the shortest: the name the set's types
   * don't mark deprecated (Phosphor's `GearIcon`, not `Gear`), or the one an icon is declared under rather than an
   * alias. Read from the types when the file is generated.
   */
  prefer: z.array(z.string()).optional(),
  /** Styles and sizes written into icon names, as in Fluent's `Add24Regular`. */
  variants: iconVariants.optional(),
  /** How many icons it had when it was generated. */
  count: finiteNumber.optional(),
  /**
   * Words to find each icon by, from the set's own published metadata: its tags and categories, by the icon's name
   * without a style or size (`Add` for Fluent's `Add24Regular`). Read when the file is generated, never typed by hand.
   */
  tags: z.record(z.string(), z.array(z.string())).optional(),
  /** Where `tags` were read from, as `package@version/path`. */
  tagSource: z.string().optional()
})

export type LibraryIcons = z.infer<typeof libraryIcons>

const decoratorElement = fileObject({
  import: z.string(),
  /** The export to render; `default` for a default export. */
  component: z.string(),
  props: decoratorProps.optional()
})

export type DecoratorElement = z.infer<typeof decoratorElement>

const decoratorEffects = ["wrap", "add", "class", "attributes", "style"] as const

/**
 * A decorator written as data, so it runs no code of its own: a component wrapped around the design, one rendered
 * beside it (a toast host), or a class, attributes or styles on the frame's body. A manifest lists them outermost
 * first, as the JSX they make reads. That is Parity's order, the reverse of Storybook's, where the first decorator in a
 * list is innermost, so a list compiled into Storybook's decorators is reversed first.
 */
const libraryDecorator = fileObject({
  /** Applies only when the frame's globals have these values, as in `{ "theme": "dark" }`. */
  when: z.record(z.string(), z.string()).optional(),
  wrap: decoratorElement.optional(),
  add: decoratorElement.optional(),
  class: decoratorValue.optional(),
  attributes: decoratorProps.optional(),
  style: decoratorProps.optional()
}).superRefine((decorator, context) => {
  const effects = decoratorEffects.filter((key) => decorator[key] !== undefined)

  if (effects.length !== 1) {
    context.addIssue({ code: "custom", message: "expected one of wrap, add, class, attributes or style" })
  }
})

export type LibraryDecorator = z.infer<typeof libraryDecorator>

/**
 * Hand edits to a library file, kept apart from what `parity lib` generates so regenerating keeps them. Components are
 * keyed by export name and merged over the generated entry; `false` leaves a component out. Decorators, when given,
 * replace the generated ones. A manifest can name a shared file of edits instead, relative to itself.
 */
const libraryEdits = fileObject({
  $schema: z.string().optional(),
  // `false` is checked as a boolean first, so an edit with mistakes in it reports them rather than `expected false`.
  components: z.record(z.string(), z.union([z.boolean().pipe(z.literal(false)), libraryComponentEdit])).optional(),
  decorators: z.array(libraryDecorator).optional()
})

export type LibraryEdits = Omit<z.infer<typeof libraryEdits>, "$schema">

/**
 * What a library says about itself, in a `.lib.par` file at its package root: its name, the stylesheet a project
 * imports to use it, the breakpoints it's designed for, its design tokens, its components, icons and decorators, and its
 * own canvas of designs. Any package with one is a library Parity can load. Packages that don't ship one are described
 * by Parity's registry, in the same format.
 */
export const libraryManifest = fileObject({
  $schema: z.string().optional(),
  /** The current manifest format; obsolete formats are rejected rather than migrated. */
  version: z.literal(3),
  /** Short name its components are namespaced by, as in `nova/Button`. Defaults to the package name. */
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  /** The npm package it describes, and the versions it was made for. */
  package: libraryPackage.optional(),
  /** The stylesheet to import, relative to the package: its Tailwind entry, or plain CSS. */
  styles: z.string().optional(),
  /** The viewport widths it's designed around, smallest first, however the file lists them. */
  breakpoints: z
    .array(libraryBreakpoint)
    .transform((breakpoints) => breakpoints.toSorted((a, b) => a.width - b.width))
    .optional(),
  /**
   * Its design tokens, in the DTCG format (2025.10): a path relative to the package, to a token file or to a resolver
   * that names its themes, or a resolver or token groups written inline.
   */
  tokens: z.union([z.string(), plainObject]).optional(),
  /** The components it exports, as the type checker found them. */
  components: libraryComponents.optional(),
  /** Its icons, when it's an icon set: how they're imported and drawn. */
  icons: libraryIcons.optional(),
  /** What its components need around them in every frame: providers, toast hosts, theme classes. */
  decorators: z.array(libraryDecorator).optional(),
  /** Hand edits merged over the generated parts, or the path of a shared file of them, relative to this file. */
  edits: z.union([z.string(), libraryEdits]).optional(),
  /** The library's own canvas: its designs where its author placed them, its notes and its modes, as in a `.par`. */
  canvas: canvasDocument.optional()
})

export type LibraryManifest = Omit<z.infer<typeof libraryManifest>, "$schema">

/** A library manifest's extension. It describes a library, and its `canvas` holds the library's own designs. */
export const libraryManifestExtension = ".lib.par"

/** Reads a library file, or throws `TypeError` with the first problem as `/json/pointer: message`. */
export const parseLibraryManifest = parserFor(
  libraryManifest,
  ({ $schema: _schema, ...manifest }): LibraryManifest => manifest
)

/** Reads hand edits to a library file, from its `edits` or a shared file of them. */
export const parseLibraryEdits = parserFor(libraryEdits, ({ $schema: _schema, ...edits }): LibraryEdits => edits)

/** A manifest with hand edits merged in, and the exports edits name that it doesn't have. */
export interface EditedLibrary {
  manifest: LibraryManifest
  orphans: string[]
}

/**
 * The manifest with hand edits merged over what was generated, and the edited exports it no longer has, which are
 * reported rather than dropped silently. An edit can add a component the checker missed, if it says what it's `as`.
 */
export function applyLibraryEdits(manifest: LibraryManifest, edits: LibraryEdits | undefined): EditedLibrary {
  if (!edits) {
    return { manifest, orphans: [] }
  }

  const orphans: string[] = []
  let components = manifest.components

  if (edits.components) {
    const list = { ...components?.list }

    for (const [name, edit] of Object.entries(edits.components)) {
      const generated = list[name]

      if (edit === false) {
        if (generated) {
          delete list[name]
        } else {
          orphans.push(name)
        }

        continue
      }

      // A generated component always says what it's `as`, so only an edit adding one can lack it.
      const as = edit.as ?? generated?.as

      if (!as) {
        orphans.push(name)
        continue
      }

      const merged: LibraryComponent = { ...generated, ...edit, as }

      if (edit.parents && !edit.parentsFrom) {
        merged.parentsFrom = "edit"
      }

      // Hand-edited parents replace the generated ones, and which of those were optional with them.
      if (edit.parents && !edit.optionalParents) {
        delete merged.optionalParents
      }

      list[name] = merged
    }

    components = { ...components, list }
  }

  const merged: LibraryManifest = { ...manifest, components, decorators: edits.decorators ?? manifest.decorators }

  if (!merged.components) {
    delete merged.components
  }

  if (!merged.decorators) {
    delete merged.decorators
  }

  return { manifest: merged, orphans }
}

/**
 * The id a library's components and designs are named by, as in `nova/Button`: its manifest's `id`, else its package's
 * name without a scope. The library's own project names its components the same way, so its canvas's designs work
 * unchanged in the apps that install it.
 */
export function libraryId(manifest: Pick<LibraryManifest, "id">, packageName: string): string {
  // An empty id would name nothing, so it counts as none.
  return manifest.id || packageName.replace(/^@[^/]+\//, "")
}

/**
 * A library's component designs, as the apps that install it place them: the component designs in its canvas, each
 * named by the library (`nova/settings-row`), with the instances inside them pointing at those names. Their components
 * are the library's already (`nova/Button`), as its own project names them.
 */
export function libraryDesigns(manifest: Pick<LibraryManifest, "canvas">, id: string): ContainerSpec[] {
  const components = (manifest.canvas?.containers ?? []).filter((container) => container.kind === "component")
  const own = new Set(components.map((container) => container.id))
  const rename = (design: string) => (own.has(design) ? `${id}/${design}` : design)

  return components.map((container) => ({
    ...container,
    id: `${id}/${container.id}`,
    // Every instance, the ones another instance fills its slots with included.
    root: mapNodes(container.root, (node) =>
      node.type === "instance" ? { ...node, design: rename(node.design) } : node
    )
  }))
}

/** The designs in a `.lib.par`, or an empty canvas when it has none yet. */
export function libraryCanvas(manifest: LibraryManifest): CanvasDocument {
  return manifest.canvas ?? { version: 3, containers: [] }
}

/**
 * A `.lib.par` file's JSON with its canvas replaced, ready to write. Everything else in the file stays as it was, so
 * saving designs never touches what the author wrote about the library. The file must use the current format.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: the file's JSON as read, which this parses
export function withLibraryCanvas(file: unknown, canvas: CanvasDocument): z.output<typeof plainObject> {
  parseLibraryManifest(file)
  // The file's own object, not the manifest read from it, which leaves out `$schema`, so the rest stays as written.
  const { canvas: _previous, ...rest } = parseData(plainObject, file)

  return { ...rest, canvas }
}

/**
 * A manifest's module imports, rewritten once when discovery resolves an installed alias. Only schema-defined
 * import positions and the reserved $import/$call values are rewritten; ordinary props named import or modules
 * remain data. Collecting imports uses this same traversal, so loading and alias rewriting cannot drift.
 */
export function remapLibraryImports<T extends Pick<LibraryManifest, "components" | "icons" | "decorators" | "canvas">>(
  manifest: T,
  map: (specifier: string) => string
): T {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- walks a whole manifest, whatever each field holds, including decorator values that hold module exports' arguments
  const visit = (value: unknown, path: readonly string[]): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry, index) => visit(entry, [...path, String(index)]))
    }

    if (!isComposite(value)) {
      return value
    }

    const location = path.join(".")

    const module =
      location === "components" ||
      location === "icons" ||
      location === "icons.render" ||
      (path.length === 3 && path[0] === "decorators" && (path[2] === "wrap" || path[2] === "add")) ||
      path.at(-1) === "$call"

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isText(entry) && (key === "$import" || (key === "import" && module) || location === "icons.variants.modules")
          ? map(entry)
          : visit(entry, [...path, key])
      ])
    )
  }

  // SAFETY: `visit` rebuilds every array and object as it was and only swaps module strings for other strings, so the
  // result has the manifest's structure and its caller's more specific type.
  return visit(manifest, []) as T
}

/** Modules loaded for the library's decorators and icons, including values nested in their props. */
export function libraryImports(manifest: Pick<LibraryManifest, "decorators" | "icons">): string[] {
  const found = new Set<string>()
  remapLibraryImports({ decorators: manifest.decorators, icons: manifest.icons }, (specifier) => {
    found.add(specifier)

    return specifier
  })

  return [...found]
}
