import {
  childEntries,
  type ContainerSpec,
  type DesignNode,
  frameSize,
  locateNode,
  nodeLabel,
  type ResolvedMode,
  type StateSpec
} from "@parity-app/core"
import { contrastFix } from "@parity-app/tokens"
import { describeLayoutFinding, layoutFindings } from "./overflow.ts"
import type { AccessibilityFinding, FrameContrast, FrameResult, Problem } from "./types.ts"

/** The name of a design by id, for naming its instances. */
export type DesignName = (id: string) => string | undefined

/** Every node's id in a design, mapped to the name it shows in the layers. */
export function nodeNames(container: ContainerSpec, designName: DesignName = () => undefined): Map<string, string> {
  const names = new Map<string, string>()

  const collect = (node: DesignNode) => {
    names.set(node.id, nodeLabel(node, designName))

    for (const entry of childEntries(node)) {
      entry.nodes.forEach(collect)
    }
  }

  collect(container.root)

  return names
}

/**
 * What's wrong in one drawn frame of a design: a render error, components the project doesn't have, nodes that
 * overflow or are clipped, and content wider than the frame that no node accounts for.
 */
export function frameProblems(
  container: ContainerSpec,
  state: StateSpec,
  mode: ResolvedMode,
  frame: FrameResult,
  designName?: DesignName
): Problem[] {
  const names = nodeNames(container, designName)
  // Inside an instance, ids carry the instance's as a prefix; the instance is the layer in this design.
  const name = (id: string) => names.get(id) ?? names.get(id.split("/")[0]!)
  const found: Problem[] = []
  const add = (problem: Omit<Problem, "state" | "mode">) => found.push({ state: state.id, mode: mode.id, ...problem })

  if (frame.error) {
    add({ kind: "render-error", problem: `render error: ${frame.error}` })
  }

  for (const component of frame.unknownComponents) {
    add({ kind: "unknown-component", problem: `"${component}" isn't one of the project's components` })
  }

  const size = frameSize(container, mode)

  const layout = layoutFindings(frame.nodes, {
    width: size.width,
    height: size.height ?? frame.height,
    fixedHeight: size.height !== undefined
  })

  for (const finding of layout) {
    const label = name(finding.node)
    const by = finding.container.node
    const byName = by ? name(by) : undefined
    add({
      kind: finding.kind,
      problem: describeLayoutFinding(finding, name),
      node: finding.node,
      ...(label ? { name: label } : {}),
      box: finding.box,
      container: { ...finding.container, ...(byName ? { name: byName } : {}) },
      overflow: finding.overflow
    })
  }

  // Content wider than the frame that no node accounts for, such as a component's own element.
  if (frame.overflowsX && !layout.some((finding) => finding.kind === "frame-overflow" && finding.overflow.right)) {
    add({ kind: "content-wider", problem: `content is wider than the ${size.width}px frame` })
  }

  return found
}

/**
 * What axe-core found in one drawn frame, one finding per rule and layer of the design (`names`, from nodeNames), and
 * each contrast failure on a layer of the design with what the frame measured, for contrastFixes.
 */
export function accessibilityFindings(
  names: ReadonlyMap<string, string>,
  state: StateSpec,
  mode: ResolvedMode,
  frame: FrameResult
): { found: AccessibilityFinding[]; contrast: Map<AccessibilityFinding, FrameContrast> } {
  const found: AccessibilityFinding[] = []
  const contrast = new Map<AccessibilityFinding, FrameContrast>()
  const seen = new Set<string>()

  for (const { nodes, ...issue } of frame.issues ?? []) {
    for (const { id, ...about } of nodes) {
      // Inside an instance, ids carry the instance's as a prefix; the instance is the layer in this design.
      const node = names.has(id) ? id : id.split("/")[0]!
      const name = names.get(node)
      const once = `${issue.rule}\n${name ? node : ""}`

      if (seen.has(once)) {
        continue
      }

      seen.add(once)
      const finding = { state: state.id, mode: mode.id, ...issue, ...(name ? { node, name } : {}), ...about }
      found.push(finding)

      if (finding.contrast && frame.contrast && id === node) {
        contrast.set(finding, frame.contrast)
      }
    }
  }

  return { found, contrast }
}

/**
 * Gives each contrast failure the token closest to its text's color that passes in every frame the layer's text was
 * measured in, failing or passing, so fixing one frame doesn't break another; `preferred` tokens win a tie. A layer
 * whose text takes its color from inside it, such as a component's own classes, or from inside an instance, gets none,
 * since coloring the layer wouldn't reach it. Changes the findings in place.
 */
export function addContrastFixes(
  container: ContainerSpec,
  inFrame: ReadonlyMap<AccessibilityFinding, FrameContrast>,
  frames: readonly FrameContrast[],
  preferred: ReadonlySet<string>
): void {
  const fixes = new Map<string, ReturnType<typeof contrastFix> | "unreachable">()

  for (const [finding, frame] of inFrame) {
    const node = finding.node!

    if (!fixes.has(node)) {
      const readings = frames.flatMap((each) => {
        const reading = each.texts.find((text) => text.id === node)

        return reading ? [{ ...reading, tokens: each.tokens }] : []
      })

      const reachable =
        locateNode(container.root, node)?.node.type !== "instance" && readings.every((reading) => reading.follows)

      fixes.set(node, reachable ? contrastFix(readings, { preferred }) : "unreachable")
    }

    const fix = fixes.get(node)

    if (fix === "unreachable") {
      continue
    }

    finding.contrast = {
      ...finding.contrast!,
      fix: fix ? { token: fix.token, color: frame.tokens[fix.token]!, ratio: Math.min(...fix.ratios) } : "none"
    }
  }
}
