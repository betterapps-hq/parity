import { type CssDeclaration, cssPrinter } from "@parity-app/style-schema"
import type { ClassPrinter } from "./adapters.ts"
import type { RenderElement, RenderNode } from "./render.ts"

// What a frame draws its elements from: one rule set for each, found by its node id. A rule can hold what an inline
// style can't (a state's pseudo-class, a container query, a rule about a parent), and it sits in the cascade where the
// project's own code would put it, so a frame draws a layer as its code will.

/** How a frame's rules are written. */
export interface FrameRulesOptions {
  /**
   * The cascade layer the rules go in: `utilities` in a project whose styles are layered as Tailwind's are, so they
   * rank with the classes the code would have. Without one they aren't layered, as a project's plain CSS isn't.
   */
  layer?: string
}

/** The selector of the elements a frame draws for a node. */
export function nodeSelector(nodeId: string): string {
  return `[data-canvas-node="${nodeId.replaceAll(/["\\]/g, String.raw`\$&`)}"]`
}

/** Every element of a resolved tree, parents first, through components' slots too. */
function elementsOf(tree: readonly RenderNode[]): RenderElement[] {
  return tree.flatMap((node) => {
    if (node.kind === "element") {
      return [node, ...elementsOf(node.children)]
    }

    return node.kind === "component" ? Object.values(node.slots).flatMap(elementsOf) : []
  })
}

function inLayer(css: string, { layer }: FrameRulesOptions): string {
  return layer && css ? `@layer ${layer} {\n${css}}\n` : css
}

/**
 * A resolved tree's rules, as CSS: a rule set for each element that has declarations, in the tree's order. An element
 * drawn by classes (`withClasses`) has none, since its classes' own rules draw it. A component has none either: its
 * design's style is its `style` prop.
 */
export function frameRules(tree: readonly RenderNode[], options: FrameRulesOptions = {}): string {
  const rules = elementsOf(tree)
    .filter((element) => !element.classes && element.declarations.length > 0)
    .map((element) => cssPrinter({ selector: nodeSelector(element.nodeId) }).print(element.declarations).output)

  return inLayer(rules.join("\n"), options)
}

/**
 * The rules that make a frame drawing `drawn` look as `next` would, without drawing it again: a rule set for each
 * element whose declarations differ, to lay over the frame's own rules, or its classes' (PAR-942). A property `next`
 * no longer declares is rolled back with `revert-layer`, which leaves it as the rules under this layer have it, so the
 * frame's rule for it and a class's are both passed over. Those come first, so taking away a shorthand, as a fill's
 * `background` going to `background-color` and `background-image`, doesn't clear the longhands set after it. Elements
 * in only one of the trees are left out: adding or removing nodes isn't a change of style.
 */
export function previewRules(
  drawn: readonly RenderNode[],
  next: readonly RenderNode[],
  options: FrameRulesOptions = {}
): string {
  const was = new Map(elementsOf(drawn).map((element) => [element.nodeId, element.declarations]))
  const rules: string[] = []

  for (const { nodeId, declarations } of elementsOf(next)) {
    const old = was.get(nodeId)

    if (!old || sameDeclarations(old, declarations)) {
      continue
    }

    const kept = new Set(declarations.map(({ property }) => property))

    const gone = old
      .filter(({ property }) => !kept.has(property))
      .map(({ property }) => ({ property, value: "revert-layer" }))

    rules.push(cssPrinter({ selector: nodeSelector(nodeId) }).print([...gone, ...declarations]).output)
  }

  return inLayer(rules.join("\n"), options)
}

function sameDeclarations(a: readonly CssDeclaration[], b: readonly CssDeclaration[]): boolean {
  return (
    a.length === b.length &&
    a.every((declaration, index) => declaration.property === b[index]?.property && declaration.value === b[index].value)
  )
}

/**
 * A resolved tree with the classes of the project's styling framework on each element they can draw. `classesFor`
 * gives the classes for a list of declarations, or nothing when the framework hasn't written every one of them, and
 * that element keeps its rule. The tree given is left as it is.
 */
export function withClasses(
  tree: readonly RenderNode[],
  classesFor: (declarations: readonly CssDeclaration[]) => string[] | undefined
): RenderNode[] {
  return tree.map((node): RenderNode => {
    if (node.kind === "component") {
      const slots = Object.entries(node.slots).map(([slot, children]) => [slot, withClasses(children, classesFor)])

      return { ...node, slots: Object.fromEntries(slots) }
    }

    if (node.kind !== "element") {
      return node
    }

    const children = withClasses(node.children, classesFor)
    const classes = node.declarations.length > 0 ? classesFor(node.declarations) : undefined

    return classes ? { ...node, classes, children } : { ...node, children }
  })
}

/** What a styling framework wrote for the declarations a project's frames draw layers with. */
export interface WrittenClasses {
  /** Each declaration's classes, in the order asked: none for a declaration the framework has no class for. */
  classes: (string[] | null)[]
  /** The CSS of these classes and the ones written before, as the framework's own compiler makes it. */
  css: string
}

/**
 * The classes a styling framework writes for each declaration, one declaration at a time, since a frame draws a layer
 * by classes only when every one of its declarations has them (`withClasses`). The CSS is compiled for them together
 * with `written`, the classes the frames already have, so the frames' stylesheet of classes is always whole, in the
 * framework's own order, whoever compiled the ones before.
 */
export function writeClasses(
  printer: ClassPrinter,
  written: readonly string[],
  declarations: readonly CssDeclaration[]
): WrittenClasses {
  const classes = declarations.map((declaration) => {
    const { output, unwritten } = printer.print([declaration])

    return unwritten.length > 0 || output.length === 0 ? null : output
  })

  const names = new Set([...written, ...classes.flatMap((names) => names ?? [])])

  return { classes, css: printer.css([...names]) }
}
