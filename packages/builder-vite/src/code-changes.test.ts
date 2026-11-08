import { describe, expect, it, vi } from "vite-plus/test"
import { type ChangeGraph, gatherChanges, stampChange } from "./code-changes.ts"

interface Module {
  file: string | null
  importers: Set<Module>
  stamp?: number
}

/** A module graph that stamps a module and its importers, however deep, as Vite's does for HMR. */
function graph(...files: string[]) {
  const modules = new Map(files.map((file) => [file, { file, importers: new Set<Module>() } as Module]))
  const imports = (importer: string, imported: string) => modules.get(imported)!.importers.add(modules.get(importer)!)
  const changes: ChangeGraph<Module> = {
    getModulesByFile: (file) => (modules.has(file) ? new Set([modules.get(file)!]) : undefined),
    invalidateModule(module, seen, timestamp, isHmr) {
      if (seen.has(module)) return
      seen.add(module)
      if (isHmr) module.stamp = timestamp
      for (const importer of module.importers) changes.invalidateModule(importer, seen, timestamp, isHmr)
    }
  }
  return { modules, imports, changes }
}

describe("stampChange", () => {
  it("stamps the changed file and all that import it, and gives the component files among them", () => {
    const { modules, imports, changes } = graph(
      "/app/src/icon.tsx",
      "/app/src/button.tsx",
      "/app/src/card.tsx",
      "/app/src/badge.tsx",
      "\0virtual:canvas/guest"
    )
    imports("/app/src/button.tsx", "/app/src/icon.tsx")
    imports("/app/src/card.tsx", "/app/src/button.tsx")
    imports("\0virtual:canvas/guest", "/app/src/card.tsx")
    const components = ["src/button.tsx", "./src/card.tsx", "src/badge.tsx", "src/card.tsx"]
    expect(stampChange(changes, "/app/src/icon.tsx", 9, "/app", components)).toEqual([
      "src/button.tsx",
      "./src/card.tsx",
      "src/card.tsx"
    ])
    expect(modules.get("/app/src/icon.tsx")!.stamp).toBe(9)
    expect(modules.get("\0virtual:canvas/guest")!.stamp).toBe(9)
    expect(modules.get("/app/src/badge.tsx")!.stamp).toBeUndefined()
  })

  it("gives nothing for a file the guest never imported", () => {
    const { changes } = graph("/app/src/card.tsx")
    expect(stampChange(changes, "/app/README.md", 1, "/app", ["src/card.tsx"])).toEqual([])
  })
})

describe("gatherChanges", () => {
  it("sends a burst of saves once, with the latest stamp, and stamps that always go up", () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn<(change: { paths: string[]; stamp: number }) => void>()
      const changes = gatherChanges(send)
      const first = changes.stamp()
      changes.add(["src/card.tsx"])
      const second = changes.stamp()
      changes.add(["src/button.tsx", "src/card.tsx"])
      changes.add([])
      expect(second).toBeGreaterThan(first)
      vi.advanceTimersByTime(100)
      expect(send).toHaveBeenCalledExactlyOnceWith({ paths: ["src/card.tsx", "src/button.tsx"], stamp: second })
    } finally {
      vi.useRealTimers()
    }
  })
})
