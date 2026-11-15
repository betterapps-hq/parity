/**
 * Today's DesignStore under the multiplayer proposal's benchmark (PAR-1109), recorded before the project document
 * replaces it. Run it as a one-off command, with `--expose-gc` for the memory it holds:
 *
 *   NODE_OPTIONS=--expose-gc pnpm exec vp test bench apps/desktop/src/renderer/design-store.bench.ts
 */
import { defaultModeSettings } from "@parity-app/core"
import { benchSession } from "@parity-app/multiplayer/testing"
import { DesignStore } from "./design-store.ts"

benchSession((files) => {
  const store = new DesignStore(files, defaultModeSettings, files[0]!.path, {
    saveDocument: () => Promise.resolve(),
    autosave: () => false
  })

  return {
    updateContainer: (key, label, update, gesture) =>
      store.updateContainer(key, label, update, gesture ? { gesture } : undefined),
    addContainer: (path, container) => store.addContainer(path, container),
    beginGesture: () => store.beginGesture(),
    endGesture: (gesture) => {
      store.endGesture(gesture)
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    // The main file carries the modes only when they aren't the defaults, which they are here.
    fileContent: (path) => store.getDocuments().find((file) => file.path === path)?.document
  }
})
