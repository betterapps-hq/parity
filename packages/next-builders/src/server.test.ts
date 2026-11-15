import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { writeGuestApp } from "./server.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("writing the guest app", () => {
  it("removes the files only some starts write when this one doesn't", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-guest-"))
    roots.push(root)

    const folder = await writeGuestApp(root, [
      { path: "next.config.mjs", text: "first" },
      { path: "postcss.config.mjs", text: "postcss" },
      { path: "tsconfig.json", text: "{}" },
      { path: "app/server-only/0.js", text: "stand-in" },
      { path: "app/server-only/1.js", text: "stand-in" }
    ])

    await writeGuestApp(root, [
      { path: "next.config.mjs", text: "second" },
      { path: "app/server-only/1.js", text: "stand-in" }
    ])

    expect(await readFile(join(folder, "next.config.mjs"), "utf8")).toBe("second")
    expect((await readdir(folder)).sort()).toEqual(["app", "next.config.mjs"])
    expect(await readdir(join(folder, "app/server-only"))).toEqual(["1.js"])
  })
})
