import { type ContainerSpec, type DesignNode, findNode, mapNodes } from "@parity-app/core"
import { sameValue } from "./document-equality.ts"

/** A layer's width and height, the sides dragged on the canvas. */
function sides(node: DesignNode | undefined) {
  return { width: node?.style?.width, height: node?.style?.height }
}

/**
 * Whether a design read from code has a size tried on it: a layer dragged to a width or height on the canvas, to see how
 * it responds, unlike `drawn`, the design as its code draws it. The size is never written to its code.
 */
export function hasTriedSize(design: ContainerSpec, drawn: ContainerSpec): boolean {
  let tried = false

  mapNodes(design.root, (node) => {
    tried ||= !sameValue(sides(node), sides(findNode(drawn.root, node.id)))

    return node
  })

  return tried
}

/**
 * A design with every size tried on it put back as its code draws it (`drawn`), each layer's width and height, leaving
 * whatever else has changed, as a story's args. The same design when there's none.
 */
export function withoutTriedSize(design: ContainerSpec, drawn: ContainerSpec): ContainerSpec {
  if (!hasTriedSize(design, drawn)) {
    return design
  }

  const root = mapNodes(design.root, (node) => {
    const was = sides(findNode(drawn.root, node.id))

    if (sameValue(sides(node), was)) {
      return node
    }

    const style = { ...node.style }
    delete style.width
    delete style.height

    if (was.width !== undefined) {
      style.width = was.width
    }

    if (was.height !== undefined) {
      style.height = was.height
    }

    return { ...node, style }
  })

  return { ...design, root }
}
