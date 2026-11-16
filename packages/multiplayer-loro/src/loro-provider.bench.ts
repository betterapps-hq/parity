/**
 * The multiplayer proposal's benchmark on `ProjectDoc` with `loroProvider`, through the functions for callers, next to
 * today's DesignStore and the local provider (PAR-1113), with the exchange with a replica that only Loro has. Run it as
 * a one-off command, with `--expose-gc` for the memory it holds:
 *
 *   NODE_OPTIONS=--expose-gc pnpm exec vp test bench packages/multiplayer-loro --testTimeout=600000 \
 *     --execArgv=--external-memory-accounted-in-global-limit
 *
 * Without that V8 flag, Vitest's workers run a full collection each time Loro's WebAssembly memory grows, 800 of them in
 * opening the very large project, which then takes 28 seconds rather than 5. Plain Node doesn't, with or without it.
 * Opening the very large project 20 times takes longer than a test's minute, hence the timeout.
 */
import { defaultModeSettings } from "@parity-app/core"
import {
  addContainer,
  createProjectDoc,
  type DocBackend,
  type DocProvider,
  updateContainer
} from "@parity-app/multiplayer"
import { benchProvider, benchSession, type ReplicaPair } from "@parity-app/multiplayer/testing"
import { describe } from "vite-plus/test"
import { loroProvider, loroReplicas } from "./loro-provider.ts"

/*
 * The bench opens a session for each scenario and never closes it. Loro's documents live in WebAssembly memory, which
 * the garbage collector doesn't see, so left open they fill it within a few opens of the very large project. Each open
 * here releases the one before, as the bench only ever uses the latest.
 */
let held: DocBackend[] = []

const release = () => {
  for (const backend of held) {
    backend.dispose()
  }

  held = []
}

const provider: DocProvider = {
  ...loroProvider,
  open: (options) => {
    release()
    const backend = loroProvider.open(options)
    held = [backend]

    return backend
  }
}

const replicas: ReplicaPair = {
  open: (options) => {
    release()
    const pair = loroReplicas.open(options)
    held = [pair.a, pair.b]

    return pair
  }
}

describe("session", () => {
  benchSession((files) => {
    const main = files[0]!.path

    const doc = createProjectDoc(provider.open({ files, main, modes: defaultModeSettings }), {
      // DesignStore's limit, so the heap compares.
      undoLimit: 200,
      main
    })

    return {
      updateContainer: (key, label, update, gesture) => {
        const result = updateContainer(doc, key, label, update, gesture ? { gesture } : undefined)

        // A refused edit costs next to nothing, so timing one would flatter the numbers.
        if (!result.ok) {
          throw new Error(`${label} was refused: ${JSON.stringify(result.problem)}`)
        }
      },
      addContainer: (path, container) => addContainer(doc, path, container),
      beginGesture: () => doc.beginGesture(),
      endGesture: (gesture) => {
        doc.endGesture(gesture)
      },
      undo: () => {
        doc.undo()
      },
      redo: () => {
        doc.redo()
      },
      // The main file carries the modes only when they aren't the defaults, which they are here.
      fileContent: (path) => doc.file(path)
    }
  })
})

describe("provider", () => {
  benchProvider(provider, { replicas })
})
