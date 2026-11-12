import type * as Fs from "node:fs/promises"
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { projectFileChange } from "@parity-app/project"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { removeProjectFile, writeProjectFile } from "./project-files.ts"

/** A write a test stops partway: half its bytes go to disk, then it waits for `go` and fails or carries on. */
interface Stop {
  partial?: string
  halfway: () => void
  go: Promise<"fail" | "finish">
}

/** The write the next `writeFile` stops at, if any. */
interface Interrupt {
  next?: Stop
}

const interrupt = vi.hoisted(() => {
  const holder: Interrupt = {}

  return holder
})

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof Fs>()

  return {
    ...fs,
    writeFile: async (file: string, content: string | Uint8Array, options?: Parameters<typeof Fs.writeFile>[2]) => {
      const stop = interrupt.next

      if (!stop) {
        return fs.writeFile(file, content, options)
      }

      interrupt.next = undefined
      stop.partial = file
      await fs.writeFile(file, content.slice(0, content.length / 2))
      stop.halfway()

      if ((await stop.go) === "fail") {
        throw new Error("The disk was pulled out")
      }

      return fs.writeFile(file, content, options)
    }
  }
})

describe("writeProjectFile", () => {
  let folder: string
  let root: string

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "parity-project-files-"))
    root = join(folder, "shop")
    await mkdir(root)
  })

  afterEach(async () => {
    interrupt.next = undefined
    await rm(folder, { recursive: true, force: true })
  })

  /** Stops the next write halfway; `release` lets it fail or finish. */
  function stopNextWrite() {
    let release: (how: "fail" | "finish") => void = () => undefined
    let halfway: () => void = () => undefined
    const reached = new Promise<void>((resolve) => (halfway = resolve))
    const go = new Promise<"fail" | "finish">((resolve) => (release = resolve))
    const stop: Stop = { halfway: () => halfway(), go }
    interrupt.next = stop

    return { reached, release: (how: "fail" | "finish") => release(how), stop }
  }

  it("replaces a file, and makes a new one in folders that aren't there yet", async () => {
    await writeFile(join(root, "shop.par"), "old")
    await writeProjectFile(root, "shop.par", "new")
    await writeProjectFile(root, "designs/home.par", new Uint8Array([104, 105]))

    expect(await readFile(join(root, "shop.par"), "utf8")).toBe("new")
    expect(await readFile(join(root, "designs", "home.par"), "utf8")).toBe("hi")
    expect((await readdir(root)).sort()).toEqual(["designs", "shop.par"])
  })

  it("leaves the old file when a save is cut off, with nothing beside it", async () => {
    await writeFile(join(root, "shop.par"), "the designs as they were")
    const stop = stopNextWrite()
    const saving = writeProjectFile(root, "shop.par", "the designs as they are now")
    await stop.reached
    stop.release("fail")

    await expect(saving).rejects.toThrow("The disk was pulled out")
    expect(await readFile(join(root, "shop.par"), "utf8")).toBe("the designs as they were")
    expect(await readdir(root)).toEqual(["shop.par"])
  })

  it("never shows a reader half a write, under a name the watcher passes over", async () => {
    await writeFile(join(root, "shop.par"), "the designs as they were")
    const stop = stopNextWrite()
    const saving = writeProjectFile(root, "shop.par", "the designs as they are now")
    await stop.reached

    expect(await readFile(join(root, "shop.par"), "utf8")).toBe("the designs as they were")
    expect(stop.stop.partial).toBeDefined()
    const partial = relative(root, stop.stop.partial ?? "").replaceAll("\\", "/")
    expect(projectFileChange(partial, { componentExtensions: [".tsx"], configInput: false })).toBeUndefined()

    stop.release("finish")
    await saving

    expect(await readFile(join(root, "shop.par"), "utf8")).toBe("the designs as they are now")
  })

  it.each(["../shop-old/shop.par", "..", "."])("refuses %s", async (path) => {
    await expect(writeProjectFile(root, path, "x")).rejects.toThrow("outside the project")
  })

  describe("through symlinks", () => {
    const linked = async (target: string, link: string, kind: "file" | "junction") => {
      try {
        await symlink(target, link, kind)

        return true
      } catch {
        // Windows makes file symlinks only in developer mode; folders link as junctions without it.
        return false
      }
    }

    it("refuses a folder that links outside the project", async () => {
      await mkdir(join(folder, "elsewhere"))
      await symlink(join(folder, "elsewhere"), join(root, "shared"), "junction")

      await expect(writeProjectFile(root, "shared/home.par", "x")).rejects.toThrow("links outside the project")
      await expect(writeProjectFile(root, "shared/new/home.par", "x")).rejects.toThrow("links outside the project")
      expect(await readdir(join(folder, "elsewhere"))).toEqual([])
    })

    it("writes through a folder that leads elsewhere in the project", async () => {
      await mkdir(join(root, "designs"))
      await symlink(join(root, "designs"), join(root, "latest"), "junction")
      await writeProjectFile(root, "latest/home.par", "x")

      expect(await readFile(join(root, "designs", "home.par"), "utf8")).toBe("x")
    })

    it("keeps a symlinked file a symlink, writing the file it leads to", async (context) => {
      await writeFile(join(root, "real.par"), "old")

      if (!(await linked(join(root, "real.par"), join(root, "link.par"), "file"))) {
        context.skip()
      }

      await writeProjectFile(root, "link.par", "new")

      expect(await readFile(join(root, "real.par"), "utf8")).toBe("new")
      expect(await readFile(join(root, "link.par"), "utf8")).toBe("new")
    })

    it("refuses a symlinked file that links outside the project", async (context) => {
      await writeFile(join(folder, "secret.txt"), "kept")

      if (!(await linked(join(folder, "secret.txt"), join(root, "secret.par"), "file"))) {
        context.skip()
      }

      await expect(writeProjectFile(root, "secret.par", "x")).rejects.toThrow("links outside the project")
      expect(await readFile(join(folder, "secret.txt"), "utf8")).toBe("kept")
    })
  })
})

describe("removeProjectFile", () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "parity-project-files-"))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it("removes a file inside, is fine when it's gone, and refuses one outside", async () => {
    const root = join(folder, "shop")
    await mkdir(root)
    await writeFile(join(root, "a.png"), "x")
    await writeFile(join(folder, "b.png"), "x")
    await removeProjectFile(root, "a.png")
    await removeProjectFile(root, "a.png")

    expect(await readdir(root)).toEqual([])
    await expect(removeProjectFile(root, "../b.png")).rejects.toThrow("outside the project")
    expect(await readdir(folder)).toEqual(["b.png", "shop"])
  })
})
