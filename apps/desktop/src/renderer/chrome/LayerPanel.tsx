import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import {
  type DesignNode,
  designStates,
  editsDesign,
  type EditTarget,
  findNode,
  type ImageNode,
  isInnerPath,
  type NodePatch,
  type OwnFields,
  type PatchField,
  patchSize,
  setOwnFields,
  slotAtPath,
  type StateSpec,
  type VideoNode
} from "@parity-app/core"
import { type InspectorSection, panelParts, selectionCapabilities, type StyleSection } from "@parity-app/editor"
import {
  describeElement,
  type ElementFacts,
  type PanelSection as TypeSection,
  panelData
} from "@parity-app/layer-types"
import { Diamond, Eye, EyeOff, Group, RotateCcw, Sparkles } from "lucide-react"
import { type ComponentType, type ReactNode, useState } from "react"
import type { Editor } from "tldraw"
import { useProject } from "../canvas/context.ts"
import { frameGeometry, frameSize } from "../canvas/frame-geometry.ts"
import { nodeInFrames, selectionFrame } from "../canvas/hit.ts"
import { designNamer, focusOnMount, kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { projectLibrary } from "../canvas/layers.ts"
import { useComponents } from "../components-store.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { ContentSection } from "../inspector/controls/controls.tsx"
import { ChangeMark } from "../inspector/controls/field-parts.tsx"
import { Field, FieldGrid, SwitchRow } from "../inspector/controls/field-row.tsx"
import { AttributesSection, PropsSection } from "../inspector/sections/PropsSection.tsx"
import { useSelection } from "../selection.ts"
import { actions } from "./actions.ts"
import { componentOffers, runAction } from "./adapter-actions.ts"
import { AppSelect } from "./AppSelect.tsx"
import { BaseDesignNote } from "./BaseDesignNote.tsx"
import { pushAndRecord } from "./component-events.ts"
import { extractIntoComponent } from "./components.ts"
import { ExportSection } from "./ExportSection.tsx"
import { TextInput } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { type LayerChange, renameAndRecord, updateAndRecord } from "./inspector-events.ts"
import { SlotPanel } from "./instance-slots.tsx"
import { keymap, shortcutOf } from "./keymap.ts"
import { type HeaderAction, layerActions, layerComponent, type LayerKind, layerKind } from "./layer-kind.ts"
import { LayoutPanel } from "./LayoutPanel.tsx"
import { Name, NameInput } from "./Name.tsx"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { PhotoCredit } from "./PhotoCredit.tsx"
import { readFromCode, writesProps } from "./read-from-code.ts"
import { revealSelection } from "./reveal.ts"
import { RoutePanel } from "./RoutePanel.tsx"
import { useSelectedLayer } from "./selected-layer.ts"
import { HeaderActions, headingIcon, headingName, SelectionHeading } from "./SelectionHeading.tsx"
import { MakeSlot } from "./slot-props.tsx"
import { useStyleEditor } from "./style-editor.ts"
import { StyleSections } from "./StyleSections.tsx"
import { TextWithProp } from "./text-prop.tsx"
import { TextPanel } from "./TextPanel.tsx"

/**
 * A selected layer's properties. Edits apply to the state being shown: in the base state they change the design; in
 * any other state they're saved as that state's changes, marked, and each can be reset. A variant shown on a
 * component's board takes edits the same way. Inside an instance, edits change only that copy. A layout and a text
 * layer each have a panel of their own (`LayoutPanel`, `TextPanel`, PAR-1056). For the other kinds, which sections show,
 * in what order, is `panelParts` in `@parity-app/editor`, from what the layer can do (PAR-1032); each takes the selected
 * layer itself (`useSelectedLayer`), so a story draws one alone (PAR-1031).
 */
export function LayerPanel({ entry, nodeId }: { entry: ContainerEntry; nodeId: string }) {
  const session = useProject()
  const { store } = session
  const components = useComponents(session.components)
  const layer = useSelectedLayer()

  // A slot of one of the design's instances is selected as a layer is, and has a panel of its own (PAR-84).
  const slot = isInnerPath(nodeId) && slotAtPath(entry.container.root, nodeId, projectLibrary(store))

  if (slot) {
    return <SlotPanel entry={entry} {...slot} />
  }

  if (!layer) {
    return <p className="p-4 text-sm text-muted-foreground">This layer no longer exists.</p>
  }

  // A layer read from a component's element has its type's panel (`@parity-app/layer-types`).
  if (layer.node.element) {
    return <ElementPanel element={layer.node.element} text={layer.node.type === "text"} />
  }

  const KindPanel = kindPanels[layer.node.type]

  if (KindPanel) {
    return <KindPanel />
  }

  const can = selectionCapabilities(
    layer.entry.container,
    [{ id: layer.nodeId, node: layer.node, parent: undefined }],
    (component) => components[component]?.takesStyle
  )

  // What a story draws takes its args as props, which are written back to its file; nothing else of it is.
  const story = writesProps(layer.entry.path, layer.nodeId)

  return panelParts(can).map((section) => {
    const Section = layerSections[section]

    if (!Section) {
      return undefined
    }

    return story && section !== "props" ? (
      <fieldset key={section} disabled className="contents">
        <Section />
      </fieldset>
    ) : (
      <Section key={section} />
    )
  })
}

/** The style sections that show each of a layer type's sections that come from its styles. */
const typeStyleSections: Record<TypeSection, readonly StyleSection[]> = {
  landmark: [],
  link: [],
  input: [],
  source: [],
  playback: [],
  layout: ["layout", "spacing"],
  typography: ["text"],
  size: ["size"],
  fill: ["fill"],
  stroke: ["stroke"],
  appearance: ["appearance", "effects"]
}

/**
 * The panel of a layer read from a component's element (read-only viewer): its header, named for its type, the sections
 * its attributes fill (`panelData`), its text, and the style sections its type has, in that order.
 */
function ElementPanel({ element, text }: { element: ElementFacts; text: boolean }) {
  const order = describeElement(element).sections.flatMap((section) => typeStyleSections[section])

  return (
    <>
      <LayerHeader />
      {panelData(element).map((group) => (
        <PanelSection key={group.section} title={group.title}>
          <FieldGrid>
            {group.fields.map((field) => (
              <Field key={field.attribute} label={field.label}>
                <TextInput value={field.value} onCommit={() => undefined} />
              </Field>
            ))}
          </FieldGrid>
        </PanelSection>
      ))}
      {text && <LayerContent />}
      <LayerStyles order={order} />
    </>
  )
}

/** The kinds of layer with a Design panel of their own (PAR-1056); the others are drawn from `panelParts`. */
const kindPanels: Partial<Record<DesignNode["type"], ComponentType>> = {
  layout: LayoutPanel,
  route: RoutePanel,
  text: TextPanel
}

/** What draws each of a layer's sections; a design's own, as States and Modes, aren't a layer's. */
const layerSections: Partial<Record<InspectorSection, ComponentType>> = {
  header: LayerHeader,
  props: PropsSection,
  attributes: AttributesSection,
  content: LayerContent,
  media: LayerMedia,
  noStyle: LayerNoStyle,
  styles: LayerStyles,
  export: LayerExport
}

/**
 * What a layer's header does before its eye: goes to the component an instance is of (`layerActions`), then what the
 * project's adapters offer for a code component, as Open in Storybook.
 */
function LayerActions({ node }: { node: DesignNode }) {
  const session = useProject()
  const entries = useContainerEntries(session.store)
  const component = layerComponent(node, session.info.libraries)
  const design = node.type === "instance" ? entries.find((entry) => entry.container.id === node.design) : undefined

  const act = (action: HeaderAction) => {
    if (action === "go-to-component" && design) {
      session.selection.set({ design: design.key })
      revealSelection(session)
    }
  }

  return (
    <HeaderActions
      actions={layerActions(node, { design: design !== undefined })}
      onAction={act}
      adapterOffers={componentOffers(session.info, component)}
      onAdapterAction={({ action }) => void runAction(session.id, action, component)}
    />
  )
}

/**
 * The selected layer's header: its name, kind, links and eye, then where edits go, and Make component or Make slot for
 * one of the design's own layers; for a layer inside an instance, that edits change only that copy, with Reset, Push to
 * main and Edit in its component.
 */
export function LayerHeader() {
  const session = useProject()
  const { store } = session
  const entries = useContainerEntries(store)
  const layer = useSelectedLayer()

  if (!layer) {
    return null
  }

  const { entry, nodeId, node, override, change, reset, state, target, inner } = layer
  const { container, key } = entry
  // A layer read from the project's code shows its name as text and has no eye, since nothing edits it.
  const fromCode = readFromCode(entry.path)

  const kind = layer.layer.element
    ? elementKind(layer.layer.element)
    : layerKind(layer.layer, designNamer(entries, store.getComponentLibrary()), session.info.libraries)

  const label = layerLabel(layer.layer, entries, store.getComponentLibrary(), session.info.libraries)

  const heading = (name: ReactNode) => (
    <SelectionHeading
      icon={<NodeIcon node={layer.layer} className={headingIcon} />}
      color={nodeColor(layer.layer)}
      name={name}
      kind={kind.label}
      detail={kind.description}
      action={
        <>
          <LayerActions node={layer.layer} />
          {!fromCode && <VisibleToggle node={node} override={override} change={change} reset={reset} />}
        </>
      }
    />
  )

  if (inner || fromCode) {
    return (
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        {heading(<Name className={`px-1.5 ${headingName}`}>{label}</Name>)}
        <CopyBar />
      </div>
    )
  }

  return (
    <div className={`border-b py-3 pl-4 ${panelEnd}`}>
      {heading(
        <NameInput
          key={`${nodeId}:${layer.layer.name ?? ""}`}
          defaultValue={layer.layer.name ?? ""}
          placeholder={label}
          aria-label="Layer name"
          className={`h-7 border-transparent bg-transparent px-1.5 shadow-none hover:border-input dark:bg-transparent ${headingName}`}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim()

            if (name === (layer.layer.name ?? "")) {
              return
            }

            renameAndRecord(store, key, name || undefined, nodeId)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
        />
      )}
      <ComponentStateSelector entry={entry} state={state} target={target} />
      {/*
        A component or an instance is already one, and a route or a layer read from an element is the app's code, so
        they have no Make component.
      */}
      {layer.depth > 0 &&
        !layer.layer.element &&
        layer.layer.type !== "instance" &&
        layer.layer.type !== "component" &&
        layer.layer.type !== "route" && (
          <MakeComponent
            entry={entry}
            nodeId={nodeId}
            beside={
              layer.layer.type === "layout" &&
              container.kind === "component" && <MakeSlot entry={entry} node={layer.layer} />
            }
          />
        )}
      {/* The outermost layout is the design itself, with no Make component, but it can still be a slot. */}
      {layer.depth === 0 && layer.layer.type === "layout" && container.kind === "component" && (
        <div className="mt-2 flex">
          <MakeSlot entry={entry} node={layer.layer} />
        </div>
      )}
    </div>
  )
}

/** A layer read from an element is called by its type, as Button, with what made it that, as its tag or role. */
function elementKind(element: ElementFacts): LayerKind {
  const layer = describeElement(element)

  return { label: layer.name, description: layer.detail }
}

/** Where the selected layer's edits go, alone: the state or variant being edited, and switching it. */
export function LayerStateSelector() {
  const layer = useSelectedLayer()

  if (!layer || layer.inner) {
    return null
  }

  return (
    <div className={`px-4 pb-3 ${panelEnd}`}>
      <ComponentStateSelector entry={layer.entry} state={layer.state} target={layer.target} />
    </div>
  )
}

/**
 * Under a layer inside an instance: that edits change only this copy, with Reset and Push to main, or where edits go
 * while they're sent to a state; then Edit in the component the layer belongs to.
 */
function CopyBar() {
  const session = useProject()
  const { store } = session
  const entries = useContainerEntries(store)
  const layer = useSelectedLayer()

  if (!layer?.inner) {
    return null
  }

  const { entry, nodeId, inner, override, reset, state, target } = layer
  const own = inner.instance.overrides?.[inner.key]
  const main = entries.find((candidate) => candidate.container.id === inner.instance.design)

  const push = () =>
    main && pushAndRecord(store, entry.key, main.key, inner.instance.id, { key: inner.key, path: nodeId })

  // The component this layer belongs to: the nested one for a layer inside a nested instance.
  const owner = entries.find((candidate) => candidate.container.id === inner.component.id)

  return (
    <>
      {editsDesign(entry.container, target) ? (
        <div
          className="mt-3 rounded-md border px-2.5 py-2 text-xs"
          style={{
            borderColor: kindColors.component,
            background: "color-mix(in oklch, var(--canvas-component) 8%, transparent)"
          }}
        >
          <p className="type-message">
            <span className="text-muted-foreground">Editing this copy of </span>
            {main?.container.name ?? inner.instance.design}
            <span className="text-muted-foreground">, changes only this instance</span>
          </p>
          <div className="mt-2 flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 flex-1 px-2 text-xs"
              disabled={patchSize(override ?? {}) === 0}
              onClick={() => reset()}
            >
              Reset
            </Button>
            <Hint
              label={own ? `Make this layer's overrides the default in every ${main?.container.name}` : undefined}
              wait
            >
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 px-2 text-xs"
                disabled={!own || !main}
                onClick={push}
              >
                Push to main
              </Button>
            </Hint>
          </div>
        </div>
      ) : (
        <ComponentStateSelector entry={entry} state={state} target={target} />
      )}
      {owner && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            const root = inner.node.id === owner.container.root.id
            session.selection.set(root ? { design: owner.key } : { design: owner.key, node: inner.node.id })
            revealSelection(session)
          }}
        >
          <Diamond style={{ color: kindColors.component }} /> Edit in {owner.container.name}
        </Button>
      )}
    </>
  )
}

/**
 * A text layer's words, in Content. In a component design, the button beside them uses one of the component's props
 * for the text; a copy's text can't.
 */
export function LayerContent() {
  const layer = useSelectedLayer()

  if (layer?.node.type !== "text") {
    return null
  }

  const { entry, nodeId, node, override, change, reset, inner } = layer
  const usesProps = entry.container.kind === "component" && !inner

  const withTextProp = (field: ReactNode) =>
    usesProps ? (
      <TextWithProp entry={entry} nodeId={nodeId} bound={node.bind?.text}>
        {field}
      </TextWithProp>
    ) : (
      field
    )

  return (
    <ContentSection
      text={node.text}
      tag={undefined}
      onText={(text) => change("Edit text", { text })}
      onTag={() => undefined}
      textChanged={override?.text === undefined ? undefined : { onReset: () => reset({ kind: "text" }) }}
      aroundText={(field) => withTextProp(field)}
    />
  )
}

/** An image's or a video's Content, for one of the design's own: inside an instance, its file belongs to the component. */
function LayerMedia() {
  const layer = useSelectedLayer()

  if (!layer || layer.inner || (layer.node.type !== "image" && layer.node.type !== "video")) {
    return null
  }

  return <MediaSection entry={layer.entry} node={layer.node} />
}

/** That a code component taking no `style` can't be sized or styled here, before the style sections. */
function LayerNoStyle() {
  const layer = useSelectedLayer()

  return (
    layer?.node.type === "component" && (
      <NoStyleNote component={layer.node.component} wrap={layer.inner === undefined} />
    )
  )
}

/**
 * The selected layer's style sections, edited in the state and variant shown: in a layer kind's `order` when its panel
 * gives one (PAR-1056), or the table's.
 */
export function LayerStyles({ order }: { order?: readonly StyleSection[] }) {
  const layer = useSelectedLayer()

  return layer ? <LayerStyleSections entry={layer.entry} nodeId={layer.nodeId} order={order} /> : null
}

/** The style sections for one layer, edited through its style editor. */
function LayerStyleSections({
  entry,
  nodeId,
  order
}: {
  entry: ContainerEntry
  nodeId: string
  order?: readonly StyleSection[]
}) {
  const session = useProject()
  const components = useComponents(session.components)
  const styleEditor = useStyleEditor(entry, [nodeId])

  return (
    styleEditor && (
      <StyleSections
        editor={styleEditor}
        container={entry.container}
        takesStyle={(component) => components[component]?.takesStyle}
        order={order}
      />
    )
  )
}

/** Export, for the selected layer. */
export function LayerExport() {
  const session = useProject()
  const entries = useContainerEntries(session.store)
  const layer = useSelectedLayer()

  if (!layer) {
    return null
  }

  const name = layerLabel(layer.node, entries, session.store.getComponentLibrary(), session.info.libraries)

  return <ExportSection targets={[{ design: layer.entry.key, node: layer.nodeId, name }]} label={`Export ${name}`} />
}

/**
 * Whether the layer shows, as the eye at the end of its name's row, crossed out while it's hidden, as Layers draws it.
 * Changed in the state being edited, the eye has the change mark and a reset arrow before it.
 */
function VisibleToggle({
  node,
  override,
  change,
  reset
}: {
  node: DesignNode
  override: NodePatch | undefined
  change: LayerChange
  reset: (field?: PatchField) => void
}) {
  const changed = override?.hidden !== undefined
  const label = node.hidden ? "Show layer" : "Hide layer"

  const eye = (
    <span className="relative flex">
      <Hint label={label}>
        <Button
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground"
          aria-label={label}
          onClick={() => change("Toggle visibility", { hidden: !node.hidden })}
        >
          {node.hidden ? <EyeOff /> : <Eye />}
        </Button>
      </Hint>
      {changed && <ChangeMark />}
    </span>
  )

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {changed && (
        <Hint label="Reset whether it shows">
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground"
            aria-label="Reset whether it shows"
            onClick={() => reset({ kind: "hidden" })}
          >
            <RotateCcw />
          </Button>
        </Hint>
      )}
      {eye}
    </div>
  )
}

/**
 * Says that a component's props have no `style`, where the sizes and styles below would go, so they don't change it,
 * and offers a layout around it to size instead. Inside an instance, that belongs in the component design.
 */
function NoStyleNote({ component, wrap }: { component: string; wrap: boolean }) {
  return (
    <div className={`flex flex-col gap-2 border-b py-2.5 pl-4 ${panelEnd}`}>
      <p className="type-description text-muted-foreground">
        {component} doesn&apos;t take a <code>style</code>, so it can&apos;t be sized or styled here.
        {wrap ? " Wrap it in a layout and size that instead." : ""}
      </p>
      {wrap && (
        <Button variant="outline" size="sm" onClick={() => void actions.wrap.run("panel")}>
          <Group /> {keymap.wrap.label} <Kbd className="ml-auto">{shortcutOf("wrap")}</Kbd>
        </Button>
      )}
    </div>
  )
}

/**
 * Extracts the selected layer into a component design, with its texts as params. `beside` is the other thing the
 * layer can become, a slot, shown next to it until a name is being typed.
 */
function MakeComponent({ entry, nodeId, beside }: { entry: ContainerEntry; nodeId: string; beside?: ReactNode }) {
  const session = useProject()
  const [naming, setNaming] = useState(false)
  const [error, setError] = useState<string>()

  if (!naming) {
    return (
      <div className="mt-2 flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => setNaming(true)}>
          <Sparkles /> Make component
        </Button>
        {beside}
      </div>
    )
  }

  return (
    <form
      className="mt-2 flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        const field = new FormData(event.currentTarget).get("name")
        const name = (field instanceof File ? "" : (field ?? "")).trim()

        if (!name) {
          return
        }

        try {
          const key = extractIntoComponent(session, entry, [nodeId], name)
          session.selection.set({ design: key })
          revealSelection(session)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }}
    >
      <div className="flex gap-1.5">
        <NameInput name="name" ref={focusOnMount} placeholder="Component name" className="h-7 flex-1 px-2 text-xs" />
        <Button type="submit" size="sm">
          Extract
        </Button>
      </div>
      {error && <p className="type-message text-destructive">{error}</p>}
    </form>
  )
}

/**
 * Says where edits go, and switches it. Editing another state, or a variant, never changes the base design. Only a
 * component has states and variants, so a screen's or a frame's edits always change the design, and it shows nothing.
 */
function ComponentStateSelector({
  entry,
  state,
  target
}: {
  entry: ContainerEntry
  state: StateSpec
  target: EditTarget
}) {
  const { store, selection } = useProject()
  const selected = useSelection(selection)

  if (entry.container.kind !== "component") {
    return null
  }

  const base = editsDesign(entry.container, target)
  const states = designStates(entry.container)

  const variant =
    target.variant &&
    entry.container.params?.[target.variant.param]?.options?.find((option) => option.id === target.variant!.option)

  const variantOnly = !base && variant && state.id === states[0]!.id
  let changes = "changes only this state"

  if (base) {
    changes = "changes every state"
  } else if (variantOnly) {
    changes = `changes only the ${variant.name} variant`
  }

  return (
    <div
      className="mt-3 flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs"
      style={
        base
          ? undefined
          : {
              borderColor: kindColors.component,
              background: "color-mix(in oklch, var(--canvas-component) 8%, transparent)"
            }
      }
    >
      <span className="shrink-0 text-muted-foreground">Editing</span>
      <AppSelect
        variant="panel"
        className="h-6 w-auto max-w-32 shrink-0 gap-1 border-none bg-transparent px-1 shadow-none dark:bg-transparent"
        items={states.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
        value={state.id}
        onValueChange={(id) => {
          if (!id) {
            return
          }

          const name = states.find((candidate) => candidate.id === id)?.name ?? id
          store.updateView(entry.key, `Show ${name}`, (view) => ({ ...view, state: id }))
          selection.set({ ...selected, state: id })
        }}
      />
      {/* What edits change wraps rather than spilling past the bar when it doesn't fit beside the state. */}
      <span className="min-w-0 text-muted-foreground">{changes}</span>
    </div>
  )
}

/** A node's rendered size in layout pixels, in the frame it was picked in. */
export function measureNode(
  editor: Editor | undefined,
  design: string,
  nodeId: string,
  picked: { mode?: string; state?: string }
): { width: number; height: number } | undefined {
  const area = editor?.getContainer().closest(".canvas-area")
  const host = area ? selectionFrame(area, design, picked) : undefined
  const rect = host && area ? nodeInFrames(area, design, nodeId, host).find((item) => item.picked)?.rect : undefined

  return host && rect ? frameSize(frameGeometry(host), rect) : undefined
}

/**
 * Where a layer sits in its parent's box, in the design's pixels: the parent's size, its own, and its offset from the
 * parent's top left, as Position's inset box measures pinned sides against. Undefined when it isn't drawn.
 */
export function placeNode(
  editor: Editor | undefined,
  design: string,
  nodeId: string,
  picked: { mode?: string; state?: string }
):
  | {
      parent: { width: number; height: number }
      size: { width: number; height: number }
      inFlow: { x: number; y: number }
    }
  | undefined {
  const area = editor?.getContainer().closest(".canvas-area")
  const host = area ? selectionFrame(area, design, picked) : undefined
  const found = host && area ? nodeInFrames(area, design, nodeId, host).find((item) => item.picked) : undefined
  // Insets count from the containing block inside its border, which `offsetParent` gives (see `LayerSnapping`).
  const around = found?.element?.offsetParent

  if (!host || !found || !(around instanceof HTMLElement) || !editor) {
    return undefined
  }

  // Screen pixels per the frame's own: the zoom times the frame's scale (PAR-967).
  const { scale } = frameGeometry(host)
  const border = getComputedStyle(around)
  const outer = around.getBoundingClientRect()
  const left = outer.left / scale + parseFloat(border.borderLeftWidth)
  const top = outer.top / scale + parseFloat(border.borderTopWidth)
  const { rect } = found

  // In whole pixels, as an inset pinned from them is typed: the zoom leaves fractions.
  return {
    parent: { width: around.clientWidth, height: around.clientHeight },
    size: { width: Math.round(rect.width / scale), height: Math.round(rect.height / scale) },
    inFlow: { x: Math.round(rect.left / scale - left), y: Math.round(rect.top / scale - top) }
  }
}

/** A picture's or a video's layer, which the section edits the same way. */
type MediaNode = ImageNode | VideoNode

/**
 * An image's or a video's file, its description for screen readers, how it fills its box, and who to credit; and for a
 * video, whether it shows its controls or plays by itself (PAR-841).
 */
function MediaSection({ entry, node }: { entry: ContainerEntry; node: MediaNode }) {
  const { store } = useProject()
  const kind = node.type
  const noun = kind === "video" ? "video" : "image"

  const edit = (label: string, field: "src" | "alt" | "fit" | "controls", fields: OwnFields) =>
    updateAndRecord(store, entry.key, label, (container) => setOwnFields(container, node.id, fields), {
      field: `${kind}.${field}`,
      layers: [node.id],
      read: (container) => {
        const media = findNode(container.root, node.id)

        if (media?.type !== kind) {
          return undefined
        }

        if (field !== "controls") {
          return media[field]
        }

        return media.type === "video" ? media.controls : undefined
      }
    })

  return (
    <PanelSection title="Content">
      <BaseDesignNote
        entry={entry}
        what={kind === "video" ? "File, alt text, fit and controls" : "File, alt text and fit"}
      />
      <FieldGrid>
        <Field label="File">
          <TextInput value={node.src} onCommit={(src) => src && edit(`Change ${noun}`, "src", { src })} />
        </Field>
        <Field label="Alt text" hint="What it shows, for screen readers. Leave empty if it's decoration.">
          <TextInput multiline value={node.alt ?? ""} onCommit={(alt) => edit(`Describe ${noun}`, "alt", { alt })} />
        </Field>
        <Field label="Fit">
          <AppSelect<ImageFit>
            variant="panel"
            className="w-full"
            value={node.fit}
            none="Cover"
            items={[
              { value: "cover", label: "Cover, cropped to fill" },
              { value: "contain", label: "Contain, shown whole" },
              { value: "fill", label: "Fill, stretched" }
            ]}
            onValueChange={(fit) => edit("Change fit", "fit", { fit })}
          />
        </Field>
        {node.type === "video" && (
          <SwitchRow
            label="Controls"
            checked={node.controls === true}
            onCheckedChange={(controls) => edit(controls ? "Show controls" : "Hide controls", "controls", { controls })}
          />
        )}
      </FieldGrid>
      {node.credit && <PhotoCredit credit={node.credit} className="mt-1" />}
    </PanelSection>
  )
}

type ImageFit = NonNullable<ImageNode["fit"]>
