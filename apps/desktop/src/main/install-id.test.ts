import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it } from "vite-plus/test"
import { readInstallId } from "./install-id.ts"

let folder = ""
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-install-"))
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

it("makes an ID on the first run and keeps it for the next", () => {
  const file = join(folder, "install-id")
  const first = readInstallId(file)
  expect(first).toMatch(/^[0-9a-f-]{36}$/)
  expect(readFileSync(file, "utf8")).toBe(first)
  expect(readInstallId(file)).toBe(first)
})

it("makes another when the file holds something else", () => {
  const file = join(folder, "install-id")
  writeFileSync(file, "not an id")
  expect(readInstallId(file)).not.toBe("not an id")
})
