import { defaultModeSettings } from "@parity-app/core"
import {
  containerEntries,
  createProjectDoc,
  type DocOp,
  noteEntries,
  type ProjectDoc,
  referenceEntries
} from "@parity-app/multiplayer"
import { firstChild, firstText, generateProject, type ProjectSize } from "@parity-app/multiplayer/testing"
import { type LoroBackend, openLoro, type ReceiveTimings } from "./backend.ts"

/*
 * One remote change, as the copy that receives it applies it, split by stage (PAR-1325), for the benchmark and the CI
 * budgets. One person's copy makes an edit; the other's takes in the bytes Loro sends for it. Decoding the room's
 * message is the extension's and measured there (`protocol.bench.ts`); drawing it, `CanvasEditor.sync()` and React, is
 * the app's and measured in the running app (`apps/desktop/scripts/room-perf.ts`).
 */

/** The edits measured: the ones people make most while others watch. */
export const remoteEdits = ["board drag", "style change", "typing", "token change"] as const

export type RemoteEdit = (typeof remoteEdits)[number]

/** What one remote change took on the receiving copy, in milliseconds. */
export interface RemoteStages extends ReceiveTimings {
  /** `ProjectDoc` taking the backend's change: owners, undo, and telling its own subscribers. */
  projectDocMs: number
  /** Reading the designs, notes and references back as the canvas does on each change. */
  lookupsMs: number
  /** Everything above. */
  totalMs: number
}

export interface RemoteScenario {
  /** Makes the next edit in the sending copy, returning the bytes Loro sends for it. */
  edit(): Uint8Array
  /** Takes the bytes in on the receiving copy, timing each stage. */
  receive(bytes: Uint8Array): RemoteStages
  dispose(): void
}

/** Two copies of a generated project, one sending `kind` edits to a design in the middle of it, the other receiving. */
export function remoteScenario(size: ProjectSize, kind: RemoteEdit): RemoteScenario {
  const files = generateProject(size)
  const main = files[0]!.path
  const designs = files.flatMap((file) => file.document.containers.map((container) => ({ path: file.path, container })))
  // A screen in the middle of the project, so nothing is first or last.
  const target = designs[Math.floor(designs.length / 2)]!
  const key = `${target.path}#${target.container.id}`
  const layer = firstChild(target.container)
  const text = firstText(target.container)

  const sender = openLoro({ files, main, modes: defaultModeSettings })
  const receiver = openLoro({ files, main, modes: defaultModeSettings }, sender.snapshot())
  const sending = createProjectDoc(sender, { undoLimit: 200, main })
  const receiving = createProjectDoc(receiver, { undoLimit: 200, main })

  let sent: Uint8Array | undefined

  const stopSending = sender.subscribeLocalUpdates((bytes) => {
    sent = bytes
  })

  let count = 0

  const ops = (): DocOp[] => {
    count += 1

    switch (kind) {
      case "board drag": {
        const position = sending.design(key)!.position

        return [{ op: "setDesign", design: key, path: ["position"], value: { x: position.x + 1, y: position.y } }]
      }

      case "style change":
        return [{ op: "set", design: key, node: layer, path: ["style", "gap"], value: { step: 10 + (count % 2) } }]
      case "typing":
        return [{ op: "editText", design: key, node: text, edit: { kind: "splice", at: 0, remove: 0, insert: "x" } }]
      case "token change":
        return [
          {
            op: "setTokens",
            tokens: new Map([["primary light", { name: "primary", theme: "light", value: `#0000${count % 100}` }]])
          }
        ]
      default:
        throw new Error(`No edit for ${String(kind)}`)
    }
  }

  return {
    edit() {
      sent = undefined
      const result = sending.transact(kind, ops(), { origin: "edit" })

      if (!result.ok || !sent) {
        throw new Error(`The ${kind} sent nothing: ${JSON.stringify(result)}`)
      }

      return sent
    },
    receive: (bytes) => receiveTimed(receiver, receiving, bytes),
    dispose() {
      stopSending()
      // Each document disposes its backend.
      sending.dispose()
      receiving.dispose()
    }
  }
}

function receiveTimed(backend: LoroBackend, doc: ProjectDoc, bytes: Uint8Array): RemoteStages {
  const began = performance.now()
  // `ProjectDoc` hears the backend's change before `receive` returns, so its share is what's left after the backend's.
  backend.receive(bytes)
  const received = performance.now()
  const { importMs, readMs } = backend.timings()
  containerEntries(doc)
  noteEntries(doc)
  referenceEntries(doc)
  const looked = performance.now()

  return {
    importMs,
    readMs,
    projectDocMs: Math.max(0, received - began - importMs - readMs),
    lookupsMs: looked - received,
    totalMs: looked - began
  }
}
