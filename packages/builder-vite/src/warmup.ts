interface Module {
  url: string
  /**
   * The imports Vite's import analysis found in the module's code, which the browser fetches as it loads it. Vite has set
   * this since 5.1 without declaring it. `importedModules` is wider: it is what the module is rebuilt for, including
   * every file a plugin watches, such as each one Tailwind scans for class names, config files and type declarations
   * among them.
   */
  staticImportedUrls?: ReadonlySet<string>
}

interface Optimizer {
  init(): Promise<void>
  scanProcessing?: Promise<void>
  isOptimizedDepUrl(url: string): boolean
  metadata: {
    optimized: Record<string, { processing?: Promise<void> }>
    discovered: Record<string, { processing?: Promise<void> }>
  }
}

/** The Vite environment methods used by startup; its one-shot crawl-end promise is deliberately not a barrier. */
interface Client {
  depsOptimizer?: Optimizer
  transformRequest(url: string): Promise<unknown>
  moduleGraph: {
    getModuleByUrl(url: string): Promise<Module | undefined>
    invalidateAll(): void
  }
}

/**
 * Explicitly walk the graph, awaiting each transform before reading its children. Vite's background static warmups
 * share these same transforms, so no recursive child can still be discovering a dependency when the queue drains.
 * Await each resulting optimizer batch, then invalidate transforms made before its final hashes were committed.
 */
export async function warmGuestGraph(client: Client, roots: string[]): Promise<void> {
  await client.depsOptimizer?.init()
  await client.depsOptimizer?.scanProcessing
  const seen = new Set<string>()
  const queue = [...roots]
  for (let index = 0; index < queue.length; index++) {
    const url = queue[index]!
    if (seen.has(url) || client.depsOptimizer?.isOptimizedDepUrl(url)) continue
    seen.add(url)
    try {
      await client.transformRequest(url)
      const module = await client.moduleGraph.getModuleByUrl(url)
      // Only what the browser will import: a watched file transformed as a module sends its Node-only imports to the
      // optimizer, which then tries to bundle the project's build tools.
      for (const child of module?.staticImportedUrls ?? []) queue.push(child)
    } catch {
      // Optional project modules keep their own load errors, as they do when the browser requests them.
    }
  }
  while (client.depsOptimizer) {
    const { optimized, discovered } = client.depsOptimizer.metadata
    const batches = Object.values({ ...optimized, ...discovered })
      .map((dependency) => dependency.processing)
      .filter((pending) => pending !== undefined)
    if (!batches.length) break
    await Promise.all(batches)
  }
  client.moduleGraph.invalidateAll()
}
