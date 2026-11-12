import { Button, Kbd, Select, SelectItem, SelectTrigger, SelectValue } from "@buildkitgg/shadcn-baseui-kit"
import {
  type BindableField,
  boardTarget,
  changesField,
  type ContainerSpec,
  type DesignNode,
  editNode,
  type EditTarget,
  editsDesign,
  findNode,
  type ImageNode,
  type VideoNode,
  innerChanges,
  type InstanceNode,
  isInnerPath,
  locateInner,
  locateNode,
  mapNode,
  nodeOnBoard,
  type NodePatch,
  overrideCount,
  type PatchField,
  propChange,
  patchSize,
  resetInstance,
  resetOverride,
  slotAtPath,
  type StateSpec,
  swapInstance,
  targetPatches
} from "@parity-app/core"
import { editingState } from "@parity-app/editor"
import { BookOpen, Diamond, Group, Info, Sparkles, Unlink } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { useChangePreview } from "../canvas/change-preview.ts"
import { useProject } from "../canvas/context.ts"
import { frameScale, nodeInFrames, selectionFrame } from "../canvas/hit.ts"
import { designNamer, focusOnMount, kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { editLayer, projectLibrary, resetLayer } from "../canvas/layers.ts"
import { useComponents } from "../components-store.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { actions } from "./actions.ts"
import { detachAndRecord, pushAndRecord } from "./component-events.ts"
import { extractIntoComponent } from "./components.ts"
import { baseDesignNote } from "./edit-scope.ts"
import { ExportSection } from "./ExportSection.tsx"
import { FieldWithProp } from "./field-prop.tsx"
import { ChoiceInput, Field, PanelSelectContent, SwitchInput, TextInput, ValueInput } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import {
  fieldName,
  fieldValue,
  type LayerChange,
  PreviewedProp,
  recordLayerChange,
  renameAndRecord,
  updateAndRecord
} from "./inspector-events.ts"
import { InstanceSlotFields, SlotPanel } from "./instance-slots.tsx"
import { keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"
import { layerKind } from "./layer-kind.ts"
import { Name, NameInput } from "./Name.tsx"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { PhotoCredit } from "./PhotoCredit.tsx"
import { type PropValue, readPropValue, textValue, valueKind } from "./prop-values.ts"
import { PropsSection } from "./PropsSection.tsx"
import { revealSelection } from "./reveal.ts"
import { headingIcon, headingName, SelectionHeading } from "./SelectionHeading.tsx"
import { MakeSlot } from "./slot-props.tsx"
import { hasStories, openInStorybook } from "./storybook.ts"
import { useStyleEditor } from "./style-editor.ts"
import { StyleSections } from "./StyleSections.tsx"

/**
 * A selected layer's properties. Edits apply to the state being shown: in the base state they change the design; in
 * any other state they're saved as that state's changes, marked, and each can be reset. A variant shown on a
 * component's board takes edits the same way. Inside an instance, edits change only that copy.
 */
export function LayerPanel({ entry, nodeId }: { entry: ContainerEntry; nodeId: string }) {
  const { store } = useProject()

  if (!isInnerPath(nodeId)) {
    return <DesignLayerPanel entry={entry} nodeId={nodeId} />
  }

  // A slot of one of the design's instances is selected as a layer is, and has a panel of its own (PAR-84).
  const slot = slotAtPath(entry.container.root, nodeId, projectLibrary(store))

  return slot ? <SlotPanel entry={entry} {...slot} /> : <InnerLayerPanel entry={entry} path={nodeId} />
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
  const node = nodeOnBoard(container, location.node, state)
  const override = targetPatches(container, target)?.[nodeId]
  const kind = layerKind(location.node, designNamer(entries, store.getComponentLibrary()), session.info.libraries)

  const change: LayerChange = (label, value, gesture, shown = node) => {
    store.updateContainer(key, label, (current) => editNode(current, boardTarget(current, state.id), nodeId, value), {
      gesture
    })

    if (shown) {
      recordLayerChange(key, [nodeId], state.id, shown, value, gesture)
    }
  }

  // The layer as a design shows it in the state being edited, to read what a reset changed.
  const shownIn = (current: ContainerSpec) => {
    const layer = locateNode(current.root, nodeId)?.node

    return layer && nodeOnBoard(current, layer, editingState(current, state.id))
  }

  const reset = (field?: PatchField) => {
    const update = (current: ContainerSpec) => resetOverride(current, boardTarget(current, state.id), nodeId, field)

    if (field) {
      updateAndRecord(store, key, "Reset change", update, {
        field: fieldName(field),
        layers: [nodeId],
        state: state.id,
        read: (current) => fieldValue(shownIn(current), field)
      })

      return
    }

    updateAndRecord(store, key, "Reset change", update, {
      field: "overrides",
      layers: [nodeId],
      state: state.id,
      read: (current) => targetPatches(current, boardTarget(current, state.id))?.[nodeId]
    })
  }

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={<NodeIcon node={location.node} className={headingIcon} />}
          color={nodeColor(location.node)}
          name={
            <NameInput
              key={`${nodeId}:${location.node.name ?? ""}`}
              defaultValue={location.node.name ?? ""}
              placeholder={layerLabel(location.node, entries, store.getComponentLibrary(), session.info.libraries)}
              aria-label="Layer name"
              className={`h-7 border-transparent bg-transparent px-1.5 shadow-none hover:border-input dark:bg-transparent ${headingName}`}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim()

                if (name === (location.node.name ?? "")) {
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
          }
          kind={kind.label}
          detail={kind.description}
        />
        <StateTarget entry={entry} state={state} target={target} />
        {location.ancestors.length > 0 && location.node.type !== "instance" && (
          <MakeComponent
            entry={entry}
            nodeId={nodeId}
            beside={
              location.node.type === "layout" &&
              container.kind === "component" && <MakeSlot entry={entry} node={location.node} />
            }
          />
        )}
        {/* The outermost layout is the design itself, with no Make component, but it can still be a slot. */}
        {location.ancestors.length === 0 && location.node.type === "layout" && container.kind === "component" && (
          <div className="mt-2 flex">
            <MakeSlot entry={entry} node={location.node} />
          </div>
        )}
      </div>

      {node.type === "instance" && (
        <InstanceSection
          entry={entry}
          node={node}
          own={location.node.type === "instance" ? location.node : undefined}
          changed={(name) => changesField(override, { kind: "props", key: name })}
          onChange={(name, value) => change(`Change ${name}`, propChange(name, value))}
          onReset={(name) => reset({ kind: "props", key: name })}
        />
      )}

      <LayerSections entry={entry} nodeId={nodeId} node={node} override={override} change={change} reset={reset} />
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

  const change: LayerChange = (label, value, gesture, shown = node) => {
    store.updateContainer(
      key,
      label,
      (current) => editLayer(store, current, boardTarget(current, state.id), path, value),
      { gesture }
    )

    if (shown) {
      recordLayerChange(key, [path], state.id, shown, value, gesture)
    }
  }

  // The layer as the copy shows it in the state being edited, to read what a reset changed.
  const shownIn = (current: ContainerSpec) =>
    locateInner(current, path, library, { state: editingState(current, state.id), variants: current.view?.variants })
      ?.shown

  const reset = (field?: PatchField) => {
    const update = (current: ContainerSpec) => resetLayer(store, current, boardTarget(current, state.id), path, field)

    if (field) {
      updateAndRecord(store, key, "Reset change", update, {
        field: fieldName(field),
        layers: [path],
        state: state.id,
        read: (current) => fieldValue(shownIn(current), field)
      })

      return
    }

    updateAndRecord(store, key, "Reset change", update, {
      field: "overrides",
      layers: [path],
      state: state.id,
      read: (current) => innerChanges(current, boardTarget(current, state.id), path, library)
    })
  }

  const push = () => main && pushAndRecord(store, key, main.key, inner.instance.id, { key: inner.key, path })
  // The component this layer belongs to: the nested one for a layer inside a nested instance.
  const owner = entries.find((candidate) => candidate.container.id === inner.component.id)
  const kind = layerKind(inner.node, designNamer(entries, store.getComponentLibrary()), session.info.libraries)

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={<NodeIcon node={inner.node} className={headingIcon} />}
          color={kindColors.component}
          name={
            <Name className={`px-1.5 ${headingName}`}>
              {layerLabel(inner.node, entries, store.getComponentLibrary(), session.info.libraries)}
            </Name>
          }
          kind={kind.label}
          detail={kind.description}
        />
        {editsDesign(container, target) ? (
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
          changed={(name) => changesField(override, { kind: "props", key: name })}
          onChange={(name, value) => change(`Change ${name}`, propChange(name, value))}
          onReset={(name) => reset({ kind: "props", key: name })}
        />
      )}

      <LayerSections entry={entry} nodeId={path} node={node} override={override} change={change} reset={reset} inner />
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
  inner = false
}: {
  entry: ContainerEntry
  nodeId: string
  /** The layer as it's shown, with the state's, variant's and copy's changes applied. */
  node: DesignNode
  /** What the state, variant or copy being edited changes about it, to mark and reset. */
  override: NodePatch | undefined
  /** Makes a change, as part of a gesture's one undo step when given (see `NumberField`). */
  change: LayerChange
  reset: (field?: PatchField) => void
  /** Inside an instance, where an image's file and description belong to the component. */
  inner?: boolean
}) {
  const session = useProject()
  const components = useComponents(session.components)
  const entries = useContainerEntries(session.store)
  const name = layerLabel(node, entries, session.store.getComponentLibrary(), session.info.libraries)
  const styleEditor = useStyleEditor(entry, [nodeId])
  // A number prop previews by being made, as the component has to draw again for it, and is taken back unless it's made.
  const propPreview = useChangePreview(session.store, entry.key)
  const previewedProp = useMemo(() => new PreviewedProp(propPreview), [propPreview])
  // A component design's own layers can use its props for their text and visibility; a copy's can't.
  const usesProps = entry.container.kind === "component" && !inner && !isInnerPath(nodeId)

  const withProp = (field: BindableField, input: ReactNode) =>
    usesProps ? (
      <FieldWithProp entry={entry} nodeId={nodeId} field={field} bound={node.bind?.[field]}>
        {input}
      </FieldWithProp>
    ) : (
      input
    )

  return (
    <>
      {(node.type === "text" || (node.type === "component" && textValue.safeParse(node.props?.children).success)) && (
        <PanelSection title="Content">
          {node.type === "text" ? (
            <Field label="Text" changed={override?.text !== undefined} onReset={() => reset({ kind: "text" })}>
              {withProp(
                "text",
                <TextInput multiline value={node.text} onCommit={(text) => change("Edit text", { text })} />
              )}
            </Field>
          ) : (
            <Field
              label="Label"
              changed={changesField(override, { kind: "props", key: "children" })}
              onReset={() => reset({ kind: "props", key: "children" })}
            >
              <TextInput
                multiline
                value={textValue.safeParse(node.props?.children).data ?? ""}
                onCommit={(children) => change("Edit label", { props: { children } })}
              />
            </Field>
          )}
        </PanelSection>
      )}

      {(node.type === "image" || node.type === "video") && !inner && <MediaSection entry={entry} node={node} />}

      <PanelSection title="Visibility">
        <Field label="Visible" changed={override?.hidden !== undefined} onReset={() => reset({ kind: "hidden" })}>
          {withProp(
            "visible",
            <SwitchInput
              value={!node.hidden}
              onChange={(visible) => change("Toggle visibility", { hidden: !visible })}
            />
          )}
        </Field>
      </PanelSection>

      {node.type === "component" && (
        <PropsSection
          node={node}
          info={components[node.component]}
          changed={(name) => changesField(override, { kind: "props", key: name })}
          taken={override?.unset?.props}
          onChange={(name, value, gesture) =>
            previewedProp.commit(node, change, `Change ${name}`, propChange(name, value), gesture)
          }
          onPreview={(name, value) => previewedProp.show(node, change, `Change ${name}`, propChange(name, value))}
          onCancel={() => previewedProp.cancel()}
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

      {styleEditor && (
        <StyleSections
          editor={styleEditor}
          container={entry.container}
          takesStyle={(component) => components[component]?.takesStyle}
        />
      )}

      <ExportSection targets={[{ design: entry.key, node: nodeId, name }]} label={`Export ${name}`} />
    </>
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
          <Group /> {keymap.wrap.label} <Kbd className="ml-auto">{formatKeys(keymap.wrap.keys[0])}</Kbd>
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
  changed: (name: string) => boolean
  onChange: (name: string, value: PropValue | undefined) => void
  onReset: (name: string) => void
}) {
  const session = useProject()
  const { store, selection } = session
  const entries = useContainerEntries(store)
  const component = entries.find((candidate) => candidate.container.id === node.design)
  // A library's design isn't one of the project's, so it's placed and detached here but edited in the library.
  const design = component?.container ?? store.getComponentLibrary().get(node.design)

  const from = component
    ? undefined
    : session.info.libraries.find((candidate) => candidate.designs?.some((placed) => placed.id === node.design))

  if (!design) {
    return (
      <PanelSection title="Instance">
        <p className="type-message px-1 text-destructive">
          The component &quot;{node.design}&quot; doesn&apos;t exist.
        </p>
      </PanelSection>
    )
  }

  const params = Object.entries(design.params ?? {})
  const overrides = own ? overrideCount(own) : 0
  const library = projectLibrary(store)

  // The instance's own field, as the design has it, to record what a change to it did.
  const instanceField = (name: "state" | "design") => ({
    field: `instance.${name}`,
    layers: [node.id],
    read: (container: ContainerSpec) => {
      const instance = findNode(container.root, node.id)

      return instance?.type === "instance" ? instance[name] : undefined
    }
  })

  const push = () => component && pushAndRecord(store, entry.key, component.key, node.id)

  // Another component this copy could become: not the design it's in, which can't contain itself.
  const swappable = entries.filter(
    (candidate) => candidate.container.kind === "component" && candidate.container.id !== entry.container.id
  )

  return (
    <PanelSection
      title="Instance"
      action={
        component ? (
          <Hint label={`Go to ${design.name}`} wait>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                selection.set({ design: component.key })
                revealSelection(session)
              }}
            >
              <Diamond style={{ color: kindColors.component }} /> {design.name}
            </Button>
          </Hint>
        ) : (
          <Hint label={`Linked to ${design.name} in ${from?.name ?? "a library"}, which changes it`} wait>
            <span className="flex h-6 items-center gap-1.5 px-2 text-xs text-muted-foreground">
              <Diamond className="size-3.5" style={{ color: kindColors.component }} /> {design.name}
            </span>
          </Hint>
        )
      }
    >
      {own && <BaseDesignNote entry={entry} what="Its state, Reset all, Swap and Detach" />}
      <div className="flex flex-col gap-1">
        {own && (
          <Field label="State">
            <ChoiceInput
              value={own.state}
              options={design.states.slice(1).map((state) => ({ value: state.id, label: state.name }))}
              placeholder={design.states[0]!.name}
              onChange={(state) =>
                updateAndRecord(
                  store,
                  entry.key,
                  "Change instance state",
                  (container) => ({
                    ...container,
                    root: mapNode(container.root, node.id, (current) => {
                      if (current.type !== "instance") {
                        return current
                      }

                      const next = { ...current }

                      if (state) {
                        next.state = state
                      } else {
                        delete next.state
                      }

                      return next
                    })
                  }),
                  instanceField("state")
                )
              }
            />
          </Field>
        )}
        {params.map(([name, param]) =>
          param.type === "variant" ? (
            <Field key={name} label={name} changed={changed(name)} onReset={() => onReset(name)}>
              <ChoiceInput
                value={textValue.safeParse(node.args?.[name]).data}
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
                value={readPropValue(node.args?.[name] ?? param.default)}
                kind={valueKind(readPropValue(node.args?.[name] ?? param.default), param.type)}
                onCommit={(value) => onChange(name, value)}
              />
            </Field>
          )
        )}
        {own && <InstanceSlotFields entry={entry} instance={own} />}
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
                  onClick={() =>
                    updateAndRecord(
                      store,
                      entry.key,
                      "Reset overrides",
                      (container) => resetInstance(container, node.id),
                      {
                        field: "overrides",
                        layers: [node.id],
                        read: (container) => {
                          const instance = findNode(container.root, node.id)

                          return instance?.type === "instance" ? instance.overrides : undefined
                        }
                      }
                    )
                  }
                >
                  Reset all
                </Button>
                {component && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={push}>
                    Push to main
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-1.5">
            <Select<string>
              value={null}
              onValueChange={(design) => {
                if (!design) {
                  return
                }

                updateAndRecord(
                  store,
                  entry.key,
                  "Swap instance",
                  (container) => swapInstance(container, node.id, design, library),
                  instanceField("design")
                )
              }}
            >
              <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Swap component" />
              </SelectTrigger>
              <PanelSelectContent>
                {swappable
                  .filter((candidate) => candidate.container.id !== node.design)
                  .map((candidate) => (
                    <SelectItem key={candidate.key} value={candidate.container.id}>
                      {candidate.container.name}
                    </SelectItem>
                  ))}
              </PanelSelectContent>
            </Select>
            <Hint label="Turn this copy into plain layers, no longer linked to the component" wait>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => detachAndRecord(store, entry.key, node.id)}
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
          : { borderColor: kindColors.agent, background: "color-mix(in oklch, var(--canvas-agent) 8%, transparent)" }
      }
    >
      <span className="shrink-0 text-muted-foreground">Editing</span>
      <Select
        items={entry.container.states.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
        value={state.id}
        onValueChange={(id) => {
          if (!id) {
            return
          }

          const name = entry.container.states.find((candidate) => candidate.id === id)?.name ?? id
          store.updateView(entry.key, `Show ${name}`, (view) => ({ ...view, state: id }))
          selection.set({ ...selected, state: id })
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-6 w-auto max-w-32 shrink-0 gap-1 border-none bg-transparent px-1 text-xs shadow-none dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <PanelSelectContent>
          {entry.container.states.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.name}
            </SelectItem>
          ))}
        </PanelSelectContent>
      </Select>
      {/* What edits change wraps rather than spilling past the bar when it doesn't fit beside the state. */}
      <span className="min-w-0 text-muted-foreground">{changes}</span>
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

  if (!host || !rect || !session.editor) {
    return undefined
  }

  const scale = session.editor.getZoomLevel() * frameScale(host)

  return { width: rect.width / scale, height: rect.height / scale }
}

/**
 * Where a layer sits in its parent's box, in the design's pixels: the parent's size, its own, and its offset from the
 * parent's top left, as Position's inset box measures pinned sides against. Undefined when it isn't drawn.
 */
export function placeNode(
  session: ProjectSession,
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
  const area = session.editor?.getContainer().closest(".canvas-area")
  const host = area ? selectionFrame(area, design, picked) : undefined
  const found = host && area ? nodeInFrames(area, design, nodeId, host).find((item) => item.picked) : undefined
  // Insets count from the containing block inside its border, which `offsetParent` gives (see `LayerSnapping`).
  const around = found?.element?.offsetParent

  if (!host || !found || !(around instanceof HTMLElement) || !session.editor) {
    return undefined
  }

  const scale = session.editor.getZoomLevel() * frameScale(host)
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

/**
 * Says, before anything is changed, that the controls it heads change the design itself, when the Editing control
 * above sends other edits to a state or a variant: `what` can't differ from one state to another. It's tinted as that
 * control is, so the two read together. Nothing shows while edits change the design anyway.
 */
function BaseDesignNote({ entry, what }: { entry: ContainerEntry; what: string }) {
  const { selection } = useProject()
  const selected = useSelection(selection)
  const note = baseDesignNote(entry.container, editingState(entry.container, selected.state), what)

  if (!note) {
    return null
  }

  return (
    <p
      className="type-message mb-2 flex items-start gap-1.5 rounded-md border px-2.5 py-1.5"
      style={{ borderColor: kindColors.agent, background: "color-mix(in oklch, var(--canvas-agent) 8%, transparent)" }}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" style={{ color: kindColors.agent }} aria-hidden />
      <span>{note}</span>
    </p>
  )
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

  const edit = (label: string, field: "src" | "alt" | "fit" | "controls", update: (media: MediaNode) => MediaNode) =>
    updateAndRecord(
      store,
      entry.key,
      label,
      (container) => ({
        ...container,
        root: mapNode(container.root, node.id, (current) => (current.type === kind ? update(current) : current))
      }),
      {
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
      }
    )

  /** The node without `field` when `value` is empty or off, and with it otherwise. */
  const setting = <K extends "alt" | "fit">(media: MediaNode, field: K, value: MediaNode[K] | undefined): MediaNode => {
    const next = { ...media }

    if (value) {
      next[field] = value
    } else {
      delete next[field]
    }

    return next
  }

  return (
    <PanelSection title={kind === "video" ? "Video" : "Image"}>
      <BaseDesignNote
        entry={entry}
        what={kind === "video" ? "File, alt text, fit and controls" : "File, alt text and fit"}
      />
      <Field label="File">
        <TextInput
          value={node.src}
          onCommit={(src) => src && edit(`Change ${noun}`, "src", (media) => ({ ...media, src }))}
        />
      </Field>
      <Field label="Alt text" hint="What it shows, for screen readers. Leave empty if it's decoration.">
        <TextInput
          multiline
          value={node.alt ?? ""}
          onCommit={(alt) => edit(`Describe ${noun}`, "alt", (media) => setting(media, "alt", alt))}
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
          onChange={(fit) => edit("Change fit", "fit", (media) => setting(media, "fit", fit))}
        />
      </Field>
      {node.type === "video" && (
        <Field label="Controls">
          <SwitchInput
            value={node.controls === true}
            onChange={(controls) =>
              edit(controls ? "Show controls" : "Hide controls", "controls", (media) => {
                if (media.type !== "video") {
                  return media
                }

                const { controls: _was, ...rest } = media

                return controls ? { ...rest, controls } : rest
              })
            }
          />
        </Field>
      )}
      {node.credit && <PhotoCredit credit={node.credit} className="-mt-1 ml-24" />}
    </PanelSection>
  )
}

type ImageFit = NonNullable<ImageNode["fit"]>
