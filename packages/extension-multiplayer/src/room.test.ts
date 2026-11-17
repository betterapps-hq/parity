import { describe, expect, it } from "vite-plus/test"
import type { Outgoing } from "./protocol.ts"
import { joinRoom, type Transport } from "./room.ts"

/** A relay in memory: what each copy posts, and a way to send it messages. */
function fakeRelay() {
  const posted: Outgoing[] = []
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- what the relay sends, which may be anything
  let heard: (message: unknown) => void = () => undefined
  let down: () => void = () => undefined
  const sends: (() => void)[] = []

  const transport: Transport = {
    listen(onHeard, onDown) {
      heard = onHeard
      down = onDown

      return () => undefined
    },
    post(message) {
      posted.push(message)

      // Batches wait until let through, as a request on its way does.
      return message.kind === "batch" && message.to === undefined
        ? new Promise<void>((resolve) => sends.push(resolve))
        : Promise.resolve()
    }
  }

  return {
    transport,
    posted,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- what the relay sends, which may be anything
    say: (message: unknown) => heard(message),
    drop: () => down(),
    /** Lets the oldest batch on its way arrive. */
    arrive: async () => {
      sends.shift()?.()
      await Promise.resolve()
      await Promise.resolve()
    }
  }
}

describe("joinRoom", () => {
  it("knows who hosts and who's here from the relay, in the order they joined", async () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "b")
    relay.say({ kind: "welcome", host: "a", peers: ["a", "b"] })
    await room.welcomed()
    expect([room.host, room.peers]).toEqual(["a", ["a", "b"]])

    relay.say({ kind: "joined", from: "c", host: "a" })
    relay.say({ kind: "left", from: "a", host: "b" })
    expect([room.host, room.peers]).toEqual(["b", ["b", "c"]])
  })

  it("sends one batch at a time, in order, keeping only the latest presence meanwhile", async () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "a")

    const presence = (x: number) => ({
      name: "Mia",
      selection: [],
      viewing: {},
      pointer: { at: { x, y: 0 }, over: true }
    })

    room.send({ kind: "changes", bytes: "AQ==" })
    room.presence(presence(1))
    room.send({ kind: "gesture", gesture: { kind: "marquee", phase: "start", from: { x: 0, y: 0 } } })
    room.presence(presence(2))
    room.presence(presence(3))
    await relay.arrive()

    expect(relay.posted).toEqual([
      { kind: "batch", data: { events: [{ kind: "changes", bytes: "AQ==" }] } },
      {
        kind: "batch",
        data: {
          events: [{ kind: "gesture", gesture: { kind: "marquee", phase: "start", from: { x: 0, y: 0 } } }],
          presence: presence(3)
        }
      }
    ])
  })

  it("asks every other copy for the document, and opens on the first snapshot to arrive", async () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "c")
    relay.say({ kind: "welcome", host: "a", peers: ["a", "b", "c"] })

    const asked = room.askSnapshot(1000)
    relay.say({ kind: "snapshot", from: "b", data: { snapshot: "AA==", lineage: "L" } })
    relay.say({ kind: "snapshot", from: "a", data: { snapshot: "AQ==", lineage: "L" } })

    await expect(asked).resolves.toEqual({ snapshot: "AA==", lineage: "L" })
    expect(relay.posted).toEqual([
      { kind: "hello", to: "a" },
      { kind: "hello", to: "b" }
    ])
  })

  it("tells listeners of another copy's events and presence, and says when the connection dropped and came back", () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "b", () => 1000)
    const heard: string[] = []

    room.on({
      event: (event, from) => heard.push(`${from} ${event.kind}`),
      presence: (presence, from) => heard.push(`${from} presence ${presence.name}`),
      down: () => heard.push("down"),
      reconnected: (downMs) => heard.push(`reconnected ${downMs}`),
      missing: (version, from) => heard.push(`${from} missing ${version}`)
    })

    relay.say({ kind: "welcome", host: "a", peers: ["a", "b"] })
    relay.say({
      kind: "batch",
      from: "a",
      data: { events: [{ kind: "changes", bytes: "AQ==" }], presence: { name: "Ana", selection: [], viewing: {} } }
    })
    relay.say({ kind: "missing", from: "a", data: { version: "AA==" } })
    relay.drop()
    relay.say({ kind: "welcome", host: "a", peers: ["a", "b"] })
    // Something that isn't a message is ignored.
    relay.say({ kind: "batch", from: "a" })

    expect(heard).toEqual(["a changes", "a presence Ana", "a missing AA==", "down", "reconnected 0"])
  })

  it("says who left while the connection was down, before who's here, once it comes back", () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "b")
    const heard: string[] = []

    room.on({
      left: (peer) => heard.push(`left ${peer}`),
      members: () => heard.push(`members ${room.peers.join(",")}`)
    })

    relay.say({ kind: "welcome", host: "a", peers: ["a", "b", "c"] })
    relay.drop()
    // `a` and `c` left meanwhile, and `d` came: the relay names only who's here now, with this copy hosting.
    relay.say({ kind: "welcome", host: "b", peers: ["b", "d"] })

    expect(heard).toEqual(["members a,b,c", "left a", "left c", "members b,d"])
    expect(room.host).toBe("b")
  })

  it("asks the host for what it missed, and nobody when it hosts", () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "b")
    relay.say({ kind: "welcome", host: "a", peers: ["a", "b"] })
    room.askMissing("AA==")
    relay.say({ kind: "left", from: "a", host: "b" })
    room.askMissing("AQ==")

    expect(relay.posted).toEqual([{ kind: "missing", to: "a", data: { version: "AA==" } }])
  })

  it("asks another copy in turn when asked to, as after the relay was down, so changes made on both sides meet", () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "a")
    const asked: string[] = []
    room.on({ missing: (version, from, back) => asked.push(`${from} ${version} ${back}`) })
    relay.say({ kind: "welcome", host: "a", peers: ["a", "b"] })

    relay.say({ kind: "missing", from: "b", data: { version: "AA==", back: true } })
    relay.say({ kind: "missing", from: "b", data: { version: "AQ==" } })
    room.askMissing("Ag==", { of: "b" })

    expect(asked).toEqual(["b AA== true", "b AQ== false"])
    expect(relay.posted).toEqual([{ kind: "missing", to: "b", data: { version: "Ag==" } }])
  })

  it("asks the host for what it missed and to be asked back, once the relay is back", () => {
    const relay = fakeRelay()
    const room = joinRoom(relay.transport, "b")
    relay.say({ kind: "welcome", host: "a", peers: ["a", "b"] })
    room.askMissing("AA==", { back: true })

    expect(relay.posted).toEqual([{ kind: "missing", to: "a", data: { version: "AA==", back: true } }])
  })
})
