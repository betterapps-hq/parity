import type { DesignNode, LibraryInfo } from "@parity-app/core"

/** What a selected layer is: its kind in a word or two, and in full, saying which component when it's one. */
export interface LayerKind {
  /** The kind alone, as "Instance" or "Horizontal layout", which never repeats the layer's name. */
  label: string
  /** The kind and which one, as "Instance of Plan card" or "Check icon from Lucide"; the label when there's no more. */
  description: string
}

/**
 * What a selected layer is, for its header in the inspector. Where it sits isn't said, since Layers shows that, nor a
 * text layer's tag. A component from a library is named without the library's prefix, by the library it comes from.
 * Layouts are named by direction as the insert picker names them, so the word agrees with the icon, and a slot as one.
 */
export function layerKind(
  node: DesignNode,
  designName: (id: string) => string | undefined,
  libraries: readonly Pick<LibraryInfo, "id" | "name" | "kind">[]
): LayerKind {
  if (node.type === "text") {
    return plain("Text")
  }

  if (node.type === "image") {
    return plain("Image")
  }

  if (node.type === "instance") {
    return { label: "Instance", description: `Instance of ${designName(node.design) ?? node.design}` }
  }

  if (node.type === "component") {
    const library = libraryOf(node.component, libraries)

    if (!library) {
      return { label: "Component", description: `${node.component} component` }
    }

    const name = node.component.slice(node.component.lastIndexOf("/") + 1)

    if (library.kind === "icons") {
      return { label: "Icon", description: `${name.replace(/(?<=.)Icon$/, "")} icon from ${library.name}` }
    }

    return { label: "Component", description: `${name} component from ${library.name}` }
  }

  let layout = node.style?.direction === "row" ? "Horizontal layout" : "Vertical layout"

  if (node.style?.display === "grid") {
    layout = "Grid layout"
  }

  // A slot is drawn as one (see `NodeIcon`), so it's called one.
  if (node.slot !== undefined) {
    return { label: "Slot", description: `The ${node.slot} slot, a ${layout.toLowerCase()}` }
  }

  return plain(layout)
}

/** The library a component comes from: the one whose id begins the component's, as `lucide` begins `lucide/Check`. */
function libraryOf<Library extends Pick<LibraryInfo, "id">>(
  component: string,
  libraries: readonly Library[]
): Library | undefined {
  return libraries.find((candidate) => component.startsWith(`${candidate.id}/`))
}

/** Whether a layer is an icon: a component from one of the project's icon sets, such as `lucide/Check`. */
export function isIconLayer(node: DesignNode, libraries: readonly Pick<LibraryInfo, "id" | "kind">[]): boolean {
  return node.type === "component" && libraryOf(node.component, libraries)?.kind === "icons"
}

function plain(kind: string): LayerKind {
  return { label: kind, description: kind }
}
