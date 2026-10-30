import {
  type CanvasDocument,
  type ContainerSpec,
  componentLibrary,
  extractComponent,
  uniqueId,
  walkNodes
} from "@parity-app/core"
import type { DesignRef } from "./arrange.ts"

/**
 * Make component and finding a component design's instances. Each takes the designs as data: making a component
 * returns the documents changed, for the app to apply as one undo step.
 */

export interface MakeComponentOptions {
  /** The new component design's name, which its id is made from. */
  name: string
  /** The document it goes into: the project file. */
  into: string
  /** Its top-left corner on the canvas. */
  position: { x: number; y: number }
  /** Every viewport the project has, to check the design renders the same in all of them afterwards. */
  viewports: string[]
  /** Better names for the params found, by the name they were given (`text2` to `email`). */
  paramNames?: Record<string, string>
}

/**
 * Makes a component design from layers of a design (`occurrences`, one or more with the same structure), and puts an
 * instance of it in place of each. The component goes at the end of the `into` document, which is started if there
 * isn't one. Returns the documents and the component's id. Throws, changing nothing, if the design wouldn't render
 * exactly the same afterwards, or isn't in the documents.
 */
export function makeComponent(
  documents: ReadonlyMap<string, CanvasDocument>,
  source: DesignRef,
  occurrences: string[],
  options: MakeComponentOptions
): { documents: Map<string, CanvasDocument>; id: string } {
  const designs = [...documents.values()].flatMap((document) => document.containers)
  const from = documents.get(source.path)
  const original = from?.containers.find((container) => container.id === source.id)
  if (!from || !original) throw new Error(`No design "${source.id}" in ${source.path}`)
  const id = uniqueId(
    options.name,
    designs.map((design) => design.id)
  )
  const { component, design } = extractComponent(original, occurrences, {
    id,
    name: options.name,
    position: options.position,
    viewports: options.viewports,
    library: componentLibrary(designs),
    paramNames: options.paramNames
  })
  const next = new Map(documents)
  next.set(source.path, {
    ...from,
    containers: from.containers.map((container) => (container === original ? design : container))
  })
  const target = next.get(options.into) ?? { version: 3, containers: [] }
  next.set(options.into, { ...target, containers: [...target.containers, component] })
  return { documents: next, id }
}

/**
 * Every instance of a component design in the designs given, in order, with the layer's id: anywhere in each tree,
 * slots included.
 */
export function instancesOf<Design extends { container: ContainerSpec }>(
  designs: readonly Design[],
  componentId: string
): { entry: Design; node: string }[] {
  const found: { entry: Design; node: string }[] = []
  for (const entry of designs) {
    walkNodes(entry.container.root, (node) => {
      if (node.type === "instance" && node.design === componentId) found.push({ entry, node: node.id })
    })
  }
  return found
}
