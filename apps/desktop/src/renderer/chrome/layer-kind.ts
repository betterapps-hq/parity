import type { DesignNode, LibraryInfo } from "@parity-app/core"

/** What a selected layer is: its kind in a word or two, and in full, saying which component when it's one. */
export interface LayerKind {
  /** The kind alone, as "Component instance" or "Horizontal layout", which never repeats the layer's name. */
  label: string
  /** The kind and which one, as "Instance of Plan card" or "Check icon from Lucide"; the label when there's no more. */
  description: string
}

/**
 * What a selected layer is, for its header in the inspector. Where it sits isn't said, since Layers shows that, nor a
 * text layer's tag. A placed component is a Component instance whether its component is code or a design, and which one
 * is said in full; one from a library is named without the library's prefix, by the library it comes from.
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

  if (node.type === "video") {
    return plain("Video")
  }

  if (node.type === "instance") {
    return { label: "Component instance", description: `Instance of ${designName(node.design) ?? node.design}` }
  }

  if (node.type === "component") {
    const library = libraryOf(node.component, libraries)

    if (!library) {
      return { label: "Component instance", description: `${node.component} component` }
    }

    if (library.kind === "icons") {
      return { label: "Icon", description: `${iconName(node.component)} icon from ${library.name}` }
    }

    return {
      label: "Component instance",
      description: `${exportName(node.component)} component from ${library.name}`
    }
  }

  if (node.type === "route") {
    const route = node.route === "__root__" ? "the app's root route" : `the ${node.route} route`

    return node.component
      ? { label: "Component instance", description: `${node.component} component, drawn by ${route}` }
      : { label: "Route", description: `Drawn by ${route}` }
  }

  let layout = node.style?.flexDirection === "row" ? "Horizontal layout" : "Vertical layout"

  if (node.style?.display === "grid") {
    layout = "Grid layout"
  }

  // A slot is drawn as one (see `NodeIcon`), so it's called one.
  if (node.slot !== undefined) {
    return { label: "Slot", description: `The ${node.slot} slot, a ${layout.toLowerCase()}` }
  }

  return plain(layout)
}

/**
 * What a selection's header does at the end of its row, before a layer's eye. `open-in-editor` is only drawn by the
 * Open in editor exploration, since the code side was set aside (PAR-1027).
 */
export type HeaderAction = "open-in-editor" | "go-to-component"

/** What the project has for a layer's component: a design of it to go to. */
export interface ComponentHas {
  design: boolean
}

/**
 * What a layer's header offers of its own: an instance of a design goes to the component. A code component's are its
 * adapters' actions (`layerComponent`). Open in editor was set aside with the code side (Explorations › Code › Open in
 * editor).
 */
export function layerActions(node: DesignNode, has: ComponentHas): HeaderAction[] {
  return node.type === "instance" && has.design ? ["go-to-component"] : []
}

/**
 * The project's component a layer draws, whose adapters' actions it offers, as Open in Storybook: a code component's,
 * but not an icon's.
 */
export function layerComponent(
  node: DesignNode,
  libraries: readonly Pick<LibraryInfo, "id" | "kind">[]
): string | undefined {
  return node.type === "component" && !isIconLayer(node, libraries) ? node.component : undefined
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

/**
 * What an icon is called: its export without the set's path or a trailing "Icon", as "Plus" for `lucide/Plus` and "Cog"
 * for `heroicons/16/solid/CogIcon`.
 */
export function iconName(component: string): string {
  return exportName(component).replace(/(?<=.)Icon$/, "")
}

/**
 * What an unnamed icon layer is called: its icon ("Plus", not `lucide/Plus`), since it shows Smile rather than its own
 * glyph and its name is what tells it from the others (PAR-796). Undefined for a named layer and for anything else.
 */
export function unnamedIconLabel(
  node: DesignNode,
  libraries: readonly Pick<LibraryInfo, "id" | "kind">[]
): string | undefined {
  return !node.name && node.type === "component" && isIconLayer(node, libraries) ? iconName(node.component) : undefined
}

/** A library component's export, without the library's path: `Card` for `nova/Card`. */
function exportName(component: string): string {
  return component.slice(component.lastIndexOf("/") + 1)
}

function plain(kind: string): LayerKind {
  return { label: kind, description: kind }
}
