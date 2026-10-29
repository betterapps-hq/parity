import { describe, expect, it } from "vitest"
import { describeRenderStatus, renderProblem } from "./render-status.ts"

describe("renderProblem", () => {
  it("tells a missing provider from server code and async server components", () => {
    expect(renderProblem("useNavigate() may be used only in the context of a <Router> component.")).toBe("provider")
    expect(renderProblem("No QueryClient set, use QueryClientProvider to set one")).toBe("provider")
    expect(renderProblem("useSidebar must be used within a SidebarProvider.")).toBe("provider")
    expect(renderProblem("process is not defined")).toBe("server")
    expect(renderProblem('Module "fs" has been externalized for browser compatibility.')).toBe("server")
    expect(renderProblem("Failed to fetch dynamically imported module: http://localhost/src/db.ts")).toBe("error")
    expect(renderProblem("async/await is not yet supported in Client Components, only Server Components.")).toBe(
      "async"
    )
    expect(renderProblem("Cannot read properties of undefined (reading 'map')")).toBe("error")
  })

  it("says what's wrong in words", () => {
    expect(describeRenderStatus({ drawn: true })).toBe("Draws on the canvas")
    expect(describeRenderStatus({ error: "useSidebar must be used within a SidebarProvider." })).toMatch(
      /^Needs a provider, which a decorator can add/
    )
  })
})
