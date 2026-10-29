/** How a component fared on the canvas: drawn without errors, or failing in at least one frame, with what it threw. */
export type ComponentRenderStatus = { drawn: true } | { error: string }

/** Why a component that detection found doesn't draw, as `proposals/component-detection.md` lists the usual causes. */
export type RenderProblem = "provider" | "server" | "async" | "error"

const problems: { kind: Exclude<RenderProblem, "error">; pattern: RegExp }[] = [
  {
    kind: "async",
    pattern:
      /async\/await is not yet supported in Client Components|async Client Component|found: \[object Promise\]|A component was suspended by an uncached promise/i
  },
  {
    kind: "server",
    pattern:
      /server-only|cannot be imported from a Client Component|Server Functions?|createServerFn|\bprocess is not defined|\bBuffer is not defined|\b(fs|path|crypto|child_process) is not defined|externalized for browser compatibility/i
  },
  {
    kind: "provider",
    pattern:
      /must be (used|rendered|wrapped) (within|inside|in)|outside (of )?(a|an|the) \S*Provider|No QueryClient set|may be used only in the context of a <Router>|could not find react-redux context|context value is (undefined|null)|without a parent <\w+>|Provider\b.*\b(missing|required)/i
  }
]

/**
 * Why a component failed to draw, from the error it threw: it needs a provider, such as a router or query client; it
 * imports code that only runs on a server; it's an async server component; or something else.
 */
export function renderProblem(error: string): RenderProblem {
  return problems.find((problem) => problem.pattern.test(error))?.kind ?? "error"
}

/** A component's status in words, as the Components panel shows it. */
export function describeRenderStatus(status: ComponentRenderStatus): string {
  if ("drawn" in status) return "Draws on the canvas"
  switch (renderProblem(status.error)) {
    case "provider":
      return `Needs a provider, which a decorator can add: ${status.error}`
    case "server":
      return `Imports code that only runs on a server: ${status.error}`
    case "async":
      return `An async server component, which only renders on a server: ${status.error}`
    case "error":
      return `Fails to draw: ${status.error}`
  }
}
