import { type CodeDesignSettings, type ContainerSpec, type DesignNode, findNode, mapNodes } from "@parity-app/core"
import { sameValue, tidyView } from "./document-equality.ts"

/** Each layer's width and height tried on it, by layer id. */
type Sizes = NonNullable<CodeDesignSettings["sizes"]>

type Sides = Sizes[string]

/** A layer's width and height, the sides dragged on the canvas, leaving out one it doesn't set. */
function sides(node: DesignNode | undefined): Sides {
  const { width, height } = node?.style ?? {}

  return { ...(width !== undefined && { width }), ...(height !== undefined && { height }) }
}

/** A layer with its width and height as `size` says, the one it doesn't give unset. */
function withSides(node: DesignNode, size: Sides): DesignNode {
  if (sameValue(sides(node), sides({ ...node, style: size }))) {
    return node
  }

  const style = { ...node.style }
  delete style.width
  delete style.height

  return { ...node, style: { ...style, ...sides({ ...node, style: size }) } }
}

/** Each layer's width and height that's not as `drawn` has it, by layer id. */
function triedSizes(design: ContainerSpec, drawn: ContainerSpec): Sizes {
  const sizes: Sizes = {}

  mapNodes(design.root, (node) => {
    if (!sameValue(sides(node), sides(findNode(drawn.root, node.id)))) {
      sizes[node.id] = sides(node)
    }

    return node
  })

  return sizes
}

/**
 * Whether a design read from code has a size tried on it: a layer dragged to a width or height on the canvas, to see how
 * it responds, unlike `drawn`, the design as its code draws it. The size is never written to its code.
 */
export function hasTriedSize(design: ContainerSpec, drawn: ContainerSpec): boolean {
  return Object.keys(triedSizes(design, drawn)).length > 0
}

/**
 * A design with every size tried on it put back as its code draws it (`drawn`), each layer's width and height, leaving
 * whatever else has changed, as a story's args. The same design when there's none.
 */
export function withoutTriedSize(design: ContainerSpec, drawn: ContainerSpec): ContainerSpec {
  if (!hasTriedSize(design, drawn)) {
    return design
  }

  return { ...design, root: mapNodes(design.root, (node) => withSides(node, sides(findNode(drawn.root, node.id)))) }
}

/**
 * What the person has set on a design drawn from code, to keep while its code draws it again: what it shows, and the
 * sizes tried on its layers, unlike `drawn`, as its code draws it. Undefined when there's nothing.
 */
export function codeDesignSettings(design: ContainerSpec, drawn: ContainerSpec): CodeDesignSettings | undefined {
  const settings: CodeDesignSettings = {}
  const view = tidyView(design, design.view)
  const sizes = triedSizes(design, drawn)

  if (view && !sameValue(view, tidyView(drawn, drawn.view))) {
    settings.view = view
  }

  if (Object.keys(sizes).length > 0) {
    settings.sizes = sizes
  }

  return Object.keys(settings).length > 0 ? settings : undefined
}

/** A design drawn from code again, with what the person had set on it (see `codeDesignSettings`). */
export function withCodeDesignSettings(design: ContainerSpec, settings: CodeDesignSettings | undefined): ContainerSpec {
  if (!settings) {
    return design
  }

  const { view, sizes = {} } = settings

  return {
    ...design,
    ...(view && { view }),
    root: mapNodes(design.root, (node) => (sizes[node.id] ? withSides(node, sizes[node.id]) : node))
  }
}
