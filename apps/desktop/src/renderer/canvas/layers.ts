import {
  childNodes,
  type ComponentLibrary,
  componentLibrary,
  type ContainerSpec,
  type DesignNode,
  editInner,
  editNode,
  type EditTarget,
  findNode,
  isInnerPath,
  locateInner,
  locateNode,
  type NodeChange,
  type PatchField,
  resetInner,
  resetOverride,
  type StateSpec
} from "@parity/core"
import type { DesignStore } from "../design-store.ts"

/** Every design in the project by id, for expanding instances. */
export function projectLibrary(store: DesignStore): ComponentLibrary {
  return componentLibrary(store.getEntries().map((entry) => entry.container))
}

/**
 * A selected layer by id: one of the design's own nodes, or a node inside one of its instances (`card/title`), as that
 * copy shows it in `state`.
 */
export function findLayer(
  store: DesignStore,
  container: ContainerSpec,
  id: string,
  state?: StateSpec
): DesignNode | undefined {
  if (!isInnerPath(id)) return findNode(container.root, id)
  return locateInner(container, id, projectLibrary(store), { state, variants: container.view?.variants })?.shown
}

/** Writes a change to a layer: one of the design's own nodes, or one inside an instance, which only that copy shows. */
export function editLayer(
  store: DesignStore,
  container: ContainerSpec,
  target: string | EditTarget,
  id: string,
  change: NodeChange
): ContainerSpec {
  return isInnerPath(id)
    ? editInner(container, target, id, change, projectLibrary(store))
    : editNode(container, target, id, change)
}

/** Undoes a change to a layer in the state or variant being edited: one field, or all of them. */
export function resetLayer(
  store: DesignStore,
  container: ContainerSpec,
  target: string | EditTarget,
  id: string,
  field?: PatchField
): ContainerSpec {
  return isInnerPath(id)
    ? resetInner(container, target, id, projectLibrary(store), field)
    : resetOverride(container, target, id, field)
}

/** The layer a layer sits in, inside instances too, where the component's root stands for the instance itself. */
export function parentLayer(store: DesignStore, container: ContainerSpec, id: string): string | undefined {
  if (!isInnerPath(id)) return locateNode(container.root, id)?.ancestors.at(-1)?.id
  const inner = locateInner(container, id, projectLibrary(store))
  if (!inner) return undefined
  const holder = id.slice(0, id.lastIndexOf("/"))
  const parent = inner.location.ancestors.at(-1)
  return !parent || parent.id === inner.component.root.id ? holder : `${holder}/${parent.id}`
}

/** The first layer inside a layer, going into instances too: what Enter selects. */
export function firstChildLayer(store: DesignStore, container: ContainerSpec, id: string): string | undefined {
  const library = projectLibrary(store)
  const node = isInnerPath(id) ? locateInner(container, id, library)?.node : findNode(container.root, id)
  if (!node) return undefined
  if (node.type === "instance") {
    const root = library.get(node.design)?.root
    const child = root && childNodes(root)[0]
    return child && `${id}/${child.id}`
  }
  const child = childNodes(node)[0]
  if (!child) return undefined
  return isInnerPath(id) ? `${id.slice(0, id.lastIndexOf("/"))}/${child.id}` : child.id
}
