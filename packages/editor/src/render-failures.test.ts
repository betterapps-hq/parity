import type { LayerFailure } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { designFailures, failureAdvice, layerFailure, neededWrapper } from "./render-failures.ts"

describe("failureAdvice", () => {
  it("names the provider a decorator should add, from the error or from what it's known to say", () => {
    expect(failureAdvice("useTheme must be used within a ThemeProvider")).toEqual({
      reason: "It needs a provider.",
      fix: "Add a decorator to .parity/preview.tsx or .storybook/preview.tsx that wraps designs in ThemeProvider."
    })
    expect(failureAdvice("No QueryClient set, use QueryClientProvider to set one").fix).toContain(
      "wraps designs in QueryClientProvider."
    )
    expect(failureAdvice("useNavigate() may be used only in the context of a <Router> component.").fix).toContain(
      "wraps designs in MemoryRouter."
    )
  })

  it("asks for the provider it needs when the error doesn't name one", () => {
    expect(failureAdvice("Toast context value is undefined").fix).toBe(
      "Add a decorator to .parity/preview.tsx or .storybook/preview.tsx that wraps designs in the provider it needs."
    )
  })

  it("asks for a parent layer, not a decorator, when a part must sit inside another", () => {
    expect(failureAdvice("`TabsTrigger` must be used within <Tabs>")).toEqual({
      reason: "It needs a parent.",
      fix: "Place it inside a Tabs layer."
    })
  })

  it("explains server and async components, and gives a plain error no fix", () => {
    expect(failureAdvice("process is not defined").reason).toBe("It imports code that only runs on a server.")
    expect(failureAdvice("async/await is not yet supported in Client Components").reason).toBe(
      "It's an async server component."
    )
    expect(failureAdvice("Cannot read properties of undefined (reading 'map')")).toEqual({
      reason: "It throws an error while drawing."
    })
  })
})

describe("neededWrapper", () => {
  it("prefers a known provider over a parent the same error names", () => {
    expect(neededWrapper("useHref() may be used only in the context of a <Router> component.")).toEqual({
      provider: "MemoryRouter"
    })
    expect(neededWrapper("`TabsList` must be used within `Tabs`")).toEqual({ parent: "Tabs" })
    expect(neededWrapper("Something went wrong")).toBeUndefined()
  })
})

const failure = (nodeId: string, error = "boom"): LayerFailure => ({ nodeId, component: "Card", error })

describe("designFailures", () => {
  it("lists each failing node once across frames, in the order first met", () => {
    expect(designFailures([[failure("a", "first")], [failure("b"), failure("a", "second")], []])).toEqual([
      failure("a", "first"),
      failure("b")
    ])
    expect(designFailures([])).toEqual([])
  })
})

describe("layerFailure", () => {
  it("finds a layer's own failure, else the first inside an instance it is", () => {
    const failures = [failure("card/title"), failure("button")]
    expect(layerFailure(failures, "button")).toBe(failures[1])
    expect(layerFailure(failures, "card")).toBe(failures[0])
    expect(layerFailure(failures, "car")).toBeUndefined()
  })
})
