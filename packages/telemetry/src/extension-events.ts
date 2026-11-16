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
    api: z.string().describe("What core called, as `selection.onChange` or `node.status`"),
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
    sentBy: ["renderer"],
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

export const extensionEvents = [
  extensionActivated,
  extensionActivateFailed,
  extensionDeactivated,
  extensionCrashed,
  extensionCallFailed,
  extensionStoppedInTab,
  extensionHalfUnavailable,
  extensionManifestRefused,
  extensionCapabilityMissing
] as const
