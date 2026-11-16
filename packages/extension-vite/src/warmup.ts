import type { TransformResult } from "vite"

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

/** The dependencies Vite's optimizer has bundled and found, each with the batch still bundling it. */
export interface OptimizerMetadata {
  optimized: Record<string, { processing?: Promise<void> }>
  discovered: Record<string, { processing?: Promise<void> }>
}

interface Optimizer {
  init(): Promise<void>
  scanProcessing?: Promise<void>
  isOptimizedDepUrl(url: string): boolean
  metadata: OptimizerMetadata
}

/** The Vite environment methods used by startup; its one-shot crawl-end promise is deliberately not a barrier. */
interface Client {
  depsOptimizer?: Optimizer
  transformRequest(url: string): Promise<TransformResult | null>
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

    if (seen.has(url) || client.depsOptimizer?.isOptimizedDepUrl(url)) {
      continue
    }

    seen.add(url)

    try {
      await client.transformRequest(url)
      const module = await client.moduleGraph.getModuleByUrl(url)

      // Only what the browser will import: a watched file transformed as a module sends its Node-only imports to the
      // optimizer, which then tries to bundle the project's build tools.
      for (const child of module?.staticImportedUrls ?? []) {
        queue.push(child)
      }
    } catch {
      // Optional project modules keep their own load errors, as they do when the browser requests them.
    }
  }

  await optimizerBatches(client.depsOptimizer, settledLimit)
  client.moduleGraph.invalidateAll()
}

/**
 * How long the optimizer may list batches that have all settled before the warm-up gives up: longer than it takes to
 * bundle a large app's dependencies again.
 */
const settledLimit = 120_000

/**
 * Waits until the optimizer lists no batch as still bundling. Vite can resolve a batch without bundling some of its
 * dependencies, which keep the settled batch until a later run, scheduled on a timer, bundles them (PAR-1223). Waiting
 * on settled batches again only runs microtasks, so that timer would never fire: once every batch listed has settled,
 * this waits on timers instead, and fails after `limit` milliseconds of that.
 */
export async function optimizerBatches(
  optimizer: { metadata: OptimizerMetadata } | undefined,
  limit: number
): Promise<void> {
  const settled = new Set<Promise<void>>()
  let stalledSince: number | undefined

  while (optimizer) {
    const listed = Object.entries({ ...optimizer.metadata.optimized, ...optimizer.metadata.discovered }).filter(
      (entry): entry is [string, { processing: Promise<void> }] => entry[1].processing !== undefined
    )

    if (!listed.length) {
      return
    }

    const unsettled = listed.map(([, dependency]) => dependency.processing).filter((batch) => !settled.has(batch))

    if (unsettled.length) {
      stalledSince = undefined
      await Promise.all(unsettled)

      for (const batch of unsettled) {
        settled.add(batch)
      }

      continue
    }

    stalledSince ??= performance.now()

    if (performance.now() - stalledSince >= limit) {
      const names = listed.map(([name]) => name).join(", ")

      throw new Error(`Vite's dependency optimizer didn't finish bundling ${names} in ${Math.round(limit / 1000)} s`)
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
