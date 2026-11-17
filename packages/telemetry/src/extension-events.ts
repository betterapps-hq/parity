import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * Extensions' lifecycle, for both halves of an internal extension (its window module in a project tab and its Node
 * half) and for other extensions' Node halves (docs/proposals/extensions-in-the-window.md, "Telemetry and debugging").
 * Errors from a window module also carry the Sentry tags `extension`, `extension_half` and `tab`.
 */

const extension = z.string().describe("The extension's id, its package name")
const half = z.enum(["window", "node"]).describe("Which half: its window module, or its Node half")
const durationMs = z.number().nonnegative().describe("How long it took, in milliseconds")
const uptimeMs = z.number().nonnegative().describe("How long it had been active, in milliseconds")
const message = z.string().describe("The error's message, scrubbed")
const stack = z.string().optional().describe("The error's stack, when it has one")
const failures = z.number().int().nonnegative().describe("How many calls into its window module failed in this tab")

const capabilityName = z.enum(["canvas", "camera", "presence", "sync", "agents", "hold"])
const capability = capabilityName.describe("The capability it needed and didn't declare")

export const extensionActivated = defineEvent(
  "extension.activated",
  z.object({
    extension,
    version: z.string().describe("The extension's version"),
    half,
    internal: z.boolean().describe("Whether it's one of Parity's own internal extensions"),
    trigger: z
      .string()
      .describe("The activation event that started it, as `onStartup` or `onSetting:multiplayer.liveRoom`"),
    durationMs,
    capabilities: z.array(capabilityName).describe("What its manifest says its window module may use")
  }),
  { level: "info", sentBy: ["renderer", "service"], when: "A half's `activate` or `activateWindow` returns." }
)

export const extensionActivateFailed = defineEvent(
  "extension.activateFailed",
  z.object({
    extension,
    half,
    phase: z.enum(["load", "activate"]).describe("Whether its code failed to load, or its activation threw"),
    message,
    stack
  }),
  { level: "error", sentBy: ["renderer", "service"], when: "A half fails to load or its activation throws." }
)

export const extensionDeactivated = defineEvent(
  "extension.deactivated",
  z.object({
    extension,
    half,
    why: z
      .enum(["turnedOff", "tabClosed", "setting", "crashed", "undetected", "quit"])
      .describe(
        "Why it stopped: turned off, its tab closed, its setting went off, it or its other half crashed or failed too often, its tool went, or the project or app closed"
      ),
    uptimeMs
  }),
  { level: "info", sentBy: ["renderer", "service"], when: "A half stops." }
)

export const extensionCrashed = defineEvent(
  "extension.crashed",
  z.object({
    extension,
    uptimeMs,
    crashesInRow: z.number().int().positive().describe("How many times it has crashed in a row, this one included"),
    restarting: z.boolean().describe("Whether it starts again, or is left stopped"),
    exitCode: z.number().int().optional().describe("Its process's exit code, when it exited with one"),
    signal: z.string().optional().describe("The signal that ended it, when one did")
  }),
  { level: "warn", sentBy: ["service"], when: "A Node half's process ends by itself." }
)

export const extensionCallFailed = defineEvent(
  "extension.callFailed",
  z.object({
    extension,
    api: z
      .string()
      .describe("What core called, as `selection.onChange`, `node.status` or `layer:multiplayer.pointers`"),
    failures,
    stopped: z.boolean().describe("Whether this failure stopped it in the tab"),
    message,
    stack
  }),
  {
    level: "warn",
    sentBy: ["renderer"],
    when: "A listener, handler or call into a window module throws, caught by core."
  }
)

export const extensionStoppedInTab = defineEvent(
  "extension.stoppedInTab",
  z.object({ extension, failures, message: message.describe("The last error's message, scrubbed") }),
  { level: "error", sentBy: ["renderer"], when: "A window module reaches five failures and is stopped in a tab." }
)

export const extensionHalfUnavailable = defineEvent(
  "extension.halfUnavailable",
  z.object({
    extension,
    from: half.describe("The half that made the call"),
    method: z.string().describe("The method it called"),
    state: z.enum(["starting", "restarting", "stopped"]).describe("Where the other half was")
  }),
  {
    level: "warn",
    sentBy: ["renderer", "service"],
    when: "A call to the other half rejects with `HalfUnavailableError`. After the first for an extension in a minute, one in ten."
  }
)

export const extensionManifestRefused = defineEvent(
  "extension.manifestRefused",
  z.object({
    extension,
    rule: z
      .enum([
        "internalOutsideBuiltIns",
        "internalOnly",
        "capabilityWithoutContribution",
        "windowEventWithoutWindow",
        "noCode",
        "secondSync",
        "invalid"
      ])
      .describe("The rule it breaks; `invalid` for any other problem with its manifest"),
    message: message.describe("What's wrong, by its JSON pointer")
  }),
  { level: "error", sentBy: ["service"], when: "A built-in extension's manifest breaks a rule when it's read." }
)

export const extensionCapabilityMissing = defineEvent(
  "extension.capabilityMissing",
  z.object({
    extension,
    capability,
    api: z.string().describe("What it called, as `parity.canvas`")
  }),
  {
    level: "warn",
    sentBy: ["renderer"],
    when: "A window module calls an API its manifest's capabilities don't name. Once per extension, API and session."
  }
)

export const extensionSlow = defineEvent(
  "extension.slow",
  z.object({
    extension,
    kind: z
      .enum(["frame", "callback"])
      .describe("A long animation frame whose scripts were mostly its window module's, or one call into it over 16 ms"),
    api: z.string().optional().describe("For a call: what core called, as `presence.onPointer`"),
    durationMs,
    blockingMs: z.number().nonnegative().describe("How long it kept input waiting, past 50 ms, in milliseconds")
  }),
  {
    level: "warn",
    sentBy: ["renderer"],
    when: "A long frame is mostly a window module's chunk, or one call into it takes over 16 ms. At most one per extension a minute; the rest are counted in `extension.mainThread`."
  }
)

export const extensionMainThread = defineEvent(
  "extension.mainThread",
  z.object({
    extension,
    callbacks: z.number().int().nonnegative().describe("How many calls core made into its window module this minute"),
    callbackMs: z.number().nonnegative().describe("How long those calls took in all, in milliseconds"),
    callbackP95Ms: z.number().nonnegative().describe("The 95th percentile of those calls, in milliseconds"),
    longFrames: z.number().int().nonnegative().describe("Long animation frames put down to it this minute"),
    slow: z.number().int().nonnegative().describe("Slow calls and frames this minute, `extension.slow` sent or not"),
    layers: z.number().int().nonnegative().describe("How many layers it draws"),
    layerRenders: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("How many times its layers rendered, where React's Profiler reports renders: not in production builds")
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "Once a minute while a window module is active in a visible tab."
  }
)

export const extensionEvents = [
  extensionActivated,
  extensionActivateFailed,
  extensionDeactivated,
  extensionCrashed,
  extensionCallFailed,
  extensionStoppedInTab,
  extensionHalfUnavailable,
  extensionManifestRefused,
  extensionCapabilityMissing,
  extensionSlow,
  extensionMainThread
] as const

const sentBy = ["renderer"] as const

/** Why following ended: Esc, the person's own pan or zoom, opening another design, another follow, or its owner ending it. */
export const followEnds = ["escape", "panned", "zoomed", "navigated", "replaced", "disposed"] as const

/**
 * The canvas surface that internal extensions draw through (PAR-1233): following someone's view and colors handed out
 * by key. Each is recorded once, when it happens, never per frame.
 */
export const canvasSurfaceEvents = [
  defineEvent(
    "follow.ended",
    z.object({
      extension: z.string().describe("Who followed: an extension by its id, or `core`"),
      why: z.enum(followEnds).describe("Why it ended"),
      durationMs: z.number().describe("From when following began to when it ended, in milliseconds")
    }),
    { level: "info", sentBy, when: "Following a view on the canvas ends." }
  ),
  defineEvent(
    "colors.generated",
    z.object({
      list: z.enum(["people", "agents"]).describe("Whose palettes: people's or agents'"),
      n: z.int().min(0).describe("The palette's number, past the hand-tuned ones"),
      keys: z.int().min(0).describe("How many people and agents held a color in the tab then")
    }),
    {
      level: "info",
      sentBy,
      when: "A claim or assignment needs a generated palette, once per tab, list and number."
    }
  )
] as const
