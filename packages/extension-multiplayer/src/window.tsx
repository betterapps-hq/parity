import type { NodeRef } from "@parity-app/extension"
import {
  defineWindowModule,
  type Gesture,
  LineageError,
  type Palette,
  type Preview,
  type WindowParity
} from "@parity-app/extension/internal"
import { localAgentKey, RoomAgents } from "./agents.ts"
import type { RelayApi } from "./extension.ts"
import { Follow } from "./follow.ts"
import { fileWritesFollowHost } from "./hosting.ts"
import { Faces, Following, Marquees, Pointers, Selections } from "./layers.tsx"
import { assignColors, dragItems, People } from "./people.ts"
import { fromBase64, type PersonPresence, toBase64 } from "./protocol.ts"
import { joinRoom, relayTransport, type Room } from "./room.ts"

/*
 * The multiplayer extension's window module (docs/proposals/extensions-in-the-window.md, "The multiplayer extension").
 * With the Live room setting on, each project tab joins the project's room through the relay its Node half runs. The
 * first copy in opens the files and writes them; a later one opens on a snapshot of the host's document. It carries the
 * document's changes through `parity.sync`, catching up after a gap or a reconnect, and tells the room what this person
 * is doing and what this copy's agents do. Everyone else, and every agent, is drawn in the palette the host assigned.
 */

/** Where the relay listens. Every copy on the machine uses the same one. */
export const relayPort = 5390

/** How long a joining copy waits for another copy's snapshot: within core's 30 s wait for `onOpen`. */
const snapshotWaitMs = 25_000

/** How long to wait for the Node half to start before joining without knowing the relay started. */
const halfWaitMs = 10_000

/** How long a copy waits for the relay to welcome it once it's started or found. */
const welcomeWaitMs = 5000

/** How often a copy that lost the relay tries to start it again. */
const relayRetryMs = 2000

const minuteMs = 60_000

export default defineWindowModule({
  activateWindow(parity) {
    const peer = crypto.randomUUID().slice(0, 8)
    const began = performance.now()
    const room = joinRoom(relayTransport(`http://127.0.0.1:${relayPort}`, parity.project.root, peer), peer)
    const ready = joinWhenRelayRuns(parity, room)
    // `onOpen` reports a failure to join; one nobody asks about stays quiet.
    ready.catch(() => undefined)
    let leftWhy: "closed" | "lineage" = "closed"

    // Each person's color is held while they're here, so the layers read it without claiming as they draw.
    const held = new Set<string>()

    const paletteOf = (key: string): Palette => {
      if (!held.has(key)) {
        held.add(key)

        return parity.colors.claim(key)
      }

      // Read without holding it twice: the claim made as they arrived holds it.
      const palette = parity.colors.claim(key)
      parity.colors.release(key)

      return palette
    }

    const people = new People(paletteOf)
    const follow = new Follow(parity.camera)
    let assigned = new Map<string, number>()

    const applyColors = (next: ReadonlyMap<string, number>) => {
      assigned = new Map(next)

      for (const [key, n] of next) {
        parity.colors.assign(key, n)
      }

      people.colors(next)
    }

    // Agents, numbered by the host too, so an agent is the same color in every copy.
    const agents = new RoomAgents()
    let agentsAssigned = new Map<string, number>()

    const applyAgentColors = (next: ReadonlyMap<string, number>) => {
      agentsAssigned = new Map(next)

      for (const [key, n] of next) {
        agents.numbered(key)
        parity.colors.agents.assign(localAgentKey(key, peer), n)
      }
    }

    // What this person is doing, the latest of each, sent with the next batch.
    const mine: PersonPresence = {
      name: parity.presence.self.name,
      selection: parity.selection.get(),
      viewing: {}
    }

    const tellMine = () => room.presence({ ...mine, name: parity.presence.self.name })

    // The document.
    const opened = () => parity.sync.lineage !== ""
    let host = ""

    const hosting = fileWritesFollowHost(
      parity.sync,
      () => room.host === peer,
      (error) => parity.log.error(error)
    )

    const hostChanged = () => {
      if (room.host === host) {
        return
      }

      const before = host
      host = room.host

      if ((before === peer) !== (host === peer) || !opened()) {
        parity.telemetry.record("room.hostChanged", { becameHost: host === peer, peers: room.peers.length })
      }

      // How the document opens follows from the host the relay first names; a change after that moves file writes.
      if (before !== "") {
        hosting.hostChanged()
      }
    }

    // The host numbers everyone's colors, and every agent's, so each is the same color in every copy.
    const numberColors = () => {
      if (room.host !== peer) {
        return
      }

      agents.keepOnly(room.peers)
      const next = assignColors(room.peers, assigned)
      const nextAgents = assignColors(agents.keys(), agentsAssigned)
      applyColors(next)
      applyAgentColors(nextAgents)
      room.send({ kind: "colors", assigned: [...next], agents: [...nextAgents] })
    }

    /** An agent at work in `copy`: a new one is numbered, when this copy hosts. */
    const agentSeen = (copy: string, steps: readonly { agentId: string }[]) => {
      let added = false

      for (const step of steps) {
        added = agents.seen(copy, step.agentId) || added
      }

      if (added) {
        numberColors()
      }
    }

    const previews = new Map<string, Preview>()

    const dragged = (from: string, gesture: Extract<Gesture, { kind: "move" }>) => {
      const person = people.person(from)
      // Where their pointer is drawn, which their drag follows.
      const pointer = people.pointerAt(from, performance.now())

      if (gesture.phase === "start") {
        previews.get(from)?.dispose()
        previews.delete(from)

        if (!person || !pointer) {
          return
        }

        try {
          const options: Parameters<typeof parity.canvas.preview>[1] = { color: from, label: person.name }

          if (gesture.drop) {
            options.drop = gesture.drop
          }

          previews.set(from, parity.canvas.preview(dragItems(gesture, pointer), options))
        } catch (error) {
          // The canvas hasn't mounted yet: the drag shows from its next gesture.
          parity.log.warn(`Couldn't show ${person.name}'s drag: ${errorOf(error).message}`)
        }

        return
      }

      const preview = previews.get(from)

      if (gesture.phase === "drop" && preview && pointer) {
        preview.update(dragItems(gesture, pointer), gesture.drop ? { drop: gesture.drop } : {})
        drawDrags()
      } else if (gesture.phase === "end") {
        // The drop's write came first, on the same channel, so the preview settles on it.
        preview?.settleOnWrite()
        previews.delete(from)
      } else if (gesture.phase === "cancel") {
        preview?.cancel()
        previews.delete(from)
      }
    }

    const leaveWith = (why: "lineage") => {
      leftWhy = why
      parity.log.error("This copy holds another version of the project, so it left the live room")
      // The document stays open here, alone, and this copy writes files again.
      opening.dispose()
      stop()
    }

    // The relay stops with the copy whose Node half started it, as when that copy closes the project: this copy starts
    // another, or finds one a third copy started, and everyone rejoins it, the first back hosting.
    let restarting = false
    let restartedAt = -Infinity

    const restartRelay = () => {
      if (restarting || performance.now() - restartedAt < relayRetryMs || parity.host.state !== "ready") {
        return
      }

      restarting = true
      restartedAt = performance.now()
      void parity.host
        .api<RelayApi>()
        .ensureRelay(relayPort)
        .then((result) => {
          if (result === "started") {
            parity.log.info("The live room's relay stopped, so this copy started it again")
            parity.telemetry.record("room.relayStarted", { result, port: relayPort })
          }
        })
        .catch(() => undefined)
        .finally(() => {
          restarting = false
        })
    }

    const stopRoom = room.on({
      members() {
        hostChanged()
        numberColors()
        people.keepOnly(room.peers)
        // Someone joining sees this person straight away.
        tellMine()
      },
      left(gone) {
        follow.left(gone)
        previews.get(gone)?.dispose()
        previews.delete(gone)
        heldForWrite.delete(gone)
        people.remove(gone)

        if (held.delete(gone)) {
          parity.colors.release(gone)
        }
      },
      hello(from) {
        // Only a copy that opened through the room has a document to give; the snapshot waits until it's open.
        void parity.sync
          .snapshot()
          .then((snapshot) => room.answerSnapshot(from, toBase64(snapshot), parity.sync.lineage))
          .catch(() => undefined)
      },
      missing(version, from, back) {
        try {
          room.sendTo(from, [{ kind: "changes", bytes: toBase64(parity.sync.changesSince(fromBase64(version))) }])
        } catch (error) {
          parity.log.warn(`Couldn't send the changes another copy missed: ${errorOf(error).message}`)
        }

        // The other copy was cut off too, and may hold changes whose batches failed meanwhile.
        if (back && opened()) {
          room.askMissing(toBase64(parity.sync.version()), { of: from })
        }
      },
      down: restartRelay,
      reconnected(downMs) {
        parity.telemetry.record("room.reconnected", { downMs: Math.round(downMs) })

        // Both ways: what this copy sent while the relay was down never arrived.
        if (opened()) {
          room.askMissing(toBase64(parity.sync.version()), { back: true })
        }
      },
      presence(presence, from) {
        people.presence(from, presence)
        heldForWrite.delete(from)

        if (previews.has(from)) {
          drawDrags()
        }

        if (presence.camera) {
          follow.update(from, presence.camera)
        }
      },
      event(event, from) {
        switch (event.kind) {
          case "changes":
            // Likely their drop's write, which their drag settles on when it ends: until they move again, frames
            // drawn between positions leave the drag be, since an update makes it forget a write that came first.
            if (previews.has(from)) {
              heldForWrite.add(from)
            }

            const arrived = performance.now()

            void parity.sync.receive(fromBase64(event.bytes)).then(
              ({ pending }) => {
                if (pending) {
                  askMissing()
                }

                // The first frame drawn after taking it in is where it shows (PAR-1325).
                afterPaint(() => {
                  const ms = performance.now() - arrived
                  changeToScreen.push(ms)
                  performance.measure("room.changeToScreen", { start: arrived, duration: ms })
                })
              },
              (error) => {
                if (error instanceof LineageError) {
                  leaveWith("lineage")
                } else {
                  parity.log.error(errorOf(error))
                }
              }
            )
            break
          case "gesture": {
            // SAFETY: checked against the gesture's schema as it arrived.
            const gesture = event.gesture as Gesture
            people.gesture(from, gesture)

            if (gesture.kind === "move") {
              dragged(from, gesture)
            }

            break
          }

          case "agents":
            agentSeen(from, event.steps)
            // SAFETY: checked against the step's schema as it arrived.
            parity.agents.receive(event.steps as Parameters<WindowParity["agents"]["receive"]>[0], { from })
            break
          case "colors":
            if (from === room.host) {
              applyColors(new Map(event.assigned))

              if (event.agents) {
                applyAgentColors(new Map(event.agents))
              }
            }

            break
          default:
            break
        }
      }
    })

    /** From each of others' changes arriving to the frame that shows it, for `room.latency`. */
    let changeToScreen: number[] = []

    // Someone's drag follows their pointer as it's drawn, on every frame while it's on its way, unless held for a write.
    let dragFrame: number | undefined
    const heldForWrite = new Set<string>()

    const drawDrags = () => {
      dragFrame ??= requestAnimationFrame((now) => {
        dragFrame = undefined
        let moving = false

        for (const [from, preview] of previews) {
          if (heldForWrite.has(from)) {
            continue
          }

          const gesture = people.person(from)?.gesture
          const pointer = people.pointerAt(from, now)

          if (gesture?.kind === "move" && pointer) {
            preview.update(dragItems(gesture, pointer))
            moving ||= people.trail(from)?.moving === true
          }
        }

        if (moving) {
          drawDrags()
        }
      })
    }

    const askMissing = () => {
      if (opened()) {
        room.askMissing(toBase64(parity.sync.version()))
      }
    }

    // What core asks before the project opens: from files when this copy hosts, or on the host's document.
    const opening = parity.sync.onOpen(async () => {
      await ready

      if (room.host === peer) {
        parity.telemetry.record("room.joined", {
          host: true,
          peers: room.peers.length,
          waitMs: Math.round(performance.now() - began)
        })

        return { from: "files" }
      }

      const { snapshot, lineage } = await room.askSnapshot(snapshotWaitMs)
      parity.telemetry.record("room.joined", {
        host: false,
        peers: room.peers.length,
        waitMs: Math.round(performance.now() - began)
      })

      return { from: "snapshot", snapshot: fromBase64(snapshot), lineage }
    })

    parity.subscriptions.push(
      opening,
      parity.sync.onLocalChanges((bytes) => room.send({ kind: "changes", bytes: toBase64(bytes) })),
      // What this person is doing, and what this copy's agents do.
      parity.presence.onPointer((pointer) => {
        // Stamped with when it was there, so others draw it in time however unevenly it reaches them.
        mine.pointer = { at: pointer.at, over: pointer.over, t: pointer.t ?? performance.now() }
        tellMine()
      }),
      parity.presence.onGesture((gesture) => room.send({ kind: "gesture", gesture: copyOf(gesture) })),
      // Signing in or out changes the name others see.
      parity.presence.onSelfChange(() => tellMine()),
      parity.presence.onViewing((viewing) => {
        mine.viewing = viewing
        tellMine()
      }),
      parity.selection.onChange((refs: NodeRef[]) => {
        mine.selection = refs
        tellMine()
      }),
      parity.camera.onChange((view) => {
        mine.camera = view
        tellMine()
      }),
      parity.agents.onActivity((steps, from) => {
        // Only this copy's own: steps passed in from the room carry their `from`, so none goes back.
        if (from === undefined) {
          agentSeen(peer, steps)
          room.send({ kind: "agents", steps })
        }
      }),
      // Everyone else, drawn with presence-ui.
      parity.canvas.layer(
        { id: "multiplayer.selections", space: "page", order: "overDesigns" },
        <>
          <Selections people={people} />
          <Marquees people={people} />
        </>
      ),
      parity.canvas.layer(
        { id: "multiplayer.pointers", space: "page", order: "overSelection" },
        <Pointers people={people} />
      ),
      parity.canvas.layer(
        { id: "multiplayer.people", space: "screen", order: "edge", placement: "topRight" },
        <Faces
          people={people}
          you={{
            peer,
            self: () => parity.presence.self,
            onSelfChange: (listener) => {
              const listening = parity.presence.onSelfChange(listener)

              return () => listening.dispose()
            }
          }}
          follow={follow}
          camera={parity.camera}
        />
      ),
      parity.canvas.layer(
        { id: "multiplayer.following", space: "screen", order: "edge", placement: "fill" },
        <Following people={people} follow={follow} />
      )
    )

    // `room.latency`, once a minute while in the room.
    const latency = setInterval(() => {
      const stats = room.takeStats()
      const presenceLate = people.takeLate()
      const sorted = stats.rtts.toSorted((a, b) => a - b)
      const gaps = stats.presenceGaps.toSorted((a, b) => a - b)
      const shown = changeToScreen.toSorted((a, b) => a - b)
      changeToScreen = []
      // Kept a minute for `room-perf.ts`, whose observer has them by then, so they don't pile up.
      performance.clearMeasures("room.changeToScreen")

      if (sorted.length === 0 && stats.presenceReceived === 0 && shown.length === 0) {
        return
      }

      const at = (values: number[], share: number) =>
        Math.round(values[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0)

      parity.telemetry.record("room.latency", {
        rttP50Ms: at(sorted, 0.5),
        rttP95Ms: at(sorted, 0.95),
        rttMaxMs: Math.round(sorted.at(-1) ?? 0),
        presenceGapP50Ms: at(gaps, 0.5),
        presenceGapP95Ms: at(gaps, 0.95),
        presenceGapMaxMs: Math.round(gaps.at(-1) ?? 0),
        presenceLate,
        presenceSent: stats.presenceSent,
        presenceReceived: stats.presenceReceived,
        changesReceived: shown.length,
        changeToScreenP50Ms: at(shown, 0.5),
        changeToScreenP95Ms: at(shown, 0.95),
        changeToScreenMaxMs: Math.round(shown.at(-1) ?? 0),
        queueMax: stats.queueMax,
        batchesInFlightMax: stats.batchesInFlightMax
      })
    }, minuteMs)

    let stopped = false

    function stop() {
      if (stopped) {
        return
      }

      stopped = true
      clearInterval(latency)

      if (dragFrame !== undefined) {
        cancelAnimationFrame(dragFrame)
      }

      hosting.dispose()
      stopRoom()
      follow.dispose()

      for (const preview of previews.values()) {
        preview.dispose()
      }

      previews.clear()
      room.leave()
      parity.telemetry.record("room.left", { why: leftWhy, durationMs: Math.round(performance.now() - began) })
    }

    parity.subscriptions.push({ dispose: stop })
    tellMine()

    return {}
  }
})

/** Joins once the Node half has the relay running, starting it if no copy has; the relay may run already regardless. */
async function joinWhenRelayRuns(parity: WindowParity, room: Room): Promise<void> {
  try {
    await halfReady(parity)
    const result = await parity.host.api<RelayApi>().ensureRelay(relayPort)
    parity.telemetry.record("room.relayStarted", { result, port: relayPort })
  } catch (error) {
    parity.log.warn(`Couldn't start the relay, so this copy joins another copy's: ${errorOf(error).message}`)
  }

  // With no relay to join, the project opens alone rather than waiting for the seam to give up.
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      room.welcomed(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("No relay answered, so the project opens alone")), welcomeWaitMs)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Resolves once the Node half is ready, or rejects after a while. */
function halfReady(parity: WindowParity): Promise<void> {
  if (parity.host.state === "ready") {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listening.dispose()
      reject(new Error("The Node half didn't start"))
    }, halfWaitMs)

    const listening = parity.host.onStateChange((state) => {
      if (state === "ready") {
        clearTimeout(timer)
        listening.dispose()
        resolve()
      }
    })
  })
}

/** Runs `run` once the next frame has been drawn: a task queued from that frame's callback runs after its paint. */
function afterPaint(run: () => void): void {
  requestAnimationFrame(() => {
    setTimeout(run, 0)
  })
}

/** A gesture as plain data, to send. */
function copyOf(gesture: Gesture): Gesture {
  return structuredClone(gesture)
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
function errorOf(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown))
}
