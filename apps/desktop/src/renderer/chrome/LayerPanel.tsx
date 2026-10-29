import {
  boardTarget,
  type ContainerSpec,
  type DesignNode,
  detachInstance,
  editNode,
  type EditTarget,
  editsDesign,
  type ImageNode,
  innerChanges,
  type InstanceNode,
  isInnerPath,
  locateInner,
  locateNode,
  mapNode,
  type NodeChange,
  nodeInState,
  type NodePatch,
  type NodeStyle,
  overrideCount,
  type PatchField,
  patchSize,
  pushOverrides,
  resetInstance,
  resetOverride,
  shownVariants,
  type StateSpec,
  swapInstance,
  targetPatches
} from "@parity/core"
import { BookOpen, Diamond, Group, Sparkles, Unlink } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProject } from "../canvas/context.ts"
import { frameScale, nodeInFrames, selectionFrame } from "../canvas/hit.ts"
import { focusOnMount, kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { editLayer, projectLibrary, resetLayer } from "../canvas/layers.ts"
import { useComponents } from "../components-store.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { spacingUnit, useTokenList } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { wrapSelection } from "./commands.ts"
import { extractIntoComponent } from "./components.ts"
import { ChoiceInput, Field, SwitchInput, TextInput, ValueInput } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { keymap } from "./keymap.ts"
import { PanelSection } from "./PanelSection.tsx"
import { PropsSection } from "./PropsSection.tsx"
import { revealSelection } from "./reveal.ts"
import { hasStories, openInStorybook } from "./storybook.ts"
import { type StyleEditor, StyleSections } from "./StyleSections.tsx"

/** The state edits go to: the one the layer was picked in, else the one the design shows. */
export function editingState(container: ContainerSpec, picked: string | undefined): StateSpec {
  return (
    container.states.find((state) => state.id === picked) ??
    container.states.find((state) => state.id === container.view?.state) ??
    container.states[0]!
  )
}

/**
 * A selected layer's properties. Edits apply to the state being shown: in the base state they change the design; in
 * any other state they're saved as that state's changes, marked, and each can be reset. A variant shown on a
 * component's board takes edits the same way. Inside an instance, edits change only that copy.
 */
export function LayerPanel({ entry, nodeId }: { entry: ContainerEntry; nodeId: string }) {
  return isInnerPath(nodeId) ? (
    <InnerLayerPanel entry={entry} path={nodeId} />
  ) : (
    <DesignLayerPanel entry={entry} nodeId={nodeId} />
  )
}

/** One of the design's own layers. */
function DesignLayerPanel({ entry, nodeId }: { entry: ContainerEntry; nodeId: string }) {
  const session = useProject()
  const { store, selection } = session
  const selected = useSelection(selection)
  const entries = useContainerEntries(store)
  const { container, key } = entry
  const location = locateNode(container.root, nodeId)
  if (!location) {
    return <p className="p-4 text-sm text-muted-foreground">This layer no longer exists.</p>
  }
  const state = editingState(container, selected.state)
  const target = boardTarget(container, state.id)
  const variants = shownVariants(container)
  const node = nodeInState(location.node, state, variants)
  const override = targetPatches(container, target)?.[nodeId]

  const change = (label: string, value: NodeChange, field: string) =>
    store.updateContainer(key, label, (current) => editNode(current, boardTarget(current, state.id), nodeId, value), {
      group: `edit:${nodeId}:${field}`
    })
  const reset = (field?: PatchField) =>
    store.updateContainer(key, "Reset change", (current) =>
      resetOverride(current, boardTarget(current, state.id), nodeId, field)
    )
  const parent = location.ancestors.at(-1)
  const parentStyle = parent?.type === "layout" ? (nodeInState(parent, state, variants).style ?? {}) : undefined

  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <NodeIcon node={location.node} className="size-4 shrink-0" style={{ color: nodeColor(location.node) }} />
          <Input
            key={`${nodeId}:${location.node.name ?? ""}`}
            defaultValue={location.node.name ?? ""}
            placeholder={layerLabel(location.node, entries)}
            aria-label="Layer name"
            className="h-7 flex-1 border-transparent bg-transparent px-1.5 font-medium shadow-none hover:border-input dark:bg-transparent"
            onBlur={(event) => {
              const name = event.currentTarget.value.trim()
              if (name === (location.node.name ?? "")) return
              store.updateContainer(key, "Rename layer", (current) => renameLayer(current, nodeId, name || undefined))
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
        </div>
        <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
          {describeNode(location.node, entries)} in {container.name}
        </p>
        <StateTarget entry={entry} state={state} target={target} />
        {location.ancestors.length > 0 && location.node.type !== "instance" && (
          <MakeComponent entry={entry} nodeId={nodeId} />
        )}
      </div>

      {node.type === "instance" && (
        <InstanceSection
          entry={entry}
          node={node}
          own={location.node as InstanceNode}
          changed={(name) => override?.props?.[name] !== undefined}
          onChange={(name, value) => change(`Change ${name}`, { props: { [name]: value } }, `props.${name}`)}
          onReset={(name) => reset({ kind: "props", key: name })}
        />
      )}

      <LayerSections
        entry={entry}
        nodeId={nodeId}
        node={node}
        override={override}
        change={change}
        reset={reset}
        parentStyle={parentStyle}
      />
    </>
  )
}

/**
 * A layer inside an instance. Edits are this copy's overrides: the rest of the copy keeps following its component, and
 * each override can be reset or pushed to the component, so every instance gets it.
 */
function InnerLayerPanel({ entry, path }: { entry: ContainerEntry; path: string }) {
  const session = useProject()
  const { store, selection } = session
  const selected = useSelection(selection)
  const entries = useContainerEntries(store)
  const { container, key } = entry
  const library = projectLibrary(store)
  const state = editingState(container, selected.state)
  const target = boardTarget(container, state.id)
  const inner = locateInner(container, path, library, { state, variants: container.view?.variants })
  if (!inner) {
    return <p className="p-4 text-sm text-muted-foreground">This layer no longer exists.</p>
  }
  const node = inner.shown
  const override = innerChanges(container, target, path, library)
  const own = inner.instance.overrides?.[inner.key]
  const main = entries.find((candidate) => candidate.container.id === inner.instance.design)

  const change = (label: string, value: NodeChange, field: string) =>
    store.updateContainer(
      key,
      label,
      (current) => editLayer(store, current, boardTarget(current, state.id), path, value),
      { group: `edit:${path}:${field}` }
    )
  const reset = (field?: PatchField) =>
    store.updateContainer(key, "Reset change", (current) =>
      resetLayer(store, current, boardTarget(current, state.id), path, field)
    )
  const push = () => {
    if (!main) return
    store.updateContainers([key, main.key], `Push to ${main.container.name}`, ([design, component]) => {
      const pushed = pushOverrides(design!, inner.instance.id, component!, [inner.key])
      return [pushed.container, pushed.component]
    })
  }
  const parent = inner.location.ancestors.at(-1)
  const parentStyle = parent?.type === "layout" ? (parent.style ?? {}) : undefined
  // The component this layer belongs to: the nested one for a layer inside a nested instance.
  const owner = entries.find((candidate) => candidate.container.id === inner.component.id)

  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex h-7 items-center gap-2">
          <NodeIcon node={inner.node} className="size-4 shrink-0" style={{ color: kindColors.component }} />
          <span className="truncate px-1.5 text-sm font-medium">{layerLabel(inner.node, entries)}</span>
        </div>
        <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
          {describeNode(inner.node, entries)} in {layerLabel(inner.instance, entries)}
        </p>
        {editsDesign(container, target) ? (
          <div
            className="mt-3 rounded-md border px-2.5 py-2 text-xs"
            style={{
              borderColor: kindColors.component,
              background: "color-mix(in oklch, var(--canvas-component) 8%, transparent)"
            }}
          >
            <p>
              <span className="text-muted-foreground">Editing this copy of </span>
              {main?.container.name ?? inner.instance.design}
              <span className="text-muted-foreground">, changes only this instance</span>
            </p>
            <div className="mt-2 flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 px-2 text-xs"
                disabled={patchSize(override) === 0}
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
          <StateTarget entry={entry} state={state} target={target} />
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
      </div>

      {node.type === "instance" && (
        <InstanceSection
          entry={entry}
          node={node}
          changed={(name) => override.props?.[name] !== undefined}
          onChange={(name, value) => change(`Change ${name}`, { props: { [name]: value } }, `props.${name}`)}
          onReset={(name) => reset({ kind: "props", key: name })}
        />
      )}

      <LayerSections
        entry={entry}
        nodeId={path}
        node={node}
        override={override}
        change={change}
        reset={reset}
        parentStyle={parentStyle}
        inner
      />
    </>
  )
}

/** The sections every layer has: its content, visibility, props and style, edited through `change` and `reset`. */
function LayerSections({
  entry,
  nodeId,
  node,
  override,
  change,
  reset,
  parentStyle,
  inner = false
}: {
  entry: ContainerEntry
  nodeId: string
  /** The layer as it's shown, with the state's, variant's and copy's changes applied. */
  node: DesignNode
  /** What the state, variant or copy being edited changes about it, to mark and reset. */
  override: NodePatch | undefined
  change(label: string, value: NodeChange, field: string): void
  reset(field?: PatchField): void
  parentStyle: NodeStyle | undefined
  /** Inside an instance, where an image's file and description belong to the component. */
  inner?: boolean
}) {
  const session = useProject()
  const { tokens: tokenStore, selection } = session
  const components = useComponents(session.components)
  const tokens = useTokenList(tokenStore)
  const selected = useSelection(selection)
  const parentLayout = parentStyle
    ? { direction: parentStyle.direction ?? "column", grid: parentStyle.display === "grid" }
    : undefined
  const styleEditor: StyleEditor = {
    style: node.style ?? {},
    changed: (name) => override?.style?.[name] !== undefined,
    reset: (name) => reset({ kind: "style", key: name }),
    set: (values, label = "Change style") =>
      change(label, { style: values as NodeStyle }, `style.${Object.keys(values).join(",")}`),
    tokens,
    unit: spacingUnit(tokens),
    measure: (axis) => {
      const size = measureNode(session, entry.key, nodeId, selected)
      return size && Math.max(1, Math.round(size[axis] / spacingUnit(tokens)))
    }
  }

  return (
    <>
      {(node.type === "text" || (node.type === "component" && typeof node.props?.children === "string")) && (
        <PanelSection title="Content">
          {node.type === "text" ? (
            <Field label="Text" changed={override?.text !== undefined} onReset={() => reset({ kind: "text" })}>
              <TextInput multiline value={node.text} onCommit={(text) => change("Edit text", { text }, "text")} />
            </Field>
          ) : (
            <Field
              label="Label"
              changed={override?.props?.children !== undefined}
              onReset={() => reset({ kind: "props", key: "children" })}
            >
              <TextInput
                multiline
                value={String(node.props?.children ?? "")}
                onCommit={(children) => change("Edit label", { props: { children } }, "props.children")}
              />
            </Field>
          )}
        </PanelSection>
      )}

      {node.type === "image" && !inner && <ImageSection entry={entry} node={node} />}

      <PanelSection title="Visibility">
        <Field label="Visible" changed={override?.hidden !== undefined} onReset={() => reset({ kind: "hidden" })}>
          <SwitchInput
            value={!node.hidden}
            onChange={(visible) => change("Toggle visibility", { hidden: !visible }, "hidden")}
          />
        </Field>
      </PanelSection>

      {node.type === "component" && (
        <PropsSection
          node={node}
          info={components[node.component]}
          changed={(name) => override?.props?.[name] !== undefined}
          onChange={(name, value) => change(`Change ${name}`, { props: { [name]: value } }, `props.${name}`)}
          onReset={(name) => reset({ kind: "props", key: name })}
        />
      )}

      {node.type === "component" && hasStories(session, node.component) && (
        <div className="px-4 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void openInStorybook(session, node.component)}
          >
            <BookOpen /> Open {node.component} in Storybook
          </Button>
        </div>
      )}

      {node.type === "component" && components[node.component]?.takesStyle === false && (
        <NoStyleNote component={node.component} wrap={!inner} />
      )}

      <StyleSections editor={styleEditor} node={node} parent={parentLayout} />
    </>
  )
}

/**
 * Says that a component's props have no `style`, where the sizes and styles below would go, so they don't change it,
 * and offers a layout around it to size instead. Inside an instance, that belongs in the component design.
 */
function NoStyleNote({ component, wrap }: { component: string; wrap: boolean }) {
  const session = useProject()
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-2.5">
      <p className="text-xs text-muted-foreground">
        {component} doesn't take a <code>style</code>, so the size and styles below don't change it.
        {wrap ? " Wrap it in a layout and size that instead." : ""}
      </p>
      {wrap && (
        <Button variant="outline" size="sm" onClick={() => wrapSelection(session)}>
          <Group /> {keymap.wrap.label}{" "}
          <span className="ml-auto text-xs text-muted-foreground">{keymap.wrap.keys[0]}</span>
        </Button>
      )}
    </div>
  )
}

/** Extracts the selected layer into a component design, with its texts as params. */
function MakeComponent({ entry, nodeId }: { entry: ContainerEntry; nodeId: string }) {
  const session = useProject()
  const [naming, setNaming] = useState(false)
  const [error, setError] = useState<string>()
  if (!naming) {
    return (
      <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setNaming(true)}>
        <Sparkles /> Make component
      </Button>
    )
  }
  return (
    <form
      className="mt-2 flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        const name = String(new FormData(event.currentTarget).get("name") ?? "").trim()
        if (!name) return
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
        <Input name="name" ref={focusOnMount} placeholder="Component name" className="h-7 flex-1 px-2 text-xs" />
        <Button type="submit" size="sm">
          Extract
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  )
}

/**
 * An instance of a component design: which component, its variants and params, and, for one of the design's own
 * instances (`own`), its state, its overrides, and swapping or detaching it.
 */
function InstanceSection({
  entry,
  node,
  own,
  changed,
  onChange,
  onReset
}: {
  entry: ContainerEntry
  /** The instance as it's shown. */
  node: InstanceNode
  /** The instance as the design has it, when it's one of the design's own nodes rather than a nested one. */
  own?: InstanceNode
  changed(name: string): boolean
  onChange(name: string, value: unknown): void
  onReset(name: string): void
}) {
  const session = useProject()
  const { store, selection } = session
  const entries = useContainerEntries(store)
  const component = entries.find((candidate) => candidate.container.id === node.design)
  if (!component) {
    return (
      <PanelSection title="Instance">
        <p className="px-1 text-xs text-destructive">The component design "{node.design}" doesn't exist.</p>
      </PanelSection>
    )
  }
  const params = Object.entries(component.container.params ?? {})
  const overrides = own ? overrideCount(own) : 0
  const library = projectLibrary(store)
  const replace = (label: string, update: (container: ContainerSpec) => ContainerSpec) =>
    store.updateContainer(entry.key, label, update)
  const push = () =>
    store.updateContainers([entry.key, component.key], `Push to ${component.container.name}`, ([design, main]) => {
      const pushed = pushOverrides(design!, node.id, main!)
      return [pushed.container, pushed.component]
    })
  // Another component this copy could become: not the design it's in, which can't contain itself.
  const swappable = entries.filter(
    (candidate) => candidate.container.kind === "component" && candidate.container.id !== entry.container.id
  )

  return (
    <PanelSection
      title="Instance"
      action={
        <Hint label={`Go to ${component.container.name}`} wait>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              selection.set({ design: component.key })
              revealSelection(session)
            }}
          >
            <Diamond style={{ color: kindColors.component }} /> {component.container.name}
          </Button>
        </Hint>
      }
    >
      <div className="flex flex-col gap-1">
        {own && (
          <Field label="State">
            <ChoiceInput
              value={own.state}
              options={component.container.states.slice(1).map((state) => ({ value: state.id, label: state.name }))}
              placeholder={component.container.states[0]!.name}
              onChange={(state) =>
                replace("Change instance state", (container) => ({
                  ...container,
                  root: mapNode(container.root, node.id, (current) => {
                    const next = { ...current } as InstanceNode
                    if (state) next.state = state
                    else delete next.state
                    return next
                  })
                }))
              }
            />
          </Field>
        )}
        {params.map(([name, param]) =>
          param.type === "variant" ? (
            <Field key={name} label={name} changed={changed(name)} onReset={() => onReset(name)}>
              <ChoiceInput
                value={typeof node.args?.[name] === "string" ? (node.args[name] as string) : undefined}
                options={(param.options ?? []).map((option) => ({ value: option.id, label: option.name }))}
                placeholder={
                  param.options?.find((option) => option.id === param.default)?.name ?? param.options?.[0]?.name
                }
                onChange={(value) => onChange(name, value)}
              />
            </Field>
          ) : (
            <Field key={name} label={name} changed={changed(name)} onReset={() => onReset(name)}>
              <ValueInput
                value={node.args?.[name] ?? param.default ?? (param.type === "boolean" ? false : "")}
                onCommit={(value) => onChange(name, value)}
              />
            </Field>
          )
        )}
      </div>
      {own && (
        <div className="mt-3 flex flex-col gap-2 px-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="flex-1 text-muted-foreground">
              {overrides === 0
                ? "No overrides: it matches the component."
                : `${overrides} override${overrides === 1 ? "" : "s"} inside`}
            </span>
            {overrides > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => replace("Reset overrides", (container) => resetInstance(container, node.id))}
                >
                  Reset all
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={push}>
                  Push to main
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-1.5">
            <Select
              value=""
              onValueChange={(design) =>
                replace("Swap instance", (container) => swapInstance(container, node.id, design, library))
              }
            >
              <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Swap component" />
              </SelectTrigger>
              <SelectContent>
                {swappable
                  .filter((candidate) => candidate.container.id !== node.design)
                  .map((candidate) => (
                    <SelectItem key={candidate.key} value={candidate.container.id}>
                      {candidate.container.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Hint label="Turn this copy into plain layers, no longer linked to the component" wait>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => replace("Detach instance", (container) => detachInstance(container, node.id, library))}
              >
                <Unlink /> Detach
              </Button>
            </Hint>
          </div>
        </div>
      )}
    </PanelSection>
  )
}

/** Says where edits go, and switches it. Editing another state, or a variant, never changes the base design. */
function StateTarget({ entry, state, target }: { entry: ContainerEntry; state: StateSpec; target: EditTarget }) {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const base = editsDesign(entry.container, target)
  const variant =
    target.variant &&
    entry.container.params?.[target.variant.param]?.options?.find((option) => option.id === target.variant!.option)
  const variantOnly = !base && variant && state.id === entry.container.states[0]!.id
  return (
    <div
      className="mt-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
      style={
        base
          ? undefined
          : { borderColor: kindColors.agent, background: "color-mix(in oklch, var(--canvas-agent) 8%, transparent)" }
      }
    >
      <span className="shrink-0 text-muted-foreground">Editing</span>
      <Select
        value={state.id}
        onValueChange={(id) => {
          store.updateView(entry.key, (view) => ({ ...view, state: id }))
          selection.set({ ...selected, state: id })
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-6 flex-1 border-none bg-transparent px-1.5 text-xs shadow-none dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entry.container.states.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="shrink-0 text-muted-foreground">
        {base
          ? "changes the design"
          : variantOnly
            ? `changes only the ${variant.name} variant`
            : "changes only this state"}
      </span>
    </div>
  )
}

/** A node's rendered size in layout pixels, in the frame it was picked in. */
export function measureNode(
  session: ProjectSession,
  design: string,
  nodeId: string,
  picked: { mode?: string; state?: string }
): { width: number; height: number } | undefined {
  const area = session.editor?.getContainer().closest(".canvas-area")
  const host = area ? selectionFrame(area, design, picked) : undefined
  const rect = host && area ? nodeInFrames(area, design, nodeId, host).find((item) => item.picked)?.rect : undefined
  if (!host || !rect || !session.editor) return undefined
  const scale = session.editor.getZoomLevel() * frameScale(host)
  return { width: rect.width / scale, height: rect.height / scale }
}

function describeNode(node: DesignNode, entries: readonly ContainerEntry[]): string {
  if (node.type === "component") return `${node.component} component`
  if (node.type === "instance") {
    const name = entries.find((entry) => entry.container.id === node.design)?.container.name
    return `Instance of ${name ?? node.design}`
  }
  if (node.type === "text") return `Text${node.tag ? `, ${node.tag}` : ""}`
  if (node.type === "image") return "Image"
  return node.style?.direction === "row" ? "Row layout" : "Column layout"
}

/** An image's file, its description for screen readers, how it fills its box, and who to credit. */
function ImageSection({ entry, node }: { entry: ContainerEntry; node: ImageNode }) {
  const { store } = useProject()
  const edit = (label: string, update: (image: ImageNode) => ImageNode) =>
    store.updateContainer(entry.key, label, (container) => ({
      ...container,
      root: mapNode(container.root, node.id, (current) => (current.type === "image" ? update(current) : current))
    }))
  return (
    <PanelSection title="Image">
      <Field label="File">
        <TextInput value={node.src} onCommit={(src) => src && edit("Change image", (image) => ({ ...image, src }))} />
      </Field>
      <Field label="Alt text" hint="What it shows, for screen readers. Leave empty if it's decoration.">
        <TextInput
          multiline
          value={node.alt ?? ""}
          onCommit={(alt) =>
            edit("Describe image", (image) => {
              const next: ImageNode = { ...image, alt }
              if (!alt) delete next.alt
              return next
            })
          }
        />
      </Field>
      <Field label="Fit">
        <ChoiceInput<ImageFit>
          value={node.fit}
          placeholder="Cover"
          options={[
            { value: "cover", label: "Cover, cropped to fill" },
            { value: "contain", label: "Contain, shown whole" },
            { value: "fill", label: "Fill, stretched" }
          ]}
          onChange={(fit) =>
            edit("Change fit", (image) => {
              const next: ImageNode = { ...image, fit }
              if (!fit) delete next.fit
              return next
            })
          }
        />
      </Field>
      {node.credit && (
        <p className="px-1 text-xs text-muted-foreground">
          Photo by{" "}
          <a href={node.credit.url} target="_blank" rel="noreferrer" className="text-foreground hover:underline">
            {node.credit.name}
          </a>
          {node.credit.source ? ` on ${node.credit.source}` : ""}
        </p>
      )}
    </PanelSection>
  )
}

type ImageFit = NonNullable<ImageNode["fit"]>

export function renameLayer(container: ContainerSpec, nodeId: string, name: string | undefined): ContainerSpec {
  const root = mapNode(container.root, nodeId, (node) => {
    const next = { ...node }
    if (name) next.name = name
    else delete next.name
    return next
  })
  return { ...container, root }
}
