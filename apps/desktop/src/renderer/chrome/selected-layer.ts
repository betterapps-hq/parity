import {
  boardTarget,
  type ContainerSpec,
  type DesignNode,
  editNode,
  type EditTarget,
  type InnerNode,
  innerChanges,
  isInnerPath,
  locateInner,
  locateNode,
  nodeOnBoard,
  type NodeChange,
  type NodePatch,
  type PatchField,
  resetOverride,
  type StateSpec,
  targetPatches
} from "@parity-app/core"
import { editingState } from "@parity-app/editor"
import { useProject } from "../canvas/context.ts"
import { editLayer, projectLibrary, resetLayer } from "../canvas/layers.ts"
import { type ContainerEntry, useContainerEntry } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { fieldName, fieldValue, type LayerChange, recordLayerChange, updateAndRecord } from "./inspector-events.ts"

/**
 * The selected layer as every section of its panel reads and edits it (PAR-1031): one of the design's own layers, or
 * one inside an instance, in the state being edited.
 */
export interface SelectedLayer {
  entry: ContainerEntry
  /** Its id, or its path inside an instance. */
  nodeId: string
  /** As the design has it, or as its component does for a layer inside an instance. */
  layer: DesignNode
  /** As it's shown, with the state's, variant's and copy's changes applied. */
  node: DesignNode
  /** How many layers it's inside, for one of the design's own: the design's root has none. */
  depth: number
  /** Inside an instance: where in which copy. */
  inner?: InnerNode
  state: StateSpec
  target: EditTarget
  /** What the state, variant or copy being edited changes about it, to mark and reset. */
  override: NodePatch | undefined
  /** Makes a change, as part of a gesture's one undo step when given, as a run of Up and Down presses in a field. */
  change: LayerChange
  /** Takes back one field the state, variant or copy changes, or all of them. */
  reset: (field?: PatchField) => void
}

/** The layer selected on its own, as its panel's sections take it; undefined for anything else or one that's gone. */
export function useSelectedLayer(): SelectedLayer | undefined {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)

  return useLayer(entry, selected.nodes && selected.nodes.length > 1 ? undefined : selected.node)
}

/** One layer of a design, as its panel's sections take it. */
export function useLayer(entry: ContainerEntry | undefined, nodeId: string | undefined): SelectedLayer | undefined {
  const { store, selection } = useProject()
  const selected = useSelection(selection)

  if (!entry || !nodeId) {
    return undefined
  }

  const { container, key } = entry
  const state = editingState(container, selected.state)
  const target = boardTarget(container, state.id)

  const edits = (
    node: DesignNode,
    edit: (current: ContainerSpec, target: EditTarget, value: NodeChange) => ContainerSpec,
    undo: (current: ContainerSpec, target: EditTarget, field?: PatchField) => ContainerSpec,
    shownIn: (current: ContainerSpec) => DesignNode | undefined,
    changes: (current: ContainerSpec) => NodePatch | undefined
  ) => {
    const change: LayerChange = (label, value, gesture, shown = node) => {
      store.updateContainer(key, label, (current) => edit(current, boardTarget(current, state.id), value), { gesture })

      if (shown) {
        recordLayerChange(key, [nodeId], state.id, shown, value, gesture)
      }
    }

    const reset = (field?: PatchField) => {
      const update = (current: ContainerSpec) => undo(current, boardTarget(current, state.id), field)

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
        read: changes
      })
    }

    return { change, reset }
  }

  if (!isInnerPath(nodeId)) {
    const location = locateNode(container.root, nodeId)

    if (!location) {
      return undefined
    }

    const node = nodeOnBoard(container, location.node, state)
    const override = targetPatches(container, target)?.[nodeId]

    return {
      entry,
      nodeId,
      layer: location.node,
      node,
      depth: location.ancestors.length,
      state,
      target,
      override,
      ...edits(
        node,
        (current, at, value) => editNode(current, at, nodeId, value),
        (current, at, field) => resetOverride(current, at, nodeId, field),
        // The layer as a design shows it in the state being edited, to read what a reset changed.
        (current) => {
          const layer = locateNode(current.root, nodeId)?.node

          return layer && nodeOnBoard(current, layer, editingState(current, state.id))
        },
        (current) => targetPatches(current, boardTarget(current, state.id))?.[nodeId]
      )
    }
  }

  const library = projectLibrary(store)
  const inner = locateInner(container, nodeId, library, { state, variants: container.view?.variants })

  if (!inner) {
    return undefined
  }

  const override = innerChanges(container, target, nodeId, library)

  return {
    entry,
    nodeId,
    layer: inner.node,
    node: inner.shown,
    depth: 0,
    inner,
    state,
    target,
    override,
    ...edits(
      inner.shown,
      (current, at, value) => editLayer(store, current, at, nodeId, value),
      (current, at, field) => resetLayer(store, current, at, nodeId, field),
      // The layer as the copy shows it in the state being edited, to read what a reset changed.
      (current) =>
        locateInner(current, nodeId, library, {
          state: editingState(current, state.id),
          variants: current.view?.variants
        })?.shown,
      (current) => innerChanges(current, boardTarget(current, state.id), nodeId, library)
    )
  }
}
