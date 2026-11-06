import { type PreviewProblem, previewProblem } from "@parity-app/editor"
import type { PreviewImage } from "../../shared/protocol.ts"
import type { PreviewState } from "../component-previews.ts"

/** Where a component's picture is, as the Components panel, its card and the insert picker show it (PAR-208). */
export type PreviewStatus =
  | { kind: "waiting" }
  | { kind: "making" }
  | { kind: "made"; image: PreviewImage }
  /** Its code changed: the picture made for the code before, shown dimmed until the new one is made. */
  | { kind: "updating"; image: PreviewImage; making: boolean }
  /** No picture, and why: its error, or the props it needs. */
  | { kind: PreviewProblem; error?: string; needs?: readonly string[] }

/**
 * What a preview shows: its picture, the last one while a new one is made, or why there's none. `missing` is the props
 * it requires that its sample doesn't give (`missingProps`), which say why one that failed or drew nothing did.
 */
export function previewStatus(preview: PreviewState | undefined, missing: readonly string[] = []): PreviewStatus {
  switch (preview?.state) {
    case undefined:
      return { kind: "waiting" }
    case "made":
      return { kind: "made", image: preview.image }
    case "waiting":
    case "making":
      if (preview.last) return { kind: "updating", image: preview.last, making: preview.state === "making" }
      return { kind: preview.state }
    case "failed": {
      const kind = previewProblem({ error: preview.error }, missing)
      return kind === "needs-props" ? { kind, error: preview.error, needs: missing } : { kind, error: preview.error }
    }
    case "empty": {
      const kind = previewProblem({ empty: true }, missing)
      return kind === "needs-props" ? { kind, needs: missing } : { kind }
    }
  }
}

/** Each status in words: `short` for a row or tile, `long` for the card. A made picture needs none. */
export const statusWords: Record<Exclude<PreviewStatus["kind"], "made">, { short: string; long: string }> = {
  waiting: { short: "Waiting", long: "Its preview is waiting its turn" },
  making: { short: "Drawing", long: "Drawing its preview" },
  updating: { short: "Updating", long: "Updating its preview" },
  failed: { short: "Fails to draw", long: "Its preview fails to draw" },
  "needs-props": { short: "Needs props", long: "Needs props to draw" },
  "needs-provider": { short: "Needs a provider", long: "Needs a provider to draw" },
  "server-only": { short: "Server only", long: "Only renders on a server" },
  "draws-nothing": { short: "Draws nothing", long: "Draws nothing of its own" }
}

/** Whether a status is a problem with the component, which its row says in place of where it's from. */
export function isProblem(status: PreviewStatus): boolean {
  return !["waiting", "making", "made", "updating"].includes(status.kind)
}
