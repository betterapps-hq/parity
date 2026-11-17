/*
 * Which copy writes the project's files (PAR-1281): only the one that hosts, so copies don't write the same files over
 * each other. A copy can become host before its document is open, as when the host leaves just after sending the
 * snapshot it opens on; file writes can't be set until then, so they're set from whoever hosts once it's open.
 */

/** What hosting reaches of `parity.sync`. */
export interface HostingSync {
  /** Empty until the document is open. */
  readonly lineage: string
  readonly writesFiles: boolean
  setWritesFiles(writes: boolean): Promise<void>
  /** Waits until the document is open. */
  snapshot(): Promise<Uint8Array>
}

export interface Hosting {
  /** Who hosts may have changed: file writes follow, now or once the document is open. */
  hostChanged(): void
  dispose(): void
}

/** Keeps file writes on while `hosts()` and off otherwise, once the document is open. */
export function fileWritesFollowHost(sync: HostingSync, hosts: () => boolean, failed: (error: Error) => void): Hosting {
  let waiting = false
  let disposed = false

  const match = () => {
    if (disposed || sync.lineage === "" || sync.writesFiles === hosts()) {
      return
    }

    void sync.setWritesFiles(hosts()).catch((error) => failed(errorOf(error)))
  }

  return {
    hostChanged() {
      if (sync.lineage !== "") {
        match()

        return
      }

      if (waiting) {
        return
      }

      // Asked once, for whoever hosts when the document opens. A document that never opens here needs nothing.
      waiting = true
      void sync.snapshot().then(match, () => undefined)
    },
    dispose() {
      disposed = true
    }
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
function errorOf(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown))
}
