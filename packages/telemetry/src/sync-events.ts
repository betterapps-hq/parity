import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * The seams internal extensions share the document and agents' activity through (docs/proposals/extensions-in-the-window.md,
 * "Telemetry and debugging"): `parity.sync`, recorded by core whichever extension brings the room, and `parity.agents`.
 * Document bytes, people's names, agents' labels and what anyone typed are never sent; lineages, peer ids and agent ids
 * are random, so they're sent as they are.
 */

const sentBy = ["renderer"] as const
const extension = z.string().describe("The extension that brings the room, by its id")
const lineage = z.string().describe("The document's lineage, a random id every copy that shares it has")
const bytes = z.number().int().nonnegative().describe("How many bytes")
const message = z.string().describe("The error's message, scrubbed")
const stack = z.string().optional().describe("The error's stack, when it has one")

export const syncEvents = [
  defineEvent(
    "sync.opened",
    z.object({
      extension,
      from: z.enum(["files", "snapshot"]).describe("What the project opened from"),
      waitMs: z.number().nonnegative().describe("How long the extension's `onOpen` took, in milliseconds"),
      snapshotBytes: bytes.optional().describe("The size of the snapshot it opened on"),
      lineage,
      format: z.string().describe("The format of the bytes it carries, as `loro/1`")
    }),
    { level: "info", sentBy, when: "The project opens through an extension's `sync.onOpen`." }
  ),
  defineEvent(
    "sync.openFailed",
    z.object({
      extension,
      reason: z.enum(["rejected", "timeout"]).describe("Whether `onOpen` rejected or took over 30 s"),
      waitMs: z.number().nonnegative().describe("How long it waited, in milliseconds"),
      message: message.optional(),
      stack
    }),
    {
      level: "warn",
      sentBy,
      when: "`sync.onOpen` rejects or takes over 30 s, so the project opens from files, alone, and sync is detached."
    }
  ),
  defineEvent(
    "sync.traffic",
    z.object({
      changesOut: z.number().int().nonnegative().describe("Changes committed here and told to the extension"),
      changesIn: z.number().int().nonnegative().describe("Changes the extension passed in"),
      bytesOut: bytes.describe("The bytes of the changes told"),
      bytesIn: bytes.describe("The bytes of the changes passed in"),
      pendingReceives: z.number().int().nonnegative().describe("Changes passed in that waited for others"),
      maxPendingMs: z.number().nonnegative().describe("The longest anything stayed pending, in milliseconds"),
      receiveP95Ms: z.number().nonnegative().describe("How long taking in changes took, at the 95th percentile")
    }),
    { level: "info", sentBy, when: "Once a minute while the document is shared, when anything crossed." }
  ),
  defineEvent(
    "sync.pending",
    z.object({
      pendingMs: z.number().nonnegative().describe("How long changes have been pending, in milliseconds"),
      pendingBytes: bytes.describe("The bytes of the changes pending")
    }),
    { level: "warn", sentBy, when: "Changes passed in stay pending, waiting for others, for over 5 s." }
  ),
  defineEvent(
    "sync.caughtUp",
    z.object({
      role: z
        .enum(["asked", "answered"])
        .describe("`answered`: this copy gave another what it was missing; `asked`: this copy's gap was filled"),
      bytes,
      durationMs: z.number().nonnegative().describe("How long it took, in milliseconds"),
      trigger: z.enum(["reconnect", "pending"]).describe("What started it: a gap seen in `receive`, or anything else")
    }),
    { level: "info", sentBy, when: "`changesSince` is answered, or changes that were pending are applied." }
  ),
  defineEvent("sync.receiveFailed", z.object({ bytes, message, stack }), {
    level: "error",
    sentBy,
    when: "`sync.receive` rejects for anything but another lineage."
  }),
  defineEvent(
    "sync.lineageRefused",
    z.object({ lineage, theirs: z.string().describe("The lineage the bytes came from") }),
    { level: "warn", sentBy, when: "`sync.receive` refuses bytes from another lineage." }
  ),
  defineEvent(
    "sync.writesFiles",
    z.object({
      writes: z.boolean().describe("Whether this copy now writes the project's files"),
      why: z.enum(["open", "host", "roomGone"]).describe("What changed it"),
      filesWritten: z.number().int().nonnegative().describe("Files written as it took over"),
      stylesheetWritten: z.boolean().describe("Whether the stylesheet was written as it took over"),
      durationMs: z.number().nonnegative().describe("How long it took to settle, in milliseconds")
    }),
    { level: "info", sentBy, when: "`sync.setWritesFiles` settles." }
  ),
  defineEvent(
    "sync.detached",
    z.object({
      why: z
        .enum(["stopped", "openFailed"])
        .describe("Why: the extension that brought the room stopped, or never opened it"),
      saved: z.boolean().describe("Whether this copy then wrote everything that differed")
    }),
    {
      level: "warn",
      sentBy,
      when: "The room goes away: the document stays open here, alone, and this copy writes files."
    }
  ),
  defineEvent("sync.diskIgnored", z.object({ path: z.string().describe("The project file, relative to its root") }), {
    level: "info",
    sentBy,
    when: "A copy in a live room that doesn't write files ignores a file changed on its disk, once per file."
  })
] as const

export const agentsEvents = [
  defineEvent(
    "agents.activity",
    z.object({
      stepsHere: z.number().int().nonnegative().describe("Steps this copy's agents took"),
      stepsReceived: z.number().int().nonnegative().describe("Steps passed in from other copies"),
      copies: z.number().int().nonnegative().describe("How many other copies steps came from"),
      listeners: z.number().int().nonnegative().describe("How many extensions listen to `agents.onActivity`")
    }),
    { level: "info", sentBy, when: "Once a minute while agents are working." }
  ),
  defineEvent(
    "agents.stepDropped",
    z.object({
      kind: z.string().describe("The step's kind, as `move`"),
      from: z.string().describe("The copy it came from"),
      dropped: z
        .number()
        .int()
        .positive()
        .describe("How many were dropped since the last one recorded, this one included")
    }),
    { level: "warn", sentBy, when: "A step passed in names a node that isn't here. At most one a minute." }
  )
] as const
