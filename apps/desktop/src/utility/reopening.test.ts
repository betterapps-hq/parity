import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { startReopening } from "./reopening.ts"

let folder: string
let file: string

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-reopening-"))
  file = join(folder, "open-projects.json")
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(folder, { recursive: true, force: true })
})

/** Opens and closes nothing, saying what it was asked. */
function projects() {
  const asked: string[] = []
  return {
    asked,
    open: (root: string) => {
      asked.push(`open ${root}`)
      return Promise.resolve()
    },
    close: (root: string) => {
      asked.push(`close ${root}`)
      return Promise.resolve()
    }
  }
}

/** Lets the list be read and the opens start. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe("reopening the projects open last time", () => {
  it("opens each project kept, and keeps those a window asks for open", async () => {
    await writeFile(file, JSON.stringify({ roots: ["D:/shop", "D:/blog"] }))
    const service = projects()
    const reopening = startReopening({ file, ...service, waitMs: 60 })
    await settle()
    expect(service.asked).toEqual(["open D:/shop", "open D:/blog"])
    reopening.claim("D:/shop")
    reopening.claim("D:/blog")
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(service.asked).toEqual(["open D:/shop", "open D:/blog"])
  })

  it("closes a project no window asked for in time", async () => {
    await writeFile(file, JSON.stringify({ roots: ["D:/shop", "D:/old"] }))
    const service = projects()
    const reopening = startReopening({ file, ...service, waitMs: 60 })
    await settle()
    reopening.claim("D:/shop")
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(service.asked).toEqual(["open D:/shop", "open D:/old", "close D:/old"])
  })

  it("leaves a project a window asked for before the list was read to the window", async () => {
    await writeFile(file, JSON.stringify({ roots: ["D:/shop"] }))
    const service = projects()
    const reopening = startReopening({ file, ...service, waitMs: 20 })
    reopening.claim("D:/shop")
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(service.asked).toEqual([])
  })

  it("keeps the last list it's given, whole, for the next start", async () => {
    const reopening = startReopening({ file, ...projects() })
    reopening.remember(["D:/shop"])
    reopening.remember(["D:/shop", "D:/blog"])
    await reopening.written()
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ roots: ["D:/shop", "D:/blog"] })
    expect(await readdir(folder)).toEqual(["open-projects.json"])
    const service = projects()
    startReopening({ file, ...service })
    await settle()
    expect(service.asked).toEqual(["open D:/shop", "open D:/blog"])
  })

  it("opens nothing without a list, or with one it can't read", async () => {
    const service = projects()
    startReopening({ file, ...service })
    await writeFile(join(folder, "broken.json"), "{")
    startReopening({ file: join(folder, "broken.json"), ...service })
    startReopening({ file: undefined, ...service }).remember(["D:/shop"])
    await settle()
    expect(service.asked).toEqual([])
    expect(await readdir(folder)).toEqual(["broken.json"])
  })
})
