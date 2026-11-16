/**
 * The multiplayer proposal's benchmark on `ProjectDoc` with `localProvider`, through the functions for callers, next to
 * today's DesignStore (PAR-1111). Run it as a one-off command, with `--expose-gc` for the memory it holds:
 *
 *   NODE_OPTIONS=--expose-gc pnpm exec vp test bench packages/multiplayer-local
 */
import { defaultModeSettings } from "@parity-app/core"
import { addContainer, createProjectDoc, updateContainer } from "@parity-app/multiplayer"
import { benchProvider, benchSession } from "@parity-app/multiplayer/testing"
import { describe } from "vite-plus/test"
import { localProvider } from "./local-provider.ts"

describe("session", () => {
  benchSession((files) => {
    const main = files[0]!.path

    const doc = createProjectDoc(localProvider.open({ files, main, modes: defaultModeSettings }), {
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
  benchProvider(localProvider)
})
