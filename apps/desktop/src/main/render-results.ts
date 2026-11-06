import type { AccessibilityIssue, FrameContrast } from "@parity-app/agent"
import { finiteNumber, parseData } from "@parity-app/core"
import { z } from "zod"
import type { RenderedFrame } from "../shared/protocol.ts"

/**
 * What the offscreen render page answers main with (PAR-592). The page runs the project's code, which can replace
 * `window.canvasRender` and the rest, so each answer is checked before it goes on to the service and agents. A frame of
 * a thousand nodes takes about 0.1 ms to check, an eighth of what copying it once with `structuredClone` takes.
 */

const box = { x: finiteNumber, y: finiteNumber, width: finiteNumber, height: finiteNumber }

const measuredNode = z.object({
  ...box,
  id: z.string(),
  parent: z.string().optional(),
  clipped: z.boolean().optional(),
  clip: z.object({ ...box, node: z.string().optional() }).optional()
})

const frame = z.object({
  width: finiteNumber,
  height: finiteNumber,
  canvasHeight: finiteNumber.optional(),
  nodes: z.array(measuredNode),
  overflowsX: z.boolean(),
  unknownComponents: z.array(z.string()),
  error: z.string().optional()
})

const hex = z.string()

const contrastDetail = z.object({
  foreground: hex,
  background: hex,
  ratio: finiteNumber,
  required: finiteNumber,
  fontSize: finiteNumber,
  bold: z.boolean(),
  fix: z.union([z.literal("none"), z.object({ token: z.string(), color: hex, ratio: finiteNumber })]).optional()
})

const accessibilityIssue: z.ZodType<AccessibilityIssue> = z.object({
  rule: z.string(),
  impact: z.enum(["critical", "serious", "moderate", "minor"]),
  help: z.string(),
  helpUrl: z.string(),
  nodes: z.array(z.object({ id: z.string(), detail: z.string(), contrast: contrastDetail.optional() }))
})

const frameContrast: z.ZodType<FrameContrast> = z.object({
  tokens: z.record(z.string(), hex),
  texts: z.array(
    z.object({
      id: z.string(),
      foreground: hex,
      background: hex,
      ratio: finiteNumber,
      required: finiteNumber,
      follows: z.boolean()
    })
  )
})

const audit = z.object({ issues: z.array(accessibilityIssue), contrast: frameContrast.optional() })

/** The render page's `canvasRender()`, or `TypeError` saying where it's wrong. */
export function renderResult(value: unknown): RenderedFrame {
  return parseData(frame, value)
}

/** The render page's `canvasAudit()`. */
export function auditResult(value: unknown): Pick<RenderedFrame, "issues" | "contrast"> {
  return parseData(audit, value)
}

/** The render page's `canvasHeight()`, which has none for a frame it hasn't laid out. */
export function canvasHeightResult(value: unknown): number | undefined {
  return parseData(finiteNumber.optional(), value)
}
