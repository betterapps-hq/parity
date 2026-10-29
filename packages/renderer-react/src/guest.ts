// Compiled by the customer's build tool, so `react` and `react-dom` here are the customer's copies.
import type {
  Guest,
  GuestDecorators,
  GuestIconSet,
  GuestInit,
  LibraryDecorator,
  MountHandle,
  RenderNode
} from "@parity/core"
import { Component, type ComponentType, createElement, Fragment, lazy, type ReactNode, Suspense } from "react"
import { createRoot } from "react-dom/client"

type Props = Record<string, unknown>

/**
 * The project's dev server, which serves its public files. Frames live in the canvas's own page, so a path like
 * `/images/photo.jpg` would otherwise resolve against the canvas rather than the project.
 */
const projectOrigin = new URL(import.meta.url).origin

function attributesFor(tag: string, attributes: Record<string, string> | undefined): Record<string, string> {
  if (tag !== "img" || !attributes?.src?.startsWith("/") || attributes.src.startsWith("//")) return attributes ?? {}
  return { ...attributes, src: new URL(attributes.src, projectOrigin).href }
}

const missingStyle = {
  padding: "8px 12px",
  border: "1px dashed #e11d48",
  borderRadius: "6px",
  color: "#e11d48",
  font: "12px ui-monospace, monospace"
}

/** Function components, and the objects `forwardRef`, `memo` and `lazy` return. */
function isComponent(value: unknown): value is ComponentType<Props> {
  return typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value)
}

/**
 * Keeps one component's error to itself: it draws a marked box in its place, and the rest of the frame renders. React
 * still reports the error to the root, so the canvas and agents hear about it.
 */
class ComponentBoundary extends Component<{ name: string; children?: ReactNode }, { error?: Error; name?: string }> {
  override state: { error?: Error; name?: string } = {}
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
  // Boundaries are keyed by position, so one whose node was removed draws the next component: it starts over.
  static getDerivedStateFromProps(props: { name: string }, state: { error?: Error; name?: string }) {
    return props.name === state.name ? null : { name: props.name, error: undefined }
  }
  override render() {
    if (!this.state.error) return this.props.children
    return createElement("div", { style: missingStyle }, `${this.props.name}: ${this.state.error.message}`)
  }
}

export function createGuest(init: GuestInit): Guest {
  const components = init.components as Record<string, ComponentType<Props>>
  const loaders: Record<string, () => Promise<unknown>> = { ...init.lazyComponents }
  const names = [...Object.keys(components), ...Object.keys(loaders)]
  const iconSets = init.iconSets ?? {}
  const drawn = new Map<unknown, ComponentType<Props>>()
  const deferred = new Map<string, ComponentType<Props>>()

  /** An app component whose module loads the first time it's drawn. */
  const onDemand = (name: string): ComponentType<Props> | undefined => {
    const load = loaders[name]
    if (!load) return undefined
    let component = deferred.get(name)
    if (!component) {
      component = lazy(async () => ({ default: (await load()) as ComponentType<Props> }))
      deferred.set(name, component)
    }
    return component
  }

  /** A project component, a library's (`mui/Button`, `baseui/Dialog.Root`), or an icon such as `lucide/Heart`. */
  const lookup = (name: string): ComponentType<Props> | undefined => {
    if (components[name]) return components[name]
    if (name in loaders) return onDemand(name)
    const slash = name.indexOf("/")
    if (slash === -1) return undefined
    const set = iconSets[name.slice(0, slash)]
    return set ? icon(set, name.slice(slash + 1)) : undefined
  }

  /** An icon component; for a set of icon data, one that draws the data with the set's renderer. */
  const icon = (set: GuestIconSet, name: string): ComponentType<Props> | undefined => {
    const value = set.module[name]
    if (!set.renderer) return isComponent(value) ? value : undefined
    if (value === undefined || isComponent(value) || !isComponent(set.renderer.component)) return undefined
    let component = drawn.get(value)
    if (!component) {
      const { component: renderer, prop } = set.renderer
      component = (props: Props) => createElement(renderer, { ...props, [prop]: value })
      drawn.set(value, component)
    }
    return component
  }

  const iconNames = new Map<string, string[]>()
  /** An icon set's icons, each once: aliases of one icon (`Heart`, `HeartIcon`) keep the shortest name. */
  const namesOf = (library: string): string[] => {
    const set = iconSets[library]
    if (!set) return []
    let names = iconNames.get(library)
    if (names) return names
    const match = set.match ? new RegExp(set.match) : /^[A-Z]/
    const excluded = new Set(set.exclude)
    const byValue = new Map<unknown, string>()
    for (const [name, value] of Object.entries(set.module)) {
      if (!match.test(name) || excluded.has(name) || !icon(set, name)) continue
      const kept = byValue.get(value)
      if (kept === undefined || name.length < kept.length || (name.length === kept.length && name < kept)) {
        byValue.set(value, name)
      }
    }
    names = [...byValue.values()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    iconNames.set(library, names)
    return names
  }

  const toReact = (node: RenderNode, key?: number): ReactNode => {
    switch (node.kind) {
      case "text":
        return node.text
      case "element": {
        const props = {
          ...attributesFor(node.tag, node.attributes),
          key,
          style: node.style,
          "data-canvas-node": node.nodeId
        }
        // Void elements like img take no children, not even an empty list.
        if (node.children.length === 0) return createElement(node.tag, props)
        return createElement(node.tag, props, ...node.children.map((child, index) => toReact(child, index)))
      }
      case "component": {
        const component = lookup(node.component)
        if (!component) {
          return createElement("div", { key, style: missingStyle }, `Unknown component "${node.component}"`)
        }
        const props: Props = { ...node.props, "data-canvas-node": node.nodeId }
        let children: ReactNode[] | undefined
        for (const [slot, nodes] of Object.entries(node.slots)) {
          const rendered = nodes.map((child, index) => toReact(child, index))
          // The default slot becomes children; any other slot is a node-valued prop.
          if (slot === "children") children = rendered
          else props[slot] = rendered.length === 1 ? rendered[0] : rendered
        }
        const element = children ? createElement(component, props, ...children) : createElement(component, props)
        // One still loading draws nothing until it's ready, and the rest of the frame doesn't wait for it.
        const ready = node.component in loaders ? createElement(Suspense, { fallback: null }, element) : element
        return createElement(ComponentBoundary, { key, name: node.component }, ready)
      }
    }
  }

  return {
    renderer: "react",
    components: names,
    hasComponent: (name) => lookup(name) !== undefined,
    addComponents(sources) {
      for (const [id, source] of Object.entries(sources)) {
        if (components[id] || id in loaders) continue
        // The dev server builds any of the project's files when it's asked for one, as it does for the app.
        const url = new URL(`/${source.path.replace(/^\.?\//, "")}`, projectOrigin).href
        loaders[id] = () =>
          import(/* @vite-ignore */ url).then((module: Record<string, unknown>) =>
            source.export.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], module)
          )
        names.push(id)
      }
    },
    iconNames: namesOf,
    css: init.css,
    ...(init.packageCss ? { packageCss: init.packageCss } : {}),
    ...(init.tokenCategories ? { tokenCategories: init.tokenCategories } : {}),
    mount(target, tree, options = {}): MountHandle {
      const report = (error: unknown) => options.onError?.(error)
      const frame = frameOf(target, options.globals ?? {})
      const decorate = options.bare ? (content: ReactNode) => content : decorators(init.decorators, frame, report)
      const root = createRoot(target, {
        onUncaughtError: report,
        // An error a component's boundary caught names the component, so a frame says which one failed.
        onCaughtError: (error, info) => {
          const name = (info.errorBoundary as ComponentBoundary | null | undefined)?.props.name
          const message = error instanceof Error ? error.message : String(error)
          report(name ? new Error(`${name}: ${message}`) : error)
        }
      })
      const render = (nodes: RenderNode[]) => root.render(decorate(nodes.map((node, index) => toReact(node, index))))
      render(tree)
      return {
        update: render,
        unmount: () => {
          root.unmount()
          frame.undo()
        }
      }
    }
  }
}

/** Every frame's stand-in body has this attribute (core's `bodyAttribute`), which the project's CSS is rewritten to. */
const bodySelector = "[data-canvas-body]"

/** What a decorator can know about the frame it decorates. */
interface Frame {
  globals: Record<string, string>
  /** The frame's shadow root, where its styles live. */
  root: ShadowRoot | Document
  /** The element standing in for the frame's `<body>`. */
  body: HTMLElement
  /** Values from `$call`, made once per frame. */
  made: Map<string, unknown>
  /** What takes back each class, attribute and style decorators put on the body, newest last. */
  undos: (() => void)[]
  undo(): void
}

function frameOf(target: HTMLElement, globals: Record<string, string>): Frame {
  const undos: (() => void)[] = []
  return {
    globals,
    root: target.getRootNode() as ShadowRoot | Document,
    body: target.parentElement ?? target,
    made: new Map(),
    undos,
    undo: () => {
      for (const undo of undos.splice(0).reverse()) undo()
    }
  }
}

/**
 * A Storybook decorator: `Story` renders what's inside, and the decorator returns what goes around it. Library
 * decorators written as data become these, so a project's own decorators can join them later unchanged.
 */
type StoryDecorator = (Story: () => ReactNode, context: { globals: Record<string, string> }) => ReactNode

/**
 * Wraps a frame's content in its libraries' decorators. A manifest lists them outermost first, as they nest in JSX, so
 * the first one wraps everything after it. Body classes, attributes and styles are set on the frame straight away.
 */
function decorators(
  setup: GuestDecorators | undefined,
  frame: Frame,
  report: (error: unknown) => void
): (content: ReactNode) => ReactNode {
  if (!setup || setup.list.length === 0) return (content) => content
  const compiled: StoryDecorator[] = []
  for (const { library, decorator } of setup.list) {
    if (!applies(decorator, frame.globals)) continue
    try {
      const made = compile(decorator, setup, frame)
      if (made) compiled.push(made)
    } catch (error) {
      report(
        new Error(`${library}'s decorator didn't apply: ${error instanceof Error ? error.message : String(error)}`)
      )
    }
  }
  const context = { globals: frame.globals }
  return (content) =>
    compiled.reduceRight<() => ReactNode>(
      (story, decorator) => () => decorator(story, context),
      () => createElement(Fragment, null, content)
    )()
}

function applies(decorator: LibraryDecorator, globals: Record<string, string>): boolean {
  return Object.entries(decorator.when ?? {}).every(([name, value]) => globals[name] === value)
}

function compile(decorator: LibraryDecorator, setup: GuestDecorators, frame: Frame): StoryDecorator | undefined {
  const value = (raw: unknown) => resolve(raw, setup, frame)
  const { undos } = frame
  if (decorator.class !== undefined) {
    const names = String(value(decorator.class) ?? "")
      .split(/\s+/)
      .filter((name) => name && !frame.body.classList.contains(name))
    frame.body.classList.add(...names)
    undos.push(() => frame.body.classList.remove(...names))
    return undefined
  }
  if (decorator.attributes) {
    for (const [name, raw] of Object.entries(decorator.attributes)) {
      const previous = frame.body.getAttribute(name)
      const next = value(raw)
      if (next === undefined || next === null || next === false) continue
      frame.body.setAttribute(name, String(next))
      undos.push(() => (previous === null ? frame.body.removeAttribute(name) : frame.body.setAttribute(name, previous)))
    }
    return undefined
  }
  if (decorator.style) {
    for (const [name, raw] of Object.entries(decorator.style)) {
      const next = value(raw)
      if (next === undefined || next === null) continue
      const previous = frame.body.style.getPropertyValue(name)
      frame.body.style.setProperty(name, String(next))
      undos.push(() => frame.body.style.setProperty(name, previous))
    }
    return undefined
  }
  const spec = decorator.wrap ?? decorator.add
  if (!spec) return undefined
  const component = exported(setup, spec.import, spec.component)
  if (!isComponent(component)) throw new Error(`${spec.import} has no component ${spec.component}`)
  const props = (spec.props ? value(spec.props) : {}) as Props
  if (decorator.wrap) return (Story) => createElement(component, props, Story())
  return (Story) => createElement(Fragment, null, Story(), createElement(component, props))
}

/** A decorator's value for this frame: plain JSON as written, and the four special forms worked out. */
function resolve(raw: unknown, setup: GuestDecorators, frame: Frame): unknown {
  if (Array.isArray(raw)) return raw.map((item) => resolve(item, setup, frame))
  if (typeof raw !== "object" || raw === null) return raw
  const record = raw as Record<string, unknown>
  if (typeof record.$import === "string") return exported(setup, record.$import, String(record.export ?? "default"))
  if (typeof record.$call === "object" && record.$call !== null) {
    const key = JSON.stringify(record)
    if (!frame.made.has(key)) {
      const callee = record.$call as { import: string; export?: string }
      const fn = exported(setup, callee.import, callee.export ?? "default")
      if (typeof fn !== "function") throw new Error(`${callee.import} has no function ${callee.export ?? "default"}`)
      const args = Array.isArray(record.args) ? record.args.map((arg) => resolve(arg, setup, frame)) : []
      frame.made.set(key, (fn as (...args: unknown[]) => unknown)(...args))
    }
    return frame.made.get(key)
  }
  if (typeof record.$global === "string") {
    const values = (record.values ?? {}) as Record<string, unknown>
    const chosen = frame.globals[record.$global]
    const picked = chosen !== undefined && chosen in values ? values[chosen] : record.default
    return resolve(picked, setup, frame)
  }
  if (typeof record.$frame === "string") {
    switch (record.$frame) {
      case "root":
        return frame.root
      // The element the frame's shadow root hangs from, which the project's `:root[...]` rules match as `:host(...)`.
      case "host":
        return frame.root instanceof ShadowRoot ? frame.root.host : frame.root.documentElement
      case "body":
        return frame.body
      case "document":
        return frame.body.ownerDocument
      case "dir":
        return frame.body.closest("[dir]")?.getAttribute("dir") ?? "ltr"
      case "lang":
        return frame.body.closest("[lang]")?.getAttribute("lang") ?? "en-US"
      // A selector for the body alone, for libraries that write their variables to a selector they're given.
      case "selector":
        return bodySelector
      default:
        throw new Error(`Unknown frame value "${record.$frame}"`)
    }
  }
  if ("$function" in record) return () => resolve(record.$function, setup, frame)
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, resolve(item, setup, frame)]))
}

/** An export of a decorator's module, following dots into namespaces (`Tooltip.Provider`). */
function exported(setup: GuestDecorators, specifier: string, path: string): unknown {
  const module = setup.modules[specifier]
  if (!module) throw new Error(`${specifier} isn't loaded`)
  if ("loadError" in module && typeof module.loadError === "string") {
    throw new Error(`${specifier} couldn't load: ${module.loadError}`)
  }
  let value: unknown = module
  for (const part of path.split(".")) value = (value as Record<string, unknown> | undefined)?.[part]
  return value
}
