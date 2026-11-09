import { parseData } from "@parity-app/core"
import { z } from "zod"

/** Digits only, as a whole number above 0: a process id or a time in milliseconds. */
const positive = z
  .string()
  .regex(/^\d+$/, "expected a whole number")
  .transform(Number)
  .pipe(z.int().min(1, "expected a whole number"))

/**
 * The project service's environment, as main sets it when it starts the service, or as a developer sets it to try
 * something. Every variable is optional: a service started some other way, as by a test, has none.
 */
const serviceEnvironment = z.object({
  /** Origins besides the canvas's own that may load a project's guest, separated by commas. */
  PARITY_ALLOWED_ORIGINS: z
    .string()
    .transform((origins) => origins.split(",").filter(Boolean))
    .optional(),
  /** The project Parity was started with, when the window doesn't name one. */
  PARITY_PROJECT: z.string().optional(),
  /** Set when the service runs from source, so the guest module comes from the renderer package, not the bundle. */
  PARITY_DEV_RUNNER: z.string().optional(),
  /** How long the type checker keeps its programs with nothing asked of it (see `checkerIdleMs`). */
  PARITY_CHECKER_IDLE_MS: positive.optional(),
  /** Where what the type checker found is saved (see detection-cache.ts). */
  PARITY_CACHE_DIR: z.string().optional(),
  /** Where frame bitmaps and component previews are kept (see bitmap-store.ts). */
  PARITY_BITMAP_DIR: z.string().optional(),
  /** Where projects' pictures for the start page are kept (see pictures.ts). */
  PARITY_PICTURE_DIR: z.string().optional(),
  /** The list of projects open when the service last ran (see reopening.ts). */
  PARITY_REOPEN_FILE: z.string().optional(),
  /** Portless's state folder, when it isn't `~/.portless` (see portless.ts). */
  PORTLESS_STATE_DIR: z.string().optional(),
  /**
   * Which copy of the app this service belongs to (PAR-598): its process id and when it started, which name the copy's
   * agent registry entry.
   */
  PARITY_APP_PID: positive.optional(),
  PARITY_APP_STARTED: positive.optional()
})

export type ServiceEnvironment = z.infer<typeof serviceEnvironment>

/**
 * Reads the service's variables from `env`, or throws `TypeError` naming the one at fault. An empty variable counts as
 * unset, as a shell's `NAME=` means.
 */
export function readServiceEnvironment(env: NodeJS.ProcessEnv): ServiceEnvironment {
  const set = Object.fromEntries(
    Object.keys(serviceEnvironment.shape).flatMap((name) => {
      const value = env[name]

      return value === undefined || value === "" ? [] : [[name, value]]
    })
  )

  try {
    return parseData(serviceEnvironment, set)
  } catch (error) {
    throw new TypeError(
      `The project service can't start with this environment variable: ${error instanceof Error ? error.message.slice(1) : String(error)}`
    )
  }
}

let read: ServiceEnvironment | undefined

/** The service's environment, read from `process.env` the first time it's asked for. */
export function environment(): ServiceEnvironment {
  read ??= readServiceEnvironment(process.env)

  return read
}
