import { describe, expect, it } from "vite-plus/test"
import { type OptimizerMetadata, optimizerBatches, warmGuestGraph } from "./warmup.ts"

function deferred() {
  let resolve: () => void = () => undefined

  const promise = new Promise<void>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

describe("warming the guest graph", () => {
  it("waits for recursive children and every optimizer batch they discover", async () => {
    const childStarted = deferred()
    const childReady = deferred()
    const firstBatch = deferred()
    const secondBatch = deferred()

    const metadata: OptimizerMetadata = {
      browserHash: "before",
      optimized: {},
      discovered: { first: { processing: firstBatch.promise } }
    }

    const optimizer = {
      init: async () => undefined,
      isOptimizedDepUrl: (url: string) => url.startsWith("/optimized/"),
      metadata
    }

    interface Module {
      url: string
      staticImportedUrls: Set<string>
    }

    const child: Module = { url: "/child.js", staticImportedUrls: new Set(["/optimized/react.js"]) }
    const root: Module = { url: "/entry.js", staticImportedUrls: new Set([child.url]) }

    const modules = new Map<string, Module>([
      [root.url, root],
      [child.url, child]
    ])

    const transformed: string[] = []
    let invalidated = false

    const warming = warmGuestGraph(
      {
        depsOptimizer: optimizer,
        async transformRequest(url) {
          transformed.push(url)

          if (url === child.url) {
            childStarted.resolve()
            await childReady.promise
          }

          return null
        },
        moduleGraph: {
          getModuleByUrl: async (url) => modules.get(url),
          invalidateAll: () => {
            invalidated = true
          }
        }
      },
      [root.url]
    )

    await childStarted.promise
    expect(invalidated).toBe(false)
    childReady.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(invalidated).toBe(false)
    // What the first batch bundled changed, so the modules compiled with its hash import a bundle that's gone.
    optimizer.metadata = {
      browserHash: "after",
      optimized: {},
      discovered: { first: { processing: secondBatch.promise } }
    }
    firstBatch.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(invalidated).toBe(false)
    // A committed batch clears its processing entries before resolving.
    optimizer.metadata.discovered = {}
    secondBatch.resolve()
    await warming
    expect(transformed).toEqual([root.url, child.url])
    expect(invalidated).toBe(true)
  })

  it("keeps what it compiled when the optimizer's hash stays the same", async () => {
    const metadata: OptimizerMetadata = {
      browserHash: "same",
      optimized: {},
      discovered: { react: { processing: Promise.resolve() } }
    }

    const optimizer = { init: async () => undefined, isOptimizedDepUrl: () => false, metadata }
    let invalidated = false

    await warmGuestGraph(
      {
        depsOptimizer: optimizer,
        async transformRequest() {
          // The batch bundled more, keeping the hash modules already import it with.
          optimizer.metadata = { browserHash: "same", optimized: { react: {} }, discovered: {} }

          return null
        },
        moduleGraph: {
          getModuleByUrl: async () => undefined,
          invalidateAll: () => {
            invalidated = true
          }
        }
      },
      ["/entry.js"]
    )
    expect(invalidated).toBe(false)
  })

  it("compiles modules side by side, each one's imports as soon as it's compiled", async () => {
    const slow = deferred()
    const started: string[] = []

    const modules = new Map([
      ["/slow.js", { url: "/slow.js", staticImportedUrls: new Set<string>() }],
      ["/fast.js", { url: "/fast.js", staticImportedUrls: new Set(["/child.js"]) }],
      ["/child.js", { url: "/child.js", staticImportedUrls: new Set<string>() }]
    ])

    const warming = warmGuestGraph(
      {
        async transformRequest(url) {
          started.push(url)

          if (url === "/child.js") {
            slow.resolve()
          }

          if (url === "/slow.js") {
            await slow.promise
          }

          return null
        },
        moduleGraph: {
          getModuleByUrl: async (url) => modules.get(url),
          invalidateAll: () => undefined
        }
      },
      ["/slow.js", "/fast.js"]
    )

    // The slow module finishes only once the fast one's import has started compiling.
    await warming
    expect(started).toEqual(["/slow.js", "/fast.js", "/child.js"])
  })

  it("keeps an optional module failure from blocking other project modules", async () => {
    const transformed: string[] = []
    await warmGuestGraph(
      {
        async transformRequest(url) {
          transformed.push(url)

          if (url === "/broken.js") {
            throw new Error("syntax error")
          }

          return null
        },
        moduleGraph: {
          getModuleByUrl: async () => undefined,
          invalidateAll: () => undefined
        }
      },
      ["/broken.js", "/ok.js", "/ok.js"]
    )
    expect(transformed).toEqual(["/broken.js", "/ok.js"])
  })

  it("warms only what the code imports, not the files a plugin watches", async () => {
    // Tailwind lists each file it scans as a stylesheet's dependency; none of them is imported by the browser.
    const modules = new Map([
      ["/src/index.css?inline", { url: "/src/index.css?inline", staticImportedUrls: undefined }],
      ["/src/button.tsx", { url: "/src/button.tsx", staticImportedUrls: new Set(["/src/lib/utils.ts"]) }],
      ["/src/lib/utils.ts", { url: "/src/lib/utils.ts", staticImportedUrls: new Set<string>() }]
    ])

    const transformed: string[] = []
    await warmGuestGraph(
      {
        async transformRequest(url) {
          transformed.push(url)

          return null
        },
        moduleGraph: {
          getModuleByUrl: async (url) => modules.get(url),
          invalidateAll: () => undefined
        }
      },
      ["/src/index.css?inline", "/src/button.tsx"]
    )
    expect(transformed).toEqual(["/src/index.css?inline", "/src/button.tsx", "/src/lib/utils.ts"])
  })
})

describe("waiting for the optimizer's batches", () => {
  // Vite 7 can resolve a batch without bundling some of its dependencies, which keep the settled batch listed until a
  // run it schedules on a timer bundles them (PAR-1223). Awaiting that batch again only ran microtasks, forever.
  it("lets a run scheduled on a timer finish dependencies whose batch has already settled", async () => {
    const metadata: OptimizerMetadata = {
      optimized: { react: {} },
      discovered: { "react-dom": { processing: Promise.resolve() } }
    }

    setTimeout(() => {
      metadata.discovered = {}
      metadata.optimized["react-dom"] = {}
    }, 20)

    await warmGuestGraph(
      {
        depsOptimizer: { init: async () => undefined, isOptimizedDepUrl: () => false, metadata },
        transformRequest: async () => null,
        moduleGraph: {
          getModuleByUrl: async () => undefined,
          invalidateAll: () => undefined
        }
      },
      []
    )
    expect(metadata.optimized["react-dom"]).toBeDefined()
  })

  it("names the dependencies the optimizer never finishes", async () => {
    const metadata: OptimizerMetadata = {
      optimized: {},
      discovered: {
        "react-dom": { processing: Promise.resolve() },
        "react-dom/client": { processing: Promise.resolve() }
      }
    }

    await expect(optimizerBatches({ metadata }, 50)).rejects.toThrow(
      "Vite's dependency optimizer didn't finish bundling react-dom, react-dom/client in 0 s"
    )
  })
})
