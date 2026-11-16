import { noTokenEdits } from "@parity-app/editor"
import { applyPlain, type DocState } from "../apply.ts"
import { Recorder } from "../recorder.ts"
import type { DocBackend, DocProvider, OpenOptions } from "../types.ts"

/**
 * A provider without merging, holding the plain values and applying each operation to them directly: what the shared
 * tests run against in this package, and what the local provider builds on.
 */
export const plainProvider: DocProvider = {
  name: "plain",
  sync: false,
  open: openPlain
}

function openPlain(options: OpenOptions): DocBackend {
  let state: DocState = {
    files: new Map(options.files.map((file) => [file.path, file.document])),
    main: options.main,
    modes: options.modes,
    tokens: noTokenEdits
  }

  let count = 0
  const version = () => ({ provider: "plain", value: String(count) })

  return {
    provider: "plain",
    sync: false,
    files: () => state.files,
    modes: () => state.modes,
    version,
    apply: (ops) => {
      const recorder = new Recorder()
      state = applyPlain(state, ops, recorder)
      count += 1

      return { ...recorder.change(), version: version() }
    },
    subscribe: () => () => undefined,
    dispose: () => undefined
  }
}
