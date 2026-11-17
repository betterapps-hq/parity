import type { PageHydration } from "@parity-app/extension/page"

/*
 * React's hydration module (docs/proposals/route-frames.md, PAR-1260): it says when the app's page has hydrated, from
 * inside the page. React tells `__REACT_DEVTOOLS_GLOBAL_HOOK__` of every commit, when there's a hook as it loads, so
 * this installs a minimal one before the app's code runs and resolves on the first commit to the app's root. Under
 * Next.js that holds too: every client entry of Next 16 runs `instrumentation-client` before the module that loads
 * `react-dom/client`. A hook that's already there, as React Fast Refresh's or DevTools', is wrapped instead.
 */

/** A root as React passes it to the hook: what it renders into is its container. */
interface FiberRoot {
  containerInfo?: unknown
}

/** What a renderer gives the hook as it loads, which this hook keeps without reading. */
interface RendererInternals {
  rendererPackageName?: string
  version?: string
}

/** What React reads of the hook. */
interface DevtoolsHook {
  supportsFiber?: boolean
  renderers?: Map<number, RendererInternals>
  inject?(internals: RendererInternals): number
  onCommitFiberRoot?(renderer: number, root: FiberRoot, ...rest: unknown[]): void
  onCommitFiberUnmount?(): void
  onPostCommitFiberRoot?(): void
}

declare global {
  /** Where React looks for DevTools' hook as it loads. */
  var __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown
}

let installed = false
const { promise: committed, resolve: commit } = Promise.withResolvers<void>()

/**
 * Whether React rendered into the app's own root: the document, as Next's App Router hydrates, or an element in the
 * page's own tree, as `#__next` under the Pages Router and `#root` elsewhere. Under Next it's only those two, and never
 * a root inside a shadow root, as Next's development overlay renders its own React into one.
 */
export function isAppRoot(container: FiberRoot["containerInfo"], document: Document = globalThis.document): boolean {
  if (container === document) {
    return true
  }

  if (!(container instanceof Element) || container.getRootNode() !== document || container.closest("nextjs-portal")) {
    return false
  }

  const next = "__NEXT_DATA__" in globalThis || "__next_f" in globalThis || "next" in globalThis

  return !next || container.id === "__next"
}

/** The hook already on the page, as React Fast Refresh installs one. */
function existingHook(): DevtoolsHook | undefined {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__

  return hook instanceof Object ? hook : undefined
}

export const reactHydration: PageHydration = {
  install() {
    if (installed) {
      return
    }

    installed = true

    const seen = (root: FiberRoot) => {
      if (isAppRoot(root.containerInfo)) {
        commit()
      }
    }

    const existing = existingHook()

    if (existing) {
      const before = existing.onCommitFiberRoot?.bind(existing)
      existing.onCommitFiberRoot = (renderer, root, ...rest) => {
        seen(root)
        before?.(renderer, root, ...rest)
      }

      return
    }

    const renderers = new Map<number, RendererInternals>()

    const hook: DevtoolsHook = {
      supportsFiber: true,
      renderers,
      inject(internals) {
        const id = renderers.size + 1
        renderers.set(id, internals)

        return id
      },
      onCommitFiberRoot: (_renderer, root) => seen(root),
      // React calls these on each commit too; this hook needs only the commit itself.
      onCommitFiberUnmount: () => undefined,
      onPostCommitFiberRoot: () => undefined
    }

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook
  },
  hydrated(signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)

        return
      }

      void committed.then(resolve)
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    })
  }
}
