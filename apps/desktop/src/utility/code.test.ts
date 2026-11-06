import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { readProjectFile } from "./code.ts"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-code-"))
  await mkdir(join(root, "src", "components"), { recursive: true })
  await writeFile(join(root, "src", "components", "card.tsx"), "export function Card() {}\n")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("reading a project's file for the Code tab", () => {
  it("reads a file by its path from the project's root", async () => {
    await expect(readProjectFile(root, "src/components/card.tsx")).resolves.toEqual({
      text: "export function Card() {}\n"
    })
  })

  it("refuses a file outside the project's folder, or the folder itself", async () => {
    await expect(readProjectFile(join(root, "src"), "../package.json")).rejects.toThrow(
      "../package.json isn't in the project's folder"
    )
    await expect(readProjectFile(root, join(tmpdir(), "elsewhere.tsx"))).rejects.toThrow(
      "isn't in the project's folder"
    )
    await expect(readProjectFile(root, ".")).rejects.toThrow(". isn't in the project's folder")
  })

  it("refuses a file too big to show", async () => {
    await writeFile(join(root, "big.ts"), "x".repeat(1024 * 1024 + 1))
    await expect(readProjectFile(root, "big.ts")).rejects.toThrow("big.ts is too big to show; open it in your editor")
  })
})
