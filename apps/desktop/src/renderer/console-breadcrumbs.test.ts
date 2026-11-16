import { describe, expect, it } from "vite-plus/test"
import { loggedByProject } from "./console-breadcrumbs.ts"

const parity = "parity://app"

describe("loggedByProject", () => {
  it("finds the project's code in a console call's stack, loaded from its builder (PAR-814)", () => {
    const stack = [
      "Error: console",
      "    at beforeBreadcrumb (parity://app/assets/index.js:1:100)",
      "    at console.log (parity://app/assets/index.js:1:200)",
      "    at Button (http://localhost:5173/src/components/button.tsx:12:11)"
    ].join("\n")

    expect(loggedByProject(stack, parity)).toBe(true)
  })

  it("leaves Parity's own console calls, in an installed build and in development", () => {
    expect(loggedByProject("Error: console\n    at save (parity://app/assets/index.js:4:2)", parity)).toBe(false)
    const dev = "Error: console\n    at save (http://localhost:5373/src/renderer/workspace.ts:40:3)"
    expect(loggedByProject(dev, "http://localhost:5373")).toBe(false)
    expect(loggedByProject(dev.replace("5373", "5174"), "http://localhost:5373")).toBe(true)
  })
})
