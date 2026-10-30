import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { runsInApp, tryLock } from "./app-tests.ts"

describe("runsInApp", () => {
  it("counts the app, its packages, the example and the workspace's build files", () => {
    const paths = [
      "apps/desktop/src/renderer/canvas/CanvasEditor.tsx",
      "apps/desktop/e2e/selecting.e2e.ts",
      "packages/builder-vite/src/index.ts",
      "examples/shadcn-vite/src/App.tsx",
      "pnpm-lock.yaml",
      "vite.config.ts"
    ]
    expect(paths.filter((path) => runsInApp(path) !== true)).toEqual([])
  })

  it("leaves out docs, unit tests, CI and the change files", () => {
    const paths = [
      "docs/editor.md",
      "apps/desktop/README.md",
      "packages/core/src/served.test.ts",
      ".github/workflows/ci.yml",
      "change/@parity-app-desktop-1.json",
      "scripts/commits.ts",
      "infra/main.tf"
    ]
    expect(paths.filter((path) => runsInApp(path) !== false)).toEqual([])
  })
})

describe("tryLock", () => {
  const lock = () => join(mkdtempSync(join(tmpdir(), "parity-lock-")), "app-tests.lock")

  it("takes a lock nobody holds, with its process in it and nothing else left in the folder", () => {
    const file = lock()
    expect(tryLock(file)).toBe("taken")
    expect(readFileSync(file, "utf8")).toBe(String(process.pid))
    expect(readdirSync(join(file, ".."))).toEqual(["app-tests.lock"])
  })

  it("names the running process that holds it, and leaves its lock", () => {
    const file = lock()
    writeFileSync(file, String(process.ppid))
    expect(tryLock(file)).toBe(process.ppid)
    expect(readFileSync(file, "utf8")).toBe(String(process.ppid))
  })

  it("takes over a lock whose process has gone", () => {
    const file = lock()
    const gone = spawnSync(process.execPath, ["-e", ""]).pid
    writeFileSync(file, String(gone))
    expect(tryLock(file)).toBe("taken")
    expect(readFileSync(file, "utf8")).toBe(String(process.pid))
    expect(readdirSync(join(file, ".."))).toEqual(["app-tests.lock"])
  })

  it("leaves a lock it can't read a process from", () => {
    const file = lock()
    writeFileSync(file, "")
    expect(tryLock(file)).toBe("unreadable")
    expect(readFileSync(file, "utf8")).toBe("")
  })

  it("fails rather than waiting when the lock's folder is missing", () => {
    expect(() => tryLock(join(tmpdir(), "parity-missing-folder", "app-tests.lock"))).toThrow(/ENOENT/)
  })
})
