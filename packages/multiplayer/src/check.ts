import { canvasDocument, containerSpec, modeSettings } from "@parity-app/core"
import type { DocState } from "./apply.ts"
import { splitKey } from "./keys.ts"
import type { Recorder } from "./recorder.ts"
import type { TransactProblem } from "./types.ts"

/*
 * A transaction's draft checked before anything is sent: each design it changed with core's `containerSpec`, which
 * covers the rules that span fields (patch keys naming layers, unique slots, frames, states only on components), and
 * each file field, list and the modes with their own schemas from `canvasDocument`.
 */

/** The first problem with what a draft changed, or undefined when it's all valid. */
export function checkDraft(before: DocState, after: DocState, recorder: Recorder): TransactProblem | undefined {
  for (const key of recorder.designs) {
    const split = splitKey(key)
    const container = split && after.files.get(split.path)?.containers.find((each) => each.id === split.id)
    const previous = split && before.files.get(split.path)?.containers.find((each) => each.id === split.id)

    if (!container || container === previous) {
      continue
    }

    const read = containerSpec.safeParse(container)

    if (!read.success) {
      return invalid(read.error.issues[0], key)
    }
  }

  for (const path of recorder.files) {
    const document = after.files.get(path)
    const previous = before.files.get(path)

    if (!document || document === previous) {
      continue
    }

    for (const field of ["notes", "references", "detection", "objects", "links", "sources", "images"] as const) {
      if (document[field] !== previous?.[field] && document[field] !== undefined) {
        const read = canvasDocument.shape[field].safeParse(document[field])

        if (!read.success) {
          return invalid(read.error.issues[0], undefined, `/${field}`)
        }
      }
    }

    for (const field of ["preferences", "extensions", "codeDesigns"] as const) {
      if (document[field] !== previous?.[field] && document[field] !== undefined) {
        const read = canvasDocument.shape[field].safeParse(document[field])

        if (!read.success) {
          return invalid(read.error.issues[0], undefined, `/${field}`)
        }
      }
    }
  }

  if (after.modes !== before.modes) {
    const read = modeSettings.safeParse(after.modes)

    if (!read.success) {
      return invalid(read.error.issues[0], undefined, "/modes")
    }
  }

  return undefined
}

function invalid(
  issue: { path: readonly PropertyKey[]; message: string } | undefined,
  design: string | undefined,
  prefix = ""
): TransactProblem {
  const pointer = `${prefix}${(issue?.path ?? []).map((part) => `/${String(part)}`).join("")}`

  return {
    kind: "invalid",
    design,
    pointer,
    message: issue?.message ?? "Invalid"
  }
}
