import { dirname, join, resolve } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { changesLockfiles, lockfileFolders } from "./lockfile.ts"

const workspace = resolve("/work/shop")
const app = join(workspace, "apps", "web")

describe("which lockfile changes count", () => {
  it("follows the folders from the root up to the one the lockfiles were found in", () => {
    expect(lockfileFolders(app, ["../../package-lock.json"])).toEqual([app, dirname(app), workspace])
    expect(lockfileFolders(app, ["pnpm-lock.yaml"])).toEqual([app])
  })

  it("follows every folder to the top when no lockfile was found", () => {
    const folders = lockfileFolders(app, [])
    expect(folders.slice(0, 3)).toEqual([app, dirname(app), workspace])
    expect(folders.at(-1)).toBe(dirname(folders.at(-1) ?? ""))
  })

  it("counts a lockfile that appears beside the one found, or nearer the root", () => {
    const folders = lockfileFolders(app, ["../../package-lock.json"])
    expect(changesLockfiles(join(workspace, "npm-shrinkwrap.json"), folders)).toBe(true)
    expect(changesLockfiles(join(workspace, "package-lock.json"), folders)).toBe(true)
    expect(changesLockfiles(join(app, "pnpm-lock.yaml"), folders)).toBe(true)
    expect(changesLockfiles(join(dirname(app), "yarn.lock"), folders)).toBe(true)
  })

  it("leaves out other files, and lockfiles above the one found or in other folders", () => {
    const folders = lockfileFolders(app, ["../../package-lock.json"])
    expect(changesLockfiles(join(workspace, "package.json"), folders)).toBe(false)
    expect(changesLockfiles(join(dirname(workspace), "yarn.lock"), folders)).toBe(false)
    expect(changesLockfiles(join(app, "src", "pnpm-lock.yaml"), folders)).toBe(false)
    expect(changesLockfiles(join(workspace, "apps", "admin", "pnpm-lock.yaml"), folders)).toBe(false)
  })
})
