import { nonBlankString, parseData } from "@parity-app/core"
import { z } from "zod"

/** Digits only, as a whole number: a process id or a port. */
const wholeNumber = z.string().regex(/^\d+$/, "expected a whole number").transform(Number)

/**
 * The environment variables the main process reads (PAR-592), which scripts, tests and the AppImage runtime set. It's
 * read once, as main starts, and a bad value stops it there, naming the variable, rather than failing later or being
 * passed on to Chromium.
 */
const mainEnvironment = z.object({
  /** Where the window's page comes from: the dev server's address, or the installed files. */
  PARITY_RENDERER_URL: z
    .string()
    .refine((url) => URL.canParse(url), "expected a URL")
    .default("parity://app/index.html"),
  /** The port for the Chrome DevTools Protocol, so agents and scripts can inspect the canvas; 0 picks a free one. */
  PARITY_DEBUG_PORT: wholeNumber.pipe(z.int().max(65535)).optional(),
  /** The page's size, such as 1439x901, which `pnpm perf` and the end-to-end tests ask for. */
  PARITY_WINDOW_SIZE: z
    .string()
    .regex(/^\d+x\d+$/, "expected a size such as 1440x900")
    .transform((size) => {
      const [width = 0, height = 0] = size.split("x").map(Number)
      return { width, height }
    })
    .pipe(z.object({ width: z.int().min(1), height: z.int().min(1) }))
    .optional(),
  /** A second copy's own folder for its tabs, storage and theme. */
  PARITY_USER_DATA: nonBlankString.optional(),
  /** The project the window opens first. */
  PARITY_PROJECT: nonBlankString.optional(),
  /** The commit a copy run from source was started on, which the dev runner sets to name its Sentry release. */
  PARITY_COMMIT: z
    .string()
    .regex(/^[0-9a-f]{40}$/, "expected a full commit hash")
    .optional(),
  /** The dev runner's process id, which it sets on the copy it runs. */
  PARITY_DEV_RUNNER: wholeNumber.pipe(z.int().min(1)).optional(),
  /** Names a test pass, so its events, errors and replays group together in Sentry (PAR-630). */
  PARITY_TEST_RUN: nonBlankString.optional(),
  /** The tester's name, shown as Sentry's user (PAR-630). */
  PARITY_TESTER: nonBlankString.optional(),
  /** Where an AppImage is, which its runtime sets; Linux updates only work from one. */
  APPIMAGE: z.string().optional()
})

export type MainEnvironment = z.infer<typeof mainEnvironment>

/**
 * Reads main's variables from `env`, or throws `TypeError` naming the one at fault. An empty variable counts as unset,
 * as a shell's `NAME=` means.
 */
export function readEnvironment(env: NodeJS.ProcessEnv): MainEnvironment {
  const set = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""))
  try {
    return parseData(mainEnvironment, set)
  } catch (error) {
    throw new TypeError(`Parity can't start with this environment variable: ${(error as Error).message.slice(1)}`)
  }
}
