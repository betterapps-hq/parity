import { describe, expect, it } from "vite-plus/test"
import { fileWritesFollowHost, type HostingSync } from "./hosting.ts"

/** `parity.sync` as hosting reaches it: a document that opens when told to, and the file writes asked for. */
function standIn(writesFiles: boolean) {
  const asked: boolean[] = []
  let open: () => void = () => undefined
  const opened = new Promise<void>((resolve) => (open = resolve))

  const sync: HostingSync & { lineage: string; writesFiles: boolean } = {
    lineage: "",
    writesFiles,
    setWritesFiles(writes) {
      asked.push(writes)
      sync.writesFiles = writes

      return Promise.resolve()
    },
    snapshot: () => opened.then(() => new Uint8Array())
  }

  return {
    sync,
    asked,
    open: async () => {
      sync.lineage = "lineage"
      open()
      await opened
      await Promise.resolve()
    }
  }
}

describe("fileWritesFollowHost", () => {
  it("turns file writes on for a copy that became host before its document opened, once it's open", async () => {
    // Opened on the host's snapshot, so file writes start off; the host left before the document was open.
    const { sync, asked, open } = standIn(false)
    let hosts = false

    const hosting = fileWritesFollowHost(
      sync,
      () => hosts,
      () => undefined
    )

    hosts = true
    hosting.hostChanged()
    hosting.hostChanged()
    expect(asked).toEqual([])

    await open()
    expect(asked).toEqual([true])
  })

  it("leaves file writes alone when whoever hosts once it's open is who it opened as", async () => {
    const { sync, asked, open } = standIn(false)
    let hosts = true

    const hosting = fileWritesFollowHost(
      sync,
      () => hosts,
      () => undefined
    )

    hosting.hostChanged()
    hosts = false
    await open()
    expect(asked).toEqual([])
  })

  it("follows the host straight away once the document is open, and stops when disposed", async () => {
    const { sync, asked, open } = standIn(true)
    let hosts = true

    const hosting = fileWritesFollowHost(
      sync,
      () => hosts,
      () => undefined
    )

    await open()

    hosts = false
    hosting.hostChanged()
    hosts = true
    hosting.hostChanged()
    expect(asked).toEqual([false, true])

    hosting.dispose()
    hosts = false
    hosting.hostChanged()
    expect(asked).toEqual([false, true])
  })

  it("says when file writes couldn't be set", async () => {
    const { sync, open } = standIn(false)
    sync.setWritesFiles = () => Promise.reject(new Error("disk full"))
    const failed: string[] = []

    const hosting = fileWritesFollowHost(
      sync,
      () => true,
      (error) => failed.push(error.message)
    )

    await open()
    hosting.hostChanged()
    await Promise.resolve()
    await Promise.resolve()
    expect(failed).toEqual(["disk full"])
  })
})
