// Compiled by the customer's build tool, so `react` and `react-dom` here are the customer's copies.
import type {
  ComponentRenderStatus,
  DrawnNodes,
  ElementAttributes,
  Guest,
  GuestDecorators,
  GuestIconSet,
  GuestInit,
  LayerFailure,
  LibraryDecorator,
  MountHandle,
  RenderNode
} from "@parity-app/core"
// Only modules that import nothing at runtime, since this file runs in the project's own bundle (`evaluate.ts`).
import { iconAliases, shorterName } from "@parity-app/core/icon-names"
import {
  evaluateValue,
  exportOf,
  isComposite,
  isText,
  readRenderSlotKey,
  type ValueHost
} from "@parity-app/core/values/evaluate"
import {
  Component,
  type ComponentType,
  createContext,
  createElement,
  Fragment,
  type Key,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore
} from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import {
  currentRootFiber,
  type Fiber,
  indexDrawnNodes,
  type StylePlacement,
  styleOf,
  stylePlacement
} from "./drawn-nodes.ts"
import { FrameWindowContext, frameWindow } from "./viewport.ts"

/** The props of a project's or a library's component, which can take anything. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a customer's component takes whatever props it declares
type Props = Record<string, unknown>

/** A value in a library's decorator, worked out against the frame. Core's schema leaves its shape open. */
type DecoratorValue = LibraryDecorator["class"]

/**
 * The project's dev server, which serves its public files. Frames live in the canvas's own page, so a path like
 * `/images/photo.jpg` would otherwise resolve against the canvas rather than the project.
 */
const projectOrigin = new URL(import.meta.url).origin

/** A video's boolean attributes by their HTML names, as `videoAttributes` writes them, with the props React takes. */
const videoFlags: ReadonlyMap<string, string> = new Map([
  ["autoplay", "autoPlay"],
  ["muted", "muted"],
  ["loop", "loop"],
  ["playsinline", "playsInline"],
  ["controls", "controls"]
])

/** An element's attributes as React props: a picture's or video's path against the project, a video's flags on. */
export function attributesFor(tag: string, attributes: ElementAttributes | undefined) {
  if ((tag !== "img" && tag !== "video") || !attributes) {
    return attributes ?? {}
  }

  const props: Props = {}

  for (const [name, value] of Object.entries(attributes)) {
    const flag = tag === "video" ? videoFlags.get(name) : undefined

    if (flag) {
      props[flag] = true
    } else if (name === "src" && value.startsWith("/") && !value.startsWith("//")) {
      props.src = new URL(value, projectOrigin).href
    } else {
      props[name] = value
    }
  }

  return props
}

const missingStyle = {
  padding: "8px 12px",
  border: "1px dashed #e11d48",
  borderRadius: "6px",
  color: "#e11d48",
  font: "12px ui-monospace, monospace"
}

/**
 * A failed component's box (PAR-165): a thin dashed red outline, as a missing component's, over fine red hatching, with
 * a small warning icon and no text, so it reads as a broken layer at any zoom without crowding the design. Why it failed
 * is in the console and on its row in Layers. Its styles are its own, inline, so the project's CSS and the frame's
 * theme leave it as it is.
 */
const failedStyle = {
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  minWidth: "32px",
  minHeight: "32px",
  padding: "0 8px",
  border: "1px dashed #e11d48",
  borderRadius: "6px",
  background: "repeating-linear-gradient(-45deg, rgba(225, 29, 72, 0.45) 0 1px, transparent 1px 7px)"
} as const

/** What a failed component draws in its place: `failedStyle` with a warning icon, named for scripts that look. */
function failedBox(name: string, message: string) {
  return createElement(
    "div",
    { style: failedStyle, "data-failed-component": name, "data-error": message },
    createElement(
      "svg",
      {
        width: 14,
        height: 14,
        viewBox: "0 0 24 24",
        fill: "#fff1f2",
        stroke: "#e11d48",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true
      },
      createElement("path", {
        d: "M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"
      }),
      createElement("path", { d: "M12 8v4M12 16h.01" })
    )
  )
}

/** Function components, and the objects `forwardRef`, `memo` and `lazy` return. */
function isComponent(value: unknown): value is ComponentType<Props> {
  return value instanceof Function || (isComposite(value) && "$$typeof" in value)
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

/** The failing layers of one frame, which its boundaries tell when they fail and when they draw again. */
interface FrameFailures {
  failed(boundary: ComponentBoundary, failure: LayerFailure): void
  cleared(boundary: ComponentBoundary): void
}

const FrameFailuresContext = createContext<FrameFailures | undefined>(undefined)

/**
 * Keeps a frame's failing layers, one for each boundary showing an error, and tells `listener` once per task when they
 * change, and after each commit of the frame, so a frame drawn afresh says it has none. Each node has one entry (a slot
 * drawn more than once fails as one layer). It stops once the frame is disposed.
 */
function frameFailures(listener: ((failures: readonly LayerFailure[]) => void) | undefined) {
  const failing = new Map<ComponentBoundary, LayerFailure>()
  let pending = false
  let disposed = false

  const changed = () => {
    if (!listener || pending) {
      return
    }

    pending = true
    queueMicrotask(() => {
      pending = false

      if (disposed) {
        return
      }

      const byNode = new Map<string, LayerFailure>()

      for (const failure of failing.values()) {
        byNode.set(failure.nodeId, failure)
      }

      listener([...byNode.values()])
    })
  }

  const failures: FrameFailures = {
    failed(boundary, failure) {
      failing.set(boundary, failure)
      changed()
    },
    cleared(boundary) {
      if (failing.delete(boundary)) {
        changed()
      }
    }
  }

  return {
    failures,
    committed: changed,
    dispose: () => {
      disposed = true
    }
  }
}

/**
 * Keeps one component's error to itself: it draws a marked box in its place, and the rest of the frame renders. React
 * still reports the error to the root, so the canvas and agents hear about it, and the guest's render status says
 * which components draw and which fail. Every component node has one, so it also marks where the node is in React's
 * tree, whatever the component does with its props.
 */
class ComponentBoundary extends Component<BoundaryProps, BoundaryState> {
  static override contextType = FrameFailuresContext
  declare context: FrameFailures | undefined
  override state: BoundaryState = {}
  static getDerivedStateFromError(cause: unknown) {
    return { error: cause instanceof Error ? cause : new Error(String(cause)) }
  }
  // Boundaries are keyed by position, so one whose node was removed draws the next component: it starts over. So does
  // one whose component now comes from another file, which may not fail.
  static getDerivedStateFromProps(props: { name: string; source: number }, state: BoundaryState) {
    return props.name === state.name && props.source === state.source
      ? null
      : { name: props.name, source: props.source, error: undefined }
  }
  override componentDidMount() {
    if (!this.state.error) {
      this.props.report.drawn(this.props.name)
    }
  }
  override componentDidCatch(error: Error) {
    this.props.report.failed(this.props.name, error)
    this.context?.failed(this, { nodeId: this.props.nodeId, component: this.props.name, error: error.message })
  }
  override componentDidUpdate(_props: BoundaryProps, previous: BoundaryState) {
    if (previous.error && previous.error !== this.state.error) {
      this.props.report.cleared(previous.name!)
    }

    if (!this.state.error) {
      this.props.report.drawn(this.props.name)
      this.context?.cleared(this)
    }
  }
  override componentWillUnmount() {
    if (this.state.error) {
      this.props.report.cleared(this.state.name!)
    }

    this.context?.cleared(this)
  }
  override render() {
    if (!this.state.error) {
      return this.props.children
    }

    return failedBox(this.props.name, this.state.error.message)
  }
}

/** A component layer as the guest draws it, before anything its parent does to it. */
interface LayerDrawing {
  component: ComponentType<Props>
  props: Props
  children: ReactNode[] | undefined
  boundary: Omit<BoundaryProps, "children">
}

/**
 * Draws a component layer in its boundary, and gives the component what a parent hands the layer by cloning it, as
 * Radix's Slot does for `asChild`. Cloning an element layer merges onto the element itself; a component layer's
 * element is this one, so it merges the same way here, with the component's own props over what it's given: class
 * names joined, styles merged and both handlers called, the layer's first, as Radix's `mergeProps` does. A ref it's
 * given goes to the component, since a function component takes `ref` as a prop in React 19.
 */
function ComponentLayer({ layer, ...given }: { layer: LayerDrawing } & Props) {
  const props = Object.keys(given).length === 0 ? layer.props : mergeGiven(given, layer.props)
  const { name, nodeId } = layer.boundary
  const styles = useContext(LayerStylesContext)
  const styled = hasStyle(props)
  const inner = useSyncExternalStore(styles.subscribe, () => styles.placement(name) === "inner")
  useLayoutEffect(() => {
    if (styled && styles.placement(name) === undefined) {
      styles.check()
    }
  })

  const draw = (props: Props) =>
    layer.children ? createElement(layer.component, props, ...layer.children) : createElement(layer.component, props)

  if (!(inner && styled)) {
    return createElement(ComponentBoundary, layer.boundary, draw(props))
  }

  // It puts its style on an element inside it, so the style goes on a div around it instead, which it fills.
  const { style, ...rest } = props

  const wrapper = createElement(
    "div",
    { style: Object.assign({}, wrapperStyle, style), "data-canvas-node": nodeId },
    draw(rest)
  )

  return createElement(ComponentBoundary, layer.boundary, wrapper)
}

/** A one-cell grid, so the component in it fills the div however the div is sized, and can shrink with it. */
const wrapperStyle = { display: "grid", gridTemplate: "minmax(0, 1fr) / minmax(0, 1fr)" }

/** Whether props have a `style` with any values. */
function hasStyle(props: Props): boolean {
  return isComposite(props.style) && Object.keys(props.style).length > 0
}

/** Whether a prop's value can be spread into a style, as an object or null can. */
function isSpreadable(value: unknown): value is object | null {
  return value === null || (isComposite(value) && !(value instanceof Function))
}

/**
 * What a frame knows of where components put their styles: each component's placement once a layer of it has drawn
 * with a style, and a way to look when one hasn't. Layers hear when a component turns out to put it inside.
 */
interface LayerStyles {
  placement: (name: string) => StylePlacement | undefined
  check: () => void
  subscribe: (listener: () => void) => () => void
}

const LayerStylesContext = createContext<LayerStyles>({
  placement: () => undefined,
  check: () => undefined,
  subscribe: () => () => undefined
})

/** What a parent gives a layer, under the layer's own props, as Radix's Slot merges them. */
function mergeGiven(given: Props, own: Props) {
  const merged = { ...given, ...own }

  for (const [name, value] of Object.entries(own)) {
    const outer = given[name]

    if (outer === undefined) {
      continue
    }

    if (/^on[A-Z]/.test(name) && value instanceof Function && outer instanceof Function) {
      merged[name] = (...args: unknown[]) => {
        const result: unknown = value(...args)
        outer(...args)

        return result
      }
    } else if (name === "style" && isSpreadable(value) && isSpreadable(outer)) {
      merged.style = { ...outer, ...value }
    } else if (name === "className" && isText(value) && isText(outer)) {
      merged.className = [outer, value].filter(Boolean).join(" ")
    }
  }

  return merged
}

export function createGuest(init: GuestInit): Guest {
  // SAFETY: the builder lists the exports it found to be components; one that isn't fails in its boundary when drawn.
  const components = init.components as Record<string, ComponentType<Props>>
  const loaders = new Map(Object.entries(init.lazyComponents ?? {}))
  const names = [...Object.keys(components), ...loaders.keys()]
  /** What the guest loaded with, for a component added over one of them to go back to once its new source goes. */
  const loadedWith = { components: { ...components }, loaders: new Map(loaders) }
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
  /** Where each component puts the style it's given, once a layer of it has drawn with one, in any frame. */
  const placements = new Map<string, StylePlacement>()
  let revision = 0
  const revisionListeners = new Set<() => void>()
  let statuses: Record<string, ComponentRenderStatus> = {}
  let pending = false

  const changed = () => {
    if (pending) {
      return
    }

    pending = true
    queueMicrotask(() => {
      pending = false
      statuses = Object.fromEntries([
        ...[...drawnOnce].map((name) => [name, { drawn: true as const }]),
        ...[...failing].map(([name, { error }]) => [name, { error }])
      ])

      for (const listener of listeners) {
        listener()
      }
    })
  }

  const report: RenderReport = {
    drawn(name) {
      if (drawnOnce.has(name) || (loaders.has(name) && !loadedOnDemand.has(name))) {
        return
      }

      drawnOnce.add(name)
      changed()
    },
    failed(name, error) {
      failing.set(name, { count: (failing.get(name)?.count ?? 0) + 1, error: error.message })
      changed()
    },
    cleared(name) {
      const now = failing.get(name)

      if (!now) {
        return
      }

      if (now.count > 1) {
        failing.set(name, { ...now, count: now.count - 1 })
      } else {
        failing.delete(name)
      }

      changed()
    }
  }

  /**
   * An app component whose module loads the first time it's drawn. It draws nothing until then, and the rest of the
   * frame doesn't wait. React's `lazy` would do this too, but holds back what was suspended for 300ms after it loads,
   * which an offscreen render waiting on `loaded()` would miss.
   */
  const onDemand = (name: string): ComponentType<Props> | undefined => {
    const load = loaders.get(name)

    if (!load) {
      return undefined
    }

    let component = deferred.get(name)

    if (!component) {
      let ready: ComponentType<Props> | undefined
      let failure: { error: unknown } | undefined
      let loading: Promise<void> | undefined

      const start = () => {
        if (loading) {
          return loading
        }

        loading = load().then(
          (value) => {
            // SAFETY: a module's export the builder found to be a component; one that isn't fails in its boundary.
            ready = value as ComponentType<Props>
            loadedOnDemand.add(name)
          },
          (cause: unknown) => void (failure = { error: cause })
        )
        inFlight.add(loading)
        void loading.finally(() => inFlight.delete(loading!))

        return loading
      }

      component = function OnDemand(props: Props) {
        const [, redraw] = useState(0)
        const own = useContext(FrameWindowContext)
        useEffect(() => {
          if (ready || failure) {
            return
          }

          void start().then(() => {
            // In the frame's window, as the rest of the frame first drew.
            const again = () => redraw((count) => count + 1)

            if (own) {
              own.run(() => flushSync(again))
            } else {
              again()
            }
          })
        }, [own])
        // Its boundary only hears it drew when the boundary draws, so once loaded it says so itself. A component that
        // throws never gets here.
        useEffect(() => {
          if (ready) {
            report.drawn(name)
          }
        })
        // Its layer looked for where its style went before it loaded, so it looks again once it has.
        const styles = useContext(LayerStylesContext)
        useLayoutEffect(() => {
          if (ready && hasStyle(props) && styles.placement(name) === undefined) {
            styles.check()
          }
        })

        // Thrown while drawing, so the component's boundary shows why it couldn't load.
        if (failure) {
          throw failure.error
        }

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
    if (components[name]) {
      return components[name]
    }

    if (loaders.has(name)) {
      return onDemand(name)
    }

    const slash = name.indexOf("/")

    if (slash === -1) {
      return undefined
    }

    const set = iconSets[name.slice(0, slash)]

    if (!set) {
      return undefined
    }

    const rest = name.slice(slash + 1)
    const last = rest.lastIndexOf("/")

    return last === -1 ? icon(set, rest) : icon(set, rest.slice(last + 1), rest.slice(0, last))
  }

  /** The module a set's icons in a style are drawn from: its own, or the style's. */
  const moduleOf = (set: GuestIconSet, style: string | undefined) => (style ? set.styles?.[style] : set.module)

  /** An icon component; for a set of icon data, one that draws the data with the set's renderer. */
  const icon = (set: GuestIconSet, name: string, style?: string): ComponentType<Props> | undefined => {
    const value = moduleOf(set, style)?.[name]

    if (!set.renderer) {
      return isComponent(value) ? value : undefined
    }

    if (value === undefined || isComponent(value) || !isComponent(set.renderer.component)) {
      return undefined
    }

    let component = drawn.get(value)

    if (!component) {
      const { component: renderer, prop } = set.renderer
      component = (props: Props) => createElement(renderer, { ...props, [prop]: value })
      drawn.set(value, component)
    }

    return component
  }

  const iconLists = new Map<string, IconList>()

  /**
   * An icon set's icons, each once: aliases of one icon (`Heart`, `HeartIcon`) keep the shortest name the set's
   * pattern matches, which keeps the others for search, as `TriangleAlert` keeps Lucide's older `AlertTriangle` and
   * Hugeicons' `Settings01Icon` keeps `Gear` and `Cog`, which its pattern leaves out of the list.
   */
  const iconList = (library: string, style?: string): IconList => {
    const set = iconSets[library]
    const module = set && moduleOf(set, style)

    if (!module) {
      return { names: [], aliases: {} }
    }

    const key = style ? `${library}/${style}` : library
    let list = iconLists.get(key)

    if (list) {
      return list
    }

    list = { names: [], aliases: {} }

    for (const { name, names } of iconAliases(module, set, (_, each) => icon(set, each, style) !== undefined)) {
      const others = names.filter((each) => each !== name).sort(shorterName)
      list.names.push(name)

      if (others.length > 0) {
        list.aliases[name] = others
      }
    }

    list.names.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    iconLists.set(key, list)

    return list
  }

  /**
   * A design node's props, worked out as the sample values they copy: values the library's package makes
   * (`collection={createTreeCollection(...)}`), each made once by calling the package's function with its arguments,
   * from the modules the builder loaded for them. Sample values have no other forms, so nothing reads the frame.
   */
  const sampleHost: ValueHost = {
    exported: (specifier, path) => {
      if (!init.decorators) {
        throw new Error(`${specifier} isn't loaded`)
      }

      return exported(init.decorators, specifier, path)
    },
    global: () => undefined,
    frame: () => undefined,
    made: new Map()
  }

  // SAFETY: working out an object of props gives an object with the same props, each worked out.
  const madeProps = (props: Props | undefined): Props => evaluateValue(props ?? {}, sampleHost, "sample") as Props

  /**
   * What a render function passes on (`extra`) goes to the node itself, as cloning the element it returns would, since a
   * component is wrapped in its boundary: over the node's own props and slots, its style over the node's, and its key
   * on what's returned.
   */
  const toReact = (node: RenderNode, key?: Key, extra?: Props): ReactNode => {
    const { key: given, style: givenStyle, ...passed } = extra ?? {}
    // SAFETY: what a render function passes on as `key` is the key React gave the element it returns.
    const keyed = (given as Key | undefined) ?? key

    switch (node.kind) {
      case "text":
        return node.text
      case "element": {
        const props = {
          ...attributesFor(node.tag, node.attributes),
          ...passed,
          key: keyed,
          style: givenStyle ? Object.assign({}, node.style, givenStyle) : node.style,
          "data-canvas-node": node.nodeId
        }

        // Void elements like img take no children, not even an empty list; nor does one given its children.
        if (node.children.length === 0 || "children" in passed) {
          return createElement(node.tag, props)
        }

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
        const props: Props = Object.assign({}, madeProps(node.props), { "data-canvas-node": node.nodeId })

        if (givenStyle) {
          props.style = Object.assign({}, props.style, givenStyle)
        }

        let children: ReactNode[] | undefined

        for (const [slot, nodes] of Object.entries(node.slots)) {
          // A `$render:` slot is a function the component calls (`renderInput`, function children); `$renderWith:`
          // spreads what it's called with onto the one element it returns, and `?pass=a,b` gives it to those props, over
          // what's spread, as JSX would.
          const render = readRenderSlotKey(slot)

          if (render) {
            const { spread, prop, pass } = render
            // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the customer's component calls it with anything
            props[prop] = (argument: unknown) => {
              const spreadProps = spread && isComposite(argument) && !(argument instanceof Function) ? argument : {}
              const named = pass ? Object.fromEntries(pass.map((name) => [name, argument])) : {}
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
          if (slot === "children") {
            children = rendered
          } else {
            props[slot] = rendered.length === 1 ? rendered[0] : rendered
          }
        }

        Object.assign(props, passed)

        // Children it's given replace the slot's.
        if ("children" in passed) {
          children = undefined
        }

        const layer: LayerDrawing = {
          component,
          props,
          children,
          boundary: { name: node.component, source: moves.get(node.component) ?? 0, nodeId: node.nodeId, report }
        }

        return createElement(ComponentLayer, { key: keyed, layer })
      }
    }
  }

  const guest: Guest = {
    renderer: "react",
    components: names,
    hasComponent: (name) => lookup(name) !== undefined,
    async loaded() {
      // A component that loads can draw others that load too, so this waits for a pass that starts none.
      for (let pass = 0; pass < 10; pass++) {
        if (inFlight.size === 0) {
          await new Promise((resolve) => setTimeout(resolve, 16))

          if (inFlight.size === 0) {
            return
          }
        }

        await Promise.allSettled(inFlight)
      }
    },
    addComponents(sources) {
      let moved = false

      for (const [id, source] of Object.entries(sources)) {
        // A new version is the same file with changed code, which the dev server builds afresh at a new address.
        const address = `/${source.path.replace(/^\.?\//, "")}${source.version === undefined ? "" : `?t=${source.version}`}`
        const from = `${address}#${source.export}`

        if (added.get(id) === from) {
          continue
        }

        added.set(id, from)
        moves.set(id, (moves.get(id) ?? 0) + 1)
        moved = true
        // The dev server builds any of the project's files when it's asked for one, as it does for the app.
        loaders.set(id, () =>
          import(/* @vite-ignore */ new URL(address, projectOrigin).href).then((module) =>
            exportOf(module, source.export)
          )
        )
        // One it had already has moved to another file, so it's drawn from there from now on.
        delete components[id]
        deferred.delete(id)
        loadedOnDemand.delete(id)
        placements.delete(id)

        if (!names.includes(id)) {
          names.push(id)
        }
      }

      if (!moved) {
        return
      }

      revision++

      for (const listener of revisionListeners) {
        listener()
      }
    },
    removeComponents(ids) {
      let moved = false

      for (const id of ids) {
        if (!added.delete(id)) {
          continue
        }

        moves.set(id, (moves.get(id) ?? 0) + 1)
        moved = true
        loaders.delete(id)
        delete components[id]
        deferred.delete(id)
        loadedOnDemand.delete(id)
        placements.delete(id)
        // One the guest loaded with is drawn as it loaded again; one it was only given is gone.
        const component = loadedWith.components[id]
        const loader = loadedWith.loaders.get(id)

        if (component) {
          components[id] = component
        } else if (loader) {
          loaders.set(id, loader)
        } else {
          names.splice(names.indexOf(id), 1)
        }
      }

      if (!moved) {
        return
      }

      revision++

      for (const listener of revisionListeners) {
        listener()
      }
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
    mount(target, tree, options = {}): MountHandle {
      const report = (cause: unknown) => options.onError?.(cause)
      const frame = frameOf(target, options.globals ?? {})
      const decorate = options.bare ? (content: ReactNode) => content : decorators(init.decorators, frame, report)
      const failing = frameFailures(options.onFailures && ((failures) => options.onFailures?.(failures)))

      const root = createRoot(target, {
        onUncaughtError: report,
        // An error a component's boundary caught names the component, so a frame says which one failed.
        onCaughtError: (error, info) => {
          const boundary = info.errorBoundary instanceof ComponentBoundary ? info.errorBoundary : undefined
          const message = error instanceof Error ? error.message : String(error)

          if (!boundary) {
            return report(error)
          }

          const { name, nodeId } = boundary.props
          options.onError?.(new Error(`${name}: ${message}`), { nodeId, component: name })
        }
      })

      const own = options.viewport && frameWindow(target, options.viewport)
      const drawn = watchDrawnNodes(root, target)
      const styles = frameStyles(root, target, placements, (work) => (own ? own.run(() => flushSync(work)) : work()))

      const draw = (nodes: RenderNode[]) =>
        createElement(
          FrameWindowContext.Provider,
          { value: own },
          createElement(
            LayerStylesContext.Provider,
            { value: styles },
            createElement(
              FrameFailuresContext.Provider,
              { value: failing.failures },
              createElement(
                Committed,
                {
                  onCommit: () => {
                    drawn.changed()
                    failing.committed()
                  }
                },
                decorate(nodes.map((node, index) => toReact(node, index)))
              )
            )
          )
        )

      if (!own) {
        root.render(draw(tree))

        return {
          update: (nodes) => root.render(draw(nodes)),
          unmount: () => {
            failing.dispose()
            drawn.dispose()
            styles.dispose()
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
          if (!unmounted) {
            own.run(() => flushSync(work))
          }
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
          failing.dispose()
          drawn.dispose()
          styles.dispose()
          root.unmount()
          own.dispose()
          frame.undo()
        },
        drawnNodes: drawn.read
      }
    }
  }

  if (init.packageCss) {
    guest.packageCss = init.packageCss
  }

  if (init.tokenCategories) {
    guest.tokenCategories = init.tokenCategories
  }

  return guest
}

/** An icon set's icons, each once, and the other names of each that has any. */
interface IconList {
  names: string[]
  aliases: Record<string, string[]>
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
  const frame = shadow instanceof ShadowRoot ? shadow : target
  let stale = true
  let drawn: DrawnNodes | undefined

  const observer = new MutationObserver(() => {
    stale = true
  })

  observer.observe(frame, { childList: true, subtree: true })

  return {
    read: (): DrawnNodes | undefined => {
      if (observer.takeRecords().length > 0) {
        stale = true
      }

      if (!stale) {
        return drawn
      }

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
function readDrawnNodes(root: Root, target: HTMLElement, frame: ShadowRoot | HTMLElement): DrawnNodes | undefined {
  const fiber = currentRootFiber(root, target)

  if (!fiber) {
    return undefined
  }

  const drawn = indexDrawnNodes(fiber, { nodeOf: nodeOfFiber, inside: (element) => frame.contains(element) })
  // An element the guest drew always carries its node's id. If the index puts it in another node, it's misreading
  // React's tree, and the attribute is the better guide.
  const marked = frame.querySelector("[data-canvas-node]")

  if (!drawn || (marked && drawn.nodeOf(marked) !== marked.getAttribute("data-canvas-node"))) {
    return undefined
  }

  return drawn
}

/**
 * A frame's side of where components put their styles. A layer that draws a component with a style before anyone knows
 * where the component puts it asks the frame to look, once React has committed: the frame reads React's tree, and when
 * a component puts its style inside, tells its layers, which draw a div around it before the frame is painted. What it
 * finds is kept for every frame (`placements`). `run` draws the layers again as the frame's code has to be drawn.
 */
function frameStyles(
  root: Root,
  target: HTMLElement,
  placements: Map<string, StylePlacement>,
  run: (work: () => void) => void
): LayerStyles & { dispose(): void } {
  const listeners = new Set<() => void>()
  let looking = false
  let disposed = false

  return {
    placement: (name) => placements.get(name),
    subscribe(listener) {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
    check() {
      if (looking) {
        return
      }

      looking = true
      queueMicrotask(() => {
        looking = false

        if (disposed || !readPlacements(root, target, placements)) {
          return
        }

        run(() => {
          for (const listener of listeners) {
            listener()
          }
        })
      })
    },
    dispose() {
      disposed = true
      listeners.clear()
    }
  }
}

/**
 * Notes where each component a frame drew with a style puts it, when that isn't known yet, and says whether a layer
 * drew its component as it is, though the component puts its style inside. Nothing is noted when React's tree isn't
 * the shape React 19 gives it.
 */
function readPlacements(root: Root, target: HTMLElement, placements: Map<string, StylePlacement>): boolean {
  const fiber = currentRootFiber(root, target)

  if (!fiber) {
    return false
  }

  const isLayer = (fiber: Fiber) => fiber.stateNode instanceof ComponentBoundary
  let unwrapped = false

  const visit = (first: Fiber | null): void => {
    for (let fiber = first; fiber; fiber = fiber.sibling) {
      // A layer draws its component straight inside its boundary, or a div around it, or the box of an error.
      const boundary = fiber.stateNode instanceof ComponentBoundary ? fiber.stateNode : undefined
      const component = boundary ? fiber.child : null

      if (boundary && component && !isText(component.type)) {
        const { name } = boundary.props
        let placement = placements.get(name)

        if (placement === undefined) {
          placement = stylePlacement(component, isLayer)

          if (placement) {
            placements.set(name, placement)
          }
        }

        if (placement === "inner" && styleOf(component)) {
          unwrapped = true
        }
      }

      visit(fiber.child)
    }
  }

  try {
    visit(fiber.child)
  } catch {
    return false
  }

  return unwrapped
}

function nodeOfFiber(fiber: Fiber): string | undefined {
  if (fiber.stateNode instanceof ComponentBoundary) {
    return fiber.stateNode.props.nodeId
  }

  if (!isText(fiber.type)) {
    return undefined
  }

  const props = fiber.memoizedProps
  const id = isComposite(props) && "data-canvas-node" in props ? props["data-canvas-node"] : undefined

  return isText(id) ? id : undefined
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
    root: shadowOf(target) ?? target.ownerDocument,
    body: target.parentElement ?? target,
    made: new Map(),
    undos,
    undo: () => {
      for (const undo of undos.splice(0).reverse()) {
        undo()
      }
    }
  }
}

/** The shadow root an element is in, if it's in one. */
function shadowOf(element: Element): ShadowRoot | undefined {
  const root = element.getRootNode()

  return root instanceof ShadowRoot ? root : undefined
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
  report: (cause: unknown) => void
): (content: ReactNode) => ReactNode {
  if (!setup || setup.list.length === 0) {
    return (content) => content
  }

  const compiled: StoryDecorator[] = []

  for (const { library, decorator } of setup.list) {
    if (!applies(decorator, frame.globals)) {
      continue
    }

    try {
      const made = compile(decorator, setup, frame)

      if (made) {
        compiled.push(made)
      }
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
  const host = frameHost(setup, frame)
  const value = (raw: DecoratorValue) => evaluateValue(raw, host)
  const { undos } = frame

  if (decorator.class !== undefined) {
    const names = asText(value(decorator.class) ?? "")
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

      if (next === undefined || next === null || next === false) {
        continue
      }

      frame.body.setAttribute(name, asText(next))
      undos.push(() => (previous === null ? frame.body.removeAttribute(name) : frame.body.setAttribute(name, previous)))
    }

    return undefined
  }

  if (decorator.style) {
    for (const [name, raw] of Object.entries(decorator.style)) {
      const next = value(raw)

      if (next === undefined || next === null) {
        continue
      }

      const previous = frame.body.style.getPropertyValue(name)
      frame.body.style.setProperty(name, asText(next))
      undos.push(() => frame.body.style.setProperty(name, previous))
    }

    return undefined
  }

  const spec = decorator.wrap ?? decorator.add

  if (!spec) {
    return undefined
  }

  const component = exported(setup, spec.import, spec.component)

  if (!isComponent(component)) {
    throw new Error(`${spec.import} has no component ${spec.component}`)
  }

  // SAFETY: working out an object of props gives an object with the same props, each worked out.
  const props = (spec.props ? value(spec.props) : {}) as Props

  if (decorator.wrap) {
    return (Story) => createElement(component, props, Story())
  }

  return (Story) => createElement(Fragment, null, Story(), createElement(component, props))
}

/**
 * A decorator's worked-out value as the text a class, attribute or style takes: text as it is, and anything else, which
 * a manifest gives as a number or a boolean, as JSON.
 */
function asText<T>(value: T): string {
  return isText(value) ? value : JSON.stringify(value)
}

/** What a decorator's values are worked out against: the frame, and the modules the builder loaded for them. */
function frameHost(setup: GuestDecorators, frame: Frame): ValueHost {
  return {
    exported: (specifier, path) => exported(setup, specifier, path),
    global: (name) => frame.globals[name],
    frame(part) {
      switch (part) {
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
      }
    },
    made: frame.made
  }
}

/** An export of a decorator's module, following dots into namespaces (`Tooltip.Provider`). */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- a module's export is whatever its package exports
function exported(setup: GuestDecorators, specifier: string, path: string): unknown {
  const module = setup.modules[specifier]

  if (!module) {
    throw new Error(`${specifier} isn't loaded`)
  }

  if ("loadError" in module && isText(module.loadError)) {
    throw new Error(`${specifier} couldn't load: ${module.loadError}`)
  }

  return exportOf(module, path)
}
