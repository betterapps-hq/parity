import { describe, expect, it } from "vite-plus/test"
import { warmGuestGraph } from "./warmup.ts"

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
    const metadata: {
      optimized: Record<string, { processing?: Promise<void> }>
      discovered: Record<string, { processing?: Promise<void> }>
    } = { optimized: {}, discovered: { first: { processing: firstBatch.promise } } }
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
    optimizer.metadata = { optimized: {}, discovered: { first: { processing: secondBatch.promise } } }
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

  it("keeps an optional module failure from blocking other project modules", async () => {
    const transformed: string[] = []
    await warmGuestGraph(
      {
        async transformRequest(url) {
          transformed.push(url)
          if (url === "/broken.js") throw new Error("syntax error")
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
