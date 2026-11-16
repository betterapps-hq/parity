import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RecoveryCopy } from "@parity-app/editor"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { createRecovery, recoveryFile } from "./recovery.ts"

let folder: string

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-recovery-"))
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

const copy: RecoveryCopy = {
  version: 1,
  keptAt: 1,
  documents: [{ path: "shop.par", document: { version: 4, containers: [] } }],
  tokens: []
}

describe("createRecovery", () => {
  it("keeps a project's copy in a file of its own, outside the project, and reads it back", async () => {
    const recovery = createRecovery(folder)
    await recovery.keep("D:/shop", copy)

    expect(await recovery.read("D:/shop")).toEqual(copy)
    expect(await recovery.read("D:/blog")).toBeUndefined()
    expect(await readdir(folder)).toEqual([recoveryFile(folder, "D:/shop").slice(folder.length + 1)])
  })

  it("removes the copy when there's none to keep", async () => {
    const recovery = createRecovery(folder)
    await recovery.keep("D:/shop", copy)
    await recovery.keep("D:/shop", undefined)

    expect(await recovery.read("D:/shop")).toBeUndefined()
    expect(await readdir(folder)).toEqual([])
  })

  it("reads nothing from a copy cut short or kept by another version", async () => {
    const recovery = createRecovery(folder)
    await writeFile(recoveryFile(folder, "D:/shop"), '{"version":1,"keptAt":')
    await writeFile(recoveryFile(folder, "D:/blog"), JSON.stringify({ ...copy, version: 9 }))

    expect(await recovery.read("D:/shop")).toBeUndefined()
    expect(await recovery.read("D:/blog")).toBeUndefined()
  })

  it("keeps nothing without a folder", async () => {
    const recovery = createRecovery(undefined)
    await recovery.keep("D:/shop", copy)

    expect(await recovery.read("D:/shop")).toBeUndefined()
  })
})
