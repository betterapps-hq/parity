import type { ChangeDetector } from "@parity-app/change-detection"
import { describe, expect, it } from "vite-plus/test"
import { ProjectChangeDetectors } from "./change-detectors.ts"

/** A detector for the roots in `counts`, each changed in `files`, whose baseline moves when `move` is called. */
function detector(id: string, counts: string[], files: string[]) {
  const watching = new Set<() => void>()

  const made: ChangeDetector = {
    id,
    name: id,
    detect: async (root) => counts.includes(root),
    changedFiles: async () => new Set(files),
    watch: async (_root, moved) => {
      watching.add(moved)

      return () => watching.delete(moved)
    }
  }

  return { made, move: () => watching.forEach((moved) => moved()), watchers: () => watching.size }
}

describe("ProjectChangeDetectors (PAR-1074)", () => {
  it("counts a project with the first detector that can, and none when none can", async () => {
    const git = detector("git", ["/shop"], ["src/badge.tsx"])
    const saved = detector("saved", ["/shop", "/blog"], ["src/post.tsx"])
    const detectors = new ProjectChangeDetectors([git.made, saved.made], () => undefined)

    expect(await detectors.changedFiles("shop", "/shop")).toEqual(new Set(["src/badge.tsx"]))
    expect(await detectors.changedFiles("blog", "/blog")).toEqual(new Set(["src/post.tsx"]))
    expect(await detectors.changedFiles("notes", "/notes")).toBeUndefined()
  })

  it("tells when the picked detector's baseline moves, watching once, until the project's forgotten", async () => {
    const git = detector("git", ["/shop"], [])
    const moved: string[] = []
    const detectors = new ProjectChangeDetectors([git.made], (projectId) => moved.push(projectId))

    await detectors.changedFiles("shop", "/shop")
    await detectors.changedFiles("shop", "/shop")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(git.watchers()).toBe(1)

    git.move()
    expect(moved).toEqual(["shop"])

    await detectors.forget("shop")
    expect(git.watchers()).toBe(0)
  })
})
