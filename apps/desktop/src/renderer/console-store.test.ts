import { describe, expect, it } from "vite-plus/test"
import type { LoggedEntry } from "../shared/protocol.ts"
import { consoleLog, consoleMessages, projectPlace, routeConsoleChange, tally } from "./console-store.ts"

const guestUrl = "http://127.0.0.1:5173/@id/virtual:parity/guest"
const guest = "http://127.0.0.1:5173"
const react = `${guest}/node_modules/.vite/deps/react-dom_client.js?v=4f2a`

function entry(fields: Partial<LoggedEntry> = {}): LoggedEntry {
  return {
    id: 1,
    level: "error",
    text: "Cannot read properties of undefined (reading 'price')",
    source: `${guest}/src/components/plan-price.tsx?t=1730`,
    line: 12,
    where: "canvas",
    count: 1,
    first: 1000,
    last: 1000,
    ...fields
  }
}

describe("the console's messages", () => {
  it("are one for a message written in several frames of a design, with each frame and every time it came", () => {
    const pricing = { design: "app.par#pricing", state: "default" }
    const [message, ...rest] = consoleMessages(
      [
        entry({ ...pricing, mode: "desktop", count: 2 }),
        entry({ ...pricing, id: 2, mode: "mobile", first: 500, last: 3000 }),
        entry({ ...pricing, id: 3, mode: "mobile" })
      ],
      guestUrl
    )
    expect(rest).toEqual([])
    expect(message).toMatchObject({
      id: "1",
      design: "app.par#pricing",
      frames: [
        { state: "default", mode: "desktop" },
        { state: "default", mode: "mobile" }
      ],
      count: 4,
      first: 500,
      last: 3000
    })
  })

  it("say where the project wrote them, from the stack when a library wrote the message, with the stack apart", () => {
    const [message] = consoleMessages(
      [
        entry({
          source: react,
          line: 2120,
          text: [
            'Each child in a list should have a unique "key" prop.',
            "",
            "Check the render method of `PlanList`.",
            `    at PlanList (${guest}/src/components/plan-list.tsx?t=1730:10:5)`,
            `    at renderWithHooks (${react}:15486:18)`,
            `    at ${guest}/src/main.tsx:4:1`
          ].join("\n")
        })
      ],
      guestUrl
    )
    expect(message?.text).toBe(
      'Each child in a list should have a unique "key" prop.\n\nCheck the render method of `PlanList`.'
    )
    expect(message?.at).toEqual({ path: "src/components/plan-list.tsx", line: 10, column: 5 })
    expect(message?.stack).toEqual([
      "at PlanList (src/components/plan-list.tsx:10:5)",
      "at renderWithHooks (react-dom_client.js:15486:18)",
      "at src/main.tsx:4:1"
    ])
  })

  it("count errors and warnings by the message, of one design or all", () => {
    const messages = consoleMessages(
      [
        entry({ design: "app.par#pricing" }),
        entry({ id: 2, level: "warning", text: "Received NaN", design: "app.par#pricing" }),
        entry({ id: 3, text: "Failed to fetch dynamically imported module" })
      ],
      guestUrl
    )
    expect(tally(messages)).toEqual({ errors: 2, warnings: 1, info: 0 })
    expect(tally(messages, "app.par#pricing")).toEqual({ errors: 1, warnings: 1, info: 0 })
  })
})

describe("where in the project an address is", () => {
  it("is its path from the root, without Vite's query, for the project's own files on its builder", () => {
    expect(projectPlace(`${guest}/src/App.tsx?t=1`, 3, 0, guestUrl)).toEqual({
      path: "src/App.tsx",
      line: 3,
      column: 1
    })
  })

  it("is nowhere for a library's module, one Vite made, or another server's", () => {
    expect(projectPlace(react, 3, 1, guestUrl)).toBeUndefined()
    expect(projectPlace(`${guest}/@vite/client`, 3, 1, guestUrl)).toBeUndefined()
    expect(projectPlace("http://127.0.0.1:5174/src/App.tsx", 3, 1, guestUrl)).toBeUndefined()
    expect(projectPlace("not a url", 3, 1, guestUrl)).toBeUndefined()
  })
})

describe("routing the main process's changes", () => {
  it("gives each project its own builder's messages, and clears one when its builder's are cleared", () => {
    const projects = [
      { id: "D:/shop", info: { guestUrl } },
      { id: "D:/admin", info: { guestUrl: "http://127.0.0.1:5174/@id/virtual:parity/guest" } }
    ]
    consoleLog("D:/shop").clear()
    consoleLog("D:/admin").clear()
    routeConsoleChange(
      { entries: [entry(), entry({ id: 2, source: "http://127.0.0.1:5174/src/admin.tsx" })] },
      projects
    )
    expect(
      consoleLog("D:/shop")
        .get()
        .map((message) => message.id)
    ).toEqual(["1"])
    expect(
      consoleLog("D:/admin")
        .get()
        .map((message) => message.id)
    ).toEqual(["2"])
    // A count going up comes again under the same id.
    routeConsoleChange({ entries: [entry({ count: 5 })] }, projects)
    expect(consoleLog("D:/shop").get()[0]?.count).toBe(5)
    routeConsoleChange({ cleared: guest }, projects)
    expect(consoleLog("D:/shop").get()).toEqual([])
    expect(consoleLog("D:/admin").get()).toHaveLength(1)
  })
})
