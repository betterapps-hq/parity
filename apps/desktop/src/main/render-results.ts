import type { AccessibilityIssue, FrameContrast } from "@parity-app/agent"
import { finiteNumber, parserFor } from "@parity-app/core"
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
  clip: z.object({ ...box, node: z.string().optional() }).optional(),
  source: z.string().optional(),
  outOfFlow: z.boolean().optional(),
  squeezed: z.object({ width: finiteNumber, wants: finiteNumber, element: z.string().optional() }).optional()
})

const frame = z.object({
  width: finiteNumber,
  height: finiteNumber,
  canvasHeight: finiteNumber.optional(),
  nodes: z.array(measuredNode),
  overflowsX: z.boolean(),
  unknownComponents: z.array(z.string()),
  outside: z.array(z.string()).optional(),
  error: z.string().optional(),
  errorStack: z.string().optional()
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

/** What the page threw, in the fields a frame's own failure takes. */
const thrown = z.object({ error: z.string(), errorStack: z.string().optional() })

const answer = z.union([thrown, z.object({ value: z.unknown() })])

const audit = z.object({ issues: z.array(accessibilityIssue), contrast: frameContrast.optional() })

/** The render page's `canvasRender()`, or `TypeError` saying where it's wrong. */
export const renderResult = parserFor(frame, (read): RenderedFrame => read)

/** The render page's `canvasAudit()`. */
export const auditResult = parserFor(audit, (read): Pick<RenderedFrame, "issues" | "contrast"> => read)

/** The render page's `canvasHeight()`, which has none for a frame it hasn't laid out. */
export const canvasHeightResult = parserFor(finiteNumber.optional())

/** What a call into the render page threw: the page's own message and stack. */
export type PageFailure = z.infer<typeof thrown>

/** A failure the render page threw, with the page's message and stack rather than Electron's (PAR-680). */
export class PageError extends Error {
  readonly failure: PageFailure

  constructor(failure: PageFailure) {
    super(failure.error)
    this.name = "PageError"
    this.failure = failure

    if (failure.errorStack) {
      this.stack = failure.errorStack
    }
  }
}

/**
 * The script that runs `call` in the render page and answers with what it gave, or with what it threw, as data. When the
 * page throws inside `executeJavaScript`, Electron says only that the script failed, so its message never reaches main.
 */
export function pageCall(call: string): string {
  return `(async () => {
  try {
    return { value: await ${call} }
  } catch (error) {
    if (!(error instanceof Error)) return { error: String(error) }
    return { error: String(error.message), ...(error.stack ? { errorStack: String(error.stack) } : {}) }
  }
})()`
}

/** What `pageCall` answered with: the value the page gave, for its own reader to parse, or the `PageError` it threw. */
export const pageAnswer = parserFor(answer, (read) => {
  if ("error" in read) {
    throw new PageError(read)
  }

  return read.value
})
