# Snippet API reference

Generated from `SnippetApi` in Parity's `packages/agent/src/snippet-api.ts`, so it matches what the code takes and
returns. Every function is a global in an `execute` snippet; execute.md says how to use them together.

## Reading

```ts
/** Every design: its id, name, kind, file, place on the canvas, states and what its board shows. */
Designs(): DesignSummary[]

/** A whole design, as the document format in document.md describes it. */
GetDesign(design: string): ContainerSpec

/**
 * A design's root or a node. `depth` cuts children off with `"…"`; `state` (a component's) and `mode` read it as
 * that frame draws it.
 */
Get(path: string, options?: GetOptions): ReadNode
/**
 * Walks the nodes under `path` and returns what `visit` returns for each, leaving out `undefined`. Given `state` or
 * `mode`, it walks the nodes as that frame draws them.
 */
Get(path: string, visit: Visit, options?: GetOptions): unknown[]
/** Walks every design's nodes and returns what `visit` returns for each, leaving out `undefined`. */
Get(visit: Visit): unknown[]

/** The components designs can use, sorted. */
Components(): string[]

/**
 * A component's props, read from its source, and what it needs around it and holds. `all` adds the props it passes
 * through to its element.
 */
Props(component: string, options?: PropsOptions): PropsInfo

/** The project's icon sets, with their styles. */
Icons(): IconSetSummary[]
/** A set's icons, as component nodes name them. */
Icons(set: string, options?: IconOptions): Promise<IconMatch[]>

/** The project's tokens, filtered. Given `nearest`, only those it compares with, nearest first. */
GetTokens(filter?: TokenFilterOptions): Token[]

/**
 * The modes as set and resolved, with what each design's board shows. Naming a design gives just that one, with each
 * of its frames' sizes.
 */
GetModes(design?: string): ModesInfo

/** What the person has selected on the canvas. */
Selection(): Selected
```

## Designs

```ts
/** Makes a design and returns its id. */
CreateDesign(spec: DesignInput): string

/** Renames, moves, resizes or changes what a design's board shows. */
UpdateDesign(design: string, update: DesignUpdate): void

DeleteDesign(design: string): void

/** Insert into this to make a new design of the node: `Insert(document, node, { name? })`. */
document: "document"
```

## Nodes

```ts
/**
 * Adds a node, with everything inside it, as the last child of `parent` or at `index`, and returns its id. Into
 * `document`, it makes a design of the node.
 */
Insert(parent: string, node: unknown, options?: PlaceOptions | DocumentPlacement): string

/** Changes a node in the base design, or in a component's state given `state`. */
Update(path: string, change: UpdateChange, options?: UpdateOptions): void

/** Swaps a node for a new one in the same place and returns its id. */
Replace(path: string, node: unknown): string

/** Reorders or reparents a node within one design. */
Move(path: string, parent: string, options?: PlaceOptions): void

/** Copies a node, with everything inside it, and returns the copy's id. */
Copy(path: string, parent: string, options?: CopyOptions): string

Delete(path: string): void

/** Sets a node's patch for one viewport, or with `null` takes it away. */
Responsive(path: string, viewport: string, patch: PatchInput | null): void
```

## States

```ts
/**
 * Adds a state to a component and returns its id. `changes` are keyed by node id or name. Only a component has
 * states, to show it in its variations; a screen or a frame has none.
 */
AddState(component: string, spec: StateInput): string

/** Renames a component's state or changes what it changes. */
UpdateState(component: string, state: string, spec: StateUpdate): void

DeleteState(component: string, state: string): void
```

## Components

```ts
/** Parts of a design that repeat with the same structure, to make a component of. */
FindRepeats(design: string): RepeatCandidate[]

/** Makes a component design of repeated nodes and replaces each with an instance, returning the new design's id. */
ExtractComponent(design: string, nodes: ExtractNodes, options: ExtractOptions): string

AddParam(design: string, name: string, spec: ParamInput): void

UpdateParam(design: string, name: string, change: ParamUpdate): void

DeleteParam(design: string, name: string): void
```

## Modes and tokens

```ts
/** Replaces the project's modes. */
SetModes(settings: ModeSettings): void

/**
 * Sets token values by name: one value for the default theme, or one per theme. A name the project doesn't have
 * adds a token.
 */
SetTokens(values: TokenValues): void
```

## Checking

```ts
/** Renders frames offscreen and returns how many it took; the pictures come back with the result. */
Screenshot(design: string, options?: ScreenshotOptions): Promise<number>

/** Lays out one frame: one state id and one mode id. */
Measure(design: string, options?: MatrixOptions): Promise<Layout>

/** Checks frames for render errors, overflow, clipping, squeezing, unknown components and content drawn outside them. */
Problems(design: string, options?: MatrixOptions): Promise<Problem[]>

/** axe-core's findings in each frame, per node. */
Accessibility(design: string, options?: MatrixOptions): Promise<AccessibilityFinding[]>
```

## The canvas

```ts
/** An empty place on the canvas for a design of this size. */
FindEmptySpace(options: SpaceOptions): CanvasPoint

/** Designs that overlap on the canvas, all or one's. */
Overlaps(design?: string): Overlap[]

/** What's placed beside designs to look at, all or one's. */
References(design?: string): PlacedReference[]

/** Places a screen `find_references` found beside a design, and returns its id. */
PlaceReference(id: string, options?: ReferenceOptions): Promise<string>

/** Writes values to the call's output. Objects print as JSON. */
Print(...values: unknown[]): void
```

## Types

These are the document format, which document.md describes:

- `ContainerSpec`
- `DesignNode`
- `ImageCredit`
- `ParamSpec`
- `PatchStyle`
- `PatchUnset`
- `PropValues`

### DesignSummary

```ts
/** A design as `Designs()` lists it. Only a component has states, so only a component lists them. */
type DesignSummary = ScreenSummary | ComponentSummary
```

### GetOptions

```ts
interface GetOptions {
  depth?: number
  /** Read the nodes as the board draws this state; the state the design shows when only `mode` is given. */
  state?: string
  /** Read the nodes as the board draws this mode; the design's main mode when only `state` is given. */
  mode?: string
}
```

### ReadNode

```ts
/** A node as `Get` reads it, with children past `depth` cut off as `"…"`. */
type ReadNode = Omit<DesignNode, "children" | "slots"> & {
  children?: (ReadNode | "…")[]
  slots?: Record<string, (ReadNode | "…")[]>
}
```

### Visit

```ts
/** What `Get` calls for every node it walks; what it returns, unless `undefined`, is collected. */
type Visit = (node: DesignNode, at: VisitContext) => unknown
```

### PropsOptions

```ts
interface PropsOptions {
  all?: boolean
}
```

### PropsInfo

```ts
/** A component's props, as `Props` reads them. */
interface PropsInfo {
  component: string
  /** The module it's written in, from the project root. Unset when its source isn't known. */
  path?: string
  /** What the project's code imports it from, when something does. */
  import?: string
  /** Whether its source was read; when it wasn't, `props` is empty. */
  known: boolean
  props: ComponentProp[]
  composition: Omit<ComponentComposition, "component">
}
```

### IconSetSummary

```ts
/** An icon set as `Icons()` describes it to agents. */
interface IconSetSummary {
  id: string
  name: string
  package: string
  version?: string
  /** How many icons it had when its `.lib.par` was made. */
  count?: number
  /** The styles it comes in, such as Regular and Filled, and the one used when none is asked for. */
  styles: string[]
  style?: string
  /** How a `component` node names one of its icons. */
  component: string
}
```

### IconOptions

```ts
interface IconOptions {
  /** Finds icons by name, alias and the tags the set publishes, best first. */
  search?: string
  /** One of the set's styles; the set's default otherwise. */
  style?: string
  /** At most this many icons; 50 unless set. */
  limit?: number
}
```

### IconMatch

```ts
/** One icon, as a `component` node inserts it. */
interface IconMatch {
  /** Its name without a style or size. */
  label: string
  component: string
  /** The props that pick its style, for sets that take the style as a prop. */
  props?: Record<string, string>
}
```

### TokenFilterOptions

```ts
interface TokenFilterOptions {
  category?: string
  source?: string
  search?: string
  /** A color or length that isn't a token, such as `#2f6fed` or `13px`: the tokens nearest it, nearest first. */
  nearest?: string
}
```

### Token

```ts
/** A token as `GetTokens` lists it. */
interface Token {
  /** Its name, without `--`. */
  name: string
  category: string
  /** The stylesheet or library it comes from. */
  source: string
  /** Its value in each theme, by theme. */
  values: Record<string, string>
  /** Given `nearest`: how far it is, in pixels for a length, in OKLab for a color (under 0.02 looks the same). */
  distance?: number
}
```

### ModesInfo

```ts
/** The project's modes as `GetModes` reads them. */
interface ModesInfo extends ModesReport {
  /** The modes as set: change them and pass them to `SetModes`. */
  settings: ModeSettings
  /** What each design's board shows, or the one design's when it's named. */
  designs: DesignModes[]
}
```

### Selected

```ts
/** What the person has selected. Each is unset when nothing is. */
interface Selected {
  /** The design's id. */
  design?: string
  /** The node's id. */
  node?: string
  /** The mode of the frame it's selected in. */
  mode?: string
}
```

### DesignInput

```ts
interface DesignInput {
  name: string
  kind?: "component" | "frame" | "screen"
  file?: string
  x?: number
  y?: number
  /** Checked as a node tree when the design gets its fresh ids. */
  root?: unknown
  baseState?: string
  /** A frame's own size, in pixels. */
  width?: number
  height?: number
  /** A component's params, by name. */
  params?: Record<string, ParamInput>
}
```

### DesignUpdate

```ts
interface DesignUpdate {
  name?: string
  /** Becoming a frame drops what a frame doesn't have, and says so in the call's warnings. */
  kind?: "component" | "frame" | "screen"
  x?: number
  y?: number
  /** A frame's own size, in pixels. */
  width?: number
  height?: number
  /** The main frame's mode. */
  mode?: string
  /** Modes shown beside the main frame. */
  showModes?: string[]
  state?: string
  allStates?: boolean
}
```

### PlaceOptions

```ts
interface PlaceOptions {
  index?: number
  slot?: string
}
```

### DocumentPlacement

```ts
interface DocumentPlacement {
  name?: string
  kind?: "component" | "frame" | "screen"
  file?: string
  x?: number
  y?: number
  baseState?: string
  /** A frame's own size, in pixels. */
  width?: number
  height?: number
  /** A component's params, by name. */
  params?: Record<string, ParamInput>
}
```

### UpdateChange

```ts
interface UpdateChange {
  hidden?: boolean | null
  text?: string | null
  props?: PropValues
  style?: PatchStyle
  unset?: PatchUnset | null
  name?: string | null
  tag?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "strong" | null
  component?: string
  /** An instance's args, as props. */
  args?: PropValues
  /** An image's picture, its description and who made it, in the base design only. */
  src?: string
  alt?: string | null
  credit?: ImageCredit | null
  /** Binds a field to one of the component's params, or with `null` unbinds it, in the base design only. */
  bind?: { text?: string | null; props?: Record<string, string | null> }
}
```

### UpdateOptions

```ts
interface UpdateOptions {
  state?: string
}
```

### CopyOptions

```ts
interface CopyOptions {
  index?: number
  slot?: string
  name?: string
}
```

### PatchInput

```ts
interface PatchInput {
  hidden?: boolean | null
  text?: string | null
  props?: PropValues
  style?: PatchStyle
  unset?: PatchUnset | null
}
```

### StateInput

```ts
interface StateInput {
  name: string
  changes?: Record<string, PatchInput | null>
}
```

### StateUpdate

```ts
interface StateUpdate {
  name?: string
  changes?: Record<string, PatchInput | null>
}
```

### RepeatCandidate

```ts
/** A part of a design that appears more than once with the same structure: a candidate component. */
interface RepeatCandidate {
  /** The root id of each occurrence, in document order. */
  nodes: string[]
  /** Nodes in one occurrence. */
  size: number
  /** A starting name; agents and people usually find a better one. */
  name: string
  /** What differs between occurrences, which becomes the component's params. */
  params: { name: string; type: ParamSpec["type"]; values: PropValue[] }[]
}
```

### ExtractNodes

```ts
type ExtractNodes = string | string[]
```

### ExtractOptions

```ts
interface ExtractOptions {
  name: string
  file?: string
  /** Better names for the params found, by the name they were given. */
  params?: Record<string, string>
}
```

### ParamInput

```ts
interface ParamInput {
  type: "boolean" | "number" | "text" | "value" | "variant"
  default?: unknown
  description?: string
  options?: OptionInput[]
}
```

### ParamUpdate

```ts
interface ParamUpdate {
  name?: string
  default?: unknown
  description?: string | null
  options?: OptionInput[]
}
```

### ModeSettings

```ts
interface ModeSettings {
  $schema?: string
  version: 1
  variables: ModeVariable[]
  modes: ModeSpec[]
}
```

### TokenValues

```ts
type TokenValues = Record<string, string | Record<string, string>>
```

### ScreenshotOptions

```ts
interface ScreenshotOptions {
  /** A state id, a list of them, or "all". Defaults to the state the design shows. */
  state?: string | string[]
  /** A mode id, a list, "shown" (what the design shows) or "all". Defaults to the primary mode. */
  mode?: string | string[]
  scale?: number
}
```

### MatrixOptions

```ts
interface MatrixOptions {
  /** A state id, a list of them, or "all". Defaults to the state the design shows. */
  state?: string | string[]
  /** A mode id, a list, "shown" (what the design shows) or "all". Defaults to the primary mode. */
  mode?: string | string[]
}
```

### Layout

```ts
/** One frame's layout, as `Measure` gives it. */
interface Layout {
  /** The state and mode it drew. */
  state: string
  mode: string
  /** The frame's size, in CSS pixels. */
  width: number
  height: number
  /** Whether its content is wider than the frame. */
  overflowsX: boolean
  /** Every node it draws, outermost first. */
  nodes: NodeLayout[]
}
```

### Problem

```ts
/** One problem in one frame. The layout kinds say which node, what it overflows, and by how much. */
interface Problem {
  state: string
  mode: string
  kind:
    | "render-error"
    | "unknown-component"
    | "content-wider"
    | "frame-overflow"
    | "clipped"
    | "outside-frame"
    | "parent-overflow"
    | "squeezed"
  /** What's wrong, in a sentence. */
  problem: string
  node?: string
  name?: string
  box?: FrameBox
  /** What the node overflows: the node that clips it, the parent it spills out of, or the frame, which has no node. */
  container?: { node?: string; name?: string; box: FrameBox }
  overflow?: Overflow
  /** For `squeezed`: how wide it's drawn and how wide its width makes it. */
  squeezed?: Squeeze
}
```

### AccessibilityFinding

```ts
/** One accessibility issue on one node, in one state and mode. */
interface AccessibilityFinding {
  state: string
  mode: string
  rule: string
  impact: AccessibilityImpact
  help: string
  helpUrl: string
  /** The node's id, or none when the issue is on the frame as a whole. */
  node?: string
  name?: string
  detail: string
  contrast?: ContrastDetail
}
```

### SpaceOptions

```ts
interface SpaceOptions {
  width: number
  height: number
  direction?: "below" | "right"
  padding?: number
  near?: string
}
```

### CanvasPoint

```ts
/** A point on the canvas, in canvas units. */
interface CanvasPoint {
  x: number
  y: number
}
```

### Overlap

```ts
/**
 * Two boards too close, from the whole canvas. Without `titleOnly` the boards themselves collide; with it they're
 * clear, but the lower one's title, drawn in the band above it, covers the upper one. `width` and `height` are the
 * shared area, title band included. `estimated` means one of them isn't drawn yet, so its size is a guess from its
 * frames; without it both sizes are as the canvas last drew them.
 */
interface Overlap {
  designs: [string, string]
  names: [string, string]
  width: number
  height: number
  titleOnly?: true
  estimated?: true
}
```

### PlacedReference

```ts
/**
 * A reference on the canvas as an agent reads it: where it's from, why it's there, who placed it and the
 * design it's for.
 */
interface PlacedReference {
  /** Its id on the canvas. */
  id: string
  app: string
  platform?: "ios" | "web"
  /** Its page at the source. */
  link: string
  /** Its picture's link, which may have stopped working; `expired` says when it has. */
  picture: string
  expired?: true
  query?: string
  note?: string
  /** The agent that placed it. Unset when the person did. */
  by?: string
  /**
   * The design it was placed for, or else the one it sits beside, with the file it's in. Unset when no design is near.
   */
  design?: { id: string; name: string; file: string }
}
```

### ReferenceOptions

```ts
interface ReferenceOptions {
  near?: string
  note?: string
  connector?: string
}
```

### ScreenSummary

```ts
/** A screen or a frame: drawn as its layers are, with no states. */
interface ScreenSummary extends SummaryFields {
  kind: "screen" | "frame"
  /** Its main frame's mode and the modes beside it. */
  showing: { mode: string; beside: string[] }
}
```

### ComponentSummary

```ts
/** A component, with the states it's shown in. */
interface ComponentSummary extends SummaryFields {
  kind: "component"
  /** Each state, the base first, by the id other functions take and the name it shows. */
  states: { id: string; name: string }[]
  /** The state its board shows, its main frame's mode and the modes beside it. */
  showing: { state: string; mode: string; beside: string[] }
}
```

### VisitContext

```ts
/** Where `Get` is in its walk, as `visit` is told. */
interface VisitContext {
  /** The design's id. */
  design: string
  /** The node's path, as `design/node`. */
  path: string
  /** How deep it is below where the walk started. */
  depth: number
  /** Its index among its parent's children, or in its slot. */
  index: number
  /** The id of the node it's in; unset for the first node visited. */
  parent?: string
  /** Leaves out the nodes inside this one. */
  skipChildren(): void
}
```

### ComponentProp

```ts
interface ComponentProp {
  name: string
  kind: PropKind
  /** The values an `enum` prop takes, in the order the source lists them. */
  options?: (string | number | boolean)[]
  /** The value used when the prop isn't set, when the source says. */
  default?: string | number | boolean | null
  required?: boolean
  /**
   * Where the prop comes from: a `variant` of the component's styles (cva), the component's `own` props, or what it
   * passes through to its element: `html` attributes, `aria` attributes and `event` handlers.
   */
  group: PropGroup
  /** The type as the source writes it, shortened. */
  type?: string
  description?: string
}
```

### ComponentComposition

```ts
/**
 * What a component needs around it and holds inside it, for agents to read before they insert it. It's read
 * from the same library metadata the Assets panel inserts with, and its example is the tree the Components panel draws.
 */
interface ComponentComposition {
  component: string
  /**
   * `provider` when it draws nothing of its own and only gives the parts inside it their context (`SidebarProvider`);
   * `wrapper` when it draws and other parts need it around them (`Sidebar`); `component` otherwise.
   */
  role: "provider" | "wrapper" | "component"
  parents: CompositionParents
  /** The parts that need it as their nearest parent, by component id. */
  holds: string[]
  /** Where it takes other layers: its children, props whose value is elements, and render functions. */
  slots: CompositionSlot[]
  example: CompositionExample
}
```

### ModesReport

```ts
interface ModesReport {
  variables: ModeVariable[]
  viewports: ViewportReport[]
  modes: ModeReport[]
}
```

### DesignModes

```ts
/** What a design's board shows: the state or states, and its main mode and the modes beside it. */
interface DesignModes {
  id: string
  name: string
  /** The state the board shows, or edits when it shows every state. */
  state: string
  /** The states drawn: just `state`, or all of them when the board shows every state. */
  states: string[]
  main: string
  beside: string[]
  /** Each mode's frame, main first, when asked for. */
  frames?: FrameReport[]
}
```

### PropValue

```ts
/** A value a component node's prop holds, and so a value a param can take. */
type PropValue = PropValues[string]
```

### OptionInput

```ts
interface OptionInput {
  id?: string
  name: string
  overrides?: Record<string, PatchInput>
}
```

### ModeVariable

```ts
interface ModeVariable {
  id: string
  name: string
  kind: "custom" | "locale" | "theme" | "viewport"
  options: VariableOption[]
}
```

### ModeSpec

```ts
interface ModeSpec {
  id: string
  name: string
  /** Option id per variable id. A variable that isn't listed uses its first option. */
  values: Record<string, string>
}
```

### NodeLayout

```ts
/**
 * A node in the layout `Measure` returns: a measured node with its box under `box`, as `Problems` gives it, and
 * the ancestor that clips it as `{ node, name, box }`, as a problem's `container` is.
 */
interface NodeLayout extends Omit<MeasuredNode, keyof FrameBox | "clip"> {
  /** The name it shows in the layers. */
  name?: string
  box: FrameBox
  clip?: { node?: string; name?: string; box: FrameBox }
}
```

### FrameBox

```ts
/** A box in a frame, in CSS pixels from the frame's top left corner. */
interface FrameBox {
  x: number
  y: number
  width: number
  height: number
}
```

### Overflow

```ts
/** How far a box reaches past each edge of the one around it, in CSS pixels. Edges it stays inside are left out. */
interface Overflow {
  left?: number
  right?: number
  top?: number
  bottom?: number
}
```

### Squeeze

```ts
/** An element drawn narrower than the width it's given, in CSS pixels. */
interface Squeeze {
  /** How wide it's drawn. */
  width: number
  /** How wide its `width` makes it, kept within its `min-width` and `max-width`. */
  wants: number
  /** The element inside the node's component, by its `data-slot` or tag, when it isn't the node's own. */
  element?: string
}
```

### AccessibilityImpact

```ts
type AccessibilityImpact = "critical" | "serious" | "moderate" | "minor"
```

### ContrastDetail

```ts
/** The colours behind a contrast failure, as axe-core measured them. */
interface ContrastDetail {
  /** Hex colours, such as `#737373`. */
  foreground: string
  background: string
  /** The ratio found, such as 4.34 for 4.34:1. */
  ratio: number
  /** The ratio the text needs: 4.5, or 3 when it's large. */
  required: number
  /** The text's size in CSS pixels. */
  fontSize: number
  bold: boolean
  /**
   * The project's color token closest to the text's color that passes in every frame the layer was checked in, or
   * `"none"` when no token does.
   */
  fix?: TokenFix | "none"
}
```

### SummaryFields

```ts
/** What `Designs()` says about every design. */
interface SummaryFields {
  id: string
  name: string
  /** The project file it's in. */
  file: string
  /** Where it is on the canvas. */
  x: number
  y: number
  /** Its board's size, as the canvas last drew it. Unset until it's drawn. */
  width?: number
  height?: number
  /** How many nodes it has. */
  nodes: number
}
```

### PropKind

```ts
type PropKind = "boolean" | "enum" | "function" | "node" | "number" | "object" | "string" | "unknown"
```

### PropGroup

```ts
type PropGroup = "aria" | "event" | "html" | "own" | "variant"
```

### CompositionParents

```ts
/**
 * The components it has to go inside: `listed` by its library, outermost first; `none`, when its library lists none or
 * it has drawn on its own; `unknown`, when nothing says, or it fails to draw for want of a provider no library names.
 */
type CompositionParents = ListedParents | { status: "none" } | { status: "unknown"; reason: string }
```

### CompositionSlot

```ts
interface CompositionSlot {
  /** The prop it fills: `children`, or one such as `icon` or `render`. */
  name: string
  /** The key a component node's `slots` holds its layers under, as `children` or `$render:children`. */
  key: string
  /** `children`, a prop whose value is `element`s, or a `render` function the layers are what it returns. */
  kind: "children" | "element" | "render"
}
```

### CompositionExample

```ts
/**
 * The smallest composition that draws it: the component with its parents and sample, as inserting it into an empty
 * layout places it. `Insert` takes `node` as it is. `drawn` when the component has drawn on the canvas without errors,
 * `failing` with why when it hasn't, and `untried` when it hasn't been drawn yet.
 */
interface CompositionExample {
  node: DesignNode
  status: "drawn" | "failing" | "untried"
  reason?: string
}
```

### ViewportReport

```ts
/**
 * A viewport option: its id is what `Responsive(node, viewport, patch)` and a node's `responsive` key take, which isn't
 * a mode id. `height` is the browser window a frame at this width stands for: the device's screen when the option has
 * one, else the screen nearest its width.
 */
interface ViewportReport {
  id: string
  name: string
  width: number
  height: number
  device?: DeviceKind
}
```

### ModeReport

```ts
/**
 * A mode: one option per variable, resolved. Its id is what renders take (`Screenshot`, `find_problems`,
 * `check_accessibility`, a design's main and beside modes). `viewport` names its viewport option.
 */
interface ModeReport {
  id: string
  name: string
  /** The project's first mode: every design's main frame unless it picks another. */
  primary: boolean
  viewport: string
  width: number
  /** The window height a growing frame in this mode stands for. */
  height: number
  /** The option chosen per variable id, as in `{ viewport: "mobile", theme: "dark", locale: "en" }`. */
  values: Record<string, string>
  /** What the theme and locale do to the frame's body: classes added and attributes set. */
  classNames: string[]
  attributes: Record<string, string>
}
```

### FrameReport

```ts
/** A frame a design's board shows: a mode, the frame's size there and the window it stands for. */
interface FrameReport {
  mode: string
  width: number
  /** Set when the design fixes its height in this viewport, which clips; otherwise the frame grows with content. */
  height?: number
  window: { width: number; height: number }
}
```

### VariableOption

```ts
interface VariableOption {
  id: string
  name: string
  /** Frame width in CSS pixels (viewport options). */
  width?: number
  /** The screen's height, for viewports taken from a device. Frames still grow with their content. */
  height?: number
  /** What the viewport is, for its icon. Otherwise judged by its width. */
  device?: "desktop" | "laptop" | "phone" | "tablet"
  /** Class added to the frame body, e.g. `dark` for shadcn themes. */
  className?: string
  /** Attributes set on the frame body, e.g. `lang` and `dir` for locales. */
  attributes?: Record<string, string>
}
```

### MeasuredNode

```ts
/** A node's box as a frame draws it. */
interface MeasuredNode extends FrameBox {
  id: string
  /** The node it's drawn inside; none for the outermost. */
  parent?: string
  /** True when part of the node is cut off by an ancestor that clips. */
  clipped?: boolean
  /** The nearest ancestor that clips and cuts part of the node off: its box, and the node it belongs to, if any. */
  clip?: FrameBox & { node?: string }
  /**
   * The part of the node in view, when it reaches past an ancestor that scrolls (its `overflow` is `scroll` or `auto` on
   * that axis): its box trimmed to that ancestor's on the axes it scrolls. The rest is scrolled to, not cut off, so the
   * layout checks judge this part.
   */
  inView?: FrameBox
  /**
   * Where the project's code writes the element the node draws outermost, as `src/components/ui/button.tsx:44:5`, from
   * the development guest. None for Parity's own layers, libraries' elements and production builds.
   */
  source?: string
  /**
   * True when the layout around the node doesn't set its box, so reaching past its parent is intended: it's positioned
   * absolutely, fixed or sticky, nudged, moved by a transform or a negative margin, or inline.
   */
  outOfFlow?: boolean
  /**
   * When the node, or an element its component draws, is drawn narrower than the width it's given, as a flex item that
   * shrinks is: how wide it's drawn, how wide its width makes it, and which element, when it's one inside.
   */
  squeezed?: Squeeze
}
```

### TokenFix

```ts
/** A token to color a layer's text with, so its contrast passes. */
interface TokenFix {
  /** The token's name, without `--`. */
  token: string
  /** What it comes to in this frame, as hex. */
  color: string
  /** The lowest ratio it reaches in the frames checked, such as 7.09 for 7.09:1. */
  ratio: number
}
```

### ListedParents

```ts
/** The parents a component's library lists, outermost first. */
interface ListedParents {
  status: "listed"
  chain: CompositionParent[]
  from?: ParentSignal
}
```

### DeviceKind

```ts
/** What a viewport is, for its icon: a phone, a tablet, a laptop or a desktop screen. */
type DeviceKind = "phone" | "tablet" | "laptop" | "desktop"
```

### CompositionParent

```ts
interface CompositionParent {
  component: string
  /** Left out when the parents outside it are already there, as `DropdownMenuGroup` is. */
  optional?: true
}
```

### ParentSignal

```ts
type ParentSignal = "app" | "edit" | "error" | "example" | "namespace" | "prefix" | "source"
```
