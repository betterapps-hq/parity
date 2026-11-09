import type { Length } from "@parity-app/core"
import { z } from "zod"

const steps = z.number()

const token = z.string()

/**
 * The steps of the spacing scale a length is, or undefined for a length token, `"fill"`, `"hug"` or no length at all.
 */
export function lengthSteps(value: Length | undefined): number | undefined {
  const parsed = steps.safeParse(value)

  return parsed.success ? parsed.data : undefined
}

/** The length token a length names, or undefined for a number of steps or no length at all. */
export function lengthToken(value: Length | undefined): string | undefined {
  const parsed = token.safeParse(value)

  return parsed.success ? parsed.data : undefined
}
