import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vite-plus/test"
import { auditResult, canvasHeightResult, PageError, pageAnswer, pageCall, renderResult } from "./render-results.ts"

const frame = {
  width: 390,
  height: 120,
  nodes: [
    { id: "root", x: 0, y: 0, width: 390, height: 120 },
    { id: "pay", parent: "root", x: 16, y: 40, width: 80, height: 36, source: "src/components/ui/button.tsx:44:5" }
  ],
  overflowsX: false,
  unknownComponents: []
}

describe("the render page's answers", () => {
  it("pass on as the page gave them", () => {
    expect(renderResult(frame)).toEqual(frame)
    expect(auditResult({ issues: [] })).toEqual({ issues: [] })
    expect(canvasHeightResult(undefined)).toBeUndefined()
  })

  it("are refused when project code changed what they hold", () => {
    expect(() => renderResult({ ...frame, nodes: [{ id: "root" }] })).toThrow("/nodes/0/x: expected a number")
    expect(() => auditResult({ issues: [{ rule: "color-contrast", impact: "fatal" }] })).toThrow("/issues/0/impact")
    expect(() => canvasHeightResult("tall")).toThrow("/: expected a number")
  })
})

describe("calls into the render page", () => {
  /** Runs `pageCall`'s script as the page would, with `page` as its window, and reads the answer as main does. */
  async function callPage(call: string, page: Record<string, () => number | undefined | Promise<void>>) {
    return pageAnswer(await runInNewContext(pageCall(call), { window: page, Error }))
  }

  it("answer with what the page gave, waiting for it when it's a promise", async () => {
    expect(await callPage("window.canvasHeight()", { canvasHeight: () => 120 })).toBe(120)
    expect(await callPage("window.canvasHeight()", { canvasHeight: () => undefined })).toBeUndefined()
    expect(await callPage("window.canvasSettle()", { canvasSettle: () => Promise.resolve() })).toBeUndefined()
  })

  it("throw what the page threw, with its message and stack", async () => {
    const broken = new TypeError("Cannot read properties of undefined (reading 'height')")

    const thrown = await callPage("window.canvasHeight()", {
      canvasHeight: () => {
        throw broken
      }
    }).catch((cause: unknown) => cause)

    expect(thrown).toBeInstanceOf(PageError)
    expect(thrown).toMatchObject({
      message: broken.message,
      stack: broken.stack,
      failure: { error: broken.message, errorStack: broken.stack }
    })
  })

  it("throw a rejection that isn't an error as its text", async () => {
    await expect(callPage("window.canvasAudit()", { canvasAudit: () => Promise.reject("no axe") })).rejects.toThrow(
      new PageError({ error: "no axe" })
    )
  })

  it("are refused when project code answered in another shape", () => {
    expect(() => pageAnswer("tall")).toThrow(TypeError)
  })
})
