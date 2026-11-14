import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { copyStorageFolder, leftoverCopyFolders } from "./copy-storage.ts"

describe("leftoverCopyFolders", () => {
  let temp: string | undefined

  afterEach(() => temp && rmSync(temp, { recursive: true, force: true }))

  it("finds the folders of copies whose process is gone, and leaves running ones and anything else", () => {
    temp = mkdtempSync(join(tmpdir(), "copy-storage-"))

    for (const name of ["parity-copy-11", "parity-copy-22", "parity-copy-x", "other-33"]) {
      mkdirSync(join(temp, name))
    }

    expect(leftoverCopyFolders(temp, (pid) => pid === 22)).toEqual([copyStorageFolder(temp, 11)])
  })

  it("finds nothing in a folder that isn't there", () => {
    expect(leftoverCopyFolders(join(tmpdir(), "no-such-folder-for-copy-storage"), () => false)).toEqual([])
  })
})
