import { z } from "zod"
import { defineEvent } from "./events.ts"

/**
 * The multiplayer extension's own (docs/proposals/extensions-in-the-window.md, "The multiplayer extension's own"),
 * recorded by its window module through `parity.telemetry` and by its Node half's relay. People's names are never sent;
 * peer ids are random, so counts of them are.
 */

const sentBy = ["renderer"] as const
const peers = z.number().int().nonnegative().describe("How many copies are in the room, this one included")

export const roomEvents = [
  defineEvent(
    "room.relayStarted",
    z.object({
      result: z.enum(["started", "shared"]).describe("Whether this copy started the relay, or found another copy's"),
      port: z.number().int().positive().describe("The port the relay listens on")
    }),
    { level: "info", sentBy, when: "The window module asks its Node half for the relay, which starts it or finds one." }
  ),
  defineEvent(
    "room.joined",
    z.object({
      host: z.boolean().describe("Whether this copy hosts the room"),
      peers,
      waitMs: z.number().nonnegative().describe("How long joining took, the host's snapshot included, in milliseconds")
    }),
    { level: "info", sentBy, when: "This copy joins a room." }
  ),
  defineEvent(
    "room.left",
    z.object({
      why: z
        .enum(["closed", "turnedOff", "lineage", "relayGone"])
        .describe("Why: the project closed, the extension stopped, another lineage, or the relay went away"),
      durationMs: z.number().nonnegative().describe("How long this copy was in the room, in milliseconds")
    }),
    { level: "info", sentBy, when: "This copy leaves a room." }
  ),
  defineEvent(
    "room.hostChanged",
    z.object({ becameHost: z.boolean().describe("Whether this copy is now the host"), peers }),
    { level: "info", sentBy, when: "The room's host changes." }
  ),
  defineEvent(
    "room.reconnected",
    z.object({ downMs: z.number().nonnegative().describe("How long the connection was down, in milliseconds") }),
    { level: "warn", sentBy, when: "The connection to the relay comes back." }
  ),
  defineEvent(
    "room.latency",
    z.object({
      rttP50Ms: z.number().nonnegative().describe("The median round trip of a batch to the relay, in milliseconds"),
      rttP95Ms: z.number().nonnegative().describe("The 95th percentile round trip, in milliseconds"),
      rttMaxMs: z.number().nonnegative().describe("The slowest round trip, in milliseconds"),
      presenceGapP50Ms: z
        .number()
        .nonnegative()
        .describe(
          "How far apart others' presence arrived, the median, in milliseconds, leaving out pauses of 1 s or more"
        ),
      presenceGapP95Ms: z
        .number()
        .nonnegative()
        .describe("How far apart others' presence arrived, the 95th percentile"),
      presenceGapMaxMs: z.number().nonnegative().describe("The longest gap between others' presence, under 1 s"),
      presenceLate: z
        .number()
        .int()
        .nonnegative()
        .describe("Others' pointer positions that arrived after the time they were to be drawn at"),
      presenceSent: z.number().int().nonnegative().describe("Presence updates sent"),
      presenceReceived: z.number().int().nonnegative().describe("Presence updates received"),
      queueMax: z.number().int().nonnegative().describe("The most messages waiting to be sent at once"),
      batchesInFlightMax: z.number().int().nonnegative().describe("The most batches on their way at once")
    }),
    { level: "info", sentBy, when: "Once a minute while in a room." }
  )
] as const
