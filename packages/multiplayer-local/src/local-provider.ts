import { noTokenEdits } from "@parity-app/editor"
import {
  applyPlain,
  type BackendChange,
  type DocBackend,
  type DocOp,
  type DocProvider,
  type DocState,
  type OpenOptions,
  Recorder
} from "@parity-app/multiplayer"

/*
 * One person's project document, without merging and without Loro (docs/proposals/multiplayer.md:
 * @parity-app/multiplayer-local). It holds the plain values and changes them directly: each operation copies the layer
 * it touches and those above it, up to its design and file, so every other layer, design and file stays the same
 * object. Checks, undo and gestures are ProjectDoc's; this applies the operations it's sent and says what they changed.
 */

/** One person's document, without merging: `name` is `local`, `sync` is false. */
export const localProvider: DocProvider = {
  name: "local",
  sync: false,
  open: openLocal
}

function openLocal(options: OpenOptions): DocBackend {
  // Drawn files are drawn from code by each window, and kept here like any other: nothing is shared.
  let state: DocState = {
    files: new Map(options.files.map((file) => [file.path, file.document])),
    main: options.main,
    modes: options.modes,
    tokens: options.tokens ?? noTokenEdits
  }

  let commits = 0
  let disposed = false
  const version = () => ({ provider: "local", value: String(commits) })

  const apply = (ops: readonly DocOp[]): BackendChange => {
    if (disposed) {
      throw new Error("The local document was disposed")
    }

    const recorder = new Recorder()
    // Applied to a copy first, so operations that fail part way leave the state as it was.
    state = applyPlain(state, ops, recorder)
    commits += 1

    return { ...recorder.change(), version: version() }
  }

  return {
    provider: "local",
    sync: false,
    files: () => state.files,
    modes: () => state.modes,
    tokens: () => state.tokens,
    version,
    apply,
    // Nobody else changes it.
    subscribe: () => () => undefined,
    dispose: () => {
      disposed = true
    }
  }
}
