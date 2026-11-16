import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { gitDetector } from "./git-detector.ts"

const run = promisify(execFile)

let repo: string

/** Writes a file in the repository by its path from the repository's root. */
async function write(path: string, text: string) {
  await mkdir(dirname(join(repo, path)), { recursive: true })
  await writeFile(join(repo, path), text)
}

/** Runs git in the repository, as a person committing with their own name. */
async function git(...args: string[]) {
  await run("git", ["-c", "user.name=Ada", "-c", "user.email=ada@example.com", ...args], { cwd: repo })
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "parity-committed-"))
  await git("init", "--quiet")
  await write("pnpm-lock.yaml", "lockfileVersion: 9\n")
  await write("apps/shop/src/badge.tsx", "export const Badge = () => null\n")
  await write("apps/shop/src/button.tsx", "export const Button = () => null\n")
  await write("apps/shop/.gitignore", "dist/\n")
  await git("add", ".")
  await git("commit", "--quiet", "-m", "Start")
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe("gitDetector.changedFiles (PAR-1074)", () => {
  it("lists nothing for a project just as committed", async () => {
    expect(await gitDetector.changedFiles(join(repo, "apps/shop"))).toEqual(new Set())
  })

  it("lists edited, staged, deleted and new files from the project's root, and leaves ignored ones out", async () => {
    await write("apps/shop/src/badge.tsx", "export const Badge = () => 'new'\n")
    await write("apps/shop/src/card.tsx", "export const Card = () => null\n")
    await write("apps/shop/dist/index.js", "built\n")
    await rm(join(repo, "apps/shop/src/button.tsx"))
    await write("pnpm-lock.yaml", "lockfileVersion: 9\npackages: {}\n")
    await git("add", "pnpm-lock.yaml")

    expect(await gitDetector.changedFiles(join(repo, "apps/shop"))).toEqual(
      new Set(["src/badge.tsx", "src/button.tsx", "src/card.tsx", "../../pnpm-lock.yaml"])
    )
  })

  it("is unchanged again once a file is put back as committed", async () => {
    await write("apps/shop/src/badge.tsx", "export const Badge = () => 'new'\n")
    await write("apps/shop/src/badge.tsx", "export const Badge = () => null\n")

    expect(await gitDetector.changedFiles(join(repo, "apps/shop"))).toEqual(new Set())
  })

  it("says nothing for a folder outside git", async () => {
    const outside = await mkdtemp(join(tmpdir(), "parity-no-git-"))

    try {
      expect(await gitDetector.changedFiles(outside)).toBeUndefined()
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe("gitDetector.detect (PAR-1074)", () => {
  it("counts a folder inside a repository, and not one outside", async () => {
    const outside = await mkdtemp(join(tmpdir(), "parity-no-git-"))

    try {
      expect(await gitDetector.detect(join(repo, "apps/shop"))).toBe(true)
      expect(await gitDetector.detect(outside)).toBe(false)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe("gitDetector.watch (PAR-1074)", () => {
  it("tells once when a commit moves HEAD, and stops telling once stopped", async () => {
    let moves = 0
    const stop = await gitDetector.watch(join(repo, "apps/shop"), () => moves++)

    await write("apps/shop/src/badge.tsx", "export const Badge = () => 'edited'")
    await git("commit", "--quiet", "-am", "Edit the badge")
    await vi.waitFor(() => expect(moves).toBe(1), { timeout: 4000 })

    stop()
    await git("commit", "--quiet", "--allow-empty", "-m", "Nothing")
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(moves).toBe(1)
  })
})
