import {
  type ComponentLibrary,
  type ContainerSpec,
  type DesignNode,
  drawnNode,
  effectiveNode,
  scopeOf,
  type StateSpec
} from "@parity-app/core"

/**
 * What an edit reads: a layer as the board being edited shows it, through core's evaluation (`effectiveNode`), so an
 * operation decides from the layout, the values and the text on screen rather than from the design's own values. The
 * edit itself still lands where `editNode` puts it.
 */

/**
 * The board an edit is made on: the state being edited, the viewport of the frame it's made in, and the components its
 * instances place. The variant options are the ones the board shows (`view.variants`), and each param the design binds
 * takes its default and those options. A viewport left out applies no responsive patches, as when no frame is known.
 */
export interface BoardView {
  state?: StateSpec
  /** The viewport option id of the frame, which the design's responsive patches are keyed by. */
  viewport?: string
  /** Only needed to read a layer inside an instance, by its path. */
  library?: ComponentLibrary
}

/**
 * The layer `id` as the board shows it: one of the design's own by its id, or one inside an instance by its path
 * (`card/title`). Undefined when there's no such layer.
 */
export function shownNode(container: ContainerSpec, id: string, view: BoardView = {}): DesignNode | undefined {
  return effectiveNode(container, id, view)
}

/**
 * Reads many of the design's own layers as the board shows them, as `shownNode` does, working out the board's layers
 * and args once.
 */
export function boardReader(container: ContainerSpec, view: BoardView = {}): (node: DesignNode) => DesignNode {
  const scope = scopeOf(container, { state: view.state })
  return (node) => drawnNode(node, scope, view.viewport)
}
