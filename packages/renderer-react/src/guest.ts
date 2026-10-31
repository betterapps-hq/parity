// Compiled by the customer's build tool, so `react` and `react-dom` here are the customer's copies.
import type {
  ComponentRenderStatus,
  DrawnNodes,
  Guest,
  GuestDecorators,
  GuestIconSet,
  GuestInit,
  LibraryDecorator,
  MountHandle,
  RenderNode
} from "@parity-app/core"
import {
  Component,
  type ComponentType,
  createElement,
  Fragment,
  type Key,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState
} from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { currentRootFiber, type Fiber, indexDrawnNodes } from "./drawn-nodes.ts"
import { FrameWindowContext, frameWindow } from "./viewport.ts"

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

/** What a component's boundaries tell the guest: it drew, it failed, or a boundary that failed no longer shows it. */
interface RenderReport {
  drawn(name: string): void
  failed(name: string, error: Error): void
  cleared(name: string): void
}

interface BoundaryState {
  error?: Error
  name?: string
  source?: number
}

interface BoundaryProps {
  name: string
  /** How many times the component has come from a new file, so one that failed starts over once it does. */
  source: number
  /** The design node it draws, which is how the canvas finds the component's DOM in React's tree. */
  nodeId: string
  report: RenderReport
  children?: ReactNode
}

/**
 * Keeps one component's error to itself: it draws a marked box in its place, and the rest of the frame renders. React
 * still reports the error to the root, so the canvas and agents hear about it, and the guest's render status says
 * which components draw and which fail. Every component node has one, so it also marks where the node is in React's
 * tree, whatever the component does with its props.
 */
class ComponentBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = {}
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
  // Boundaries are keyed by position, so one whose node was removed draws the next component: it starts over. So does
  // one whose component now comes from another file, which may not fail.
  static getDerivedStateFromProps(props: { name: string; source: number }, state: BoundaryState) {
    return props.name === state.name && props.source === state.source
      ? null
      : { name: props.name, source: props.source, error: undefined }
  }
  override componentDidMount() {
    if (!this.state.error) this.props.report.drawn(this.props.name)
  }
  override componentDidCatch(error: Error) {
    this.props.report.failed(this.props.name, error)
  }
  override componentDidUpdate(_props: unknown, previous: BoundaryState) {
    if (previous.error && previous.error !== this.state.error) this.props.report.cleared(previous.name!)
    if (!this.state.error) this.props.report.drawn(this.props.name)
  }
  override componentWillUnmount() {
    if (this.state.error) this.props.report.cleared(this.state.name!)
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
  /** What the guest loaded with, for a component added over one of them to go back to once its new source goes. */
  const loadedWith = { components: { ...components }, loaders: { ...loaders } }
  const iconSets = init.iconSets ?? {}
  const drawn = new Map<unknown, ComponentType<Props>>()
  const deferred = new Map<string, ComponentType<Props>>()

  /** Modules still loading for components drawn on demand. */
  const inFlight = new Set<Promise<unknown>>()

  /**
   * Each drawn component's status: failing while any of its boundaries shows an error, with the latest, else drawn.
   * Listeners hear about changes once per task, as a canvas draws many frames at once.
   */
  const drawnOnce = new Set<string>()
  /** Components drawn on demand whose modules have loaded: until then, a boundary drawing one draws nothing. */
  const loadedOnDemand = new Set<string>()
  const failing = new Map<string, { count: number; error: string }>()
  const listeners = new Set<() => void>()
  /** Where each component added since the guest loaded comes from, so adding one again from the same file changes nothing. */
  const added = new Map<string, string>()
  /** How many times each component has come from a new file, for its boundaries. */
  const moves = new Map<string, number>()
  let revision = 0
  const revisionListeners = new Set<() => void>()
  let statuses: Record<string, ComponentRenderStatus> = {}
  let pending = false
  const changed = () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      statuses = Object.fromEntries([
        ...[...drawnOnce].map((name) => [name, { drawn: true as const }]),
        ...[...failing].map(([name, { error }]) => [name, { error }])
      ])
      for (const listener of listeners) listener()
    })
  }
  const report: RenderReport = {
    drawn(name) {
      if (drawnOnce.has(name) || (name in loaders && !loadedOnDemand.has(name))) return
      drawnOnce.add(name)
      changed()
    },
    failed(name, error) {
      failing.set(name, { count: (failing.get(name)?.count ?? 0) + 1, error: error.message })
      changed()
    },
    cleared(name) {
      const now = failing.get(name)
      if (!now) return
      if (now.count > 1) failing.set(name, { ...now, count: now.count - 1 })
      else failing.delete(name)
      changed()
    }
  }

  /**
   * An app component whose module loads the first time it's drawn. It draws nothing until then, and the rest of the
   * frame doesn't wait. React's `lazy` would do this too, but holds back what was suspended for 300ms after it loads,
   * which an offscreen render waiting on `loaded()` would miss.
   */
  const onDemand = (name: string): ComponentType<Props> | undefined => {
    const load = loaders[name]
    if (!load) return undefined
    let component = deferred.get(name)
    if (!component) {
      let ready: ComponentType<Props> | undefined
      let failure: { error: unknown } | undefined
      let loading: Promise<void> | undefined
      const start = () => {
        if (loading) return loading
        loading = load().then(
          (value) => {
            ready = value as ComponentType<Props>
            loadedOnDemand.add(name)
          },
          (error: unknown) => void (failure = { error })
        )
        inFlight.add(loading)
        void loading.finally(() => inFlight.delete(loading!))
        return loading
      }
      component = function OnDemand(props: Props) {
        const [, redraw] = useState(0)
        const own = useContext(FrameWindowContext)
        useEffect(() => {
          if (ready || failure) return
          void start().then(() => {
            // In the frame's window, as the rest of the frame first drew.
            const again = () => redraw((count) => count + 1)
            if (own) own.run(() => flushSync(again))
            else again()
          })
        }, [own])
        // Its boundary only hears it drew when the boundary draws, so once loaded it says so itself. A component that
        // throws never gets here.
        useEffect(() => {
          if (ready) report.drawn(name)
        })
        // Thrown while drawing, so the component's boundary shows why it couldn't load.
        if (failure) throw failure.error
        return ready ? createElement(ready, props) : null
      }
      deferred.set(name, component)
    }
    return component
  }

  /**
   * A project component, a library's (`mui/Button`, `baseui/Dialog.Root`), or an icon such as `lucide/Heart`, or
   * `heroicons/16/solid/CogIcon` in a style its set keeps in a module of its own.
   */
  const lookup = (name: string): ComponentType<Props> | undefined => {
    if (components[name]) return components[name]
    if (name in loaders) return onDemand(name)
    const slash = name.indexOf("/")
    if (slash === -1) return undefined
    const set = iconSets[name.slice(0, slash)]
    if (!set) return undefined
    const rest = name.slice(slash + 1)
    const last = rest.lastIndexOf("/")
    return last === -1 ? icon(set, rest) : icon(set, rest.slice(last + 1), rest.slice(0, last))
  }

  /** The module a set's icons in a style are drawn from: its own, or the style's. */
  const moduleOf = (set: GuestIconSet, style: string | undefined) => (style ? set.styles?.[style] : set.module)

  /** An icon component; for a set of icon data, one that draws the data with the set's renderer. */
  const icon = (set: GuestIconSet, name: string, style?: string): ComponentType<Props> | undefined => {
    const value = moduleOf(set, style)?.[name]
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

  const iconLists = new Map<string, { names: string[]; aliases: Record<string, string[]> }>()
  /**
   * An icon set's icons, each once: aliases of one icon (`Heart`, `HeartIcon`) keep the shortest name the set's
   * pattern matches, which keeps the others for search, as `TriangleAlert` keeps Lucide's older `AlertTriangle` and
   * Hugeicons' `Settings01Icon` keeps `Gear` and `Cog`, which its pattern leaves out of the list.
   */
  const iconList = (library: string, style?: string): { names: string[]; aliases: Record<string, string[]> } => {
    const set = iconSets[library]
    const module = set && moduleOf(set, style)
    if (!module) return { names: [], aliases: {} }
    const key = style ? `${library}/${style}` : library
    let list = iconLists.get(key)
    if (list) return list
    const match = set.match ? new RegExp(set.match) : /^[A-Z]/
    const excluded = new Set(set.exclude)
    const byValue = new Map<unknown, string[]>()
    for (const [name, value] of Object.entries(module)) {
      if (!/^[A-Z]/.test(name) || excluded.has(name) || !icon(set, name, style)) continue
      const group = byValue.get(value)
      if (group) group.push(name)
      else byValue.set(value, [name])
    }
    list = { names: [], aliases: {} }
    const shorter = (a: string, b: string) => a.length - b.length || byCodeUnit(a, b)
    for (const group of byValue.values()) {
      const kept = group.filter((name) => match.test(name)).sort(shorter)[0]
      if (!kept) continue
      const others = group.filter((name) => name !== kept).sort(shorter)
      list.names.push(kept)
      if (others.length > 0) list.aliases[kept] = others
    }
    list.names.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    iconLists.set(key, list)
    return list
  }

  /**
   * Values a library's package makes (`collection={createTreeCollection(...)}`), each made once by calling the
   * package's function with its arguments, from the modules the builder loaded for them.
   */
  const made = new Map<string, unknown>()
  const madeValue = (value: unknown): unknown => {
    // In a list too (Fluent's `columns={[createTableColumn(...)]}`).
    if (Array.isArray(value)) return value.some(isMade) ? value.map(madeValue) : value
    const call = typeof value === "object" && value !== null ? (value as Props).$call : undefined
    if (typeof call !== "object" || call === null) return value
    const key = JSON.stringify(value)
    if (!made.has(key)) {
      const callee = call as { import: string; export: string }
      if (!init.decorators) throw new Error(`${callee.import} isn't loaded`)
      const fn = exported(init.decorators, callee.import, callee.export)
      if (typeof fn !== "function") throw new Error(`${callee.import} has no function ${callee.export}`)
      const args = (value as Props).args
      const result = (fn as (...args: unknown[]) => unknown)(...(Array.isArray(args) ? args.map(madeValue) : []))
      // The methods the examples call on it (`toaster.create({ title })`), once.
      for (const step of ((value as Props).methods ?? []) as { method: string; args?: unknown[] }[]) {
        const method = (result as Record<string, unknown> | null | undefined)?.[step.method]
        if (typeof method === "function") method.apply(result, (step.args ?? []).map(madeValue))
      }
      made.set(key, result)
    }
    return made.get(key)
  }
  const isMade = (value: unknown): boolean =>
    typeof value === "object" && value !== null && typeof (value as Props).$call === "object"
  const madeProps = (props: Props | undefined): Props =>
    Object.fromEntries(Object.entries(props ?? {}).map(([name, value]) => [name, madeValue(value)]))

  /**
   * What a render function passes on (`extra`) goes to the node itself, as cloning the element it returns would, since a
   * component is wrapped in its boundary: over the node's own props and slots, its style over the node's, and its key
   * on what's returned.
   */
  const toReact = (node: RenderNode, key?: Key, extra?: Props): ReactNode => {
    const { key: given, style: givenStyle, ...passed } = extra ?? {}
    const keyed = (given as Key | undefined) ?? key
    switch (node.kind) {
      case "text":
        return node.text
      case "element": {
        const props = {
          ...attributesFor(node.tag, node.attributes),
          ...passed,
          key: keyed,
          style: givenStyle ? { ...node.style, ...(givenStyle as object) } : node.style,
          "data-canvas-node": node.nodeId
        }
        // Void elements like img take no children, not even an empty list; nor does one given its children.
        if (node.children.length === 0 || "children" in passed) return createElement(node.tag, props)
        return createElement(node.tag, props, ...node.children.map((child, index) => toReact(child, index)))
      }
      case "component": {
        const component = lookup(node.component)
        if (!component) {
          return createElement(
            "div",
            { key: keyed, style: missingStyle, "data-canvas-node": node.nodeId },
            `Unknown component "${node.component}"`
          )
        }
        // The canvas finds a component by its boundary, below, not by this prop: a component may not render it, or
        // render it on an inner element. It still marks the DOM of components that pass it on, for scripts that look.
        const props: Props = { ...madeProps(node.props), "data-canvas-node": node.nodeId }
        if (givenStyle) props.style = { ...(props.style as object | undefined), ...(givenStyle as object) }
        let children: ReactNode[] | undefined
        for (const [slot, nodes] of Object.entries(node.slots)) {
          // A `$render:` slot is a function the component calls (`renderInput`, function children); `$renderWith:`
          // spreads what it's called with onto the one element it returns, and `?pass=a,b` gives it to those props, over
          // what's spread, as JSX would.
          const render = /^\$render(With)?:([^?]+)(?:\?pass=(.+))?$/.exec(slot)
          if (render) {
            const [, spread, prop, pass] = render
            props[prop!] = (argument: unknown) => {
              const spreadProps = spread && typeof argument === "object" && argument ? (argument as Props) : {}
              const named = pass ? Object.fromEntries(pass.split(",").map((name) => [name, argument])) : {}
              const passing = spread || pass ? { ...spreadProps, ...named } : undefined
              // Only the one element a function returns takes what it's called with.
              const rendered = nodes.map((child, index) =>
                toReact(child, index, nodes.length === 1 ? passing : undefined)
              )
              return rendered.length === 1 ? rendered[0] : rendered
            }
            continue
          }
          const rendered = nodes.map((child, index) => toReact(child, index))
          // The default slot becomes children; any other slot is a node-valued prop.
          if (slot === "children") children = rendered
          else props[slot] = rendered.length === 1 ? rendered[0] : rendered
        }
        Object.assign(props, passed)
        // Children it's given replace the slot's.
        if ("children" in passed) children = undefined
        const element = children ? createElement(component, props, ...children) : createElement(component, props)
        return createElement(
          ComponentBoundary,
          { key: keyed, name: node.component, source: moves.get(node.component) ?? 0, nodeId: node.nodeId, report },
          element
        )
      }
    }
  }

  return {
    renderer: "react",
    components: names,
    hasComponent: (name) => lookup(name) !== undefined,
    async loaded() {
      // A component that loads can draw others that load too, so this waits for a pass that starts none.
      for (let pass = 0; pass < 10; pass++) {
        if (inFlight.size === 0) {
          await new Promise((resolve) => setTimeout(resolve, 16))
          if (inFlight.size === 0) return
        }
        await Promise.allSettled(inFlight)
      }
    },
    addComponents(sources) {
      let moved = false
      for (const [id, source] of Object.entries(sources)) {
        const from = `${source.path}#${source.export}`
        if (added.get(id) === from) continue
        added.set(id, from)
        moves.set(id, (moves.get(id) ?? 0) + 1)
        moved = true
        // The dev server builds any of the project's files when it's asked for one, as it does for the app.
        loaders[id] = () =>
          import(/* @vite-ignore */ new URL(`/${source.path.replace(/^\.?\//, "")}`, projectOrigin).href).then(
            (module: Record<string, unknown>) =>
              source.export
                .split(".")
                .reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], module)
          )
        // One it had already has moved to another file, so it's drawn from there from now on.
        delete components[id]
        deferred.delete(id)
        loadedOnDemand.delete(id)
        if (!names.includes(id)) names.push(id)
      }
      if (!moved) return
      revision++
      for (const listener of revisionListeners) listener()
    },
    removeComponents(ids) {
      let moved = false
      for (const id of ids) {
        if (!added.delete(id)) continue
        moves.set(id, (moves.get(id) ?? 0) + 1)
        moved = true
        delete loaders[id]
        delete components[id]
        deferred.delete(id)
        loadedOnDemand.delete(id)
        // One the guest loaded with is drawn as it loaded again; one it was only given is gone.
        const component = loadedWith.components[id]
        const loader = loadedWith.loaders[id]
        if (component) components[id] = component
        else if (loader) loaders[id] = loader
        else names.splice(names.indexOf(id), 1)
      }
      if (!moved) return
      revision++
      for (const listener of revisionListeners) listener()
    },
    revision: {
      get: () => revision,
      subscribe(listener) {
        revisionListeners.add(listener)
        return () => revisionListeners.delete(listener)
      }
    },
    renderStatus: {
      get: () => statuses,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    },
    iconNames: (library, style) => iconList(library, style).names,
    iconAliases: (library, style) => iconList(library, style).aliases,
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
      const own = options.viewport && frameWindow(target, options.viewport)
      const drawn = watchDrawnNodes(root, target)
      const draw = (nodes: RenderNode[]) =>
        createElement(
          FrameWindowContext.Provider,
          { value: own },
          createElement(
            Committed,
            { onCommit: drawn.changed },
            decorate(nodes.map((node, index) => toReact(node, index)))
          )
        )
      if (!own) {
        root.render(draw(tree))
        return {
          update: (nodes) => root.render(draw(nodes)),
          unmount: () => {
            drawn.dispose()
            root.unmount()
            frame.undo()
          },
          drawnNodes: drawn.read
        }
      }

      // The frame's code asks its own window while it renders, effects included, so it renders synchronously. That's
      // just after it's asked, so never inside one of the canvas's renders, should the canvas and project share a React.
      let unmounted = false
      let next: RenderNode[] | undefined
      const soon = (work: () => void) =>
        queueMicrotask(() => {
          if (!unmounted) own.run(() => flushSync(work))
        })
      const render = (nodes: RenderNode[]) => {
        if (next === undefined) {
          soon(() => {
            const latest = next!
            next = undefined
            root.render(draw(latest))
          })
        }
        next = nodes
      }
      render(tree)
      return {
        update: render,
        resize: (viewport) => soon(() => own.resize(viewport)),
        unmount: () => {
          unmounted = true
          drawn.dispose()
          root.unmount()
          own.dispose()
          frame.undo()
        },
        drawnNodes: drawn.read
      }
    }
  }
}

/** Compares two strings by their UTF-16 code units, as `sort` does without a comparer. */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1
  return a > b ? 1 : 0
}

/** Tells a frame's node index that React committed the frame, which can move a node's id to other DOM. */
function Committed({ onCommit, children }: { onCommit: () => void; children?: ReactNode }) {
  useLayoutEffect(onCommit)
  return children
}

/**
 * Where a frame's design nodes are drawn, worked out from React's tree when it's asked for after a change: a commit of
 * the frame, or DOM added to or taken from it, as a component re-rendering itself does. Until then the last answer
 * stands, so hovering asks without walking the tree each time.
 */
function watchDrawnNodes(root: Root, target: HTMLElement) {
  const shadow = target.getRootNode()
  const frame: Node = shadow instanceof ShadowRoot ? shadow : target
  let stale = true
  let drawn: DrawnNodes | undefined
  const observer = new MutationObserver(() => {
    stale = true
  })
  observer.observe(frame, { childList: true, subtree: true })
  return {
    read: (): DrawnNodes | undefined => {
      if (observer.takeRecords().length > 0) stale = true
      if (!stale) return drawn
      stale = false
      drawn = readDrawnNodes(root, target, frame)
      return drawn
    },
    changed: () => {
      stale = true
    },
    dispose: () => {
      observer.disconnect()
    }
  }
}

/**
 * The frame's design nodes as React's tree has them. A component node is the fiber of its boundary, and an element
 * node the element the guest drew for it. Undefined when the tree isn't the shape React 19 gives it.
 */
function readDrawnNodes(root: Root, target: HTMLElement, frame: Node): DrawnNodes | undefined {
  const fiber = currentRootFiber(root, target)
  if (!fiber) return undefined
  const drawn = indexDrawnNodes(fiber, { nodeOf: nodeOfFiber, inside: (element) => frame.contains(element) })
  // An element the guest drew always carries its node's id. If the index puts it in another node, it's misreading
  // React's tree, and the attribute is the better guide.
  const marked = (frame as ParentNode).querySelector("[data-canvas-node]")
  if (!drawn || (marked && drawn.nodeOf(marked) !== marked.getAttribute("data-canvas-node"))) return undefined
  return drawn
}

function nodeOfFiber(fiber: Fiber): string | undefined {
  if (fiber.stateNode instanceof ComponentBoundary) return fiber.stateNode.props.nodeId
  if (typeof fiber.type !== "string") return undefined
  const id = (fiber.memoizedProps as Record<string, unknown> | null)?.["data-canvas-node"]
  return typeof id === "string" ? id : undefined
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
    const names = String((value(decorator.class) ?? "") as unknown)
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
      frame.body.setAttribute(name, String(next as unknown))
      undos.push(() => (previous === null ? frame.body.removeAttribute(name) : frame.body.setAttribute(name, previous)))
    }
    return undefined
  }
  if (decorator.style) {
    for (const [name, raw] of Object.entries(decorator.style)) {
      const next = value(raw)
      if (next === undefined || next === null) continue
      const previous = frame.body.style.getPropertyValue(name)
      frame.body.style.setProperty(name, String(next as unknown))
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
  if (typeof record.$import === "string")
    return exported(setup, record.$import, String((record.export ?? "default") as unknown))
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
