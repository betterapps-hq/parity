import type { RenderNode } from "@parity-app/core"
import type { FrameTrace } from "./trace.ts"

/**
 * Whether something drawn changed since its baseline (PAR-997). `unknown` when there's no baseline or no trace to compare
 * yet; `changed` with the files whose contents differ, which is empty when only what draws them changed, such as
 * Parity's renderer.
 */
export type ChangeStatus = { state: "unknown" } | { state: "unchanged" } | { state: "changed"; files: string[] }

/** A frame's change since its baseline, and the nodes in it that changed, by node id. */
export interface FrameChange {
  status: ChangeStatus
  /**
   * The nodes that changed, each with the files that changed it, when the frame changed and its traces say what each
   * component reads; a node not listed is unchanged. Without it, every node is as the frame is.
   */
  nodes?: Record<string, ChangeStatus>
}

const unknown: ChangeStatus = { state: "unknown" }
const unchanged: ChangeStatus = { state: "unchanged" }

/** The files whose hashes differ between two traces, those only one lists included, sorted. */
export function changedFiles(before: FrameTrace["files"], after: FrameTrace["files"]): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((path) => before[path] !== after[path])
    .sort((a, b) => a.localeCompare(b, "en"))
}

/** How a frame traced as `current` compares with its `baseline`. */
export function compareTraces(baseline: FrameTrace | undefined, current: FrameTrace | undefined): ChangeStatus {
  if (!baseline || !current) {
    return unknown
  }

  return baseline.digest === current.digest
    ? unchanged
    : { state: "changed", files: changedFiles(baseline.files, current.files) }
}

/**
 * What several statuses add up to, as a board's frames do: changed when any is, with all their files; unknown when none
 * is and one can't say, or there are none; else unchanged.
 */
export function combineChanges(statuses: Iterable<ChangeStatus>): ChangeStatus {
  const files = new Set<string>()
  let changed = false
  let known = false
  let unsure = false

  for (const status of statuses) {
    known = true

    if (status.state === "changed") {
      changed = true
      status.files.forEach((path) => files.add(path))
    } else if (status.state === "unknown") {
      unsure = true
    }
  }

  if (changed) {
    return { state: "changed", files: [...files].sort((a, b) => a.localeCompare(b, "en")) }
  }

  return unsure || !known ? unknown : unchanged
}

/**
 * A frame's change since the project's last commit (PAR-1074), and its nodes': changed with the files it reads that
 * `committed` lists, those that differ from the commit, staged or not, or that git doesn't track; else unchanged.
 * `committed` holds every such file of the project, by its path from the project's root, as a trace writes them.
 */
export function committedChange(
  tree: readonly RenderNode[],
  current: FrameTrace | undefined,
  committed: ReadonlySet<string>
): FrameChange {
  if (!current) {
    return { status: unknown }
  }

  const files = Object.keys(current.files)
    .filter((path) => committed.has(path))
    .sort((a, b) => a.localeCompare(b, "en"))

  // The commit is the baseline, so the trace stands for both sides and only the files' standing tells them apart.
  return files.length === 0 ? { status: unchanged } : frameChange(tree, current, current, { state: "changed", files })
}

/**
 * A frame's change since its baseline, and its nodes'. A node changed when a file its component reads did, or one every
 * node reads, or a node inside it changed, since it draws what's inside it. Without the files each component reads, as
 * in a trace kept before PAR-997, every node is as the frame is.
 */
export function frameChange(
  tree: readonly RenderNode[],
  baseline: FrameTrace | undefined,
  current: FrameTrace | undefined,
  status = compareTraces(baseline, current)
): FrameChange {
  if (status.state !== "changed" || !baseline?.components || !current?.components) {
    return { status }
  }

  const changed = new Set(status.files)
  const read = componentFiles(baseline.components, current.components)
  const ownedFiles = new Set([...read.values()].flat())
  const shared = status.files.filter((path) => !ownedFiles.has(path))
  const nodes: Record<string, ChangeStatus> = {}

  /** The files that changed this node or a node inside it, recorded for each that changed. */
  const visit = (node: RenderNode): string[] => {
    if (node.kind === "text") {
      return []
    }

    const own = node.kind === "component" ? (read.get(node.component) ?? []).filter((path) => changed.has(path)) : []
    const inside = (node.kind === "component" ? Object.values(node.slots).flat() : node.children).flatMap(visit)
    const files = [...new Set([...shared, ...own, ...inside])].sort((a, b) => a.localeCompare(b, "en"))

    if (files.length > 0 || status.files.length === 0) {
      nodes[node.nodeId] = { state: "changed", files }
    }

    return files
  }

  tree.forEach(visit)

  return { status, nodes }
}

/** A node's change, from its frame's. */
export function nodeChange(frame: FrameChange, nodeId: string): ChangeStatus {
  return frame.nodes ? (frame.nodes[nodeId] ?? unchanged) : frame.status
}

/** The files each component reads in either trace, since a file it stopped or started reading is a change to it. */
function componentFiles(
  before: NonNullable<FrameTrace["components"]>,
  after: NonNullable<FrameTrace["components"]>
): Map<string, string[]> {
  const read = new Map<string, string[]>()

  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    read.set(id, [...new Set([...(before[id] ?? []), ...(after[id] ?? [])])])
  }

  return read
}
