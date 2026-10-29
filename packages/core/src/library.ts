import { type CanvasDocument, parseCanvasDocument } from "./document.ts"
import {
  compact,
  expectArray,
  expectKnownKeys,
  expectNumber,
  expectObject,
  expectOneOf,
  expectString,
  optional
} from "./validate.ts"

/**
 * What a library says about itself, in a `.lib.par` file at its package root: its name, the stylesheet a project
 * imports to use it, the breakpoints it's designed for, its design tokens, its components, icons and decorators, and its
 * own canvas of designs. Any package with one is a library Parity can load. Packages that don't ship one are described
 * by Parity's registry, in the same format.
 */
export interface LibraryManifest {
  /** 2 added `tokens` and `canvas`; 3 added `package`, `components`, `icons` and `decorators`. */
  version: 1 | 2 | 3
  /** Short name its components are namespaced by, as in `nova/Button`. Defaults to the package name. */
  id?: string
  name: string
  description?: string
  /** The npm package it describes, and the versions it was made for. */
  package?: LibraryPackage
  /** The stylesheet to import, relative to the package: its Tailwind entry, or plain CSS. */
  styles?: string
  /** The viewport widths it's designed around, smallest first. */
  breakpoints?: LibraryBreakpoint[]
  /**
   * Its design tokens, in the DTCG format (2025.10): a path relative to the package, to a token file or to a resolver
   * that names its themes, or a resolver or token groups written inline.
   */
  tokens?: string | Record<string, unknown>
  /** The components it exports, as the type checker found them. */
  components?: LibraryComponents
  /** Its icons, when it's an icon set: how they're imported and drawn. */
  icons?: LibraryIcons
  /** What its components need around them in every frame: providers, toast hosts, theme classes. */
  decorators?: LibraryDecorator[]
  /** Hand edits merged over the generated parts, or the path of a shared file of them, relative to this file. */
  edits?: LibraryEdits | string
  /** The library's own canvas: its designs where its author placed them, its notes and its modes, as in a `.par`. */
  canvas?: CanvasDocument
}

export interface LibraryBreakpoint {
  id: string
  name: string
  /** The width where it starts, in CSS pixels. */
  width: number
}

/** The package a manifest describes. */
export interface LibraryPackage {
  /** Its name on npm, as in `@mui/material`. */
  name: string
  /** The version it was generated from. */
  version?: string
  /** The versions it describes, as a semver range such as `^9.0.0`. Unset means any. */
  range?: string
}

/** How a component was recognised, which is also why it's believed to be one. */
export const componentEvidence = ["function", "forwardRef", "memo", "lazy", "class", "exotic"] as const
export type ComponentEvidence = (typeof componentEvidence)[number]

export interface LibraryComponents {
  /** The module components are imported from. Defaults to the package name. */
  import?: string
  /**
   * Components by the name they're imported by: an export, or `Namespace.Member` for libraries that group a
   * component's parts, as Base UI's `Dialog.Root` does.
   */
  list: Record<string, LibraryComponent>
}

export interface LibraryComponent {
  as: ComponentEvidence
  /** The type declarations that define it, relative to the package, for reading its props. */
  declaration?: string
  /** The family it belongs to in the Components panel, as Card, CardHeader and CardTitle share `Card`. */
  group?: string
  /**
   * The components a part is placed inside, outermost first, as `["Accordion", "AccordionItem"]` for
   * `AccordionTrigger`, and what said so.
   */
  parents?: string[]
  parentsFrom?: ParentSignal
  /**
   * Parents most examples show but it renders without (`DropdownMenuGroup`), a subset of `parents`: inserting it
   * where the parents outside them are already leaves them out.
   */
  optionalParents?: string[]
  /**
   * `true` when its parents need the other parts their samples hold around it to draw (a table's header beside the
   * body a row is in): inserting it alone puts it in its outermost parent's whole sample, in place of the first like it.
   */
  parentParts?: boolean
  /** `false` for exports that draw nothing of their own, such as a context's consumer or a `RootProvider`. */
  visual?: boolean
  /**
   * `true` for a part the package renders inside its own components and that no example or docs page places
   * (`ChartStyle` in `ChartContainer`, a Select's scroll buttons). It can still be placed; the Components panel lists
   * it apart.
   */
  internal?: boolean
  /** What it needs to draw something: props with sample values, and children, as for a collection's items. */
  sample?: ComponentSample
  /** A hash of what it was found as and its own props, to tell what changed when the file is regenerated. */
  fingerprint?: string
  /** Its own props (not the HTML attributes it passes on), each with a hash of its type; `?` marks an optional one. */
  props?: Record<string, string>
}

/**
 * Where a part's parents came from: the library's own examples and stories, the namespace it's exported in
 * (`Accordion.Item`), the error it throws alone ("must be used within `Accordion`"), a shared name prefix
 * (`AccordionItem` under `Accordion`), or a hand edit.
 */
export const parentSignals = ["example", "source", "namespace", "error", "prefix", "edit"] as const
export type ParentSignal = (typeof parentSignals)[number]

export interface ComponentSample {
  props?: Record<string, unknown>
  children?: SampleChild[]
}

/**
 * Text, a component of the same library by its name in `components.list`, or a render function: what a part calls to
 * draw, as children (`Field.Validity`) or as a prop's value (`renderInput`).
 */
export type SampleChild =
  | string
  | { component: string; props?: Record<string, unknown>; children?: SampleChild[] }
  | SampleRender

/**
 * A function returning these children. With `spread`, the object it's called with is spread onto the one element it
 * returns, as MUI's `renderInput={(params) => <TextField {...params} />}`; `pass` names props of that element that take
 * it whole, as React Aria's `{(segment) => <DateSegment segment={segment} />}`.
 */
export interface SampleRender {
  $render: SampleChild[]
  spread?: true
  pass?: string[]
}

/**
 * A prop whose value is elements, as MUI's `control={<Checkbox />}` or an `icon`: inserted as a named slot of that
 * prop, which the canvas passes as the prop's value.
 */
export interface SampleElement {
  $element: SampleChild[]
}

/** Whether a sample's prop value is elements. */
export function isSampleElement(value: unknown): value is SampleElement {
  return typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).$element)
}

/**
 * A prop's value the package makes by calling one of its own functions, as an example does (Chakra's
 * `collection={createTreeCollection({ rootNode })}`): the canvas calls it with `args`, once per frame.
 */
export interface MadeValue {
  $call: { import: string; export: string }
  args?: unknown[]
}

/** Whether a sample's prop value is one the package makes. */
export function isMadeValue(value: unknown): value is MadeValue {
  const call = typeof value === "object" && value !== null ? (value as Record<string, unknown>).$call : undefined
  return typeof call === "object" && call !== null && typeof (call as Record<string, unknown>).import === "string"
}

/** Whether a sample's child or prop value is a render function. */
export function isSampleRender(value: unknown): value is SampleRender {
  return typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).$render)
}

/**
 * Where a part's sample calls what's inside it: its function children, else a render prop (Chakra's `TreeView.Node`
 * `render`), with the render function.
 */
export function renderSlotOf(sample: ComponentSample | undefined): { prop: string; render: SampleRender } | undefined {
  const children = sample?.children?.find(isSampleRender)
  if (children) return { prop: "children", render: children }
  const entry = Object.entries(sample?.props ?? {}).find(([, value]) => isSampleRender(value))
  return entry ? { prop: entry[0], render: entry[1] as SampleRender } : undefined
}

/**
 * Hand edits to a library file, kept apart from what `parity lib` generates so regenerating keeps them. Components are
 * keyed by export name and merged over the generated entry; `false` leaves a component out. Decorators, when given,
 * replace the generated ones. A manifest can name a shared file of edits instead, relative to itself.
 */
export interface LibraryEdits {
  components?: Record<string, LibraryComponentEdit | false>
  decorators?: LibraryDecorator[]
}

export type LibraryComponentEdit = Partial<Omit<LibraryComponent, "fingerprint" | "props">>

/** One React component that draws an icon given as data, as Hugeicons' `HugeiconsIcon` does with its `icon` prop. */
export interface IconRenderer {
  import: string
  component: string
  prop: string
}

export interface LibraryIcons {
  /** The module icons are imported from. Defaults to the package name. */
  import?: string
  /** `export` when every icon is a component of its own; otherwise the component that draws icons from data. */
  render: "export" | IconRenderer
  /** A regular expression for the export names that are icons. Defaults to every export that can be one. */
  match?: string
  /** Exports that look like icons but aren't, such as Lucide's generic `Icon` and its provider. */
  exclude?: string[]
  /** Styles and sizes written into icon names, as in Fluent's `Add24Regular`. */
  variants?: IconVariants
  /** How many icons it had when it was generated. */
  count?: number
  /**
   * Words to find each icon by, from the set's own published metadata: its tags and categories, by the icon's name
   * without a style or size (`Add` for Fluent's `Add24Regular`). Read when the file is generated, never typed by hand.
   */
  tags?: Record<string, string[]>
  /** Where `tags` were read from, as `package@version/path`. */
  tagSource?: string
}

export interface IconVariants {
  /**
   * Splits an export name into named groups: `name`, and optionally `size` and `style`, for sets that write them into
   * names (Fluent's `Add24Regular`). A name without a style has the default style.
   */
  pattern?: string
  /** The prop that picks a style, for sets that take it as a prop (Phosphor's `weight`). */
  prop?: string
  styles?: string[]
  sizes?: number[]
  /** What the picker shows first. An icon without a size in its name scales with the text. */
  default?: { style?: string; size?: number }
}

/**
 * A decorator written as data, so it runs no code of its own: a component wrapped around the design, one rendered
 * beside it (a toast host), or a class, attributes or styles on the frame's body. A manifest lists them outermost
 * first, as the JSX they make reads. That is Parity's order, the reverse of Storybook's, where the first decorator in a
 * list is innermost, so a list compiled into Storybook's decorators is reversed first.
 */
export interface LibraryDecorator {
  /** Applies only when the frame's globals have these values, as in `{ "theme": "dark" }`. */
  when?: Record<string, string>
  wrap?: DecoratorElement
  add?: DecoratorElement
  class?: DecoratorValue
  attributes?: Record<string, DecoratorValue>
  style?: Record<string, DecoratorValue>
}

export interface DecoratorElement {
  import: string
  /** The export to render; `default` for a default export. */
  component: string
  props?: Record<string, DecoratorValue>
}

/**
 * A decorator's value: JSON, or one of four forms that the guest works out for each frame.
 *
 * - `{ "$import": "pkg", "export": "name" }`: something the package exports, such as a theme object.
 * - `{ "$call": { "import": "pkg", "export": "name" }, "args": [...] }`: what calling it returns.
 * - `{ "$global": "theme", "values": { "dark": ... }, "default": ... }`: picked by the frame's global, which is the
 *   mode's option for that variable.
 * - `{ "$frame": "root" | "host" | "body" }`: the frame's shadow root, the element it hangs from (which `:root[...]`
 *   rules match, as `:host(...)`), or the element standing in for its `<body>`. Also `document`, `dir`, `lang`, and
 *   `selector`, a CSS selector for the body alone.
 */
export type DecoratorValue = unknown

const decoratorKeys = ["when", "wrap", "add", "class", "attributes", "style"] as const

/** A library manifest's extension. It describes a library, and its `canvas` holds the library's own designs. */
export const libraryManifestExtension = ".lib.par"

export function parseLibraryManifest(value: unknown): LibraryManifest {
  const manifest = expectObject(value, "")
  const keys = ["$schema", "version", "id", "name", "description", "styles", "breakpoints", "tokens", "canvas"]
  if (manifest.version === 3) keys.push("package", "components", "icons", "decorators", "edits")
  expectKnownKeys(manifest, keys, "")
  if (manifest.version !== 1 && manifest.version !== 2 && manifest.version !== 3) {
    throw new TypeError("/version: expected 1, 2 or 3")
  }
  return compact({
    version: manifest.version,
    id: optional(manifest.id, (v) => expectString(v, "/id")),
    name: expectString(manifest.name, "/name"),
    description: optional(manifest.description, (v) => expectString(v, "/description")),
    package: optional(manifest.package, parsePackage),
    styles: optional(manifest.styles, (v) => expectString(v, "/styles")),
    breakpoints: optional(manifest.breakpoints, (v) =>
      expectArray(v, "/breakpoints")
        .map((item, index) => {
          const at = `/breakpoints/${index}`
          const breakpoint = expectObject(item, at)
          expectKnownKeys(breakpoint, ["id", "name", "width"], at)
          return {
            id: expectString(breakpoint.id, `${at}/id`),
            name: expectString(breakpoint.name, `${at}/name`),
            width: expectNumber(breakpoint.width, `${at}/width`)
          }
        })
        .sort((a, b) => a.width - b.width)
    ),
    tokens: optional(manifest.tokens, (v) => (typeof v === "string" ? v : expectObject(v, "/tokens"))),
    components: optional(manifest.components, parseComponents),
    icons: optional(manifest.icons, parseIcons),
    decorators: optional(manifest.decorators, (v) => expectArray(v, "/decorators").map(parseDecorator)),
    edits: optional(manifest.edits, (v) => (typeof v === "string" ? v : parseLibraryEdits(v, "/edits"))),
    canvas: optional(manifest.canvas, (v) => {
      try {
        return parseCanvasDocument(v)
      } catch (error) {
        throw new TypeError(`/canvas${error instanceof Error ? error.message : String(error)}`)
      }
    })
  })
}

function parsePackage(value: unknown): LibraryPackage {
  const pkg = expectObject(value, "/package")
  expectKnownKeys(pkg, ["name", "version", "range"], "/package")
  return compact({
    name: expectString(pkg.name, "/package/name"),
    version: optional(pkg.version, (v) => expectString(v, "/package/version")),
    range: optional(pkg.range, (v) => expectString(v, "/package/range"))
  })
}

function parseComponents(value: unknown): LibraryComponents {
  const components = expectObject(value, "/components")
  expectKnownKeys(components, ["import", "list"], "/components")
  const list: Record<string, LibraryComponent> = {}
  for (const [name, entry] of Object.entries(expectObject(components.list, "/components/list"))) {
    const at = `/components/list/${name}`
    const component = expectObject(entry, at)
    expectKnownKeys(component, [...componentKeys, "fingerprint", "props"], at)
    list[name] = compact({
      ...parseComponentFields(component, at),
      as: expectOneOf(component.as, componentEvidence, `${at}/as`),
      fingerprint: optional(component.fingerprint, (v) => expectString(v, `${at}/fingerprint`)),
      props: optional(component.props, (v) => expectStringRecord(v, `${at}/props`))
    })
  }
  return compact({ import: optional(components.import, (v) => expectString(v, "/components/import")), list })
}

const componentKeys = [
  "as",
  "declaration",
  "group",
  "parents",
  "parentsFrom",
  "optionalParents",
  "parentParts",
  "visual",
  "internal",
  "sample"
]

function parseComponentFields(component: Record<string, unknown>, at: string): LibraryComponentEdit {
  return compact({
    as: optional(component.as, (v) => expectOneOf(v, componentEvidence, `${at}/as`)),
    declaration: optional(component.declaration, (v) => expectString(v, `${at}/declaration`)),
    group: optional(component.group, (v) => expectString(v, `${at}/group`)),
    parents: optional(component.parents, (v) =>
      expectArray(v, `${at}/parents`).map((name, index) => expectString(name, `${at}/parents/${index}`))
    ),
    parentsFrom: optional(component.parentsFrom, (v) => expectOneOf(v, parentSignals, `${at}/parentsFrom`)),
    optionalParents: optional(component.optionalParents, (v) =>
      expectArray(v, `${at}/optionalParents`).map((name, index) => expectString(name, `${at}/optionalParents/${index}`))
    ),
    parentParts: optional(component.parentParts, (v) => {
      if (typeof v !== "boolean") throw new TypeError(`${at}/parentParts: expected a boolean`)
      return v
    }),
    visual: optional(component.visual, (v) => {
      if (typeof v !== "boolean") throw new TypeError(`${at}/visual: expected a boolean`)
      return v
    }),
    internal: optional(component.internal, (v) => {
      if (typeof v !== "boolean") throw new TypeError(`${at}/internal: expected a boolean`)
      return v
    }),
    sample: optional(component.sample, (v) => parseSample(v, `${at}/sample`))
  })
}

function parseSample(value: unknown, at: string): ComponentSample {
  const sample = expectObject(value, at)
  expectKnownKeys(sample, ["props", "children"], at)
  return compact({
    props: optional(sample.props, (v) => expectObject(v, `${at}/props`)),
    children: optional(sample.children, (v) => parseSampleChildren(v, `${at}/children`))
  })
}

function parseSampleChildren(value: unknown, at: string): SampleChild[] {
  return expectArray(value, at).map((item, index) => {
    const here = `${at}/${index}`
    if (typeof item === "string") return item
    const child = expectObject(item, here)
    if ("$render" in child) {
      expectKnownKeys(child, ["$render", "spread", "pass"], here)
      if (child.spread !== undefined && child.spread !== true) throw new TypeError(`${here}/spread: expected true`)
      const render: SampleRender = { $render: parseSampleChildren(child.$render, `${here}/$render`) }
      if (child.spread) render.spread = true
      if (child.pass !== undefined) {
        render.pass = expectArray(child.pass, `${here}/pass`).map((prop, index) =>
          expectString(prop, `${here}/pass/${index}`)
        )
      }
      return render
    }
    expectKnownKeys(child, ["component", "props", "children"], here)
    return compact({
      component: expectString(child.component, `${here}/component`),
      props: optional(child.props, (v) => expectObject(v, `${here}/props`)),
      children: optional(child.children, (v) => parseSampleChildren(v, `${here}/children`))
    })
  })
}

/** Reads hand edits to a library file, from its `edits` or a shared file of them. */
export function parseLibraryEdits(value: unknown, at = ""): LibraryEdits {
  const edits = expectObject(value, at)
  expectKnownKeys(edits, ["$schema", "components", "decorators"], at)
  return compact({
    components: optional(edits.components, (v) => {
      const result: Record<string, LibraryComponentEdit | false> = {}
      for (const [name, entry] of Object.entries(expectObject(v, `${at}/components`))) {
        const here = `${at}/components/${name}`
        if (entry === false) {
          result[name] = false
          continue
        }
        const component = expectObject(entry, here)
        expectKnownKeys(component, componentKeys, here)
        result[name] = parseComponentFields(component, here)
      }
      return result
    }),
    decorators: optional(edits.decorators, (v) => expectArray(v, `${at}/decorators`).map(parseDecorator))
  })
}

/**
 * The manifest with hand edits merged over what was generated, and the edited exports it no longer has, which are
 * reported rather than dropped silently. An edit can add a component the checker missed, if it says what it's `as`.
 */
export function applyLibraryEdits(
  manifest: LibraryManifest,
  edits: LibraryEdits | undefined
): { manifest: LibraryManifest; orphans: string[] } {
  if (!edits) return { manifest, orphans: [] }
  const orphans: string[] = []
  let components = manifest.components
  if (edits.components) {
    const list = { ...components?.list }
    for (const [name, edit] of Object.entries(edits.components)) {
      const generated = list[name]
      if (edit === false) {
        if (generated) delete list[name]
        else orphans.push(name)
        continue
      }
      if (!generated && !edit.as) {
        orphans.push(name)
        continue
      }
      const merged = { ...generated, ...edit } as LibraryComponent
      if (edit.parents && !edit.parentsFrom) merged.parentsFrom = "edit"
      // Hand-edited parents replace the generated ones, and which of those were optional with them.
      if (edit.parents && !edit.optionalParents) delete merged.optionalParents
      list[name] = merged
    }
    components = { ...components, list }
  }
  return {
    manifest: compact({ ...manifest, components, decorators: edits.decorators ?? manifest.decorators }),
    orphans
  }
}

function parseIcons(value: unknown): LibraryIcons {
  const icons = expectObject(value, "/icons")
  expectKnownKeys(icons, ["import", "render", "match", "exclude", "variants", "count", "tags", "tagSource"], "/icons")
  let render: LibraryIcons["render"]
  if (icons.render === "export") render = "export"
  else {
    const renderer = expectObject(icons.render, "/icons/render")
    expectKnownKeys(renderer, ["import", "component", "prop"], "/icons/render")
    render = {
      import: expectString(renderer.import, "/icons/render/import"),
      component: expectString(renderer.component, "/icons/render/component"),
      prop: expectString(renderer.prop, "/icons/render/prop")
    }
  }
  return compact({
    import: optional(icons.import, (v) => expectString(v, "/icons/import")),
    render,
    match: optional(icons.match, (v) => expectPattern(v, "/icons/match")),
    exclude: optional(icons.exclude, (v) =>
      expectArray(v, "/icons/exclude").map((name, index) => expectString(name, `/icons/exclude/${index}`))
    ),
    variants: optional(icons.variants, (v) => {
      const variants = expectObject(v, "/icons/variants")
      expectKnownKeys(variants, ["pattern", "prop", "styles", "sizes", "default"], "/icons/variants")
      return compact({
        pattern: optional(variants.pattern, (pattern) => expectPattern(pattern, "/icons/variants/pattern")),
        prop: optional(variants.prop, (prop) => expectString(prop, "/icons/variants/prop")),
        styles: optional(variants.styles, (list) =>
          expectArray(list, "/icons/variants/styles").map((style, index) =>
            expectString(style, `/icons/variants/styles/${index}`)
          )
        ),
        sizes: optional(variants.sizes, (list) =>
          expectArray(list, "/icons/variants/sizes").map((size, index) =>
            expectNumber(size, `/icons/variants/sizes/${index}`)
          )
        ),
        default: optional(variants.default, (d) => {
          const fallback = expectObject(d, "/icons/variants/default")
          expectKnownKeys(fallback, ["style", "size"], "/icons/variants/default")
          return compact({
            style: optional(fallback.style, (s) => expectString(s, "/icons/variants/default/style")),
            size: optional(fallback.size, (s) => expectNumber(s, "/icons/variants/default/size"))
          })
        })
      })
    }),
    count: optional(icons.count, (v) => expectNumber(v, "/icons/count")),
    tags: optional(icons.tags, (v) =>
      Object.fromEntries(
        Object.entries(expectObject(v, "/icons/tags")).map(([name, list]) => [
          name,
          expectArray(list, `/icons/tags/${name}`).map((tag, index) =>
            expectString(tag, `/icons/tags/${name}/${index}`)
          )
        ])
      )
    ),
    tagSource: optional(icons.tagSource, (v) => expectString(v, "/icons/tagSource"))
  })
}

function parseDecorator(value: unknown, index: number): LibraryDecorator {
  const at = `/decorators/${index}`
  const decorator = expectObject(value, at)
  expectKnownKeys(decorator, decoratorKeys, at)
  const effects = decoratorKeys.filter((key) => key !== "when" && decorator[key] !== undefined)
  if (effects.length !== 1) throw new TypeError(`${at}: expected one of wrap, add, class, attributes or style`)
  const element = (v: unknown, path: string): DecoratorElement => {
    const spec = expectObject(v, path)
    expectKnownKeys(spec, ["import", "component", "props"], path)
    return compact({
      import: expectString(spec.import, `${path}/import`),
      component: expectString(spec.component, `${path}/component`),
      props: optional(spec.props, (props) => expectObject(props, `${path}/props`))
    })
  }
  return compact({
    when: optional(decorator.when, (v) => {
      const when = expectObject(v, `${at}/when`)
      for (const [name, option] of Object.entries(when)) expectString(option, `${at}/when/${name}`)
      return when as Record<string, string>
    }),
    wrap: optional(decorator.wrap, (v) => element(v, `${at}/wrap`)),
    add: optional(decorator.add, (v) => element(v, `${at}/add`)),
    class: decorator.class,
    attributes: optional(decorator.attributes, (v) => expectObject(v, `${at}/attributes`)),
    style: optional(decorator.style, (v) => expectObject(v, `${at}/style`))
  })
}

function expectPattern(value: unknown, path: string): string {
  const pattern = expectString(value, path)
  try {
    new RegExp(pattern)
  } catch {
    throw new TypeError(`${path}: expected a regular expression`)
  }
  return pattern
}

/** The designs in a `.lib.par`, or an empty canvas when it has none yet. */
export function libraryCanvas(manifest: LibraryManifest): CanvasDocument {
  return manifest.canvas ?? { version: 3, containers: [] }
}

/**
 * A `.lib.par` file's JSON with its canvas replaced, ready to write. Everything else in the file stays as it was, so
 * saving designs never touches what the author wrote about the library. A version 1 file becomes 2, the first with a
 * canvas; a later one keeps its version.
 */
export function withLibraryCanvas(file: unknown, canvas: CanvasDocument): Record<string, unknown> {
  const { canvas: _previous, ...rest } = expectObject(file, "")
  return { ...rest, version: rest.version === 3 ? 3 : 2, canvas }
}

/**
 * The modules a library's decorators and icon renderer import, so a builder can load them before the first frame.
 * Values nested in props count too, such as a theme a provider is given.
 */
export function libraryImports(manifest: Pick<LibraryManifest, "decorators" | "icons">): string[] {
  const found = new Set<string>()
  // Elements and `$call`s name their module with `import`; `$import` values name it themselves.
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>
      if (typeof record.$import === "string") found.add(record.$import)
      if (typeof record.import === "string" && (typeof record.component === "string" || "export" in record)) {
        found.add(record.import)
      }
      for (const entry of Object.values(record)) visit(entry)
    }
  }
  visit(manifest.decorators)
  if (manifest.icons && manifest.icons.render !== "export") found.add(manifest.icons.render.import)
  return [...found]
}

function expectStringRecord(value: unknown, path: string): Record<string, string> {
  const record = expectObject(value, path)
  for (const [key, item] of Object.entries(record)) expectString(item, `${path}/${key}`)
  return record as Record<string, string>
}
