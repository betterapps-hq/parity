import { parseData } from "@parity-app/core"
import { z } from "zod"

/** Digits only, as a whole number above 0: a process id or a time in milliseconds. */
const positive = z
  .string()
  .regex(/^\d+$/, "expected a whole number")
  .transform(Number)
  .pipe(z.int().min(1, "expected a whole number"))

/**
 * Which copy of the app this service belongs to (PAR-598), as the main process tells it when it starts the service: its
 * process id and when it started, which name the copy's agent registry entry. A service started some other way, as by
 * a test, has neither.
 */
const copyEnvironment = z.object({
  PARITY_APP_PID: positive.optional(),
  PARITY_APP_STARTED: positive.optional()
})

export type CopyEnvironment = z.infer<typeof copyEnvironment>

/**
 * Reads the copy's variables from `env`, or throws `TypeError` naming the one at fault. An empty variable counts as
 * unset, as a shell's `NAME=` means.
 */
export function readCopyEnvironment(env: NodeJS.ProcessEnv): CopyEnvironment {
  const { PARITY_APP_PID, PARITY_APP_STARTED } = env
  const set = Object.fromEntries(
    Object.entries({ PARITY_APP_PID, PARITY_APP_STARTED }).filter(([, value]) => value !== undefined && value !== "")
  )
  try {
    return parseData(copyEnvironment, set)
  } catch (error) {
    throw new TypeError(
      `The agent server can't start with this environment variable: ${(error as Error).message.slice(1)}`
    )
  }
}
