import { type LayerFailure, renderProblem } from "@parity-app/core"

/** What a failing layer shows: why it fails in a few words, and what to do about it, when that's known. */
export interface FailureAdvice {
  /** Why it fails, in a sentence: the kind of problem, as `renderProblem` sorts errors. */
  reason: string
  /** What to change so it draws, naming the provider or parent it needs when the error says. */
  fix?: string
}

/** Providers whose errors don't say their name, by what the error says. */
const knownProviders: { pattern: RegExp; provider: string }[] = [
  { pattern: /No QueryClient set/i, provider: "QueryClientProvider" },
  { pattern: /in the context of a <Router>|useHref\(\)|useNavigate\(\)|useLocation\(\)/i, provider: "MemoryRouter" },
  { pattern: /react-redux context/i, provider: "Provider (react-redux)" },
  { pattern: /No intl context|\[React Intl\]/i, provider: "IntlProvider" },
  { pattern: /ApolloClient instance/i, provider: "ApolloProvider" }
]

/**
 * What a component's error asks to be wrapped in, from what it says: a provider named in it (`ThemeProvider`, a
 * router, a query client), or a parent component it must be inside, quoted as `<Tabs>` or `` `Tabs` ``. Errors name the
 * component first and the parent last, as in "`TabsList` must be used within `Tabs`". Undefined when it doesn't say.
 */
export function neededWrapper(error: string): { provider: string } | { parent: string } | undefined {
  const known = knownProviders.find(({ pattern }) => pattern.test(error))
  if (known) return { provider: known.provider }
  const provider = /\b([A-Z]\w*Provider)\b/.exec(error)?.[1]
  if (provider) return { provider }
  const parent = [...error.matchAll(/[<`]([A-Z][\w.]*)\s*\/?[>`]/g)].at(-1)?.[1]
  return parent ? { parent } : undefined
}

/** The decorator files a project keeps, as the fix names them. */
const previewFiles = ".parity/preview.tsx or .storybook/preview.tsx"

/** Why a layer's component failed to draw and how to fix it, from the error it threw. */
export function failureAdvice(error: string): FailureAdvice {
  switch (renderProblem(error)) {
    case "provider": {
      const wrapper = neededWrapper(error)
      if (wrapper && "parent" in wrapper) {
        return { reason: "It needs a parent.", fix: `Place it inside a ${wrapper.parent} layer.` }
      }
      return {
        reason: "It needs a provider.",
        fix: `Add a decorator to ${previewFiles} that wraps designs in ${wrapper?.provider ?? "the provider it needs"}.`
      }
    }
    case "server":
      return {
        reason: "It imports code that only runs on a server.",
        fix: "Move the server code out of its imports, or pass the data it fetches as props."
      }
    case "async":
      return {
        reason: "It's an async server component.",
        fix: "Place the client component it renders instead, and pass it the data as props."
      }
    case "error":
      return { reason: "It throws an error while drawing." }
  }
}

/**
 * A design's failing layers across its frames, one per node, in the order first met: the same node failing in two
 * modes or states is one layer. `frames` holds each frame's latest failures, as `MountOptions.onFailures` gives them.
 */
export function designFailures(frames: Iterable<readonly LayerFailure[]>): LayerFailure[] {
  const byNode = new Map<string, LayerFailure>()
  for (const failures of frames) {
    for (const failure of failures) if (!byNode.has(failure.nodeId)) byNode.set(failure.nodeId, failure)
  }
  return [...byNode.values()]
}

/**
 * The failure a design's layer shows: its own, or, for a component design's instance, the first failure inside it,
 * since the render tree names those nodes by the instance's path (`card/title`).
 */
export function layerFailure(failures: readonly LayerFailure[], nodeId: string): LayerFailure | undefined {
  return (
    failures.find((failure) => failure.nodeId === nodeId) ??
    failures.find((failure) => failure.nodeId.startsWith(`${nodeId}/`))
  )
}
