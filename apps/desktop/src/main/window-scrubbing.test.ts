import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateSync, inflateSync } from "node:zlib"
import type { Envelope } from "@parity-app/telemetry"
import { beforeAll, describe, expect, it } from "vite-plus/test"
import { secretScrubbing } from "../shared/secret-scrubbing.ts"
import { projectEnvSecrets } from "../utility/env-secrets.ts"
import { scrubRecorded, scrubReplays, type SentEnvelope } from "./window-scrubbing.ts"

/** Main's scrubber, given what the service read from a fixture project's `.env` files, as main is (PAR-672). */
const scrubbing = secretScrubbing()

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-env-"))
  await writeFile(join(root, ".env"), "DATABASE_PASSWORD=hunter2-correct-horse\nPORT=5173\n")
  await writeFile(join(root, ".env.local"), "export SHOP_NAME='quiet-meadow-shop'\n")
  await writeFile(join(root, "notes.txt"), "NOT_READ=not-an-env-value\n")
  scrubbing.use(await projectEnvSecrets([root]))
})

/** What the editor window records as it connects to the project's database. */
const recorded: Envelope = {
  installId: "install",
  sessionId: "session",
  process: "renderer",
  name: "error.caught",
  time: "2026-11-13T09:00:00.000Z",
  level: "error",
  attributes: { message: "Couldn't connect with hunter2-correct-horse", shop: "quiet-meadow-shop", port: "5173" }
}

/** Replay's events for a page that shows the database password and the shop. */
const events = [
  { type: 2, timestamp: 1, data: { node: { type: 3, textContent: "Connecting with hunter2-correct-horse" } } },
  { type: 3, timestamp: 2, data: { texts: [{ id: 4, value: 'Shop "quiet-meadow-shop" on port 5173' }] } }
]

/** A replay segment as Replay sends it: a line naming it, then its events, compressed as Replay's worker does or not. */
function segment(compressed: boolean, body = JSON.stringify(events)): Uint8Array {
  const encoded = new TextEncoder().encode(body)
  const payload = compressed ? deflateSync(encoded) : encoded
  const head = new TextEncoder().encode('{"segment_id":3}\n')
  const whole = new Uint8Array(head.length + payload.length)
  whole.set(head)
  whole.set(payload, head.length)

  return whole
}

/** A replay envelope as main gets one from a window, with what main's scope adds to its event. */
function replay(recording: Uint8Array): [headers: unknown, items: [unknown, unknown][]] {
  return [
    { event_id: "replay" },
    [
      [{ type: "replay_event" }, { replay_id: "replay", breadcrumbs: [{ message: "Opened quiet-meadow-shop" }] }],
      [{ type: "replay_recording", length: recording.length }, recording]
    ]
  ]
}

/** A segment's events as Sentry will read them, checking its header's length matches. */
function sentRecording(envelope: SentEnvelope): string {
  const [header, payload] = envelope[1].at(-1)!

  if (!(payload instanceof Uint8Array) || !(header instanceof Object) || !("length" in header)) {
    throw new Error("The envelope has no recording")
  }

  const body = payload.subarray(payload.indexOf(0x0a) + 1)
  const text = new TextDecoder().decode(body[0] === 0x78 ? inflateSync(body) : body)
  expect(header.length).toBe(payload.length)

  return text
}

describe("what a window sends, scrubbed in main of the .env values the window never has (PAR-983)", () => {
  it("has the fixture project's .env values, and nothing else from its files", () => {
    expect(scrubbing.secrets()).toEqual(["hunter2-correct-horse", "quiet-meadow-shop"])
  })

  it("scrubs them from an event a window recorded", () => {
    const sent = scrubRecorded(recorded, scrubbing)
    expect(JSON.stringify(sent)).not.toMatch(/hunter2|quiet-meadow/)
    expect(sent.attributes["port"]).toBe("5173")
    expect({ ...sent, attributes: recorded.attributes }).toEqual(recorded)
  })

  it.each([
    ["compressed, as Replay's worker sends it", true],
    ["uncompressed, as Replay sends it with no worker", false]
  ])("scrubs them from a replay's recording, %s", (_name, compressed) => {
    const envelope = replay(segment(compressed))
    scrubReplays(envelope, scrubbing)
    const text = sentRecording(envelope)
    expect(text).not.toMatch(/hunter2|quiet-meadow/)
    expect(JSON.parse(text)).toEqual([
      { type: 2, timestamp: 1, data: { node: { type: 3, textContent: "Connecting with [redacted]" } } },
      { type: 3, timestamp: 2, data: { texts: [{ id: 4, value: 'Shop "[redacted]" on port 5173' }] } }
    ])
    expect(JSON.stringify(envelope[1][0])).not.toMatch(/quiet-meadow/)
  })

  it("leaves a recording that holds none of them as it was sent", () => {
    const recording = segment(true, JSON.stringify([{ type: 3, timestamp: 2, data: { texts: [{ value: "Hello" }] } }]))
    const envelope = replay(recording)
    scrubReplays(envelope, scrubbing)
    expect(envelope[1][1]![1]).toBe(recording)
  })

  it("leaves out a recording it can't read, since it can't be checked", () => {
    const envelope = replay(segment(true).subarray(0, 30))
    scrubReplays(envelope, scrubbing)
    expect(envelope[1].map(([header]) => header)).toEqual([{ type: "replay_event" }])
  })
})
